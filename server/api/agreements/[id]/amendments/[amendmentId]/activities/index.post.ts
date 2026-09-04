import type { Insertable } from 'kysely'
import { badRequest } from '~~/server/utils/api-errors'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { resolveDraftAgreementAmendmentActivityVersion } from '~~/server/utils/agreement-amendment'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { getAgreementActivityOutcomeTags, getAgreementActivityResponsiblePartyTags, syncAgreementActivityOutcomeSelections, syncAgreementActivityResponsiblePartySelections, validateAgreementOutcomeSelectionIds, validateAgreementResponsiblePartySelectionIds } from '~~/server/utils/agreement-activity'
import type { FundingCaseAgreementActivityTable } from '~~/shared/types/database'
import { FundingCaseAgreementActivityCreateSchema } from '~~/shared/types/schemas'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const agreementId = getRouterParam(event, 'id')
  const amendmentId = getRouterParam(event, 'amendmentId')
  if (!agreementId || !amendmentId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  const agreementContext = await authorizeAgreementResource(event, 'create', agreementId, db)
  if (!agreementContext) return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')

  const validated = await readValidatedBodyI18n(event, FundingCaseAgreementActivityCreateSchema)
  const { outcome_ids: _outcomes, responsible_party_ids: _parties, ...values } = validated
  return await executeFreshAuthorizedAgreementWrite(event, db, agreementId, agreementContext, async (trx, current) => {
    const versionId = await resolveDraftAgreementAmendmentActivityVersion(event, trx, agreementId, amendmentId)
    if (typeof versionId !== 'string') return versionId
    const outcomeIds = validated.outcome_ids ?? []
    const responsiblePartyIds = validated.responsible_party_ids ?? []
    const outcomes = await validateAgreementOutcomeSelectionIds(trx, current.profileId, outcomeIds)
    if (!outcomes) return await badRequest(event, 'INVALID_AGREEMENT_ACTIVITY_OUTCOME', 'apiErrors.agreement.invalid_activity_outcome')
    const parties = await validateAgreementResponsiblePartySelectionIds(trx, agreementId, responsiblePartyIds)
    if (!parties) return await badRequest(event, 'INVALID_AGREEMENT_ACTIVITY_RESPONSIBLE_PARTY', 'apiErrors.agreement.invalid_activity_responsible_party')
    const created = await trx.insertInto('Funding_Case_Agreement_Activity').values({ ...values, egcs_fc_fundingagreement: agreementId, egcs_fc_activityversion: versionId } satisfies Insertable<FundingCaseAgreementActivityTable>).returningAll().executeTakeFirstOrThrow()
    await syncAgreementActivityOutcomeSelections(trx, String(created.id), outcomeIds)
    await syncAgreementActivityResponsiblePartySelections(trx, String(created.id), responsiblePartyIds)
    const [outcomeMap, partyMap] = await Promise.all([getAgreementActivityOutcomeTags(trx, [String(created.id)]), getAgreementActivityResponsiblePartyTags(trx, [String(created.id)])])
    const outcomeTags = outcomeMap.get(String(created.id)) ?? outcomes
    const partyTags = partyMap.get(String(created.id)) ?? parties
    return { ...created, outcome_ids: outcomeTags.map(item => item.id), responsible_party_ids: partyTags.map(item => item.id), outcomes: outcomeTags, responsible_parties: partyTags }
  }, {
    action: 'create',
    assignmentTarget: { entityType: 'fundingcaseamendment', entityId: amendmentId },
    businessStatusTarget: { entityType: 'fundingcaseamendment', entityId: amendmentId }
  })
})
