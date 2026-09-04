import { authorize, requireAuthContext } from '~~/server/utils/authorize'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { patchApplicantRecipientAgencyFinancialId } from '~~/server/utils/applicant-recipient'
import { resolveApplicantRecipientAuthorization } from '~~/server/utils/applicant-recipient-auth'
import { APPLICANT_RECIPIENT_CHILD_ERROR_KEYS } from '~~/server/utils/applicant-recipient-child-resources'
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
  if (!isPositivePostgresBigintText(childId)) return await notFound(event, ...APPLICANT_RECIPIENT_CHILD_ERROR_KEYS.agencyFinancialIdNotFound)

  await authorize(event, 'applicant_recipient', 'update', async ({ context: authContext }) =>
    await resolveApplicantRecipientAuthorization(authContext, applicantRecipientId, 'update', db)
  )
  return await patchApplicantRecipientAgencyFinancialId(event, db, applicantRecipientId, childId)
})
