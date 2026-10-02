import type { H3Event } from 'h3'
import { sql, type Kysely, type Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import { TransferPaymentStreamChartOfAccountDimensionSchema } from '~~/shared/types/schemas/transfer-payment'
import { resolveAgreementScopeContext } from './agreement'
import { authorize, authorizeWithFreshAuthContext, type AuthContext } from './authorize'
import { notFound } from './api-errors'
import { databaseMoneyText, parseDatabaseMoney } from './database-money'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

type PaymentSourceDb = Kysely<Database> | Transaction<Database>

/**
 * Resolves a Payment's canonical owner and enforces its normal scoped read grant.
 * @param event - Active request.
 * @param db - Database used to resolve current ownership.
 * @param paymentId - Source Payment identifier.
 * @param freshAuthContext - Already locked authorization context from a protected write.
 * @returns Authorized Payment ownership context.
 */
export const requireAgreementPaymentSourceRead = async (
  event: H3Event,
  db: PaymentSourceDb,
  paymentId: string,
  freshAuthContext?: AuthContext
) => {
  const payment = isPositivePostgresBigintText(paymentId)
    ? await db.selectFrom('Funding_Case_Agreement_Payment').select('egcs_fc_fundingagreement')
        .where('id', '=', paymentId).where('_deleted', '=', false).executeTakeFirst()
    : undefined
  const context = payment ? await resolveAgreementScopeContext(String(payment.egcs_fc_fundingagreement), db) : null
  if (!context) return await notFound(event, 'AGREEMENT_PAYMENT_NOT_FOUND', 'apiErrors.agreement.payment_not_found')
  if (freshAuthContext) await authorizeWithFreshAuthContext(event, freshAuthContext, 'agreement', 'read', context.scope)
  else await authorize(event, 'agreement', 'read', context.scope)
  return context
}

/**
 * Reads source accounting data only after the Payment's own read authorization.
 * Historical catalog labels remain available after retirement. Protected callers
 * supply their locked fresh context instead of reusing request-cached grants.
 * @param event - Active request.
 * @param trx - Owning protected transaction.
 * @param paymentId - Source Payment identifier.
 * @param context - Locked Agreement and authorization context.
 * @param context.agreementId - Expected Agreement owner, resolved by the caller's transaction.
 * @param context.auth - Fresh authorization from that transaction.
 * @returns Source header and exact-money accounting allocations.
 */
export const readAgreementPaymentAccountingSource = async (
  event: H3Event,
  trx: Transaction<Database>,
  paymentId: string,
  context: { agreementId: string; auth: AuthContext }
) => {
  await requireAgreementPaymentSourceRead(event, trx, paymentId, context.auth)
  const header = await trx.selectFrom('Funding_Case_Agreement_Payment as p')
    .innerJoin('Common_Status as status', 'status.id', 'p.egcs_fc_status')
    .innerJoin('Funding_Case_Agreement_Budget_Fiscal_Year as fy', 'fy.id', 'p.egcs_fc_fiscalyear')
    .innerJoin('Agency_Fiscal_Year as ay', 'ay.id', 'fy.egcs_fc_fiscalyear')
    .innerJoin('Funding_Case_Agreement_Profile as agreement', 'agreement.id', 'p.egcs_fc_fundingagreement')
    .select(['p.egcs_fc_currency', 'p.egcs_fc_fiscalyear', 'fy.egcs_fc_fiscalyear as egcs_fc_agencyfiscalyear',
      'ay.egcs_ay_fiscalyeardisplay as egcs_fc_fiscalyeardisplay', 'agreement.egcs_fc_agreementnumber'])
    .where('p.id', '=', paymentId).where('p.egcs_fc_fundingagreement', '=', context.agreementId)
    .where('p._deleted', '=', false).where('status._deleted', '=', false).forShare('p').executeTakeFirst()
  if (!header) return await notFound(event, 'AGREEMENT_PAYMENT_NOT_FOUND', 'apiErrors.agreement.payment_not_found')
  const rows = await trx.selectFrom('Funding_Case_Agreement_Payment_Line as l')
    .innerJoin('Funding_Case_Agreement_Commitment_Line as c', 'c.id', 'l.egcs_fc_fundingagreementcommitmentline')
    .innerJoin('Transfer_Payment_Stream_Chart_of_Account as s', 's.id', 'c.egcs_fc_transferpaymentstreamchartofaccount')
    .innerJoin('Agency_Chart_of_Account as a', 'a.id', 's.egcs_tp_agencychartofaccount')
    .select(['c.id as egcs_fc_commitmentline', 'c.egcs_fc_commitmentlinenumber', 's.id as egcs_fc_chartofaccount',
      'a.egcs_ay_accountingdimensions as egcs_fc_accountingdimensions', databaseMoneyText(sql.ref('l.egcs_fc_amount')).as('egcs_fc_amount')])
    .where('l.egcs_fc_fundingagreementpayment', '=', paymentId).where('l._deleted', '=', false)
    .orderBy('c.id').forShare('l').execute()
  return { header, allocations: rows.map(row => ({ ...row, egcs_fc_amount: parseDatabaseMoney(row.egcs_fc_amount),
    egcs_fc_accountingdimensions: TransferPaymentStreamChartOfAccountDimensionSchema.array().parse(row.egcs_fc_accountingdimensions) })) }
}
