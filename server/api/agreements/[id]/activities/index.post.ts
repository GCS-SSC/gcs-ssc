import type { Insertable } from 'kysely'
import { badRequest } from '~~/server/utils/api-errors'
import { FundingCaseAgreementActivityCreateSchema } from '~~/shared/types/schemas'
import type { FundingCaseAgreementActivityTable } from '~~/shared/types/database'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { assertAgreementExists } from '~~/server/utils/agreement-child-resources'
import {
  getAgreementActivityOutcomeTags,
  getAgreementActivityResponsiblePartyTags,
  syncAgreementActivityResponsiblePartySelections,
  syncAgreementActivityOutcomeSelections,
  validateAgreementResponsiblePartySelectionIds,
  validateAgreementOutcomeSelectionIds
} from '~~/server/utils/agreement-activity'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const agreementId = getRouterParam(event, 'id')

  if (!agreementId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }

  const agreementContext = await authorizeAgreementResource(event, 'create', agreementId, db)
  if (!agreementContext) {
    return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  }

  const agreement = await assertAgreementExists(event, agreementId, db)
  if (!agreement || typeof agreement !== 'object' || !('id' in agreement)) {
    return agreement
  }

  const validated = await readValidatedBodyI18n(event, FundingCaseAgreementActivityCreateSchema)

  const {
    outcome_ids: _outcomeIds,
    responsible_party_ids: _responsiblePartyIds,
    ...activityValues
  } = validated

  return await executeFreshAuthorizedAgreementWrite(event, db, agreementId, agreementContext, async (trx, currentContext) => {
    const selectedOutcomes = await validateAgreementOutcomeSelectionIds(
      trx,
      currentContext.profileId,
      validated.outcome_ids
    )
    if (!selectedOutcomes) {
      return await badRequest(event, 'INVALID_AGREEMENT_ACTIVITY_OUTCOME', 'apiErrors.agreement.invalid_activity_outcome')
    }

    const selectedResponsibleParties = await validateAgreementResponsiblePartySelectionIds(
      trx,
      agreementId,
      validated.responsible_party_ids
    )
    if (!selectedResponsibleParties) {
      return await badRequest(event, 'INVALID_AGREEMENT_ACTIVITY_RESPONSIBLE_PARTY', 'apiErrors.agreement.invalid_activity_responsible_party')
    }

    const createdActivity = await trx
      .insertInto('Funding_Case_Agreement_Activity')
      .values({
        ...activityValues,
        egcs_fc_fundingagreement: agreementId
      } satisfies Insertable<FundingCaseAgreementActivityTable>)
      .returningAll()
      .executeTakeFirstOrThrow()

    await syncAgreementActivityOutcomeSelections(trx, createdActivity.id, validated.outcome_ids)
    await syncAgreementActivityResponsiblePartySelections(trx, createdActivity.id, validated.responsible_party_ids)

    const [outcomeTagsByActivityId, responsiblePartyTagsByActivityId] = await Promise.all([
      getAgreementActivityOutcomeTags(trx, [createdActivity.id]),
      getAgreementActivityResponsiblePartyTags(trx, [createdActivity.id])
    ])
    const outcomes = outcomeTagsByActivityId.get(String(createdActivity.id)) ?? selectedOutcomes
    const responsibleParties = responsiblePartyTagsByActivityId.get(String(createdActivity.id)) ?? selectedResponsibleParties

    return {
      ...createdActivity,
      outcome_ids: outcomes.map(outcome => outcome.id),
      responsible_party_ids: responsibleParties.map(responsibleParty => responsibleParty.id),
      outcomes,
      responsible_parties: responsibleParties
    }
  }, { action: 'create', blocksApprovalSubmission: true })
})
