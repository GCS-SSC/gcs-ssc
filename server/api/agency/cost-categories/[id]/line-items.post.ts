import { AgencyCostCategoryLineItemSchema } from '~~/shared/types/schemas'
import {
  authorizeActiveAgencyCostCategory,
  withActiveAgencyCostCategoryMutationTransaction
} from '~~/server/utils/agency-auth'
import { throwIfAgencyUniqueConstraintError } from '~~/server/utils/agency-unique-constraint-errors'

/**
 *  * Event handler for this server API route. Handles the incoming request payload, performs necessary business logic and authorization operations, and returns the expected endpoint response array or object.
 *  *
 *  * @param event - The active H3 event context encapsulating the request and response objects.
 *
 */
export default defineEventHandler(async event => {
  const categoryId = getRouterParam(event, 'id')
  if (!categoryId) {
    return await badRequest(event, 'MISSING_CATEGORY_ID', 'apiErrors.request.missing_category_id')
  }
  const { agencyId } = await authorizeActiveAgencyCostCategory(
    event,
    categoryId,
    'update',
    { code: 'CATEGORY_NOT_FOUND', key: 'apiErrors.agency.category_not_found' }
  )
  const validated = await readValidatedBodyI18n(event, AgencyCostCategoryLineItemSchema)

  try {
    return await withActiveAgencyCostCategoryMutationTransaction(
      event,
      agencyId,
      categoryId,
      async trx => {
        return await trx
          .insertInto('Agency_Cost_Category_Line_Item')
          .values({
            egcs_ay_organizationcostcategory: categoryId,
            egcs_ay_name_en: validated.egcs_ay_name_en,
            egcs_ay_name_fr: validated.egcs_ay_name_fr
          })
          .returningAll()
          .executeTakeFirstOrThrow()
      }
    )
  } catch (error: unknown) {
    await throwIfAgencyUniqueConstraintError(event, error)
    throw error
  }
})
