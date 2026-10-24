import { defineEventHandler, getRouterParam } from 'h3'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { resolveDraftAgreementAmendmentActivityVersion } from '~~/server/utils/agreement-amendment'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { getAgreementActivityOutcomeTags, getAgreementActivityResponsiblePartyTags, syncAgreementActivityOutcomeSelections, syncAgreementActivityResponsiblePartySelections, validateAgreementOutcomeSelectionIds, validateAgreementResponsiblePartySelectionIds } from '~~/server/utils/agreement-activity'
import { FundingCaseAgreementActivityPatchSchema } from '~~/shared/types/schemas'
import { parseI18n } from '~~/server/utils/api-validate'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const agreementId = getRouterParam(event, 'id')
  const amendmentId = getRouterParam(event, 'amendmentId')
  const childId = getRouterParam(event, 'childId')
  if (!agreementId || !amendmentId || !childId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  if (!isPositivePostgresBigintText(childId)) return await badRequest(event, 'AGREEMENT_ACTIVITY_NOT_FOUND', 'apiErrors.agreement.activity_not_found')
  const agreementContext = await authorizeAgreementResource(event, 'update', agreementId, db, {
    assignmentTarget: { entityType: 'fundingcaseamendment', entityId: amendmentId }
  })
  if (!agreementContext) return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')

  const validated = await readValidatedBodyI18n(event, FundingCaseAgreementActivityPatchSchema)
  return await executeFreshAuthorizedAgreementWrite(event, db, agreementId, agreementContext, async (trx, current) => {
    const versionId = await resolveDraftAgreementAmendmentActivityVersion(event, trx, agreementId, amendmentId)
    if (typeof versionId !== 'string') return versionId
    const existing = await trx.selectFrom('Funding_Case_Agreement_Activity').select(['id', 'egcs_fc_startdate', 'egcs_fc_enddate']).where('id', '=', childId).where('egcs_fc_fundingagreement', '=', agreementId).where('egcs_fc_activityversion', '=', versionId).where('_deleted', '=', false).executeTakeFirst()
    if (!existing) return await notFound(event, 'AGREEMENT_ACTIVITY_NOT_FOUND', 'apiErrors.agreement.activity_not_found')
    if (Object.hasOwn(validated, 'egcs_fc_startdate') || Object.hasOwn(validated, 'egcs_fc_enddate')) {
      await parseI18n(event, FundingCaseAgreementActivityPatchSchema, {
        egcs_fc_startdate: Object.hasOwn(validated, 'egcs_fc_startdate') ? validated.egcs_fc_startdate : existing.egcs_fc_startdate,
        egcs_fc_enddate: Object.hasOwn(validated, 'egcs_fc_enddate') ? validated.egcs_fc_enddate : existing.egcs_fc_enddate
      })
    }
    if (Object.hasOwn(validated, 'outcome_ids') && !await validateAgreementOutcomeSelectionIds(trx, current.profileId, validated.outcome_ids ?? [])) return await badRequest(event, 'INVALID_AGREEMENT_ACTIVITY_OUTCOME', 'apiErrors.agreement.invalid_activity_outcome')
    if (Object.hasOwn(validated, 'responsible_party_ids') && !await validateAgreementResponsiblePartySelectionIds(trx, agreementId, validated.responsible_party_ids ?? [])) return await badRequest(event, 'INVALID_AGREEMENT_ACTIVITY_RESPONSIBLE_PARTY', 'apiErrors.agreement.invalid_activity_responsible_party')
    const { outcome_ids: outcomeIds, responsible_party_ids: partyIds, ...values } = validated
    const updated = Object.keys(values).length > 0
      ? await trx.updateTable('Funding_Case_Agreement_Activity').set(values).where('id', '=', childId).where('egcs_fc_activityversion', '=', versionId).where('_deleted', '=', false).returningAll().executeTakeFirstOrThrow()
      : await trx.selectFrom('Funding_Case_Agreement_Activity').selectAll().where('id', '=', childId).where('egcs_fc_activityversion', '=', versionId).where('_deleted', '=', false).executeTakeFirstOrThrow()
    if (Object.hasOwn(validated, 'outcome_ids')) await syncAgreementActivityOutcomeSelections(trx, childId, outcomeIds ?? [])
    if (Object.hasOwn(validated, 'responsible_party_ids')) await syncAgreementActivityResponsiblePartySelections(trx, childId, partyIds ?? [])
    const [outcomeMap, partyMap] = await Promise.all([getAgreementActivityOutcomeTags(trx, [childId]), getAgreementActivityResponsiblePartyTags(trx, [childId])])
    const outcomes = outcomeMap.get(childId) ?? []
    const parties = partyMap.get(childId) ?? []
    return { ...updated, outcome_ids: outcomes.map(item => item.id), responsible_party_ids: parties.map(item => item.id), outcomes, responsible_parties: parties }
  }, {
    action: 'update',
    assignmentTarget: { entityType: 'fundingcaseamendment', entityId: amendmentId },
    businessStatusTarget: { entityType: 'fundingcaseamendment', entityId: amendmentId }
  })
})
