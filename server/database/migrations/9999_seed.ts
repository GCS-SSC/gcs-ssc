import { hashPassword } from 'better-auth/crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import PizZip from 'pizzip'
import { setEncryptedExtensionSecret } from '@gcs-ssc/extensions/server'
import { sql, type Kysely, type RawBuilder, type Transaction } from 'kysely'
import { z } from 'zod'
import type { H3Event } from 'h3'
import { writeStoredTemplateFile } from '../../utils/file-storage'
import { publishApprovalTemplate } from '../../utils/approval-template-versioning'
import { decideCanonicalApproval, materializeCanonicalApprovalRuntime } from '../../utils/canonical-approval-runtime'
import {
  buildRecommendationPlanPublication,
  buildRecommendationSchemaDefinition,
  readPublishedRecommendationPlan,
  readPublishedRecommendationSchema
} from '../../utils/recommendation-setup-versioning'
import { buildReviewSchemaDefinition } from '../../utils/review-schema-versioning'
import { buildReviewSetupPublication, readPublishedReviewSetup } from '../../utils/review-setup-versioning'
import { createRuntimeReviewSetInTransaction } from '../../utils/review-runtime'
import { resolveReviewRuntimeEntityFromEntity } from '../../utils/review-runtime-access'
import { advanceWorkflowItem, startWorkflow } from '../../utils/workflow-runtime'
import { publishDefinition, readCurrentPublishedDefinition } from '../../utils/system-publication'
import { createRuntime, transitionRuntime, transitionRuntimeItem } from '../../utils/system-runtime'
import { buildWorkflowSetupPublication } from '../../utils/workflow-setup-versioning'
import assessmentDefinitionSeedJson from './assessment.json' with { type: 'json' }
import advanceAssessmentDefinitionSeedJson from './advance.json' with { type: 'json' }
import type { Database, Entity_Type, JsonValue, TransferPaymentDocumentTemplateOutputFormat } from '../../../shared/types/database'
import type { RoleAbilitySubject } from '../../../shared/utils/abilities'
import type { RoleAccessLevel } from '../../../shared/types/schemas/rbac'
import { ChecklistDefinitionSchema } from '../../../shared/types/schemas/checklist/checklist'
import { ASSIGNABLE_ENTITY_TYPE_ENUM } from '../../../shared/constants/enums'
import type { RecommendationDefinition } from '../../../shared/types/schemas/recommendation/recommendation'

const seedMoney = (value: string): RawBuilder<number> => sql<number>`CAST(${value} AS numeric(19, 2))`

interface AgencyRecord {
  id: string
  nameEn: string
  nameFr: string
}

const DEMO_STATUS_DEFINITIONS = [
  { key: 'draft', nameEn: 'Draft', nameFr: 'Brouillon', color: '#64748b', icon: 'i-lucide-file-pen-line', readOnly: false, terminal: false },
  { key: 'inProgress', nameEn: 'In Progress', nameFr: 'En cours', color: '#2563eb', icon: 'i-lucide-loader-circle', readOnly: false, terminal: false },
  { key: 'active', nameEn: 'Active', nameFr: 'Actif', color: '#16a34a', icon: 'i-lucide-circle-check', readOnly: false, terminal: false },
  { key: 'expired', nameEn: 'Expired', nameFr: 'Expiré', color: '#d97706', icon: 'i-lucide-calendar-x', readOnly: false, terminal: false },
  { key: 'submitted', nameEn: 'Submitted', nameFr: 'Soumis', color: '#2563eb', icon: 'i-lucide-send', readOnly: true, terminal: false },
  { key: 'reviewed', nameEn: 'Reviewed', nameFr: 'Examiné', color: '#0891b2', icon: 'i-lucide-clipboard-check', readOnly: true, terminal: false },
  { key: 'pendingApproval', nameEn: 'Pending Approval', nameFr: 'En attente d’approbation', color: '#d97706', icon: 'i-lucide-clock-3', readOnly: true, terminal: false },
  { key: 'approved', nameEn: 'Approved', nameFr: 'Approuvé', color: '#16a34a', icon: 'i-lucide-badge-check', readOnly: true, terminal: false },
  { key: 'denied', nameEn: 'Denied', nameFr: 'Refusé', color: '#dc2626', icon: 'i-lucide-circle-x', readOnly: true, terminal: false },
  { key: 'withdrawn', nameEn: 'Withdrawn', nameFr: 'Retiré', color: '#71717a', icon: 'i-lucide-undo-2', readOnly: true, terminal: false },
  { key: 'inReview', nameEn: 'In Review', nameFr: 'En examen', color: '#7c3aed', icon: 'i-lucide-search-check', readOnly: true, terminal: false },
  { key: 'cancelled', nameEn: 'Cancelled', nameFr: 'Annulé', color: '#dc2626', icon: 'i-lucide-ban', readOnly: true, terminal: false },
  { key: 'inactive', nameEn: 'Inactive', nameFr: 'Inactif', color: '#71717a', icon: 'i-lucide-circle-pause', readOnly: true, terminal: false },
  { key: 'complete', nameEn: 'Complete', nameFr: 'Terminé', color: '#16a34a', icon: 'i-lucide-circle-check-big', readOnly: true, terminal: false },
  { key: 'pay', nameEn: 'Pay', nameFr: 'Payer', color: '#2563eb', icon: 'i-lucide-banknote-arrow-up', readOnly: true, terminal: false },
  { key: 'wait', nameEn: 'Wait', nameFr: 'Attendre', color: '#d97706', icon: 'i-lucide-hourglass', readOnly: true, terminal: false },
  { key: 'processed', nameEn: 'Processed', nameFr: 'Traité', color: '#0d9488', icon: 'i-lucide-file-check-2', readOnly: true, terminal: false },
  { key: 'paid', nameEn: 'Paid', nameFr: 'Payé', color: '#15803d', icon: 'i-lucide-receipt-text', readOnly: false, terminal: true },
  { key: 'closed', nameEn: 'Closed', nameFr: 'Fermé', color: '#334155', icon: 'i-lucide-lock-keyhole', readOnly: false, terminal: true }
] as const

type DemoStatusKey = typeof DEMO_STATUS_DEFINITIONS[number]['key']
type AgencyStatusIds = Record<DemoStatusKey, string>

const resolveAgencyStatusIds = async (
  db: Kysely<Database>,
  agencyId: string
): Promise<AgencyStatusIds> => {
  const rows = await db.selectFrom('Common_Status')
    .select(['id', 'egcs_cn_name_en'])
    .where('egcs_cn_agency', '=', agencyId)
    .where('_deleted', '=', false)
    .orderBy('id', 'asc')
    .forUpdate()
    .execute()
  const idByName = new Map(rows.map(row => [row.egcs_cn_name_en, String(row.id)]))
  const entries = DEMO_STATUS_DEFINITIONS.map(definition => {
    const id = idByName.get(definition.nameEn)
    if (!id) throw new Error(`Missing seeded ${definition.nameEn} status for Agency ${agencyId}`)
    return [definition.key, id] as const
  })
  return Object.fromEntries(entries) as AgencyStatusIds
}

const seedAgencyStatuses = async (db: Kysely<Database>, agencyId: string): Promise<AgencyStatusIds> => {
  const defaultKeys = new Set<DemoStatusKey>(['draft', 'active', 'inactive'])
  await db.insertInto('Common_Status').values(
    DEMO_STATUS_DEFINITIONS
      .filter(definition => !defaultKeys.has(definition.key))
      .map(definition => ({
        egcs_cn_agency: agencyId,
        egcs_cn_name_en: definition.nameEn,
        egcs_cn_name_fr: definition.nameFr,
        egcs_cn_color: definition.color,
        egcs_cn_icon: definition.icon,
        egcs_cn_readonly: definition.readOnly,
        egcs_cn_terminal: definition.terminal,
        _deleted: false
      }))
  ).execute()
  return await resolveAgencyStatusIds(db, agencyId)
}

const insertWorkflowAllowedStartStatuses = async (
  db: Kysely<Database>,
  workflowSetupId: string,
  statusIds: readonly string[]
): Promise<void> => {
  await db.insertInto('Common_Workflow_Setup_Allowed_Start_Status').values(statusIds.map((statusId, index) => ({
    egcs_cn_workflowsetup: workflowSetupId,
    egcs_cn_status: statusId,
    egcs_cn_order: index + 1,
    _deleted: false
  }))).execute()
}

const publishSeedWorkflowDependencies = async (db: Kysely<Database>): Promise<void> => {
  const trx = db as Transaction<Database>
  const actor = await db.selectFrom('Common_User').select('id')
    .where('egcs_cn_email', '=', 'root@example.com').where('_deleted', '=', false).executeTakeFirstOrThrow()
  const actorId = String(actor.id)

  for (const template of await db.selectFrom('Common_Approval_Template')
    .innerJoin('Common_Publication', 'Common_Publication.id', 'Common_Approval_Template.id')
    .selectAll('Common_Approval_Template').where('Common_Publication.egcs_cn_state', '=', 'draft')
    .where('Common_Approval_Template._deleted', '=', false).execute()) {
    await publishApprovalTemplate(trx, template, actorId)
  }

  for (const schema of await db.selectFrom('Common_Review_Schema')
    .innerJoin('Common_Publication', 'Common_Publication.id', 'Common_Review_Schema.id')
    .selectAll('Common_Review_Schema').where('Common_Publication.egcs_cn_state', '=', 'draft')
    .where('Common_Review_Schema._deleted', '=', false).execute()) {
    const checklist = schema.egcs_cn_reviewtype === 'checklist'
      ? await db.selectFrom('Common_Checklist_Schema').select('egcs_cn_checklistschema')
          .where('egcs_cn_reviewschema', '=', String(schema.id)).where('_deleted', '=', false).executeTakeFirst()
      : null
    await publishDefinition(trx, {
      publicationId: String(schema.id),
      kind: 'review_schema',
      definition: buildReviewSchemaDefinition(schema, checklist?.egcs_cn_checklistschema ?? null) as unknown as JsonValue,
      actorId
    })
  }

  for (const schema of await db.selectFrom('Common_Recommendation_Schema')
    .innerJoin('Common_Publication', 'Common_Publication.id', 'Common_Recommendation_Schema.id')
    .selectAll('Common_Recommendation_Schema').where('Common_Publication.egcs_cn_state', '=', 'draft')
    .where('Common_Recommendation_Schema._deleted', '=', false).execute()) {
    await publishDefinition(trx, {
      publicationId: String(schema.id),
      kind: 'recommendation_schema',
      definition: buildRecommendationSchemaDefinition(schema),
      actorId
    })
  }

  for (const setup of await db.selectFrom('Common_Review_Set_Setup')
    .innerJoin('Common_Publication', 'Common_Publication.id', 'Common_Review_Set_Setup.id')
    .selectAll('Common_Review_Set_Setup').where('Common_Publication.egcs_cn_state', '=', 'draft')
    .where('Common_Review_Set_Setup._deleted', '=', false).execute()) {
    const plan = await buildReviewSetupPublication(db, setup)
    await publishDefinition(trx, {
      publicationId: String(setup.id), kind: 'review_set_setup', definition: plan.definition as unknown as JsonValue,
      references: plan.references, actorId
    })
  }

  for (const setup of await db.selectFrom('Common_Recommendation_Set_Setup')
    .innerJoin('Common_Publication', 'Common_Publication.id', 'Common_Recommendation_Set_Setup.id')
    .selectAll('Common_Recommendation_Set_Setup').where('Common_Publication.egcs_cn_state', '=', 'draft')
    .where('Common_Recommendation_Set_Setup._deleted', '=', false).execute()) {
    const plan = await buildRecommendationPlanPublication(db, setup)
    await publishDefinition(trx, {
      publicationId: String(setup.id), kind: 'recommendation_set_setup', definition: plan.definition as unknown as JsonValue,
      references: plan.references, actorId
    })
  }
}

const materializeSeedApprovalRuntime = async (
  db: Kysely<Database>,
  input: {
    entityType: Entity_Type
    entityId: string
    nameEn: string
    nameFr: string
    approvalTemplateId: string
    finalState?: 'approved'
    approvalDate?: Date
  }
) => {
  const trx = db as Transaction<Database>
  const actor = await trx.selectFrom('Common_User').select('id')
    .where('egcs_cn_email', '=', 'root@example.com').where('_deleted', '=', false).executeTakeFirstOrThrow()
  const actorId = String(actor.id)
  const { finalState, approvalDate, ...materializationInput } = input
  const workflow = await trx.selectFrom('Common_Workflow_Setup')
    .innerJoin('Common_Publication', 'Common_Publication.id', 'Common_Workflow_Setup.id')
    .innerJoin('Common_Publication_Version', 'Common_Publication_Version.id', 'Common_Publication.egcs_cn_currentversion')
    .innerJoin(
      'Common_Publication_Version_Reference',
      'Common_Publication_Version_Reference.egcs_cn_parentversion',
      'Common_Publication_Version.id'
    )
    .select([
      'Common_Workflow_Setup.id',
      'Common_Publication_Version.id as publicationVersionId',
      'Common_Publication_Version.egcs_cn_version as publicationVersion',
      'Common_Publication_Version_Reference.egcs_cn_publicationversion as approvalPublicationVersionId',
      'Common_Publication_Version_Reference.egcs_cn_order as runtimeItemOrder'
    ])
    .where('Common_Workflow_Setup.egcs_cn_entitytype', '=', input.entityType)
    .where('Common_Workflow_Setup.egcs_cn_purpose', '=', 'approval_submission')
    .where('Common_Publication.egcs_cn_state', '=', 'published')
    .where('Common_Publication_Version_Reference.egcs_cn_publication', '=', input.approvalTemplateId)
    .where('Common_Publication_Version_Reference.egcs_cn_kind', '=', 'approval_template')
    .where('Common_Publication_Version_Reference.egcs_cn_path', '=', 'members.approval_template')
    .where('Common_Workflow_Setup._deleted', '=', false)
    .executeTakeFirstOrThrow()
  const runtime = await createRuntime(trx, {
    kind: 'workflow',
    purpose: 'approval_submission',
    entityType: input.entityType,
    entityId: input.entityId,
    sourcePublicationId: String(workflow.id),
    sourcePublicationKind: 'workflow_setup',
    sourcePublicationVersionId: String(workflow.publicationVersionId),
    sourceVersion: workflow.publicationVersion,
    initiatedBy: actorId
  })
  let completion = await trx.selectFrom('Common_Completion')
    .select(['id', 'egcs_cn_disposition'])
    .where('egcs_cn_entitytype', '=', input.entityType)
    .where('egcs_cn_entityid', '=', input.entityId)
    .executeTakeFirst()
  if (!completion) {
    completion = await trx.insertInto('Common_Completion').values({
      egcs_cn_entitytype: input.entityType,
      egcs_cn_entityid: input.entityId,
      egcs_cn_comments: 'Seeded completion-owned approval workflow.',
      egcs_cn_user: actorId,
      egcs_cn_disposition: 'workflow_started',
      _deleted: false
    }).returning(['id', 'egcs_cn_disposition']).executeTakeFirstOrThrow()
  }
  if (completion.egcs_cn_disposition !== 'workflow_started') {
    throw new Error('Seeded approval Workflow requires workflow_started Completion evidence')
  }
  await trx.insertInto('Common_Workflow_Run').values({
    id: runtime.runtimeId,
    egcs_cn_completion: String(completion.id)
  }).execute()
  await transitionRuntime(trx, {
    runtimeId: runtime.runtimeId,
    from: 'pending',
    to: 'active',
    actorId,
    reason: 'seed_workflow_started'
  })
  const materialized = await materializeCanonicalApprovalRuntime(trx, {
    ...materializationInput,
    actorId,
    approvalTemplateVersionId: String(workflow.approvalPublicationVersionId),
    existingRuntimeId: runtime.runtimeId,
    runtimeItemOrder: Number(workflow.runtimeItemOrder)
  })
  if (finalState !== 'approved') return materialized

  let decisionActorId = actorId
  for (const approval of materialized.approvals) {
    const item = await trx.selectFrom('Common_Runtime_Item')
      .innerJoin('Common_Approval', 'Common_Approval.egcs_cn_runtimeitem', 'Common_Runtime_Item.id')
      .innerJoin('Common_User', 'Common_User.id', 'Common_Approval.egcs_cn_assigneduser')
      .select([
        'Common_Runtime_Item.egcs_cn_state as state',
        'Common_Approval.egcs_cn_assigneduser as assignedUserId',
        'Common_User.egcs_cn_position_title as positionTitle'
      ])
      .where('Common_Runtime_Item.id', '=', approval.runtimeItemId).executeTakeFirstOrThrow()
    const approvalActorId = String(item.assignedUserId)
    decisionActorId = approvalActorId
    if (item.state === 'pending') {
      await transitionRuntimeItem(trx, {
        runtimeId: materialized.runtimeId,
        runtimeItemId: approval.runtimeItemId,
        from: 'pending',
        to: 'awaiting_action',
        actorId: approvalActorId,
        reason: 'seed_approval_sequence'
      })
    }
    await sql`SELECT set_config('app.current_user_id', ${approvalActorId}, true)`.execute(trx)
    await trx.updateTable('Common_Approval_Certification').set({ egcs_cn_value: true })
      .where('egcs_cn_approval', '=', approval.approvalId)
      .where('egcs_cn_optional', '=', false)
      .execute()
    await trx.updateTable('Common_Approval').set({
      egcs_cn_approvalvalue: true,
      egcs_cn_approvaldate: approvalDate ?? new Date('2026-07-18T00:00:00Z'),
      egcs_cn_approvalpositiontitle: item.positionTitle
    }).where('id', '=', approval.approvalId).execute()
    await transitionRuntimeItem(trx, {
      runtimeId: materialized.runtimeId,
      runtimeItemId: approval.runtimeItemId,
      from: 'awaiting_action',
      to: 'approved',
      actorId: approvalActorId,
      reason: 'seed_approval_decision'
    })
  }
  await transitionRuntimeItem(trx, {
    runtimeId: materialized.runtimeId,
    runtimeItemId: materialized.runtimeItemId,
    from: 'awaiting_action',
    to: 'approved',
    actorId: decisionActorId,
    reason: 'seed_approval_aggregated'
  })
  await transitionRuntime(trx, {
    runtimeId: materialized.runtimeId,
    from: 'active',
    to: 'approved',
    actorId: decisionActorId,
    reason: 'seed_approval_aggregated'
  })
  return materialized
}

interface RoleSeed {
  key: string
  nameEn: string
  nameFr: string
  agencyId: string | null
  permissions: Array<{ subject: RoleAbilitySubject; access_level: RoleAccessLevel | null; can_manage_assignments: boolean }>
}

interface UserSeed {
  email: string
  name: string
}

const AssessmentDefinitionSeedSchema = z.object({
  helpers: z.record(z.string(), z.unknown()).optional(),
  sectionMatrix: z.array(z.unknown()),
  outcomes: z.array(z.unknown()),
  impactors: z.array(z.unknown()).optional(),
  sections: z.array(z.unknown()),
  scoringMatrix: z.array(z.object({
    max: z.number(),
    label: z.object({
      en: z.string(),
      fr: z.string()
    }),
    indicator: z.string()
  }))
})

const parseAssessmentDefinitionSeed = (definitionSeed: unknown) => {
  const { scoringMatrix, ...assessmentSchema } = AssessmentDefinitionSeedSchema.parse(definitionSeed)
  return {
    scoringMatrix,
    assessmentSchema: z.json().parse(assessmentSchema)
  }
}

const assessmentDefinitionSeed = parseAssessmentDefinitionSeed(assessmentDefinitionSeedJson)
const advanceAssessmentDefinitionSeed = parseAssessmentDefinitionSeed(advanceAssessmentDefinitionSeedJson)

const SEEDED_ASSESSMENT_COMMENT = 'Seeded assessment evidence and rationale recorded for completion readiness.'
const SEEDED_CHECKLIST_DEFINITION = ChecklistDefinitionSchema.parse({
  sections: [{
    key: 'eligibility',
    label: { en: 'Eligibility', fr: 'Admissibilité' },
    questions: [{
      key: 'requirements-met',
      question: { en: 'Are all mandatory requirements met?', fr: 'Toutes les exigences obligatoires sont-elles respectées?' },
      required: true,
      commentPolicy: 'required_on_fail'
    }]
  }],
  resultPolicy: { anyFailureFails: true, groups: [] }
})
const SEEDED_CLOSEOUT_CHECKLIST_DEFINITION = ChecklistDefinitionSchema.parse({
  sections: [
    {
      key: 'required-submissions',
      label: { en: 'Required submissions', fr: 'Présentations requises' },
      questions: [
        {
          key: 'final-performance-report',
          question: {
            en: 'Has the final performance report been received and accepted?',
            fr: 'Le rapport final sur le rendement a-t-il été reçu et accepté?'
          },
          required: true,
          commentPolicy: 'required_on_fail'
        },
        {
          key: 'final-financial-report',
          question: {
            en: 'Have the final claim and financial report been received and accepted?',
            fr: 'La demande finale et le rapport financier ont-ils été reçus et acceptés?'
          },
          required: true,
          commentPolicy: 'required_on_fail'
        }
      ]
    },
    {
      key: 'surviving-obligations',
      label: { en: 'Surviving obligations', fr: 'Obligations subsistantes' },
      questions: [
        {
          key: 'retention-and-access',
          question: {
            en: 'Are record-retention, audit, and access obligations identified and communicated?',
            fr: 'Les obligations de conservation des documents, de vérification et d’accès sont-elles identifiées et communiquées?'
          },
          required: true,
          commentPolicy: 'required_on_fail'
        },
        {
          key: 'other-surviving-terms',
          question: {
            en: 'Are all other surviving terms, including repayment, confidentiality, and intellectual-property obligations, recorded?',
            fr: 'Toutes les autres conditions subsistantes, notamment les obligations de remboursement, de confidentialité et de propriété intellectuelle, sont-elles consignées?'
          },
          required: true,
          commentPolicy: 'required_on_fail'
        }
      ]
    },
    {
      key: 'exceptions-and-follow-ups',
      label: { en: 'Exceptions and follow-ups', fr: 'Exceptions et suivis' },
      questions: [
        {
          key: 'monitor-follow-ups-closed',
          question: {
            en: 'Have all monitoring follow-up items been closed in the Monitor?',
            fr: 'Tous les éléments de suivi de la surveillance ont-ils été fermés dans le dossier de surveillance?'
          },
          required: true,
          commentPolicy: 'required_on_fail'
        },
        {
          key: 'exceptions-documented',
          question: {
            en: 'Are any approved exceptions and post-closeout actions documented with an owner and due date?',
            fr: 'Les exceptions approuvées et les mesures postérieures à la clôture sont-elles consignées avec un responsable et une date d’échéance?'
          },
          required: true,
          commentPolicy: 'required_on_fail'
        }
      ]
    }
  ],
  resultPolicy: { anyFailureFails: true, groups: [] }
})
const SEEDED_ADVANCE_ASSESSMENT_SCORE = 1
const SEEDED_ADVANCE_ASSESSMENT_ANSWERS = [
  { section: 'preAuthorization', subsection: 'exceptionalCircumstances', question: 'essentialToObjectives', value: 1 },
  { section: 'preAuthorization', subsection: 'exceptionalCircumstances', question: 'noAlternativeExists', value: 1 },
  { section: 'preAuthorization', subsection: 'exceptionalCircumstances', question: 'entrenchedPracticeDocumented', value: 1 },
  { section: 'preAuthorization', subsection: 'contractualAuthorization', question: 'contractClausePresent', value: 1 },
  { section: 'preAuthorization', subsection: 'contractualAuthorization', question: 'lawfulAppropriationCharge', value: 1 },
  { section: 'preAuthorization', subsection: 'contractualAuthorization', question: 'section34CertificationObtained', value: 1 },
  { section: 'fiscalControls', subsection: 'fiscalYearAlignment', question: 'advanceAlignedToFiscalYear', value: 1 },
  { section: 'fiscalControls', subsection: 'fiscalYearAlignment', question: 'noCarryForwardMechanism', value: 1 },
  { section: 'fiscalControls', subsection: 'fiscalYearAlignment', question: 'crossYearRecoveryJustification', value: 1 },
  { section: 'fiscalControls', subsection: 'multiYearContractRequirements', question: 'multiYearApplicability', value: 1 },
  { section: 'fiscalControls', subsection: 'multiYearContractRequirements', question: 'annualPaymentStructure', value: 1 },
  { section: 'monitoringAndRecovery', subsection: 'reconciliationAndAccounting', question: 'reconciliationProcess', value: 1 },
  { section: 'monitoringAndRecovery', subsection: 'reconciliationAndAccounting', question: 'accountingTreatment', value: 1 },
  { section: 'monitoringAndRecovery', subsection: 'recoveryControls', question: 'excessRecoveryAction', value: 1 },
  { section: 'monitoringAndRecovery', subsection: 'recoveryControls', question: 'nonDeliveryContingencyAction', value: 1 }
] as const
const SEEDED_ADVANCE_ASSESSMENT_OUTCOMES = [
  {
    section: 'advanceDecision',
    subsection: 'disbursementApproach',
    nameEn: 'Disbursement Approach',
    nameFr: 'Approche de décaissement',
    recommendedStrategy: 'permitted',
    selectedStrategy: 'permitted',
    accepted: true,
    justification: '',
    comment: ''
  },
  {
    section: 'advanceDecision',
    subsection: 'reconciliationFrequency',
    nameEn: 'Reconciliation Schedule',
    nameFr: 'Calendrier de réconciliation',
    recommendedStrategy: 'annual',
    selectedStrategy: 'annual',
    accepted: true,
    justification: '',
    comment: ''
  },
  {
    section: 'advanceDecision',
    subsection: 'recoveryControls',
    nameEn: 'Recovery Monitoring Level',
    nameFr: 'Niveau de surveillance du recouvrement',
    recommendedStrategy: 'standard',
    selectedStrategy: 'standard',
    accepted: true,
    justification: '',
    comment: ''
  }
] as const

const GCFORMS_EXTENSION_KEY = 'gcs-gcforms-integration'
const AUTOMATED_PAYMENTS_EXTENSION_KEY = 'gcs-automated-payments'
const OUTCOME_COST_ALLOCATION_EXTENSION_KEY = 'gcs-outcome-cost-allocation'
const NARRATIVE_TAGS_EXTENSION_KEY = 'gcs-narrative-tags'
const NARRATIVE_QUALITY_EXTENSION_KEY = 'gcs-narrative-quality'
const GCFORMS_LOCAL_CLAIMS_API_URL = 'https://gcforms-api.613868.xyz/v1'
const GCFORMS_LOCAL_CLAIMS_IDP_URL = 'https://gcforms-idp.613868.xyz'
const GCFORMS_LOCAL_CLAIMS_FORM_ID = 'clocalclaims0000000000000'
const GCFORMS_LOCAL_CLAIMS_KEY_ID = 'local-claims-service-account-public-key'
const GCFORMS_LOCAL_CLAIMS_USER_ID = 'local-claims-service-account'
const DEV_EXTENSION_SECRETS_KEY = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY='
const GCFORMS_LOCAL_CLAIMS_PRIVATE_KEY = [
  ['-----BEGIN ', 'PRIVATE KEY-----'].join(''),
  `
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCJtO67dOz+1eIO
YQXSbmIHUWP06YAtJ/fKLSD0huHXrlcDd4WvPCt79X0uOyYCgkjv/kUqLMRbvFBT
ai0UzddxfguReyaCRc5GcfhbKTh9RD51Z7McrqkBRfLDfJDrEcf2B/zsGnwrL5XU
zQmvjerMp48OaTigufvXnjtNLk5J2qOdhlV0ZhLFL6s3u+pZPp92GUsgEwWQZu+M
fL87j1i/M5CZGc002ILl76Gn2sDJQden/HcTN0YJPDwbJsbFr+8J09kecQoOw6Dk
JvHSJ50hEHx2ZsxdUffzRNr5W50T5ty0M0VzF7WZygXdDcE4N5YTal5gbv+/2G5N
MdMAtnZJAgMBAAECggEABeNa5uCNxqq6Dv/WiiQmpGX2RnFahfPEzFwIIfSHgRun
BFKuwGqr+FGrn9evHSHZgQuIBRDjd4GylJKAaXiQuv1W/Mo9gAoAkzIJ2soFLJQH
sKj1t2b/enq1ceboYmjA+lPmnGjYgNc4yp/Wx28jyErs2sKkhXjWXCabpgXyGoXC
8x0oQQY7YhHf9x7MyqOD1KVPXqtHc+HOdRF+AN0kilBodKaWyypy7N2H3QxbyrXy
loSsKWJ5crKH8DduRpEO8OHnwGJCJY7Ai1Eb+CoVYiPqBN8QqgJxagqqYGzJykpP
5k/6wrfdNHvu0QInTb/3P/wFeFbnIWN00LZNXfwAFQKBgQDB3ZHbNV1haXjBQnZC
h9DQWysLdG7qX4SeM+XImH15dJuqc4mHsuHcAXbs2dZyE/XQ01Br5ARpnsIzGWUN
7gQ1nPT7fc5fIkXZIa2ejv3cIpR24nx5iTGJugM7xQqFTKcXROr9l7h6jPDeHIzy
Mpbf/W5SXZJNVnBfGp1fdWYPtQKBgQC115swnsaDsuOykxBbnFLW1Ta81DZDaw25
5ACWFnX7wKECh6zHh0kdTkPKbQXl3y8tRYR+SWHg5kPNsdsS5WOk95WnuW/8ULHA
iUteyzV9GMR/X7K7Dtu3Mer0xeYkWvYHv0ZbBgAo6D936+ZMcEh8K9bemPhhWmS6
p+RbZnbgxQKBgDKCewUFA15k73xSx6MP5bzTdASZAmj4GAJr/Rtld5OUaRZg4d1E
IwqCKy0MmI3CW5Jb7CEgGHI4VdqgbC7T667YRQ/dOE6bDF3FI4ojMUsQi2PqIIo9
z3VVzI/fB52xWft7DkqiJANyAzOrdqGHwr17NyoojPyvX7m3oncDjGLdAoGAPetI
4Olv13CWsDv7mfZFDvpTRUFNqO9PITlOKc1EJ5GUQfRJFTgv4VbBJrCxDXFN8zB0
yTvbpGVEOUqSuoB5yba0swQl6djgbhtSGtk/QXWpk2XWynNoxZyt0OOCVmbS2Bh9
sIj+jO9ojUE6jlS9meqjo/CawyuwmQ6KZ8UgPbECgYAhibYnJ1dHUtgLrUkWva4z
toIyw2dM/aIZiIedPxP236ceqTCXooeKDLydffmJwwzQ6IhauTw3lhGEBNc3cu8q
eQpCRSbmgVMUbpc900vOi+vx41jCWAq9rwjV69GJF51jcIPM+uMswbepqqO2njeD
lodFYjY8ULUtBDC8zFYcrw==
`.trim(),
  ['-----END ', 'PRIVATE KEY-----'].join('')
].join('\n')
const GCFORMS_LOCAL_CLAIMS_MAPPINGS = [
  {
    id: 'agreement-number',
    sourceQuestionId: 'agreement_number',
    destinationEntity: 'claim',
    destinationPath: 'egcs_fc_fundingagreement',
    transform: 'string',
    required: true,
    onMissing: 'block',
    onInvalid: 'block'
  },
  {
    id: 'fiscal-year',
    sourceQuestionId: 'fiscal_year',
    destinationEntity: 'claim',
    destinationPath: 'egcs_fc_fiscalyear',
    transform: 'string',
    required: true,
    onMissing: 'block',
    onInvalid: 'block'
  },
  {
    id: 'period-start',
    sourceQuestionId: 'claim_period_start_month',
    destinationEntity: 'claim',
    destinationPath: 'egcs_fc_periodstart',
    transform: 'string',
    required: true,
    onMissing: 'block',
    onInvalid: 'block'
  },
  {
    id: 'period-end',
    sourceQuestionId: 'claim_period_end_month',
    destinationEntity: 'claim',
    destinationPath: 'egcs_fc_periodend',
    transform: 'string',
    required: true,
    onMissing: 'block',
    onInvalid: 'block'
  },
  {
    id: 'received-date',
    sourceQuestionId: '__gcforms_created_at',
    destinationEntity: 'claim',
    destinationPath: 'egcs_fc_receiveddate',
    transform: 'date',
    required: true,
    onMissing: 'block',
    onInvalid: 'block'
  },
  {
    id: 'submitted-cost-category',
    sourceQuestionId: 'submitted_cost_category',
    destinationEntity: 'claim_line_item',
    destinationPath: 'egcs_fc_submittedcostcategory',
    transform: 'string',
    required: true,
    onMissing: 'block',
    onInvalid: 'block'
  },
  {
    id: 'submitted-cost-subsection',
    sourceQuestionId: 'submitted_cost_subsection',
    destinationEntity: 'claim_line_item',
    destinationPath: 'egcs_fc_submittedcostsubsection',
    transform: 'string',
    required: true,
    onMissing: 'block',
    onInvalid: 'block'
  },
  {
    id: 'submitted-line-item',
    sourceQuestionId: 'submitted_line_item',
    destinationEntity: 'claim_line_item',
    destinationPath: 'egcs_fc_submittedlineitem',
    transform: 'string',
    required: true,
    onMissing: 'block',
    onInvalid: 'block'
  },
  {
    id: 'submitted-amount',
    sourceQuestionId: 'submitted_amount',
    destinationEntity: 'claim_line_item',
    destinationPath: 'egcs_fc_amount',
    transform: 'money',
    required: true,
    onMissing: 'block',
    onInvalid: 'block'
  }
] as const
const STREAM_31_PROJECT_DESCRIPTION_EN = 'This project will help unemployed and underemployed participants improve employment readiness, complete targeted skills training, and connect with employers and community supports. The recipient will deliver coordinated intake, individualized pathway planning, training referrals, retention supports, employer engagement, and performance reporting so participants can progress toward sustainable employment and the Department can monitor results against agreement outcomes.'
const STREAM_31_PROJECT_DESCRIPTION_FR = 'Ce projet aidera les participants sans emploi ou sous-employes a ameliorer leur preparation a l emploi, a terminer une formation ciblee et a etablir des liens avec des employeurs et des soutiens communautaires. Le beneficiaire offrira un accueil coordonne, une planification individualisee des parcours, des aiguillages vers la formation, des soutiens au maintien, de la mobilisation des employeurs et des rapports sur le rendement afin que les participants progressent vers un emploi durable et que le ministere puisse surveiller les resultats par rapport aux resultats de l entente.'
const STREAM_31_OUTCOME_SEEDS = [
  {
    nameEn: 'Employment pathways expanded',
    nameFr: 'Parcours vers l emploi elargis',
    descriptionEn: 'Participants gain access to practical supports that improve employment readiness.',
    descriptionFr: 'Les participants obtiennent des soutiens pratiques qui ameliorent leur preparation a l emploi.'
  },
  {
    nameEn: 'Skills training completed',
    nameFr: 'Formation professionnelle terminee',
    descriptionEn: 'Participants complete targeted training aligned with regional labour needs.',
    descriptionFr: 'Les participants terminent une formation ciblee harmonisee avec les besoins regionaux du marche du travail.'
  },
  {
    nameEn: 'Community partnerships strengthened',
    nameFr: 'Partenariats communautaires renforces',
    descriptionEn: 'Delivery partners coordinate referrals, wraparound supports, and employer engagement.',
    descriptionFr: 'Les partenaires de prestation coordonnent les aiguillages, les soutiens globaux et la mobilisation des employeurs.'
  },
  {
    nameEn: 'Participant retention improved',
    nameFr: 'Maintien des participants ameliore',
    descriptionEn: 'Participants remain engaged through coaching, case management, and follow-up services.',
    descriptionFr: 'Les participants demeurent mobilises grace a l accompagnement, la gestion de cas et les services de suivi.'
  },
  {
    nameEn: 'Program evidence generated',
    nameFr: 'Donnees probantes du programme produites',
    descriptionEn: 'The recipient reports reliable outcome evidence for program improvement and accountability.',
    descriptionFr: 'Le beneficiaire produit des donnees probantes fiables pour l amelioration du programme et la responsabilisation.'
  }
] as const

const STREAM_31_ACTIVITY_SEEDS = [
  {
    nameEn: 'Participant intake and employment pathway planning',
    nameFr: 'Accueil des participants et planification des parcours d emploi',
    descriptionEn: 'The recipient will recruit eligible participants through community referrals, complete structured needs assessments, and prepare individualized employment pathway plans. Each plan will document employment barriers, required wraparound supports, training needs, job readiness milestones, and referral actions needed to move participants toward sustained labour market attachment.',
    descriptionFr: 'Le beneficiaire recrutera les participants admissibles au moyen d aiguillages communautaires, effectuera des evaluations structurees des besoins et preparera des plans individualises de parcours vers l emploi. Chaque plan indiquera les obstacles a l emploi, les soutiens complementaires requis, les besoins de formation, les jalons de preparation a l emploi et les mesures d aiguillage necessaires.',
    expectedResultsEn: 'Eligible participants have documented employment pathway plans that identify barriers, supports, training needs, and near-term employment milestones. Participants are connected to appropriate services early in the agreement period and have a clear sequence of actions to improve employment readiness.',
    expectedResultsFr: 'Les participants admissibles disposent de plans de parcours vers l emploi documentes qui precisent les obstacles, les soutiens, les besoins de formation et les jalons d emploi a court terme. Les participants sont diriges rapidement vers les services appropries et disposent d une sequence claire d actions pour ameliorer leur preparation a l emploi.'
  },
  {
    nameEn: 'Targeted skills training and certification supports',
    nameFr: 'Formation ciblee et soutien a la certification',
    descriptionEn: 'The recipient will coordinate short-duration training cohorts aligned with local employer demand, including workplace essential skills, digital literacy, occupational safety, and sector-specific certification where required. Participants will receive training materials, coaching, attendance follow-up, and support to complete assessments or certification requirements.',
    descriptionFr: 'Le beneficiaire coordonnera des cohortes de formation de courte duree harmonisees avec la demande des employeurs locaux, notamment les competences essentielles en milieu de travail, la litteratie numerique, la securite au travail et les certifications sectorielles requises. Les participants recevront du materiel de formation, de l accompagnement, un suivi de l assiduite et du soutien pour terminer les evaluations ou les exigences de certification.',
    expectedResultsEn: 'Participants complete training modules and, where applicable, earn recognized certificates that improve their ability to compete for available jobs. Training completion data is tracked by cohort and used to identify participants who require additional coaching or referral support.',
    expectedResultsFr: 'Les participants terminent les modules de formation et, s il y a lieu, obtiennent des certificats reconnus qui ameliorent leur capacite a postuler aux emplois disponibles. Les donnees sur l achevement de la formation sont suivies par cohorte et servent a reperer les participants qui ont besoin d un accompagnement ou d un aiguillage supplementaire.'
  },
  {
    nameEn: 'Employer and community partner coordination',
    nameFr: 'Coordination avec les employeurs et les partenaires communautaires',
    descriptionEn: 'The recipient will convene service providers, employers, training organizations, and municipal partners to coordinate referrals, identify placement opportunities, and reduce duplication in participant supports. Activities include partner meetings, employer outreach, referral protocols, shared service mapping, and follow-up with employers after participant placements.',
    descriptionFr: 'Le beneficiaire reunira les fournisseurs de services, les employeurs, les organismes de formation et les partenaires municipaux afin de coordonner les aiguillages, de cerner les possibilites de placement et de reduire le chevauchement des soutiens aux participants. Les activites comprendront des rencontres avec les partenaires, de la mobilisation des employeurs, des protocoles d aiguillage, la cartographie des services et un suivi aupres des employeurs apres les placements.',
    expectedResultsEn: 'Community partners use coordinated referral practices and employers are engaged in identifying practical work opportunities for participants. The agreement produces stronger service pathways, clearer partner roles, and more timely access to employment-related supports.',
    expectedResultsFr: 'Les partenaires communautaires utilisent des pratiques d aiguillage coordonnees et les employeurs participent a la definition de possibilites de travail concretes pour les participants. L entente produit des parcours de services plus solides, des roles de partenaires plus clairs et un acces plus rapide aux soutiens lies a l emploi.'
  },
  {
    nameEn: 'Participant coaching, retention, and follow-up supports',
    nameFr: 'Accompagnement, maintien et suivi des participants',
    descriptionEn: 'The recipient will provide ongoing case management and retention supports to help participants remain engaged in training, placements, or early employment. Supports may include regular check-ins, problem-solving with employers, referrals for transportation or childcare barriers, attendance monitoring, and individualized follow-up when participants are at risk of disengaging.',
    descriptionFr: 'Le beneficiaire offrira une gestion de cas continue et des soutiens au maintien afin d aider les participants a demeurer engages dans la formation, les placements ou les premiers emplois. Les soutiens peuvent comprendre des suivis reguliers, la resolution de problemes avec les employeurs, des aiguillages pour les obstacles lies au transport ou a la garde d enfants, le suivi de l assiduite et un suivi individualise lorsque les participants risquent de se desengager.',
    expectedResultsEn: 'Participants receive timely interventions that improve attendance, placement continuity, and completion of agreed pathway milestones. The recipient documents retention risks and follow-up actions so that participants remain connected to services through key transition points.',
    expectedResultsFr: 'Les participants recoivent des interventions opportunes qui ameliorent l assiduite, la continuite des placements et l atteinte des jalons convenus. Le beneficiaire documente les risques de desengagement et les mesures de suivi afin que les participants demeurent lies aux services lors des principales transitions.'
  },
  {
    nameEn: 'Performance measurement and program learning',
    nameFr: 'Mesure du rendement et apprentissage du programme',
    descriptionEn: 'The recipient will collect, validate, and report participant service data, training completion results, referral activity, employer engagement, and placement outcomes. The recipient will maintain evidence files, review progress against targets, identify implementation issues, and provide narrative analysis to support departmental monitoring and continuous improvement.',
    descriptionFr: 'Le beneficiaire recueillera, validera et declarera les donnees sur les services aux participants, les resultats de formation, les aiguillages, la mobilisation des employeurs et les resultats de placement. Le beneficiaire tiendra des dossiers probants, examinera les progres par rapport aux cibles, cernera les enjeux de mise en oeuvre et fournira une analyse narrative pour appuyer la surveillance ministerielle et l amelioration continue.',
    expectedResultsEn: 'The agreement produces reliable performance evidence that supports monitoring, payment review, and program improvement. Reports clearly explain progress, variances, lessons learned, and corrective actions, giving the Department usable information for accountability and future program design.',
    expectedResultsFr: 'L entente produit des donnees probantes fiables sur le rendement qui appuient la surveillance, l examen des paiements et l amelioration du programme. Les rapports expliquent clairement les progres, les ecarts, les lecons apprises et les mesures correctives, fournissant au ministere de l information utile pour la reddition de comptes et la conception future du programme.'
  }
] as const

const createSeedRuntimeReviewSet = async (
  db: Kysely<Database>,
  reviewSetSetupId: string,
  entityType: Entity_Type,
  entityId: string
) => {
  const reviewSetSetup = await db.selectFrom('Common_Review_Set_Setup').selectAll()
    .where('id', '=', reviewSetSetupId).where('egcs_cn_entitytype', '=', entityType)
    .where('_deleted', '=', false).executeTakeFirstOrThrow()
  const published = await readCurrentPublishedDefinition(db, reviewSetSetupId, 'review_set_setup')
  const publication = readPublishedReviewSetup(published.definition)
  const firstSchema = await db.selectFrom('Common_Review_Schema').select('egcs_cn_agency')
    .where('id', '=', publication.members[0]!.schema.publicationId).where('_deleted', '=', false).executeTakeFirstOrThrow()
  const creator = await db.selectFrom('Common_User').select('id').where('_deleted', '=', false).orderBy('id').executeTakeFirstOrThrow()
  const reviewSet = await createRuntimeReviewSetInTransaction({
    db: db as Transaction<Database>,
    reviewSetSetupId,
    entityType,
    entityId,
    ownerAgencyId: String(firstSchema.egcs_cn_agency),
    setupScopes: [{
      scopeType: reviewSetSetup.egcs_cn_scopetype,
      scopeId: String(reviewSetSetup.egcs_cn_scopeid)
    }],
    publication,
    publicationVersionId: published.publicationVersionId,
    publicationVersion: published.publicationVersion,
    creatorCommonUserId: String(creator.id)
  })
  if (!reviewSet || reviewSet === 'IN_PROGRESS_EXISTS') {
    throw new Error(`Unable to create seeded runtime review set ${reviewSetSetupId}`)
  }
  const review = reviewSet.reviews.find(member => member.egcs_cn_reviewtype === 'assessment')
  if (!review) {
    throw new Error(`No assessment members found for seeded review set ${reviewSetSetupId}`)
  }

  return {
    runtimeId: reviewSet.runtimeId,
    reviewSetRuntimeItemId: reviewSet.runtimeItemId,
    reviewSetId: String(reviewSet.id),
    reviewId: String(review.id),
    reviewRuntimeItemId: review.runtimeItemId
  }
}

const seedAdvanceAssessmentRuntimeReview = async (db: Kysely<Database>): Promise<void> => {
  const applicantRecipient = await db
    .selectFrom('Applicant_Recipient_Profile')
    .select('id')
    .where('_deleted', '=', false)
    .orderBy('id', 'asc')
    .executeTakeFirstOrThrow()

  const advanceAssessmentSetSetup = await db
    .selectFrom('Common_Review_Set_Setup')
    .select('id')
    .where('egcs_cn_scopetype', '=', 'transferpaymentstream')
    .where('egcs_cn_entitytype', '=', 'applicantrecipient')
    .where('egcs_cn_name_en', '=', 'Advance Payment Assessment Set')
    .where('_deleted', '=', false)
    .orderBy('id', 'asc')
    .executeTakeFirstOrThrow()

  const createdRuntimeReview = await createSeedRuntimeReviewSet(
    db,
    String(advanceAssessmentSetSetup.id),
    'applicantrecipient',
    String(applicantRecipient.id)
  )

  await db
    .insertInto('Common_Review_Response')
    .values(SEEDED_ADVANCE_ASSESSMENT_ANSWERS.map(answer => ({
      egcs_cn_section: answer.section,
      egcs_cn_subsection: answer.subsection,
      egcs_cn_question: answer.question,
      egcs_cn_value: answer.value,
      egcs_cn_comment: SEEDED_ASSESSMENT_COMMENT,
      egcs_cn_calculated: false,
      egcs_cn_assessment: createdRuntimeReview.reviewId
    })))
    .execute()

  await db
    .insertInto('Common_Assessment_Outcome')
    .values(SEEDED_ADVANCE_ASSESSMENT_OUTCOMES.map(outcome => ({
      egcs_cn_review: createdRuntimeReview.reviewId,
      egcs_cn_section: outcome.section,
      egcs_cn_subsection: outcome.subsection,
      egcs_cn_name_en: outcome.nameEn,
      egcs_cn_name_fr: outcome.nameFr,
      egcs_cn_recommendedstrategy: outcome.recommendedStrategy,
      egcs_cn_accepted: outcome.accepted,
      egcs_cn_selectedstrategy: outcome.selectedStrategy,
      egcs_cn_justification: outcome.justification,
      egcs_cn_comment: outcome.comment
    })))
    .execute()

  await db
    .updateTable('Common_Review')
    .set({
      egcs_cn_reviewresult: SEEDED_ADVANCE_ASSESSMENT_SCORE,
      egcs_cn_reviewalignment: false,
      egcs_cn_reviewalignresult: null,
      egcs_cn_reviewalignmentnarrative: ''
    })
    .where('id', '=', createdRuntimeReview.reviewId)
    .execute()
}

const AGENCY_BASE_DATA = [
  { en: 'Health Canada', fr: 'Sante Canada', abEn: 'HC', abFr: 'SC' },
  {
    en: 'Environment and Climate Change Canada',
    fr: 'Environnement et Changement climatique Canada',
    abEn: 'ECCC',
    abFr: 'ECCC'
  },
  { en: 'Shared Services Canada', fr: 'Services partages Canada', abEn: 'SSC', abFr: 'SPC' },
  { en: 'Transport Canada', fr: 'Transports Canada', abEn: 'TC', abFr: 'TC' },
  { en: 'Fisheries and Oceans Canada', fr: 'Peches et Oceans Canada', abEn: 'DFO', abFr: 'MPO' },
  { en: 'Global Affairs Canada', fr: 'Affaires mondiales Canada', abEn: 'GAC', abFr: 'AMC' },
  {
    en: 'Employment and Social Development Canada',
    fr: 'Emploi et Developpement social Canada',
    abEn: 'ESDC',
    abFr: 'EDSC'
  },
  { en: 'Natural Resources Canada', fr: 'Ressources naturelles Canada', abEn: 'NRCan', abFr: 'RNCan' },
  {
    en: 'Public Services and Procurement Canada',
    fr: 'Services publics et Approvisionnement Canada',
    abEn: 'PSPC',
    abFr: 'SPAC'
  },
  {
    en: 'Innovation, Science and Economic Development Canada',
    fr: 'Innovation, Sciences et Developpement economique Canada',
    abEn: 'ISED',
    abFr: 'ISDE'
  },
  { en: 'Canada Revenue Agency', fr: 'Agence du revenu du Canada', abEn: 'CRA', abFr: 'ARC' },
  {
    en: 'Immigration, Refugees and Citizenship Canada',
    fr: 'Immigration, Refugies et Citoyennete Canada',
    abEn: 'IRCC',
    abFr: 'IRCC'
  },
  { en: 'Indigenous Services Canada', fr: 'Services aux Autochtones Canada', abEn: 'ISC', abFr: 'SAC' },
  {
    en: 'Crown-Indigenous Relations and Northern Affairs Canada',
    fr: 'Relations Couronne-Autochtones et Affaires du Nord Canada',
    abEn: 'CIRNAC',
    abFr: 'RCAANC'
  },
  { en: 'Public Health Agency of Canada', fr: 'Agence de la sante publique du Canada', abEn: 'PHAC', abFr: 'ASPC' },
  { en: 'Public Safety Canada', fr: 'Securite publique Canada', abEn: 'PSC', abFr: 'SPC' },
  { en: 'Agriculture and Agri-Food Canada', fr: 'Agriculture et Agroalimentaire Canada', abEn: 'AAFC', abFr: 'AAC' },
  { en: 'Department of Finance Canada', fr: 'Ministere des Finances Canada', abEn: 'FIN', abFr: 'FIN' },
  { en: 'Department of Justice Canada', fr: 'Ministere de la Justice Canada', abEn: 'JUS', abFr: 'JUS' },
  {
    en: 'Treasury Board of Canada Secretariat',
    fr: 'Secretariat du Conseil du Tresor du Canada',
    abEn: 'TBS',
    abFr: 'SCT'
  }
] as const

const ABILITIES = [
  { action: 'create', subject: 'agency' },
  { action: 'read', subject: 'agency' },
  { action: 'update', subject: 'agency' },
  { action: 'delete', subject: 'agency' },
  { action: 'create', subject: 'role' },
  { action: 'read', subject: 'role' },
  { action: 'update', subject: 'role' },
  { action: 'delete', subject: 'role' },
  { action: 'create', subject: 'user' },
  { action: 'read', subject: 'user' },
  { action: 'update', subject: 'user' },
  { action: 'delete', subject: 'user' }
] as const

const ROOT_ROLE_SUBJECTS: readonly RoleAbilitySubject[] = [
  'system',
  'agency',
  'transfer_payment',
  'role',
  'user',
  'agreement',
  'applicant_recipient'
]
const ROOT_ROLE_PERMISSIONS: RoleSeed['permissions'] = ROOT_ROLE_SUBJECTS.map(subject => ({
  subject,
  access_level: 'manager',
  can_manage_assignments: ['agreement', 'applicant_recipient'].includes(subject)
}))

const ROLE_MASKS = [1826, 2, 240, 15, 512, 3840, 546, 96, 32, 6, 514, 34, 1028, 48, 128, 3, 768, 1536, 8, 2050] as const

const PROPONENT_ROLE_PERMISSIONS = new Map<number, {
  access_level: RoleAccessLevel | null
  can_manage_assignments: boolean
}>([
  [1, { access_level: null, can_manage_assignments: true }],
  [2, { access_level: 'contributor', can_manage_assignments: false }],
  [4, { access_level: 'viewer', can_manage_assignments: false }],
  [6, { access_level: 'manager', can_manage_assignments: true }]
])

const ROLE_LABELS = [
  { en: 'Agency User Administration Officer', fr: 'Agent de gestion des utilisateurs de l agence' },
  { en: 'Program Operations Manager', fr: 'Gestionnaire des operations de programme' },
  { en: 'Agency Configuration Administrator', fr: 'Administrateur de la configuration de l agence' },
  { en: 'Agency Read-Only Analyst', fr: 'Analyste en lecture seule de l agence' },
  { en: 'Agency and Program Coordinator', fr: 'Coordonnateur de l agence et du programme' },
  { en: 'Program Delivery Director', fr: 'Directeur de la prestation du programme' },
  { en: 'Program Oversight Analyst', fr: 'Analyste de supervision du programme' },
  { en: 'Role Governance Administrator', fr: 'Administrateur de la gouvernance des roles' },
  { en: 'Role Catalog Viewer', fr: 'Lecteur du catalogue des roles' },
  { en: 'Program and Role Manager', fr: 'Gestionnaire des programmes et des roles' },
  { en: 'User Access Administrator', fr: 'Administrateur des acces utilisateurs' },
  { en: 'Agency Access Administrator', fr: 'Administrateur des acces de l agence' },
  { en: 'User and Role Operations Lead', fr: 'Responsable des operations des utilisateurs et des roles' },
  { en: 'Program Access Coordinator', fr: 'Coordonnateur des acces au programme' },
  { en: 'Agency and Program Operations Lead', fr: 'Responsable des operations de l agence et du programme' },
  { en: 'Program and User Operations Lead', fr: 'Responsable des operations du programme et des utilisateurs' },
  { en: 'User Read-Only Specialist', fr: 'Specialiste en lecture seule des utilisateurs' },
  { en: 'Agency Read-Only Specialist', fr: 'Specialiste en lecture seule de l agence' },
  { en: 'Agency and User Services Manager', fr: 'Gestionnaire des services d agence et utilisateurs' },
  { en: 'Business Operations Supervisor', fr: 'Superviseur des operations administratives' }
] as const

const USER_SEEDS: UserSeed[] = [
  { email: 'agency@example.com', name: 'Avery Bennett' },
  { email: 'program@example.com', name: 'Jordan Sinclair' },
  { email: 'user03@example.com', name: 'Morgan Patel' },
  { email: 'user04@example.com', name: 'Taylor Kim' },
  { email: 'user05@example.com', name: 'Casey Tremblay' },
  { email: 'user06@example.com', name: 'Riley Chen' },
  { email: 'user07@example.com', name: 'Cameron Nguyen' },
  { email: 'user08@example.com', name: 'Peyton Clarke' },
  { email: 'user09@example.com', name: 'Drew Wallace' },
  { email: 'user10@example.com', name: 'Sydney Martel' },
  { email: 'user11@example.com', name: 'Alexis Roy' },
  { email: 'user12@example.com', name: 'Bailey Morrison' },
  { email: 'user13@example.com', name: 'Quinn Foster' },
  { email: 'user14@example.com', name: 'Emerson Shah' },
  { email: 'user15@example.com', name: 'Harper Evans' },
  { email: 'user16@example.com', name: 'Logan Reid' },
  { email: 'user17@example.com', name: 'Jamie O Connell' },
  { email: 'user18@example.com', name: 'Dakota Russell' },
  { email: 'user19@example.com', name: 'Rowan Bell' },
  { email: 'user20@example.com', name: 'Kai Mercer' },
  { email: 'proponent@example.com', name: 'Proponent Officer' }
] as const

const INACTIVE_USER_SEEDS = [
  { email: 'inactive.amelie@example.com', name: 'Amélie Gagnon' },
  { email: 'inactive.noah@example.com', name: 'Noah Wilson' },
  { email: 'inactive.priya@example.com', name: 'Priya Sharma' }
] as const

const getRequiredAt = <T>(values: readonly T[], index: number, label: string): T => {
  const value = values[index]
  if (value === undefined) {
    throw new Error(`Missing ${label} at index ${index}`)
  }
  return value
}

const seedGwcoa = async (db: Kysely<Database>): Promise<number[]> => {
  const gwcoaNumbers: number[] = []

  for (const [i, base] of AGENCY_BASE_DATA.entries()) {
    const gwcoaNumber = 100 + i

    await db
      .insertInto('Common_GWCOA')
      .values({
        egcs_cn_number: gwcoaNumber,
        egcs_cn_name_en: base.en,
        egcs_cn_name_fr: base.fr,
        _deleted: false
      })
      .execute()

    gwcoaNumbers.push(gwcoaNumber)
  }

  return gwcoaNumbers
}

const seedAgencies = async (db: Kysely<Database>, gwcoaNumbers: number[]): Promise<AgencyRecord[]> => {
  const agencies: AgencyRecord[] = []

  for (const [i, base] of AGENCY_BASE_DATA.entries()) {
    const gwcoaNumber = getRequiredAt(gwcoaNumbers, i, 'GWCOA number')

    const agency = await db
      .insertInto('Agency_Profile')
      .values({
        egcs_ay_gwcoa_number: gwcoaNumber,
        egcs_ay_agencyfinancialsystemid: String(3000 + i),
        egcs_ay_name_en: base.en,
        egcs_ay_name_fr: base.fr,
        egcs_ay_abbreviation_en: base.abEn,
        egcs_ay_abbreviation_fr: base.abFr,
        egcs_ay_active: i % 7 !== 0
      })
      .returning(['id', 'egcs_ay_name_en', 'egcs_ay_name_fr'])
      .executeTakeFirstOrThrow()

    const agencyStatuses = await seedAgencyStatuses(db, String(agency.id))
    await db.updateTable('Agency_Profile')
      .set({
        egcs_ay_claimreconciliationstartstatus: agencyStatuses.inProgress,
        egcs_ay_claimreconciliationfinalstatus: agencyStatuses.approved
      })
      .where('id', '=', String(agency.id))
      .execute()

    agencies.push({
      id: String(agency.id),
      nameEn: agency.egcs_ay_name_en,
      nameFr: agency.egcs_ay_name_fr
    })

    const category = await db
      .insertInto('Agency_Cost_Category')
      .values({
        egcs_ay_organizationagency: String(agency.id),
        egcs_ay_name_en: 'Operating Costs',
        egcs_ay_name_fr: 'Couts de fonctionnement'
      })
      .returning('id')
      .executeTakeFirstOrThrow()

    await db
      .insertInto('Agency_Cost_Category_Line_Item')
      .values([
        {
          egcs_ay_organizationcostcategory: String(category.id),
          egcs_ay_name_en: 'Travel',
          egcs_ay_name_fr: 'Deplacement'
        },
        {
          egcs_ay_organizationcostcategory: String(category.id),
          egcs_ay_name_en: 'Equipment',
          egcs_ay_name_fr: 'Equipement'
        }
      ])
      .execute()

    await db
      .insertInto('Agency_Fiscal_Year')
      .values([
        {
          egcs_ay_organizationagency: String(agency.id),
          egcs_ay_fiscalyeardisplay: '2025-2026',
          egcs_ay_fiscalyear: 2026,
          egcs_ay_startdate: new Date('2025-04-01'),
          egcs_ay_enddate: new Date('2026-03-31')
        },
        {
          egcs_ay_organizationagency: String(agency.id),
          egcs_ay_fiscalyeardisplay: '2026-2027',
          egcs_ay_fiscalyear: 2027,
          egcs_ay_startdate: new Date('2026-04-01'),
          egcs_ay_enddate: new Date('2027-03-31')
        }
      ])
      .execute()

    await db
      .insertInto('Agency_Address_Type')
      .values({
        egcs_ay_organizationagency: String(agency.id),
        egcs_ay_typename_en: 'Head Office',
        egcs_ay_typename_fr: 'Siege social'
      })
      .execute()

    await db
      .insertInto('Agency_Applicant_Recipient_Subtype')
      .values({
        egcs_ay_organizationagency: String(agency.id),
        egcs_ay_applicantrecipienttype: 'government',
        egcs_ay_name_en: 'Municipal Government',
        egcs_ay_name_fr: 'Gouvernement municipal',
        egcs_ay_description_en: 'Local municipal authorities',
        egcs_ay_description_fr: 'Autorites municipales locales'
      })
      .execute()

    await db
      .insertInto('Agency_Approval_Behalf_Type')
      .values([
        {
          egcs_ay_organizationagency: String(agency.id),
          egcs_ay_name_en: 'Acting',
          egcs_ay_name_fr: 'Par intérim',
          egcs_ay_require_actual: false
        },
        {
          egcs_ay_organizationagency: String(agency.id),
          egcs_ay_name_en: 'Director',
          egcs_ay_name_fr: 'Directeur',
          egcs_ay_require_actual: true
        }
      ])
      .execute()

    await db
      .insertInto('Agency_Agreement_Type')
      .values({
        egcs_ay_organizationagency: String(agency.id),
        egcs_ay_agreementtype: 'grant',
        egcs_ay_name_en: 'Standard Grant',
        egcs_ay_name_fr: 'Subvention standard'
      })
      .execute()
  }

  return agencies
}

function buildRoleSeeds(agencies: AgencyRecord[]): RoleSeed[] {
  const seeds: RoleSeed[] = []

  for (let i = 0; i < 20; i++) {
    const roleIndex = i + 1
    const mask = getRequiredAt(ROLE_MASKS, i, 'role mask')
    const roleLabel = getRequiredAt(ROLE_LABELS, i, 'role label')
    const abilities = ABILITIES.filter((_, index) => (mask >> index) & 1)
    const agency = getRequiredAt(agencies, i, 'agency')

    const permissionBySubject = new Map<RoleAbilitySubject, RoleAccessLevel>()
    for (const ability of abilities) {
      const level: RoleAccessLevel = ability.action === 'delete'
        ? 'manager'
        : ability.action === 'create' || ability.action === 'update'
          ? 'contributor'
          : 'viewer'
      const current = permissionBySubject.get(ability.subject)
      if (!current || ['viewer', 'contributor', 'manager'].indexOf(level) > ['viewer', 'contributor', 'manager'].indexOf(current)) {
        permissionBySubject.set(ability.subject, level)
      }
    }
    const proponentPermission = PROPONENT_ROLE_PERMISSIONS.get(roleIndex)
    permissionBySubject.delete('applicant_recipient')
    seeds.push({
      key: `seed_role_${roleIndex}`,
      nameEn: roleLabel.en,
      nameFr: roleLabel.fr,
      agencyId: agency.id,
      permissions: [
        ...[...permissionBySubject].map(([subject, access_level]) => ({
          subject,
          access_level,
          can_manage_assignments: false
        })),
        ...(proponentPermission
          ? [{ subject: 'applicant_recipient' as const, ...proponentPermission }]
          : [])
      ]
    })
  }

  seeds.push({
    key: 'root_admin',
    nameEn: 'Root Administrator',
    nameFr: 'Administrateur racine',
    agencyId: null,
    permissions: ROOT_ROLE_PERMISSIONS
  })

  return seeds
}

async function seedRoles(
  db: Kysely<Database>,
  roleSeeds: RoleSeed[]
): Promise<{ rootRoleId: string; seededRoleIds: string[] }> {
  const roleIdByKey = new Map<string, string>()

  for (const role of roleSeeds) {
    const insertedRole = await db
      .insertInto('role')
      .values(
        role.agencyId
          ? {
              name_en: role.nameEn,
              name_fr: role.nameFr,
              description_en: `Auto-seeded role ${role.key}`,
              description_fr: `Role initialise automatiquement ${role.key}`,
              agency_id: role.agencyId,
              _deleted: false
            }
          : {
              name_en: role.nameEn,
              name_fr: role.nameFr,
              description_en: `Auto-seeded role ${role.key}`,
              description_fr: `Role initialise automatiquement ${role.key}`,
              _deleted: false
            }
      )
      .returning('id')
      .executeTakeFirstOrThrow()

    const roleId = String(insertedRole.id)
    roleIdByKey.set(role.key, roleId)

    for (const permission of role.permissions) {
      await db
        .insertInto('role_permission')
        .values({
          role_id: roleId,
          subject: permission.subject,
          access_level: permission.access_level,
          can_manage_assignments: permission.can_manage_assignments,
          _deleted: false
        })
        .execute()
    }
  }

  return {
    rootRoleId: roleIdByKey.get('root_admin') ?? '',
    seededRoleIds: Array.from({ length: 20 }, (_, index) => roleIdByKey.get(`seed_role_${index + 1}`) ?? '').filter(
      Boolean
    )
  }
}

async function createCredentialAccount(
  db: Kysely<Database>,
  email: string,
  name: string,
  passwordHash: string,
  emailVerified = true
): Promise<string> {
  const insertedUser = await db
    .insertInto('user')
    .values({
      name,
      email,
      emailVerified,
      createdAt: new Date(),
      updatedAt: new Date(),
      _deleted: false
    })
    .returning('id')
    .executeTakeFirstOrThrow()

  const userId = String(insertedUser.id)

  await db
    .insertInto('account')
    .values({
      id: `acc_${userId}`,
      userId,
      accountId: userId,
      providerId: 'credential',
      password: passwordHash,
      createdAt: new Date(),
      updatedAt: new Date()
    })
    .execute()

  return userId
}

async function seedUsers(
  db: Kysely<Database>,
  passwordHash: string,
  roleIds: { rootRoleId: string; seededRoleIds: string[] }
): Promise<void> {
  const rootUserId = await createCredentialAccount(
    db,
    'root@example.com',
    'Sophie McAllister',
    passwordHash
  )

  await db
    .insertInto('user_role_assignment')
    .values({
      user_id: rootUserId,
      role_id: roleIds.rootRoleId,
      createdAt: new Date(),
      _deleted: false
    })
    .execute()

  for (const [i, userSeed] of USER_SEEDS.entries()) {
    const agencyIndex = i % 10
    const roleId = getRequiredAt(roleIds.seededRoleIds, agencyIndex, 'seeded role id')

    const userId = await createCredentialAccount(
      db,
      userSeed.email,
      userSeed.name,
      passwordHash
    )

    await db
      .insertInto('user_role_assignment')
      .values({
        user_id: userId,
        role_id: roleId,
        createdAt: new Date(),
        _deleted: false
      })
      .execute()
  }

  for (const userSeed of INACTIVE_USER_SEEDS) {
    await db
      .insertInto('user')
      .values({
        name: userSeed.name,
        email: userSeed.email,
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        _deleted: false
      })
      .execute()
  }
}

async function seedCommonData(db: Kysely<Database>): Promise<void> {
  const firstAgency = await db
    .selectFrom('Agency_Profile')
    .where('_deleted', '=', false)
    .select('id')
    .orderBy('id', 'asc')
    .executeTakeFirstOrThrow()
  const commonAgencyId = String(firstAgency.id)
  const commonUserIds: string[] = []

  for (const userSeed of [{ email: 'root@example.com', name: 'Sophie McAllister' }, ...USER_SEEDS]) {
    const authenticationUser = await db
      .selectFrom('user')
      .select('id')
      .where('email', '=', userSeed.email)
      .where('_deleted', '=', false)
      .executeTakeFirstOrThrow()
    const commonUser = await db
      .insertInto('Common_User')
      .values({
        egcs_cn_auth_user_id: String(authenticationUser.id),
        egcs_cn_name: userSeed.name,
        egcs_cn_position_title: 'Program Officer',
        egcs_cn_email: userSeed.email,
        egcs_cn_email_verified: true,
        egcs_cn_created_at: new Date(),
        egcs_cn_updated_at: new Date(),
        _deleted: false
      })
      .returning('id')
      .executeTakeFirstOrThrow()

    commonUserIds.push(String(commonUser.id))
  }

  const contactSeeds = [
    {
      name: 'Sarah Jenkins',
      jobEn: 'Senior Program Officer',
      jobFr: 'Agent principal de programme',
      email: 'sarah.jenkins@example.com'
    },
    {
      name: 'Marc-André Bérubé',
      jobEn: 'Policy Analyst',
      jobFr: 'Analyste des politiques',
      email: 'ma.berube@example.com'
    },
    {
      name: 'Amira El-Sayed',
      jobEn: 'Financial Auditor',
      jobFr: 'Vérificateur financier',
      email: 'amira.elsayed@example.com'
    },
    { name: 'David Wong', jobEn: 'Technical Lead', jobFr: 'Chef technique', email: 'david.wong@example.com' },
    {
      name: 'Elena Petrova',
      jobEn: 'Compliance Officer',
      jobFr: 'Agent de conformité',
      email: 'elena.petrova@example.com'
    },
    {
      name: 'Kofi Mensah',
      jobEn: 'Director of Operations',
      jobFr: 'Directeur des opérations',
      email: 'kofi.mensah@example.com'
    },
    {
      name: 'Isabella Rossi',
      jobEn: 'Grants Coordinator',
      jobFr: 'Coordonnateur des subventions',
      email: 'isabella.rossi@example.com'
    },
    {
      name: "Liam O'Connor",
      jobEn: 'Systems Administrator',
      jobFr: 'Administrateur de systèmes',
      email: 'liam.oconnor@example.com'
    },
    {
      name: 'Yuki Tanaka',
      jobEn: 'Regional Manager',
      jobFr: 'Gestionnaire régional',
      email: 'yuki.tanaka@example.com'
    },
    {
      name: 'Fatima Al-Farsi',
      jobEn: 'Communications Specialist',
      jobFr: 'Spécialiste des communications',
      email: 'fatima.alfarsi@example.com'
    },
    {
      name: 'Gabriel Deschamps',
      jobEn: 'Legal Counsel',
      jobFr: 'Conseiller juridique',
      email: 'gabriel.deschamps@example.com'
    },
    {
      name: 'Olivia Taylor',
      jobEn: 'Procurement Specialist',
      jobFr: "Spécialiste de l'approvisionnement",
      email: 'olivia.taylor@example.com'
    },
    {
      name: 'Jean-François Tremblay',
      jobEn: 'Executive Assistant',
      jobFr: 'Adjoint exécutif',
      email: 'jf.tremblay@example.com'
    },
    { name: 'Maya Gupta', jobEn: 'Data Scientist', jobFr: 'Scientifique des données', email: 'maya.gupta@example.com' },
    {
      name: 'Robert Smith',
      jobEn: 'Senior Accountant',
      jobFr: 'Comptable principal',
      email: 'robert.smith@example.com'
    }
  ]

  for (const s of contactSeeds) {
    await db
      .insertInto('Common_Contact')
      .values({
        egcs_cn_name: s.name,
        egcs_cn_generallanguagepreference: s.email.includes('tremblay') || s.email.includes('berube') ? 'fra' : 'eng',
        egcs_cn_jobtitle_en: s.jobEn,
        egcs_cn_jobtitle_fr: s.jobFr,
        egcs_cn_primaryaccount: true,
        egcs_cn_email: s.email
      })
      .execute()
  }

  const addressSeeds = [
    { city: 'Ottawa', subdiv: 'on', street: '235 Queen St', postal: 'K1A 0H5' },
    { city: 'Gatineau', subdiv: 'qc', street: '111 Promenade du Portage', postal: 'J8X 2K1' },
    { city: 'Montreal', subdiv: 'qc', street: '500 Rene-Levesque Blvd W', postal: 'H2Z 1W7' },
    { city: 'Toronto', subdiv: 'on', street: '1 Front St W', postal: 'M5J 1A1' },
    { city: 'Vancouver', subdiv: 'bc', street: '401 Burrard St', postal: 'V6C 3S4' },
    { city: 'Winnipeg', subdiv: 'mb', street: '200 Graham Ave', postal: 'R3C 4L5' },
    { city: 'Edmonton', subdiv: 'ab', street: '10405 Jasper Ave', postal: 'T5J 4R7' },
    { city: 'Halifax', subdiv: 'ns', street: '1505 Barrington St', postal: 'B3J 3K5' },
    { city: "St. John's", subdiv: 'nl', street: "10 Barter's Hill", postal: 'A1C 5X1' },
    { city: 'Regina', subdiv: 'sk', street: '1783 Hamilton St', postal: 'S4P 2B6' },
    { city: 'Victoria', subdiv: 'bc', street: '1230 Government St', postal: 'V8W 1Y3' },
    { city: 'Charlottetown', subdiv: 'pe', street: '161 Grafton St', postal: 'C1A 8M9' }
  ]

  for (const [i, a] of addressSeeds.entries()) {
    await db
      .insertInto('Common_Address')
      .values({
        egcs_cn_federalridingid: 1000 + i,
        egcs_cn_addresscity: a.city,
        egcs_cn_addresscountry: 'ca',
        egcs_cn_addresssubdivision: a.subdiv,
        egcs_cn_gc_addressid: 5000 + i,
        egcs_cn_mainphone: 6130000000 + i,
        egcs_cn_mainphoneextension: 0,
        egcs_cn_postalcodezipcode: a.postal,
        egcs_cn_street1: a.street,
        egcs_cn_street2: '',
        egcs_cn_street3: ''
      })
      .execute()
  }

  const assessmentSchemaSeeds = [
    {
      en: 'Financial Capacity Review',
      fr: 'Examen de la capacité financière',
      outcomeEn: 'Financial Risk Level',
      outcomeFr: 'Niveau de risque financier',
      scoringMatrix: assessmentDefinitionSeed.scoringMatrix,
      assessmentSchema: assessmentDefinitionSeed.assessmentSchema
    },
    {
      en: 'Technical Merit Evaluation',
      fr: 'Évaluation du mérite technique',
      outcomeEn: 'Technical Score',
      outcomeFr: 'Pointage technique'
    },
    {
      en: 'Governance & Compliance Audit',
      fr: 'Audit de gouvernance et de conformité',
      outcomeEn: 'Compliance Status',
      outcomeFr: 'Statut de conformité'
    },
    {
      en: 'Strategic Alignment Assessment',
      fr: "Évaluation de l'alignement stratégique",
      outcomeEn: 'Alignment Rating',
      outcomeFr: "Cote d'alignement"
    },
    {
      en: 'Community Impact Scoring',
      fr: "Notation de l'impact communautaire",
      outcomeEn: 'Impact Level',
      outcomeFr: "Niveau d'impact"
    },
    {
      en: 'Risk & Mitigation Plan',
      fr: "Plan de risque et d'atténuation",
      outcomeEn: 'Mitigation Strength',
      outcomeFr: "Force d'atténuation"
    }
  ]

  for (const s of assessmentSchemaSeeds) {
    await db
      .insertInto('Common_Review_Schema')
      .values({
        egcs_cn_reviewtype: 'assessment',
        egcs_cn_agency: commonAgencyId,
        egcs_cn_entitytype: 'applicantrecipient',
        egcs_cn_name_en: s.en,
        egcs_cn_name_fr: s.fr,
        egcs_cn_outcomename_en: s.outcomeEn,
        egcs_cn_outcomename_fr: s.outcomeFr,
        egcs_cn_disablecustomoutcomes: false,
        egcs_cn_disablealignment: false,
        egcs_cn_disablereviewers: false,
        egcs_cn_scoringmatrix: sql`${JSON.stringify(s.scoringMatrix ?? [])}::jsonb`,
        egcs_cn_assessmentschema: s.assessmentSchema ?? { sections: [], sectionMatrix: [], outcomes: [] }
      })
      .execute()
  }

  const certificationSeeds = [
    {
      en: 'Secret Security Clearance',
      fr: 'Cote de sécurité Secret',
      descEn: 'Level II clearance',
      descFr: 'Niveau II'
    },
    {
      en: 'CPA Designation',
      fr: 'Titre de CPA',
      descEn: 'Chartered Professional Accountant',
      descFr: 'Comptable professionnel agréé'
    },
    {
      en: 'PMP Certification',
      fr: 'Certification PMP',
      descEn: 'Project Management Professional',
      descFr: 'Professionnel de la gestion de projet'
    },
    {
      en: 'Bilingualism Level C',
      fr: 'Bilinguisme Niveau C',
      descEn: 'Superior proficiency',
      descFr: 'Compétence supérieure'
    },
    {
      en: 'Ethics in Public Service',
      fr: 'Éthique dans la fonction publique',
      descEn: 'Mandatory training',
      descFr: 'Formation obligatoire'
    },
    {
      en: 'Indigenous Awareness',
      fr: 'Sensibilisation aux réalités autochtones',
      descEn: 'Cultural competency',
      descFr: 'Compétence culturelle'
    }
  ]

  const approvalTemplateSeeds = [
    {
      en: 'Standard Grant Approval',
      fr: 'Approbation de subvention standard',
      descEn: 'Flow for grants under $100k',
      descFr: 'Flux pour subventions < 100k$'
    },
    {
      en: 'Fast-Track Amendment',
      fr: 'Modification accélérée',
      descEn: 'Minor budget adjustments',
      descFr: 'Ajustements budgétaires mineurs'
    },
    {
      en: 'High-Value Contribution Flow',
      fr: 'Flux de contribution de grande valeur',
      descEn: 'Requires ADM sign-off',
      descFr: 'Requiert la signature du SMA'
    },
    {
      en: 'Emergency Response Funding',
      fr: "Financement d'intervention d'urgence",
      descEn: '24-hour turnaround',
      descFr: 'Délai de 24 heures'
    }
  ]

  for (let i = 1; i <= 5; i++) {
    const createdChecklistSchema = await db
      .insertInto('Common_Review_Schema')
      .values({
        egcs_cn_reviewtype: 'checklist',
        egcs_cn_agency: commonAgencyId,
        egcs_cn_entitytype: 'applicantrecipient',
        egcs_cn_name_en: `Checklist ${i} EN`,
        egcs_cn_name_fr: `Liste de controle ${i} FR`,
        egcs_cn_outcomename_en: `Checklist Outcome ${i} EN`,
        egcs_cn_outcomename_fr: `Resultat de liste ${i} FR`,
        egcs_cn_disablecustomoutcomes: false,
        egcs_cn_disablealignment: false,
        egcs_cn_disablereviewers: false,
        egcs_cn_scoringmatrix: { pass: 1, fail: 0 },
        egcs_cn_assessmentschema: { title: `Checklist v${i}`, items: [] }
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    await db.insertInto('Common_Checklist_Schema').values({
      egcs_cn_reviewschema: String(createdChecklistSchema.id),
      egcs_cn_checklistschema: SEEDED_CHECKLIST_DEFINITION,
      _deleted: false
    }).execute()
  }

  const attachmentTypeSeeds = [
    {
      en: 'Articles of Incorporation',
      fr: 'Statuts constitutifs',
      descEn: 'Proof of legal entity',
      descFr: "Preuve d'entité juridique"
    },
    {
      en: 'Financial Statements',
      fr: 'États financiers',
      descEn: 'Audit or Review Engagement',
      descFr: "Audit ou mission d'examen"
    },
    {
      en: 'Project Proposal',
      fr: 'Proposition de projet',
      descEn: 'Detailed work plan',
      descFr: 'Plan de travail détaillé'
    },
    {
      en: 'Letter of Intent',
      fr: "Lettre d'intention",
      descEn: 'Expression of interest',
      descFr: "Manifestation d'intérêt"
    },
    {
      en: 'Tax Compliance Certificate',
      fr: 'Certificat de conformité fiscale',
      descEn: 'CRA verification',
      descFr: "Vérification de l'ARC"
    },
    { en: 'Void Cheque', fr: 'Spécimen de chèque', descEn: 'For direct deposit', descFr: 'Pour dépôt direct' }
  ]

  for (const s of attachmentTypeSeeds) {
    await db
      .insertInto('Common_Attachment_Types')
      .values({
        egcs_cn_agency: commonAgencyId,
        egcs_cn_name_en: s.en,
        egcs_cn_name_fr: s.fr,
        egcs_cn_description_en: s.descEn,
        egcs_cn_description_fr: s.descFr
      })
      .execute()
  }

  void approvalTemplateSeeds
  void certificationSeeds

  const recommendationStream = await db
    .selectFrom('Transfer_Payment_Stream')
    .innerJoin('Transfer_Payment_Profile', 'Transfer_Payment_Profile.id', 'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile')
    .select('Transfer_Payment_Stream.id')
    .where('Transfer_Payment_Profile.egcs_tp_agency', '=', commonAgencyId)
    .where('Transfer_Payment_Stream._deleted', '=', false)
    .where('Transfer_Payment_Profile._deleted', '=', false)
    .orderBy('Transfer_Payment_Stream.id', 'asc')
    .executeTakeFirst()

  const recommendationSchemaSeeds = [
    {
      entityType: 'fundingcasepayment',
      en: 'Payment Recommendation',
      fr: 'Recommandation de paiement'
    },
    {
      entityType: 'fundingcaseforecast',
      en: 'Forecast Recommendation',
      fr: 'Recommandation de prévision'
    }
  ] as const

  for (const schema of recommendationStream ? recommendationSchemaSeeds : []) {
    await db
      .insertInto('Common_Recommendation_Schema')
      .values({
        egcs_cn_agency: commonAgencyId,
        egcs_cn_name_en: schema.en,
        egcs_cn_name_fr: schema.fr,
        egcs_cn_result: {
          1: 'Recommend approval',
          2: 'Recommend changes',
          3: 'Do not recommend'
        },
        egcs_cn_recommendationschema: {
          sections: [{
            key: 'recommendation',
            label: { en: 'Recommendation', fr: 'Recommandation' },
            subSections: [{
              key: 'recommendation-details',
              label: { en: 'Recommendation details', fr: 'Détails de la recommandation' },
              questions: [
                {
                  key: 'decision',
                  type: 'radio',
                  question: { en: 'What is your recommendation?', fr: 'Quelle est votre recommandation?' },
                  required: true,
                  isResult: true,
                  help: [{
                    key: 'decision-guidance',
                    title: { en: 'Decision guidance', fr: 'Directives décisionnelles' },
                    description: { en: 'Recommend only when the supporting evidence is complete, consistent, and demonstrates that all applicable conditions have been met.', fr: 'Recommandez seulement lorsque les pièces justificatives sont complètes et cohérentes et démontrent que toutes les conditions applicables sont respectées.' }
                  }],
                  options: [
                    { key: 'recommend', label: { en: 'Recommend', fr: 'Recommander' }, description: { en: 'The item is supported by the evidence and is ready to proceed.', fr: 'L’élément est étayé par les éléments probants et est prêt à aller de l’avant.' }, outcome: 'recommended' },
                    { key: 'do-not-recommend', label: { en: 'Do not recommend', fr: 'Ne pas recommander' }, description: { en: 'The available evidence does not support proceeding.', fr: 'Les éléments probants disponibles ne permettent pas d’aller de l’avant.' }, outcome: 'not_recommended' }
                  ]
                },
                {
                  key: 'evidence-quality',
                  type: 'radio',
                  question: { en: 'How complete is the supporting evidence?', fr: 'Dans quelle mesure les pièces justificatives sont-elles complètes?' },
                  required: true,
                  isResult: false,
                  help: [{
                    key: 'evidence-guidance',
                    title: { en: 'Evidence to consider', fr: 'Éléments probants à considérer' },
                    description: { en: 'Consider supporting records, applicable conditions, reporting, and any documented follow-up.', fr: 'Tenez compte des pièces justificatives, des conditions applicables, des rapports et de tout suivi documenté.' }
                  }],
                  options: [
                    { key: 'complete', label: { en: 'Complete', fr: 'Complètes' }, description: { en: 'All required evidence is present and internally consistent.', fr: 'Toutes les pièces requises sont présentes et cohérentes.' } },
                    { key: 'minor-gaps', label: { en: 'Minor gaps', fr: 'Lacunes mineures' }, description: { en: 'The evidence is sufficient, but minor details should be documented.', fr: 'Les pièces sont suffisantes, mais certains détails mineurs devraient être documentés.' } },
                    { key: 'material-gaps', label: { en: 'Material gaps', fr: 'Lacunes importantes' }, description: { en: 'Important evidence is missing or inconsistent and requires follow-up.', fr: 'Des pièces importantes sont manquantes ou incohérentes et nécessitent un suivi.' } }
                  ]
                },
                {
                  key: 'rationale',
                  type: 'text',
                  question: { en: 'Rationale', fr: 'Justification' },
                  description: { en: 'Explain the evidence and considerations supporting your recommendation.', fr: 'Expliquez les éléments probants et les considérations qui appuient votre recommandation.' },
                  required: true,
                  isResult: false,
                  help: [{
                    key: 'rationale-guidance',
                    title: { en: 'Writing a useful rationale', fr: 'Rédiger une justification utile' },
                    description: { en: 'Summarize the evidence reviewed, identify remaining risk, and explain how it supports your recommendation.', fr: 'Résumez les éléments probants examinés, indiquez tout risque résiduel et expliquez comment ils appuient votre recommandation.' }
                  }],
                  maxLength: 2000
                }
              ]
            }]
          }]
        }
      })
      .execute()
  }
}

async function seedTransferPaymentAbilities(db: Kysely<Database>): Promise<void> {
  // Seed transfer payment abilities for first 10 non-root roles.
  const roles = await db
    .selectFrom('role')
    .where('_deleted', '=', false)
    .where('name_en', '!=', 'Root Administrator')
    .select('id')
    .orderBy('id', 'asc')
    .limit(10)
    .execute()

  for (const role of roles) {
    await db.insertInto('role_permission').values({
      role_id: String(role.id), subject: 'transfer_payment', access_level: 'manager', can_manage_assignments: false, _deleted: false
    }).execute()
  }
}

async function seedAgreementAbilities(db: Kysely<Database>): Promise<void> {
  const roles = await db
    .selectFrom('role')
    .where('_deleted', '=', false)
    .where('name_en', '!=', 'Root Administrator')
    .select('id')
    .orderBy('id', 'asc')
    .limit(10)
    .execute()

  for (const role of roles) {
    await db.insertInto('role_permission').values({
      role_id: String(role.id), subject: 'agreement', access_level: 'manager', can_manage_assignments: true, _deleted: false
    }).execute()
  }
}

async function seedApplicantRecipientData(db: Kysely<Database>): Promise<void> {
  const subtypeRows = await db
    .selectFrom('Agency_Applicant_Recipient_Subtype')
    .innerJoin('Agency_Profile', 'Agency_Profile.id', 'Agency_Applicant_Recipient_Subtype.egcs_ay_organizationagency')
    .where('Agency_Applicant_Recipient_Subtype._deleted', '=', false)
    .where('Agency_Profile._deleted', '=', false)
    .select([
      'Agency_Applicant_Recipient_Subtype.id as subtypeId',
      'Agency_Profile.id as agencyId',
      'Agency_Profile.egcs_ay_name_en as agencyNameEn'
    ])
    .orderBy('Agency_Applicant_Recipient_Subtype.id', 'asc')
    .execute()

  const recipientSeeds = [
    { legalNameEn: 'Shopify Inc.', legalNameFr: 'Shopify Inc.', operatingNameEn: 'Shopify', operatingNameFr: 'Shopify', naics: 518210, status: 'active' },
    { legalNameEn: 'OpenText Corporation', legalNameFr: 'OpenText Corporation', operatingNameEn: 'OpenText', operatingNameFr: 'OpenText', naics: 511210, status: 'active' },
    { legalNameEn: 'CGI Inc.', legalNameFr: 'CGI Inc.', operatingNameEn: 'CGI', operatingNameFr: 'CGI', naics: 541512, status: 'active' },
    { legalNameEn: 'Constellation Software Inc.', legalNameFr: 'Constellation Software Inc.', operatingNameEn: 'Constellation Software', operatingNameFr: 'Constellation Software', naics: 511210, status: 'active' },
    { legalNameEn: 'BCE Inc.', legalNameFr: 'BCE Inc.', operatingNameEn: 'Bell Canada', operatingNameFr: 'Bell Canada', naics: 517111, status: 'active' },
    { legalNameEn: 'TELUS Corporation', legalNameFr: 'TELUS Corporation', operatingNameEn: 'TELUS', operatingNameFr: 'TELUS', naics: 517111, status: 'active' },
    { legalNameEn: 'Rogers Communications Inc.', legalNameFr: 'Rogers Communications Inc.', operatingNameEn: 'Rogers', operatingNameFr: 'Rogers', naics: 517111, status: 'active' },
    { legalNameEn: 'Loblaw Companies Limited', legalNameFr: 'Loblaw Companies Limited', operatingNameEn: 'Loblaw', operatingNameFr: 'Loblaw', naics: 445110, status: 'active' },
    { legalNameEn: 'Metro Inc.', legalNameFr: 'Metro Inc.', operatingNameEn: 'Metro', operatingNameFr: 'Metro', naics: 445110, status: 'active' },
    { legalNameEn: 'Saputo Inc.', legalNameFr: 'Saputo Inc.', operatingNameEn: 'Saputo', operatingNameFr: 'Saputo', naics: 311511, status: 'active' },
    { legalNameEn: 'Bombardier Inc.', legalNameFr: 'Bombardier Inc.', operatingNameEn: 'Bombardier', operatingNameFr: 'Bombardier', naics: 336411, status: 'active' },
    { legalNameEn: 'CAE Inc.', legalNameFr: 'CAE Inc.', operatingNameEn: 'CAE', operatingNameFr: 'CAE', naics: 611512, status: 'active' },
    { legalNameEn: 'WSP Global Inc.', legalNameFr: 'WSP Global Inc.', operatingNameEn: 'WSP', operatingNameFr: 'WSP', naics: 541330, status: 'active' },
    { legalNameEn: 'AtkinsRealis Group Inc.', legalNameFr: 'AtkinsRealis Group Inc.', operatingNameEn: 'AtkinsRealis', operatingNameFr: 'AtkinsRealis', naics: 541330, status: 'active' },
    { legalNameEn: 'Brookfield Asset Management Ltd.', legalNameFr: 'Brookfield Asset Management Ltd.', operatingNameEn: 'Brookfield', operatingNameFr: 'Brookfield', naics: 523930, status: 'active' },
    { legalNameEn: 'Canadian Tire Corporation, Limited', legalNameFr: 'Canadian Tire Corporation, Limited', operatingNameEn: 'Canadian Tire', operatingNameFr: 'Canadian Tire', naics: 452110, status: 'active' },
    { legalNameEn: 'Alimentation Couche-Tard Inc.', legalNameFr: 'Alimentation Couche-Tard Inc.', operatingNameEn: 'Couche-Tard', operatingNameFr: 'Couche-Tard', naics: 447110, status: 'active' },
    { legalNameEn: 'Dollarama Inc.', legalNameFr: 'Dollarama Inc.', operatingNameEn: 'Dollarama', operatingNameFr: 'Dollarama', naics: 452319, status: 'active' },
    { legalNameEn: 'Magna International Inc.', legalNameFr: 'Magna International Inc.', operatingNameEn: 'Magna', operatingNameFr: 'Magna', naics: 336390, status: 'active' },
    { legalNameEn: 'Thomson Reuters Corporation', legalNameFr: 'Thomson Reuters Corporation', operatingNameEn: 'Thomson Reuters', operatingNameFr: 'Thomson Reuters', naics: 519130, status: 'active' },
    { legalNameEn: 'Manulife Financial Corporation', legalNameFr: 'Manulife Financial Corporation', operatingNameEn: 'Manulife', operatingNameFr: 'Manulife', naics: 524113, status: 'active' },
    { legalNameEn: 'Sun Life Financial Inc.', legalNameFr: 'Sun Life Financial Inc.', operatingNameEn: 'Sun Life', operatingNameFr: 'Sun Life', naics: 524113, status: 'active' },
    { legalNameEn: 'Fairfax Financial Holdings Limited', legalNameFr: 'Fairfax Financial Holdings Limited', operatingNameEn: 'Fairfax', operatingNameFr: 'Fairfax', naics: 524126, status: 'inactive' },
    { legalNameEn: 'West Fraser Timber Co. Ltd.', legalNameFr: 'West Fraser Timber Co. Ltd.', operatingNameEn: 'West Fraser', operatingNameFr: 'West Fraser', naics: 321113, status: 'active' },
    { legalNameEn: 'Nutrien Ltd.', legalNameFr: 'Nutrien Ltd.', operatingNameEn: 'Nutrien', operatingNameFr: 'Nutrien', naics: 325311, status: 'active' },
    { legalNameEn: 'Emera Incorporated', legalNameFr: 'Emera Incorporated', operatingNameEn: 'Emera', operatingNameFr: 'Emera', naics: 221122, status: 'active' },
    { legalNameEn: 'Stantec Inc.', legalNameFr: 'Stantec Inc.', operatingNameEn: 'Stantec', operatingNameFr: 'Stantec', naics: 541330, status: 'active' },
    { legalNameEn: 'Kinaxis Inc.', legalNameFr: 'Kinaxis Inc.', operatingNameEn: 'Kinaxis', operatingNameFr: 'Kinaxis', naics: 511210, status: 'draft' },
    { legalNameEn: 'Lightspeed Commerce Inc.', legalNameFr: 'Lightspeed Commerce Inc.', operatingNameEn: 'Lightspeed', operatingNameFr: 'Lightspeed', naics: 511210, status: 'draft' },
    { legalNameEn: 'BlackBerry Limited', legalNameFr: 'BlackBerry Limited', operatingNameEn: 'BlackBerry', operatingNameFr: 'BlackBerry', naics: 334220, status: 'inactive' }
  ] as const

  const addressRows = await db
    .selectFrom('Common_Address')
    .where('_deleted', '=', false)
    .select('id')
    .orderBy('id', 'asc')
    .execute()

  for (const [index, recipient] of recipientSeeds.entries()) {
    const subtype = getRequiredAt(subtypeRows, index % subtypeRows.length, 'applicant recipient subtype')
    const businessNumber = Number(`9${String(index + 1).padStart(8, '0')}`)

    const applicantRecipient = await db
      .insertInto('Applicant_Recipient_Profile')
      .values({
        egcs_ar_description_en: `${recipient.operatingNameEn} applicant recipient profile seeded for UI and workflow testing.`,
        egcs_ar_description_fr: `Profil de ${recipient.operatingNameFr} initialise pour les essais d interface et de flux de travail.`,
        egcs_ar_operatingname_en: recipient.operatingNameEn,
        egcs_ar_operatingname_fr: recipient.operatingNameFr,
        egcs_ar_applicantrecipientsubtypes: String(subtype.subtypeId),
        egcs_ar_leadagency: String(subtype.agencyId),
        egcs_ar_legalname_en: recipient.legalNameEn,
        egcs_ar_legalname_fr: recipient.legalNameFr,
        egcs_ar_researchorganization_en: index % 6 === 0 ? `${recipient.operatingNameEn} Research` : undefined,
        egcs_ar_researchorganization_fr: index % 6 === 0 ? `Recherche ${recipient.operatingNameFr}` : undefined,
        egcs_ar_active: recipient.status === 'active',
        _deleted: false
      })
      .returning('id')
      .executeTakeFirstOrThrow()

    await db
      .insertInto('Applicant_Recipient_Registry')
      .values([
        {
          egcs_ar_applicantrecipient: applicantRecipient.id,
          egcs_ar_number: String(700000 + index + 1),
          egcs_ar_registry: 'provincialbusinessnumber'
        },
        {
          egcs_ar_applicantrecipient: applicantRecipient.id,
          egcs_ar_number: String(businessNumber),
          egcs_ar_registry: 'federalbusinessnumber'
        },
        {
          egcs_ar_applicantrecipient: applicantRecipient.id,
          egcs_ar_number: String(540000 + index + 1),
          egcs_ar_registry: 'naics'
        },
        ...(index % 5 === 0
          ? [{
              egcs_ar_applicantrecipient: applicantRecipient.id,
              egcs_ar_number: `8${String(index + 1).padStart(14, '0')}`,
              egcs_ar_registry: 'craprogramaccountnumber' as const
            }]
          : [])
      ])
      .execute()

    const address = addressRows[index % addressRows.length]
    if (address) {
      await db
        .insertInto('Applicant_Recipient_Address')
        .values({
          egcs_ar_applicantrecipient: String(applicantRecipient.id),
          egcs_ar_address: String(address.id),
          _deleted: false
        })
        .execute()
    }
  }
}

const seedAgreementApprovalSubmissionWorkflows = async (
  db: Kysely<Database>,
  streamId: string,
  agencyId: string,
  defaultUserId: string,
  reviewApprovalTemplateId: string,
  recommendationApprovalTemplateId: string
): Promise<void> => {
  const agencyStatusIds = await resolveAgencyStatusIds(db, agencyId)
  const targets = [
    {
      entityType: 'fundingcaseagreement' as const,
      labelEn: 'Agreement', labelFr: 'Entente', labelFrOf: 'l’entente',
      startStatus: 'inReview' as const, successStatus: 'active' as const,
      purpose: 'approval_submission' as const
    },
    {
      entityType: 'fundingcaseamendment' as const,
      labelEn: 'Amendment', labelFr: 'Modification', labelFrOf: 'la modification',
      startStatus: 'pendingApproval' as const, successStatus: 'closed' as const,
      purpose: 'approval_submission' as const
    },
    {
      entityType: 'fundingcaseagreementcloseout' as const,
      labelEn: 'Closeout', labelFr: 'Clôture', labelFrOf: 'la clôture',
      startStatus: 'inReview' as const, successStatus: 'closed' as const,
      purpose: 'approval_submission' as const
    }
  ]
  const recommendationDefinition = (labelEn: string, labelFr: string): RecommendationDefinition => ({
    sections: [{
      key: 'recommendation', label: { en: 'Recommendation', fr: 'Recommandation' },
      subSections: [{
        key: 'decision', label: { en: 'Decision', fr: 'Décision' },
        questions: [{
          key: 'decision', type: 'radio', required: true, isResult: true,
          question: { en: `Should the ${labelEn.toLocaleLowerCase()} proceed?`, fr: `La ${labelFr.toLocaleLowerCase('fr')} devrait-elle aller de l’avant?` },
          options: [
            {
              key: 'recommend', label: { en: 'Recommend', fr: 'Recommander' },
              description: {
                en: `The ${labelEn.toLocaleLowerCase()} is supported and ready to proceed.`,
                fr: `La ${labelFr.toLocaleLowerCase('fr')} est appuyée et prête à aller de l’avant.`
              },
              outcome: 'recommended'
            },
            {
              key: 'do-not-recommend', label: { en: 'Do not recommend', fr: 'Ne pas recommander' },
              description: {
                en: `The ${labelEn.toLocaleLowerCase()} requires changes before it can proceed.`,
                fr: `La ${labelFr.toLocaleLowerCase('fr')} doit être modifiée avant d’aller de l’avant.`
              },
              outcome: 'not_recommended'
            }
          ]
        }]
      }]
    }]
  })

  for (const target of targets) {
    const finalApprovalTemplate = await db.insertInto('Common_Approval_Template').values({
      egcs_cn_scopetype: 'transferpaymentstream', egcs_cn_scopeid: streamId,
      egcs_cn_name_en: `${target.labelEn} Final Approval`,
      egcs_cn_name_fr: `Approbation finale de ${target.labelFrOf}`,
      egcs_cn_description_en: `Final approval for the seeded ${target.labelEn.toLocaleLowerCase()} workflow.`,
      egcs_cn_description_fr: `Approbation finale du flux initialisé de ${target.labelFrOf}.`,
      _deleted: false
    }).returning('id').executeTakeFirstOrThrow()
    await db.insertInto('Common_Approval_Step').values({
      egcs_cn_sequence: 1,
      egcs_cn_name_en: `${target.labelEn} final decision`,
      egcs_cn_name_fr: `Décision finale de ${target.labelFrOf}`,
      egcs_cn_description_en: `Approve the completed ${target.labelEn.toLocaleLowerCase()} package.`,
      egcs_cn_description_fr: `Approuver le dossier complété de ${target.labelFrOf}.`,
      egcs_cn_approvaltemplate: String(finalApprovalTemplate.id),
      egcs_cn_defaultuser: defaultUserId, egcs_cn_approvertitle: 'Director'
    }).execute()

    const assessmentSchema = await db.insertInto('Common_Review_Schema').values({
      egcs_cn_reviewtype: 'assessment', egcs_cn_agency: agencyId, egcs_cn_entitytype: target.entityType,
      egcs_cn_name_en: `Quick ${target.labelEn} Assessment`,
      egcs_cn_name_fr: `Évaluation rapide de ${target.labelFrOf}`,
      egcs_cn_outcomename_en: `${target.labelEn} assessment outcome`,
      egcs_cn_outcomename_fr: `Résultat de l’évaluation de ${target.labelFrOf}`,
      egcs_cn_disablecustomoutcomes: false, egcs_cn_disablealignment: false, egcs_cn_disablereviewers: false,
      egcs_cn_scoringmatrix: [],
      egcs_cn_assessmentschema: { sections: [], sectionMatrix: [], outcomes: [] },
      _deleted: false
    }).returning('id').executeTakeFirstOrThrow()
    const checklistSchema = await db.insertInto('Common_Review_Schema').values({
      egcs_cn_reviewtype: 'checklist', egcs_cn_agency: agencyId, egcs_cn_entitytype: target.entityType,
      egcs_cn_name_en: `Quick ${target.labelEn} Checklist`,
      egcs_cn_name_fr: `Liste de contrôle rapide de ${target.labelFrOf}`,
      egcs_cn_outcomename_en: `${target.labelEn} checklist outcome`,
      egcs_cn_outcomename_fr: `Résultat de la liste de contrôle de ${target.labelFrOf}`,
      egcs_cn_disablecustomoutcomes: false, egcs_cn_disablealignment: false, egcs_cn_disablereviewers: false,
      egcs_cn_scoringmatrix: { pass: 1, fail: 0 },
      egcs_cn_assessmentschema: { title: `Quick ${target.labelEn} Checklist`, sections: [] },
      _deleted: false
    }).returning('id').executeTakeFirstOrThrow()
    await db.insertInto('Common_Checklist_Schema').values({
      egcs_cn_reviewschema: String(checklistSchema.id),
      egcs_cn_checklistschema: target.entityType === 'fundingcaseagreementcloseout'
        ? SEEDED_CLOSEOUT_CHECKLIST_DEFINITION
        : SEEDED_CHECKLIST_DEFINITION,
      _deleted: false
    }).execute()
    const reviewSet = await db.insertInto('Common_Review_Set_Setup').values({
      egcs_cn_scopetype: 'transferpaymentstream', egcs_cn_scopeid: streamId,
      egcs_cn_entitytype: target.entityType,
      egcs_cn_name_en: `Quick ${target.labelEn} Review Set`,
      egcs_cn_name_fr: `Ensemble de revues rapides de ${target.labelFrOf}`,
      egcs_cn_description_en: `A quick checklist and assessment for the seeded ${target.labelEn.toLocaleLowerCase()} workflow.`,
      egcs_cn_description_fr: `Une liste de contrôle et une évaluation rapides pour le flux initialisé de ${target.labelFrOf}.`,
      egcs_cn_order: 1, egcs_cn_sequential: true, _deleted: false
    }).returning('id').executeTakeFirstOrThrow()
    await db.insertInto('Common_Review_Setup').values([
      {
        egcs_cn_entitytype: target.entityType, egcs_cn_order: 1, egcs_cn_reviewset: String(reviewSet.id),
        egcs_cn_approvaltemplate: target.entityType === 'fundingcaseagreementcloseout' ? undefined : reviewApprovalTemplateId,
        egcs_cn_reviewschema: String(checklistSchema.id),
        egcs_cn_failonchecklistfailure: true, _deleted: false
      },
      {
        egcs_cn_entitytype: target.entityType, egcs_cn_order: 2, egcs_cn_reviewset: String(reviewSet.id),
        egcs_cn_approvaltemplate: target.entityType === 'fundingcaseagreementcloseout' ? undefined : reviewApprovalTemplateId,
        egcs_cn_reviewschema: String(assessmentSchema.id),
        _deleted: false
      }
    ]).execute()

    const recommendationSet = await db.insertInto('Common_Recommendation_Set_Setup').values({
      egcs_cn_scopetype: 'transferpaymentstream', egcs_cn_scopeid: streamId,
      egcs_cn_name_en: `${target.labelEn} Recommendation Set`,
      egcs_cn_name_fr: `Ensemble de recommandations de ${target.labelFrOf}`,
      egcs_cn_description_en: `Two sequential recommendations for the seeded ${target.labelEn.toLocaleLowerCase()} workflow.`,
      egcs_cn_description_fr: `Deux recommandations séquentielles pour le flux initialisé de ${target.labelFrOf}.`,
      _deleted: false
    }).returning('id').executeTakeFirstOrThrow()
    for (const order of [1, 2]) {
      const definition = recommendationDefinition(target.labelEn, target.labelFr)
      const schema = await db.insertInto('Common_Recommendation_Schema').values({
        egcs_cn_agency: agencyId,
        egcs_cn_name_en: `${target.labelEn} Recommendation ${order}`,
        egcs_cn_name_fr: `Recommandation ${order} de ${target.labelFrOf}`,
        egcs_cn_result: { recommended: 'Recommended', not_recommended: 'Not recommended' },
        egcs_cn_recommendationschema: definition, _deleted: false
      }).returning('id').executeTakeFirstOrThrow()
      await db.insertInto('Common_Recommendation_Setup').values({
        egcs_cn_order: order,
        egcs_cn_recommendationset: String(recommendationSet.id),
        egcs_cn_approvaltemplate: recommendationApprovalTemplateId,
        egcs_cn_recommendationschema: String(schema.id), _deleted: false
      }).execute()
    }

    await publishSeedWorkflowDependencies(db)
    const workflow = await db.insertInto('Common_Workflow_Setup').values({
      egcs_cn_scopetype: 'transferpaymentstream', egcs_cn_scopeid: streamId,
      egcs_cn_entitytype: target.entityType,
      egcs_cn_purpose: 'approval_submission',
      egcs_cn_name_en: `${target.labelEn} review and recommendation workflow`,
      egcs_cn_name_fr: `Flux de revue et de recommandation de ${target.labelFrOf}`,
      egcs_cn_description_en: 'Runs a quick checklist and assessment, two approved recommendations, and final approval.',
      egcs_cn_description_fr: 'Exécute une liste de contrôle et une évaluation rapides, deux recommandations approuvées et une approbation finale.',
      egcs_cn_cancellationstatus: agencyStatusIds.cancelled,
      egcs_cn_executionfailurestatus: agencyStatusIds.denied,
      egcs_cn_allowretry: true, _deleted: false
    }).returning('id').executeTakeFirstOrThrow()
    await insertWorkflowAllowedStartStatuses(db, String(workflow.id), [
      agencyStatusIds.draft,
      agencyStatusIds.denied
    ])
    await db.insertInto('Common_Workflow_Setup_Member').values([
      {
        egcs_cn_workflowsetup: String(workflow.id), egcs_cn_sequence: 1, egcs_cn_kind: 'review_set',
        egcs_cn_reviewset: String(reviewSet.id), egcs_cn_materializationstatus: agencyStatusIds[target.startStatus],
        egcs_cn_failurestatus: agencyStatusIds.denied, _deleted: false
      },
      {
        egcs_cn_workflowsetup: String(workflow.id), egcs_cn_sequence: 2, egcs_cn_kind: 'recommendation_set',
        egcs_cn_recommendationset: String(recommendationSet.id), egcs_cn_failurestatus: agencyStatusIds.denied, _deleted: false
      },
      {
        egcs_cn_workflowsetup: String(workflow.id), egcs_cn_sequence: 3, egcs_cn_kind: 'approval_template',
        egcs_cn_approvaltemplate: String(finalApprovalTemplate.id), egcs_cn_successstatus: agencyStatusIds[target.successStatus],
        egcs_cn_failurestatus: agencyStatusIds.denied, _deleted: false
      }
    ]).execute()
  }
}

const seedAgreementRiskRatingWorkflow = async (
  db: Kysely<Database>,
  streamId: string,
  agencyId: string
): Promise<void> => {
  const agencyStatusIds = await resolveAgencyStatusIds(db, agencyId)
  const scoringMatrix = [
    { max: 10, label: { en: 'Low', fr: 'Faible' }, indicator: '#16A34A' },
    { max: 25.5, label: { en: 'Moderate', fr: 'Modéré' }, indicator: '#EAB308' },
    { max: 75, label: { en: 'High', fr: 'Élevé' }, indicator: '#DC2626' }
  ]
  const assessmentSchema = await db.insertInto('Common_Review_Schema').values({
    egcs_cn_reviewtype: 'assessment',
    egcs_cn_agency: agencyId,
    egcs_cn_entitytype: 'fundingcaseagreement',
    egcs_cn_name_en: 'Agreement Risk Rating Assessment',
    egcs_cn_name_fr: 'Évaluation de la cote de risque de l’entente',
    egcs_cn_outcomename_en: 'Agreement risk score',
    egcs_cn_outcomename_fr: 'Pointage de risque de l’entente',
    egcs_cn_disablecustomoutcomes: true,
    egcs_cn_disablealignment: true,
    egcs_cn_disablereviewers: false,
    egcs_cn_scoringmatrix: sql`${JSON.stringify(scoringMatrix)}::jsonb`,
    egcs_cn_assessmentschema: {
      sectionMatrix: scoringMatrix,
      outcomes: [],
      sections: [{
        weight: 1,
        number: '1',
        label: { en: 'Overall Agreement Risk', fr: 'Risque global de l’entente' },
        name: 'overallAgreementRisk',
        icon: 'i-lucide-gauge',
        subSections: [{
          name: 'riskLevel',
          weight: { adjustable: false, weight: 1 },
          label: { en: 'Risk level', fr: 'Niveau de risque' },
          questions: [{
            type: 'question',
            name: 'overallRisk',
            question: {
              en: 'What is the Agreement’s overall risk level?',
              fr: 'Quel est le niveau de risque global de l’entente?'
            },
            weight: { adjustable: false, weight: 1 },
            commentThreshold: { min: 25.5, max: 75 },
            options: scoringMatrix.map(band => ({
              value: band.max,
              label: band.label,
              description: {
                en: `${band.label.en} Agreement risk`,
                fr: `Risque ${band.label.fr.toLocaleLowerCase('fr')} de l’entente`
              }
            })),
            help: []
          }]
        }]
      }]
    },
    _deleted: false
  }).returning('id').executeTakeFirstOrThrow()
  const reviewSet = await db.insertInto('Common_Review_Set_Setup').values({
    egcs_cn_scopetype: 'transferpaymentstream',
    egcs_cn_scopeid: streamId,
    egcs_cn_entitytype: 'fundingcaseagreement',
    egcs_cn_name_en: 'Agreement Risk Rating Review Set',
    egcs_cn_name_fr: 'Ensemble de revues de la cote de risque de l’entente',
    egcs_cn_description_en: 'Contains the authoritative assessment used to calculate the Agreement risk rating.',
    egcs_cn_description_fr: 'Contient l’évaluation officielle utilisée pour calculer la cote de risque de l’entente.',
    egcs_cn_order: 1,
    egcs_cn_sequential: true,
    _deleted: false
  }).returning('id').executeTakeFirstOrThrow()
  await db.insertInto('Common_Review_Setup').values({
    egcs_cn_entitytype: 'fundingcaseagreement',
    egcs_cn_order: 1,
    egcs_cn_reviewset: String(reviewSet.id),
    egcs_cn_reviewschema: String(assessmentSchema.id),
    _deleted: false
  }).execute()
  await publishSeedWorkflowDependencies(db)
  const workflow = await db.insertInto('Common_Workflow_Setup').values({
    egcs_cn_scopetype: 'transferpaymentstream',
    egcs_cn_scopeid: streamId,
    egcs_cn_entitytype: 'fundingcaseagreement',
    egcs_cn_purpose: 'risk_rating',
    egcs_cn_name_en: 'Agreement Risk Rating Workflow',
    egcs_cn_name_fr: 'Flux de cote de risque de l’entente',
    egcs_cn_description_en: 'Calculates the Agreement risk rating from one authoritative assessment.',
    egcs_cn_description_fr: 'Calcule la cote de risque de l’entente à partir d’une évaluation officielle.',
    egcs_cn_cancellationstatus: agencyStatusIds.cancelled,
    egcs_cn_executionfailurestatus: agencyStatusIds.denied,
    egcs_cn_allowretry: true,
    _deleted: false
  }).returning('id').executeTakeFirstOrThrow()
  await insertWorkflowAllowedStartStatuses(db, String(workflow.id), [
    agencyStatusIds.draft,
    agencyStatusIds.active,
    agencyStatusIds.denied
  ])
  await db.insertInto('Common_Workflow_Setup_Member').values({
    egcs_cn_workflowsetup: String(workflow.id),
    egcs_cn_sequence: 1,
    egcs_cn_kind: 'review_set',
    egcs_cn_reviewset: String(reviewSet.id),
    _deleted: false
  }).execute()
}

const seedAgreement51WorkflowCatalog = async (
  db: Kysely<Database>, streamId: string, agencyId: string, defaultUserId: string
): Promise<void> => {
  const agencyStatusIds = await resolveAgencyStatusIds(db, agencyId)
  const targets = [
    { entityType: 'fundingcaseagreement' as const, labelEn: 'Agreement', labelFr: 'Entente' },
    { entityType: 'fundingcaseagreementcloseout' as const, labelEn: 'Closeout', labelFr: 'Clôture' },
    { entityType: 'fundingcaseagreementclaim' as const, labelEn: 'Claim', labelFr: 'Réclamation' },
    { entityType: 'fundingclaimreconcile' as const, labelEn: 'Claim Reconciliation', labelFr: 'Rapprochement de réclamation' },
    { entityType: 'fundingcaseforecast' as const, labelEn: 'Forecast', labelFr: 'Prévision' },
    { entityType: 'fundingcasepayment' as const, labelEn: 'Payment', labelFr: 'Paiement' },
    { entityType: 'fundingcaseagreementcommitment' as const, labelEn: 'Commitment', labelFr: 'Engagement' }
  ]

  for (const target of targets) {
    const approvalTemplate = await db.insertInto('Common_Approval_Template').values({
      egcs_cn_scopetype: 'transferpaymentstream', egcs_cn_scopeid: streamId,
      egcs_cn_name_en: `${target.labelEn} standard workflow decision`,
      egcs_cn_name_fr: `Décision du flux standard - ${target.labelFr}`,
      egcs_cn_description_en: `Decision step for manually testing the seeded ${target.labelEn.toLocaleLowerCase()} standard workflow.`,
      egcs_cn_description_fr: `Étape de décision pour l’essai manuel du flux standard initialisé - ${target.labelFr.toLocaleLowerCase('fr')}.`,
      _deleted: false
    }).returning('id').executeTakeFirstOrThrow()
    await db.insertInto('Common_Approval_Step').values({
      egcs_cn_sequence: 1,
      egcs_cn_name_en: `${target.labelEn} standard workflow decision`,
      egcs_cn_name_fr: `Décision du flux standard - ${target.labelFr}`,
      egcs_cn_description_en: `Approve or deny the seeded ${target.labelEn.toLocaleLowerCase()} standard workflow.`,
      egcs_cn_description_fr: `Approuver ou refuser le flux standard initialisé - ${target.labelFr.toLocaleLowerCase('fr')}.`,
      egcs_cn_approvaltemplate: String(approvalTemplate.id), egcs_cn_defaultuser: defaultUserId,
      egcs_cn_approvertitle: 'Program Officer'
    }).execute()
    await publishSeedWorkflowDependencies(db)
    const workflow = await db.insertInto('Common_Workflow_Setup').values({
      egcs_cn_scopetype: 'transferpaymentstream', egcs_cn_scopeid: streamId,
      egcs_cn_entitytype: target.entityType, egcs_cn_purpose: 'standard',
      egcs_cn_name_en: `${target.labelEn} manual test workflow`,
      egcs_cn_name_fr: `Flux d’essai manuel - ${target.labelFr}`,
      egcs_cn_description_en: `A selectable standard workflow for exercising approval, denial, cancellation, and retry paths on the seeded ${target.labelEn.toLocaleLowerCase()}.`,
      egcs_cn_description_fr: `Un flux standard sélectionnable pour essayer les parcours d’approbation, de refus, d’annulation et de nouvelle tentative - ${target.labelFr.toLocaleLowerCase('fr')}.`,
      egcs_cn_cancellationstatus: agencyStatusIds.cancelled,
      egcs_cn_executionfailurestatus: agencyStatusIds.denied,
      egcs_cn_allowretry: true, _deleted: false
    }).returning('id').executeTakeFirstOrThrow()
    await insertWorkflowAllowedStartStatuses(db, String(workflow.id), [
      agencyStatusIds.draft, agencyStatusIds.inProgress, agencyStatusIds.active,
      agencyStatusIds.inReview, agencyStatusIds.pendingApproval, agencyStatusIds.approved,
      agencyStatusIds.denied
    ])
    await db.insertInto('Common_Workflow_Setup_Member').values({
      egcs_cn_workflowsetup: String(workflow.id), egcs_cn_sequence: 1,
      egcs_cn_kind: 'approval_template', egcs_cn_approvaltemplate: String(approvalTemplate.id),
      egcs_cn_failurestatus: agencyStatusIds.denied, _deleted: false
    }).execute()
  }

  for (const target of [
    { entityType: 'fundingcaseagreementclaim' as const, labelEn: 'Claim', labelFr: 'Réclamation', successStatus: agencyStatusIds.approved },
    { entityType: 'fundingcaseagreementcloseout' as const, labelEn: 'Closeout', labelFr: 'Clôture', successStatus: agencyStatusIds.closed }
  ]) {
    const approvalTemplate = await db.insertInto('Common_Approval_Template').values({
      egcs_cn_scopetype: 'transferpaymentstream', egcs_cn_scopeid: streamId,
      egcs_cn_name_en: `${target.labelEn} Approval Submission Template`,
      egcs_cn_name_fr: `Modèle de soumission pour approbation - ${target.labelFr}`,
      egcs_cn_description_en: `Final decision for the seeded ${target.labelEn.toLocaleLowerCase()} approval-submission workflow.`,
      egcs_cn_description_fr: `Décision finale du flux de soumission pour approbation initialisé - ${target.labelFr.toLocaleLowerCase('fr')}.`,
      _deleted: false
    }).returning('id').executeTakeFirstOrThrow()
    await db.insertInto('Common_Approval_Step').values({
      egcs_cn_sequence: 1, egcs_cn_name_en: `${target.labelEn} final approval`,
      egcs_cn_name_fr: `Approbation finale - ${target.labelFr}`,
      egcs_cn_description_en: `Approve the completed ${target.labelEn.toLocaleLowerCase()} package.`,
      egcs_cn_description_fr: `Approuver le dossier complété - ${target.labelFr.toLocaleLowerCase('fr')}.`,
      egcs_cn_approvaltemplate: String(approvalTemplate.id), egcs_cn_defaultuser: defaultUserId,
      egcs_cn_approvertitle: 'Director'
    }).execute()
    await publishSeedWorkflowDependencies(db)
    const workflow = await db.insertInto('Common_Workflow_Setup').values({
      egcs_cn_scopetype: 'transferpaymentstream', egcs_cn_scopeid: streamId,
      egcs_cn_entitytype: target.entityType, egcs_cn_purpose: 'approval_submission',
      egcs_cn_name_en: `${target.labelEn} completion and approval`,
      egcs_cn_name_fr: `Achèvement et approbation - ${target.labelFr}`,
      egcs_cn_description_en: `Completes the ${target.labelEn.toLocaleLowerCase()} and obtains its configured final approval.`,
      egcs_cn_description_fr: `Achève ${target.labelFr.toLocaleLowerCase('fr')} et obtient son approbation finale configurée.`,
      egcs_cn_cancellationstatus: agencyStatusIds.cancelled,
      egcs_cn_executionfailurestatus: agencyStatusIds.denied,
      egcs_cn_allowretry: true, _deleted: false
    }).returning('id').executeTakeFirstOrThrow()
    await insertWorkflowAllowedStartStatuses(db, String(workflow.id), [agencyStatusIds.draft, agencyStatusIds.denied])
    await db.insertInto('Common_Workflow_Setup_Member').values({
      egcs_cn_workflowsetup: String(workflow.id), egcs_cn_sequence: 1,
      egcs_cn_kind: 'approval_template', egcs_cn_approvaltemplate: String(approvalTemplate.id),
      egcs_cn_materializationstatus: agencyStatusIds.inReview,
      egcs_cn_successstatus: target.successStatus, egcs_cn_failurestatus: agencyStatusIds.denied,
      _deleted: false
    }).execute()
  }
}

async function seedTransferPaymentData(db: Kysely<Database>): Promise<void> {
  const agencies = await db
    .selectFrom('Agency_Profile')
    .where('_deleted', '=', false)
    .select(['id', 'egcs_ay_name_en', 'egcs_ay_name_fr'])
    .execute()

  await sql`
    CREATE TABLE IF NOT EXISTS extensions.gcs_gcforms_credentials (
      id bigserial PRIMARY KEY,
      agency_id bigint NOT NULL REFERENCES "Agency_Profile"(id) ON DELETE restrict,
      name_en varchar(200) NOT NULL,
      name_fr varchar(200) NOT NULL,
      key_id varchar(200) NOT NULL,
      user_id varchar(200) NOT NULL,
      form_id varchar(80) NOT NULL,
      created_at timestamptz DEFAULT now() NOT NULL,
      updated_at timestamptz,
      _deleted boolean DEFAULT false NOT NULL
    )
  `.execute(db)

  for (const agency of agencies) {
    const agencyStatusIds = await resolveAgencyStatusIds(db, String(agency.id))
    const profile = await db
      .insertInto('Transfer_Payment_Profile')
      .values({
        egcs_tp_agency: String(agency.id),
        egcs_tp_datestart: new Date('2026-04-01T00:00:00Z'),
        egcs_tp_dateend: new Date('2027-03-31T23:59:59Z'),
        egcs_tp_name_en: `${agency.egcs_ay_name_en} Transfer Payment`,
        egcs_tp_name_fr: `Programme de paiements de transfert ${agency.egcs_ay_name_fr}`,
        egcs_tp_abbreviation_en: `${agency.egcs_ay_name_en.slice(0, 8)} TP`,
        egcs_tp_abbreviation_fr: `${agency.egcs_ay_name_fr.slice(0, 8)} TP`,
        egcs_tp_description_en: `Transfer payment program for ${agency.egcs_ay_name_en}.`,
        egcs_tp_description_fr: `Programme de paiements de transfert pour ${agency.egcs_ay_name_fr}.`,
        egcs_tp_purpose_en: `Purpose for ${agency.egcs_ay_name_en} transfer payment program.`,
        egcs_tp_purpose_fr: `Objectif du programme de paiements de transfert pour ${agency.egcs_ay_name_fr}.`,
        egcs_tp_tclink: 'https://example.com/terms',
        egcs_tp_active: true
      })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const fiscalYear = await db
      .selectFrom('Agency_Fiscal_Year')
      .where('egcs_ay_organizationagency', '=', String(agency.id))
      .where('_deleted', '=', false)
      .select('id')
      .orderBy('id', 'asc')
      .executeTakeFirst()

    const programBudget = fiscalYear
      ? await db
        .insertInto('Transfer_Payment_Fiscal_Year_Budget')
        .values({
          egcs_tp_transferpaymentprofile: String(profile.id),
          egcs_tp_fiscalyear: String(fiscalYear.id),
          egcs_tp_totalbudget: seedMoney('99.99'),
          egcs_tp_overcommitthreshold: 0.1
        })
        .returning('id')
        .executeTakeFirstOrThrow()
      : null

    const stream = await db
      .insertInto('Transfer_Payment_Stream')
      .values({
        egcs_tp_transferpaymentprofile: String(profile.id),
        egcs_tp_parentstream: null,
        egcs_tp_name_en: 'Core Stream',
        egcs_tp_name_fr: 'Volet principal',
        egcs_tp_description_en: 'Primary delivery stream',
        egcs_tp_description_fr: 'Volet principal de prestation',
        egcs_tp_abbreviation_en: 'CORE',
        egcs_tp_abbreviation_fr: 'COEUR',
        egcs_tp_objective_en: 'Deliver core funding outcomes.',
        egcs_tp_objective_fr: 'Fournir les resultats de financement principaux.',
        egcs_tp_allowsfurtherdistribution: false,
        egcs_tp_active: true
      })
      .returning('id')
      .executeTakeFirstOrThrow()

    const agencyCostLineItems = await db
      .selectFrom('Agency_Cost_Category_Line_Item')
      .innerJoin(
        'Agency_Cost_Category',
        'Agency_Cost_Category.id',
        'Agency_Cost_Category_Line_Item.egcs_ay_organizationcostcategory'
      )
      .where('Agency_Cost_Category.egcs_ay_organizationagency', '=', String(agency.id))
      .where('Agency_Cost_Category_Line_Item._deleted', '=', false)
      .where('Agency_Cost_Category._deleted', '=', false)
      .select('Agency_Cost_Category_Line_Item.id as id')
      .orderBy('Agency_Cost_Category_Line_Item.id', 'asc')
      .execute()

    if (agencyCostLineItems.length > 0) {
      await db
        .insertInto('Transfer_Payment_Stream_Cost_Category_Line_Item')
        .values(agencyCostLineItems.map(lineItem => ({
          egcs_tp_transferpaymentstream: String(stream.id),
          egcs_tp_organizationcostcategory: String(lineItem.id),
          egcs_tp_costsharingratio: 0.75,
          _deleted: false
        })))
        .execute()
    }

    await db
      .insertInto('Transfer_Payment_Stream_Risk_Rating')
      .values([
        {
          egcs_tp_transferpaymentstream: String(stream.id),
          egcs_tp_riskscore: 10,
          egcs_tp_name_en: 'Low',
          egcs_tp_name_fr: 'Faible',
          _deleted: false
        },
        {
          egcs_tp_transferpaymentstream: String(stream.id),
          egcs_tp_riskscore: 25.5,
          egcs_tp_name_en: 'Moderate',
          egcs_tp_name_fr: 'Moderee',
          _deleted: false
        },
        {
          egcs_tp_transferpaymentstream: String(stream.id),
          egcs_tp_riskscore: 75,
          egcs_tp_name_en: 'High',
          egcs_tp_name_fr: 'Elevee',
          _deleted: false
        }
      ])
      .execute()

    await db.insertInto('Transfer_Payment_Stream_Commitment_Type').values([
      { egcs_tp_transferpaymentstream: String(stream.id), egcs_tp_name_en: 'Commitment', egcs_tp_name_fr: 'Engagement', _deleted: false },
      { egcs_tp_transferpaymentstream: String(stream.id), egcs_tp_name_en: 'PAYE', egcs_tp_name_fr: 'PAYE', _deleted: false },
      { egcs_tp_transferpaymentstream: String(stream.id), egcs_tp_name_en: 'PAYE2', egcs_tp_name_fr: 'PAYE2', _deleted: false },
      { egcs_tp_transferpaymentstream: String(stream.id), egcs_tp_name_en: 'PYP', egcs_tp_name_fr: 'PYP', _deleted: false }
    ]).execute()

    if (String(stream.id) === '31') {
      const outcomeRows = await db
        .insertInto('Transfer_Payment_Outcome')
        .values(STREAM_31_OUTCOME_SEEDS.map(outcome => ({
          egcs_tp_transferpaymentprofile: String(profile.id),
          egcs_tp_name_en: outcome.nameEn,
          egcs_tp_name_fr: outcome.nameFr,
          egcs_tp_description_en: outcome.descriptionEn,
          egcs_tp_description_fr: outcome.descriptionFr,
          _deleted: false
        })))
        .returning('id')
        .execute()

      await db
        .insertInto('Transfer_Payment_Stream_Outcome')
        .values(outcomeRows.map(outcome => ({
          egcs_tp_transferpaymentstream: String(stream.id),
          egcs_tp_transferpaymentoutcome: String(outcome.id),
          _deleted: false
        })))
        .execute()

      const agencyFiscalYears = await db
        .selectFrom('Agency_Fiscal_Year')
        .where('egcs_ay_organizationagency', '=', String(agency.id))
        .where('_deleted', '=', false)
        .select(['id', 'egcs_ay_fiscalyear'])
        .orderBy('egcs_ay_fiscalyear', 'asc')
        .execute()

      const streamBudgetSeeds = await Promise.all(agencyFiscalYears.slice(0, 2).map(async (agencyFiscalYear, budgetIndex) => {
        const transferPaymentBudget = budgetIndex === 0 && programBudget
          ? programBudget
          : await db
            .insertInto('Transfer_Payment_Fiscal_Year_Budget')
            .values({
              egcs_tp_transferpaymentprofile: String(profile.id),
              egcs_tp_fiscalyear: String(agencyFiscalYear.id),
              egcs_tp_totalbudget: seedMoney(budgetIndex === 0 ? '99.99' : '95.00'),
              egcs_tp_overcommitthreshold: 0.1,
              _deleted: false
            })
            .returning('id')
            .executeTakeFirstOrThrow()

        const streamBudget = await db
          .insertInto('Transfer_Payment_Stream_Budget')
          .values({
            egcs_tp_transferpaymentstream: String(stream.id),
            egcs_tp_totalbudget: seedMoney(budgetIndex === 0 ? '75.00' : '90.00'),
            egcs_tp_transferpaymentbudget: String(transferPaymentBudget.id),
            egcs_tp_overcommitthreshold: 0.1,
            _deleted: false
          })
          .returning('id')
          .executeTakeFirstOrThrow()

        const streamCommitmentSeeds = [
            {
              egcs_tp_transferpaymentstream: String(stream.id),
              egcs_tp_streambudget: String(streamBudget.id),
              egcs_tp_fund: 110 + budgetIndex,
              egcs_tp_gl: 51110 + budgetIndex * 100,
              egcs_tp_fundcentre: 22010 + budgetIndex * 100,
              egcs_tp_internalorder: 33010 + budgetIndex * 100,
              egcs_tp_functionalarea: 44010 + budgetIndex * 100,
              egcs_tp_costcentre: 55010 + budgetIndex * 100,
              _deleted: false
            },
            {
              egcs_tp_transferpaymentstream: String(stream.id),
              egcs_tp_streambudget: String(streamBudget.id),
              egcs_tp_fund: 110 + budgetIndex,
              egcs_tp_gl: 51120 + budgetIndex * 100,
              egcs_tp_fundcentre: 22020 + budgetIndex * 100,
              egcs_tp_internalorder: 33020 + budgetIndex * 100,
              egcs_tp_functionalarea: 44020 + budgetIndex * 100,
              egcs_tp_costcentre: 55020 + budgetIndex * 100,
              _deleted: false
            },
            {
              egcs_tp_transferpaymentstream: String(stream.id),
              egcs_tp_streambudget: String(streamBudget.id),
              egcs_tp_fund: 110 + budgetIndex,
              egcs_tp_gl: 51130 + budgetIndex * 100,
              egcs_tp_fundcentre: 22030 + budgetIndex * 100,
              egcs_tp_internalorder: 33030 + budgetIndex * 100,
              egcs_tp_functionalarea: 44030 + budgetIndex * 100,
              egcs_tp_costcentre: 55030 + budgetIndex * 100,
              _deleted: false
            }
          ]
        await db
          .insertInto('Transfer_Payment_Stream_Chart_of_Account')
          .values(streamCommitmentSeeds.map(commitment => ({
            egcs_tp_transferpaymentstream: String(stream.id),
            egcs_tp_streambudget: String(streamBudget.id),
            egcs_tp_accountingdimensions: sql`${JSON.stringify([
              { label_en: 'Fund', label_fr: 'Fonds', value: String(commitment.egcs_tp_fund) },
              { label_en: 'G/L', label_fr: 'G/L', value: String(commitment.egcs_tp_gl) },
              { label_en: 'Fund Centre', label_fr: 'Centre financier', value: String(commitment.egcs_tp_fundcentre) },
              { label_en: 'Internal Order', label_fr: 'Ordre interne', value: String(commitment.egcs_tp_internalorder) },
              { label_en: 'Functional Area', label_fr: 'Domaine fonctionnel', value: String(commitment.egcs_tp_functionalarea) },
              { label_en: 'Cost Centre', label_fr: 'Centre de coûts', value: String(commitment.egcs_tp_costcentre) }
            ] satisfies JsonValue)}::jsonb`,
            _deleted: false
          })))
          .execute()

        return { streamBudgetId: String(streamBudget.id) }
      }))

      await db
        .insertInto('extensions.agency_enablement')
        .values({
          extension_key: GCFORMS_EXTENSION_KEY,
          agency_id: String(agency.id),
          enabled: true,
          config: {
            apiUrl: GCFORMS_LOCAL_CLAIMS_API_URL,
            identityProviderUrl: GCFORMS_LOCAL_CLAIMS_IDP_URL,
            confirmSubmissions: false,
            submissionStatusId: agencyStatusIds.draft
          } satisfies JsonValue,
          _deleted: false
        })
        .execute()

      const gcFormsCredential = await db
        .insertInto('extensions.gcs_gcforms_credentials')
        .values({
          agency_id: String(agency.id),
          name_en: 'Local claims GC Forms',
          name_fr: 'Reclamations locales GC Forms',
          key_id: GCFORMS_LOCAL_CLAIMS_KEY_ID,
          user_id: GCFORMS_LOCAL_CLAIMS_USER_ID,
          form_id: GCFORMS_LOCAL_CLAIMS_FORM_ID
        })
        .returning('id')
        .executeTakeFirstOrThrow()

      await setEncryptedExtensionSecret(db, {
        rootKey: process.env.GCS_EXTENSION_SECRETS_KEY ?? DEV_EXTENSION_SECRETS_KEY,
        extensionKey: GCFORMS_EXTENSION_KEY,
        ownerType: 'agency',
        ownerId: String(agency.id),
        secretKey: String(gcFormsCredential.id),
        value: {
          key: GCFORMS_LOCAL_CLAIMS_PRIVATE_KEY
        },
        metadata: {
          credentialId: String(gcFormsCredential.id)
        }
      })

      await db
        .insertInto('extensions.stream_configuration')
        .values({
          extension_key: GCFORMS_EXTENSION_KEY,
          stream_id: String(stream.id),
          enabled: true,
          config: {
            credentialId: String(gcFormsCredential.id),
            mappings: [...GCFORMS_LOCAL_CLAIMS_MAPPINGS]
          } satisfies JsonValue,
          _deleted: false
        })
        .execute()

      await db.insertInto('extensions.agency_enablement').values([
        { extension_key: AUTOMATED_PAYMENTS_EXTENSION_KEY, agency_id: String(agency.id), enabled: true, config: {}, _deleted: false },
        { extension_key: OUTCOME_COST_ALLOCATION_EXTENSION_KEY, agency_id: String(agency.id), enabled: true, config: {}, _deleted: false }
      ]).execute()
      await db.insertInto('extensions.stream_configuration').values([
        {
          extension_key: AUTOMATED_PAYMENTS_EXTENSION_KEY,
          stream_id: String(stream.id),
          enabled: true,
          config: { enabledPaymentTypes: ['reimbursement', 'advance'] },
          _deleted: false
        },
        {
          extension_key: OUTCOME_COST_ALLOCATION_EXTENSION_KEY,
          stream_id: String(stream.id),
          enabled: true,
          config: { enabledCommitmentTypes: [], mappings: [] },
          _deleted: false
        }
      ]).execute()
    }

    if (String(stream.id) === '33') {
      await db.insertInto('extensions.agency_enablement').values([
        { extension_key: NARRATIVE_TAGS_EXTENSION_KEY, agency_id: String(agency.id), enabled: true, config: {}, _deleted: false },
        { extension_key: NARRATIVE_QUALITY_EXTENSION_KEY, agency_id: String(agency.id), enabled: true, config: {}, _deleted: false }
      ]).execute()
      await db.insertInto('extensions.stream_configuration').values([
        {
          extension_key: NARRATIVE_TAGS_EXTENSION_KEY,
          stream_id: String(stream.id),
          enabled: true,
          config: { enabled: true },
          _deleted: false
        },
        {
          extension_key: NARRATIVE_QUALITY_EXTENSION_KEY,
          stream_id: String(stream.id),
          enabled: true,
          config: { agreementTopLevel: { enabled: true } },
          _deleted: false
        }
      ]).execute()
    }

    let approvalTemplate = await db
      .selectFrom('Common_Approval_Template')
      .select('id')
      .where('egcs_cn_scopetype', '=', 'transferpaymentstream')
      .where('egcs_cn_scopeid', '=', String(stream.id))
      .where('egcs_cn_name_en', '=', 'Transfer Payment Approval Template')
      .where('_deleted', '=', false)
      .orderBy('id', 'asc')
      .executeTakeFirst()

    const seededDefaultUser = await db
      .selectFrom('Common_User')
      .select('id')
      .where('_deleted', '=', false)
      .orderBy('id', 'asc')
      .executeTakeFirstOrThrow()

    const seededAdvanceAssessmentDefaultUser = await db
      .selectFrom('Common_User')
      .select('id')
      .where('egcs_cn_email', '=', 'user11@example.com')
      .where('_deleted', '=', false)
      .executeTakeFirstOrThrow()

    if (!approvalTemplate) {
      approvalTemplate = await db
        .insertInto('Common_Approval_Template')
        .values({
          egcs_cn_scopetype: 'transferpaymentstream',
          egcs_cn_scopeid: String(stream.id),
          egcs_cn_name_en: 'Transfer Payment Approval Template',
          egcs_cn_name_fr: "Modèle d'approbation de paiement de transfert",
          egcs_cn_description_en: 'Seeded approval template for transfer payment workflows.',
          egcs_cn_description_fr: "Modèle d'approbation initial pour les flux de paiements de transfert.",
          _deleted: false
        })
        .returning('id')
        .executeTakeFirstOrThrow()

      const seededApprovalStep = await db
        .insertInto('Common_Approval_Step')
        .values({
          egcs_cn_sequence: 1,
          egcs_cn_name_en: 'Seeded Approval Step',
          egcs_cn_name_fr: "Étape d'approbation initiale",
          egcs_cn_description_en: 'Seeded approval step for transfer payment workflows.',
          egcs_cn_description_fr: "Étape d'approbation initiale pour les flux de paiements de transfert.",
          egcs_cn_approvaltemplate: String(approvalTemplate.id),
          egcs_cn_defaultuser: String(seededDefaultUser.id),
          egcs_cn_approvertitle: 'Director'
        })
        .returning('id')
        .executeTakeFirstOrThrow()

      await db
        .insertInto('Common_Certification')
        .values({
          egcs_cn_order: 1,
          egcs_cn_name_en: 'Seeded Certification',
          egcs_cn_name_fr: 'Certification initiale',
          egcs_cn_description_en: 'Seeded certification for transfer payment workflows.',
          egcs_cn_description_fr: 'Certification initiale pour les flux de paiements de transfert.',
          egcs_cn_optional: false,
          egcs_cn_certification_en: 'I confirm the seeded certification.',
          egcs_cn_certification_fr: 'Je confirme la certification initiale.',
          egcs_cn_approvalstep: String(seededApprovalStep.id)
        })
        .execute()
    }

    let commonReviewApprovalTemplate = await db
      .selectFrom('Common_Approval_Template')
      .select('id')
      .where('egcs_cn_scopetype', '=', 'transferpaymentstream')
      .where('egcs_cn_scopeid', '=', String(stream.id))
      .where('egcs_cn_name_en', '=', 'Common Review Approval Template')
      .where('_deleted', '=', false)
      .orderBy('id', 'asc')
      .executeTakeFirst()

    if (!commonReviewApprovalTemplate) {
      commonReviewApprovalTemplate = await db
        .insertInto('Common_Approval_Template')
        .values({
          egcs_cn_scopetype: 'transferpaymentstream',
          egcs_cn_scopeid: String(stream.id),
          egcs_cn_name_en: 'Common Review Approval Template',
          egcs_cn_name_fr: "Modèle d'approbation pour revue commune",
          egcs_cn_description_en: 'Seeded approval template for stream-scoped common review workflows.',
          egcs_cn_description_fr: "Modèle d'approbation initial pour les flux de revue commune liés au volet.",
          _deleted: false
        })
        .returning('id')
        .executeTakeFirstOrThrow()

      const commonReviewInitialStep = await db
        .insertInto('Common_Approval_Step')
        .values({
          egcs_cn_sequence: 1,
          egcs_cn_name_en: 'Program Intake Review',
          egcs_cn_name_fr: 'Examen initial du programme',
          egcs_cn_description_en: 'Confirms the review package is complete before detailed analysis begins.',
          egcs_cn_description_fr: "Confirme que le dossier de revue est complet avant le début de l'analyse détaillée.",
          egcs_cn_approvaltemplate: String(commonReviewApprovalTemplate.id),
          egcs_cn_defaultuser: String(seededAdvanceAssessmentDefaultUser.id),
          egcs_cn_approvertitle: 'Manager'
        })
        .returning('id')
        .executeTakeFirstOrThrow()

      await db
        .insertInto('Common_Certification')
        .values([
          {
            egcs_cn_order: 1,
            egcs_cn_name_en: 'Evidence package confirmed',
            egcs_cn_name_fr: 'Dossier de preuves confirmé',
            egcs_cn_description_en: 'Confirms supporting evidence is attached and legible.',
            egcs_cn_description_fr: 'Confirme que les pièces justificatives sont jointes et lisibles.',
            egcs_cn_optional: false,
            egcs_cn_certification_en: 'I confirm the review evidence package is complete and ready for assessment.',
            egcs_cn_certification_fr: "Je confirme que le dossier de preuves de la revue est complet et prêt pour l'évaluation.",
            egcs_cn_approvalstep: String(commonReviewInitialStep.id)
          },
          {
            egcs_cn_order: 2,
            egcs_cn_name_en: 'Conflict check completed',
            egcs_cn_name_fr: 'Vérification des conflits terminée',
            egcs_cn_description_en: 'Confirms conflict-of-interest screening was performed for assigned reviewers.',
            egcs_cn_description_fr: "Confirme que le contrôle des conflits d'intérêts a été effectué pour les réviseurs assignés.",
            egcs_cn_optional: false,
            egcs_cn_certification_en: 'I confirm that conflict-of-interest checks have been completed for this review.',
            egcs_cn_certification_fr: "Je confirme que les vérifications des conflits d'intérêts ont été complétées pour cette revue.",
            egcs_cn_approvalstep: String(commonReviewInitialStep.id)
          }
        ])
        .execute()

      const commonReviewDecisionStep = await db
        .insertInto('Common_Approval_Step')
        .values({
          egcs_cn_sequence: 2,
          egcs_cn_name_en: 'Executive Decision Review',
          egcs_cn_name_fr: 'Examen de décision de la direction',
          egcs_cn_description_en: 'Captures the final management approval for the completed common review.',
          egcs_cn_description_fr: "Consigne l'approbation finale de la direction pour la revue commune complétée.",
          egcs_cn_approvaltemplate: String(commonReviewApprovalTemplate.id),
          egcs_cn_defaultuser: String(seededAdvanceAssessmentDefaultUser.id),
          egcs_cn_approvertitle: 'Director'
        })
        .returning('id')
        .executeTakeFirstOrThrow()

      await db
        .insertInto('Common_Certification')
        .values([
          {
            egcs_cn_order: 1,
            egcs_cn_name_en: 'Recommendation reviewed',
            egcs_cn_name_fr: 'Recommandation examinée',
            egcs_cn_description_en: 'Confirms the review recommendation and rationale have been examined.',
            egcs_cn_description_fr: 'Confirme que la recommandation de revue et sa justification ont été examinées.',
            egcs_cn_optional: false,
            egcs_cn_certification_en: 'I confirm the recommendation and supporting rationale have been reviewed.',
            egcs_cn_certification_fr: 'Je confirme que la recommandation et sa justification ont été examinées.',
            egcs_cn_approvalstep: String(commonReviewDecisionStep.id)
          },
          {
            egcs_cn_order: 2,
            egcs_cn_name_en: 'Conditions acknowledged',
            egcs_cn_name_fr: 'Conditions reconnues',
            egcs_cn_description_en: 'Confirms any conditions or follow-up actions are documented.',
            egcs_cn_description_fr: 'Confirme que toute condition ou mesure de suivi est documentée.',
            egcs_cn_optional: true,
            egcs_cn_certification_en: 'I acknowledge any conditions or follow-up actions captured in this review.',
            egcs_cn_certification_fr: 'Je reconnais toute condition ou mesure de suivi consignée dans cette revue.',
            egcs_cn_approvalstep: String(commonReviewDecisionStep.id)
          }
        ])
        .execute()
    }

    await db
      .updateTable('Common_Approval_Template')
      .set({
        egcs_cn_allowadditionalapprovals: true,
        egcs_cn_defaultaddedapprovalname_en: 'Additional Approval',
        egcs_cn_defaultaddedapprovalname_fr: 'Approbation supplémentaire',
        egcs_cn_allowaddedapprovalnamechanges: true,
        egcs_cn_allowaddedapprovalcertificationchanges: true
      })
      .where('id', '=', String(commonReviewApprovalTemplate.id))
      .execute()

    const existingAdditionalApprovalCertification = await db
      .selectFrom('Common_Certification')
      .select('id')
      .where('egcs_cn_approvaltemplate', '=', String(commonReviewApprovalTemplate.id))
      .where('_deleted', '=', false)
      .executeTakeFirst()
    if (!existingAdditionalApprovalCertification) {
      await db
        .insertInto('Common_Certification')
        .values({
          egcs_cn_order: 1,
          egcs_cn_name_en: 'Approval record reviewed',
          egcs_cn_name_fr: 'Dossier d’approbation examiné',
          egcs_cn_description_en: 'Confirms the approval record and supporting information have been reviewed.',
          egcs_cn_description_fr: "Confirme que le dossier d’approbation et les renseignements à l’appui ont été examinés.",
          egcs_cn_optional: false,
          egcs_cn_certification_en: 'I confirm that I reviewed the approval record and its supporting information.',
          egcs_cn_certification_fr: "Je confirme avoir examiné le dossier d’approbation et les renseignements à l’appui.",
          egcs_cn_approvaltemplate: String(commonReviewApprovalTemplate.id),
          _deleted: false
        })
        .execute()
    }

    let commitmentApprovalTemplate = await db
      .selectFrom('Common_Approval_Template')
      .select('id')
      .where('egcs_cn_scopetype', '=', 'transferpaymentstream')
      .where('egcs_cn_scopeid', '=', String(stream.id))
      .where('egcs_cn_name_en', '=', 'Agreement Commitment Approval Template')
      .where('_deleted', '=', false)
      .orderBy('id', 'asc')
      .executeTakeFirst()

    if (!commitmentApprovalTemplate) {
      commitmentApprovalTemplate = await db
        .insertInto('Common_Approval_Template')
        .values({
          egcs_cn_scopetype: 'transferpaymentstream',
          egcs_cn_scopeid: String(stream.id),
          egcs_cn_name_en: 'Agreement Commitment Approval Template',
          egcs_cn_name_fr: "Modèle d'approbation des engagements d'entente",
          egcs_cn_description_en: 'Seeded approval template for funding agreement commitment workflows.',
          egcs_cn_description_fr: "Modèle d'approbation initial pour les flux d'engagements d'entente de financement.",
          _deleted: false
        })
        .returning('id')
        .executeTakeFirstOrThrow()

      const commitmentVerificationStep = await db
        .insertInto('Common_Approval_Step')
        .values({
          egcs_cn_sequence: 1,
          egcs_cn_name_en: 'Commitment Verification Review',
          egcs_cn_name_fr: "Examen de vérification de l'engagement",
          egcs_cn_description_en: 'Confirms the commitment lines and coding are complete before financial approval.',
          egcs_cn_description_fr: "Confirme que les lignes d'engagement et le codage sont complets avant l'approbation financière.",
          egcs_cn_approvaltemplate: String(commitmentApprovalTemplate.id),
          egcs_cn_defaultuser: String(seededAdvanceAssessmentDefaultUser.id),
          egcs_cn_approvertitle: 'Manager'
        })
        .returning('id')
        .executeTakeFirstOrThrow()

      await db
        .insertInto('Common_Certification')
        .values([
          {
            egcs_cn_order: 1,
            egcs_cn_name_en: 'Commitment lines verified',
            egcs_cn_name_fr: "Lignes d'engagement vérifiées",
            egcs_cn_description_en: 'Confirms the commitment line details are complete and accurate.',
            egcs_cn_description_fr: "Confirme que les détails des lignes d'engagement sont complets et exacts.",
            egcs_cn_optional: false,
            egcs_cn_certification_en: 'I confirm the commitment lines and coding details have been reviewed.',
            egcs_cn_certification_fr: "Je confirme que les lignes d'engagement et les détails de codage ont été examinés.",
            egcs_cn_approvalstep: String(commitmentVerificationStep.id)
          },
          {
            egcs_cn_order: 2,
            egcs_cn_name_en: 'Financial coding confirmed',
            egcs_cn_name_fr: 'Codage financier confirmé',
            egcs_cn_description_en: 'Confirms the financial coding aligns with the stream commitments.',
            egcs_cn_description_fr: 'Confirme que le codage financier correspond aux engagements du volet.',
            egcs_cn_optional: false,
            egcs_cn_certification_en: 'I confirm the financial coding aligns with the stream commitment setup.',
            egcs_cn_certification_fr: "Je confirme que le codage financier correspond à la configuration des engagements du volet.",
            egcs_cn_approvalstep: String(commitmentVerificationStep.id)
          }
        ])
        .execute()

      const commitmentFinalApprovalStep = await db
        .insertInto('Common_Approval_Step')
        .values({
          egcs_cn_sequence: 2,
          egcs_cn_name_en: 'Commitment Final Approval',
          egcs_cn_name_fr: "Approbation finale de l'engagement",
          egcs_cn_description_en: 'Captures the final management approval for the completed agreement commitment.',
          egcs_cn_description_fr: "Consigne l'approbation finale de la direction pour l'engagement d'entente complété.",
          egcs_cn_approvaltemplate: String(commitmentApprovalTemplate.id),
          egcs_cn_defaultuser: String(seededAdvanceAssessmentDefaultUser.id),
          egcs_cn_approvertitle: 'Director'
        })
        .returning('id')
        .executeTakeFirstOrThrow()

      await db
        .insertInto('Common_Certification')
        .values([
          {
            egcs_cn_order: 1,
            egcs_cn_name_en: 'Commitment recommendation reviewed',
            egcs_cn_name_fr: "Recommandation d'engagement examinée",
            egcs_cn_description_en: 'Confirms the completed commitment package and rationale have been reviewed.',
            egcs_cn_description_fr: "Confirme que le dossier d'engagement complété et sa justification ont été examinés.",
            egcs_cn_optional: false,
            egcs_cn_certification_en: 'I confirm the completed commitment package has been reviewed and is ready for final approval.',
            egcs_cn_certification_fr: "Je confirme que le dossier d'engagement complété a été examiné et est prêt pour l'approbation finale.",
            egcs_cn_approvalstep: String(commitmentFinalApprovalStep.id)
          }
        ])
        .execute()
    }

    let forecastApprovalTemplate = await db
      .selectFrom('Common_Approval_Template')
      .select('id')
      .where('egcs_cn_scopetype', '=', 'transferpaymentstream')
      .where('egcs_cn_scopeid', '=', String(stream.id))
      .where('egcs_cn_name_en', '=', 'Agreement Forecast Approval Template')
      .where('_deleted', '=', false)
      .orderBy('id', 'asc')
      .executeTakeFirst()

    let monitorApprovalTemplate = await db
      .selectFrom('Common_Approval_Template')
      .select('id')
      .where('egcs_cn_scopetype', '=', 'transferpaymentstream')
      .where('egcs_cn_scopeid', '=', String(stream.id))
      .where('egcs_cn_name_en', '=', 'Agreement Monitor Approval Template')
      .where('_deleted', '=', false)
      .orderBy('id', 'asc')
      .executeTakeFirst()

    if (!monitorApprovalTemplate) {
      monitorApprovalTemplate = await db
        .insertInto('Common_Approval_Template')
        .values({
          egcs_cn_scopetype: 'transferpaymentstream',
          egcs_cn_scopeid: String(stream.id),
          egcs_cn_name_en: 'Agreement Monitor Approval Template',
          egcs_cn_name_fr: "Modèle d'approbation des surveillances d'entente",
          egcs_cn_description_en: 'Seeded approval template for funding agreement monitor workflows.',
          egcs_cn_description_fr: "Modèle d'approbation initial pour les flux de surveillance d'entente de financement.",
          _deleted: false
        })
        .returning('id')
        .executeTakeFirstOrThrow()

      const monitorVerificationStep = await db
        .insertInto('Common_Approval_Step')
        .values({
          egcs_cn_sequence: 1,
          egcs_cn_name_en: 'Monitor Verification Review',
          egcs_cn_name_fr: 'Examen de vérification de la surveillance',
          egcs_cn_description_en: 'Confirms the monitoring plan, items, findings, follow-ups, and promising practices are ready for approval.',
          egcs_cn_description_fr: "Confirme que le plan de surveillance, les éléments, les constatations, les suivis et les pratiques prometteuses sont prêts pour l'approbation.",
          egcs_cn_approvaltemplate: String(monitorApprovalTemplate.id),
          egcs_cn_defaultuser: String(seededAdvanceAssessmentDefaultUser.id),
          egcs_cn_approvertitle: 'Manager'
        })
        .returning('id')
        .executeTakeFirstOrThrow()

      await db
        .insertInto('Common_Certification')
        .values([
          {
            egcs_cn_order: 1,
            egcs_cn_name_en: 'Monitor package verified',
            egcs_cn_name_fr: 'Dossier de surveillance vérifié',
            egcs_cn_description_en: 'Confirms the monitor package has been reviewed and is complete.',
            egcs_cn_description_fr: 'Confirme que le dossier de surveillance a été examiné et est complet.',
            egcs_cn_optional: false,
            egcs_cn_certification_en: 'I confirm the monitor package has been reviewed and is complete.',
            egcs_cn_certification_fr: 'Je confirme que le dossier de surveillance a été examiné et est complet.',
            egcs_cn_approvalstep: String(monitorVerificationStep.id)
          }
        ])
        .execute()
    }

    if (!forecastApprovalTemplate) {
      forecastApprovalTemplate = await db
        .insertInto('Common_Approval_Template')
        .values({
          egcs_cn_scopetype: 'transferpaymentstream',
          egcs_cn_scopeid: String(stream.id),
          egcs_cn_name_en: 'Agreement Forecast Approval Template',
          egcs_cn_name_fr: "Modèle d'approbation des prévisions d'entente",
          egcs_cn_description_en: 'Seeded approval template for funding agreement forecast workflows.',
          egcs_cn_description_fr: "Modèle d'approbation initial pour les flux de prévisions d'entente de financement.",
          _deleted: false
        })
        .returning('id')
        .executeTakeFirstOrThrow()

      const forecastVerificationStep = await db
        .insertInto('Common_Approval_Step')
        .values({
          egcs_cn_sequence: 1,
          egcs_cn_name_en: 'Forecast Verification Review',
          egcs_cn_name_fr: 'Examen de vérification de la prévision',
          egcs_cn_description_en: 'Confirms the forecast lines and monthly amounts are ready for approval.',
          egcs_cn_description_fr: "Confirme que les lignes de prévision et les montants mensuels sont prêts pour l'approbation.",
          egcs_cn_approvaltemplate: String(forecastApprovalTemplate.id),
          egcs_cn_defaultuser: String(seededAdvanceAssessmentDefaultUser.id),
          egcs_cn_approvertitle: 'Manager'
        })
        .returning('id')
        .executeTakeFirstOrThrow()

      await db
        .insertInto('Common_Certification')
        .values([
          {
            egcs_cn_order: 1,
            egcs_cn_name_en: 'Forecast lines verified',
            egcs_cn_name_fr: 'Lignes de prévision vérifiées',
            egcs_cn_description_en: 'Confirms each forecast line is complete and reasonable.',
            egcs_cn_description_fr: 'Confirme que chaque ligne de prévision est complète et raisonnable.',
            egcs_cn_optional: false,
            egcs_cn_certification_en: 'I confirm the forecast lines and monthly amounts have been reviewed.',
            egcs_cn_certification_fr: 'Je confirme que les lignes de prévision et les montants mensuels ont été examinés.',
            egcs_cn_approvalstep: String(forecastVerificationStep.id)
          }
        ])
        .execute()

      const forecastFinalApprovalStep = await db
        .insertInto('Common_Approval_Step')
        .values({
          egcs_cn_sequence: 2,
          egcs_cn_name_en: 'Forecast Final Approval',
          egcs_cn_name_fr: 'Approbation finale de la prévision',
          egcs_cn_description_en: 'Captures the final management approval for the completed agreement forecast.',
          egcs_cn_description_fr: "Consigne l'approbation finale de la direction pour la prévision d'entente complétée.",
          egcs_cn_approvaltemplate: String(forecastApprovalTemplate.id),
          egcs_cn_defaultuser: String(seededAdvanceAssessmentDefaultUser.id),
          egcs_cn_approvertitle: 'Director'
        })
        .returning('id')
        .executeTakeFirstOrThrow()

      await db
        .insertInto('Common_Certification')
        .values({
          egcs_cn_order: 1,
          egcs_cn_name_en: 'Forecast package reviewed',
          egcs_cn_name_fr: 'Dossier de prévision examiné',
          egcs_cn_description_en: 'Confirms the completed forecast package is ready for final approval.',
          egcs_cn_description_fr: "Confirme que le dossier de prévision complété est prêt pour l'approbation finale.",
          egcs_cn_optional: false,
          egcs_cn_certification_en: 'I confirm the completed forecast package has been reviewed.',
          egcs_cn_certification_fr: 'Je confirme que le dossier de prévision complété a été examiné.',
          egcs_cn_approvalstep: String(forecastFinalApprovalStep.id)
        })
        .execute()
    }

    let claimReconcileApprovalTemplate = await db
      .selectFrom('Common_Approval_Template')
      .select('id')
      .where('egcs_cn_scopetype', '=', 'transferpaymentstream')
      .where('egcs_cn_scopeid', '=', String(stream.id))
      .where('egcs_cn_name_en', '=', 'Claim Reconciliation Approval Template')
      .where('_deleted', '=', false)
      .orderBy('id', 'asc')
      .executeTakeFirst()

    if (!claimReconcileApprovalTemplate) {
      claimReconcileApprovalTemplate = await db
        .insertInto('Common_Approval_Template')
        .values({
          egcs_cn_scopetype: 'transferpaymentstream',
          egcs_cn_scopeid: String(stream.id),
          egcs_cn_name_en: 'Claim Reconciliation Approval Template',
          egcs_cn_name_fr: "Modèle d'approbation du rapprochement de réclamation",
          egcs_cn_description_en: 'Seeded approval template for claim reconciliation workflows.',
          egcs_cn_description_fr: "Modèle d'approbation initial pour les flux de rapprochement de réclamation.",
          _deleted: false
        })
        .returning('id')
        .executeTakeFirstOrThrow()

      const claimReconcileVerificationStep = await db
        .insertInto('Common_Approval_Step')
        .values({
          egcs_cn_sequence: 1,
          egcs_cn_name_en: 'Reconciliation Verification Review',
          egcs_cn_name_fr: 'Examen de vérification du rapprochement',
          egcs_cn_description_en: 'Confirms reconciled and sampled amounts are complete before approval.',
          egcs_cn_description_fr: "Confirme que les montants rapprochés et échantillonnés sont complets avant l'approbation.",
          egcs_cn_approvaltemplate: String(claimReconcileApprovalTemplate.id),
          egcs_cn_defaultuser: String(seededAdvanceAssessmentDefaultUser.id),
          egcs_cn_approvertitle: 'Manager'
        })
        .returning('id')
        .executeTakeFirstOrThrow()

      await db
        .insertInto('Common_Certification')
        .values([
          {
            egcs_cn_order: 1,
            egcs_cn_name_en: 'Reconciliation amounts verified',
            egcs_cn_name_fr: 'Montants du rapprochement vérifiés',
            egcs_cn_description_en: 'Confirms the reconciled and sampled values are complete and reasonable.',
            egcs_cn_description_fr: 'Confirme que les valeurs rapprochées et échantillonnées sont complètes et raisonnables.',
            egcs_cn_optional: false,
            egcs_cn_certification_en: 'I confirm the reconciled and sampled claim amounts have been reviewed.',
            egcs_cn_certification_fr: 'Je confirme que les montants rapprochés et échantillonnés de la réclamation ont été examinés.',
            egcs_cn_approvalstep: String(claimReconcileVerificationStep.id)
          }
        ])
        .execute()

      const claimReconcileFinalApprovalStep = await db
        .insertInto('Common_Approval_Step')
        .values({
          egcs_cn_sequence: 2,
          egcs_cn_name_en: 'Reconciliation Final Approval',
          egcs_cn_name_fr: 'Approbation finale du rapprochement',
          egcs_cn_description_en: 'Captures the final management approval for the completed claim reconciliation.',
          egcs_cn_description_fr: "Consigne l'approbation finale de la direction pour le rapprochement de réclamation terminé.",
          egcs_cn_approvaltemplate: String(claimReconcileApprovalTemplate.id),
          egcs_cn_defaultuser: String(seededAdvanceAssessmentDefaultUser.id),
          egcs_cn_approvertitle: 'Director'
        })
        .returning('id')
        .executeTakeFirstOrThrow()

      await db
        .insertInto('Common_Certification')
        .values({
          egcs_cn_order: 1,
          egcs_cn_name_en: 'Reconciliation package reviewed',
          egcs_cn_name_fr: 'Dossier de rapprochement examiné',
          egcs_cn_description_en: 'Confirms the completed reconciliation package is ready for final approval.',
          egcs_cn_description_fr: "Confirme que le dossier de rapprochement terminé est prêt pour l'approbation finale.",
          egcs_cn_optional: false,
          egcs_cn_certification_en: 'I confirm the completed reconciliation package has been reviewed.',
          egcs_cn_certification_fr: 'Je confirme que le dossier de rapprochement terminé a été examiné.',
          egcs_cn_approvalstep: String(claimReconcileFinalApprovalStep.id)
        })
        .execute()
    }

    let assessmentSchema = await db
      .selectFrom('Common_Review_Schema')
      .select('id')
      .where('egcs_cn_agency', '=', String(agency.id))
      .where('egcs_cn_reviewtype', '=', 'assessment')
      .where('egcs_cn_entitytype', '=', 'applicantrecipient')
      .where('_deleted', '=', false)
      .orderBy('id', 'asc')
      .executeTakeFirst()

    if (!assessmentSchema) {
      assessmentSchema = await db
        .insertInto('Common_Review_Schema')
        .values({
          egcs_cn_reviewtype: 'assessment',
          egcs_cn_agency: String(agency.id),
          egcs_cn_entitytype: 'applicantrecipient',
          egcs_cn_name_en: 'Payment Assessment',
          egcs_cn_name_fr: 'Évaluation du paiement',
          egcs_cn_outcomename_en: 'Assessment Outcome',
          egcs_cn_outcomename_fr: "Résultat de l'évaluation",
          egcs_cn_disablecustomoutcomes: false,
          egcs_cn_disablealignment: false,
          egcs_cn_disablereviewers: false,
          egcs_cn_scoringmatrix: [],
          egcs_cn_assessmentschema: { sections: [], sectionMatrix: [], outcomes: [] },
          _deleted: false
        })
        .returning('id')
        .executeTakeFirstOrThrow()
    }

    const isAdvancePaymentAssessmentStream = String(stream.id) === '31'
    const advanceAssessmentSchema = isAdvancePaymentAssessmentStream
      ? await db
          .insertInto('Common_Review_Schema')
          .values({
            egcs_cn_reviewtype: 'assessment',
            egcs_cn_agency: String(agency.id),
            egcs_cn_entitytype: 'applicantrecipient',
            egcs_cn_name_en: 'Advance Payment Assessment',
            egcs_cn_name_fr: 'Évaluation du paiement anticipé',
            egcs_cn_outcomename_en: 'Advance Payment Decision',
            egcs_cn_outcomename_fr: 'Décision de paiement anticipé',
            egcs_cn_disablecustomoutcomes: false,
            egcs_cn_disablealignment: false,
            egcs_cn_disablereviewers: false,
            egcs_cn_scoringmatrix: sql`${JSON.stringify(advanceAssessmentDefinitionSeed.scoringMatrix)}::jsonb`,
            egcs_cn_assessmentschema: advanceAssessmentDefinitionSeed.assessmentSchema,
            _deleted: false
          })
          .returning('id')
          .executeTakeFirstOrThrow()
      : null

    let checklistSchema = await db
      .selectFrom('Common_Review_Schema')
      .select('id')
      .where('egcs_cn_agency', '=', String(agency.id))
      .where('egcs_cn_reviewtype', '=', 'checklist')
      .where('egcs_cn_entitytype', '=', 'applicantrecipient')
      .where('_deleted', '=', false)
      .orderBy('id', 'asc')
      .executeTakeFirst()

    if (!checklistSchema) {
      checklistSchema = await db
        .insertInto('Common_Review_Schema')
        .values({
          egcs_cn_reviewtype: 'checklist',
          egcs_cn_agency: String(agency.id),
          egcs_cn_entitytype: 'applicantrecipient',
          egcs_cn_name_en: 'Payment Checklist',
          egcs_cn_name_fr: 'Liste de contrôle de paiement',
          egcs_cn_outcomename_en: 'Checklist Outcome',
          egcs_cn_outcomename_fr: 'Résultat de la liste de contrôle',
          egcs_cn_disablecustomoutcomes: false,
          egcs_cn_disablealignment: false,
          egcs_cn_disablereviewers: false,
          egcs_cn_scoringmatrix: { pass: 1, fail: 0 },
          egcs_cn_assessmentschema: { title: 'Payment Checklist', sections: [] },
          _deleted: false
        })
        .returning('id')
        .executeTakeFirstOrThrow()
      await db.insertInto('Common_Checklist_Schema').values({
        egcs_cn_reviewschema: String(checklistSchema.id),
        egcs_cn_checklistschema: SEEDED_CHECKLIST_DEFINITION,
        _deleted: false
      }).execute()
    }

    let recommendationSchema = await db
      .selectFrom('Common_Recommendation_Schema')
      .select('id')
      .where('egcs_cn_agency', '=', String(agency.id))
      .where('egcs_cn_name_en', '=', 'Payment Recommendation')
      .where('_deleted', '=', false)
      .orderBy('id', 'asc')
      .executeTakeFirst()

    if (!recommendationSchema) {
      recommendationSchema = await db
        .insertInto('Common_Recommendation_Schema')
        .values({
          egcs_cn_agency: String(agency.id),
          egcs_cn_name_en: 'Payment Recommendation',
          egcs_cn_name_fr: 'Recommandation de paiement',
          egcs_cn_result: {
            1: 'Recommend approval',
            2: 'Recommend changes',
            3: 'Do not recommend'
          },
          egcs_cn_recommendationschema: {
            sections: [{
              key: 'recommendation',
              label: { en: 'Recommendation', fr: 'Recommandation' },
              subSections: [{
                key: 'recommendation-details',
                label: { en: 'Recommendation details', fr: 'Détails de la recommandation' },
                questions: [
                  {
                    key: 'decision',
                    type: 'radio',
                    question: { en: 'What is your recommendation?', fr: 'Quelle est votre recommandation?' },
                    required: true,
                    isResult: true,
                    help: [{
                      key: 'decision-guidance',
                      title: { en: 'Decision guidance', fr: 'Directives décisionnelles' },
                      description: { en: 'Recommend the payment only when the supporting evidence is complete, consistent, and demonstrates that all payment conditions have been met.', fr: 'Recommandez le paiement seulement lorsque les pièces justificatives sont complètes et cohérentes et démontrent que toutes les conditions de paiement sont respectées.' }
                    }],
                    options: [
                      {
                        key: 'recommend',
                        label: { en: 'Recommend', fr: 'Recommander' },
                        description: { en: 'The payment is supported by the evidence and is ready to proceed.', fr: 'Le paiement est étayé par les éléments probants et est prêt à aller de l’avant.' },
                        outcome: 'recommended'
                      },
                      {
                        key: 'do-not-recommend',
                        label: { en: 'Do not recommend', fr: 'Ne pas recommander' },
                        description: { en: 'The evidence does not support proceeding with this payment.', fr: 'Les éléments probants ne permettent pas d’aller de l’avant avec ce paiement.' },
                        outcome: 'not_recommended'
                      }
                    ]
                  },
                  {
                    key: 'evidence-quality',
                    type: 'radio',
                    question: { en: 'How complete is the supporting payment evidence?', fr: 'Dans quelle mesure les pièces justificatives du paiement sont-elles complètes?' },
                    required: true,
                    isResult: false,
                    help: [{
                      key: 'evidence-guidance',
                      title: { en: 'Evidence to consider', fr: 'Éléments probants à considérer' },
                      description: { en: 'Consider the payment request, eligible-cost support, agreement conditions, recipient reporting, and any documented follow-up.', fr: 'Tenez compte de la demande de paiement, des pièces sur les coûts admissibles, des conditions de l’entente, des rapports du bénéficiaire et de tout suivi documenté.' }
                    }],
                    options: [
                      {
                        key: 'complete',
                        label: { en: 'Complete', fr: 'Complètes' },
                        description: { en: 'All required financial and program evidence is present and internally consistent.', fr: 'Toutes les pièces financières et de programme requises sont présentes et cohérentes.' }
                      },
                      {
                        key: 'minor-gaps',
                        label: { en: 'Minor gaps', fr: 'Lacunes mineures' },
                        description: { en: 'The evidence is sufficient, but minor supporting details should be documented.', fr: 'Les pièces sont suffisantes, mais certains détails mineurs devraient être documentés.' }
                      },
                      {
                        key: 'material-gaps',
                        label: { en: 'Material gaps', fr: 'Lacunes importantes' },
                        description: { en: 'Important evidence is missing or inconsistent and requires follow-up.', fr: 'Des pièces importantes sont manquantes ou incohérentes et nécessitent un suivi.' }
                      }
                    ]
                  },
                  {
                    key: 'rationale',
                    type: 'text',
                    question: { en: 'Rationale', fr: 'Justification' },
                    description: { en: 'Summarize why the payment should or should not proceed.', fr: 'Résumez pourquoi le paiement devrait ou ne devrait pas aller de l’avant.' },
                    required: true,
                    isResult: false,
                    help: [{
                      key: 'rationale-guidance',
                      title: { en: 'Writing a useful rationale', fr: 'Rédiger une justification utile' },
                      description: { en: 'Summarize the evidence reviewed, identify any remaining risk, and explain how the evidence supports your recommendation.', fr: 'Résumez les éléments probants examinés, indiquez tout risque résiduel et expliquez comment ces éléments appuient votre recommandation.' }
                    }],
                    maxLength: 2000
                  }
                ]
              }]
            }]
          },
          _deleted: false
        })
        .returning('id')
        .executeTakeFirstOrThrow()
    }

    if (commonReviewApprovalTemplate && assessmentSchema) {
      const assessmentSetSetup = await db
        .insertInto('Common_Review_Set_Setup')
        .values({
          egcs_cn_scopetype: 'transferpaymentstream',
          egcs_cn_scopeid: String(stream.id),
          egcs_cn_entitytype: 'applicantrecipient',
          egcs_cn_name_en: 'Payment Assessment Set',
          egcs_cn_name_fr: 'Ensemble d evaluations de paiement',
          egcs_cn_description_en: 'Assessment review set for payment readiness.',
          egcs_cn_description_fr: 'Ensemble d’évaluations de la préparation au paiement.',
          egcs_cn_order: 1,
          egcs_cn_sequential: true,
          _deleted: false
        })
        .returning('id')
        .executeTakeFirstOrThrow()

      await db
        .insertInto('Common_Review_Setup')
        .values({
          egcs_cn_entitytype: 'applicantrecipient',
          egcs_cn_order: 1,
          egcs_cn_reviewset: String(assessmentSetSetup.id),
          egcs_cn_approvaltemplate: String(commonReviewApprovalTemplate.id),
          egcs_cn_reviewschema: String(assessmentSchema.id),
          _deleted: false
        })
        .execute()
    }

    if (commonReviewApprovalTemplate && advanceAssessmentSchema) {
      const advanceAssessmentSetSetup = await db
        .insertInto('Common_Review_Set_Setup')
        .values({
          egcs_cn_scopetype: 'transferpaymentstream',
          egcs_cn_scopeid: String(stream.id),
          egcs_cn_entitytype: 'applicantrecipient',
          egcs_cn_name_en: 'Advance Payment Assessment Set',
          egcs_cn_name_fr: 'Ensemble d évaluations de paiement anticipé',
          egcs_cn_description_en: 'Assessment review set for advance payment readiness.',
          egcs_cn_description_fr: 'Ensemble d’évaluations de la préparation au paiement anticipé.',
          egcs_cn_order: 3,
          egcs_cn_sequential: true,
          _deleted: false
        })
        .returning('id')
        .executeTakeFirstOrThrow()

      await db
        .insertInto('Common_Review_Setup')
        .values({
          egcs_cn_entitytype: 'applicantrecipient',
          egcs_cn_order: 1,
          egcs_cn_reviewset: String(advanceAssessmentSetSetup.id),
          egcs_cn_approvaltemplate: String(commonReviewApprovalTemplate.id),
          egcs_cn_reviewschema: String(advanceAssessmentSchema.id),
          _deleted: false
        })
        .execute()
    }

    if (commonReviewApprovalTemplate && checklistSchema) {
      const checklistSetSetup = await db
        .insertInto('Common_Review_Set_Setup')
        .values({
          egcs_cn_scopetype: 'transferpaymentstream',
          egcs_cn_scopeid: String(stream.id),
          egcs_cn_entitytype: 'applicantrecipient',
          egcs_cn_name_en: 'Payment Checklist Set',
          egcs_cn_name_fr: 'Ensemble de listes de verification de paiement',
          egcs_cn_description_en: 'Checklist review set for payment completion.',
          egcs_cn_description_fr: 'Ensemble de listes de contrôle pour l’achèvement du paiement.',
          egcs_cn_order: 2,
          egcs_cn_sequential: false,
          _deleted: false
        })
        .returning('id')
        .executeTakeFirstOrThrow()

      await db
        .insertInto('Common_Review_Setup')
        .values({
          egcs_cn_entitytype: 'applicantrecipient',
          egcs_cn_order: 1,
          egcs_cn_reviewset: String(checklistSetSetup.id),
          egcs_cn_approvaltemplate: String(commonReviewApprovalTemplate.id),
          egcs_cn_reviewschema: String(checklistSchema.id),
          _deleted: false
        })
        .execute()
    }

    if (commonReviewApprovalTemplate && advanceAssessmentSchema && checklistSchema) {
      const mixedReviewSetSetup = await db
        .insertInto('Common_Review_Set_Setup')
        .values({
          egcs_cn_scopetype: 'transferpaymentstream',
          egcs_cn_scopeid: String(stream.id),
          egcs_cn_entitytype: 'applicantrecipient',
          egcs_cn_name_en: 'Payment Readiness Review Set',
          egcs_cn_name_fr: 'Ensemble de revues de préparation au paiement',
          egcs_cn_description_en: 'Combined assessment and checklist review set for payment readiness.',
          egcs_cn_description_fr: 'Ensemble combiné d’évaluations et de listes de contrôle pour la préparation au paiement.',
          egcs_cn_order: 4,
          egcs_cn_sequential: false,
          _deleted: false
        })
        .returning('id')
        .executeTakeFirstOrThrow()

      await db
        .insertInto('Common_Review_Setup')
        .values([
          {
            egcs_cn_entitytype: 'applicantrecipient',
            egcs_cn_order: 1,
            egcs_cn_reviewset: String(mixedReviewSetSetup.id),
            egcs_cn_approvaltemplate: String(commonReviewApprovalTemplate.id),
            egcs_cn_reviewschema: String(advanceAssessmentSchema.id),
            _deleted: false
          },
          {
            egcs_cn_entitytype: 'applicantrecipient',
            egcs_cn_order: 2,
            egcs_cn_reviewset: String(mixedReviewSetSetup.id),
            egcs_cn_approvaltemplate: String(commonReviewApprovalTemplate.id),
            egcs_cn_reviewschema: String(checklistSchema.id),
            _deleted: false
          }
        ])
        .execute()
    }

    if (approvalTemplate && recommendationSchema) {
      const recommendationApprovalTemplate = await db.insertInto('Common_Approval_Template').values({
        egcs_cn_scopetype: 'transferpaymentstream', egcs_cn_scopeid: String(stream.id),
        egcs_cn_name_en: 'Recommendation Approval', egcs_cn_name_fr: 'Approbation de recommandation',
        egcs_cn_description_en: 'Approves each recommendation outcome before the workflow advances.',
        egcs_cn_description_fr: 'Approuve chaque résultat de recommandation avant la poursuite du flux.',
        _deleted: false
      }).returning('id').executeTakeFirstOrThrow()
      await db.insertInto('Common_Approval_Step').values({
        egcs_cn_sequence: 1, egcs_cn_name_en: 'Recommendation decision', egcs_cn_name_fr: 'Décision de recommandation',
        egcs_cn_description_en: 'Approve the submitted recommendation.', egcs_cn_description_fr: 'Approuver la recommandation soumise.',
        egcs_cn_approvaltemplate: String(recommendationApprovalTemplate.id), egcs_cn_defaultuser: String(seededDefaultUser.id),
        egcs_cn_approvertitle: 'Director'
      }).execute()
      const recommendationSet = await db
        .insertInto('Common_Recommendation_Set_Setup')
        .values({
          egcs_cn_scopetype: 'transferpaymentstream',
          egcs_cn_scopeid: String(stream.id),
          egcs_cn_name_en: 'Payment Recommendation Setup',
          egcs_cn_name_fr: 'Configuration de recommandation de paiement',
          egcs_cn_description_en: 'Recommendation captured when payment review completes.',
          egcs_cn_description_fr: 'Recommandation saisie à la fin de la revue du paiement.',
          _deleted: false
        })
        .returning('id')
        .executeTakeFirstOrThrow()

      await db.insertInto('Common_Recommendation_Setup').values({
        egcs_cn_order: 1,
        egcs_cn_recommendationset: String(recommendationSet.id),
        egcs_cn_approvaltemplate: String(recommendationApprovalTemplate.id),
        egcs_cn_recommendationschema: String(recommendationSchema.id),
        _deleted: false
      }).execute()

      if (String(stream.id) === '31') {
        const followUpRecommendationSchema = await db.insertInto('Common_Recommendation_Schema').values({
        egcs_cn_agency: String(agency.id),
        egcs_cn_name_en: 'Payment Recommendation Follow-up', egcs_cn_name_fr: 'Suivi de la recommandation de paiement',
        egcs_cn_result: { recommended: 'Recommended', not_recommended: 'Not recommended' },
        egcs_cn_recommendationschema: {
          sections: [{ key: 'follow-up', label: { en: 'Follow-up', fr: 'Suivi' }, subSections: [{
            key: 'follow-up-decision', label: { en: 'Decision', fr: 'Décision' }, questions: [{
              key: 'follow-up-result', type: 'radio', question: { en: 'Confirm the recommendation?', fr: 'Confirmer la recommandation?' },
              required: true, isResult: true, options: [
                { key: 'confirm', label: { en: 'Confirm', fr: 'Confirmer' }, outcome: 'recommended' },
                { key: 'stop', label: { en: 'Stop', fr: 'Arrêter' }, outcome: 'not_recommended' }
              ]
            }]
          }] }]
        }, _deleted: false
        }).returning('id').executeTakeFirstOrThrow()
        await db.insertInto('Common_Recommendation_Setup').values({
          egcs_cn_order: 2, egcs_cn_recommendationset: String(recommendationSet.id),
          egcs_cn_approvaltemplate: String(recommendationApprovalTemplate.id), egcs_cn_recommendationschema: String(followUpRecommendationSchema.id),
          _deleted: false
        }).execute()
      }

      if (String(stream.id) === '31') {
        const paymentChecklistSchema = await db.insertInto('Common_Review_Schema').values({
          egcs_cn_reviewtype: 'checklist', egcs_cn_agency: String(agency.id),
          egcs_cn_entitytype: 'fundingcasepayment',
          egcs_cn_name_en: 'Payment Workflow Checklist', egcs_cn_name_fr: 'Liste de contrôle du flux de paiement',
          egcs_cn_outcomename_en: 'Payment readiness', egcs_cn_outcomename_fr: 'Préparation du paiement',
          egcs_cn_disablecustomoutcomes: false, egcs_cn_disablealignment: false, egcs_cn_disablereviewers: false,
          egcs_cn_scoringmatrix: { pass: 1, fail: 0 },
          egcs_cn_assessmentschema: { title: 'Payment Workflow Checklist', sections: [] }, _deleted: false
        }).returning('id').executeTakeFirstOrThrow()
        await db.insertInto('Common_Checklist_Schema').values({
          egcs_cn_reviewschema: String(paymentChecklistSchema.id),
          egcs_cn_checklistschema: SEEDED_CHECKLIST_DEFINITION, _deleted: false
        }).execute()
        const paymentReviewSet = await db.insertInto('Common_Review_Set_Setup').values({
          egcs_cn_scopetype: 'transferpaymentstream', egcs_cn_scopeid: String(stream.id),
          egcs_cn_entitytype: 'fundingcasepayment',
          egcs_cn_name_en: 'Payment workflow review', egcs_cn_name_fr: 'Revue du flux de paiement',
          egcs_cn_description_en: 'Quick checklist review before the payment recommendation workflow.',
          egcs_cn_description_fr: 'Revue rapide par liste de contrôle avant le flux de recommandation du paiement.',
          egcs_cn_order: 1, egcs_cn_sequential: true, _deleted: false
        }).returning('id').executeTakeFirstOrThrow()
        await db.insertInto('Common_Review_Setup').values({
          egcs_cn_entitytype: 'fundingcasepayment', egcs_cn_order: 1,
          egcs_cn_reviewset: String(paymentReviewSet.id), egcs_cn_reviewschema: String(paymentChecklistSchema.id),
          egcs_cn_failonchecklistfailure: true, _deleted: false
        }).execute()
        await publishSeedWorkflowDependencies(db)
        const paymentWorkflow = await db.insertInto('Common_Workflow_Setup').values({
          egcs_cn_scopetype: 'transferpaymentstream', egcs_cn_scopeid: String(stream.id),
          egcs_cn_entitytype: 'fundingcasepayment',
          egcs_cn_purpose: 'approval_submission',
          egcs_cn_name_en: 'Payment completion and recommendation',
          egcs_cn_name_fr: 'Achèvement et recommandation du paiement',
          egcs_cn_description_en: 'Completes a payment, captures and approves its sequential recommendations, then obtains final approval.',
          egcs_cn_description_fr: 'Achève un paiement, saisit et approuve ses recommandations séquentielles, puis obtient l’approbation finale.',
          egcs_cn_cancellationstatus: agencyStatusIds.cancelled,
          egcs_cn_executionfailurestatus: agencyStatusIds.denied,
          egcs_cn_allowretry: true, _deleted: false
        }).returning('id').executeTakeFirstOrThrow()
        await insertWorkflowAllowedStartStatuses(db, String(paymentWorkflow.id), [
          agencyStatusIds.draft,
          agencyStatusIds.denied
        ])
        await db.insertInto('Common_Workflow_Setup_Member').values([
          {
            egcs_cn_workflowsetup: String(paymentWorkflow.id), egcs_cn_sequence: 1, egcs_cn_kind: 'review_set',
            egcs_cn_reviewset: String(paymentReviewSet.id), egcs_cn_materializationstatus: agencyStatusIds.inReview,
            egcs_cn_failurestatus: agencyStatusIds.denied, _deleted: false
          },
          {
            egcs_cn_workflowsetup: String(paymentWorkflow.id), egcs_cn_sequence: 2, egcs_cn_kind: 'recommendation_set',
            egcs_cn_recommendationset: String(recommendationSet.id), egcs_cn_failurestatus: agencyStatusIds.denied, _deleted: false
          },
          {
            egcs_cn_workflowsetup: String(paymentWorkflow.id), egcs_cn_sequence: 3, egcs_cn_kind: 'approval_template',
            egcs_cn_approvaltemplate: String(approvalTemplate.id), egcs_cn_successstatus: agencyStatusIds.approved,
            egcs_cn_failurestatus: agencyStatusIds.denied, _deleted: false
          }
        ]).execute()

        for (const approvalSubmissionSeed of [
          {
            entityType: 'fundingcaseagreement' as const,
            schemaNameEn: 'Agreement approval recommendation',
            schemaNameFr: 'Recommandation d’approbation de l’entente',
            setupNameEn: 'Agreement approval submission',
            setupNameFr: 'Soumission de l’entente pour approbation',
            startStatus: 'inReview' as const,
            successStatus: 'active' as const
          },
          {
            entityType: 'fundingcaseamendment' as const,
            schemaNameEn: 'Amendment approval recommendation',
            schemaNameFr: 'Recommandation d’approbation de la modification',
            setupNameEn: 'Amendment approval submission',
            setupNameFr: 'Soumission de la modification pour approbation',
            startStatus: 'pendingApproval' as const,
            successStatus: 'closed' as const
          }
        ]) {
          const approvalRecommendationDefinition: RecommendationDefinition = {
            sections: [{
              key: 'approval-recommendation',
              label: { en: 'Approval recommendation', fr: 'Recommandation d’approbation' },
              subSections: [{
                key: 'decision',
                label: { en: 'Decision', fr: 'Décision' },
                questions: [
                  {
                    key: 'approval-decision', type: 'radio', required: true, isResult: true,
                    question: { en: 'Should this submission be approved?', fr: 'Cette soumission devrait-elle être approuvée?' },
                    options: [
                      { key: 'recommend', label: { en: 'Recommend approval', fr: 'Recommander l’approbation' }, outcome: 'recommended' },
                      { key: 'do-not-recommend', label: { en: 'Do not recommend', fr: 'Ne pas recommander' }, outcome: 'not_recommended' }
                    ]
                  },
                  {
                    key: 'rationale', type: 'text', required: true, isResult: false, maxLength: 2000,
                    question: { en: 'Recommendation rationale', fr: 'Justification de la recommandation' }
                  }
                ]
              }]
            }]
          }
          const approvalRecommendationSchema = await db.insertInto('Common_Recommendation_Schema').values({
            egcs_cn_agency: String(agency.id),
            egcs_cn_name_en: approvalSubmissionSeed.schemaNameEn,
            egcs_cn_name_fr: approvalSubmissionSeed.schemaNameFr,
            egcs_cn_result: { recommended: 'Recommended', not_recommended: 'Not recommended' },
            egcs_cn_recommendationschema: approvalRecommendationDefinition,
            _deleted: false
          }).returning('id').executeTakeFirstOrThrow()
          const approvalRecommendationSet = await db.insertInto('Common_Recommendation_Set_Setup').values({
            egcs_cn_scopetype: 'transferpaymentstream', egcs_cn_scopeid: String(stream.id),
            egcs_cn_name_en: approvalSubmissionSeed.schemaNameEn,
            egcs_cn_name_fr: approvalSubmissionSeed.schemaNameFr,
            egcs_cn_description_en: 'Captures and approves the immutable Agreement submission packet.',
            egcs_cn_description_fr: 'Saisit et approuve le dossier immuable de soumission de l’entente.',
            _deleted: false
          }).returning('id').executeTakeFirstOrThrow()
          await db.insertInto('Common_Recommendation_Setup').values({
            egcs_cn_order: 1,
            egcs_cn_recommendationset: String(approvalRecommendationSet.id),
            egcs_cn_approvaltemplate: String(recommendationApprovalTemplate.id),
            egcs_cn_recommendationschema: String(approvalRecommendationSchema.id), _deleted: false
          }).execute()
          await publishSeedWorkflowDependencies(db)
          const approvalWorkflow = await db.insertInto('Common_Workflow_Setup').values({
            egcs_cn_scopetype: 'transferpaymentstream', egcs_cn_scopeid: String(stream.id),
            egcs_cn_entitytype: approvalSubmissionSeed.entityType,
            egcs_cn_purpose: 'approval_submission',
            egcs_cn_name_en: approvalSubmissionSeed.setupNameEn,
            egcs_cn_name_fr: approvalSubmissionSeed.setupNameFr,
            egcs_cn_description_en: 'Captures an immutable approval packet and creates an Agreement revision after approval.',
            egcs_cn_description_fr: 'Saisit un dossier d’approbation immuable et crée une révision de l’entente après approbation.',
            egcs_cn_cancellationstatus: agencyStatusIds.cancelled,
            egcs_cn_executionfailurestatus: agencyStatusIds.denied,
            egcs_cn_allowretry: true, _deleted: false
          }).returning('id').executeTakeFirstOrThrow()
          await insertWorkflowAllowedStartStatuses(db, String(approvalWorkflow.id), [
            agencyStatusIds.draft,
            agencyStatusIds.denied,
            agencyStatusIds.cancelled
          ])
          await db.insertInto('Common_Workflow_Setup_Member').values({
            egcs_cn_workflowsetup: String(approvalWorkflow.id), egcs_cn_sequence: 1, egcs_cn_kind: 'recommendation_set',
            egcs_cn_recommendationset: String(approvalRecommendationSet.id),
            egcs_cn_materializationstatus: agencyStatusIds[approvalSubmissionSeed.startStatus],
            egcs_cn_successstatus: agencyStatusIds[approvalSubmissionSeed.successStatus],
            egcs_cn_failurestatus: agencyStatusIds.denied, _deleted: false
          }).execute()
        }

        await publishSeedWorkflowDependencies(db)
        const approvalOnlyWorkflows = await db.insertInto('Common_Workflow_Setup').values([
          {
            egcs_cn_scopetype: 'transferpaymentstream', egcs_cn_scopeid: String(stream.id),
            egcs_cn_entitytype: 'fundingcaseagreementcommitment',
            egcs_cn_purpose: 'approval_submission',
            egcs_cn_name_en: 'Commitment completion and approval',
            egcs_cn_name_fr: 'Achèvement et approbation de l’engagement',
            egcs_cn_description_en: 'Completes an agreement commitment and obtains its configured final approval.',
            egcs_cn_description_fr: 'Achève un engagement d’entente et obtient son approbation finale configurée.',
            egcs_cn_cancellationstatus: agencyStatusIds.cancelled,
            egcs_cn_executionfailurestatus: agencyStatusIds.denied,
            egcs_cn_allowretry: true, _deleted: false
          },
          {
            egcs_cn_scopetype: 'transferpaymentstream', egcs_cn_scopeid: String(stream.id),
            egcs_cn_entitytype: 'fundingcaseforecast',
            egcs_cn_purpose: 'approval_submission',
            egcs_cn_name_en: 'Forecast completion and approval',
            egcs_cn_name_fr: 'Achèvement et approbation de la prévision',
            egcs_cn_description_en: 'Completes an agreement forecast and obtains its configured final approval.',
            egcs_cn_description_fr: 'Achève une prévision d’entente et obtient son approbation finale configurée.',
            egcs_cn_cancellationstatus: agencyStatusIds.cancelled,
            egcs_cn_executionfailurestatus: agencyStatusIds.denied,
            egcs_cn_allowretry: true, _deleted: false
          },
          {
            egcs_cn_scopetype: 'transferpaymentstream', egcs_cn_scopeid: String(stream.id),
            egcs_cn_entitytype: 'fundingcasemonitor',
            egcs_cn_purpose: 'approval_submission',
            egcs_cn_name_en: 'Monitor completion and approval',
            egcs_cn_name_fr: 'Achèvement et approbation de la surveillance',
            egcs_cn_description_en: 'Completes an agreement monitor and obtains its configured final approval.',
            egcs_cn_description_fr: 'Achève une surveillance d’entente et obtient son approbation finale configurée.',
            egcs_cn_cancellationstatus: agencyStatusIds.cancelled,
            egcs_cn_executionfailurestatus: agencyStatusIds.denied,
            egcs_cn_allowretry: true, _deleted: false
          },
          {
            egcs_cn_scopetype: 'transferpaymentstream', egcs_cn_scopeid: String(stream.id),
            egcs_cn_entitytype: 'fundingclaimreconcile',
            egcs_cn_purpose: 'approval_submission',
            egcs_cn_name_en: 'Claim reconciliation completion and approval',
            egcs_cn_name_fr: 'Achèvement et approbation du rapprochement de réclamation',
            egcs_cn_description_en: 'Completes a claim reconciliation and obtains its configured final approval.',
            egcs_cn_description_fr: 'Achève un rapprochement de réclamation et obtient son approbation finale configurée.',
            egcs_cn_cancellationstatus: agencyStatusIds.cancelled,
            egcs_cn_executionfailurestatus: agencyStatusIds.denied,
            egcs_cn_allowretry: true, _deleted: false
          }
        ]).returning(['id', 'egcs_cn_entitytype']).execute()
        for (const workflow of approvalOnlyWorkflows) {
          await insertWorkflowAllowedStartStatuses(db, String(workflow.id), [
            agencyStatusIds.draft,
            ...(workflow.egcs_cn_entitytype === 'fundingcaseforecast' ? [agencyStatusIds.inProgress] : []),
            agencyStatusIds.denied,
            agencyStatusIds.cancelled
          ])
        }
        const approvalTemplateByEntity = new Map([
          ['fundingcaseagreementcommitment', String(commitmentApprovalTemplate.id)],
          ['fundingcaseforecast', String(forecastApprovalTemplate.id)],
          ['fundingcasemonitor', String(monitorApprovalTemplate.id)],
          ['fundingclaimreconcile', String(claimReconcileApprovalTemplate.id)]
        ])
        await db.insertInto('Common_Workflow_Setup_Member').values(approvalOnlyWorkflows.map(workflow => ({
          egcs_cn_workflowsetup: String(workflow.id), egcs_cn_sequence: 1, egcs_cn_kind: 'approval_template' as const,
          egcs_cn_approvaltemplate: approvalTemplateByEntity.get(workflow.egcs_cn_entitytype)!,
          egcs_cn_materializationstatus: workflow.egcs_cn_entitytype === 'fundingclaimreconcile'
            ? agencyStatusIds.pendingApproval
            : agencyStatusIds.inReview,
          egcs_cn_successstatus: agencyStatusIds.approved,
          egcs_cn_failurestatus: agencyStatusIds.denied,
          _deleted: false
        }))).execute()
      }

      if (['32', '33'].includes(String(stream.id)) && commonReviewApprovalTemplate) {
        await seedAgreementApprovalSubmissionWorkflows(
          db,
          String(stream.id),
          String(agency.id),
          String(seededDefaultUser.id),
          String(commonReviewApprovalTemplate.id),
          String(recommendationApprovalTemplate.id)
        )
      }
      if (['31', '32', '33'].includes(String(stream.id))) {
        await seedAgreementRiskRatingWorkflow(db, String(stream.id), String(agency.id))
      }
      if (String(stream.id) === '31') {
        await seedAgreement51WorkflowCatalog(db, String(stream.id), String(agency.id), String(seededDefaultUser.id))
      }
    }

    await db
      .insertInto('Transfer_Payment_Financial_Limits')
      .values({
        egcs_tp_transferpaymentstream: String(stream.id),
        egcs_tp_maxallowableperrecipient: seedMoney('1.00'), // 1 million
        egcs_tp_maxpercentofsupportavailableperrecipient: 0.75,
        egcs_tp_maxpercentofretroactivecostsallowable: 0.1,
        egcs_tp_stackinglimit: 0.1,
        egcs_tp_active: true,
        _deleted: false
      })
      .execute()

    if (String(stream.id) !== '31') {
      await db
        .insertInto('Transfer_Payment_Outcome')
        .values({
          egcs_tp_transferpaymentprofile: String(profile.id),
          egcs_tp_name_en: 'Outcome 1',
          egcs_tp_name_fr: 'Resultat 1',
          egcs_tp_description_en: 'Primary outcome for the transfer payment program.',
          egcs_tp_description_fr: 'Resultat principal du programme de paiements de transfert.',
          _deleted: false
        })
        .execute()
    }

    await db
      .insertInto('Transfer_Payment_Objective')
      .values({
        egcs_tp_transferpaymentprofile: String(profile.id),
        egcs_tp_objective_en: 'To provide financial support for community projects.',
        egcs_tp_objective_fr: 'Fournir un soutien financier aux projets communautaires.',
        _deleted: false
      })
      .execute()
  }

  for (const stream of await db.selectFrom('Transfer_Payment_Stream').select('id').where('_deleted', '=', false).execute()) {
    const section = await db.insertInto('Transfer_Payment_Stream_Field_Section').values({
      egcs_tp_transferpaymentstream: String(stream.id), name_en: 'Project delivery', name_fr: 'Prestation du projet', display_order: 0
    }).returning('id').executeTakeFirstOrThrow()
    const field = await db.insertInto('Transfer_Payment_Stream_Field').values({
      section_id: String(section.id), egcs_tp_transferpaymentstream: String(stream.id), name_en: 'Delivery model', name_fr: 'Mode de prestation',
      kind: 'relational', discriminator: true, display_order: 0
    }).returningAll().executeTakeFirstOrThrow()
    const option = await db.insertInto('Transfer_Payment_Stream_Field_Option').values({
      field_id: String(field.id), name_en: 'Direct delivery', name_fr: 'Prestation directe',
      category_en: 'Delivery', category_fr: 'Prestation', display_order: 0
    }).returningAll().executeTakeFirstOrThrow()
    await db.insertInto('Transfer_Payment_Stream_Field').values({
      section_id: String(section.id), egcs_tp_transferpaymentstream: String(stream.id), name_en: 'Delivery notes', name_fr: 'Notes sur la prestation',
      kind: 'text', presentation: 'multiline', display_order: 1
    }).execute()
    const referencesSection = await db.insertInto('Transfer_Payment_Stream_Field_Section').values({
      egcs_tp_transferpaymentstream: String(stream.id), name_en: 'Project references', name_fr: 'Références du projet', display_order: 1
    }).returning('id').executeTakeFirstOrThrow()
    await db.insertInto('Transfer_Payment_Stream_Field').values({
      section_id: String(referencesSection.id), egcs_tp_transferpaymentstream: String(stream.id), name_en: 'Local project reference', name_fr: 'Référence locale du projet',
      kind: 'text', presentation: 'single_line', display_order: 2
    }).execute()
    const members = await db.selectFrom('Common_Workflow_Setup_Member as member')
      .innerJoin('Common_Workflow_Setup as setup', 'setup.id', 'member.egcs_cn_workflowsetup')
      .select('member.id').where('setup.egcs_cn_scopeid', '=', String(stream.id))
      .where('setup.egcs_cn_scopetype', '=', 'transferpaymentstream').where('setup.egcs_cn_entitytype', '=', 'fundingcaseagreement')
      .where('setup.egcs_cn_purpose', '=', 'approval_submission').where('member.egcs_cn_sequence', '=', 1)
      .where('member._deleted', '=', false).execute()
    if (members.length) await db.insertInto('Common_Workflow_Member_Condition').values(members.map(member => ({
      member_id: String(member.id), field_id: String(field.id), option_id: String(option.id)
    }))).execute()
  }

  await publishSeedWorkflowDependencies(db)
  const actor = await db.selectFrom('Common_User').select('id')
    .where('egcs_cn_email', '=', 'root@example.com').where('_deleted', '=', false).executeTakeFirstOrThrow()
  for (const setup of await db.selectFrom('Common_Workflow_Setup')
    .innerJoin('Common_Publication', 'Common_Publication.id', 'Common_Workflow_Setup.id')
    .selectAll('Common_Workflow_Setup').where('Common_Publication.egcs_cn_state', '=', 'draft')
    .where('Common_Workflow_Setup._deleted', '=', false).execute()) {
    const plan = await buildWorkflowSetupPublication(db, setup)
    await publishDefinition(db as Transaction<Database>, {
      publicationId: String(setup.id), kind: 'workflow_setup', definition: plan.definition as unknown as JsonValue,
      references: plan.references, workflowStatuses: plan.statuses, actorId: String(actor.id),
      selections: setup.egcs_cn_purpose === 'standard' ? [] : [{
        dimension: 'scope_entity_purpose',
        key: `${setup.egcs_cn_scopetype}:${setup.egcs_cn_scopeid}:${setup.egcs_cn_entitytype}:${setup.egcs_cn_purpose}`
      }]
    })
  }
}

const seedRootProgramApprovalRole = async (db: Kysely<Database>): Promise<void> => {
  const program = await db
    .selectFrom('Transfer_Payment_Profile')
    .select(['id', 'egcs_tp_agency'])
    .where('_deleted', '=', false)
    .orderBy('id', 'asc')
    .executeTakeFirstOrThrow()

  const rootUser = await db
    .selectFrom('user')
    .select('id')
    .where('email', '=', 'root@example.com')
    .where('_deleted', '=', false)
    .executeTakeFirstOrThrow()

  const role = await db
    .insertInto('role')
    .values({
      name_en: 'Program Approval Manager',
      name_fr: 'Gestionnaire des approbations de programme',
      description_en: 'Manages approval workflows and related operational work for the seeded program.',
      description_fr: "Gère les flux d'approbation et les travaux opérationnels connexes du programme initialisé.",
      agency_id: String(program.egcs_tp_agency),
      _deleted: false
    })
    .returning('id')
    .executeTakeFirstOrThrow()

  const roleId = String(role.id)
  await db
    .insertInto('role_transfer_payment_scope')
    .values({
      role_id: roleId,
      transfer_payment_profile_id: String(program.id),
      _deleted: false
    })
    .execute()

  await db
    .insertInto('role_permission')
    .values((['transfer_payment', 'agreement'] as const).map(subject => ({
      role_id: roleId,
      subject,
      access_level: 'manager' as const,
      can_manage_assignments: subject === 'agreement',
      _deleted: false
    })))
    .execute()

  await db
    .insertInto('user_role_assignment')
    .values({
      user_id: String(rootUser.id),
      role_id: roleId,
      createdAt: new Date(),
      _deleted: false
    })
    .execute()
}

async function seedAmendmentSubtypes(db: Kysely<Database>): Promise<void> {
  const streams = await db.selectFrom('Transfer_Payment_Stream').where('_deleted', '=', false).select(['id']).execute()

  for (const stream of streams) {
    // Seed Types
    const typesToSeed = [
      { code: 'articles', en: 'Articles', fr: 'Articles' },
      { code: 'activities', en: 'Activities', fr: 'Activites' },
      { code: 'budget', en: 'Budget', fr: 'Budget' },
      { code: 'duration', en: 'Duration', fr: 'Duree' },
      { code: 'other', en: 'Other', fr: 'Autre' }
    ] as const

    for (const t of typesToSeed) {
      const typeRecord = await db
        .insertInto('Transfer_Payment_Amendment_Type')
        .values({
          egcs_tp_transferpaymentstream: String(stream.id),
          egcs_tp_amended: t.code,
          egcs_tp_name_en: t.en,
          egcs_tp_name_fr: t.fr,
          egcs_tp_requiresamendmentsubtype: t.code === 'budget',
          _deleted: false
        })
        .returning(['id'])
        .executeTakeFirstOrThrow()

      // Seed Subtype for 'budget'
      if (t.code === 'budget') {
        const subtypeRecord = await db
          .insertInto('Transfer_Payment_Amendment_Subtype')
          .values({
            egcs_tp_transferpaymentstream: String(stream.id),
            egcs_tp_name_en: 'Major Budget Reallocation',
            egcs_tp_name_fr: 'Reallocation budgetaire majeure',
            egcs_tp_description_en: 'Reallocation exceeding 10% of total budget',
            egcs_tp_description_fr: 'Reallocation depassant 10% du budget total',
            _deleted: false
          })
          .returning('id')
          .executeTakeFirstOrThrow()
        await db.insertInto('Transfer_Payment_Amendment_Subtype_Type').values({
          egcs_tp_amendmentsubtype: String(subtypeRecord.id),
          egcs_tp_amendmenttype: String(typeRecord.id),
          _deleted: false
        })
          .execute()
      }
    }
  }
}

async function seedAgreementData(db: Kysely<Database>): Promise<void> {
  const streams = await db
    .selectFrom('Transfer_Payment_Stream')
    .innerJoin('Transfer_Payment_Profile', 'Transfer_Payment_Profile.id', 'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile')
    .innerJoin('Agency_Profile', 'Agency_Profile.id', 'Transfer_Payment_Profile.egcs_tp_agency')
    .innerJoin('Agency_Agreement_Type', 'Agency_Agreement_Type.egcs_ay_organizationagency', 'Agency_Profile.id')
    .where('Transfer_Payment_Stream._deleted', '=', false)
    .where('Transfer_Payment_Profile._deleted', '=', false)
    .where('Agency_Profile._deleted', '=', false)
    .where('Agency_Agreement_Type._deleted', '=', false)
    .select([
      'Transfer_Payment_Stream.id as streamId',
      'Agency_Profile.id as agencyId',
      'Transfer_Payment_Profile.id as profileId',
      'Agency_Profile.egcs_ay_name_en as agencyNameEn',
      'Agency_Profile.egcs_ay_name_fr as agencyNameFr',
      'Transfer_Payment_Profile.egcs_tp_name_en as programNameEn',
      'Transfer_Payment_Profile.egcs_tp_name_fr as programNameFr',
      'Agency_Agreement_Type.id as agreementTypeId'
    ])
    .orderBy('Transfer_Payment_Stream.id', 'asc')
    .execute()

  for (const [index, stream] of streams.entries()) {
    const isCloseoutReadyAgreement = String(stream.streamId) === '32'
    const isDraftApprovalAgreement = String(stream.streamId) === '33'
    const agencyStatusIds = await resolveAgencyStatusIds(db, String(stream.agencyId))
    const holdbackBasisSeeds = [
      { code: 'agreement-total', nameEn: 'Total agreement value', nameFr: "Valeur totale de l'entente" },
      { code: 'final-fiscal-year', nameEn: 'Final fiscal year value', nameFr: 'Valeur du dernier exercice financier' }
    ]
    let agreementTotalStreamHoldbackId = ''
    for (const basisSeed of holdbackBasisSeeds) {
      let agencyHoldback = await db.selectFrom('Agency_Holdback_Basis').select('id')
        .where('egcs_ay_organizationagency', '=', String(stream.agencyId))
        .where('egcs_ay_languageindependentcode', '=', basisSeed.code)
        .where('_deleted', '=', false)
        .executeTakeFirst()
      agencyHoldback ??= await db.insertInto('Agency_Holdback_Basis').values({
        egcs_ay_organizationagency: String(stream.agencyId),
        egcs_ay_languageindependentcode: basisSeed.code,
        egcs_ay_name_en: basisSeed.nameEn,
        egcs_ay_name_fr: basisSeed.nameFr
      }).returning('id').executeTakeFirstOrThrow()
      const streamHoldback = await db.insertInto('Transfer_Payment_Stream_Holdback_Basis').values({
        egcs_tp_transferpaymentstream: String(stream.streamId),
        egcs_tp_agencyholdback: String(agencyHoldback.id),
        egcs_tp_name_en: basisSeed.nameEn,
        egcs_tp_name_fr: basisSeed.nameFr
      }).returning('id').executeTakeFirstOrThrow()
      if (basisSeed.code === 'agreement-total') agreementTotalStreamHoldbackId = String(streamHoldback.id)
    }
    const subtype = await db
      .insertInto('Transfer_Payment_Agreement_Subtype')
      .values({
        egcs_tp_agreementtype: String(stream.agreementTypeId),
        egcs_tp_transferpaymentstream: String(stream.streamId),
        _deleted: false
      })
      .returning('id')
      .executeTakeFirstOrThrow()

    const agreement = await db
      .insertInto('Funding_Case_Agreement_Profile')
      .values({
        egcs_fc_agreementnumber: `AGR-${String(index + 1).padStart(4, '0')}`,
        egcs_fc_transferpaymentstream: String(stream.streamId),
        egcs_fc_status: agencyStatusIds.draft,
        egcs_fc_financialsystemnumber: String(880000000 + index + 1),
        egcs_fc_title_en: String(stream.streamId) === '31'
          ? 'Health Canada Cost Agreement 1 - Showcase'
          : isCloseoutReadyAgreement
            ? 'Environment and Clime Change Canada - Closeout Amendment Ready'
            : `${stream.agencyNameEn} Core Agreement ${index + 1}`,
        egcs_fc_title_fr: isCloseoutReadyAgreement
          ? `Entente prête à la clôture de ${stream.agencyNameFr}`
          : `Entente principale ${index + 1} de ${stream.agencyNameFr}`,
        egcs_fc_description_en: String(stream.streamId) === '31'
          ? STREAM_31_PROJECT_DESCRIPTION_EN
          : `Seeded funding case agreement for ${stream.programNameEn}.`,
        egcs_fc_description_fr: String(stream.streamId) === '31'
          ? STREAM_31_PROJECT_DESCRIPTION_FR
          : `Entente de dossier de financement initialisee pour ${stream.programNameFr}.`,
        egcs_fc_agreementtype: 'grant',
        egcs_fc_agreementsubtype: String(subtype.id),
        egcs_fc_furtherdistribution: false,
        egcs_fc_holdback: 10,
        egcs_fc_holdbackbasis: agreementTotalStreamHoldbackId,
        egcs_fc_riskscore: null,
        egcs_fc_authorizedassistancestartdate: String(stream.streamId) === '31'
          ? new Date('2025-04-01T00:00:00Z')
          : new Date('2026-04-01T00:00:00Z'),
        egcs_fc_authorizedassistanceenddate: new Date('2027-03-31T23:59:59Z'),
        _deleted: false
      })
      .returning('id')
      .executeTakeFirstOrThrow()

    const requiresSeededApproval = ['31', '32'].includes(String(stream.streamId))
    const remainsDraft = isDraftApprovalAgreement || String(stream.streamId) === '34' || requiresSeededApproval
    if (!remainsDraft) {
      await db.updateTable('Funding_Case_Agreement_Profile')
        .set({ egcs_fc_status: agencyStatusIds.active })
        .where('id', '=', String(agreement.id))
        .execute()
    }

    if (String(stream.streamId) === '31') {
      const [applicantRecipient, outcomes] = await Promise.all([
        db
          .selectFrom('Applicant_Recipient_Profile')
          .select('id')
          .where('_deleted', '=', false)
          .orderBy('id', 'asc')
          .executeTakeFirst(),
        db
          .selectFrom('Transfer_Payment_Outcome')
          .select(['id', 'egcs_tp_name_en'])
          .where('egcs_tp_transferpaymentprofile', '=', String(stream.profileId))
          .where('_deleted', '=', false)
          .orderBy('id', 'asc')
          .execute()
      ])

      if (applicantRecipient && outcomes.length > 0) {
        const agreementApplicantRecipient = await db
          .insertInto('Funding_Case_Agreement_Applicant_Recipient')
          .values({
            egcs_fc_fundingagreement: String(agreement.id),
            egcs_fc_applicantrecipient: String(applicantRecipient.id),
            _deleted: false
          })
          .returning('id')
          .executeTakeFirstOrThrow()

        const activities = await db
          .insertInto('Funding_Case_Agreement_Activity')
          .values(outcomes.map((_, outcomeIndex) => {
            const activitySeed = STREAM_31_ACTIVITY_SEEDS[outcomeIndex] ?? STREAM_31_ACTIVITY_SEEDS[0]

            return {
              egcs_fc_fundingagreement: String(agreement.id),
              egcs_fc_name_en: activitySeed.nameEn,
              egcs_fc_name_fr: activitySeed.nameFr,
              egcs_fc_description_en: activitySeed.descriptionEn,
              egcs_fc_description_fr: activitySeed.descriptionFr,
              egcs_fc_expectedresults_en: activitySeed.expectedResultsEn,
              egcs_fc_expectedresults_fr: activitySeed.expectedResultsFr,
              egcs_fc_startdate: new Date(`2026-${String(4 + outcomeIndex).padStart(2, '0')}-01T00:00:00Z`),
              egcs_fc_enddate: new Date(`2026-${String(6 + outcomeIndex).padStart(2, '0')}-28T00:00:00Z`),
              _deleted: false
            }
          }))
          .returning('id')
          .execute()

        await db
          .insertInto('Funding_Case_Agreement_Outcome_Activity')
          .values(activities.map((activity, activityIndex) => ({
            egcs_fc_activity: String(activity.id),
            egcs_fc_outcomes: String(outcomes[activityIndex]?.id ?? ''),
            _deleted: false
          })))
          .execute()

        await db
          .insertInto('Funding_Case_Agreement_Responsible_Party_Activity')
          .values(activities.map(activity => ({
            egcs_fc_activity: String(activity.id),
            egcs_fc_responsibleparty: String(agreementApplicantRecipient.id),
            _deleted: false
          })))
          .execute()
      }

      const agencyFiscalYears = await db
        .selectFrom('Agency_Fiscal_Year')
        .innerJoin('Transfer_Payment_Profile', 'Transfer_Payment_Profile.egcs_tp_agency', 'Agency_Fiscal_Year.egcs_ay_organizationagency')
        .innerJoin('Transfer_Payment_Stream', 'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile', 'Transfer_Payment_Profile.id')
        .where('Transfer_Payment_Stream.id', '=', String(stream.streamId))
        .where('Agency_Fiscal_Year._deleted', '=', false)
        .where('Transfer_Payment_Profile._deleted', '=', false)
        .where('Transfer_Payment_Stream._deleted', '=', false)
        .select('Agency_Fiscal_Year.id as id')
        .orderBy('Agency_Fiscal_Year.egcs_ay_fiscalyear', 'asc')
        .execute()

      const streamCostLineItems = await db
        .selectFrom('Transfer_Payment_Stream_Cost_Category_Line_Item')
        .where('egcs_tp_transferpaymentstream', '=', String(stream.streamId))
        .where('_deleted', '=', false)
        .select('id')
        .orderBy('id', 'asc')
        .limit(2)
        .execute()

      if (agencyFiscalYears.length > 0 && streamCostLineItems.length > 0) {
        const budgetFiscalYears = await db
          .insertInto('Funding_Case_Agreement_Budget_Fiscal_Year')
          .values(agencyFiscalYears.slice(0, 2).map(agencyFiscalYear => ({
            egcs_fc_fundingagreement: String(agreement.id),
            egcs_fc_fiscalyear: String(agencyFiscalYear.id),
            _deleted: false
          })))
          .returning('id')
          .execute()

        const budgetFiscalYear = getRequiredAt(budgetFiscalYears, 0, 'agreement 51 first budget fiscal year')

        const budgetLineItems = await db
          .insertInto('Funding_Case_Agreement_Budget_Line_Item')
          .values(budgetFiscalYears.flatMap((year, yearIndex) =>
            streamCostLineItems.map((lineItem, lineIndex) => {
              const isDelivery = lineIndex === 0
              const deliveryDescriptions: [string, string] = [
                'Participant travel, local transit, and outreach expenses required for intake appointments, training attendance, employer meetings, and wraparound service referrals during the first delivery period.',
                'Participant travel, local transit, and employer engagement expenses required to maintain training attendance, support work placements, and complete follow-up activities during the second delivery period.'
              ]
              const administrationDescriptions: [string, string] = [
                'Laptop and case-management equipment used by project staff to maintain participant files, track referrals, support virtual coaching, and prepare departmental performance reports.',
                'Replacement equipment, accessibility peripherals, and secure project administration tools required to complete reporting, claims preparation, and participant follow-up through close-out.'
              ]

              return {
                egcs_fc_fundingagreementbudgetfiscalyear: String(year.id),
                egcs_fc_organizationcostcategory: String(lineItem.id),
                egcs_fc_costsubsection: isDelivery ? 'Delivery' : 'Administration',
                egcs_fc_description: isDelivery
                  ? (deliveryDescriptions[yearIndex] ?? deliveryDescriptions[0])
                  : (administrationDescriptions[yearIndex] ?? administrationDescriptions[0]),
                egcs_fc_totalamount: seedMoney(yearIndex === 0
                  ? (isDelivery ? '60.00' : '15.00')
                  : (isDelivery ? '70.00' : '20.00')),
                egcs_fc_programfunding: seedMoney(yearIndex === 0
                  ? (isDelivery ? '60.00' : '15.00')
                  : (isDelivery ? '70.00' : '20.00')),
                egcs_fc_otherfederalfunding: seedMoney('0.00'),
                egcs_fc_othergovfunding: seedMoney('0.00'),
                egcs_fc_otherfunding: seedMoney('0.00'),
                egcs_fc_currency: 'cad',
                _deleted: false
              }
            })
          ))
          .returning(['id', 'egcs_fc_fundingagreementbudgetfiscalyear'])
          .execute()

        const paymentChartOfAccounts = await db
          .selectFrom('Transfer_Payment_Stream_Chart_of_Account')
          .select('Transfer_Payment_Stream_Chart_of_Account.id')
          .where('Transfer_Payment_Stream_Chart_of_Account.egcs_tp_transferpaymentstream', '=', String(stream.streamId))
          .where('Transfer_Payment_Stream_Chart_of_Account._deleted', '=', false)
          .orderBy('Transfer_Payment_Stream_Chart_of_Account.id', 'asc')
          .limit(2)
          .execute()

        const commitmentTypes = await db.selectFrom('Transfer_Payment_Stream_Commitment_Type')
          .select(['id', 'egcs_tp_name_en'])
          .where('egcs_tp_transferpaymentstream', '=', String(stream.streamId))
          .where('_deleted', '=', false)
          .execute()
        const commitmentTypeByName = new Map(commitmentTypes.map(type => [type.egcs_tp_name_en, String(type.id)]))
        const commitmentTypeId = commitmentTypeByName.get('Commitment')
        const payeTypeId = commitmentTypeByName.get('PAYE')
        const seededCaseworkUser = await db
          .selectFrom('Common_User')
          .select('id')
          .where('egcs_cn_email', '=', 'user11@example.com')
          .where('_deleted', '=', false)
          .executeTakeFirstOrThrow()

        if (paymentChartOfAccounts.length === 2 && commitmentTypeId && payeTypeId) {
          const commitment = await db.insertInto('Funding_Case_Agreement_Commitment').values({
            egcs_fc_fundingagreement: String(agreement.id), egcs_fc_type: commitmentTypeId,
            egcs_fc_status: agencyStatusIds.draft,
            egcs_fc_financialsystemnumber: '510001', egcs_fc_active: true, _deleted: false
          }).returning('id').executeTakeFirstOrThrow()
          await db.updateTable('Funding_Case_Agreement_Commitment')
            .set({ egcs_fc_status: agencyStatusIds.active })
            .where('id', '=', String(commitment.id))
            .execute()
          const commitmentApprovalTemplate = await db.selectFrom('Common_Approval_Template')
            .select('id')
            .where('egcs_cn_scopetype', '=', 'transferpaymentstream')
            .where('egcs_cn_scopeid', '=', String(stream.streamId))
            .where('egcs_cn_name_en', '=', 'Agreement Commitment Approval Template')
            .where('_deleted', '=', false)
            .executeTakeFirstOrThrow()
          await materializeSeedApprovalRuntime(db, {
            entityType: 'fundingcaseagreementcommitment',
            entityId: String(commitment.id),
            nameEn: 'Agreement 51 payment-eligible commitment approval',
            nameFr: "Approbation de l'engagement admissible au paiement de l'entente 51",
            approvalTemplateId: String(commitmentApprovalTemplate.id),
            finalState: 'approved',
            approvalDate: new Date('2026-07-18T00:00:00Z')
          })
          const commitmentLines = await db.insertInto('Funding_Case_Agreement_Commitment_Line').values([
            { egcs_fc_commitment: String(commitment.id), egcs_fc_commitmentlinenumber: 1, egcs_fc_transferpaymentstreamchartofaccount: String(paymentChartOfAccounts[0]!.id), egcs_fc_amount: seedMoney('60.00'), _deleted: false },
            { egcs_fc_commitment: String(commitment.id), egcs_fc_commitmentlinenumber: 2, egcs_fc_transferpaymentstreamchartofaccount: String(paymentChartOfAccounts[1]!.id), egcs_fc_amount: seedMoney('15.00'), _deleted: false }
          ]).returning('id').execute()
          const draftCommitment = await db.insertInto('Funding_Case_Agreement_Commitment').values({
            egcs_fc_fundingagreement: String(agreement.id), egcs_fc_type: payeTypeId,
            egcs_fc_status: agencyStatusIds.draft,
            egcs_fc_financialsystemnumber: '510002', egcs_fc_active: false, _deleted: false
          }).returning('id').executeTakeFirstOrThrow()
          await db.insertInto('Funding_Case_Agreement_Commitment_Line').values([
            { egcs_fc_commitment: String(draftCommitment.id), egcs_fc_commitmentlinenumber: 1, egcs_fc_transferpaymentstreamchartofaccount: String(paymentChartOfAccounts[0]!.id), egcs_fc_amount: seedMoney('45.00'), _deleted: false },
            { egcs_fc_commitment: String(draftCommitment.id), egcs_fc_commitmentlinenumber: 2, egcs_fc_transferpaymentstreamchartofaccount: String(paymentChartOfAccounts[1]!.id), egcs_fc_amount: seedMoney('10.00'), _deleted: false }
          ]).execute()
          const payment = await db.insertInto('Funding_Case_Agreement_Payment').values({
            egcs_fc_fundingagreementcommitment: String(commitment.id), egcs_fc_fiscalyear: String(budgetFiscalYear.id),
            egcs_fc_paymenttype: 'advance', egcs_fc_periodstart: 0, egcs_fc_periodend: 2, egcs_fc_paymentamount: seedMoney('50.00'),
            egcs_fc_currency: 'cad',
            egcs_fc_comment: 'Seeded draft payment for testing the completion, approval, and recommendation workflow.',
            egcs_fc_status: agencyStatusIds.draft, _deleted: false
          }).returning('id').executeTakeFirstOrThrow()
          await db.insertInto('Funding_Case_Agreement_Payment_Line').values([
            { egcs_fc_fundingagreementpayment: String(payment.id), egcs_fc_fundingagreementcommitmentline: String(commitmentLines[0]!.id), egcs_fc_amount: seedMoney('40.00'), _deleted: false },
            { egcs_fc_fundingagreementpayment: String(payment.id), egcs_fc_fundingagreementcommitmentline: String(commitmentLines[1]!.id), egcs_fc_amount: seedMoney('10.00'), _deleted: false }
          ]).execute()
          await db.insertInto('extensions.kv_entry').values({
            extension_key: AUTOMATED_PAYMENTS_EXTENSION_KEY,
            owner_type: 'fundingcasepayment',
            owner_id: String(payment.id),
            config_key: 'payment-metadata',
            value: { releaseHoldback: false, holdbackReleaseAmount: '0.00' },
            _deleted: false
          }).execute()
        }

        const forecast = await db
          .insertInto('Funding_Case_Agreement_Forecast')
          .values({
            egcs_fc_fundingagreement: String(agreement.id),
            egcs_fc_fiscalyear: String(budgetFiscalYear.id),
            egcs_fc_status: agencyStatusIds.draft,
            _deleted: false
          })
          .returning('id')
          .executeTakeFirstOrThrow()
        await db.updateTable('Funding_Case_Agreement_Forecast')
          .set({ egcs_fc_status: agencyStatusIds.inProgress })
          .where('id', '=', String(forecast.id))
          .execute()

        const forecastLineSeeds = [
          { lineIndex: 0, month: 0, amount: '20.00' },
          { lineIndex: 0, month: 1, amount: '20.00' },
          { lineIndex: 1, month: 2, amount: '15.00' },
          { lineIndex: 0, month: 3, amount: '5.00' },
          { lineIndex: 0, month: 4, amount: '5.00' },
          { lineIndex: 0, month: 5, amount: '10.00' }
        ] as const

        await db
          .insertInto('Funding_Case_Agreement_Forecast_Line_Item')
          .values(forecastLineSeeds.map(seed => ({
            egcs_fc_agreementforecast: String(forecast.id),
            egcs_fc_fundingagreementbudgetlineitem: String(budgetLineItems[seed.lineIndex]?.id),
            egcs_fc_month: seed.month,
            egcs_fc_amount: seedMoney(seed.amount),
            egcs_fc_currency: 'cad',
            egcs_fc_version: '0',
            _deleted: false
          })))
          .execute()

        const claim = await db
          .insertInto('Funding_Case_Agreement_Claim')
          .values({
            egcs_fc_fundingagreement: String(agreement.id),
            egcs_fc_fiscalyear: String(budgetFiscalYear.id),
            egcs_fc_isfinalforyear: false,
            egcs_fc_periodstart: 0,
            egcs_fc_periodend: 2,
            egcs_fc_receiveddate: new Date('2026-07-15T00:00:00Z'),
            egcs_fc_status: agencyStatusIds.draft,
            _deleted: false
          })
          .returning('id')
          .executeTakeFirstOrThrow()
        await db.updateTable('Funding_Case_Agreement_Claim')
          .set({ egcs_fc_status: agencyStatusIds.inReview })
          .where('id', '=', String(claim.id))
          .execute()

        await db
          .insertInto('Common_Completion')
          .values({
            egcs_cn_entitytype: 'fundingcaseagreementclaim',
            egcs_cn_entityid: String(claim.id),
            egcs_cn_comments: 'Seeded claim completion evidence for reconciliation processing.',
            egcs_cn_user: String(seededCaseworkUser.id),
            egcs_cn_disposition: 'no_workflow',
            egcs_cn_completedat: new Date('2026-07-19T00:00:00Z'),
            _deleted: false
          })
          .execute()

        const claimStandardTemplates = await db.insertInto('Common_Approval_Template').values([
          {
            egcs_cn_scopetype: 'transferpaymentstream', egcs_cn_scopeid: String(stream.streamId),
            egcs_cn_name_en: 'Claim quality assurance', egcs_cn_name_fr: 'Assurance de la qualité de la réclamation',
            egcs_cn_description_en: 'Optional post-completion quality assurance for a Claim.',
            egcs_cn_description_fr: 'Assurance de la qualité facultative après l’achèvement d’une réclamation.', _deleted: false
          },
          {
            egcs_cn_scopetype: 'transferpaymentstream', egcs_cn_scopeid: String(stream.streamId),
            egcs_cn_name_en: 'Claim compliance follow-up', egcs_cn_name_fr: 'Suivi de la conformité de la réclamation',
            egcs_cn_description_en: 'Optional post-completion compliance follow-up for a Claim.',
            egcs_cn_description_fr: 'Suivi facultatif de la conformité après l’achèvement d’une réclamation.', _deleted: false
          }
        ]).returning(['id', 'egcs_cn_name_en', 'egcs_cn_name_fr']).execute()
        await db.insertInto('Common_Approval_Step').values(claimStandardTemplates.map(template => ({
          egcs_cn_sequence: 1, egcs_cn_name_en: template.egcs_cn_name_en, egcs_cn_name_fr: template.egcs_cn_name_fr,
          egcs_cn_description_en: 'Record the optional workflow decision.',
          egcs_cn_description_fr: 'Consigner la décision du flux de travail facultatif.',
          egcs_cn_approvaltemplate: String(template.id), egcs_cn_defaultuser: String(seededCaseworkUser.id),
          egcs_cn_approvertitle: 'Program Officer'
        }))).execute()
        await publishSeedWorkflowDependencies(db)
        const claimStandardWorkflows = await db.insertInto('Common_Workflow_Setup').values(claimStandardTemplates.map(template => ({
          egcs_cn_scopetype: 'transferpaymentstream' as const, egcs_cn_scopeid: String(stream.streamId),
          egcs_cn_entitytype: 'fundingcaseagreementclaim' as const, egcs_cn_purpose: 'standard' as const,
          egcs_cn_name_en: template.egcs_cn_name_en, egcs_cn_name_fr: template.egcs_cn_name_fr,
          egcs_cn_description_en: `Run ${template.egcs_cn_name_en.toLocaleLowerCase()} against the completed demo Claim.`,
          egcs_cn_description_fr: `Exécuter ${template.egcs_cn_name_fr.toLocaleLowerCase('fr')} pour la réclamation de démonstration achevée.`,
          egcs_cn_cancellationstatus: agencyStatusIds.cancelled, egcs_cn_executionfailurestatus: agencyStatusIds.denied,
          egcs_cn_allowretry: true, _deleted: false
        }))).returning('id').execute()
        for (const workflow of claimStandardWorkflows) {
          await insertWorkflowAllowedStartStatuses(db, String(workflow.id), [agencyStatusIds.inReview])
        }
        await db.insertInto('Common_Workflow_Setup_Member').values(claimStandardWorkflows.map((workflow, index) => ({
          egcs_cn_workflowsetup: String(workflow.id), egcs_cn_sequence: 1, egcs_cn_kind: 'approval_template' as const,
          egcs_cn_approvaltemplate: String(claimStandardTemplates[index]!.id),
          egcs_cn_successstatus: agencyStatusIds.inReview, egcs_cn_failurestatus: agencyStatusIds.denied, _deleted: false
        }))).execute()
        const standardWorkflowActor = await db.selectFrom('Common_User').select('id')
          .where('egcs_cn_email', '=', 'root@example.com').where('_deleted', '=', false).executeTakeFirstOrThrow()
        for (const workflow of claimStandardWorkflows) {
          const setup = await db.selectFrom('Common_Workflow_Setup').selectAll()
            .where('id', '=', String(workflow.id)).executeTakeFirstOrThrow()
          const plan = await buildWorkflowSetupPublication(db, setup)
          await publishDefinition(db as Transaction<Database>, {
            publicationId: String(setup.id), kind: 'workflow_setup', definition: plan.definition as unknown as JsonValue,
            references: plan.references, workflowStatuses: plan.statuses,
            actorId: String(standardWorkflowActor.id), selections: []
          })
        }

        const claimBudgetLineItems = budgetLineItems.filter(budgetLine =>
          budgetFiscalYears.some((year, yearIndex) =>
            yearIndex === 0 && String(year.id) === String(budgetLine.egcs_fc_fundingagreementbudgetfiscalyear)
          )
        )

        const claimLineItems = await db
          .insertInto('Funding_Case_Agreement_Claim_Line_Item')
          .values(claimBudgetLineItems.map((budgetLine, lineIndex) => ({
            egcs_fc_fundingagreementclaim: String(claim.id),
            egcs_fc_fundingagreementbudgetlineitem: String(budgetLine.id),
            egcs_fc_description: lineIndex === 0
              ? 'Seeded submitted delivery costs.'
              : 'Seeded submitted administrative costs.',
            egcs_fc_amount: seedMoney(lineIndex === 0 ? '25.00' : '10.00'),
            egcs_fc_currency: 'cad',
            _deleted: false
          })))
          .returning('id')
          .execute()

        const claimReconcileApprovalTemplate = await db
          .selectFrom('Common_Approval_Template')
          .select('id')
          .where('egcs_cn_scopetype', '=', 'transferpaymentstream')
          .where('egcs_cn_scopeid', '=', String(stream.streamId))
          .where('egcs_cn_name_en', '=', 'Claim Reconciliation Approval Template')
          .where('_deleted', '=', false)
          .executeTakeFirstOrThrow()

        const completedReconcile = await db
          .insertInto('Funding_Case_Agreement_Claim_Reconcile')
          .values({
            egcs_fc_fundingagreementclaim: String(claim.id),
            egcs_fc_user: String(seededCaseworkUser.id),
            egcs_fc_status: agencyStatusIds.draft,
            egcs_fc_isfinal: true,
            _deleted: false
          })
          .returning('id')
          .executeTakeFirstOrThrow()
        await db.updateTable('Funding_Case_Agreement_Claim_Reconcile')
          .set({ egcs_fc_status: agencyStatusIds.pendingApproval })
          .where('id', '=', String(completedReconcile.id))
          .execute()

        await db
          .insertInto('Funding_Case_Agreement_Claim_Reconcile_Line_Item')
          .values(claimLineItems.map((claimLine, lineIndex) => ({
            egcs_fc_fundingagreementclaimreconcile: String(completedReconcile.id),
            egcs_fc_lineitem: String(claimLine.id),
            egcs_fc_reconciled: seedMoney(lineIndex === 0 ? '25.00' : '10.00'),
            egcs_fc_sampled: seedMoney(lineIndex === 0 ? '10.00' : '5.00'),
            egcs_fc_rationale: lineIndex === 0
              ? 'Seeded completed reconciliation sample for delivery costs.'
              : 'Seeded completed reconciliation sample for administrative costs.',
            _deleted: false
          })))
          .execute()

        await db
          .insertInto('Common_Completion')
          .values({
            egcs_cn_entitytype: 'fundingclaimreconcile',
            egcs_cn_entityid: String(completedReconcile.id),
            egcs_cn_comments: 'Seeded completion for claim reconciliation approval testing.',
            egcs_cn_user: String(seededCaseworkUser.id),
            egcs_cn_disposition: 'workflow_started',
            egcs_cn_completedat: new Date('2026-07-20T00:00:00Z'),
            _deleted: false
          })
          .execute()

        await materializeSeedApprovalRuntime(db, {
          entityType: 'fundingclaimreconcile',
          entityId: String(completedReconcile.id),
          nameEn: 'Agreement 51 Claim Reconciliation',
          nameFr: "Rapprochement de réclamation de l'entente 51",
          approvalTemplateId: String(claimReconcileApprovalTemplate.id)
        })

        const draftReconcile = await db
          .insertInto('Funding_Case_Agreement_Claim_Reconcile')
          .values({
            egcs_fc_fundingagreementclaim: String(claim.id),
            egcs_fc_user: String(seededCaseworkUser.id),
            egcs_fc_status: agencyStatusIds.draft,
            egcs_fc_isfinal: false,
            _deleted: false
          })
          .returning('id')
          .executeTakeFirstOrThrow()

        await db
          .insertInto('Funding_Case_Agreement_Claim_Reconcile_Line_Item')
          .values(claimLineItems.map((claimLine, lineIndex) => ({
            egcs_fc_fundingagreementclaimreconcile: String(draftReconcile.id),
            egcs_fc_lineitem: String(claimLine.id),
            egcs_fc_reconciled: seedMoney(lineIndex === 0 ? '25.00' : '10.00'),
            egcs_fc_sampled: seedMoney(lineIndex === 0 ? '10.00' : '5.00'),
            egcs_fc_rationale: lineIndex === 0
              ? 'Seeded draft reconciliation follow-up for delivery costs.'
              : 'Seeded draft reconciliation follow-up for administrative costs.',
            _deleted: false
          })))
          .execute()

        const draftClaim = await db
          .insertInto('Funding_Case_Agreement_Claim')
          .values({
            egcs_fc_fundingagreement: String(agreement.id),
            egcs_fc_fiscalyear: String(budgetFiscalYear.id),
            egcs_fc_isfinalforyear: false,
            egcs_fc_periodstart: 3,
            egcs_fc_periodend: 5,
            egcs_fc_receiveddate: new Date('2026-10-15T00:00:00Z'),
            egcs_fc_status: agencyStatusIds.draft,
            _deleted: false
          })
          .returning('id')
          .executeTakeFirstOrThrow()

        await db.insertInto('Funding_Case_Agreement_Claim_Line_Item').values(
          claimBudgetLineItems.map((budgetLine, lineIndex) => ({
            egcs_fc_fundingagreementclaim: String(draftClaim.id),
            egcs_fc_fundingagreementbudgetlineitem: String(budgetLine.id),
            egcs_fc_description: lineIndex === 0
              ? 'Seeded draft delivery costs for workflow testing.'
              : 'Seeded draft administrative costs for workflow testing.',
            egcs_fc_amount: seedMoney(lineIndex === 0 ? '20.00' : '5.00'),
            egcs_fc_currency: 'cad',
            _deleted: false
          }))
        ).execute()

        const allocationCommitmentType = await db.selectFrom('Transfer_Payment_Stream_Commitment_Type')
          .select('id')
          .where('egcs_tp_transferpaymentstream', '=', String(stream.streamId))
          .where('egcs_tp_name_en', '=', 'Commitment')
          .where('_deleted', '=', false)
          .executeTakeFirstOrThrow()
        const allocationCoordinates = await db
          .selectFrom('Funding_Case_Agreement_Budget_Fiscal_Year as agreement_year')
          .innerJoin('Transfer_Payment_Fiscal_Year_Budget as fiscal_budget', join => join
            .onRef('fiscal_budget.egcs_tp_fiscalyear', '=', 'agreement_year.egcs_fc_fiscalyear')
            .on('fiscal_budget.egcs_tp_transferpaymentprofile', '=', String(stream.profileId))
            .on('fiscal_budget._deleted', '=', false))
          .innerJoin('Transfer_Payment_Stream_Budget as stream_budget', join => join
            .onRef('stream_budget.egcs_tp_transferpaymentbudget', '=', 'fiscal_budget.id')
            .on('stream_budget.egcs_tp_transferpaymentstream', '=', String(stream.streamId))
            .on('stream_budget._deleted', '=', false))
          .innerJoin('Transfer_Payment_Stream_Chart_of_Account as chart', join => join
            .onRef('chart.egcs_tp_streambudget', '=', 'stream_budget.id')
            .on('chart.egcs_tp_transferpaymentstream', '=', String(stream.streamId))
            .on('chart._deleted', '=', false))
          .select([
            'agreement_year.id as agreementYearId',
            'stream_budget.id as streamBudgetId',
            'chart.id as chartId'
          ])
          .where('agreement_year.egcs_fc_fundingagreement', '=', String(agreement.id))
          .where('agreement_year._deleted', '=', false)
          .orderBy('agreement_year.id', 'asc')
          .orderBy('chart.id', 'asc')
          .execute()
        const chartsByYear = Map.groupBy(allocationCoordinates, row => String(row.agreementYearId))
        await db.updateTable('extensions.stream_configuration').set({
          config: {
            enabledCommitmentTypes: [String(allocationCommitmentType.id)],
            mappings: Array.from(chartsByYear.values()).flatMap(coordinates =>
              coordinates.slice(0, 2).map((coordinate, coordinateIndex) => ({
                commitmentType: String(allocationCommitmentType.id),
                outcomeId: String(outcomes[coordinateIndex]!.id),
                streamBudgetId: String(coordinate.streamBudgetId),
                streamCommitmentId: String(coordinate.chartId)
              })))
          }
        }).where('extension_key', '=', OUTCOME_COST_ALLOCATION_EXTENSION_KEY)
          .where('stream_id', '=', String(stream.streamId))
          .where('_deleted', '=', false)
          .execute()
      }
    }

    if (isCloseoutReadyAgreement) {
      const [applicantRecipient, outcome, fiscalYears, costLineItems] = await Promise.all([
        db.selectFrom('Applicant_Recipient_Profile').select('id')
          .where('_deleted', '=', false).orderBy('id', 'asc').executeTakeFirstOrThrow(),
        db.selectFrom('Transfer_Payment_Outcome').select('id')
          .where('egcs_tp_transferpaymentprofile', '=', String(stream.profileId))
          .where('_deleted', '=', false).orderBy('id', 'asc').executeTakeFirstOrThrow(),
        db.selectFrom('Agency_Fiscal_Year').select('id')
          .where('egcs_ay_organizationagency', '=', String(stream.agencyId))
          .where('_deleted', '=', false).orderBy('egcs_ay_fiscalyear', 'asc').limit(2).execute(),
        db.selectFrom('Transfer_Payment_Stream_Cost_Category_Line_Item').select('id')
          .where('egcs_tp_transferpaymentstream', '=', String(stream.streamId))
          .where('_deleted', '=', false).orderBy('id', 'asc').limit(2).execute()
      ])
      if (fiscalYears.length < 2 || costLineItems.length < 2) {
        throw new Error('Closeout-ready Agreement fixture requires two fiscal years and two cost line items')
      }
      const agreementRecipient = await db.insertInto('Funding_Case_Agreement_Applicant_Recipient').values({
        egcs_fc_fundingagreement: String(agreement.id),
        egcs_fc_applicantrecipient: String(applicantRecipient.id),
        _deleted: false
      }).returning('id').executeTakeFirstOrThrow()
      const activities = await db.insertInto('Funding_Case_Agreement_Activity').values([
        {
          egcs_fc_fundingagreement: String(agreement.id),
          egcs_fc_name_en: 'Community climate resilience planning',
          egcs_fc_name_fr: 'Planification de la résilience climatique communautaire',
          egcs_fc_description_en: 'Develop community risk profiles and practical climate adaptation plans with municipal and Indigenous partners.',
          egcs_fc_description_fr: 'Élaborer des profils de risque communautaires et des plans pratiques d’adaptation climatique avec des partenaires municipaux et autochtones.',
          egcs_fc_expectedresults_en: 'Five communities adopt funded, implementation-ready climate resilience plans.',
          egcs_fc_expectedresults_fr: 'Cinq collectivités adoptent des plans de résilience climatique financés et prêts à être mis en œuvre.',
          egcs_fc_startdate: new Date('2026-04-01T00:00:00Z'),
          egcs_fc_enddate: new Date('2026-12-31T00:00:00Z'), _deleted: false
        },
        {
          egcs_fc_fundingagreement: String(agreement.id),
          egcs_fc_name_en: 'Adaptation pilot implementation',
          egcs_fc_name_fr: 'Mise en œuvre de projets pilotes d’adaptation',
          egcs_fc_description_en: 'Deliver priority flood, heat, and emergency-preparedness pilot projects identified through the resilience plans.',
          egcs_fc_description_fr: 'Réaliser les projets pilotes prioritaires liés aux inondations, à la chaleur et à la préparation aux urgences recensés dans les plans de résilience.',
          egcs_fc_expectedresults_en: 'Pilot projects demonstrate measurable risk reduction and produce reusable implementation guidance.',
          egcs_fc_expectedresults_fr: 'Les projets pilotes démontrent une réduction mesurable des risques et produisent des conseils de mise en œuvre réutilisables.',
          egcs_fc_startdate: new Date('2026-09-01T00:00:00Z'),
          egcs_fc_enddate: new Date('2027-03-31T00:00:00Z'), _deleted: false
        }
      ]).returning('id').execute()
      await db.insertInto('Funding_Case_Agreement_Outcome_Activity').values(activities.map(activity => ({
        egcs_fc_activity: String(activity.id), egcs_fc_outcomes: String(outcome.id), _deleted: false
      }))).execute()
      await db.insertInto('Funding_Case_Agreement_Responsible_Party_Activity').values(activities.map(activity => ({
        egcs_fc_activity: String(activity.id), egcs_fc_responsibleparty: String(agreementRecipient.id), _deleted: false
      }))).execute()
      const budgetYears = await db.insertInto('Funding_Case_Agreement_Budget_Fiscal_Year').values(
        fiscalYears.map(fiscalYear => ({
          egcs_fc_fundingagreement: String(agreement.id), egcs_fc_fiscalyear: String(fiscalYear.id), _deleted: false
        }))
      ).returning('id').execute()
      await db.insertInto('Funding_Case_Agreement_Budget_Line_Item').values(
        budgetYears.flatMap((budgetYear, yearIndex) => costLineItems.map((costLineItem, lineIndex) => ({
          egcs_fc_fundingagreementbudgetfiscalyear: String(budgetYear.id),
          egcs_fc_organizationcostcategory: String(costLineItem.id),
          egcs_fc_costsubsection: lineIndex === 0 ? 'Project delivery' : 'Project administration',
          egcs_fc_description: lineIndex === 0
            ? `Community engagement, technical analysis, and pilot delivery costs for project year ${yearIndex + 1}.`
            : `Project coordination, financial administration, and performance reporting costs for project year ${yearIndex + 1}.`,
          egcs_fc_totalamount: seedMoney(yearIndex === 0 ? (lineIndex === 0 ? '240000.00' : '60000.00') : (lineIndex === 0 ? '320000.00' : '80000.00')),
          egcs_fc_programfunding: seedMoney(yearIndex === 0 ? (lineIndex === 0 ? '200000.00' : '50000.00') : (lineIndex === 0 ? '260000.00' : '65000.00')),
          egcs_fc_otherfederalfunding: seedMoney('0.00'),
          egcs_fc_othergovfunding: seedMoney(yearIndex === 0 ? (lineIndex === 0 ? '25000.00' : '5000.00') : (lineIndex === 0 ? '40000.00' : '10000.00')),
          egcs_fc_otherfunding: seedMoney(yearIndex === 0 ? (lineIndex === 0 ? '15000.00' : '5000.00') : (lineIndex === 0 ? '20000.00' : '5000.00')),
          egcs_fc_currency: 'cad', _deleted: false
        })))
      ).execute()
    }
  }
}

const seedAgreement51Closeout = async (db: Kysely<Database>): Promise<void> => {
  const agreement = await db.selectFrom('Funding_Case_Agreement_Profile')
    .innerJoin('Transfer_Payment_Stream', 'Transfer_Payment_Stream.id', 'Funding_Case_Agreement_Profile.egcs_fc_transferpaymentstream')
    .innerJoin('Transfer_Payment_Profile', 'Transfer_Payment_Profile.id', 'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile')
    .select('Transfer_Payment_Profile.egcs_tp_agency as agencyId')
    .where('Funding_Case_Agreement_Profile.id', '=', '51')
    .where('Funding_Case_Agreement_Profile._deleted', '=', false).executeTakeFirstOrThrow()
  const agencyStatusIds = await resolveAgencyStatusIds(db, String(agreement.agencyId))
  await db.insertInto('Funding_Case_Agreement_Closeout').values({
    egcs_fc_fundingagreement: '51', egcs_fc_closeoutnumber: 1,
    egcs_fc_status: agencyStatusIds.draft, egcs_fc_isopen: true, _deleted: false
  }).execute()
}

const seedAgreementMonitorData = async (db: Kysely<Database>): Promise<void> => {
  const agreement = await db
    .selectFrom('Funding_Case_Agreement_Profile')
    .innerJoin(
      'Transfer_Payment_Stream',
      'Transfer_Payment_Stream.id',
      'Funding_Case_Agreement_Profile.egcs_fc_transferpaymentstream'
    )
    .innerJoin(
      'Transfer_Payment_Profile',
      'Transfer_Payment_Profile.id',
      'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile'
    )
    .select([
      'Funding_Case_Agreement_Profile.id as agreementId',
      'Funding_Case_Agreement_Profile.egcs_fc_transferpaymentstream as streamId',
      'Transfer_Payment_Profile.egcs_tp_agency as agencyId'
    ])
    .where('Funding_Case_Agreement_Profile.id', '=', '51')
    .where('Funding_Case_Agreement_Profile._deleted', '=', false)
    .executeTakeFirst()

  if (!agreement) {
    return
  }
  const agencyStatusIds = await resolveAgencyStatusIds(db, String(agreement.agencyId))

  const fiscalYears = await db
    .selectFrom('Agency_Fiscal_Year')
    .select(['id', 'egcs_ay_fiscalyear'])
    .where('egcs_ay_organizationagency', '=', String(agreement.agencyId))
    .where('_deleted', '=', false)
    .orderBy('egcs_ay_fiscalyear', 'asc')
    .execute()

  if (fiscalYears.length < 2) {
    return
  }

  const monitorTypes = await db
    .insertInto('Transfer_Payment_Monitor_Type')
    .values([
      {
        egcs_tp_name_en: 'Financial desk review',
        egcs_tp_name_fr: 'Examen financier sur dossier',
        egcs_tp_transferpaymentstream: String(agreement.streamId),
        _deleted: false
      },
      {
        egcs_tp_name_en: 'Recipient site visit',
        egcs_tp_name_fr: 'Visite sur place du bénéficiaire',
        egcs_tp_transferpaymentstream: String(agreement.streamId),
        _deleted: false
      },
      {
        egcs_tp_name_en: 'Performance follow-up',
        egcs_tp_name_fr: 'Suivi du rendement',
        egcs_tp_transferpaymentstream: String(agreement.streamId),
        _deleted: false
      }
    ])
    .returning(['id', 'egcs_tp_name_en'])
    .execute()

  const monitorTypeByName = new Map(monitorTypes.map(monitorType => [monitorType.egcs_tp_name_en, String(monitorType.id)]))
  const firstFiscalYear = getRequiredAt(fiscalYears, 0, 'agreement monitor first fiscal year')
  const secondFiscalYear = getRequiredAt(fiscalYears, 1, 'agreement monitor second fiscal year')
  const firstFiscalYearId = String(firstFiscalYear.id)
  const secondFiscalYearId = String(secondFiscalYear.id)

  const monitorSeeds = [
    {
      typeName: 'Financial desk review',
      onsite: false,
      fiscalYearId: firstFiscalYearId,
      quarter: 1,
      objective: 'Confirm eligible delivery costs and supporting documentation for the first quarter.',
      item: 'Q1 delivery-cost sample',
      detail: 'Review invoices, proof of payment, and recipient allocation worksheet.',
      monitored: true,
      plannedStart: new Date('2026-06-01T00:00:00Z'),
      plannedEnd: new Date('2026-06-14T00:00:00Z'),
      actualStart: new Date('2026-06-03T00:00:00Z'),
      actualEnd: new Date('2026-06-12T00:00:00Z'),
      finding: 'Documentation gap',
      recommendation: 'mandatoryaction',
      responsible: 'applicantrecipient',
      findingDetail: 'Two sampled transactions require clearer proof of payment and allocation support.',
      followup: 'Submit revised support package',
      status: 'open',
      dueDate: new Date('2026-07-15T00:00:00Z'),
      updateDate: new Date('2026-06-20T00:00:00Z'),
      update: 'Recipient acknowledged the request and is gathering the missing documents.',
      practice: 'The recipient maintains a clear transaction index that makes sample selection efficient.'
    },
    {
      typeName: 'Recipient site visit',
      onsite: true,
      fiscalYearId: firstFiscalYearId,
      quarter: 2,
      objective: 'Validate program delivery controls through an on-site monitoring visit.',
      item: 'On-site control walkthrough',
      detail: 'Meet delivery staff, inspect client files, and verify sign-off controls.',
      monitored: true,
      plannedStart: new Date('2026-09-08T00:00:00Z'),
      plannedEnd: new Date('2026-09-10T00:00:00Z'),
      actualStart: new Date('2026-09-08T00:00:00Z'),
      actualEnd: new Date('2026-09-10T00:00:00Z'),
      finding: 'Segregation of duties improvement',
      recommendation: 'suggestedaction',
      responsible: 'joint',
      findingDetail: 'Approval and payment preparation are documented, but reviewer evidence can be strengthened.',
      followup: 'Document enhanced review evidence',
      status: 'onhold',
      dueDate: new Date('2026-10-31T00:00:00Z'),
      updateDate: new Date('2026-10-02T00:00:00Z'),
      update: 'Follow-up is paused pending the recipient controller transition.',
      practice: 'Program staff use standardized visit notes and beneficiary consent checklists.'
    },
    {
      typeName: 'Performance follow-up',
      onsite: false,
      fiscalYearId: secondFiscalYearId,
      quarter: 3,
      objective: 'Assess whether performance indicators are tracking toward expected agreement outcomes.',
      item: 'Quarterly performance dashboard',
      detail: 'Compare submitted indicators with agreement targets and prior-quarter trends.',
      monitored: false,
      plannedStart: new Date('2027-01-12T00:00:00Z'),
      plannedEnd: new Date('2027-01-20T00:00:00Z'),
      actualStart: null,
      actualEnd: null,
      finding: 'No action required',
      recommendation: 'none',
      responsible: 'organization',
      findingDetail: 'Submitted results are consistent with planned activity levels and no corrective action is required.',
      followup: 'Close performance monitoring note',
      status: 'completed',
      dueDate: new Date('2027-02-15T00:00:00Z'),
      updateDate: new Date('2027-02-03T00:00:00Z'),
      update: 'Monitoring note was reviewed and closed with no further action.',
      practice: 'Dashboards include bilingual explanations for each variance against target.'
    }
  ] as const

  for (const seed of monitorSeeds) {
    const monitorTypeId = monitorTypeByName.get(seed.typeName)

    if (!monitorTypeId) {
      continue
    }

    const monitor = await db
      .insertInto('Funding_Case_Agreement_Monitor')
      .values({
        egcs_fc_fundingagreement: String(agreement.agreementId),
        egcs_fc_type: monitorTypeId,
        egcs_fc_onsite: seed.onsite,
        egcs_fc_tentativefiscalyear: seed.fiscalYearId,
        egcs_fc_tentativequarter: seed.quarter,
        egcs_fc_status: agencyStatusIds.draft,
        _deleted: false
      })
      .returning('id')
      .executeTakeFirstOrThrow()

    await db
      .insertInto('Funding_Case_Agreement_Monitor_Planning')
      .values({
        egcs_fc_fundingagreementmonitor: String(monitor.id),
        egcs_fc_objective: seed.objective,
        _deleted: false
      })
      .execute()

    await db
      .insertInto('Funding_Case_Agreement_Monitor_Items')
      .values({
        egcs_fc_fundingagreementmonitor: String(monitor.id),
        egcs_fc_item: seed.item,
        egcs_fc_plannedstart: seed.plannedStart,
        egcs_fc_plannedend: seed.plannedEnd,
        egcs_fc_detail: seed.detail,
        egcs_fc_monitored: seed.monitored,
        egcs_fc_actualstart: seed.actualStart,
        egcs_fc_actualend: seed.actualEnd,
        _deleted: false
      })
      .execute()

    await db
      .insertInto('Funding_Case_Agreement_Monitor_Finding')
      .values({
        egcs_fc_fundingagreementmonitor: String(monitor.id),
        egcs_fc_findingname: seed.finding,
        egcs_fc_recommendationtype: seed.recommendation,
        egcs_fc_responsibleparty: seed.responsible,
        egcs_fc_detail: seed.findingDetail,
        _deleted: false
      })
      .execute()

    const followup = await db
      .insertInto('Funding_Case_Agreement_Monitor_Followup')
      .values({
        egcs_fc_fundingagreementmonitor: String(monitor.id),
        egcs_fc_followupname: seed.followup,
        egcs_fc_responsibleparty: seed.responsible,
        egcs_fc_status: seed.status,
        egcs_fc_duedate: seed.dueDate,
        _deleted: false
      })
      .returning('id')
      .executeTakeFirstOrThrow()

    await db
      .insertInto('Funding_Case_Agreement_Monitor_Followup_Update')
      .values({
        egcs_fc_fundingagreementmonitorfollowup: String(followup.id),
        egcs_fc_update: seed.update,
        egcs_fc_status: seed.status,
        egcs_fc_updatedate: seed.updateDate,
        _deleted: false
      })
      .execute()

    await db
      .insertInto('Funding_Case_Agreement_Monitor_Promising_Practice')
      .values({
        egcs_fc_fundingagreementmonitor: String(monitor.id),
        egcs_fc_practice: seed.practice,
        _deleted: false
      })
      .execute()
  }
}

type ContributionTemplateBlock =
  | { kind: 'paragraph', text: string }
  | { kind: 'heading', text: string }
  | { kind: 'subheading', text: string }
  | { kind: 'table', headers: string[], rows: string[][] }
  | { kind: 'signature' }

const XML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;'
}

const xml = (value: string): string => value.replace(/[&<>]/g, character => XML_ESCAPE_MAP[character] ?? character)

const textRun = (text: string, bold = false): string => `<w:r><w:rPr>${bold ? '<w:b/>' : ''}<w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">${xml(text)}</w:t></w:r>`

const paragraph = (text: string, style = 'BodyText', bold = false): string => `<w:p><w:pPr><w:pStyle w:val="${style}"/><w:spacing w:line="276" w:lineRule="auto" w:before="120"/></w:pPr>${textRun(text, bold)}</w:p>`

const labelValueParagraph = (label: string, value: string, before = 80): string => `<w:p><w:pPr><w:pStyle w:val="BodyText"/><w:spacing w:line="276" w:lineRule="auto" w:before="${before}" w:after="0"/><w:ind w:left="130" w:right="614"/></w:pPr>${textRun(`${label}: `, true)}${textRun(value)}</w:p>`

const schedule2YearHeading = (text: string): string => `<w:p><w:pPr><w:pStyle w:val="Heading1"/><w:spacing w:line="276" w:lineRule="auto" w:before="220" w:after="120"/></w:pPr>${textRun(text, true)}</w:p>`

const tableCell = (content: string, bold = false): string => `<w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/><w:tcBorders><w:top w:val="single" w:sz="4" w:color="BFBFBF"/><w:left w:val="single" w:sz="4" w:color="BFBFBF"/><w:bottom w:val="single" w:sz="4" w:color="BFBFBF"/><w:right w:val="single" w:sz="4" w:color="BFBFBF"/></w:tcBorders><w:shd w:fill="${bold ? 'EDEDED' : 'FFFFFF'}"/></w:tcPr><w:p><w:pPr><w:spacing w:line="240" w:lineRule="auto"/></w:pPr>${textRun(content, bold)}</w:p></w:tc>`

const tableRow = (cells: string[], bold = false): string => `<w:tr>${cells.map(cell => tableCell(cell, bold)).join('')}</w:tr>`

const table = (headers: string[], rows: string[][]): string => `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="BFBFBF"/><w:left w:val="single" w:sz="4" w:color="BFBFBF"/><w:bottom w:val="single" w:sz="4" w:color="BFBFBF"/><w:right w:val="single" w:sz="4" w:color="BFBFBF"/><w:insideH w:val="single" w:sz="4" w:color="BFBFBF"/><w:insideV w:val="single" w:sz="4" w:color="BFBFBF"/></w:tblBorders></w:tblPr>${tableRow(headers, true)}${rows.map(row => tableRow(row)).join('')}</w:tbl>`

const schedule2TableProperties = (gridWidths: number[], indent = 141): string => {
  return `<w:tblPr><w:tblW w:w="0" w:type="auto"/><w:jc w:val="left"/><w:tblInd w:w="${indent}" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/></w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="01E0"/></w:tblPr><w:tblGrid>${gridWidths.map(width => `<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid>`
}

const schedule2TableParagraph = (content: string, bold = false, alignment: 'left' | 'center' | 'right' = 'left'): string => {
  return `<w:p><w:pPr><w:pStyle w:val="TableParagraph"/><w:spacing w:before="7"/><w:ind w:left="108"/><w:jc w:val="${alignment}"/><w:rPr>${bold ? '<w:b/>' : ''}<w:sz w:val="22"/></w:rPr></w:pPr>${textRun(content, bold)}</w:p>`
}

const schedule2TableCell = (content: string, width: number, options: { bold?: boolean, shaded?: boolean, fill?: string, align?: 'left' | 'center' | 'right', gridSpan?: number } = {}): string => {
  const shading = options.shaded === true ? `<w:shd w:val="clear" w:color="auto" w:fill="${options.fill ?? 'C0C0C0'}"/>` : ''
  const gridSpan = options.gridSpan ? `<w:gridSpan w:val="${options.gridSpan}"/>` : ''
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${gridSpan}${shading}</w:tcPr>${schedule2TableParagraph(content, options.bold === true, options.align ?? 'left')}</w:tc>`
}

const schedule2TableRow = (cells: Array<{ text: string, width: number, align?: 'left' | 'center' | 'right' }>, header = false): string => {
  return `<w:tr><w:trPr><w:trHeight w:val="523" w:hRule="atLeast"/></w:trPr>${cells.map(cell => schedule2TableCell(cell.text, cell.width, { bold: header, shaded: header, align: cell.align })).join('')}</w:tr>`
}

const schedule2Table = (headers: Array<{ text: string, width: number, align?: 'left' | 'center' | 'right' }>, rows: string[][]): string => {
  const gridWidths = headers.map(header => header.width)
  return `<w:tbl>${schedule2TableProperties(gridWidths)}${schedule2TableRow(headers, true)}${rows.map(row => schedule2TableRow(row.map((cell, index) => ({
    text: cell,
    width: headers[index]?.width ?? 2000,
    align: headers[index]?.align
  })))).join('')}</w:tbl>`
}

const schedule2TotalParagraph = (label: string, value: string): string => `<w:p><w:pPr><w:spacing w:before="127"/><w:ind w:left="141" w:right="377"/><w:jc w:val="right"/><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:pPr>${textRun(`${label}: `, true)}${textRun(value, true)}</w:p>`

const schedule2SummaryTable = (): string => {
  const widths: [number, number, number, number] = [3300, 2450, 2450, 2450]
  const headers = [
    { text: 'COST CATEGORY', width: widths[0] },
    { text: '{{ budget.schedule2SummaryYear1 }}', width: widths[1] },
    { text: '{{ budget.schedule2SummaryYear2 }}', width: widths[2] },
    { text: 'TOTAL CONTRIBUTION', width: widths[3] }
  ]

  return `<w:tbl>${schedule2TableProperties(headers.map(header => header.width))}${schedule2TableRow(headers, true)}${schedule2TableRow([
    { text: '{{# budget.schedule2SummaryRows }}{{ name }}', width: widths[0] },
    { text: '{{ year1AmountFormatted }}', width: widths[1] },
    { text: '{{ year2AmountFormatted }}', width: widths[2] },
    { text: '{{ totalAmountFormatted }}{{/ budget.schedule2SummaryRows }}', width: widths[3] }
  ])}${schedule2TableRow([
    { text: '{{ budget.schedule2SummaryTotals.name }}', width: widths[0] },
    { text: '{{ budget.schedule2SummaryTotals.year1AmountFormatted }}', width: widths[1] },
    { text: '{{ budget.schedule2SummaryTotals.year2AmountFormatted }}', width: widths[2] },
    { text: '{{ budget.schedule2SummaryTotals.totalAmountFormatted }}', width: widths[3] }
  ], true)}</w:tbl>`
}

const schedule2DetailTable = (): string => {
  const widths: [number, number, number, number] = [1375, 2800, 4325, 2150]
  const headers = [
    { text: 'Qty', width: widths[0], align: 'center' as const },
    { text: 'Line Item', width: widths[1] },
    { text: 'Description/Details', width: widths[2] },
    { text: 'Amount for Fiscal Year', width: widths[3] }
  ]

  return `<w:tbl>${schedule2TableProperties(headers.map(header => header.width))}${schedule2TableRow(headers, true)}<w:tr><w:trPr><w:trHeight w:val="360" w:hRule="atLeast"/></w:trPr>${schedule2TableCell('{{# subsections }}{{ name }}', headers.reduce((sum, header) => sum + header.width, 0), { bold: true, shaded: true, fill: 'D9D9D9', gridSpan: 4 })}</w:tr>${schedule2TableRow([
    { text: '{{# lineItems }}{{ quantity }}', width: widths[0], align: 'center' },
    { text: '{{ category }}', width: widths[1] },
    { text: '{{ description }}', width: widths[2] },
    { text: '{{ amountFormatted }}{{/ lineItems }}{{/ subsections }}', width: widths[3] }
  ])}</w:tbl>`
}

const sectionBreakParagraph = (sectionProperties: string): string => {
  const nextSectionProperties = sectionProperties.includes('<w:type ')
    ? sectionProperties.replace(/<w:type\b[^>]*\/>/, '<w:type w:val="nextPage"/>')
    : sectionProperties.replace('<w:sectPr>', '<w:sectPr><w:type w:val="nextPage"/>')

  return `<w:p><w:pPr>${nextSectionProperties}</w:pPr></w:p>`
}

const renderContributionTemplateBlock = (block: ContributionTemplateBlock): string => {
  if (block.kind === 'heading') {
    return paragraph(block.text, 'Title', true)
  }

  if (block.kind === 'subheading') {
    return paragraph(block.text, 'Heading1', true)
  }

  if (block.kind === 'table') {
    return table(block.headers, block.rows)
  }

  if (block.kind === 'signature') {
    return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr>${tableRow(['For the Department', 'For the Recipient'], true)}${tableRow(['Signature: ____________________________', 'Signature: ____________________________'])}${tableRow(['Name and title: _______________________', 'Name and title: _______________________'])}${tableRow(['Date: ________________________________', 'Date: ________________________________'])}</w:tbl>`
  }

  return paragraph(block.text)
}

const decodeXmlText = (value: string): string => value
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'")

const encodeXmlText = (value: string): string => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;')

const replaceTextAcrossRuns = (xml: string, target: string, replacement: string): string => {
  const textNodes = [...xml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map(match => ({
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
    open: match[0].slice(0, match[0].indexOf('>') + 1),
    close: '</w:t>',
    value: decodeXmlText(match[1] ?? '')
  }))

  if (textNodes.length === 0) {
    return xml
  }

  const fullText = textNodes.map(node => node.value).join('')
  const matches: number[] = []
  let searchFrom = 0
  while (searchFrom < fullText.length) {
    const foundAt = fullText.indexOf(target, searchFrom)
    if (foundAt === -1) {
      break
    }
    matches.push(foundAt)
    searchFrom = foundAt + target.length
  }

  if (matches.length === 0) {
    return xml
  }

  const nodeStarts: number[] = []
  let offset = 0
  for (const node of textNodes) {
    nodeStarts.push(offset)
    offset += node.value.length
  }

  const replacements = new Map<number, string>()
  for (const matchStart of matches) {
    const matchEnd = matchStart + target.length
    let replacementPlaced = false
    for (const [index, node] of textNodes.entries()) {
      const nodeStart = nodeStarts[index]
      if (nodeStart === undefined) {
        continue
      }
      const nodeEnd = nodeStart + node.value.length
      if (nodeEnd <= matchStart || nodeStart >= matchEnd) {
        continue
      }

      const localStart = Math.max(0, matchStart - nodeStart)
      const localEnd = Math.min(node.value.length, matchEnd - nodeStart)
      if (!replacementPlaced) {
        replacements.set(index, `${node.value.slice(0, localStart)}${replacement}${node.value.slice(localEnd)}`)
        replacementPlaced = true
        continue
      }
      replacements.set(index, `${node.value.slice(0, localStart)}${node.value.slice(localEnd)}`)
    }
  }

  let nextXml = xml
  for (let index = textNodes.length - 1; index >= 0; index -= 1) {
    if (!replacements.has(index)) {
      continue
    }
    const node = textNodes[index]
    if (!node) {
      continue
    }
    const replacementNode = `${node.open}${encodeXmlText(replacements.get(index) ?? '')}${node.close}`
    nextXml = `${nextXml.slice(0, node.start)}${replacementNode}${nextXml.slice(node.end)}`
  }

  return nextXml
}

const getContributionTemplateSection = (blocks: ContributionTemplateBlock[]): 'agreement' | 'schedule-1' | 'schedule-2' | 'schedule-3' | 'schedule-4' => {
  const heading = blocks.find(block => block.kind === 'heading')?.text ?? ''
  if (heading.includes('Schedule 1')) return 'schedule-1'
  if (heading.includes('Schedule 2')) return 'schedule-2'
  if (heading.includes('Schedule 3')) return 'schedule-3'
  if (heading.includes('Schedule 4')) return 'schedule-4'
  return 'agreement'
}

const getWordBodyBlocks = (bodyXml: string): string[] => {
  const blocks: string[] = []
  const tags = [...bodyXml.matchAll(/<\/?w:(p|tbl)\b[^>]*>/g)]
  let depth = 0
  let blockStart = -1

  for (const tag of tags) {
    const tagText = tag[0]
    const tagIndex = tag.index ?? 0
    const isClosing = tagText.startsWith('</')

    if (!isClosing && depth === 0) {
      blockStart = tagIndex
    }

    depth += isClosing ? -1 : 1

    if (depth === 0 && blockStart >= 0) {
      blocks.push(bodyXml.slice(blockStart, tagIndex + tagText.length))
      blockStart = -1
    }
  }

  return blocks
}

const getBlockText = (blockXml: string): string => {
  return [...blockXml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)]
    .map(match => decodeXmlText(match[1] ?? ''))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
}

const setBlockText = (blockXml: string, text: string): string => {
  const textNodes = [...blockXml.matchAll(/<w:t\b[^>]*>[\s\S]*?<\/w:t>/g)].map(match => ({
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
    open: match[0].slice(0, match[0].indexOf('>') + 1)
  }))

  if (textNodes.length === 0) {
    return paragraph(text)
  }

  let nextXml = blockXml
  for (let index = textNodes.length - 1; index >= 0; index -= 1) {
    const node = textNodes[index]
    if (!node) {
      continue
    }
    const replacementText = index === 0 ? encodeXmlText(text) : ''
    nextXml = `${nextXml.slice(0, node.start)}${node.open}${replacementText}</w:t>${nextXml.slice(node.end)}`
  }
  return nextXml
}

const findContributionBlock = (blocks: string[], text: string): string => {
  return blocks.find(block => getBlockText(block).includes(text)) ?? paragraph(text)
}

const createScheduleSpacer = (): string => paragraph('')

const setParagraphSpacing = (blockXml: string, before: number, after: number): string => {
  const spacing = `<w:spacing w:line="276" w:lineRule="auto" w:before="${before}" w:after="${after}"/>`
  if (blockXml.includes('<w:pPr>')) {
    return blockXml
      .replace(/<w:spacing\b[^>]*\/>/, '')
      .replace('</w:pPr>', `${spacing}</w:pPr>`)
  }

  return blockXml.replace('<w:p>', `<w:p><w:pPr>${spacing}</w:pPr>`)
}

const pageBreakParagraph = (): string => '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'

const createSchedule1Blocks = (sourceBlocks: string[]): string[] => {
  const projectHeadingIndex = sourceBlocks.findIndex(block => getBlockText(block).includes('PROJECT DESCRIPTION AND OBJECTIVE'))
  const scheduleHeaderBlocks = projectHeadingIndex >= 0
    ? sourceBlocks.slice(0, projectHeadingIndex + 1)
    : sourceBlocks.slice(0, 5)
  const descriptionParagraph = setParagraphSpacing(
    setBlockText(
      findContributionBlock(sourceBlocks, 'The Saint John Local Immigration Partnership'),
      '{{ agreement.description }}'
    ),
    80,
    220
  )
  const plannedHeading = setParagraphSpacing(findContributionBlock(sourceBlocks, 'PLANNED ACTIVITIES:'), 220, 120)
  const activityParagraph = findContributionBlock(sourceBlocks, 'Activity: 1.0')
  const activityName = labelValueParagraph('Name', '{{ name }}', 180)
  const activityDates = labelValueParagraph('Start Date', '{{ startDate }}')
  const activityEndDate = labelValueParagraph('End Date', '{{ endDate }}')
  const activityResponsible = labelValueParagraph('Responsible Party', '{{ responsiblePartiesText }}')
  const activityNarrative = labelValueParagraph('Description', '{{ description }}', 120)
  const outputDescription = labelValueParagraph('Expected Results', '{{ expectedResults }}', 120)
  const expectedHeading = setParagraphSpacing(findContributionBlock(sourceBlocks, 'EXPECTED OUTCOMES:'), 260, 120)
  const expectedOutcome = setParagraphSpacing(
    setBlockText(
      findContributionBlock(sourceBlocks, 'Partners & stakeholders are engaged'),
      '{{ description }}'
    ),
    0,
    0
  )
  const nextScheduleHeaderBlocks = scheduleHeaderBlocks.map((block, index) => {
    return index === scheduleHeaderBlocks.length - 1 ? setParagraphSpacing(block, 248, 120) : block
  })

  return [
    ...nextScheduleHeaderBlocks,
    descriptionParagraph,
    plannedHeading,
    setBlockText(activityParagraph, '{{# activities }}'),
    activityName,
    activityDates,
    activityEndDate,
    activityResponsible,
    activityNarrative,
    outputDescription,
    setBlockText(activityParagraph, '{{/ activities }}'),
    expectedHeading,
    setBlockText(expectedOutcome, '{{# expectedOutcomes }}'),
    expectedOutcome,
    setBlockText(expectedOutcome, '{{/ expectedOutcomes }}')
  ]
}

const createSchedule2Blocks = (sourceBlocks: string[], firstPageSectionProperties: string): string[] => {
  const contributionIndex = sourceBlocks.findIndex(block => getBlockText(block).includes('DEPARTMENTAL CONTRIBUTION'))
  const scheduleHeaderBlocks = contributionIndex >= 0
    ? sourceBlocks.slice(0, contributionIndex)
    : sourceBlocks.slice(0, 6)
  const lineItemTable = schedule2DetailTable()

  return [
    ...scheduleHeaderBlocks,
    paragraph('DEPARTMENTAL CONTRIBUTION - SEE ATTACHED SHEET FOR COST CATEGORY DETAILS', 'Heading1', true),
    schedule2SummaryTable(),
    sectionBreakParagraph(firstPageSectionProperties),
    schedule2YearHeading('Fiscal Year: {{ budget.schedule2FirstYear.display }}'),
    paragraph('{{# budget.schedule2FirstYear.schedule2Sections }}'),
    paragraph('{{ name }}', 'Heading2', true),
    lineItemTable,
    schedule2TotalParagraph('Total - {{ name }}', '{{ programFundingFormatted }}'),
    paragraph('{{/ budget.schedule2FirstYear.schedule2Sections }}'),
    paragraph('{{# budget.schedule2AdditionalYears }}'),
    pageBreakParagraph(),
    paragraph(''),
    schedule2YearHeading('Fiscal Year: {{ display }}'),
    paragraph('{{# schedule2Sections }}'),
    paragraph('{{ name }}', 'Heading2', true),
    lineItemTable,
    schedule2TotalParagraph('Total - {{ name }}', '{{ programFundingFormatted }}'),
    paragraph('{{/ schedule2Sections }}'),
    paragraph('{{/ budget.schedule2AdditionalYears }}')
  ]
}

const createPageNumberParagraph = (sourceParagraph: string): string => {
  const paragraphProperties = /<w:pPr>[\s\S]*?<\/w:pPr>/.exec(sourceParagraph)?.[0] ?? '<w:pPr><w:rPr><w:sz w:val="18"/></w:rPr></w:pPr>'
  const runProperties = '<w:rPr><w:sz w:val="18"/></w:rPr>'
  const fieldRun = (fieldName: 'PAGE' | 'NUMPAGES', fallback: string): string => [
    `<w:r>${runProperties}<w:fldChar w:fldCharType="begin"/></w:r>`,
    `<w:r>${runProperties}<w:instrText xml:space="preserve"> ${fieldName} </w:instrText></w:r>`,
    `<w:r>${runProperties}<w:fldChar w:fldCharType="separate"/></w:r>`,
    `<w:r>${runProperties}<w:t>${fallback}</w:t></w:r>`,
    `<w:r>${runProperties}<w:fldChar w:fldCharType="end"/></w:r>`
  ].join('')

  return `<w:p>${paragraphProperties}<w:r>${runProperties}<w:t>PAGE </w:t></w:r>${fieldRun('PAGE', '1')}<w:r>${runProperties}<w:t> OF </w:t></w:r>${fieldRun('NUMPAGES', '1')}</w:p>`
}

const normalizeHeaderPageNumbers = (xml: string): string => {
  const paragraphs = [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)]
    .map(match => ({
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
      value: match[0],
      text: getBlockText(match[0])
    }))
    .filter(paragraph => /^PAGE\s+\d+(?:\s+OF\s+\d+)?$/.test(paragraph.text))

  if (paragraphs.length === 0) {
    return xml
  }

  let nextXml = xml
  for (let index = paragraphs.length - 1; index >= 0; index -= 1) {
    const paragraph = paragraphs[index]
    if (!paragraph) {
      continue
    }
    const replacement = index === 0 ? createPageNumberParagraph(paragraph.value) : ''
    nextXml = `${nextXml.slice(0, paragraph.start)}${replacement}${nextXml.slice(paragraph.end)}`
  }
  return nextXml
}

const isFrenchContributionTemplate = (blocks: ContributionTemplateBlock[]): boolean =>
  blocks.some(block => 'text' in block && /^(Entente|Annexe)\b/.test(block.text))

export const resolveContributionAgreementSourceUrl = (
  repositoryRoot: string = process.cwd()
): URL => pathToFileURL(resolve(repositoryRoot, 'demo-assets/Contribution Agreement.docx'))

const readContributionAgreementSource = async (): Promise<Buffer> => {
  return await readFile(resolveContributionAgreementSourceUrl())
}

const createContributionDocxTemplateFromSource = async (
  section: ReturnType<typeof getContributionTemplateSection>,
  templateBlocks: ContributionTemplateBlock[]
): Promise<Buffer> => {
  const sourceZip = new PizZip(await readContributionAgreementSource())
  const documentXml = sourceZip.file('word/document.xml')?.asText()
  if (!documentXml) {
    throw new Error('Contribution Agreement.docx is missing word/document.xml')
  }

  const bodyMatch = /<w:body>([\s\S]*)<\/w:body>/.exec(documentXml)
  const sectionProperties = /<w:sectPr[\s\S]*?<\/w:sectPr>/.exec(documentXml)?.[0] ?? '<w:sectPr/>'
  const sourceSectionProperties = [...documentXml.matchAll(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g)].map(match => match[0])
  const schedule2DetailSectionProperties = sourceSectionProperties.find(properties => properties.includes('r:id="rId14"')) ?? sectionProperties
  const sourceBodyBlocks = getWordBodyBlocks(bodyMatch?.[1] ?? '')
  const schedule1 = sourceBodyBlocks.findIndex(block => getBlockText(block).includes('Settlement Program – Schedule 1'))
  const schedule2 = sourceBodyBlocks.findIndex(block => getBlockText(block).includes('Settlement Program – Schedule 2'))
  const schedule3 = sourceBodyBlocks.findIndex(block => getBlockText(block).includes('Settlement Program – Schedule 3'))
  const schedule4 = sourceBodyBlocks.findIndex(block => getBlockText(block).includes('Settlement Program – Schedule 4'))
  const ranges = {
    agreement: [0, schedule1],
    'schedule-1': [schedule1, schedule2],
    'schedule-2': [schedule2, schedule3],
    'schedule-3': [schedule3, schedule4],
    'schedule-4': [schedule4, sourceBodyBlocks.length]
  } satisfies Record<ReturnType<typeof getContributionTemplateSection>, [number, number]>
  const [start, end] = ranges[section]
  const sectionBlocks = start >= 0 && end > start ? sourceBodyBlocks.slice(start, end) : sourceBodyBlocks
  const selectedBlocks = section === 'schedule-1'
    ? createSchedule1Blocks(sectionBlocks)
    : section === 'schedule-2'
      ? createSchedule2Blocks(sectionBlocks, sectionProperties)
      : sectionBlocks
  const replacements: Array<[string, string]> = [
    ['S211600015', '{{ agreement.number }}'],
    ['City of Saint John', '{{ recipient.primary.legalName }}'],
    ['Saint John Local Immigration Partnership', '{{ agreement.title }}'],
    [
      'An amount of up to 5% of the total Agreement value will represent the holdback and be disbursed to the Recipient as a final payment on receipt and approval by the Department of the final claims for Eligible Costs and deliverables, including any requested Supporting Documentation. Material submitted to the Department to support release of the holdback must be certified by a duly authorized representative of the Recipient.',
      'An amount of up to {{ agreement.holdback }}% of the total Agreement value will represent the holdback and be disbursed to the Recipient as a final payment on receipt and approval by the Department of the final claims for Eligible Costs and deliverables, including any requested Supporting Documentation. Material submitted to the Department to support release of the holdback must be certified by a duly authorized representative of the Recipient.'
    ],
    ['15 Market SquareSaint John, NB, E2L 4L1 Canada', '{{ recipient.primary.address }}'],
    ['15 Market SquareSaint John, NB, Canada E2L 4L1', '{{ recipient.primary.address }}'],
    ['15 Market Square', '{{ recipient.primary.address }}'],
    ['Saint John, NB, E2L 4L1 Canada', '{{ recipient.primary.address }}'],
    ['Saint John, NB, Canada E2L 4L1', '{{ recipient.primary.address }}'],
    ['Immigration, Refugees and Citizenship Canada', 'Health Canada'],
    ['Immigration, Réfugiés et Citoyenneté Canada', 'Health Canada'],
    ['Immigration, Refugies et Citoyennete Canada', 'Health Canada'],
    ['Minister of Immigration, Refugees and Citizenship', 'Minister of Health'],
    ['2020-09-01', '{{ agreement.startDate }}'],
    ['2025-03-31', '{{ agreement.endDate }}'],
    ['Fiscal Years:5', 'Fiscal Years: {{ budget.fiscalYearCount }}'],
    ['Settlement Program', '{{ program.name }}'],
    ['495 Prospect Street Fredericton, NB, E3B 9M4 Canada', '{{ department.address }}']
  ]

  let nextDocumentXml = documentXml.replace(
    /<w:body>[\s\S]*<\/w:body>/,
    `<w:body>${selectedBlocks.join('')}${section === 'schedule-2' ? schedule2DetailSectionProperties : sectionProperties}</w:body>`
  )
  if (section === 'schedule-3') {
    nextDocumentXml = nextDocumentXml.replace(
      '<w:headerReference w:type="default" r:id="rId15"/>',
      '<w:headerReference w:type="default" r:id="rId5"/>'
    )
  }

  for (const [target, replacement] of replacements) {
    nextDocumentXml = replaceTextAcrossRuns(nextDocumentXml, target, replacement)
  }

  const nextZip = new PizZip(sourceZip.generate({ type: 'nodebuffer' }))
  nextZip.file('word/document.xml', nextDocumentXml)
  for (const path of Object.keys(nextZip.files).filter(filePath => /^word\/header\d+\.xml$/.test(filePath))) {
    let headerXml = normalizeHeaderPageNumbers(nextZip.file(path)?.asText() ?? '')
    for (const [target, replacement] of replacements) {
      headerXml = replaceTextAcrossRuns(headerXml, target, replacement)
    }
    nextZip.file(path, headerXml)
  }
  return nextZip.generate({ type: 'nodebuffer', compression: 'DEFLATE' })
}

const createContributionDocxTemplate = async (blocks: ContributionTemplateBlock[]): Promise<Buffer> => {
  if (!isFrenchContributionTemplate(blocks)) {
    return await createContributionDocxTemplateFromSource(getContributionTemplateSection(blocks), blocks)
  }

  const body = blocks.map(renderContributionTemplateBlock).join('')
  const header = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="right"/><w:rPr><w:sz w:val="18"/></w:rPr></w:pPr><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>Page </w:t></w:r><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:instrText> PAGE </w:instrText></w:r><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r></w:p></w:hdr>'
  const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="BodyText"><w:name w:val="Body Text"/><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:sz w:val="28"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:sz w:val="24"/></w:rPr></w:style></w:styles>'
  const zip = new PizZip()
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/></Types>')
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
  zip.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdHeader1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>')
  zip.file('word/styles.xml', styles)
  zip.file('word/header1.xml', header)
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body}<w:sectPr><w:headerReference w:type="default" r:id="rIdHeader1"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="720" w:bottom="720" w:left="720" w:header="360"/></w:sectPr></w:body></w:document>`)
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' })
}

async function seedContributionAgreementDocumentTemplates(db: Kysely<Database>): Promise<void> {
  const stream = await db
    .selectFrom('Transfer_Payment_Stream')
    .innerJoin('Transfer_Payment_Profile', 'Transfer_Payment_Profile.id', 'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile')
    .where('Transfer_Payment_Stream.id', '=', '31')
    .select(['Transfer_Payment_Profile.egcs_tp_agency as agencyId'])
    .executeTakeFirst()

  if (!stream?.agencyId) {
    return
  }

  const templates: Array<{
    slug: string
    nameEn: string
    nameFr: string
    entityType?: 'fundingcaseagreement' | 'fundingcaseagreementcloseout'
    blocks: ContributionTemplateBlock[]
    blocksFr?: ContributionTemplateBlock[]
  }> = [
    {
      slug: 'contribution-agreement',
      nameEn: 'Contribution Agreement',
      nameFr: 'Entente de contribution',
      blocks: [
        { kind: 'heading', text: 'Contribution Agreement' },
        { kind: 'paragraph', text: 'Agreement Number: {{ agreement.number }}' },
        { kind: 'paragraph', text: 'Recipient Name: {{ recipient.primary.legalName }}' },
        { kind: 'paragraph', text: 'Project: {{ agreement.title }}' },
        { kind: 'subheading', text: 'Parties' },
        { kind: 'paragraph', text: '{{ department.legalName }}, hereinafter referred to as the "Department".' },
        { kind: 'paragraph', text: '{{ department.address }}' },
        { kind: 'paragraph', text: 'AND: {{ recipient.primary.legalName }}, hereinafter referred to as the "Recipient".' },
        { kind: 'paragraph', text: '{{ recipient.primary.address }}' },
        { kind: 'subheading', text: 'Recitals' },
        { kind: 'paragraph', text: 'Whereas the Recipient wishes to provide services and/or activities under the {{ program.name }} and {{ stream.name }}; and whereas the Department wishes to provide a contribution to assist in carrying out such services and/or activities, the parties agree as follows.' },
        { kind: 'subheading', text: 'Agreement' },
        { kind: 'paragraph', text: 'This Agreement, including the attached schedules and any subsequent amendments, constitutes the entire agreement between the Department and the Recipient.' },
        { kind: 'paragraph', text: 'Schedule 1 is the Statement of Planned Activities and Intended Results. Schedule 2 is the Description of Eligible Costs and Budget. Schedule 3 is the Terms of Payment and Financial Reporting. Schedule 4 is Supplementary Terms and Conditions.' },
        { kind: 'paragraph', text: 'Funding Period: {{ agreement.startDate }} to {{ agreement.endDate }}.' },
        { kind: 'paragraph', text: 'Maximum Contribution: {{ budget.totalProgramFunding }}.' },
        { kind: 'signature' }
      ]
    },
    {
      slug: 'schedule-1',
      nameEn: 'Schedule 1 - Planned Activities and Intended Results',
      nameFr: 'Annexe 1 - Activites prevues et resultats attendus',
      blocks: [
        { kind: 'heading', text: 'Schedule 1 - Statement of Planned Activities and Intended Results' },
        { kind: 'paragraph', text: 'Agreement Number: {{ agreement.number }}' },
        { kind: 'paragraph', text: 'Recipient: {{ recipient.primary.legalName }}' },
        { kind: 'paragraph', text: 'Project Description: {{ agreement.description }}' },
        {
          kind: 'table',
          headers: ['Activity', 'Description', 'Start', 'End', 'Expected Results'],
          rows: [
            ['{{#activities}}{{ name }}', '{{ description }}', '{{ startDate }}', '{{ endDate }}', '{{ expectedResults }}{{/activities}}']
          ]
        }
      ]
    },
    {
      slug: 'schedule-2',
      nameEn: 'Schedule 2 - Description of Eligible Costs and Budget',
      nameFr: 'Annexe 2 - Couts admissibles et budget',
      blocks: [
        { kind: 'heading', text: 'Schedule 2 - Description of Eligible Costs' },
        { kind: 'paragraph', text: 'Eligible costs are limited to the budget line items approved for this Agreement and must be incurred during the Funding Period.' },
        { kind: 'paragraph', text: 'Total Department contribution: {{ budget.totalProgramFunding }}.' },
        {
          kind: 'table',
          headers: ['Fiscal Year', 'Cost Category', 'Subsection', 'Description', 'Total Cost', 'Department Contribution'],
          rows: [
            ['{{#budget.lineItems}}{{ fiscalYear }}', '{{ category }}', '{{ subsection }}', '{{ description }}', '{{ totalAmountFormatted }}', '{{ programFundingFormatted }}{{/budget.lineItems}}']
          ]
        }
      ]
    },
    {
      slug: 'schedule-3',
      nameEn: 'Schedule 3 - Terms of Payment and Financial Reporting',
      nameFr: 'Annexe 3 - Modalites de paiement et rapports financiers',
      blocks: [
        { kind: 'heading', text: 'Schedule 3 - Terms of Payment and Financial Reporting' },
        { kind: 'subheading', text: '3.0 Holdback' },
        { kind: 'paragraph', text: 'An amount of up to {{ agreement.holdback }}% of the total Agreement value, estimated at {{ agreement.holdbackAmount }}, will represent the holdback. The holdback basis is {{ agreement.holdbackBasis }}.' },
        { kind: 'paragraph', text: 'The holdback will be disbursed to the Recipient as a final payment following receipt and approval by the Department of final claims for Eligible Costs and deliverables, including requested Supporting Documentation.' },
        { kind: 'subheading', text: 'Claims and Forecasts' },
        {
          kind: 'table',
          headers: ['Payment Type', 'Amount', 'Status'],
          rows: [
            ['{{#payments}}{{ type }}', '{{ amountFormatted }}', '{{ status }}{{/payments}}']
          ]
        },
        {
          kind: 'table',
          headers: ['Claim Period Start', 'Claim Period End', 'Status'],
          rows: [
            ['{{#claims}}{{ periodStart }}', '{{ periodEnd }}', '{{ status }}{{/claims}}']
          ]
        }
      ]
    },
    {
      slug: 'schedule-4',
      nameEn: 'Schedule 4 - Supplementary Terms and Conditions',
      nameFr: 'Annexe 4 - Conditions supplementaires',
      blocks: [
        { kind: 'heading', text: 'Schedule 4 - Supplementary Terms and Conditions' },
        { kind: 'paragraph', text: 'The Recipient shall comply with all program terms and conditions applicable to {{ program.name }} and the {{ stream.name }} stream.' },
        { kind: 'paragraph', text: 'The Recipient shall maintain records for eligible costs and activities and provide them to the Department upon request.' },
        { kind: 'paragraph', text: 'The Recipient shall notify the Department of material changes to the Project, governance, delivery locations, or financial circumstances.' }
      ]
    },
    {
      slug: 'agreement-closeout-report',
      nameEn: 'Agreement Closeout Report',
      nameFr: 'Rapport de clôture de l’entente',
      entityType: 'fundingcaseagreementcloseout',
      blocks: [
        { kind: 'heading', text: 'Agreement Closeout Report' },
        { kind: 'paragraph', text: 'Agreement Number: {{ agreement.number }}' },
        { kind: 'paragraph', text: 'Project: {{ agreement.title }}' },
        { kind: 'paragraph', text: 'Recipient: {{ recipient.primary.legalName }}' },
        { kind: 'paragraph', text: 'Closeout Number: {{ closeout.number }}' },
        { kind: 'paragraph', text: 'Closeout Status: {{ closeout.status }}' },
        { kind: 'subheading', text: 'Financial Situation' },
        {
          kind: 'table',
          headers: ['Fiscal Year', 'Currency', 'Approved Final Claims', 'Paid Payments', 'Variance', 'Status'],
          rows: [[
            '{{#closeout.financial.rows}}{{ fiscalYear }}', '{{ currency }}', '{{ approvedClaimAmount }}',
            '{{ paidAmount }}', '{{ variance }}', '{{ state }}{{/closeout.financial.rows}}'
          ]]
        },
        { kind: 'subheading', text: 'Outstanding Monitoring Follow-ups' },
        { kind: 'paragraph', text: '{{#closeout.outstandingFollowups}}{{ name }} — {{ status }} ({{ responsibleParty }}){{/closeout.outstandingFollowups}}' },
        { kind: 'subheading', text: 'Readiness Exceptions' },
        { kind: 'paragraph', text: '{{#closeout.blockers}}{{ label }} — {{ reason }} ({{ status }}){{/closeout.blockers}}' },
        { kind: 'paragraph', text: 'Readiness snapshot SHA-256: {{ closeout.snapshotHash }}' },
        { kind: 'signature' }
      ],
      blocksFr: [
        { kind: 'heading', text: 'Rapport de clôture de l’entente' },
        { kind: 'paragraph', text: 'Numéro de l’entente : {{ agreement.number }}' },
        { kind: 'paragraph', text: 'Projet : {{ agreement.title }}' },
        { kind: 'paragraph', text: 'Bénéficiaire : {{ recipient.primary.legalName }}' },
        { kind: 'paragraph', text: 'Numéro de clôture : {{ closeout.number }}' },
        { kind: 'paragraph', text: 'État de la clôture : {{ closeout.status }}' },
        { kind: 'subheading', text: 'Situation financière' },
        {
          kind: 'table',
          headers: ['Exercice financier', 'Devise', 'Réclamations finales approuvées', 'Paiements versés', 'Écart', 'État'],
          rows: [[
            '{{#closeout.financial.rows}}{{ fiscalYear }}', '{{ currency }}', '{{ approvedClaimAmount }}',
            '{{ paidAmount }}', '{{ variance }}', '{{ state }}{{/closeout.financial.rows}}'
          ]]
        },
        { kind: 'subheading', text: 'Suivis de surveillance en suspens' },
        { kind: 'paragraph', text: '{{#closeout.outstandingFollowups}}{{ name }} — {{ status }} ({{ responsibleParty }}){{/closeout.outstandingFollowups}}' },
        { kind: 'subheading', text: 'Exceptions de l’état de préparation' },
        { kind: 'paragraph', text: '{{#closeout.blockers}}{{ label }} — {{ reason }} ({{ status }}){{/closeout.blockers}}' },
        { kind: 'paragraph', text: 'Empreinte SHA-256 de l’état de préparation : {{ closeout.snapshotHash }}' },
        { kind: 'signature' }
      ]
    }
  ]

  for (const template of templates) {
    const attachments: Record<'en' | 'fr', string> = { en: '', fr: '' }
    for (const language of ['en', 'fr'] as const) {
      const languageBlocks = language === 'fr'
        ? template.blocksFr ?? [{ kind: 'heading' as const, text: template.nameFr }, ...template.blocks]
        : template.blocks
      const file = {
        extension: 'docx',
        bytes: await createContributionDocxTemplate(languageBlocks),
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      }
      const filename = `${template.slug}-${language}.${file.extension}`
      const attachment = await writeStoredTemplateFile(db, {
        agencyId: String(stream.agencyId),
        bytes: file.bytes,
        filename,
        mimeType: file.mime,
        nameEn: `${template.nameEn} ${language.toUpperCase()}.${file.extension}`,
        nameFr: `${template.nameFr} ${language.toUpperCase()}.${file.extension}`,
        descriptionEn: template.nameEn,
        descriptionFr: template.nameFr,
        folder: `document-templates/31/contribution-agreement/${template.slug}`,
        purpose: 'document-template'
      })
      attachments[language] = String(attachment.id)
    }

    const documentTemplate = {
      egcs_tp_transferpaymentstream: '31',
      egcs_tp_entitytype: template.entityType ?? 'fundingcaseagreement',
      egcs_tp_name_en: template.nameEn,
      egcs_tp_name_fr: template.nameFr,
      egcs_tp_description_en: template.nameEn,
      egcs_tp_description_fr: template.nameFr,
      egcs_tp_templateattachment_en: attachments.en,
      egcs_tp_templateattachment_fr: attachments.fr,
      egcs_tp_templatekind: 'docx',
      egcs_tp_outputformats: sql<TransferPaymentDocumentTemplateOutputFormat[]>`${JSON.stringify(['docx', 'pdf'])}::jsonb`,
      egcs_tp_active: true,
      _deleted: false
    } as const
    await db.insertInto('Transfer_Payment_Stream_Document_Template').values(documentTemplate).execute()
    if (template.entityType === 'fundingcaseagreementcloseout') {
      await db.insertInto('Transfer_Payment_Stream_Document_Template').values({
        ...documentTemplate,
        egcs_tp_transferpaymentstream: '32'
      }).execute()
    }
  }
}

const seedAuthEvent = (db: Kysely<Database>, authUserId: string): H3Event => ({
  context: {
    $db: db,
    $authContext: { userId: authUserId, userAbilities: [] }
  }
} as unknown as H3Event)

const approveSeedRuntimeStep = async (db: Kysely<Database>, runtimeId: string): Promise<boolean> => {
  const approval = await db.selectFrom('Common_Approval')
    .innerJoin('Common_Runtime_Item', 'Common_Runtime_Item.id', 'Common_Approval.egcs_cn_runtimeitem')
    .innerJoin('Common_User', join => join.onRef(
      'Common_User.id', '=', sql<string>`COALESCE("Common_Approval".egcs_cn_assigneduser, "Common_Approval".egcs_cn_defaultuser)`
    ))
    .select([
      'Common_Approval.id',
      'Common_User.id as actorId',
      'Common_User.egcs_cn_auth_user_id as authUserId'
    ])
    .where('Common_Runtime_Item.egcs_cn_runtime', '=', runtimeId)
    .where('Common_Runtime_Item.egcs_cn_state', '=', 'awaiting_action')
    .where('Common_Runtime_Item.egcs_cn_kind', '=', 'approval_step')
    .where('Common_User._deleted', '=', false)
    .orderBy('Common_Runtime_Item.egcs_cn_order', 'asc')
    .executeTakeFirst()
  if (!approval?.authUserId) return false
  const certifications = await db.selectFrom('Common_Approval_Certification')
    .select(['id', 'egcs_cn_optional'])
    .where('egcs_cn_approval', '=', String(approval.id))
    .execute()
  await decideCanonicalApproval(
    seedAuthEvent(db, String(approval.authUserId)),
    db as Transaction<Database>,
    String(approval.id),
    {
      approvalId: String(approval.id),
      certifications: certifications.map(certification => ({
        id: String(certification.id),
        egcs_cn_value: !certification.egcs_cn_optional
      })),
      egcs_cn_comment: 'Seeded approval evidence.'
    },
    true
  )
  const rootRoutingItem = await db.selectFrom('Common_Approval')
    .innerJoin('Common_Routing_Slip', 'Common_Routing_Slip.id', 'Common_Approval.egcs_cn_routingslip')
    .innerJoin('Common_Runtime_Item', 'Common_Runtime_Item.id', 'Common_Routing_Slip.egcs_cn_runtimeitem')
    .select(['Common_Runtime_Item.id', 'Common_Runtime_Item.egcs_cn_state', 'Common_Runtime_Item.egcs_cn_parentruntimeitem'])
    .where('Common_Approval.id', '=', String(approval.id))
    .executeTakeFirstOrThrow()
  if (rootRoutingItem.egcs_cn_parentruntimeitem === null && rootRoutingItem.egcs_cn_state === 'approved') {
    await advanceWorkflowItem(db as Transaction<Database>, String(rootRoutingItem.id), String(approval.actorId))
  }
  return true
}

const materializeSeedReviewApproval = async (
  db: Kysely<Database>,
  runtimeId: string,
  agreementId: string,
  actorId: string
): Promise<boolean> => {
  const review = await db.selectFrom('Common_Review')
    .innerJoin('Common_Review_Set', 'Common_Review_Set.id', 'Common_Review.egcs_cn_reviewset')
    .innerJoin('Common_Runtime_Item as Review_Item', 'Review_Item.id', 'Common_Review.egcs_cn_runtimeitem')
    .innerJoin('Common_Runtime_Item as Set_Item', 'Set_Item.id', 'Common_Review_Set.egcs_cn_runtimeitem')
    .innerJoin('Common_Publication_Version', 'Common_Publication_Version.id', 'Set_Item.egcs_cn_publicationversion')
    .select([
      'Common_Review.id',
      'Common_Review.egcs_cn_reviewschema as reviewSchemaId',
      'Review_Item.id as runtimeItemId',
      'Review_Item.egcs_cn_order as reviewOrder',
      'Common_Publication_Version.egcs_cn_definition as setDefinition'
    ])
    .where('Review_Item.egcs_cn_runtime', '=', runtimeId)
    .where('Review_Item.egcs_cn_state', '=', 'active')
    .where('Review_Item.egcs_cn_kind', '=', 'review')
    .where('Common_Review._deleted', '=', false)
    .orderBy('Review_Item.egcs_cn_order', 'asc')
    .executeTakeFirst()
  if (!review) return false
  const setup = readPublishedReviewSetup(review.setDefinition)
  const member = setup.members.find(candidate => candidate.order === Number(review.reviewOrder))
  if (!member) throw new Error(`Seeded Agreement ${agreementId} review member is missing`)

  const reviewSchema = await db.selectFrom('Common_Review_Schema')
    .select(['egcs_cn_reviewtype', 'egcs_cn_name_en', 'egcs_cn_name_fr'])
    .where('id', '=', String(review.reviewSchemaId))
    .executeTakeFirstOrThrow()
  if (reviewSchema.egcs_cn_reviewtype === 'assessment') {
    await db.updateTable('Common_Assessment').set({ egcs_cn_reviewresult: 100 })
      .where('egcs_cn_review', '=', String(review.id)).execute()
    await db.updateTable('Common_Review').set({ egcs_cn_reviewresult: 100 })
      .where('id', '=', String(review.id)).execute()
  } else {
    await db.updateTable('Common_Checklist').set({ egcs_cn_result: 'pass' })
      .where('egcs_cn_review', '=', String(review.id)).execute()
  }
  await db.insertInto('Common_Completion').values({
    egcs_cn_entitytype: 'commonreview',
    egcs_cn_entityid: String(review.id),
    egcs_cn_comments: `Seeded Agreement ${agreementId} review completion evidence.`,
    egcs_cn_user: actorId,
    egcs_cn_disposition: 'not_applicable',
    _deleted: false
  }).execute()

  if (!member.approval) {
    await transitionRuntimeItem(db as Transaction<Database>, {
      runtimeId, runtimeItemId: String(review.runtimeItemId), from: 'active', to: 'succeeded',
      actorId, reason: 'seeded_review_completed'
    })
    return true
  }
  await materializeCanonicalApprovalRuntime(db as Transaction<Database>, {
    entityType: 'commonreview',
    entityId: String(review.id),
    nameEn: reviewSchema.egcs_cn_name_en,
    nameFr: reviewSchema.egcs_cn_name_fr,
    approvalTemplateId: member.approval.publicationId,
    approvalTemplateVersionId: member.approval.publicationVersionId,
    actorId,
    parentRuntimeItemId: String(review.runtimeItemId)
  })
  return true
}

const materializeSeedRecommendationApproval = async (
  db: Kysely<Database>,
  runtimeId: string,
  agreementId: string,
  actorId: string
): Promise<boolean> => {
  const recommendation = await db.selectFrom('Common_Recommendation')
    .innerJoin('Common_Recommendation_Set', 'Common_Recommendation_Set.id', 'Common_Recommendation.egcs_cn_recommendationset')
    .innerJoin('Common_Runtime_Item as Recommendation_Item', 'Recommendation_Item.id', 'Common_Recommendation.egcs_cn_runtimeitem')
    .innerJoin('Common_Runtime_Item as Set_Item', 'Set_Item.id', 'Common_Recommendation_Set.egcs_cn_runtimeitem')
    .innerJoin('Common_Publication_Version as Set_Version', 'Set_Version.id', 'Set_Item.egcs_cn_publicationversion')
    .innerJoin('Common_Publication_Version as Schema_Version', 'Schema_Version.id', 'Recommendation_Item.egcs_cn_publicationversion')
    .select([
      'Common_Recommendation.id',
      'Common_Recommendation.egcs_cn_recommendationsetup as memberId',
      'Recommendation_Item.id as runtimeItemId',
      'Set_Version.egcs_cn_definition as setDefinition',
      'Schema_Version.egcs_cn_definition as schemaDefinition'
    ])
    .where('Recommendation_Item.egcs_cn_runtime', '=', runtimeId)
    .where('Recommendation_Item.egcs_cn_state', '=', 'active')
    .where('Recommendation_Item.egcs_cn_kind', '=', 'recommendation')
    .where('Common_Recommendation._deleted', '=', false)
    .orderBy('Recommendation_Item.egcs_cn_order', 'asc')
    .executeTakeFirst()
  if (!recommendation) return false
  const plan = readPublishedRecommendationPlan(recommendation.setDefinition)
  const schema = readPublishedRecommendationSchema(recommendation.schemaDefinition)
  const member = plan.members.find(candidate => candidate.memberId === String(recommendation.memberId))
  if (!member) throw new Error(`Seeded Agreement ${agreementId} recommendation member is missing`)
  const definition = schema.definition as RecommendationDefinition
  const questions = definition.sections.flatMap(section => section.subSections).flatMap(section => section.questions)
  const resultQuestion = questions.find(question => question.isResult && question.type === 'radio')
  if (!resultQuestion || resultQuestion.type !== 'radio') {
    throw new Error(`Seeded Agreement ${agreementId} recommendation result is missing`)
  }
  const resultOption = resultQuestion.options.find(option => option.outcome === 'recommended')
  if (!resultOption) throw new Error(`Seeded Agreement ${agreementId} recommended option is missing`)
  const responses = questions.filter(question => question.required).map(question => ({
    questionKey: question.key,
    value: question.isResult
      ? resultOption.key
      : question.type === 'radio' ? question.options?.[0]?.key ?? 'yes' : 'Seeded approval recommendation evidence.'
  }))
  await db.updateTable('Common_Recommendation').set({
    egcs_cn_response: { responses },
    egcs_cn_resultoptionkey: resultOption.key,
    egcs_cn_outcome: 'recommended'
  }).where('id', '=', String(recommendation.id)).execute()
  if (!member.approvalTemplateId || !member.approvalVersionId) {
    await transitionRuntimeItem(db as Transaction<Database>, {
      runtimeId, runtimeItemId: String(recommendation.runtimeItemId), from: 'active', to: 'succeeded',
      actorId, reason: 'seeded_recommendation_submitted'
    })
    return true
  }
  await materializeCanonicalApprovalRuntime(db as Transaction<Database>, {
    entityType: 'commonrecommendation',
    entityId: String(recommendation.id),
    nameEn: schema.nameEn,
    nameFr: schema.nameFr,
    approvalTemplateId: member.approvalTemplateId,
    approvalTemplateVersionId: member.approvalVersionId,
    actorId,
    parentRuntimeItemId: String(recommendation.runtimeItemId)
  })
  return true
}

const seedSuccessfulAgreementApproval = async (db: Kysely<Database>, agreementId: string): Promise<void> => {
  const actor = await db.selectFrom('Common_User').select(['id', 'egcs_cn_auth_user_id'])
    .where('egcs_cn_email', '=', 'root@example.com').where('_deleted', '=', false).executeTakeFirstOrThrow()
  if (!actor.egcs_cn_auth_user_id) throw new Error('Seed root user is not linked to authentication')
  const context = await resolveReviewRuntimeEntityFromEntity(db, 'fundingcaseagreement', agreementId)
  if (!context) throw new Error(`Seeded Agreement ${agreementId} runtime context is missing`)
  const run = await startWorkflow(
    seedAuthEvent(db, String(actor.egcs_cn_auth_user_id)),
    db as Transaction<Database>,
    context,
    String(actor.id),
    { purpose: 'approval_submission' }
  )
  if (!run) throw new Error(`Unable to start seeded Agreement ${agreementId} approval workflow`)
  const runtimeId = String(run.id)
  for (let iteration = 0; iteration < 100; iteration += 1) {
    const runtime = await db.selectFrom('Common_Runtime').select('egcs_cn_state')
      .where('id', '=', runtimeId).executeTakeFirstOrThrow()
    if (runtime.egcs_cn_state === 'approved' || runtime.egcs_cn_state === 'succeeded') return
    if (await approveSeedRuntimeStep(db, runtimeId)) continue
    if (await materializeSeedReviewApproval(db, runtimeId, agreementId, String(actor.id))) continue
    if (await materializeSeedRecommendationApproval(db, runtimeId, agreementId, String(actor.id))) continue
    const items = await db.selectFrom('Common_Runtime_Item')
      .select(['egcs_cn_kind', 'egcs_cn_state', 'egcs_cn_order', 'egcs_cn_parentruntimeitem'])
      .where('egcs_cn_runtime', '=', runtimeId).orderBy('id', 'asc').execute()
    throw new Error(`Seeded Agreement ${agreementId} approval workflow cannot advance from ${runtime.egcs_cn_state}: ${JSON.stringify(items)}`)
  }
  throw new Error(`Seeded Agreement ${agreementId} approval workflow exceeded its step limit`)
}

const seedDatabase = async (db: Kysely<Database>): Promise<void> => {
  const gwcoaNumbers = await seedGwcoa(db)
  const agencies = await seedAgencies(db, gwcoaNumbers)

  await db.insertInto('extensions.agency_enablement').values(agencies.map(agency => ({
    extension_key: 'gcs-storage-local',
    agency_id: agency.id,
    enabled: true,
    config: {},
    _deleted: false
  }))).execute()
  await db.insertInto('extensions.agency_storage_selection').values(agencies.map(agency => ({
    agency_id: agency.id,
    provider_key: 'gcs-storage-local',
    _deleted: false
  }))).execute()

  const roles = buildRoleSeeds(agencies)
  const roleIds = await seedRoles(db, roles)

  const passwordHash = await hashPassword('password123')
  await seedUsers(db, passwordHash, roleIds)

  await seedCommonData(db)
  await seedTransferPaymentAbilities(db)
  await seedAgreementAbilities(db)
  await seedApplicantRecipientData(db)
  await seedTransferPaymentData(db)
  await seedRootProgramApprovalRole(db)
  await seedAgreementData(db)
  const deliveryOptions = await db.selectFrom('Transfer_Payment_Stream_Field as field')
    .innerJoin('Transfer_Payment_Stream_Field_Option as option', 'option.field_id', 'field.id')
    .select(['field.id as fieldId', 'field.egcs_tp_transferpaymentstream as streamId', 'option.id as optionId'])
    .where('field.name_en', '=', 'Delivery model').execute()
  for (const option of deliveryOptions) {
    await db.updateTable('Funding_Case_Agreement_Profile').set({ egcs_fc_customfields: { [String(option.fieldId)]: String(option.optionId) } })
      .where('egcs_fc_transferpaymentstream', '=', option.streamId).execute()
  }
  await seedAgreement51Closeout(db)
  await seedAgreementMonitorData(db)
  await seedContributionAgreementDocumentTemplates(db)
  await seedAdvanceAssessmentRuntimeReview(db)
  await seedAmendmentSubtypes(db)

  const seedAssignmentCreator = await db.selectFrom('Common_User').select('id').where('_deleted', '=', false).orderBy('id').executeTakeFirstOrThrow()
  await db.insertInto('Common_Entity_Assignment')
    .columns(['egcs_cn_entityid', 'egcs_cn_entitytype', 'egcs_cn_user', 'egcs_cn_isprimary', 'egcs_cn_createdby'])
    .expression(expression => expression.selectFrom('Common_Entity')
      .select([
        'Common_Entity.id',
        'Common_Entity.egcs_cn_entitytype',
        expression.val(String(seedAssignmentCreator.id)).as('egcs_cn_user'),
        expression.val(true).as('egcs_cn_isprimary'),
        expression.val(String(seedAssignmentCreator.id)).as('egcs_cn_createdby')
      ])
      .where('Common_Entity.egcs_cn_entitytype', 'in', ASSIGNABLE_ENTITY_TYPE_ENUM)
      .where('Common_Entity._deleted', '=', false)
      .where(({ not, exists, selectFrom }) => not(exists(
        selectFrom('Common_Entity_Assignment').select('id')
          .whereRef('Common_Entity_Assignment.egcs_cn_entityid', '=', 'Common_Entity.id')
          .whereRef('Common_Entity_Assignment.egcs_cn_entitytype', '=', 'Common_Entity.egcs_cn_entitytype')
          .where('Common_Entity_Assignment._deleted', '=', false)
      ))).$castTo<Pick<Database['Common_Entity_Assignment'], 'egcs_cn_entityid' | 'egcs_cn_entitytype' | 'egcs_cn_user' | 'egcs_cn_isprimary' | 'egcs_cn_createdby'>>())
    .execute()

  await seedSuccessfulAgreementApproval(db, '51')
  await seedSuccessfulAgreementApproval(db, '60')
}

export const up = async (db: Kysely<Database>): Promise<void> => {
  if (db.isTransaction) {
    await seedDatabase(db)
    return
  }
  await db.transaction().execute(seedDatabase)
}

export const down = async (db: Kysely<Database>): Promise<void> => {
  const lifecycleResetTriggers = [
    ['Common_Routing_Slip', 'trg_lock_terminal_routing_slip'],
    ['Common_Certification', 'trg_lock_terminal_routing_certification'],
    ['Common_Review', 'trg_lock_terminal_review'],
    ['Common_Assessment', 'trg_lock_terminal_assessment'],
    ['Common_Checklist', 'trg_lock_terminal_checklist'],
    ['Common_Review_Response', 'trg_lock_terminal_review_response'],
    ['Common_Checklist_Response', 'trg_lock_terminal_checklist_response'],
    ['Common_Assessment_Outcome', 'trg_lock_terminal_assessment_outcome'],
    ['Common_Assessment_Custom_Outcome', 'trg_lock_terminal_assessment_custom_outcome'],
    ['Common_Recommendation', 'trg_lock_terminal_recommendation'],
    ['Common_Approval_Template', 'trg_guard_publication_authoring'],
    ['Common_Review_Schema', 'trg_guard_publication_authoring'],
    ['Common_Review_Set_Setup', 'trg_guard_publication_authoring'],
    ['Common_Recommendation_Schema', 'trg_guard_publication_authoring'],
    ['Common_Recommendation_Set_Setup', 'trg_guard_publication_authoring'],
    ['Common_Workflow_Setup', 'trg_guard_publication_authoring'],
    ['Common_Approval_Step', 'trg_guard_approval_step_authoring'],
    ['Common_Certification', 'trg_guard_certification_authoring'],
    ['Common_Assessment_Schema', 'trg_guard_assessment_schema_authoring'],
    ['Common_Checklist_Schema', 'trg_guard_checklist_schema_authoring'],
    ['Common_Review_Setup', 'trg_guard_review_setup_authoring'],
    ['Common_Recommendation_Setup', 'trg_guard_recommendation_setup_authoring'],
    ['Common_Workflow_Setup_Allowed_Start_Status', 'trg_guard_workflow_status_authoring'],
    ['Common_Workflow_Setup_Member', 'trg_guard_workflow_member_authoring'],
    ['Common_Workflow_Setup_Member_Owner', 'trg_guard_workflow_owner_authoring'],
    ['Common_Workflow_Publication_Condition', 'protect_workflow_publication_conditions']
  ] as const
  for (const [table, trigger] of lifecycleResetTriggers) {
    await sql.raw(`ALTER TABLE "${table}" DISABLE TRIGGER ${trigger}`).execute(db)
  }
  await sql`ALTER TABLE "Common_Entity_Assignment" DISABLE TRIGGER trg_enforce_entity_assignment_roster`.execute(db)
  await db.deleteFrom('Common_Entity_Assignment').execute()
  await sql`ALTER TABLE "Common_Entity_Assignment" ENABLE TRIGGER trg_enforce_entity_assignment_roster`.execute(db)
  await db.deleteFrom('Common_Workflow_Publication_Condition').execute()
  await db.deleteFrom('Common_Workflow_Member_Condition').execute()
  await db.deleteFrom('Funding_Case_Agreement_Generated_Document').execute()
  await db.deleteFrom('Transfer_Payment_Stream_Document_Template').execute()
  await db.deleteFrom('Common_Assessment_Custom_Outcome').execute()
  await db.deleteFrom('Common_Assessment_Outcome').execute()
  await db.deleteFrom('Common_Review_Response').execute()
  await db.deleteFrom('Common_Assessment_Response').execute()
  await db.deleteFrom('Common_Checklist_Response').execute()
  await db.deleteFrom('Common_Assessment').execute()
  await db.deleteFrom('Common_Checklist').execute()
  await sql`ALTER TABLE "Common_Approval_Certification" DISABLE TRIGGER trg_lock_approval_certification_evidence`.execute(db)
  await db.deleteFrom('Common_Approval_Certification').execute()
  await sql`ALTER TABLE "Common_Approval_Certification" ENABLE TRIGGER trg_lock_approval_certification_evidence`.execute(db)
  await sql`ALTER TABLE "Common_Approval" DISABLE TRIGGER trg_lock_approval_runtime_evidence`.execute(db)
  await db.deleteFrom('Common_Approval').execute()
  await sql`ALTER TABLE "Common_Approval" ENABLE TRIGGER trg_lock_approval_runtime_evidence`.execute(db)
  await db.deleteFrom('Common_Certification').execute()
  await db.deleteFrom('Common_Routing_Slip').execute()
  await db.deleteFrom('Common_Approval_Step').execute()
  await db.deleteFrom('Common_Review').execute()
  await db.deleteFrom('Common_Review_Set').execute()
  await db.deleteFrom('Funding_Case_Agreement_Revision').execute()
  await db.deleteFrom('Common_Recommendation').execute()
  await db.deleteFrom('Common_Recommendation_Set').execute()
  await sql`ALTER TABLE "Funding_Case_Agreement_Approval_Submission" DISABLE TRIGGER trg_immutable_agreement_approval_submission`.execute(db)
  await db.deleteFrom('Funding_Case_Agreement_Approval_Submission').execute()
  await sql`ALTER TABLE "Funding_Case_Agreement_Approval_Submission" ENABLE TRIGGER trg_immutable_agreement_approval_submission`.execute(db)
  await db.deleteFrom('Common_Workflow_Owner_Blocker').execute()
  await sql`ALTER TABLE "Common_Runtime_Transition" DISABLE TRIGGER trg_lock_runtime_transition`.execute(db)
  await db.deleteFrom('Common_Runtime_Transition').execute()
  await sql`ALTER TABLE "Common_Runtime_Transition" ENABLE TRIGGER trg_lock_runtime_transition`.execute(db)
  await sql`ALTER TABLE "Common_Workflow_Status_Transition" DISABLE TRIGGER trg_lock_workflow_status_transition`.execute(db)
  await db.deleteFrom('Common_Workflow_Status_Transition').execute()
  await sql`ALTER TABLE "Common_Workflow_Status_Transition" ENABLE TRIGGER trg_lock_workflow_status_transition`.execute(db)
  await db.deleteFrom('Common_Runtime_Item').execute()
  await sql`ALTER TABLE "Common_Workflow_Run" DISABLE TRIGGER trg_enforce_completion_resolution_from_workflow`.execute(db)
  await db.deleteFrom('Common_Workflow_Run').execute()
  await sql`ALTER TABLE "Common_Workflow_Run" ENABLE TRIGGER trg_enforce_completion_resolution_from_workflow`.execute(db)
  await db.deleteFrom('Common_Runtime').execute()
  await db.deleteFrom('Common_Workflow_Setup_Member_Owner').execute()
  await db.deleteFrom('Common_Workflow_Setup_Member').execute()
  await db.deleteFrom('Common_Workflow_Setup_Allowed_Start_Status').execute()
  await db.deleteFrom('Common_Workflow_Setup').execute()
  await db.deleteFrom('Common_Recommendation_Setup').execute()
  await db.deleteFrom('Common_Recommendation_Set_Setup').execute()
  await db.deleteFrom('Common_Review_Setup').execute()
  await db.deleteFrom('Common_Review_Set_Setup').execute()
  await db.deleteFrom('Common_Recommendation_Schema').execute()
  await db.deleteFrom('Common_Entity_Attachment').execute()
  await db.deleteFrom('Common_Attachment').execute()
  await db.deleteFrom('Common_Attachment_Types').execute()
  await sql`ALTER TABLE "Common_Completion" DISABLE TRIGGER trg_lock_completion`.execute(db)
  await db.deleteFrom('Common_Completion').execute()
  await sql`ALTER TABLE "Common_Completion" ENABLE TRIGGER trg_lock_completion`.execute(db)
  await db.deleteFrom('Common_Approval_Template').execute()
  await db.deleteFrom('Common_Assessment_Schema').execute()
  await db.deleteFrom('Common_Checklist_Schema').execute()
  await db.deleteFrom('Common_Review_Schema').execute()
  await sql`ALTER TABLE "Common_Workflow_Publication_Status" DISABLE TRIGGER trg_lock_workflow_publication_status`.execute(db)
  await db.deleteFrom('Common_Workflow_Publication_Status').execute()
  await sql`ALTER TABLE "Common_Workflow_Publication_Status" ENABLE TRIGGER trg_lock_workflow_publication_status`.execute(db)
  await db.deleteFrom('Common_Publication_Selection').execute()
  await sql`ALTER TABLE "Common_Publication_Version_Reference" DISABLE TRIGGER trg_lock_publication_version_reference`.execute(db)
  await db.deleteFrom('Common_Publication_Version_Reference').execute()
  await sql`ALTER TABLE "Common_Publication_Version_Reference" ENABLE TRIGGER trg_lock_publication_version_reference`.execute(db)
  await sql`ALTER TABLE "Common_Publication_Transition" DISABLE TRIGGER trg_lock_publication_transition`.execute(db)
  await db.deleteFrom('Common_Publication_Transition').execute()
  await sql`ALTER TABLE "Common_Publication_Transition" ENABLE TRIGGER trg_lock_publication_transition`.execute(db)
  await sql`ALTER TABLE "Common_Publication" DISABLE TRIGGER trg_validate_publication_update`.execute(db)
  await sql`ALTER TABLE "Common_Publication" DISABLE TRIGGER trg_require_publication_transition`.execute(db)
  await db.updateTable('Common_Publication').set({ egcs_cn_state: 'draft', egcs_cn_currentversion: null }).execute()
  await sql`ALTER TABLE "Common_Publication" ENABLE TRIGGER trg_require_publication_transition`.execute(db)
  await sql`ALTER TABLE "Common_Publication" ENABLE TRIGGER trg_validate_publication_update`.execute(db)
  await sql`ALTER TABLE "Common_Publication_Version" DISABLE TRIGGER trg_lock_publication_version`.execute(db)
  await db.deleteFrom('Common_Publication_Version').execute()
  await sql`ALTER TABLE "Common_Publication_Version" ENABLE TRIGGER trg_lock_publication_version`.execute(db)
  await db.deleteFrom('Common_Publication').execute()
  await db.deleteFrom('Funding_Case_Agreement_Address').execute()
  await db.deleteFrom('Applicant_Recipient_Address').execute()
  await db.deleteFrom('Common_Address').execute()
  await db.deleteFrom('Common_Contact').execute()

  await sql`ALTER TABLE "Funding_Case_Agreement_Closeout_Snapshot" DISABLE TRIGGER trg_immutable_agreement_closeout_snapshot`.execute(db)
  await db.deleteFrom('Funding_Case_Agreement_Closeout_Snapshot').execute()
  await sql`ALTER TABLE "Funding_Case_Agreement_Closeout_Snapshot" ENABLE TRIGGER trg_immutable_agreement_closeout_snapshot`.execute(db)
  await db.deleteFrom('Funding_Case_Agreement_Closeout').execute()
  await db.deleteFrom('Funding_Case_Agreement_Payment_Line').execute()
  await db.deleteFrom('Funding_Case_Agreement_Payment').execute()
  await db.deleteFrom('Funding_Case_Agreement_Commitment_Line').execute()
  await db.deleteFrom('Funding_Case_Agreement_Commitment').execute()
  await db.deleteFrom('Funding_Case_Agreement_Monitor_Promising_Practice').execute()
  await db.deleteFrom('Funding_Case_Agreement_Monitor_Followup_Update').execute()
  await db.deleteFrom('Funding_Case_Agreement_Monitor_Followup').execute()
  await db.deleteFrom('Funding_Case_Agreement_Monitor_Finding').execute()
  await db.deleteFrom('Funding_Case_Agreement_Monitor_Items').execute()
  await db.deleteFrom('Funding_Case_Agreement_Monitor_Planning').execute()
  await db.deleteFrom('Funding_Case_Agreement_Monitor').execute()
  await db.deleteFrom('Funding_Case_Agreement_Claim_Reconcile_Line_Item').execute()
  await db.deleteFrom('Funding_Case_Agreement_Claim_Reconcile').execute()
  await db.deleteFrom('Funding_Case_Agreement_Claim_Line_Item').execute()
  await db.deleteFrom('Funding_Case_Agreement_Claim').execute()
  await db.deleteFrom('Funding_Case_Agreement_Forecast_Line_Item').execute()
  await db.deleteFrom('Funding_Case_Agreement_Forecast').execute()
  await db.deleteFrom('Funding_Case_Agreement_Responsible_Party_Activity').execute()
  await db.deleteFrom('Funding_Case_Agreement_Outcome_Activity').execute()
  await db.deleteFrom('Funding_Case_Agreement_Activity').execute()
  await db.deleteFrom('Funding_Case_Agreement_Applicant_Recipient').execute()
  await db.deleteFrom('Funding_Case_Agreement_Budget_Line_Item').execute()
  await db.deleteFrom('Funding_Case_Agreement_Budget_Fiscal_Year').execute()
  await db.deleteFrom('Funding_Case_Agreement_Activity_Version').execute()
  await db.deleteFrom('Funding_Case_Agreement_Budget_Version').execute()
  await db.deleteFrom('Funding_Case_Agreement_Profile').execute()
  await db.deleteFrom('extensions.gcs_gcforms_credentials').execute()
  await db.deleteFrom('extensions.secret_entry').execute()
  await db.deleteFrom('extensions.stream_configuration').execute()
  await db.deleteFrom('extensions.agency_storage_selection').execute()
  await db.deleteFrom('extensions.agency_enablement').execute()
  await sql`DROP TABLE IF EXISTS extensions.gcs_gcforms_credentials`.execute(db)
  await db.deleteFrom('Transfer_Payment_Agreement_Subtype').execute()
  await db.deleteFrom('Transfer_Payment_Amendment_Subtype_Type').execute()
  await db.deleteFrom('Transfer_Payment_Amendment_Subtype').execute()
  await db.deleteFrom('Transfer_Payment_Amendment_Type').execute()
  await db.deleteFrom('Applicant_Recipient_Registry').execute()
  await db.deleteFrom('Applicant_Recipient_Profile').execute()
  await db.deleteFrom('Transfer_Payment_Stream_Outcome').execute()
  await db.deleteFrom('Transfer_Payment_Outcome_Performance_Indicator').execute()
  await db.deleteFrom('Transfer_Payment_Stream_Cost_Category_Line_Item').execute()
  await db.deleteFrom('Transfer_Payment_Stream_Eligible_Recipient').execute()
  await db.deleteFrom('Transfer_Payment_Stream_Chart_of_Account').execute()
  await db.deleteFrom('Transfer_Payment_Stream_Commitment_Type').execute()
  await db.deleteFrom('Transfer_Payment_Monitor_Type').execute()
  await db.deleteFrom('Transfer_Payment_Stream_Risk_Rating').execute()
  await db.deleteFrom('Transfer_Payment_Stream_Holdback_Basis').execute()
  await db.deleteFrom('Transfer_Payment_Stream_Budget').execute()
  await db.deleteFrom('Transfer_Payment_Objective').execute()
  await db.deleteFrom('Transfer_Payment_Outcome').execute()
  await db.deleteFrom('Transfer_Payment_Financial_Limits').execute()
  await db.deleteFrom('Transfer_Payment_Stream_Field_Option').execute()
  await db.deleteFrom('Transfer_Payment_Stream_Field').execute()
  await db.deleteFrom('Transfer_Payment_Stream_Field_Section').execute()
  await db.deleteFrom('Transfer_Payment_Stream').execute()
  await db.deleteFrom('Transfer_Payment_Fiscal_Year_Budget').execute()
  await db.deleteFrom('role_transfer_payment_scope').execute()
  await db.deleteFrom('Transfer_Payment_Profile').execute()
  await db.deleteFrom('Common_Entity').execute()
  await db.deleteFrom('Common_User').execute()

  await db.deleteFrom('user_role_assignment').execute()
  await db.deleteFrom('account').execute()
  await db.deleteFrom('user').execute()
  await db.deleteFrom('role_permission').execute()
  await db.deleteFrom('role').execute()
  await db.deleteFrom('Agency_Agreement_Type').execute()
  await db.deleteFrom('Agency_Approval_Behalf_Type').execute()
  await db.deleteFrom('Agency_Applicant_Recipient_Subtype').execute()
  await db.deleteFrom('Agency_Address_Type').execute()
  await db.deleteFrom('Agency_Fiscal_Year').execute()
  await db.deleteFrom('Agency_Cost_Category_Line_Item').execute()
  await db.deleteFrom('Agency_Cost_Category').execute()
  await db.deleteFrom('Agency_Holdback_Basis').execute()
  await db.updateTable('Agency_Profile').set({
    egcs_ay_claimreconciliationstartstatus: null,
    egcs_ay_claimreconciliationfinalstatus: null
  }).execute()
  await sql`ALTER TABLE "Common_Status" DISABLE TRIGGER trg_protect_agency_draft_status`.execute(db)
  await db.deleteFrom('Common_Status').execute()
  await sql`ALTER TABLE "Common_Status" ENABLE TRIGGER trg_protect_agency_draft_status`.execute(db)
  await db.deleteFrom('Agency_Profile').execute()
  await db.deleteFrom('Common_GWCOA').execute()
  for (const [table, trigger] of lifecycleResetTriggers) {
    await sql.raw(`ALTER TABLE "${table}" ENABLE TRIGGER ${trigger}`).execute(db)
  }
}
