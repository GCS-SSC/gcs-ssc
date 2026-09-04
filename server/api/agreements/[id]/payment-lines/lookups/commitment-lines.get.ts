import { sql } from 'kysely'
import { z } from 'zod'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { PaginationSchema } from '~~/shared/types/schemas/common'
import { getAgreementPayment, prepareAgreementPaymentRoute } from '~~/server/utils/agreement-payment'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { budgetFiscalYearStableId } from '~~/server/utils/agreement-budget-lineage'
import { formatAccountingDimensions } from '~~/shared/utils/accounting-dimensions'
import type { TransferPaymentStreamChartOfAccountDimension } from '~~/shared/types/schemas/transfer-payment'
import en from '~~/i18n/locales/en.json'
import fr from '~~/i18n/locales/fr.json'
import { databaseMoneyText, parseDatabaseMoney } from '~~/server/utils/database-money'

const QuerySchema = PaginationSchema.extend({
  paymentId: z.union([z.string().min(1), z.number()]).transform(String),
  permission_action: z.enum(['create', 'update']).default('create')
})

export default defineEventHandler(async event => {
  const { page, limit, search, paymentId, permission_action } = await getValidatedQueryI18n(event, QuerySchema)
  const prepared = await prepareAgreementPaymentRoute(event, permission_action, {
    entityType: 'fundingcasepayment',
    entityId: paymentId
  })
  if (!prepared || !('agreementId' in prepared)) {
    return prepared
  }

  const { agreementId, db } = prepared
  const offset = (page - 1) * limit
  const payment = await getAgreementPayment(db, agreementId, paymentId)
  if (!payment) {
    return await notFound(event, 'AGREEMENT_PAYMENT_NOT_FOUND', 'apiErrors.agreement.payment_not_found')
  }

  if (!payment.egcs_fc_fundingagreementcommitment || !payment.egcs_fc_fiscalyear) {
    return await badRequest(event, 'AGREEMENT_PAYMENT_INVALID_CONTEXT', 'apiErrors.request.invalid')
  }

  let baseQuery = db
    .selectFrom('Funding_Case_Agreement_Commitment_Line')
    .innerJoin(
      'Transfer_Payment_Stream_Chart_of_Account',
      'Transfer_Payment_Stream_Chart_of_Account.id',
      'Funding_Case_Agreement_Commitment_Line.egcs_fc_transferpaymentstreamchartofaccount'
    )
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
      'Funding_Case_Agreement_Budget_Fiscal_Year',
      'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fiscalyear',
      'Transfer_Payment_Fiscal_Year_Budget.egcs_tp_fiscalyear'
    )
    .innerJoin(
      'Funding_Case_Agreement_Budget_Version',
      'Funding_Case_Agreement_Budget_Version.id',
      'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_budgetversion'
    )
    .where('Funding_Case_Agreement_Commitment_Line.egcs_fc_commitment', '=', payment.egcs_fc_fundingagreementcommitment)
    .where(budgetFiscalYearStableId, '=', payment.egcs_fc_fiscalyear)
    .where('Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fundingagreement', '=', agreementId)
    .where('Funding_Case_Agreement_Commitment_Line._deleted', '=', false)
    .where('Transfer_Payment_Stream_Chart_of_Account._deleted', '=', false)
    .where('Transfer_Payment_Stream_Budget._deleted', '=', false)
    .where('Transfer_Payment_Fiscal_Year_Budget._deleted', '=', false)
    .where('Funding_Case_Agreement_Budget_Fiscal_Year._deleted', '=', false)
    .where('Funding_Case_Agreement_Budget_Version.egcs_fc_iscurrent', '=', true)
    .where('Funding_Case_Agreement_Budget_Version._deleted', '=', false)

  if (search) {
    baseQuery = baseQuery.where(sql<boolean>`(
      CAST(${sql.ref('Transfer_Payment_Stream_Chart_of_Account.egcs_tp_accountingdimensions')} AS text) ILIKE ${`%${escapeLikePattern(search)}%`}
    )`)
  }

  const [rows, countResult] = await Promise.all([
    baseQuery
      .select([
        'Funding_Case_Agreement_Commitment_Line.id as id',
        databaseMoneyText(sql.ref('Funding_Case_Agreement_Commitment_Line.egcs_fc_amount')).as('commitment_line_amount'),
        'Funding_Case_Agreement_Commitment_Line.egcs_fc_commitmentlinenumber as commitment_line_number',
        'Transfer_Payment_Stream_Chart_of_Account.egcs_tp_accountingdimensions as accounting_dimensions'
      ])
      .orderBy('Funding_Case_Agreement_Commitment_Line.egcs_fc_commitmentlinenumber', 'asc')
      .limit(limit)
      .offset(offset)
      .execute(),
    baseQuery
      .select(eb => eb.fn.count('Funding_Case_Agreement_Commitment_Line.id').as('total'))
      .executeTakeFirst()
  ])
  const linePrefixEn = en.agreement.payments.commitment_line_prefix
  const linePrefixFr = fr.agreement.payments.commitment_line_prefix

  const items = rows.map(row => {
    const dimensions = row.accounting_dimensions as TransferPaymentStreamChartOfAccountDimension[]
    return {
      id: String(row.id),
      commitment_line_amount: parseDatabaseMoney(row.commitment_line_amount),
      label_en: `${linePrefixEn} ${row.commitment_line_number} - ${formatAccountingDimensions(dimensions, 'en', ' - ')}`,
      label_fr: `${linePrefixFr} ${row.commitment_line_number} - ${formatAccountingDimensions(dimensions, 'fr', ' - ')}`
    }
  })
  const total = Number(countResult?.total ?? 0)

  return {
    items,
    total,
    stats: {
      total,
      active: total
    },
    page,
    limit
  }
})
