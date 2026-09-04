import type { Kysely, Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import { resolveLatestTargetApprovalEvidence } from './business-approval-evidence'
import { databaseMoneyText, parseDatabaseMoney } from './database-money'
import { sumMoney, type Money } from '~~/shared/utils/money'
import { sql } from 'kysely'

type DbClient = Kysely<Database> | Transaction<Database>

/**
 * Returns payment coverage attached to one exact commitment line.
 *
 * @param db - Active database client or transaction.
 * @param commitmentLineId - Exact commitment line identity.
 * @param options - Optional query exclusions.
 * @param options.excludePaymentLineId - Payment line omitted during a patch calculation.
 * @returns Counted paid amount and whether any active payment line is attached.
 */
export const getCommitmentLinePaymentCoverage = async (
  db: DbClient,
  commitmentLineId: string,
  options: { excludePaymentLineId?: string } = {}
) => {
  let query = db
    .selectFrom('Funding_Case_Agreement_Payment_Line')
    .innerJoin(
      'Funding_Case_Agreement_Payment',
      'Funding_Case_Agreement_Payment.id',
      'Funding_Case_Agreement_Payment_Line.egcs_fc_fundingagreementpayment'
    )
    .select([
      'Funding_Case_Agreement_Payment.id as paymentId',
      databaseMoneyText(sql.ref('Funding_Case_Agreement_Payment_Line.egcs_fc_amount')).as('amount')
    ])
    .where('Funding_Case_Agreement_Payment_Line.egcs_fc_fundingagreementcommitmentline', '=', commitmentLineId)
    .where('Funding_Case_Agreement_Payment_Line._deleted', '=', false)
    .where('Funding_Case_Agreement_Payment._deleted', '=', false)

  if (options.excludePaymentLineId) {
    query = query.where('Funding_Case_Agreement_Payment_Line.id', '!=', options.excludePaymentLineId)
  }

  const rows = await query.execute()
  const approvalByPayment = new Map<string, Awaited<ReturnType<typeof resolveLatestTargetApprovalEvidence>>>()
  for (const paymentId of new Set(rows.map(row => String(row.paymentId)))) {
    approvalByPayment.set(paymentId, await resolveLatestTargetApprovalEvidence(db, 'fundingcasepayment', paymentId))
  }

  return {
    hasActivePaymentLine: rows.length > 0,
    paidAmount: sumMoney(rows.flatMap((row): Money[] =>
      approvalByPayment.get(String(row.paymentId))?.approvalRuntimeState === 'denied'
        ? []
        : [parseDatabaseMoney(row.amount)]))
  }
}
