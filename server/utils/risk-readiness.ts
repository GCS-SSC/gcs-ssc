import { parseSafeDecimal } from '~~/shared/utils/decimal'
/* eslint-disable jsdoc/require-jsdoc -- Shared exact-target risk readiness and immutable submission capture. */
import type { H3Event } from 'h3'
import type { Kysely, Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import type { RiskReadiness, RiskTarget, SubmissionRisk } from '~~/shared/types/risk'
import { throwApiError } from './api-errors'
import { readPublishedWorkflowConfiguration } from './workflow-setup-versioning'
import { usesWorkflowResultConditions } from './workflow-execution-plan'
import {
  captureAmendmentRiskSelections, matchAmendmentRiskSelections, readStreamRiskPolicy, resolveLatestRiskRating
} from './agreement-risk-rating'
import type { WorkflowRoutingEvidence } from './workflow-routing-contract'

type RiskDb = Kysely<Database> | Transaction<Database>

const readTarget = async (db: RiskDb, target: RiskTarget) => {
  const amendment = target.entityType === 'fundingcaseamendment'
    ? await db.selectFrom('Funding_Case_Agreement_Amendment').select([
        'egcs_fc_fundingagreement', 'egcs_fc_changerisk', 'egcs_fc_proposedriskscore', 'egcs_fc_riskratingruntime'
      ]).where('id', '=', target.entityId).where('_deleted', '=', false).executeTakeFirstOrThrow()
    : null
  const agreement = await db.selectFrom('Funding_Case_Agreement_Profile')
    .select(['egcs_fc_transferpaymentstream', 'egcs_fc_riskscore', 'egcs_fc_riskratingruntime'])
    .where('id', '=', amendment ? String(amendment.egcs_fc_fundingagreement) : target.entityId)
    .where('_deleted', '=', false).executeTakeFirstOrThrow()
  return { amendment, agreement, streamId: String(agreement.egcs_fc_transferpaymentstream) }
}

const readLinkedRiskWorkflow = async (db: RiskDb, target: RiskTarget, streamId: string, setupId: string) => {
  const row = await db.selectFrom('Transfer_Payment_Stream_Workflow as link')
    .innerJoin('Common_Workflow_Setup as setup', 'setup.id', 'link.egcs_tp_workflow')
    .innerJoin('Common_Publication as publication', 'publication.id', 'setup.id')
    .innerJoin('Common_Publication_Version as version', 'version.id', 'publication.egcs_cn_currentversion')
    .select(['setup.id', 'version.id as versionId', 'version.egcs_cn_definition as definition'])
    .where('link.egcs_tp_transferpaymentstream', '=', streamId)
    .where('setup.id', '=', setupId)
    .where('link._deleted', '=', false).where('setup._deleted', '=', false)
    .where('publication._deleted', '=', false).where('publication.egcs_cn_state', '=', 'published')
    .where('publication.egcs_cn_kind', '=', 'workflow_setup').executeTakeFirst()
  if (!row) return undefined
  const { entityType, purpose } = readPublishedWorkflowConfiguration(row.definition)
  return entityType === target.entityType && purpose === 'risk_rating' ? row : undefined
}

const successfulRiskRuns = (db: RiskDb, target: RiskTarget) => db.selectFrom('Common_Runtime as runtime')
  .innerJoin('Common_Workflow_Run as run', 'run.id', 'runtime.id')
  .select([
    'runtime.id', 'runtime.egcs_cn_sourcepublication', 'runtime.egcs_cn_sourcepublicationversion',
    'runtime.egcs_cn_state', 'runtime.egcs_cn_completedat', 'run.egcs_cn_routing'
  ])
  .where('runtime.egcs_cn_kind', '=', 'workflow').where('runtime.egcs_cn_purpose', '=', 'risk_rating')
  .where('runtime.egcs_cn_entitytype', '=', target.entityType).where('runtime.egcs_cn_entityid', '=', target.entityId)
  .where('runtime.egcs_cn_state', 'in', ['succeeded', 'approved']).where('runtime._deleted', '=', false)
  .orderBy('runtime.egcs_cn_completedat', 'desc').orderBy('runtime.id', 'desc')

const matchesRiskScope = (
  value: unknown, streamId: string, selections?: Awaited<ReturnType<typeof captureAmendmentRiskSelections>>
) => {
  const routing = value as WorkflowRoutingEvidence | null
  return routing?.riskRatingMapping?.streamId === streamId
    && (!selections || matchAmendmentRiskSelections(routing.amendmentRiskSelections, selections))
}

export const getConfiguredRiskWorkflowSuccess = async (
  db: RiskDb, target: RiskTarget, setupId: string, streamId: string,
  selections?: Awaited<ReturnType<typeof captureAmendmentRiskSelections>>
) => {
  const scope = target.entityType === 'fundingcaseamendment'
    ? selections ?? await captureAmendmentRiskSelections(db, target.entityId)
    : undefined
  const attempts = await successfulRiskRuns(db, target)
    .innerJoin('Common_Publication_Version as pinned', 'pinned.id', 'runtime.egcs_cn_sourcepublicationversion')
    .select('pinned.egcs_cn_definition as pinnedDefinition')
    .where('runtime.egcs_cn_sourcepublication', '=', setupId).execute()
  for (const attempt of attempts) {
    if (!matchesRiskScope(attempt.egcs_cn_routing, streamId, scope) || attempt.pinnedDefinition == null) continue
    const definition = readPublishedWorkflowConfiguration(attempt.pinnedDefinition)
    if (!usesWorkflowResultConditions(definition)
      || (await resolveLatestRiskRating(db, { ...target, runtimeId: attempt.id }))?.mappedRating) return attempt
  }
  return undefined
}

const resolveRiskDecision = async (db: RiskDb, target: RiskTarget) => {
  const { amendment, agreement, streamId } = await readTarget(db, target)
  const policy = await readStreamRiskPolicy(db, streamId, target.entityType)
  const required = policy.enabled
  const selected = required && policy.setupId ? await readLinkedRiskWorkflow(db, target, streamId, policy.setupId) : undefined
  const selections = amendment ? await captureAmendmentRiskSelections(db, target.entityId) : undefined
  const success = selected && await getConfiguredRiskWorkflowSuccess(db, target, selected.id, streamId, selections)
  const proposal = amendment ? amendment.egcs_fc_proposedriskscore : agreement.egcs_fc_riskscore
  const score = proposal == null ? null : parseSafeDecimal(String(proposal))
  const runtimeId = amendment ? amendment.egcs_fc_riskratingruntime : agreement.egcs_fc_riskratingruntime
  const useRating = !amendment || required || amendment.egcs_fc_changerisk
  const run = runtimeId && useRating
    ? await successfulRiskRuns(db, target).where('runtime.id', '=', runtimeId).executeTakeFirst()
    : undefined
  const sourceLinked = run && (run.egcs_cn_sourcepublication === selected?.id
    || await readLinkedRiskWorkflow(db, target, streamId, run.egcs_cn_sourcepublication))
  const calculation = run && sourceLinked && matchesRiskScope(run.egcs_cn_routing, streamId, selections)
    ? await resolveLatestRiskRating(db, { ...target, runtimeId: run.id })
    : null
  const calculationSource = calculation?.mappedRating && calculation.mappedRating.score === score
    ? { ...calculation, completedAt: calculation.completedAt ? new Date(calculation.completedAt).toISOString() : null }
    : null
  const manualRating = !required && amendment?.egcs_fc_changerisk && !runtimeId && score !== null
    ? await db.selectFrom('Transfer_Payment_Stream_Risk_Rating').select('id')
        .where('egcs_tp_transferpaymentstream', '=', streamId)
        .where('egcs_tp_riskscore', '=', String(score)).where('_deleted', '=', false).execute()
    : []
  const blocker = required && !success
    ? 'risk_workflow_required'
    : useRating && (required || runtimeId) && !calculationSource
      ? 'risk_rating_source_stale'
      : !required && amendment?.egcs_fc_changerisk && !calculationSource && manualRating.length !== 1
          ? 'risk_score_required'
          : null
  const readiness: RiskReadiness = {
    ready: blocker === null, required, workflowManaged: required,
    setupId: selected?.id ?? null,
    publicationVersionId: selected?.versionId ?? null,
    successfulRuntimeId: success?.id ?? null,
    blocker,
    evidence: success
      ? {
          runtimeId: success.id, setupId: success.egcs_cn_sourcepublication,
          publicationVersionId: success.egcs_cn_sourcepublicationversion,
          state: success.egcs_cn_state as 'succeeded' | 'approved',
          completedAt: success.egcs_cn_completedat ? new Date(success.egcs_cn_completedat).toISOString() : null
        }
      : null
  }
  return { readiness, amendment, streamId, score, calculationSource }
}

export const getRiskReadiness = async (
  db: RiskDb, target: RiskTarget
): Promise<RiskReadiness> => (await resolveRiskDecision(db, target)).readiness

export const readSubmissionRisk = async (
  db: RiskDb, target: RiskTarget, { lockRows = false }: { lockRows?: boolean } = {}
): Promise<SubmissionRisk> => {
  const { readiness, amendment, streamId, score, calculationSource } = await resolveRiskDecision(db, target)
  const enabled = amendment ? readiness.workflowManaged || amendment.egcs_fc_changerisk : readiness.workflowManaged || Boolean(calculationSource)
  const stream = amendment
    ? await db.selectFrom('Transfer_Payment_Stream').select('egcs_tp_applyamendmentrisktotheagreement')
        .where('id', '=', streamId).executeTakeFirstOrThrow()
    : null
  const apply = Boolean(stream?.egcs_tp_applyamendmentrisktotheagreement && enabled && score !== null)
  let rating = calculationSource?.mappedRating ?? null
  if (!rating && score !== null) {
    let ratingQuery = db.selectFrom('Transfer_Payment_Stream_Risk_Rating')
      .select(['id', 'egcs_tp_riskscore', 'egcs_tp_name_en', 'egcs_tp_name_fr'])
      .where('egcs_tp_transferpaymentstream', '=', streamId).where('egcs_tp_riskscore', '=', String(score))
      .where('_deleted', '=', false).orderBy('id', 'asc')
    if (lockRows) ratingQuery = ratingQuery.forShare()
    const rows = await ratingQuery.execute()
    if (rows.length === 1) {
      const row = rows[0]!
      rating = { id: String(row.id), score: parseSafeDecimal(String(row.egcs_tp_riskscore)),
        label: { en: row.egcs_tp_name_en, fr: row.egcs_tp_name_fr } }
    }
  }
  return { version: 1, enabled, apply, proposedScore: score, rating, calculationSource, readiness }
}

export const captureSubmissionRisk = async (
  event: H3Event, trx: Transaction<Database>, target: RiskTarget
): Promise<SubmissionRisk> => {
  const risk = await readSubmissionRisk(trx, target, { lockRows: true })
  const { blocker } = risk.readiness
  if (blocker) return await throwApiError(event, {
    statusCode: 409,
    code: {
      risk_score_required: 'RISK_SCORE_REQUIRED',
      risk_workflow_required: 'RISK_WORKFLOW_REQUIRED',
      risk_rating_source_stale: 'RISK_RATING_SOURCE_STALE'
    }[blocker],
    key: `apiErrors.workflow.${blocker}`
  })
  if (risk.apply && !risk.rating) return await throwApiError(event, {
    statusCode: 409, code: 'RISK_SCORE_REQUIRED', key: 'apiErrors.workflow.risk_score_required'
  })
  return risk
}
