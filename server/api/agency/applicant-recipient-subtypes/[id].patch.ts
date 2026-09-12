import { AgencyApplicantRecipientSubtypeSchema } from '~~/shared/types/schemas'
import { authorizeActiveAgencySubentity, withActiveAgencyMutationTransaction } from '~~/server/utils/agency-auth'
import { throwIfAgencyUniqueConstraintError } from '~~/server/utils/agency-unique-constraint-errors'

export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id')
  if (!id) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  const { agencyId } = await authorizeActiveAgencySubentity(
    event,
    'Agency_Applicant_Recipient_Subtype',
    id,
    'update',
    { code: 'APPLICANT_RECIPIENT_SUBTYPE_NOT_FOUND', key: 'apiErrors.agency.applicant_recipient_subtype_not_found' }
  )
  const body = await readValidatedBodyI18n(event, AgencyApplicantRecipientSubtypeSchema.partial())
  if (Object.keys(body).length === 0) {
    return await badRequest(event, 'NO_UPDATABLE_FIELDS', 'apiErrors.request.no_updatable_fields')
  }

  let result
  try {
    result = await withActiveAgencyMutationTransaction(event, agencyId, async trx => await trx
      .updateTable('Agency_Applicant_Recipient_Subtype')
      .set(body)
      .where('id', '=', id)
      .where('egcs_ay_organizationagency', '=', agencyId)
      .where('_deleted', '=', false)
      .returningAll()
      .executeTakeFirst())
  } catch (error: unknown) {
    await throwIfAgencyUniqueConstraintError(event, error)
    throw error
  }

  if (!result) return await notFound(event, 'APPLICANT_RECIPIENT_SUBTYPE_NOT_FOUND', 'apiErrors.agency.applicant_recipient_subtype_not_found')
  return result
})
