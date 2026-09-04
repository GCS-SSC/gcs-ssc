import type { Insertable } from 'kysely'
import { ApplicantRecipientProfileSchema } from '~~/shared/types/schemas'
import type { ApplicantRecipientProfileTable } from '~~/shared/types/database'
import { badRequest } from '~~/server/utils/api-errors'
import { authorize, authorizeFresh, requireAuthContext } from '~~/server/utils/authorize'
import {
  mapApplicantRecipientWriteValues,
  validateApplicantRecipientReferences
} from '~~/server/utils/applicant-recipient'
import { throwIfApplicantRecipientUniqueConstraintError } from '~~/server/utils/applicant-recipient-unique-constraint-errors'
import { createPrimaryEntityAssignment, resolveAssignmentCommonUserId } from '~~/server/utils/entity-assignment'

export default defineEventHandler(async event => {
  const db = event.context.$db
  await requireAuthContext(event)
  const validated = await readValidatedBodyI18n(event, ApplicantRecipientProfileSchema)
  const agencyId = String(validated.egcs_ar_leadagency)
  const creationScope = { type: 'agency', agencyId } as const
  await authorize(event, 'applicant_recipient', 'create', creationScope)

  try {
    return await db.transaction().execute(async trx => {
      const authContext = await authorizeFresh(event, 'applicant_recipient', 'create', creationScope, trx)

      const references = await validateApplicantRecipientReferences(trx, validated)
      if (!references.subtypeExists) {
        return await badRequest(event, 'INVALID_APPLICANT_RECIPIENT_SUBTYPE', 'apiErrors.applicant_recipient.invalid_subtype')
      }
      if (!references.leadAgencyExists) {
        return await badRequest(event, 'INVALID_APPLICANT_RECIPIENT_LEAD_AGENCY', 'apiErrors.applicant_recipient.invalid_lead_agency')
      }
      if (!references.subtypeMatchesLeadAgency) {
        return await badRequest(event, 'INVALID_APPLICANT_RECIPIENT_SUBTYPE_FOR_LEAD_AGENCY', 'apiErrors.applicant_recipient.invalid_subtype_for_lead_agency')
      }

      const creatorId = await resolveAssignmentCommonUserId(trx, authContext.userId)
      if (!creatorId) return await badRequest(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')

      const mappedValues = mapApplicantRecipientWriteValues(validated)
      const values: Insertable<ApplicantRecipientProfileTable> = {
        ...mappedValues,
        egcs_ar_applicantrecipientsubtypes: validated.egcs_ar_applicantrecipientsubtypes,
        egcs_ar_active: validated.egcs_ar_active
      }

      const created = await trx
        .insertInto('Applicant_Recipient_Profile')
        .values(values)
        .returningAll()
        .executeTakeFirstOrThrow()
      await createPrimaryEntityAssignment(trx, 'applicantrecipient', String(created.id), creatorId)
      return created
    })
  } catch (error: unknown) {
    await throwIfApplicantRecipientUniqueConstraintError(event, error)
    throw error
  }
})
