import { AgencyAgreementTypeSchema } from '~~/shared/types/schemas'
import { authorizeActiveAgencySubentity, withActiveAgencyMutationTransaction } from '~~/server/utils/agency-auth'
import { throwIfAgencyUniqueConstraintError } from '~~/server/utils/agency-unique-constraint-errors'

export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id')
  if (!id) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  const { agencyId } = await authorizeActiveAgencySubentity(
    event,
    'Agency_Agreement_Type',
    id,
    'update',
    { code: 'AGREEMENT_TYPE_NOT_FOUND', key: 'apiErrors.agency.agreement_type_not_found' }
  )
  const body = await readValidatedBodyI18n(event, AgencyAgreementTypeSchema.partial())
  if (Object.keys(body).length === 0) {
    return await badRequest(event, 'NO_UPDATABLE_FIELDS', 'apiErrors.request.no_updatable_fields')
  }

  let result
  try {
    result = await withActiveAgencyMutationTransaction(event, agencyId, async trx => await trx
      .updateTable('Agency_Agreement_Type')
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

  if (!result) return await notFound(event, 'AGREEMENT_TYPE_NOT_FOUND', 'apiErrors.agency.agreement_type_not_found')
  return result
})
