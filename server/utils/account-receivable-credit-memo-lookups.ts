/* eslint-disable jsdoc/require-jsdoc -- Credit Memo choices resolve their financial scope through one AR. */
import type { H3Event } from 'h3'
import { sql } from 'kysely'
import { z } from 'zod'
import { PaginationSchema, PositivePostgresBigintIdSchema } from '~~/shared/types/schemas/common'
import { TransferPaymentStreamChartOfAccountDimensionSchema } from '~~/shared/types/schemas/transfer-payment'
import { formatAccountingDimensions } from '~~/shared/utils/accounting-dimensions'
import { getValidatedQueryI18n } from './api-validate'
import { authorize } from './authorize'
import { authorizeAccountReceivable } from './account-receivable'
import { escapeLikePattern } from './sql-like'

const Query = PaginationSchema.extend({
  selectedIds: z.union([PositivePostgresBigintIdSchema, z.array(PositivePostgresBigintIdSchema).min(1).max(100)])
    .transform(value => Array.isArray(value) ? value : [value]).optional()
})

export const listCreditMemoReceivables = async (event: H3Event) => {
  const input = await getValidatedQueryI18n(event, Query.extend({ egcs_fc_agency: PositivePostgresBigintIdSchema,
    egcs_fc_applicantrecipient: PositivePostgresBigintIdSchema }))
  const auth = await authorize(event, 'account_receivable', 'create', { type: 'agency', agencyId: input.egcs_fc_agency })
  let query = event.context.$db.selectFrom('Funding_Case_Agreement_Account_Receivable as debt')
    .innerJoin('Funding_Case_Account_Receivable_Pool as pool', 'pool.id', 'debt.egcs_fc_pool')
    .innerJoin('Funding_Case_Agreement_Profile as agreement', 'agreement.id', 'debt.egcs_fc_fundingagreement')
    .innerJoin('Transfer_Payment_Stream as stream', 'stream.id', 'agreement.egcs_fc_transferpaymentstream')
    .innerJoin('Transfer_Payment_Profile as program', 'program.id', 'stream.egcs_tp_transferpaymentprofile')
    .where('pool.egcs_fc_agency', '=', input.egcs_fc_agency).where('program.egcs_tp_agency', '=', input.egcs_fc_agency)
    .where('debt.egcs_fc_applicantrecipient', '=', input.egcs_fc_applicantrecipient)
    .where('debt.egcs_fc_outcome', '=', 'posted').where('debt.egcs_fc_linkedreceivable', 'is', null)
    .where('debt._deleted', '=', false).where('agreement._deleted', '=', false).where('stream._deleted', '=', false)
    .where('program._deleted', '=', false).where('pool._deleted', '=', false)
  if (input.selectedIds) query = query.where('debt.id', 'in', input.selectedIds)
  if (input.search) query = query.where(eb => eb.or([
    eb('debt.egcs_fc_agreementnumber', 'ilike', `%${escapeLikePattern(input.search!)}%`),
    sql<boolean>`debt.egcs_fc_number::text ILIKE ${`%${escapeLikePattern(input.search!)}%`}`
  ]))
  const rows = await query.select(['debt.id', 'debt.egcs_fc_number', 'debt.egcs_fc_agreementnumber', 'debt.egcs_fc_currency',
    'stream.egcs_tp_transferpaymentprofile']).orderBy('debt.id').execute()
  const visible = rows.filter(row => auth.userAbilities.authorize('account_receivable', 'read', {
    type: 'program', agencyId: input.egcs_fc_agency, transferPaymentId: String(row.egcs_tp_transferpaymentprofile)
  }))
  return { items: visible.slice((input.page - 1) * input.limit, input.page * input.limit).map(row => ({
    ...row, label_en: `${row.egcs_fc_agreementnumber} / AR-${row.egcs_fc_number} (${row.egcs_fc_currency.toUpperCase()})`,
    label_fr: `${row.egcs_fc_agreementnumber} / CD-${row.egcs_fc_number} (${row.egcs_fc_currency.toUpperCase()})`
  })), total: visible.length, page: input.page, limit: input.limit }
}

export const listCreditMemoCharts = async (event: H3Event) => {
  const input = await getValidatedQueryI18n(event, Query.extend({ egcs_fc_receivable: PositivePostgresBigintIdSchema }))
  const context = await authorizeAccountReceivable(event, input.egcs_fc_receivable)
  const debt = await event.context.$db.selectFrom('Funding_Case_Agreement_Account_Receivable').selectAll()
    .where('id', '=', input.egcs_fc_receivable).executeTakeFirstOrThrow()
  let query = event.context.$db.selectFrom('Agency_Chart_of_Account')
    .where('egcs_ay_organizationagency', '=', context.agencyId).where('egcs_ay_fiscalyear', '=', String(debt.egcs_fc_agencyfiscalyear))
    .where('egcs_ay_currency', '=', debt.egcs_fc_currency).where('egcs_ay_kind', '=', 'credit_memo').where('_deleted', '=', false)
    .where(eb => eb.exists(eb.selectFrom('Transfer_Payment_Stream_Chart_of_Account').select('id')
      .whereRef('egcs_tp_agencychartofaccount', '=', 'Agency_Chart_of_Account.id')
      .where('egcs_tp_transferpaymentstream', '=', context.streamId).where('_deleted', '=', false)))
  if (input.selectedIds) query = query.where('id', 'in', input.selectedIds)
  if (input.search) query = query.where(sql<boolean>`egcs_ay_accountingdimensions::text ILIKE ${`%${escapeLikePattern(input.search)}%`}`)
  const count = await query.select(sql<string>`count(*)::text`.as('total')).executeTakeFirstOrThrow()
  const rows = await query.select(['id', 'egcs_ay_accountingdimensions']).orderBy('id').limit(input.limit).offset((input.page - 1) * input.limit).execute()
  return { items: rows.map(row => {
    const dimensions = z.array(TransferPaymentStreamChartOfAccountDimensionSchema).parse(row.egcs_ay_accountingdimensions)
    return { ...row, label_en: formatAccountingDimensions(dimensions, 'en'), label_fr: formatAccountingDimensions(dimensions, 'fr') }
  }), total: Number(count.total), page: input.page, limit: input.limit }
}
