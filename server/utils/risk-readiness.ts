/* eslint-disable jsdoc/require-jsdoc -- Shared exact-target risk readiness and immutable submission capture. */
import type { H3Event } from 'h3'
import type { Kysely, Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import type { RiskReadiness, RiskTarget, SubmissionRisk } from '~~/shared/types/risk'
import { throwApiError } from './api-errors'
import { readPublishedWorkflowConfiguration } from './workflow-setup-versioning'
import { resolveLatestRiskRating } from './agreement-risk-rating'

type RiskDb = Kysely<Database> | Transaction<Database>

const readTarget = async (db: RiskDb, target: RiskTarget) => {
  const amendment = target.entityType === 'fundingcaseamendment'
    ? await db.selectFrom('Funding_Case_Agreement_Amendment').select([
        'egcs_fc_fundingagreement', 'egcs_fc_changerisk', 'egcs_fc_proposedriskscore'
      ]).where('id', '=', target.entityId).where('_deleted', '=', false).executeTakeFirstOrThrow()
    : null
  const agreement = await db.selectFrom('Funding_Case_Agreement_Profile')
    .select(['egcs_fc_transferpaymentstream', 'egcs_fc_riskscore'])
    .where('id', '=', amendment ? String(amendment.egcs_fc_fundingagreement) : target.entityId)
    .where('_deleted', '=', false).executeTakeFirstOrThrow()
  return { amendment, agreement, streamId: String(agreement.egcs_fc_transferpaymentstream) }
}

export const getRiskReadiness = async (
  db: RiskDb, target: RiskTarget, { lockRows = false }: { lockRows?: boolean } = {}
): Promise<RiskReadiness> => {
  const { amendment, streamId } = await readTarget(db, target)
  // Authoring flags never impose requirements until their immutable publication is selected.
  let query = db.selectFrom('Transfer_Payment_Stream_Workflow as link')
    .innerJoin('Common_Workflow_Setup as setup', 'setup.id', 'link.egcs_tp_workflow')
    .innerJoin('Common_Publication as publication', 'publication.id', 'setup.id')
    .innerJoin('Common_Publication_Version as version', 'version.id', 'publication.egcs_cn_currentversion')
    .select(['setup.id', 'version.id as versionId', 'version.egcs_cn_definition as definition'])
    .where('link.egcs_tp_transferpaymentstream', '=', streamId)
    .where('link._deleted', '=', false).where('setup._deleted', '=', false)
    .where('publication._deleted', '=', false).where('publication.egcs_cn_state', '=', 'published')
    .where('publication.egcs_cn_kind', '=', 'workflow_setup').orderBy('setup.id', 'asc')
  if (lockRows) query = query.forUpdate(['link', 'setup', 'publication', 'version'])
  const linked = await query.execute()
  const selected = linked.find(row => {
    const definition = readPublishedWorkflowConfiguration(row.definition)
    return definition.entityType === target.entityType && definition.purpose === 'risk_rating'
  })
  const configuration = selected ? readPublishedWorkflowConfiguration(selected.definition) : null
  const required = configuration?.riskRatingRequired === true
  let successful = db.selectFrom('Common_Runtime')
    .select(['id', 'egcs_cn_sourcepublication', 'egcs_cn_sourcepublicationversion', 'egcs_cn_state', 'egcs_cn_completedat'])
    .where('egcs_cn_kind', '=', 'workflow').where('egcs_cn_purpose', '=', 'risk_rating')
    .where('egcs_cn_entitytype', '=', target.entityType).where('egcs_cn_entityid', '=', target.entityId)
    .where('egcs_cn_state', 'in', ['succeeded', 'approved']).where('_deleted', '=', false)
    .orderBy('egcs_cn_completedat', 'desc').orderBy('id', 'desc')
  if (selected) successful = successful.where('egcs_cn_sourcepublication', '=', String(selected.id))
  if (lockRows) successful = successful.forUpdate()
  const success = await successful.executeTakeFirst()
  const active = await db.selectFrom('Common_Runtime').select('id')
    .where('egcs_cn_kind', '=', 'workflow').where('egcs_cn_purpose', '=', 'risk_rating')
    .where('egcs_cn_entitytype', '=', target.entityType).where('egcs_cn_entityid', '=', target.entityId)
    .where('egcs_cn_state', 'in', ['pending', 'active', 'awaiting_action', 'paused'])
    .where('_deleted', '=', false).executeTakeFirst()
  const workflowManaged = Boolean(selected || active)
  const manualScore = amendment?.egcs_fc_proposedriskscore
  const manualRating = !workflowManaged && amendment?.egcs_fc_changerisk && manualScore !== null
    ? await db.selectFrom('Transfer_Payment_Stream_Risk_Rating').select('id')
        .where('egcs_tp_transferpaymentstream', '=', streamId)
        .where('egcs_tp_riskscore', '=', Number(manualScore)).where('_deleted', '=', false).execute()
    : []
  const retainedCalculation = !workflowManaged && amendment?.egcs_fc_changerisk
    && manualScore !== null && manualRating.length !== 1 && success
    ? await resolveLatestRiskRating(db, { ...target, runtimeId: String(success.id) })
    : null
  const hasManualRating = manualRating.length === 1
    || retainedCalculation?.mappedRating?.score === Number(manualScore)
  const blocker = required && !success
    ? 'risk_workflow_required'
    : !workflowManaged && amendment?.egcs_fc_changerisk && (manualScore === null || !hasManualRating)
        ? 'risk_score_required'
        : null
  return {
    ready: blocker === null, required, workflowManaged,
    setupId: selected ? String(selected.id) : null,
    publicationVersionId: selected ? String(selected.versionId) : null,
    successfulRuntimeId: success ? String(success.id) : null,
    blocker,
    evidence: success
      ? {
          runtimeId: String(success.id), setupId: String(success.egcs_cn_sourcepublication),
          publicationVersionId: String(success.egcs_cn_sourcepublicationversion),
          state: success.egcs_cn_state as 'succeeded' | 'approved',
          completedAt: success.egcs_cn_completedat ? new Date(success.egcs_cn_completedat).toISOString() : null
        }
      : null
  }
}

export const assertRiskReadiness = async (event: H3Event, trx: Transaction<Database>, target: RiskTarget) => {
  const readiness = await getRiskReadiness(trx, target, { lockRows: true })
  if (!readiness.ready) return await throwApiError(event, {
    statusCode: 409,
    code: readiness.blocker === 'risk_score_required' ? 'RISK_SCORE_REQUIRED' : 'RISK_WORKFLOW_REQUIRED',
    key: `apiErrors.workflow.${readiness.blocker}`
  })
  return readiness
}

export const readSubmissionRisk = async (
  db: RiskDb, target: RiskTarget, { lockRows = false }: { lockRows?: boolean } = {}
): Promise<SubmissionRisk> => {
  const readiness = await getRiskReadiness(db, target, { lockRows })
  const { amendment, agreement, streamId } = await readTarget(db, target)
  const enabled = amendment ? readiness.workflowManaged || amendment.egcs_fc_changerisk : readiness.workflowManaged
  const proposedScore = amendment ? amendment.egcs_fc_proposedriskscore : agreement.egcs_fc_riskscore
  const score = proposedScore === null ? null : Number(proposedScore)
  const calculation = readiness.successfulRuntimeId
    ? await resolveLatestRiskRating(db, { ...target, runtimeId: readiness.successfulRuntimeId })
    : null
  const calculationSource = calculation?.mappedRating?.score === score
    ? {
        ...calculation,
        completedAt: calculation.completedAt ? new Date(calculation.completedAt).toISOString() : null
      }
    : null
  // A copied Agreement score never substitutes for a successful optional workflow.
  const apply = Boolean(amendment && enabled && score !== null
    && (!readiness.workflowManaged || calculationSource))
  let rating = calculationSource?.mappedRating ?? null
  if (!rating && score !== null) {
    let ratingQuery = db.selectFrom('Transfer_Payment_Stream_Risk_Rating')
      .select(['id', 'egcs_tp_riskscore', 'egcs_tp_name_en', 'egcs_tp_name_fr'])
      .where('egcs_tp_transferpaymentstream', '=', streamId).where('egcs_tp_riskscore', '=', score)
      .where('_deleted', '=', false).orderBy('id', 'asc')
    if (lockRows) ratingQuery = ratingQuery.forShare()
    const rows = await ratingQuery.execute()
    if (rows.length === 1) {
      const row = rows[0]!
      rating = { id: String(row.id), score: Number(row.egcs_tp_riskscore),
        label: { en: row.egcs_tp_name_en, fr: row.egcs_tp_name_fr } }
    }
  }
  return { version: 1, enabled, apply, proposedScore: score, rating, calculationSource, readiness }
}

export const captureSubmissionRisk = async (
  event: H3Event, trx: Transaction<Database>, target: RiskTarget
): Promise<SubmissionRisk> => {
  await assertRiskReadiness(event, trx, target)
  const risk = await readSubmissionRisk(trx, target, { lockRows: true })
  if (risk.apply && !risk.rating) return await throwApiError(event, {
    statusCode: 409, code: 'RISK_SCORE_REQUIRED', key: 'apiErrors.workflow.risk_score_required'
  })
  return risk
}
