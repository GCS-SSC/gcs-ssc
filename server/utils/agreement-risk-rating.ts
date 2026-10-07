import type { Kysely, Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import type { PublishedRiskRatingEffect, PublishedWorkflowConfiguration } from './workflow-setup-versioning'
import type { WorkflowRoutingEvidence } from './workflow-routing-contract'
import type { AgreementRiskSource, SubmissionRisk } from '~~/shared/types/risk'
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
  if (!['fundingcaseagreement', 'fundingcaseamendment'].includes(definition.entityType) || !definition.riskRatingEffect) return false
  try {
    await captureRiskRatingMapping(db, streamId, definition.riskRatingEffect)
    return true
  } catch {
    return false
  }
}

export type RiskRatingTarget = { entityType: 'fundingcaseagreement' | 'fundingcaseamendment', entityId: string }

/**
 * Resolves the owning Agreement without deriving a target from its parent.
 * @param db Database connection.
 * @param target Exact risk target.
 * @returns Agreement identity, or null for an unavailable amendment.
 */
export const resolveRiskRatingAgreementId = async (db: DbClient, target: RiskRatingTarget): Promise<string | null> => {
  if (target.entityType === 'fundingcaseagreement') return target.entityId
  const amendment = await db.selectFrom('Funding_Case_Agreement_Amendment')
    .select('egcs_fc_fundingagreement').where('id', '=', target.entityId).where('_deleted', '=', false).executeTakeFirst()
  return amendment ? String(amendment.egcs_fc_fundingagreement) : null
}

/**
 * Checks immutable Stream links and exact active attempts for workflow-managed scoring.
 * @param db Database connection.
 * @param target Stream and exact target identity when available.
 * @param target.streamId Owning Stream identity.
 * @param target.entityType Exact risk-enabled entity type.
 * @param target.entityId Exact entity identity for active-attempt protection.
 * @returns Whether scoring is controlled by a published or active risk workflow.
 */
export const isRiskRatingWorkflowManaged = async (
  db: DbClient,
  target: { streamId: string, entityType: RiskRatingTarget['entityType'], entityId?: string }
): Promise<boolean> => {
  const links = await db.selectFrom('Transfer_Payment_Stream_Workflow as link')
    .innerJoin('Common_Workflow_Setup as setup', 'setup.id', 'link.egcs_tp_workflow')
    .innerJoin('Common_Publication as publication', 'publication.id', 'setup.id')
    .innerJoin('Common_Publication_Version as version', 'version.id', 'publication.egcs_cn_currentversion')
    .select('version.egcs_cn_definition')
    .where('link.egcs_tp_transferpaymentstream', '=', target.streamId)
    .where('link._deleted', '=', false).where('setup._deleted', '=', false)
    .where('publication.egcs_cn_state', '=', 'published').where('publication._deleted', '=', false).execute()
  if (links.some(row => {
    const definition = readPublishedWorkflowConfiguration(row.egcs_cn_definition)
    return definition.entityType === target.entityType && definition.purpose === 'risk_rating'
  })) return true
  if (!target.entityId) return false
  return Boolean(await db.selectFrom('Common_Runtime').select('id')
    .where('egcs_cn_kind', '=', 'workflow').where('egcs_cn_entitytype', '=', target.entityType)
    .where('egcs_cn_entityid', '=', target.entityId).where('egcs_cn_purpose', '=', 'risk_rating')
    .where('egcs_cn_state', 'in', ['pending', 'active', 'awaiting_action', 'paused'])
    .where('_deleted', '=', false).executeTakeFirst())
}

/**
 * Checks whether Agreement risk scoring is workflow-managed.
 * @param db Database connection.
 * @param streamId Stream identity.
 * @param agreementId Optional exact Agreement identity for active-attempt protection.
 * @returns Whether scoring is workflow-managed.
 */
export const isAgreementRiskRatingWorkflowManaged = async (
  db: DbClient, streamId: string, agreementId?: string
): Promise<boolean> => await isRiskRatingWorkflowManaged(db, { streamId, entityType: 'fundingcaseagreement', entityId: agreementId })

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
    .where('setup._deleted', '=', false)
    .where('publication.egcs_cn_state', '=', 'published')
    .where('publication._deleted', '=', false)
    .execute()
  if (linked.some(row => {
    const definition = readPublishedWorkflowConfiguration(row.egcs_cn_definition)
    return definition.purpose === 'risk_rating' && definition.riskRatingEffect?.bands
      .some(band => band.riskScore === Number(rating.egcs_tp_riskscore))
  })) return true
  const attempts = await db.selectFrom('Common_Runtime as runtime')
    .innerJoin('Common_Workflow_Run as run', 'run.id', 'runtime.id')
    .leftJoin('Funding_Case_Agreement_Amendment as amendment', join => join
      .onRef('amendment.id', '=', 'runtime.egcs_cn_entityid').on('runtime.egcs_cn_entitytype', '=', 'fundingcaseamendment'))
    .innerJoin('Funding_Case_Agreement_Profile as agreement', join => join.on(eb => eb.or([
      eb.and([eb('runtime.egcs_cn_entitytype', '=', 'fundingcaseagreement'), eb('agreement.id', '=', eb.ref('runtime.egcs_cn_entityid'))]),
      eb.and([eb('runtime.egcs_cn_entitytype', '=', 'fundingcaseamendment'), eb('agreement.id', '=', eb.ref('amendment.egcs_fc_fundingagreement'))])
    ])))
    .select('run.egcs_cn_routing')
    .where('agreement.egcs_fc_transferpaymentstream', '=', streamId)
    .where('runtime.egcs_cn_kind', '=', 'workflow')
    .where('runtime.egcs_cn_entitytype', 'in', ['fundingcaseagreement', 'fundingcaseamendment'])
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
 * @param target Exact risk target and optional runtime identity.
 * @returns Latest calculation summary, if one exists.
 */
export const resolveLatestRiskRating = async (db: DbClient, target: RiskRatingTarget & { runtimeId?: string }) => {
  const run = await db.selectFrom('Common_Runtime as runtime')
    .innerJoin('Common_Workflow_Run as workflow', 'workflow.id', 'runtime.id')
    .innerJoin('Common_Publication_Version as version', 'version.id', 'runtime.egcs_cn_sourcepublicationversion')
    .select(['runtime.id', 'runtime.egcs_cn_state', 'runtime.egcs_cn_completedat',
      'workflow.egcs_cn_routing', 'version.egcs_cn_definition'])
    .where('runtime.egcs_cn_kind', '=', 'workflow')
    .where('runtime.egcs_cn_entitytype', '=', target.entityType)
    .where('runtime.egcs_cn_entityid', '=', target.entityId)
    .$if(Boolean(target.runtimeId), query => query.where('runtime.id', '=', target.runtimeId!))
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
  const sourceMember = configuration.members.find(member => member.memberId === effect.workflowMemberId)
  const sourceReview = sourceMember?.reviewPlan?.members.find(member => member.memberId === effect.reviewSetupMemberId)
  if (!sourceMember || !sourceReview || sourceReview.reviewType !== 'assessment') return null
  const review = await db.selectFrom('Common_Review')
    .innerJoin('Common_Runtime_Item', 'Common_Runtime_Item.id', 'Common_Review.egcs_cn_runtimeitem')
    .innerJoin('Common_Runtime_Item as Set_Item', 'Set_Item.id', 'Common_Runtime_Item.egcs_cn_parentruntimeitem')
    .select('Common_Review.egcs_cn_reviewresult')
    .where('Common_Runtime_Item.egcs_cn_runtime', '=', String(run.id))
    .where('Common_Runtime_Item.egcs_cn_publicationversion', '=', effect.assessmentSchemaVersionId)
    .where('Common_Runtime_Item.egcs_cn_order', '=', sourceReview.order)
    .where('Set_Item.egcs_cn_order', '=', sourceMember.sequence)
    .where('Set_Item.egcs_cn_publicationversion', '=', sourceMember.publicationVersionId)
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
 * @param target Exact risk target.
 * @returns Whether at least one attempt exists.
 */
export const hasRiskRatingRuns = async (db: DbClient, target: RiskRatingTarget): Promise<boolean> => Boolean(
  await db.selectFrom('Common_Runtime').select('id')
    .where('egcs_cn_kind', '=', 'workflow')
    .where('egcs_cn_entitytype', '=', target.entityType)
    .where('egcs_cn_entityid', '=', target.entityId)
    .where('egcs_cn_purpose', '=', 'risk_rating')
    .where('_deleted', '=', false)
    .executeTakeFirst()
)

/**
 * Reads the latest successful Agreement calculation.
 * @param db Database connection.
 * @param agreementId Agreement identity.
 * @returns The captured calculation summary.
 */
export const resolveLatestAgreementRiskRating = async (db: DbClient, agreementId: string) =>
  await resolveLatestRiskRating(db, { entityType: 'fundingcaseagreement', entityId: agreementId })

/**
 * Checks whether an Agreement has risk history.
 * @param db Database connection.
 * @param agreementId Agreement identity.
 * @returns Whether risk history exists.
 */
export const hasAgreementRiskRatingRuns = async (db: DbClient, agreementId: string): Promise<boolean> =>
  await hasRiskRatingRuns(db, { entityType: 'fundingcaseagreement', entityId: agreementId })

/**
 * Identifies the source that last supplied the Agreement's current score.
 * @param db Database connection.
 * @param agreementId Agreement identity.
 * @param currentScore Live score used to reject superseded evidence.
 * @returns Current source and retained bilingual calculation details.
 */
export const resolveAgreementRiskSource = async (db: DbClient, agreementId: string, currentScore: number | null): Promise<AgreementRiskSource> => {
  const direct = await resolveLatestAgreementRiskRating(db, agreementId)
  const revisions = await db.selectFrom('Funding_Case_Agreement_Revision as revision')
    .innerJoin('Funding_Case_Agreement_Approval_Submission as submission', 'submission.id', 'revision.egcs_fc_approvalsubmission')
    .innerJoin('Funding_Case_Agreement_Amendment as amendment', 'amendment.id', 'revision.egcs_fc_amendment')
    .select(['revision.egcs_fc_approvedat', 'revision.egcs_fc_amendment', 'amendment.egcs_fc_amendmentnumber', 'submission.egcs_fc_packet'])
    .where('revision.egcs_fc_fundingagreement', '=', agreementId).where('revision._deleted', '=', false)
    .orderBy('revision.egcs_fc_approvedat', 'desc').orderBy('revision.id', 'desc').execute()
  const amendmentRisk = revisions.flatMap(row => {
    const packet = row.egcs_fc_packet as unknown as { schemaVersion?: number, risk?: SubmissionRisk }
    return packet.schemaVersion === 3 && packet.risk?.apply ? [{ row, risk: packet.risk }] : []
  })[0]
  const amendmentIsLatest = amendmentRisk && (!direct?.completedAt
    || new Date(amendmentRisk.row.egcs_fc_approvedat).getTime() >= new Date(direct.completedAt).getTime())
  if (amendmentIsLatest && amendmentRisk.risk.proposedScore === currentScore) {
    return { kind: 'amendment' as const, amendmentId: String(amendmentRisk.row.egcs_fc_amendment),
      amendmentNumber: amendmentRisk.row.egcs_fc_amendmentnumber,
      approvedAt: new Date(amendmentRisk.row.egcs_fc_approvedat).toISOString(),
      workflowName: amendmentRisk.risk.calculationSource?.workflowName ?? null,
      calculationSource: amendmentRisk.risk.calculationSource, rating: amendmentRisk.risk.rating }
  }
  if (!amendmentIsLatest && direct?.mappedRating?.score === currentScore) {
    return { kind: 'workflow' as const, runtimeId: direct.runtimeId, workflowName: direct.workflowName,
      calculationSource: { ...direct, completedAt: direct.completedAt ? new Date(direct.completedAt).toISOString() : null }, rating: direct.mappedRating }
  }
  return { kind: 'manual' as const }
}
