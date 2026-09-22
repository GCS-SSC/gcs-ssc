import type { Insertable, Kysely } from 'kysely'
import { ApplicantRecipientProfileSchema } from '~~/shared/types/schemas'
import type { ApplicantRecipientProfileTable, Database } from '~~/shared/types/database'
import { badRequest } from '~~/server/utils/api-errors'
import { authorize, authorizeFresh, requireAuthContext, type AuthContext } from '~~/server/utils/authorize'
import {
  mapApplicantRecipientWriteValues,
  validateApplicantRecipientReferences
} from '~~/server/utils/applicant-recipient'
import { throwIfApplicantRecipientUniqueConstraintError } from '~~/server/utils/applicant-recipient-unique-constraint-errors'
import { createPrimaryEntityAssignment, resolveAssignmentCommonUserId } from '~~/server/utils/entity-assignment'
import { resolveApplicantRecipientVisibility } from '~~/server/utils/applicant-recipient-auth'
/**
 * Resolves any eligible Proponent creator without tying creation to the tracking agency.
 * @param db - Database used to load active agency roles.
 * @returns Authorization resolver for a global or agency scoped creator.
 */
const authorizeAnyProponentCreate = (db: Kysely<Database>) => async ({ context }: { context: AuthContext }) => {
  const visibility = await resolveApplicantRecipientVisibility(context, 'create', db)
  return visibility.hasGlobalAccess || visibility.agencyIds.length > 0
    ? { bypass: true as const }
    : { denied: true as const }
}

export default defineEventHandler(async event => {
  const db = event.context.$db
  await requireAuthContext(event)
  const validated = await readValidatedBodyI18n(event, ApplicantRecipientProfileSchema)
  await authorize(event, 'applicant_recipient', 'create', authorizeAnyProponentCreate(db))

  try {
    return await db.transaction().execute(async trx => {
      const authContext = await authorizeFresh(event, 'applicant_recipient', 'create', authorizeAnyProponentCreate(trx), trx)

      const references = await validateApplicantRecipientReferences(trx, validated)
      if (!references.leadAgencyExists) {
        return await badRequest(event, 'INVALID_APPLICANT_RECIPIENT_LEAD_AGENCY', 'apiErrors.applicant_recipient.invalid_lead_agency')
      }

      const creatorId = await resolveAssignmentCommonUserId(trx, authContext.userId)
      if (!creatorId) return await badRequest(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')

      const mappedValues = mapApplicantRecipientWriteValues(validated)
      const values: Insertable<ApplicantRecipientProfileTable> = {
        ...mappedValues,
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
