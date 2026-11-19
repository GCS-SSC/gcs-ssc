import type { H3Event } from 'h3'
import type { Transaction } from 'kysely'
import { RUNTIME_TERMINAL_STATES } from '~~/shared/constants/system-lifecycle'
import { assessmentClauseOutcomeKey } from '~~/shared/types/schemas/agency-review-clause-rule'
import type { Database } from '~~/shared/types/database'
import { readAssessmentClauseOutcomes } from './assessment-clause-outcomes'
import { publishedAgencyClauses } from './agreement-clauses'
import { assertBusinessStatusMutationAllowed } from './business-status-runtime'
import { assertAgreementApprovalSubmissionUnlocked } from './agreement-approval-submission'
import { throwApiError } from './api-errors'
import { resolveRequestLocale } from './request-locale'
import { readPublishedReviewSchema } from './review-schema-versioning'

/**
 * Applies an official Review result inside its Agreement-locked finalization transaction.
 * @param event Current action request.
 * @param trx Transaction holding the runtime owner locks.
 * @param reviewId Official Review.
 */
export const applyOfficialReviewClauses = async (event: H3Event, trx: Transaction<Database>, reviewId: string) => {
  const review = await trx.selectFrom('Common_Review as review')
    .innerJoin('Common_Review_Set as reviewSet', 'reviewSet.id', 'review.egcs_cn_reviewset')
    .leftJoin('Common_Checklist as checklist', join => join
      .onRef('checklist.egcs_cn_review', '=', 'review.id')
      .on('checklist._deleted', '=', false))
    .innerJoin('Funding_Case_Agreement_Profile as agreement', 'agreement.id', 'reviewSet.egcs_cn_entityid')
    .innerJoin('Transfer_Payment_Stream as stream', 'stream.id', 'agreement.egcs_fc_transferpaymentstream')
    .innerJoin('Transfer_Payment_Profile as program', 'program.id', 'stream.egcs_tp_transferpaymentprofile')
    .select([
      'review.egcs_cn_reviewschema as schemaId',
      'agreement.id as agreementId',
      'program.egcs_tp_agency as agencyId',
      'checklist.egcs_cn_result as result'
    ])
    .where('review.id', '=', reviewId)
    .where('reviewSet.egcs_cn_entitytype', '=', 'fundingcaseagreement')
    .where('review._deleted', '=', false)
    .where('reviewSet._deleted', '=', false)
    .where('agreement._deleted', '=', false)
    .executeTakeFirst()
  if (!review) return
  const rules = await publishedAgencyClauses(trx, review.agencyId)
    .innerJoin('Agency_Review_Clause_Rule as rule', 'rule.egcs_ay_clause', 'clause.id')
    .select(['rule.id', 'clause.id as clauseId', 'version.id as versionId', 'rule.egcs_ay_protected as protected',
      'rule.egcs_ay_result as result', 'rule.egcs_ay_outcome as outcome', 'rule.egcs_ay_strategy as strategy'])
    .where('rule.egcs_ay_organizationagency', '=', review.agencyId)
    .where('rule.egcs_ay_reviewschema', '=', review.schemaId)
    .where('rule._deleted', '=', false)
    .where(eb => eb.not(eb.exists(eb.selectFrom('Funding_Case_Agreement_Clause_Review as applied')
      .select('applied.id')
      .where('applied.egcs_fc_review', '=', reviewId)
      .whereRef('applied.egcs_fc_clause', '=', 'clause.id'))))
    .orderBy('clause.id')
    .execute()
  if (rules.length === 0) return
  const outcomes = review.result === null
    ? await trx.selectFrom('Common_Assessment_Outcome')
        .select(['egcs_cn_section', 'egcs_cn_subsection', 'egcs_cn_selectedstrategy'])
        .where('egcs_cn_review', '=', reviewId)
        .where('_deleted', '=', false)
        .execute()
    : []
  const matched = rules.filter(rule => rule.result !== null
    ? review.result === rule.result
    : outcomes.some(outcome => rule.outcome === assessmentClauseOutcomeKey(outcome.egcs_cn_section, outcome.egcs_cn_subsection)
      && rule.strategy === outcome.egcs_cn_selectedstrategy))
  if (matched.length === 0) return

  await assertAgreementApprovalSubmissionUnlocked(event, trx, review.agreementId, { reviewFinalization: true })
  await assertBusinessStatusMutationAllowed(event, trx, 'fundingcaseagreement', review.agreementId)
  for (const rule of matched) {
    const existing = await trx.selectFrom('Funding_Case_Agreement_Clause')
      .select(['id', 'egcs_fc_protected'])
      .where('egcs_fc_fundingagreement', '=', review.agreementId)
      .where('egcs_fc_clause', '=', rule.clauseId)
      .where('_deleted', '=', false)
      .executeTakeFirst()
    const selection = existing ?? await trx.insertInto('Funding_Case_Agreement_Clause')
      .values({
        egcs_fc_fundingagreement: review.agreementId,
        egcs_fc_clause: rule.clauseId,
        egcs_fc_publicationversion: rule.versionId,
        egcs_fc_protected: rule.protected
      }).returning('id').executeTakeFirstOrThrow()
    if (existing && rule.protected && !existing.egcs_fc_protected) {
      await trx.updateTable('Funding_Case_Agreement_Clause')
        .set({ egcs_fc_protected: true })
        .where('id', '=', existing.id)
        .execute()
    }
    await trx.insertInto('Funding_Case_Agreement_Clause_Review').values({
      egcs_fc_selection: selection.id,
      egcs_fc_review: reviewId,
      egcs_fc_clause: rule.clauseId,
      egcs_fc_rule: rule.id,
      egcs_fc_result: rule.result,
      egcs_fc_outcome: rule.outcome,
      egcs_fc_strategy: rule.strategy,
      egcs_fc_protected: rule.protected
    }).execute()
  }
}

/**
 * Blocks initial Agreement submission while a mapped Review result is outstanding.
 * @param event Current submission request.
 * @param trx Transaction holding the Agreement lock.
 * @param agreementId Agreement being submitted.
 * @returns Nothing when submission can proceed.
 */
export const assertAgreementMappedReviewsComplete = async (
  event: H3Event,
  trx: Transaction<Database>,
  agreementId: string
) => {
  const candidates = await trx.selectFrom('Common_Review_Set as reviewSet')
    .innerJoin('Common_Runtime_Item as setItem', 'setItem.id', 'reviewSet.egcs_cn_runtimeitem')
    .innerJoin('Common_Review as review', 'review.egcs_cn_reviewset', 'reviewSet.id')
    .innerJoin('Common_Runtime_Item as reviewItem', 'reviewItem.id', 'review.egcs_cn_runtimeitem')
    .innerJoin('Common_Publication_Version as pinned', 'pinned.id', 'reviewItem.egcs_cn_publicationversion')
    .innerJoin('Common_Review_Schema as schema', 'schema.id', 'review.egcs_cn_reviewschema')
    .innerJoin('Agency_Review_Clause_Rule as rule', 'rule.egcs_ay_reviewschema', 'schema.id')
    .innerJoin('Funding_Case_Agreement_Profile as agreement', 'agreement.id', 'reviewSet.egcs_cn_entityid')
    .innerJoin('Transfer_Payment_Stream as stream', 'stream.id', 'agreement.egcs_fc_transferpaymentstream')
    .innerJoin('Transfer_Payment_Profile as program', 'program.id', 'stream.egcs_tp_transferpaymentprofile')
    .select([
      'schema.egcs_cn_name_en', 'schema.egcs_cn_name_fr', 'pinned.egcs_cn_definition as definition',
      'rule.egcs_ay_result as result', 'rule.egcs_ay_outcome as outcome', 'rule.egcs_ay_strategy as strategy'
    ])
    .where('reviewSet.egcs_cn_entitytype', '=', 'fundingcaseagreement')
    .where('reviewSet.egcs_cn_entityid', '=', agreementId)
    .where('reviewSet._deleted', '=', false)
    .where('setItem._deleted', '=', false)
    .where('review._deleted', '=', false)
    .where('reviewItem._deleted', '=', false)
    .where('reviewItem.egcs_cn_state', 'not in', [...RUNTIME_TERMINAL_STATES])
    .where('setItem.egcs_cn_state', 'not in', [...RUNTIME_TERMINAL_STATES])
    .whereRef('rule.egcs_ay_organizationagency', '=', 'program.egcs_tp_agency')
    .where('rule._deleted', '=', false)
    .execute()

  const blockers = candidates.filter(candidate => candidate.result !== null
    || readAssessmentClauseOutcomes(candidate.definition).some(
      outcome => outcome.id === candidate.outcome && outcome.strategies.some(strategy => strategy.value === candidate.strategy)
    ))
  if (blockers.length === 0) return

  const locale = resolveRequestLocale(event)
  const names = [...new Set(blockers.map(row => readPublishedReviewSchema(row.definition)?.name[locale]
    ?? (locale === 'fr' ? row.egcs_cn_name_fr : row.egcs_cn_name_en)))].sort()
  return await throwApiError(event, {
    statusCode: 409,
    code: 'AGREEMENT_CLAUSE_CHECKLIST_PENDING',
    key: 'apiErrors.agreement.clause_checklist_pending',
    params: { checklists: new Intl.ListFormat(locale).format(names) }
  })
}
