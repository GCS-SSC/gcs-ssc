import type { Kysely, Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import { readPublishedWorkflowConfiguration } from './workflow-setup-versioning'

type DbClient = Kysely<Database> | Transaction<Database>

/**
 * Returns whether the Stream currently selects a published Agreement Risk Rating workflow.
 * @param db Database connection.
 * @param streamId Stream identity.
 * @returns Whether risk scoring is workflow-managed.
 */
export const isAgreementRiskRatingWorkflowManaged = async (db: DbClient, streamId: string): Promise<boolean> => {
  const selectionKey = `transferpaymentstream:${streamId}:fundingcaseagreement:risk_rating`
  const selected = await db.selectFrom('Common_Publication_Selection')
    .innerJoin('Common_Publication', 'Common_Publication.id', 'Common_Publication_Selection.egcs_cn_publication')
    .select('Common_Publication.id')
    .where('Common_Publication_Selection.egcs_cn_dimension', '=', 'scope_entity_purpose')
    .where('Common_Publication_Selection.egcs_cn_key', '=', selectionKey)
    .where('Common_Publication.egcs_cn_kind', '=', 'workflow_setup')
    .where('Common_Publication.egcs_cn_state', '=', 'published')
    .where('Common_Publication._deleted', '=', false)
    .executeTakeFirst()
  return Boolean(selected)
}

/**
 * Protects rating identities/scores pinned by a current publication or active attempt.
 * @param db Database connection.
 * @param streamId Stream identity.
 * @param riskRatingId Risk-rating identity.
 * @returns Whether immutable workflow evidence references the rating.
 */
export const isRiskRatingPinned = async (db: DbClient, streamId: string, riskRatingId: string): Promise<boolean> => {
  const definitions = await db.selectFrom('Common_Publication_Version')
    .innerJoin('Common_Publication', 'Common_Publication.id', 'Common_Publication_Version.egcs_cn_publication')
    .innerJoin('Common_Workflow_Setup', 'Common_Workflow_Setup.id', 'Common_Publication.id')
    .select('Common_Publication_Version.egcs_cn_definition')
    .where('Common_Workflow_Setup.egcs_cn_scopeid', '=', streamId)
    .where('Common_Workflow_Setup.egcs_cn_scopetype', '=', 'transferpaymentstream')
    .where('Common_Workflow_Setup.egcs_cn_entitytype', '=', 'fundingcaseagreement')
    .where('Common_Workflow_Setup.egcs_cn_purpose', '=', 'risk_rating')
    .where(eb => eb.or([
      eb.and([
        eb('Common_Publication.egcs_cn_state', '=', 'published'),
        eb('Common_Publication.egcs_cn_currentversion', '=', eb.ref('Common_Publication_Version.id'))
      ]),
      eb.exists(eb.selectFrom('Common_Runtime').select('Common_Runtime.id')
        .whereRef('Common_Runtime.egcs_cn_sourcepublicationversion', '=', 'Common_Publication_Version.id')
        .where('Common_Runtime.egcs_cn_state', 'in', ['pending', 'active', 'awaiting_action', 'paused'])
        .where('Common_Runtime._deleted', '=', false))
    ]))
    .execute()
  return definitions.some(row => readPublishedWorkflowConfiguration(row.egcs_cn_definition)
    .riskRatingEffect?.bands.some(band => band.riskRatingId === riskRatingId))
}

/**
 * Reads the newest successful Agreement Risk Rating evidence projection.
 * @param db Database connection.
 * @param agreementId Agreement identity.
 * @returns Latest successful calculation summary, if one exists.
 */
export const resolveLatestAgreementRiskRating = async (db: DbClient, agreementId: string) => {
  const run = await db.selectFrom('Common_Runtime')
    .innerJoin('Common_Publication_Version', 'Common_Publication_Version.id', 'Common_Runtime.egcs_cn_sourcepublicationversion')
    .select([
      'Common_Runtime.id', 'Common_Runtime.egcs_cn_state', 'Common_Runtime.egcs_cn_completedat',
      'Common_Publication_Version.egcs_cn_definition'
    ])
    .where('Common_Runtime.egcs_cn_kind', '=', 'workflow')
    .where('Common_Runtime.egcs_cn_entitytype', '=', 'fundingcaseagreement')
    .where('Common_Runtime.egcs_cn_entityid', '=', agreementId)
    .where('Common_Runtime.egcs_cn_purpose', '=', 'risk_rating')
    .where('Common_Runtime.egcs_cn_state', 'in', ['succeeded', 'approved'])
    .where('Common_Runtime._deleted', '=', false)
    .orderBy('Common_Runtime.egcs_cn_completedat', 'desc')
    .orderBy('Common_Runtime.id', 'desc')
    .executeTakeFirst()
  if (!run || run.egcs_cn_definition === undefined || run.egcs_cn_definition === null) return null
  const configuration = readPublishedWorkflowConfiguration(run.egcs_cn_definition)
  const effect = configuration.riskRatingEffect
  if (!effect) return null
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
    ? effect.bands.find(candidate => assessmentScore <= candidate.maximumScore)
    : undefined
  return {
    runtimeId: String(run.id),
    status: run.egcs_cn_state,
    completedAt: run.egcs_cn_completedat,
    workflowName: { en: configuration.nameEn, fr: configuration.nameFr },
    assessmentScore: Number.isFinite(assessmentScore) ? assessmentScore : null,
    mappedRating: band ? { id: band.riskRatingId, score: band.riskScore, label: band.label } : null
  }
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
