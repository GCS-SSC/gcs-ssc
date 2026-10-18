/* eslint-disable jsdoc/require-jsdoc -- Bounded Stream picker projections have focused route coverage. */
import type { H3Event } from 'h3'
import { z } from 'zod'
import { PaginationSchema, PositivePostgresBigintIdSchema } from '~~/shared/types/schemas'
import { authorizeTransferPaymentStreamResource } from './transfer-payment-route-authorization'
import { executeFreshReadSnapshot } from './fresh-read-snapshot'
import { getValidatedQueryI18n } from './api-validate'
import { badRequest, notFound } from './api-errors'
import { escapeLikePattern } from './sql-like'

const QuerySchema = PaginationSchema.omit({ status: true }).extend({
  ids: z.union([PositivePostgresBigintIdSchema, z.array(PositivePostgresBigintIdSchema).min(1).max(100)]).optional()
}).strict()

export const streamReferenceDefinitionLookup = async (event: H3Event, kind: 'monitor-types' | 'cost-category-line-items' | 'document-templates') => {
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  if (!profileId || !streamId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  return await executeFreshReadSnapshot(event, async db => {
    const access = await authorizeTransferPaymentStreamResource(event, 'update', profileId, streamId)
    if (!access) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
    const { page, limit, search, ids } = await getValidatedQueryI18n(event, QuerySchema)
    const selectedIds = ids === undefined ? [] : Array.isArray(ids) ? ids : [ids]
    const pattern = search ? `%${escapeLikePattern(search)}%` : undefined
    if (kind === 'monitor-types') {
      let query = db.selectFrom('Agency_Monitor_Type as definition')
        .where('definition.egcs_ay_organizationagency', '=', access.agencyId).where('definition._deleted', '=', false)
      if (selectedIds.length) query = query.where('definition.id', 'in', selectedIds)
      if (pattern) query = query.where(eb => eb.or([
        eb('definition.egcs_ay_name_en', 'ilike', pattern), eb('definition.egcs_ay_name_fr', 'ilike', pattern)
      ]))
      const [items, count] = await Promise.all([
        query.select(['definition.id', 'definition.egcs_ay_name_en', 'definition.egcs_ay_name_fr']).orderBy('definition.id').limit(limit).offset((page - 1) * limit).execute(),
        query.select(eb => eb.fn.count('definition.id').as('total')).executeTakeFirstOrThrow()
      ])
      return { items, total: Number(count.total), page, limit }
    }
    if (kind === 'cost-category-line-items') {
      let query = db.selectFrom('Agency_Cost_Category_Line_Item as definition')
        .innerJoin('Agency_Cost_Category as category', 'category.id', 'definition.egcs_ay_organizationcostcategory')
        .where('category.egcs_ay_organizationagency', '=', access.agencyId).where('category._deleted', '=', false).where('definition._deleted', '=', false)
      if (selectedIds.length) query = query.where('definition.id', 'in', selectedIds)
      if (pattern) query = query.where(eb => eb.or([
        eb('definition.egcs_ay_name_en', 'ilike', pattern), eb('definition.egcs_ay_name_fr', 'ilike', pattern)
      ]))
      const [items, count] = await Promise.all([
        query.select(['definition.id', 'definition.egcs_ay_name_en', 'definition.egcs_ay_name_fr']).orderBy('definition.id').limit(limit).offset((page - 1) * limit).execute(),
        query.select(eb => eb.fn.count('definition.id').as('total')).executeTakeFirstOrThrow()
      ])
      return { items, total: Number(count.total), page, limit }
    }
    {
      let query = db.selectFrom('Agency_Document_Template as definition')
        .where('definition.egcs_ay_organizationagency', '=', access.agencyId).where('definition.egcs_ay_active', '=', true).where('definition._deleted', '=', false)
      if (selectedIds.length) query = query.where('definition.id', 'in', selectedIds)
      if (pattern) query = query.where(eb => eb.or([
        eb('definition.egcs_ay_name_en', 'ilike', pattern), eb('definition.egcs_ay_name_fr', 'ilike', pattern)
      ]))
      const [items, count] = await Promise.all([
        query.select(['definition.id', 'definition.egcs_ay_name_en', 'definition.egcs_ay_name_fr']).orderBy('definition.id').limit(limit).offset((page - 1) * limit).execute(),
        query.select(eb => eb.fn.count('definition.id').as('total')).executeTakeFirstOrThrow()
      ])
      return { items, total: Number(count.total), page, limit }
    }
  })
}
