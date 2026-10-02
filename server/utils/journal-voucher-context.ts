import type { Kysely } from 'kysely'
import type { Database } from '~~/shared/types/database'
import { resolveAgreementScopeContext } from './agreement'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

/**
 * Resolves ownership without granting access to the referenced Agreement or Payment.
 * @param db Current database or transaction.
 * @param journalVoucherId Exact JV identity.
 * @returns JV ownership context, or null when unavailable.
 */
export const resolveJournalVoucherRuntimeContext = async (db: Kysely<Database>, journalVoucherId: string) => {
  if (!isPositivePostgresBigintText(journalVoucherId)) return null
  const voucher = await db.selectFrom('Funding_Case_Agreement_Journal_Voucher')
    .select(['egcs_fc_fundingagreement', 'egcs_fc_payment'])
    .where('id', '=', journalVoucherId).where('_deleted', '=', false).executeTakeFirst()
  if (!voucher) return null
  const context = await resolveAgreementScopeContext(String(voucher.egcs_fc_fundingagreement), db)
  return context ? { ...context, journalVoucherId, paymentId: String(voucher.egcs_fc_payment) } : null
}
