import { authorize, requireAuthContext } from '~~/server/utils/authorize'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import {
  APPLICANT_RECIPIENT_CHILD_ERROR_KEYS,
  assertApplicantRecipientChildExists
} from '~~/server/utils/applicant-recipient-child-resources'
import { hasOtherActiveCommonAddressReferences } from '~~/server/utils/applicant-recipient'
import {
  executeFreshAuthorizedApplicantRecipientWrite,
  resolveApplicantRecipientAuthorization
} from '~~/server/utils/applicant-recipient-auth'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const db = event.context.$db
  await requireAuthContext(event)
  const applicantRecipientId = getRouterParam(event, 'id')
  const childId = getRouterParam(event, 'childId')

  if (!applicantRecipientId || !childId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }
  if (!isPositivePostgresBigintText(applicantRecipientId)) return await notFound(event, 'APPLICANT_RECIPIENT_PROFILE_NOT_FOUND', 'apiErrors.applicant_recipient.profile_not_found')
  if (!isPositivePostgresBigintText(childId)) return await notFound(event, ...APPLICANT_RECIPIENT_CHILD_ERROR_KEYS.addressNotFound)

  await authorize(event, 'applicant_recipient', 'delete', async ({ context }) =>
    await resolveApplicantRecipientAuthorization(context, applicantRecipientId, 'delete', db)
  )
  return await executeFreshAuthorizedApplicantRecipientWrite(
    event,
    db,
    applicantRecipientId,
    'delete',
    async trx => {
      const existing = await assertApplicantRecipientChildExists(
        event,
        trx
          .selectFrom('Applicant_Recipient_Address')
          .where('id', '=', childId)
          .where('egcs_ar_applicantrecipient', '=', applicantRecipientId)
          .where('_deleted', '=', false)
          .select(['id', 'egcs_ar_address'])
          .executeTakeFirst(),
        ...APPLICANT_RECIPIENT_CHILD_ERROR_KEYS.addressNotFound
      )
      if (!existing || typeof existing !== 'object' || !('id' in existing)) {
        return existing
      }

      await trx
        .updateTable('Applicant_Recipient_Address')
        .set({ _deleted: true })
        .where('id', '=', childId)
        .where('egcs_ar_applicantrecipient', '=', applicantRecipientId)
        .where('_deleted', '=', false)
        .execute()

      const addressIsStillReferenced = await hasOtherActiveCommonAddressReferences(
        trx,
        existing.egcs_ar_address,
        null
      )
      if (!addressIsStillReferenced) {
        await trx
          .updateTable('Common_Address')
          .set({ _deleted: true })
          .where('id', '=', existing.egcs_ar_address)
          .where('_deleted', '=', false)
          .execute()
      }
      return { success: true }
    }
  )
})
