import { sql } from 'kysely'
import { authorize } from '~~/server/utils/authorize'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { PaginationSchema } from '~~/shared/types/schemas/common'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  if (!profileId || !streamId) {
    return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  }

  const streamContext = await authorizeTransferPaymentStreamResource(event, 'read', profileId, streamId)
  if (!streamContext) {
    return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }

  await authorize(event, 'transfer_payment', 'read', createTransferPaymentScopedAuthorizeHandler('read', streamContext.scope, db))

  const { page, limit, search } = await getValidatedQueryI18n(event, PaginationSchema)
  const offset = (page - 1) * limit
  let baseQuery = db
    .selectFrom('Transfer_Payment_Stream_Chart_of_Account')
    .innerJoin(
      'Transfer_Payment_Stream_Budget',
      'Transfer_Payment_Stream_Budget.id',
      'Transfer_Payment_Stream_Chart_of_Account.egcs_tp_streambudget'
    )
    .innerJoin(
      'Transfer_Payment_Fiscal_Year_Budget',
      'Transfer_Payment_Fiscal_Year_Budget.id',
      'Transfer_Payment_Stream_Budget.egcs_tp_transferpaymentbudget'
    )
    .innerJoin(
      'Agency_Fiscal_Year',
      'Agency_Fiscal_Year.id',
      'Transfer_Payment_Fiscal_Year_Budget.egcs_tp_fiscalyear'
    )
    .where('Transfer_Payment_Stream_Chart_of_Account.egcs_tp_transferpaymentstream', '=', streamId)
    .where('Transfer_Payment_Stream_Budget.egcs_tp_transferpaymentstream', '=', streamId)
    .where('Transfer_Payment_Stream_Chart_of_Account._deleted', '=', false)
    .where('Transfer_Payment_Stream_Budget._deleted', '=', false)
    .where('Transfer_Payment_Fiscal_Year_Budget._deleted', '=', false)
    .where('Agency_Fiscal_Year._deleted', '=', false)

  if (search) {
    const pattern = `%${escapeLikePattern(search)}%`
    baseQuery = baseQuery.where(eb => eb.or([
      eb('Agency_Fiscal_Year.egcs_ay_fiscalyeardisplay', 'ilike', pattern),
      sql<boolean>`CAST(${eb.ref('Transfer_Payment_Stream_Chart_of_Account.egcs_tp_accountingdimensions')} AS TEXT) ILIKE ${pattern}`
    ]))
  }

  const [items, countResult, statsResult] = await Promise.all([
    baseQuery
      .select([
        'Transfer_Payment_Stream_Chart_of_Account.id',
        'Transfer_Payment_Stream_Chart_of_Account.egcs_tp_streambudget',
        'Transfer_Payment_Stream_Chart_of_Account.egcs_tp_accountingdimensions',
        'Transfer_Payment_Stream_Chart_of_Account.egcs_tp_transferpaymentstream',
        'Agency_Fiscal_Year.egcs_ay_fiscalyeardisplay as fiscal_year_display'
      ])
      .orderBy('Transfer_Payment_Stream_Chart_of_Account.id', 'asc')
      .limit(limit)
      .offset(offset)
      .execute(),
    baseQuery.select(eb => eb.fn.count('Transfer_Payment_Stream_Chart_of_Account.id').as('total')).executeTakeFirst(),
    db.selectFrom('Transfer_Payment_Stream_Chart_of_Account')
      .innerJoin('Transfer_Payment_Stream_Budget', 'Transfer_Payment_Stream_Budget.id', 'Transfer_Payment_Stream_Chart_of_Account.egcs_tp_streambudget')
      .innerJoin('Transfer_Payment_Fiscal_Year_Budget', 'Transfer_Payment_Fiscal_Year_Budget.id', 'Transfer_Payment_Stream_Budget.egcs_tp_transferpaymentbudget')
      .innerJoin('Agency_Fiscal_Year', 'Agency_Fiscal_Year.id', 'Transfer_Payment_Fiscal_Year_Budget.egcs_tp_fiscalyear')
      .where('Transfer_Payment_Stream_Chart_of_Account.egcs_tp_transferpaymentstream', '=', streamId)
      .where('Transfer_Payment_Stream_Budget.egcs_tp_transferpaymentstream', '=', streamId)
      .where('Transfer_Payment_Stream_Chart_of_Account._deleted', '=', false)
      .where('Transfer_Payment_Stream_Budget._deleted', '=', false)
      .where('Transfer_Payment_Fiscal_Year_Budget._deleted', '=', false)
      .where('Agency_Fiscal_Year._deleted', '=', false)
      .select(eb => eb.fn.count('Transfer_Payment_Stream_Chart_of_Account.id').as('total'))
      .executeTakeFirst()
  ])

  return {
    items,
    total: Number(countResult?.total ?? 0),
    stats: {
      total: Number(statsResult?.total ?? 0),
      active: Number(statsResult?.total ?? 0)
    },
    page,
    limit
  }
})
