import { sql } from 'kysely'
import { z } from 'zod'
import { CURRENCY_CODES_ENUM } from '~~/shared/constants/enums'
import { PaginationSchema, PositivePostgresBigintIdSchema } from '~~/shared/types/schemas/common'
import { TransferPaymentStreamChartOfAccountDimensionSchema } from '~~/shared/types/schemas/transfer-payment'
import { authorize } from '~~/server/utils/authorize'
import { withActiveAgencyReadTransaction } from '~~/server/utils/agency-auth'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { formatAccountingDimensions } from '~~/shared/utils/accounting-dimensions'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { badRequest, notFound } from '~~/server/utils/api-errors'

const QuerySchema = PaginationSchema.extend({
  fiscalYearId: PositivePostgresBigintIdSchema,
  currency: z.enum(CURRENCY_CODES_ENUM, { error: 'validation.required' }),
  selectedIds: z.union([PositivePostgresBigintIdSchema, z.array(PositivePostgresBigintIdSchema)
    .min(1, { error: 'validation.required' }).max(100, { error: 'validation.max_items' })])
    .transform(value => [...new Set(Array.isArray(value) ? value : [value])]).optional()
})

export default defineEventHandler(async event => {
  const agencyId = getRouterParam(event, 'agencyId')
  if (!agencyId) return await badRequest(event, 'MISSING_AGENCY_ID', 'apiErrors.request.missing_agency_id')
  if (!isPositivePostgresBigintText(agencyId)) return await notFound(event, 'AGENCY_NOT_FOUND', 'apiErrors.agency.not_found')
  await authorize(event, 'agency', 'read', { type: 'agency', agencyId })
  const input = await getValidatedQueryI18n(event, QuerySchema)
  return await withActiveAgencyReadTransaction(event, agencyId, async trx => {
    let query = trx.selectFrom('Agency_Chart_of_Account').select(['id', 'egcs_ay_accountingdimensions'])
      .where('egcs_ay_organizationagency', '=', agencyId).where('egcs_ay_fiscalyear', '=', input.fiscalYearId)
      .where('egcs_ay_currency', '=', input.currency).where('egcs_ay_kind', '=', 'commitment').where('_deleted', '=', false)
    if (input.selectedIds) query = query.where('id', 'in', input.selectedIds)
    if (input.search) query = query.where(sql<boolean>`egcs_ay_accountingdimensions::text ILIKE ${`%${escapeLikePattern(input.search)}%`}`)
    const count = await query.clearSelect().select(sql<string>`count(*)::text`.as('total')).executeTakeFirstOrThrow()
    const accounts = await query.orderBy('id').limit(input.limit).offset((input.page - 1) * input.limit).execute()
    const items = accounts.map(account => {
      const dimensions = z.array(TransferPaymentStreamChartOfAccountDimensionSchema).parse(account.egcs_ay_accountingdimensions)
      return { id: String(account.id), label_en: formatAccountingDimensions(dimensions, 'en'), label_fr: formatAccountingDimensions(dimensions, 'fr') }
    })
    return { items, total: Number(count.total), page: input.page, limit: input.limit }
  })
})
