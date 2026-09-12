import { PositivePostgresBigintIdSchema } from '~~/shared/types/schemas/common'
import { z } from 'zod'
import { PaginationSchema } from '~~/shared/types/schemas'
import { authorizeActiveAgencyCostCategory, withActiveAgencyCostCategoryReadTransaction } from '~~/server/utils/agency-auth'
import { escapeLikePattern } from '~~/server/utils/sql-like'

const QuerySchema = PaginationSchema.extend({ selected_ids: z.preprocess(value => value === undefined ? undefined : Array.isArray(value) ? value : [value], z.array(PositivePostgresBigintIdSchema).max(100).optional()) })

export default defineEventHandler(async event => {
  const categoryId = getRouterParam(event, 'id')!
  const { agencyId } = await authorizeActiveAgencyCostCategory(event, categoryId, 'read', { code: 'CATEGORY_NOT_FOUND', key: 'apiErrors.agency.category_not_found' })
  const { page, limit, search, selected_ids } = await getValidatedQueryI18n(event, QuerySchema)
  return await withActiveAgencyCostCategoryReadTransaction(event, agencyId, categoryId, async trx => {
    let query = trx.selectFrom('Agency_Cost_Category as category')
      .where('category.egcs_ay_organizationagency', '=', agencyId).where('category._deleted', '=', false).where('category.id', '!=', categoryId)
      .where(eb => eb.not(eb.exists(eb.selectFrom('Agency_Cost_Category_Line_Item as line').select('line.id')
        .whereRef('line.egcs_ay_organizationcostcategory', '=', 'category.id').where('line._deleted', '=', false).where('line.egcs_ay_calculationmode', '!=', 'manual'))))
    if (selected_ids?.length) query = query.where('category.id', 'in', selected_ids)
    if (search) query = query.where(eb => eb.or([
      eb('category.egcs_ay_name_en', 'ilike', `%${escapeLikePattern(search)}%`), eb('category.egcs_ay_name_fr', 'ilike', `%${escapeLikePattern(search)}%`)
    ]))
    const items = await query.select(['category.id', 'category.egcs_ay_name_en as label_en', 'category.egcs_ay_name_fr as label_fr']).orderBy('category.id').offset((page - 1) * limit).limit(limit).execute()
    const count = await query.select(eb => eb.fn.countAll().as('total')).executeTakeFirstOrThrow()
    return { items, total: Number(count.total), page, limit }
  })
})
