import { parseSafeDecimal } from '~~/shared/utils/decimal'
/* eslint-disable jsdoc/require-jsdoc -- Shared exact-target risk readiness and immutable submission capture. */
import type { H3Event } from 'h3'
import type { Kysely, Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import type { RiskReadiness, RiskTarget, SubmissionRisk } from '~~/shared/types/risk'
import { throwApiError } from './api-errors'
import { readPublishedWorkflowConfiguration } from './workflow-setup-versioning'
import {
  captureAmendmentRiskSelections, matchAmendmentRiskSelections, readStreamRiskPolicy, resolveLatestRiskRating
} from './agreement-risk-rating'
import type { WorkflowRoutingEvidence } from './workflow-routing-contract'

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

const resolveRiskDecision = async (
  db: RiskDb, target: RiskTarget, lockRows: boolean
) => {
  const { amendment, agreement, streamId } = await readTarget(db, target)
  const policy = await readStreamRiskPolicy(db, streamId, target.entityType)
  const required = policy.enabled
  let selected: { id: string, versionId: string } | undefined
  if (required && policy.setupId) {
    let query = db.selectFrom('Transfer_Payment_Stream_Workflow as link')
      .innerJoin('Common_Workflow_Setup as setup', 'setup.id', 'link.egcs_tp_workflow')
      .innerJoin('Common_Publication as publication', 'publication.id', 'setup.id')
      .innerJoin('Common_Publication_Version as version', 'version.id', 'publication.egcs_cn_currentversion')
      .select(['setup.id', 'version.id as versionId', 'version.egcs_cn_definition as definition'])
      .where('link.egcs_tp_transferpaymentstream', '=', streamId)
      .where('setup.id', '=', policy.setupId)
      .where('link._deleted', '=', false).where('setup._deleted', '=', false)
      .where('publication._deleted', '=', false).where('publication.egcs_cn_state', '=', 'published')
      .where('publication.egcs_cn_kind', '=', 'workflow_setup')
    if (lockRows) query = query.forUpdate(['link', 'setup', 'publication', 'version'])
    const row = await query.executeTakeFirst()
    if (row) {
      const definition = readPublishedWorkflowConfiguration(row.definition)
      if (definition.entityType === target.entityType && definition.purpose === 'risk_rating') selected = row
    }
  }
  let successful = db.selectFrom('Common_Runtime as runtime')
    .innerJoin('Common_Workflow_Run as run', 'run.id', 'runtime.id')
    .select([
      'runtime.id', 'runtime.egcs_cn_sourcepublication', 'runtime.egcs_cn_sourcepublicationversion',
      'runtime.egcs_cn_state', 'runtime.egcs_cn_completedat', 'run.egcs_cn_routing'
    ])
    .where('runtime.egcs_cn_kind', '=', 'workflow').where('runtime.egcs_cn_purpose', '=', 'risk_rating')
    .where('runtime.egcs_cn_entitytype', '=', target.entityType).where('runtime.egcs_cn_entityid', '=', target.entityId)
    .where('runtime.egcs_cn_state', 'in', ['succeeded', 'approved']).where('runtime._deleted', '=', false)
    .orderBy('runtime.egcs_cn_completedat', 'desc').orderBy('runtime.id', 'desc')
  if (selected) successful = successful.where('runtime.egcs_cn_sourcepublication', '=', selected.id)
  if (lockRows) successful = successful.forUpdate(['runtime', 'run'])
  const candidate = !required || selected ? await successful.executeTakeFirst() : undefined
  const routing = candidate?.egcs_cn_routing as WorkflowRoutingEvidence | null | undefined
  const sameStream = routing?.riskRatingMapping?.streamId === streamId
  const selectionsCurrent = !amendment
    || (!required && !routing?.amendmentRiskSelections)
    || (sameStream && matchAmendmentRiskSelections(routing.amendmentRiskSelections, await captureAmendmentRiskSelections(db, target.entityId)))
  const applicable = sameStream && selectionsCurrent ? candidate : undefined
  const proposal = amendment ? amendment.egcs_fc_proposedriskscore : agreement.egcs_fc_riskscore
  const score = proposal === null ? null : parseSafeDecimal(String(proposal))
  const calculation = applicable ? await resolveLatestRiskRating(db, { ...target, runtimeId: String(applicable.id) }) : null
  const calculationSource = calculation?.mappedRating?.score === score
    ? { ...calculation, completedAt: calculation.completedAt ? new Date(calculation.completedAt).toISOString() : null }
    : null
  const success = required && !calculationSource ? undefined : applicable
  const manualRating = !required && amendment?.egcs_fc_changerisk && score !== null
    ? await db.selectFrom('Transfer_Payment_Stream_Risk_Rating').select('id')
        .where('egcs_tp_transferpaymentstream', '=', streamId)
        .where('egcs_tp_riskscore', '=', String(score)).where('_deleted', '=', false).execute()
    : []
  const hasManualRating = manualRating.length === 1
    || Boolean(calculationSource)
  const blocker = required && !success
    ? 'risk_workflow_required'
    : !required && amendment?.egcs_fc_changerisk && (score === null || !hasManualRating)
        ? 'risk_score_required'
        : null
  const readiness: RiskReadiness = {
    ready: blocker === null, required, workflowManaged: required,
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
  return { readiness, amendment, streamId, score, calculationSource }
}

export const getRiskReadiness = async (
  db: RiskDb, target: RiskTarget, { lockRows = false }: { lockRows?: boolean } = {}
): Promise<RiskReadiness> => (await resolveRiskDecision(db, target, lockRows)).readiness

export const readSubmissionRisk = async (
  db: RiskDb, target: RiskTarget, { lockRows = false }: { lockRows?: boolean } = {}
): Promise<SubmissionRisk> => {
  const { readiness, amendment, streamId, score, calculationSource } = await resolveRiskDecision(db, target, lockRows)
  const enabled = amendment ? readiness.workflowManaged || amendment.egcs_fc_changerisk : readiness.workflowManaged
  // A workflow-managed proposal applies only with its captured calculation.
  const apply = Boolean(amendment && enabled && score !== null
    && (!readiness.workflowManaged || calculationSource))
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
    code: blocker === 'risk_score_required' ? 'RISK_SCORE_REQUIRED' : 'RISK_WORKFLOW_REQUIRED',
    key: `apiErrors.workflow.${blocker}`
  })
  if (risk.apply && !risk.rating) return await throwApiError(event, {
    statusCode: 409, code: 'RISK_SCORE_REQUIRED', key: 'apiErrors.workflow.risk_score_required'
  })
  return risk
}
