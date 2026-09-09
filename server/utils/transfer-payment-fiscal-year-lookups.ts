import { sql, type Kysely } from 'kysely'
import type { H3Event } from 'h3'
import { z } from 'zod'
import type { Database } from '~~/shared/types/database'
import { PaginationSchema, PositivePostgresBigintIdSchema } from '~~/shared/types/schemas'
import { notFound } from './api-errors'
import { escapeLikePattern } from './sql-like'

export const TransferPaymentFiscalYearLookupQuerySchema = z.object({
  agency_id: PositivePostgresBigintIdSchema
})
export const TransferPaymentFiscalYearLookupListQuerySchema = TransferPaymentFiscalYearLookupQuerySchema
  .extend(PaginationSchema.shape)

/**
 * Selects fiscal years accepted by Program creation at the exact Agency.
 *
 * @param db - Request or snapshot database.
 * @param agencyId - Authorized Agency identifier.
 * @returns Nondeleted fiscal years belonging to a nondeleted Agency.
 */
export const transferPaymentFiscalYearLookupQuery = (db: Kysely<Database>, agencyId: string) => db
  .selectFrom('Agency_Fiscal_Year')
  .innerJoin('Agency_Profile', 'Agency_Profile.id', 'Agency_Fiscal_Year.egcs_ay_organizationagency')
  .where('Agency_Fiscal_Year.egcs_ay_organizationagency', '=', agencyId)
  .where('Agency_Profile._deleted', '=', false)
  .where('Agency_Fiscal_Year._deleted', '=', false)
  .select([
    'Agency_Fiscal_Year.id as id',
    'Agency_Fiscal_Year.egcs_ay_fiscalyeardisplay as egcs_ay_fiscalyeardisplay',
    'Agency_Fiscal_Year.egcs_ay_fiscalyear as egcs_ay_fiscalyear'
  ])

/**
 * Reads a bounded fiscal-year label page and count from one read-only snapshot.
 *
 * @param event - Authorized lookup request.
 * @param queryInput - Validated Agency, pagination and search values.
 * @returns Minimal labels and their filtered count.
 */
export const listTransferPaymentFiscalYearLookups = async (
  event: H3Event,
  queryInput: z.infer<typeof TransferPaymentFiscalYearLookupListQuerySchema>
) => await event.context.$db.transaction().setIsolationLevel('repeatable read').setAccessMode('read only')
  .execute(async trx => {
    const { agency_id: agencyId, page, limit, search } = queryInput
    const agency = await trx.selectFrom('Agency_Profile').select('id')
      .where('id', '=', agencyId).where('_deleted', '=', false).executeTakeFirst()
    if (!agency) return await notFound(event, 'AGENCY_NOT_FOUND', 'apiErrors.agency.not_found')

    let query = transferPaymentFiscalYearLookupQuery(trx, agencyId)
    if (search) {
      const pattern = `%${escapeLikePattern(search)}%`
      query = query.where(eb => eb.or([
        eb('Agency_Fiscal_Year.egcs_ay_fiscalyeardisplay', 'ilike', pattern),
        eb(sql<string>`CAST(${eb.ref('Agency_Fiscal_Year.egcs_ay_fiscalyear')} AS TEXT)`, 'ilike', pattern)
      ]))
    }
    const [items, count] = await Promise.all([
      query.orderBy('Agency_Fiscal_Year.id', 'asc').limit(limit).offset((page - 1) * limit).execute(),
      query.clearSelect().select(eb => eb.fn.count('Agency_Fiscal_Year.id').as('total')).executeTakeFirstOrThrow()
    ])
    return { items: items.map(item => ({ ...item, id: String(item.id) })), total: Number(count.total), page, limit }
  })
