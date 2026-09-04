import { sql } from 'kysely'
import { PaginationSchema } from '~~/shared/types/schemas'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { authorizeTransferPaymentStreamResource } from '~~/server/utils/transfer-payment-route-authorization'
import { buildListRouteResponse } from '~~/server/utils/list-route-response'
import { databaseMoneyText, parseDatabaseMoney } from '~~/server/utils/database-money'

/**
 *  * Event handler for this server API route. Handles the incoming request payload, performs necessary business logic and authorization operations, and returns the expected endpoint response array or object.
 *  *
 *  * @param event - The active H3 event context encapsulating the request and response objects.
 *
 */
// eslint-disable-next-line local/require-authorize -- delegated to authorizeTransferPaymentStreamResource
export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  if (!profileId || !streamId) {
    return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  }

  const access = await authorizeTransferPaymentStreamResource(event, 'read', profileId, streamId)
  if (!access) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')

  const query = await getValidatedQueryI18n(event, PaginationSchema)
  const { page, limit, search } = query
  const offset = (page - 1) * limit

  let baseQuery = db
    .selectFrom('Transfer_Payment_Stream_Budget')
    .innerJoin(
      'Transfer_Payment_Fiscal_Year_Budget',
      'Transfer_Payment_Fiscal_Year_Budget.id',
      'Transfer_Payment_Stream_Budget.egcs_tp_transferpaymentbudget'
    )
    .innerJoin('Agency_Fiscal_Year', 'Agency_Fiscal_Year.id', 'Transfer_Payment_Fiscal_Year_Budget.egcs_tp_fiscalyear')
    .where('Transfer_Payment_Stream_Budget.egcs_tp_transferpaymentstream', '=', streamId)
    .where('Transfer_Payment_Stream_Budget._deleted', '=', false)
    .where('Transfer_Payment_Fiscal_Year_Budget._deleted', '=', false)
    .where('Agency_Fiscal_Year._deleted', '=', false)

  if (search) {
    baseQuery = baseQuery.where(eb =>
      eb.or([
        eb('Agency_Fiscal_Year.egcs_ay_fiscalyeardisplay', 'ilike', `%${escapeLikePattern(search)}%`),
        eb(sql<string>`CAST(${sql.ref('Agency_Fiscal_Year.egcs_ay_fiscalyear')} AS TEXT)`, 'ilike', `%${escapeLikePattern(search)}%`),
        eb(sql<string>`CAST(${sql.ref('Transfer_Payment_Stream_Budget.egcs_tp_totalbudget')} AS TEXT)`, 'ilike', `%${escapeLikePattern(search)}%`),
        eb(
          sql<string>`CAST(${sql.ref('Transfer_Payment_Stream_Budget.egcs_tp_overcommitthreshold')} AS TEXT)`,
          'ilike',
          `%${escapeLikePattern(search)}%`
        )
      ])
    )
  }

  const [items, countResult] = await Promise.all([
    baseQuery
      .select([
        'Transfer_Payment_Stream_Budget.id as id',
        'Transfer_Payment_Stream_Budget.egcs_tp_transferpaymentstream as egcs_tp_transferpaymentstream',
        databaseMoneyText(sql.ref('Transfer_Payment_Stream_Budget.egcs_tp_totalbudget')).as('egcs_tp_totalbudget'),
        'Transfer_Payment_Stream_Budget.egcs_tp_transferpaymentbudget as egcs_tp_transferpaymentbudget',
        'Transfer_Payment_Stream_Budget.egcs_tp_overcommitthreshold as egcs_tp_overcommitthreshold',
        'Transfer_Payment_Fiscal_Year_Budget.egcs_tp_fiscalyear as egcs_tp_fiscalyear',
        databaseMoneyText(sql.ref('Transfer_Payment_Fiscal_Year_Budget.egcs_tp_totalbudget')).as('program_total_budget'),
        'Agency_Fiscal_Year.egcs_ay_fiscalyeardisplay as fiscal_year_display',
        'Agency_Fiscal_Year.egcs_ay_fiscalyear as fiscal_year'
      ])
      .orderBy('Transfer_Payment_Stream_Budget.id', 'asc')
      .limit(limit)
      .offset(offset)
      .execute(),
    baseQuery.select(eb => eb.fn.count('Transfer_Payment_Stream_Budget.id').as('total')).executeTakeFirst()
  ])

  return buildListRouteResponse(items.map(item => ({
    ...item,
    egcs_tp_totalbudget: parseDatabaseMoney(item.egcs_tp_totalbudget),
    program_total_budget: parseDatabaseMoney(item.program_total_budget)
  })), countResult, countResult, page, limit)
})
