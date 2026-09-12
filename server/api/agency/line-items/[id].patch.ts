import { validateAgencyBudgetCalculation } from '~~/server/utils/agency-budget-calculation'
import { AgencyCostCategoryLineItemPatchSchema } from '~~/shared/types/schemas'
import { authorizeActiveAgencyLineItem, withActiveAgencyCostCategoryMutationTransaction } from '~~/server/utils/agency-auth'
import { throwIfAgencyUniqueConstraintError } from '~~/server/utils/agency-unique-constraint-errors'

export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id')
  if (!id) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  const { agencyId, costCategoryId } = await authorizeActiveAgencyLineItem(
    event,
    id,
    'update',
    { code: 'LINE_ITEM_NOT_FOUND', key: 'apiErrors.agency.line_item_not_found' }
  )
  const body = await readValidatedBodyI18n(event, AgencyCostCategoryLineItemPatchSchema)
  if (Object.keys(body).length === 0) {
    return await badRequest(event, 'NO_UPDATABLE_FIELDS', 'apiErrors.request.no_updatable_fields')
  }

  let result
  try {
    result = await withActiveAgencyCostCategoryMutationTransaction(event, agencyId, costCategoryId, async trx => {
      await validateAgencyBudgetCalculation(event, trx, agencyId, costCategoryId, body, id)
      return await trx
        .updateTable('Agency_Cost_Category_Line_Item')
        .set(body)
        .where('id', '=', id)
        .where('egcs_ay_organizationcostcategory', '=', costCategoryId)
        .where('_deleted', '=', false)
        .returningAll()
        .executeTakeFirst()
    })
  } catch (error: unknown) {
    await throwIfAgencyUniqueConstraintError(event, error)
    throw error
  }

  if (!result) return await notFound(event, 'LINE_ITEM_NOT_FOUND', 'apiErrors.agency.line_item_not_found')
  return result
})
