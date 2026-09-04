import { authorize } from '~~/server/utils/authorize'
import { badRequest, throwApiError } from '~~/server/utils/api-errors'
import { patchApplicantRecipientProfile } from '~~/server/utils/applicant-recipient'
import { resolveApplicantRecipientAuthorization } from '~~/server/utils/applicant-recipient-auth'
import { ExtensionAdmissionTimeoutError } from '~~/server/utils/extension-admission'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const id = getRouterParam(event, 'id')
  if (!id) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }

  await authorize(event, 'applicant_recipient', 'update', async ({ context }) =>
    await resolveApplicantRecipientAuthorization(context, id, 'update', db))
  try {
    return await patchApplicantRecipientProfile(event, db, id)
  } catch (error: unknown) {
    if (error instanceof ExtensionAdmissionTimeoutError) {
      return await throwApiError(event, {
        statusCode: 503,
        code: 'EXTENSION_OPERATION_TIMEOUT',
        key: 'apiErrors.extensions.operation_timeout'
      })
    }
    throw error
  }
})
