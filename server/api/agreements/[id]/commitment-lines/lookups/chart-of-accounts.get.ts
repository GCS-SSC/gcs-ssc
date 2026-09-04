import { sql } from 'kysely'
import { z } from 'zod'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { PaginationSchema } from '~~/shared/types/schemas/common'
import { prepareAgreementCommitmentRoute } from '~~/server/utils/agreement-commitment'
import { formatAccountingDimensions } from '~~/shared/utils/accounting-dimensions'
import type { TransferPaymentStreamChartOfAccountDimension } from '~~/shared/types/schemas/transfer-payment'

const QuerySchema = PaginationSchema.extend({
  commitmentId: z.union([z.string().min(1), z.number()]).transform(String).optional(),
  permission_action: z.enum(['create', 'update']).default('create')
}).superRefine((query, ctx) => {
  if (query.permission_action === 'update' && !query.commitmentId) {
    ctx.addIssue({ code: 'custom', path: ['commitmentId'], message: 'validation.required' })
  }
})

export default defineEventHandler(async event => {
  const { page, limit, search, commitmentId, permission_action } = await getValidatedQueryI18n(event, QuerySchema)
  const assignmentTarget = commitmentId
    ? { entityType: 'fundingcaseagreementcommitment' as const, entityId: commitmentId }
    : undefined
  const prepared = await prepareAgreementCommitmentRoute(event, permission_action, assignmentTarget)
  if (!prepared || !('agreementId' in prepared)) return prepared

  const { agreementContext, db } = prepared
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
    .innerJoin('Agency_Fiscal_Year', 'Agency_Fiscal_Year.id', 'Transfer_Payment_Fiscal_Year_Budget.egcs_tp_fiscalyear')
    .where('Transfer_Payment_Stream_Chart_of_Account.egcs_tp_transferpaymentstream', '=', agreementContext.streamId)
    .where('Transfer_Payment_Stream_Budget.egcs_tp_transferpaymentstream', '=', agreementContext.streamId)
    .where('Transfer_Payment_Stream_Chart_of_Account._deleted', '=', false)
    .where('Transfer_Payment_Stream_Budget._deleted', '=', false)
    .where('Transfer_Payment_Fiscal_Year_Budget._deleted', '=', false)
    .where('Agency_Fiscal_Year._deleted', '=', false)

  if (search) {
    const pattern = `%${escapeLikePattern(search)}%`
    baseQuery = baseQuery.where(sql<boolean>`(
      CAST(${sql.ref('Transfer_Payment_Stream_Chart_of_Account.egcs_tp_accountingdimensions')} AS text) ILIKE ${pattern}
      OR ${sql.ref('Agency_Fiscal_Year.egcs_ay_fiscalyeardisplay')} ILIKE ${pattern}
    )`)
  }

  const [rows, countResult] = await Promise.all([
    baseQuery
      .select([
        'Transfer_Payment_Stream_Chart_of_Account.id as id',
        'Transfer_Payment_Stream_Chart_of_Account.egcs_tp_accountingdimensions as accounting_dimensions',
        'Agency_Fiscal_Year.egcs_ay_fiscalyeardisplay as fiscal_year_display'
      ])
      .orderBy('Agency_Fiscal_Year.egcs_ay_fiscalyear', 'asc')
      .orderBy(sql`LOWER("Transfer_Payment_Stream_Chart_of_Account"."egcs_tp_accountingdimensions"->0->>'value')`, 'asc')
      .orderBy('Transfer_Payment_Stream_Chart_of_Account.id', 'asc')
      .limit(limit)
      .offset(offset)
      .execute(),
    baseQuery.select(eb => eb.fn.count('Transfer_Payment_Stream_Chart_of_Account.id').as('total')).executeTakeFirst()
  ])

  const items = rows.map(row => {
    const dimensions = row.accounting_dimensions as TransferPaymentStreamChartOfAccountDimension[]
    return {
      id: String(row.id),
      fiscal_year_display: row.fiscal_year_display,
      label_en: `${row.fiscal_year_display} - ${formatAccountingDimensions(dimensions, 'en', ' - ')}`,
      label_fr: `${row.fiscal_year_display} - ${formatAccountingDimensions(dimensions, 'fr', ' - ')}`
    }
  })
  const total = Number(countResult?.total ?? 0)
  return { items, total, stats: { total, active: total }, page, limit }
})
