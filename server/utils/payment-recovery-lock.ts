/* eslint-disable jsdoc/require-param -- Canonical Payment recovery lock planning. */
import type { Transaction } from 'kysely'
import type { H3Event } from 'h3'
import type { Currency_Codes, Database } from '~~/shared/types/database'
import { hasAccountingTable } from './correction-schema'
import { lockAccountReceivableRecoveryPool } from './account-receivable-context'
import { assertAgreementCorrectionFinancialUnlocked, assertAgreementCorrectionFinancialWriteAllowed } from './correction-lock'

/** Pool locks precede every originating/paying Agreement lock, including payee changes. */
export const lockPaymentRecoveryAgreements = async (
  trx: Transaction<Database>,
  input: { agreementId: string; agencyId: string; payees?: Array<{ applicantRecipientId: string; currency: Currency_Codes }>; event?: H3Event }
) => {
  if (!await hasAccountingTable(trx, 'Funding_Case_Account_Receivable_Pool')) return
  const payments = await trx.selectFrom('Funding_Case_Agreement_Payment')
    .select(['egcs_fc_applicantrecipient', 'egcs_fc_currency'])
    .where('egcs_fc_fundingagreement', '=', input.agreementId).where('_deleted', '=', false).execute()
  const identities = new Map<string, { applicantRecipientId: string; currency: Currency_Codes }>()
  for (const row of payments) {
    if (row.egcs_fc_applicantrecipient) identities.set(`${row.egcs_fc_applicantrecipient}:${row.egcs_fc_currency}`,
      { applicantRecipientId: String(row.egcs_fc_applicantrecipient), currency: row.egcs_fc_currency })
  }
  for (const payee of input.payees ?? []) identities.set(`${payee.applicantRecipientId}:${payee.currency}`, payee)
  const ordered = [...identities.values()].sort((left, right) =>
    BigInt(left.applicantRecipientId) < BigInt(right.applicantRecipientId)
      ? -1
      : BigInt(left.applicantRecipientId) > BigInt(right.applicantRecipientId) ? 1 : left.currency.localeCompare(right.currency))
  const poolIds: string[] = []
  for (const identity of ordered) {
    const pool = await lockAccountReceivableRecoveryPool(trx, { agencyId: input.agencyId, ...identity })
    poolIds.push(String(pool.id))
  }
  if (!poolIds.length) return
  const debts = await trx.selectFrom('Funding_Case_Agreement_Account_Receivable')
    .select('egcs_fc_fundingagreement').where('egcs_fc_pool', 'in', poolIds).where('egcs_fc_outcome', '=', 'posted').where('_deleted', '=', false).execute()
  const ids = [...new Set([input.agreementId, ...debts.map(row => String(row.egcs_fc_fundingagreement))])]
  await trx.selectFrom('Funding_Case_Agreement_Profile').select('id').where('id', 'in', ids).orderBy('id').forUpdate().execute()
  for (const id of ids) {
    if (input.event) await assertAgreementCorrectionFinancialWriteAllowed(input.event, trx, id)
    else await assertAgreementCorrectionFinancialUnlocked(trx, id)
  }
}
