import { AgencyCostCategorySchema } from '~~/shared/types/schemas'
import { authorizeActiveAgencyCostCategory, withActiveAgencyCostCategoryMutationTransaction } from '~~/server/utils/agency-auth'
import { throwIfAgencyUniqueConstraintError } from '~~/server/utils/agency-unique-constraint-errors'

export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id')
  if (!id) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  const { agencyId } = await authorizeActiveAgencyCostCategory(
    event,
    id,
    'update',
    { code: 'CATEGORY_NOT_FOUND', key: 'apiErrors.agency.category_not_found' }
  )
  const body = await readValidatedBodyI18n(event, AgencyCostCategorySchema.partial())
  if (Object.keys(body).length === 0) {
    return await badRequest(event, 'NO_UPDATABLE_FIELDS', 'apiErrors.request.no_updatable_fields')
  }

  let result
  try {
    result = await withActiveAgencyCostCategoryMutationTransaction(event, agencyId, id, async trx => await trx
      .updateTable('Agency_Cost_Category')
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

  if (!result) return await notFound(event, 'CATEGORY_NOT_FOUND', 'apiErrors.agency.category_not_found')
  return result
})
