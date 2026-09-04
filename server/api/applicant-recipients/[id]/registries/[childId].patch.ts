import { authorize, requireAuthContext } from '~~/server/utils/authorize'
import { ApplicantRecipientRegistryCreateSchema, ApplicantRecipientRegistryPatchSchema } from '~~/shared/types/schemas'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { parseI18n } from '~~/server/utils/api-validate'
import { APPLICANT_RECIPIENT_CHILD_ERROR_KEYS, assertApplicantRecipientChildExists } from '~~/server/utils/applicant-recipient-child-resources'
import { throwIfApplicantRecipientUniqueConstraintError } from '~~/server/utils/applicant-recipient-unique-constraint-errors'
import { executeFreshAuthorizedApplicantRecipientWrite, resolveApplicantRecipientAuthorization } from '~~/server/utils/applicant-recipient-auth'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const db = event.context.$db
  await requireAuthContext(event)
  const applicantRecipientId = getRouterParam(event, 'id')
  const childId = getRouterParam(event, 'childId')
  if (!applicantRecipientId || !childId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  if (!isPositivePostgresBigintText(applicantRecipientId)) return await notFound(event, 'APPLICANT_RECIPIENT_PROFILE_NOT_FOUND', 'apiErrors.applicant_recipient.profile_not_found')
  if (!isPositivePostgresBigintText(childId)) return await notFound(event, ...APPLICANT_RECIPIENT_CHILD_ERROR_KEYS.registryNotFound)
  await authorize(event, 'applicant_recipient', 'update', async ({ context }) =>
    await resolveApplicantRecipientAuthorization(context, applicantRecipientId, 'update', db)
  )
  const validated = await readValidatedBodyI18n(event, ApplicantRecipientRegistryPatchSchema)
  try {
    return await executeFreshAuthorizedApplicantRecipientWrite(event, db, applicantRecipientId, 'update', async trx => {
      const existing = await assertApplicantRecipientChildExists(event, trx.selectFrom('Applicant_Recipient_Registry')
        .where('id', '=', childId).where('egcs_ar_applicantrecipient', '=', applicantRecipientId).where('_deleted', '=', false)
        .select(['id', 'egcs_ar_number', 'egcs_ar_registry', 'egcs_ar_othercomment']).executeTakeFirst(),
      ...APPLICANT_RECIPIENT_CHILD_ERROR_KEYS.registryNotFound)
      if (!existing || typeof existing !== 'object' || !('id' in existing)) return existing
      const merged = await parseI18n(event, ApplicantRecipientRegistryCreateSchema, { ...existing, ...validated })
      if (Object.keys(validated).length === 0) return existing
      return await trx.updateTable('Applicant_Recipient_Registry').set({
        ...(validated.egcs_ar_number === undefined ? {} : { egcs_ar_number: merged.egcs_ar_number }),
        ...(validated.egcs_ar_registry === undefined ? {} : { egcs_ar_registry: merged.egcs_ar_registry }),
        ...(Object.hasOwn(validated, 'egcs_ar_othercomment') ? { egcs_ar_othercomment: merged.egcs_ar_othercomment ?? null } : {})
      }).where('id', '=', childId).where('egcs_ar_applicantrecipient', '=', applicantRecipientId).where('_deleted', '=', false)
        .returning(['id', 'egcs_ar_number', 'egcs_ar_registry', 'egcs_ar_othercomment']).executeTakeFirstOrThrow()
    })
  } catch (error: unknown) {
    await throwIfApplicantRecipientUniqueConstraintError(event, error)
    throw error
  }
})
