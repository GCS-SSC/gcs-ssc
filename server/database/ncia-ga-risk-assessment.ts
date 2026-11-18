/* eslint-disable jsdoc/require-jsdoc -- the demo upgrade and typed configuration describe their contracts */
import { sql, type Kysely, type Transaction } from 'kysely'
import sample from '../../demo-assets/samples/ga-risk-assessment.json'
import type { Database } from '../../shared/types/database'
import { createAssessmentDefinitionSchemaForEntityType } from '../../shared/types/schemas/assessment/assessment'
import { buildReviewSchemaDefinition } from '../utils/review-schema-versioning'
import { buildReviewSetupPublication } from '../utils/review-setup-versioning'
import { buildWorkflowSetupPublication, hasPendingWorkflowSetupChanges } from '../utils/workflow-setup-versioning'
import { publishDefinition } from '../utils/system-publication'
import { validateWorkflowRiskRatingMappingForStream } from '../utils/agreement-risk-rating'

export const NCIA_GA_ASSESSMENT_NAME = 'GA Risk Assessment Demonstration'
const originalRiskWorkflowHash = '5856c61a6379b0af1db03bf7e48b7e5ec6b31c25216fc9c31b7d786981d4e4dd'

export const NCIA_GA_SCORING_MATRIX = [
  { max: 2, label: { en: 'Low risk', fr: 'Risque faible' }, indicator: '#16A34A' },
  { max: 4, label: { en: 'Medium risk', fr: 'Risque moyen' }, indicator: '#D97706' },
  { max: 5, label: { en: 'High risk', fr: 'Risque élevé' }, indicator: '#DC2626' }
]

const finalMaximum = (maximum: number): number => {
  switch (maximum) {
    case 1: return 2
    case 2: return 4
    case 3: return 5
    default: throw new Error('The GA sample contains an unsupported outcome threshold')
  }
}

export const buildNciaGaRiskAssessment = () => {
  const schema = createAssessmentDefinitionSchemaForEntityType('fundingcaseagreement')
  const original = schema.parse(sample)
  return schema.parse({
    ...original,
    outcomes: [
      ...original.outcomes.map(outcome => ({ ...outcome,
        strategies: outcome.strategies.map(strategy => ({ ...strategy,
          options: strategy.options.map(option => ({ ...option, max: finalMaximum(option.max) }))
        }))
      })),
      { name: 'reporting', label: { en: 'Demonstration reporting', fr: 'Rapports de démonstration' }, strategies: [
        { name: 'reporting-frequency', label: { en: 'Reporting frequency', fr: 'Fréquence des rapports' }, options: [
          { max: 2, value: 'annual', label: { en: 'Annual reporting', fr: 'Rapports annuels' } },
          { max: 4, value: 'quarterly', label: { en: 'Quarterly reporting', fr: 'Rapports trimestriels' } },
          { max: 5, value: 'monthly', label: { en: 'Monthly reporting', fr: 'Rapports mensuels' } }
        ] }
      ] }
    ],
    impactors: [
      { label: { en: 'Funding exposure (demo)', fr: 'Exposition financière (démo)' }, weight: 0.5,
        on: { type: 'helpers', field: 'egcs_fc_agreementvalue' }, scoringMatrix: [
          { max: 100000, value: 0 }, { max: 250000, value: 1 }, { max: 1000000000, value: 2 }
        ] },
      { label: { en: 'Audit findings (demo)', fr: 'Constatations d’audit (démo)' }, weight: 0.5,
        on: { type: 'answers', section: 'risk-factor-3', subsection: 'consideration-2', question: 'risk-rating' },
        scoringMatrix: [{ max: 1, value: 0 }, { max: 2, value: 1 }, { max: 3, value: 2 }] }
    ]
  })
}

const upgrade = async (db: Transaction<Database>): Promise<void> => {
  const agency = await db.selectFrom('Agency_Profile').select('id')
    .where('id', '=', '21').where('egcs_ay_name_en', '=', 'Northern Communities Innovation Agency')
    .where('_deleted', '=', false).forUpdate().executeTakeFirst()
  if (!agency) return
  const existing = await db.selectFrom('Common_Review_Schema').select('id')
    .where('egcs_cn_agency', '=', agency.id).where('egcs_cn_name_en', '=', NCIA_GA_ASSESSMENT_NAME)
    .where('_deleted', '=', false).executeTakeFirst()
  if (existing) return
  const stream = await db.selectFrom('Transfer_Payment_Stream as stream')
    .innerJoin('Transfer_Payment_Profile as program', 'program.id', 'stream.egcs_tp_transferpaymentprofile')
    .select('stream.id').where('stream.id', '=', '118').where('program.egcs_tp_agency', '=', agency.id)
    .where('stream._deleted', '=', false).where('program._deleted', '=', false).forUpdate('stream').executeTakeFirst()
  const originalWorkflow = await db.selectFrom('Common_Workflow_Setup').selectAll()
    .where('id', '=', '389').where('egcs_cn_agency', '=', agency.id).where('_deleted', '=', false).executeTakeFirst()
  const actor = await db.selectFrom('Common_User').select('id').where('id', '=', '1').where('_deleted', '=', false).executeTakeFirst()
  const originalSchema = await db.selectFrom('Common_Review_Schema').select('id')
    .where('id', '=', '387').where('egcs_cn_agency', '=', agency.id).where('_deleted', '=', false).executeTakeFirst()
  if (!stream || !originalWorkflow || !actor || !originalSchema) return

  // The snapshot seed validates constraints immediately; publication transitions settle as a pair.
  await sql`SET CONSTRAINTS trg_require_publication_transition DEFERRED`.execute(db)
  const schema = await db.insertInto('Common_Review_Schema').values({
    egcs_cn_agency: agency.id, egcs_cn_entitytype: 'fundingcaseagreement', egcs_cn_reviewtype: 'assessment',
    egcs_cn_name_en: NCIA_GA_ASSESSMENT_NAME, egcs_cn_name_fr: 'Démonstration de l’évaluation des risques de S et C',
    egcs_cn_outcomename_en: 'Risk rating and monitoring', egcs_cn_outcomename_fr: 'Cote de risque et surveillance',
    egcs_cn_scoringmatrix: sql`${JSON.stringify(NCIA_GA_SCORING_MATRIX)}::jsonb`,
    egcs_cn_assessmentschema: sql`${JSON.stringify(buildNciaGaRiskAssessment())}::jsonb`,
    egcs_cn_disablealignment: false, egcs_cn_disablereviewers: false, egcs_cn_disablecustomoutcomes: false
  }).returningAll().executeTakeFirstOrThrow()
  await publishDefinition(db, { publicationId: String(schema.id), kind: 'review_schema',
    definition: buildReviewSchemaDefinition(schema), actorId: actor.id })
  const set = await db.insertInto('Common_Review_Set_Setup').values({ egcs_cn_agency: agency.id,
    egcs_cn_entitytype: 'fundingcaseagreement', egcs_cn_name_en: 'GA Risk Review Demonstration',
    egcs_cn_name_fr: 'Démonstration de l’examen des risques de S et C', egcs_cn_order: 2,
    egcs_cn_sequential: true, egcs_cn_directreview: false,
    egcs_cn_description_en: 'Training example with four risk factors, outcomes and impactors; not agency policy.',
    egcs_cn_description_fr: 'Exemple de formation comportant quatre facteurs de risque, des résultats et des facteurs d’impact; ce n’est pas une politique de l’organisme.'
  }).returningAll().executeTakeFirstOrThrow()
  await db.insertInto('Common_Review_Setup').values({ egcs_cn_reviewset: set.id,
    egcs_cn_entitytype: 'fundingcaseagreement', egcs_cn_order: 1, egcs_cn_reviewschema: originalSchema.id
  }).execute()
  const review = await db.insertInto('Common_Review_Setup').values({ egcs_cn_reviewset: set.id,
    egcs_cn_entitytype: 'fundingcaseagreement', egcs_cn_order: 2, egcs_cn_reviewschema: schema.id
  }).returning('id').executeTakeFirstOrThrow()
  const reviewPlan = await buildReviewSetupPublication(db, set)
  await publishDefinition(db, { publicationId: String(set.id), kind: 'review_set_setup',
    definition: reviewPlan.definition, references: reviewPlan.references, actorId: actor.id })
  const { id: _id, ...workflowValues } = originalWorkflow
  const workflow = await db.insertInto('Common_Workflow_Setup').values({ ...workflowValues,
    egcs_cn_name_en: 'GA Risk Rating Demonstration', egcs_cn_name_fr: 'Démonstration de la cotation des risques de S et C',
    egcs_cn_description_en: 'Four-factor GA assessment with monitoring outcomes and demonstrated risk impactors.',
    egcs_cn_description_fr: 'Évaluation à quatre facteurs de S et C avec résultats de surveillance et facteurs d’impact démontrés.'
  }).returningAll().executeTakeFirstOrThrow()
  const statuses = await db.selectFrom('Common_Workflow_Setup_Allowed_Start_Status')
    .select(['egcs_cn_status', 'egcs_cn_order']).where('egcs_cn_workflowsetup', '=', originalWorkflow.id)
    .where('_deleted', '=', false).execute()
  if (statuses.length) await db.insertInto('Common_Workflow_Setup_Allowed_Start_Status')
    .values(statuses.map(status => ({ ...status, egcs_cn_workflowsetup: workflow.id }))).execute()
  await db.insertInto('Common_Workflow_Setup_Member').values({ egcs_cn_workflowsetup: workflow.id,
    egcs_cn_sequence: 1, egcs_cn_kind: 'review_set', egcs_cn_reviewset: set.id,
    egcs_cn_setsriskrating: true, egcs_cn_riskreviewsetup: review.id
  }).execute()
  const workflowPlan = await buildWorkflowSetupPublication(db, workflow)
  await publishDefinition(db, { publicationId: String(workflow.id), kind: 'workflow_setup', definition: workflowPlan.definition,
    references: workflowPlan.references, workflowStatuses: workflowPlan.statuses, actorId: actor.id })
  await sql`SET CONSTRAINTS trg_require_publication_transition IMMEDIATE`.execute(db)
  await db.insertInto('Transfer_Payment_Stream_Review_Set').values({
    egcs_tp_transferpaymentstream: stream.id, egcs_tp_reviewset: set.id
  }).execute()

  const currentLink = await db.selectFrom('Transfer_Payment_Stream_Workflow as link')
    .innerJoin('Common_Workflow_Setup as setup', 'setup.id', 'link.egcs_tp_workflow')
    .innerJoin('Common_Publication as publication', 'publication.id', 'setup.id')
    .innerJoin('Common_Publication_Version as version', 'version.id', 'publication.egcs_cn_currentversion')
    .select(['link.id', 'setup.id as workflowId', 'version.egcs_cn_hash as hash'])
    .where('link.egcs_tp_transferpaymentstream', '=', stream.id).where('link._deleted', '=', false)
    .where('setup.egcs_cn_entitytype', '=', 'fundingcaseagreement').where('setup.egcs_cn_purpose', '=', 'risk_rating')
    .executeTakeFirst()
  if (currentLink?.workflowId !== originalWorkflow.id || currentLink.hash !== originalRiskWorkflowHash) return
  if (await hasPendingWorkflowSetupChanges(db, originalWorkflow)) return
  if (!await validateWorkflowRiskRatingMappingForStream(db, String(stream.id), workflowPlan.definition)) return
  await db.updateTable('Transfer_Payment_Stream_Workflow').set({ _deleted: true }).where('id', '=', currentLink.id).execute()
  await db.insertInto('Transfer_Payment_Stream_Workflow').values({
    egcs_tp_transferpaymentstream: stream.id, egcs_tp_workflow: workflow.id
  }).execute()
}

const isTransaction = (db: Kysely<Database>): db is Transaction<Database> => db.isTransaction

export const upgradeNciaGaRiskAssessment = async (db: Kysely<Database>): Promise<void> => {
  if (isTransaction(db)) await upgrade(db)
  else await db.transaction().execute(upgrade)
}
