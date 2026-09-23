import type { Kysely, Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import type { PublishedRiskRatingEffect, PublishedWorkflowConfiguration } from './workflow-setup-versioning'
import type { WorkflowRoutingEvidence } from './workflow-routing-contract'
import { readPublishedWorkflowConfiguration } from './workflow-setup-versioning'

type DbClient = Kysely<Database> | Transaction<Database>
type RiskRatingMapping = NonNullable<WorkflowRoutingEvidence['riskRatingMapping']>
const pinnedStates = ['pending', 'active', 'awaiting_action', 'paused', 'unsuccessful', 'denied', 'cancelled', 'failed'] as const

/**
 * Resolves every publication score to exactly one active Stream rating and captures its labels.
 * @param db Database connection.
 * @param streamId Stream identity.
 * @param effect Published score-only risk effect.
 * @returns Mapping ready for immutable attempt evidence.
 */
export const captureRiskRatingMapping = async (
  db: DbClient, streamId: string, effect: PublishedRiskRatingEffect
): Promise<RiskRatingMapping> => {
  const scores = [...new Set(effect.bands.map(band => band.riskScore))]
  const ratings = await db.selectFrom('Transfer_Payment_Stream_Risk_Rating')
    .select(['id', 'egcs_tp_riskscore', 'egcs_tp_name_en', 'egcs_tp_name_fr'])
    .where('egcs_tp_transferpaymentstream', '=', streamId)
    .where('egcs_tp_riskscore', 'in', scores)
    .where('_deleted', '=', false)
    .orderBy('id', 'asc')
    .forUpdate()
    .execute()
  const bands = effect.bands.map(band => {
    const matches = ratings.filter(rating => Number(rating.egcs_tp_riskscore) === band.riskScore)
    if (matches.length !== 1) throw new Error('Risk Rating score requires exactly one active Stream rating')
    const rating = matches[0]!
    return { maximumScore: band.maximumScore, riskScore: band.riskScore,
      riskRatingId: String(rating.id), label: { en: rating.egcs_tp_name_en, fr: rating.egcs_tp_name_fr } }
  })
  return { streamId, bands }
}

/**
 * Confirms a Stream can map every score required by a Workflow publication.
 * @param db Database transaction.
 * @param streamId Stream identity.
 * @param definition Published Workflow definition.
 * @returns Whether all required scores have one active rating.
 */
export const validateWorkflowRiskRatingMappingForStream = async (
  db: DbClient, streamId: string, definition: PublishedWorkflowConfiguration
): Promise<boolean> => {
  if (definition.purpose !== 'risk_rating') return true
  if (definition.entityType !== 'fundingcaseagreement' || !definition.riskRatingEffect) return false
  try {
    await captureRiskRatingMapping(db, streamId, definition.riskRatingEffect)
    return true
  } catch {
    return false
  }
}

/**
 * Returns whether the Stream has a live published Agreement Risk Rating Workflow link.
 * @param db Database connection.
 * @param streamId Stream identity.
 * @returns Whether risk scoring is workflow-managed.
 */
export const isAgreementRiskRatingWorkflowManaged = async (db: DbClient, streamId: string): Promise<boolean> => Boolean(
  await db.selectFrom('Transfer_Payment_Stream_Workflow as link')
    .innerJoin('Common_Workflow_Setup as setup', 'setup.id', 'link.egcs_tp_workflow')
    .innerJoin('Common_Publication as publication', 'publication.id', 'setup.id')
    .select('link.id')
    .where('link.egcs_tp_transferpaymentstream', '=', streamId)
    .where('link._deleted', '=', false)
    .where('setup.egcs_cn_entitytype', '=', 'fundingcaseagreement')
    .where('setup.egcs_cn_purpose', '=', 'risk_rating')
    .where('setup._deleted', '=', false)
    .where('publication.egcs_cn_state', '=', 'published')
    .where('publication._deleted', '=', false)
    .executeTakeFirst()
)

/**
 * Protects a rating used by a current live link or an active or retryable attempt.
 * @param db Database connection.
 * @param streamId Stream identity.
 * @param riskRatingId Risk rating identity.
 * @returns Whether changing its score or deleting it would invalidate a mapping.
 */
export const isRiskRatingPinned = async (db: DbClient, streamId: string, riskRatingId: string): Promise<boolean> => {
  const rating = await db.selectFrom('Transfer_Payment_Stream_Risk_Rating')
    .select('egcs_tp_riskscore')
    .where('id', '=', riskRatingId).where('egcs_tp_transferpaymentstream', '=', streamId)
    .where('_deleted', '=', false).executeTakeFirst()
  if (!rating) return false
  const linked = await db.selectFrom('Transfer_Payment_Stream_Workflow as link')
    .innerJoin('Common_Workflow_Setup as setup', 'setup.id', 'link.egcs_tp_workflow')
    .innerJoin('Common_Publication as publication', 'publication.id', 'setup.id')
    .innerJoin('Common_Publication_Version as version', 'version.id', 'publication.egcs_cn_currentversion')
    .select('version.egcs_cn_definition')
    .where('link.egcs_tp_transferpaymentstream', '=', streamId)
    .where('link._deleted', '=', false)
    .where('setup.egcs_cn_entitytype', '=', 'fundingcaseagreement')
    .where('setup.egcs_cn_purpose', '=', 'risk_rating')
    .where('setup._deleted', '=', false)
    .where('publication.egcs_cn_state', '=', 'published')
    .where('publication._deleted', '=', false)
    .execute()
  if (linked.some(row => readPublishedWorkflowConfiguration(row.egcs_cn_definition)
    .riskRatingEffect?.bands.some(band => band.riskScore === Number(rating.egcs_tp_riskscore)))) return true
  const attempts = await db.selectFrom('Common_Runtime as runtime')
    .innerJoin('Common_Workflow_Run as run', 'run.id', 'runtime.id')
    .innerJoin('Funding_Case_Agreement_Profile as agreement', 'agreement.id', 'runtime.egcs_cn_entityid')
    .select('run.egcs_cn_routing')
    .where('agreement.egcs_fc_transferpaymentstream', '=', streamId)
    .where('runtime.egcs_cn_kind', '=', 'workflow')
    .where('runtime.egcs_cn_entitytype', '=', 'fundingcaseagreement')
    .where('runtime.egcs_cn_purpose', '=', 'risk_rating')
    .where('runtime.egcs_cn_state', 'in', [...pinnedStates])
    .where('runtime._deleted', '=', false)
    .execute()
  return attempts.some(row => (row.egcs_cn_routing as WorkflowRoutingEvidence | null)?.riskRatingMapping?.bands
    .some(band => band.riskRatingId === riskRatingId))
}

/**
 * Reads the latest successful Agreement Risk Rating attempt and its captured label.
 * @param db Database connection.
 * @param agreementId Agreement identity.
 * @returns Latest calculation summary, if one exists.
 */
export const resolveLatestAgreementRiskRating = async (db: DbClient, agreementId: string) => {
  const run = await db.selectFrom('Common_Runtime as runtime')
    .innerJoin('Common_Workflow_Run as workflow', 'workflow.id', 'runtime.id')
    .innerJoin('Common_Publication_Version as version', 'version.id', 'runtime.egcs_cn_sourcepublicationversion')
    .select(['runtime.id', 'runtime.egcs_cn_state', 'runtime.egcs_cn_completedat',
      'workflow.egcs_cn_routing', 'version.egcs_cn_definition'])
    .where('runtime.egcs_cn_kind', '=', 'workflow')
    .where('runtime.egcs_cn_entitytype', '=', 'fundingcaseagreement')
    .where('runtime.egcs_cn_entityid', '=', agreementId)
    .where('runtime.egcs_cn_purpose', '=', 'risk_rating')
    .where('runtime.egcs_cn_state', 'in', ['succeeded', 'approved'])
    .where('runtime._deleted', '=', false)
    .orderBy('runtime.egcs_cn_completedat', 'desc')
    .orderBy('runtime.id', 'desc')
    .executeTakeFirst()
  if (!run || run.egcs_cn_definition === undefined || run.egcs_cn_definition === null) return null
  const configuration = readPublishedWorkflowConfiguration(run.egcs_cn_definition)
  const effect = configuration.riskRatingEffect
  const mapping = (run.egcs_cn_routing as WorkflowRoutingEvidence | null)?.riskRatingMapping
  if (!effect || !mapping) return null
  const review = await db.selectFrom('Common_Review')
    .innerJoin('Common_Runtime_Item', 'Common_Runtime_Item.id', 'Common_Review.egcs_cn_runtimeitem')
    .select('Common_Review.egcs_cn_reviewresult')
    .where('Common_Runtime_Item.egcs_cn_runtime', '=', String(run.id))
    .where('Common_Runtime_Item.egcs_cn_publicationversion', '=', effect.assessmentSchemaVersionId)
    .where('Common_Review._deleted', '=', false)
    .executeTakeFirst()
  const assessmentScore = review?.egcs_cn_reviewresult === null || review?.egcs_cn_reviewresult === undefined
    ? Number.NaN
    : Number(review.egcs_cn_reviewresult)
  const band = Number.isFinite(assessmentScore)
    ? mapping.bands.find(candidate => assessmentScore <= candidate.maximumScore)
    : undefined
  return { runtimeId: String(run.id), status: run.egcs_cn_state, completedAt: run.egcs_cn_completedat,
    workflowName: { en: configuration.nameEn, fr: configuration.nameFr },
    assessmentScore: Number.isFinite(assessmentScore) ? assessmentScore : null,
    mappedRating: band ? { id: band.riskRatingId, score: band.riskScore, label: band.label } : null }
}

/**
 * Checks whether an Agreement retains any Risk Rating attempt evidence.
 * @param db Database connection.
 * @param agreementId Agreement identity.
 * @returns Whether at least one attempt exists.
 */
export const hasAgreementRiskRatingRuns = async (db: DbClient, agreementId: string): Promise<boolean> => Boolean(
  await db.selectFrom('Common_Runtime').select('id')
    .where('egcs_cn_kind', '=', 'workflow')
    .where('egcs_cn_entitytype', '=', 'fundingcaseagreement')
    .where('egcs_cn_entityid', '=', agreementId)
    .where('egcs_cn_purpose', '=', 'risk_rating')
    .where('_deleted', '=', false)
    .executeTakeFirst()
)
