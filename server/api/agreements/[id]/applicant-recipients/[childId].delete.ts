import { badRequest, throwApiError } from '~~/server/utils/api-errors'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import {
  AGREEMENT_CHILD_ERROR_KEYS,
  assertAgreementChildExists,
  assertAgreementExists
} from '~~/server/utils/agreement-child-resources'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { isAgreementApplicantRecipientInUse } from '~~/server/utils/agreement-applicant-recipient'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const agreementId = getRouterParam(event, 'id')
  const childId = getRouterParam(event, 'childId')

  if (!agreementId || !childId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }
  if (!isPositivePostgresBigintText(childId)) {
    return await badRequest(event, 'AGREEMENT_APPLICANT_RECIPIENT_NOT_FOUND', 'apiErrors.agreement.applicant_recipient_not_found')
  }

  const agreementContext = await authorizeAgreementResource(event, 'delete', agreementId, db)
  if (!agreementContext) {
    return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  }

  return await executeFreshAuthorizedAgreementWrite(event, db, agreementId, agreementContext, async trx => {
    const agreement = await assertAgreementExists(event, agreementId, trx)
    if (!agreement || typeof agreement !== 'object' || !('id' in agreement)) {
      return agreement
    }

    const existing = await assertAgreementChildExists(
      event,
      trx
        .selectFrom('Funding_Case_Agreement_Applicant_Recipient')
        .where('id', '=', childId)
        .where('egcs_fc_fundingagreement', '=', agreementId)
        .where('_deleted', '=', false)
        .select('id')
        .executeTakeFirst(),
      ...AGREEMENT_CHILD_ERROR_KEYS.applicantRecipientNotFound
    )
    if (!existing || typeof existing !== 'object' || !('id' in existing)) {
      return existing
    }
    if (await isAgreementApplicantRecipientInUse(trx, agreementId, childId)) {
      return await throwApiError(event, {
        statusCode: 409,
        code: 'AGREEMENT_APPLICANT_RECIPIENT_IN_USE',
        key: 'apiErrors.agreement.applicant_recipient_in_use'
      })
    }

    await trx
      .updateTable('Funding_Case_Agreement_Applicant_Recipient')
      .set({ _deleted: true })
      .where('id', '=', childId)
      .where('egcs_fc_fundingagreement', '=', agreementId)
      .where('_deleted', '=', false)
      .execute()

    return { success: true }
  }, { action: 'delete', blocksApprovalSubmission: true })
})
