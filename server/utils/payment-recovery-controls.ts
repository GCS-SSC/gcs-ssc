/* eslint-disable jsdoc/require-jsdoc -- Payment authority delegates approved AR policy through narrow host controls. */
import type { H3Event } from 'h3'
import type { Kysely } from 'kysely'
import type { Currency_Codes, Database } from '~~/shared/types/database'
import { throwApiError } from './api-errors'
import { assertAccountReceivablePaymentAllowed } from './account-receivable-recovery'
import { hasAccountingTable } from './correction-schema'

const paymentRecoveryErrorKeys: Readonly<Record<string, string>> = {
  AR_DIRECT_REPAYMENT_HOLD: 'apiErrors.account_receivable.payment_direct_repayment_hold',
  AR_RECOVERY_UNRESOLVED: 'apiErrors.account_receivable.payment_recovery_pending',
  AR_ADJUSTMENT_UNRESOLVED: 'apiErrors.account_receivable.payment_recovery_pending'
}

export const withPaymentRecoveryErrors = async <T>(event: H3Event, operation: () => Promise<T>): Promise<T> => {
  try {
    return await operation()
  } catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith('AR_')) throw error
    return await throwApiError(event, { statusCode: 409, code: error.message,
      key: paymentRecoveryErrorKeys[error.message] ?? 'apiErrors.account_receivable.invalid_entry' })
  }
}

export const assertPaymentRecoveryAllowed = async (
  event: H3Event, db: Kysely<Database>, input: { agreementId: string; applicantRecipientId: string | null; currency: Currency_Codes; paymentId?: string }
) => {
  if (!await hasAccountingTable(db, 'Funding_Case_Account_Receivable_Pool')) return
  if (!input.applicantRecipientId) return await throwApiError(event, { statusCode: 409, code: 'AR_PAYMENT_PAYEE_REQUIRED', key: 'apiErrors.account_receivable.payment_payee_unavailable' })
  const payee = await db.selectFrom('Funding_Case_Agreement_Applicant_Recipient as link')
    .innerJoin('Applicant_Recipient_Profile as profile', 'profile.id', 'link.egcs_fc_applicantrecipient')
    .select('profile.id').where('link.egcs_fc_fundingagreement', '=', input.agreementId)
    .where('link.egcs_fc_applicantrecipient', '=', input.applicantRecipientId).where('link._deleted', '=', false)
    .where('profile._deleted', '=', false).where('profile.egcs_ar_active', '=', true).executeTakeFirst()
  if (!payee) return await throwApiError(event, { statusCode: 409, code: 'AR_PAYMENT_PAYEE_INVALID', key: 'apiErrors.account_receivable.payment_payee_unavailable' })
  await withPaymentRecoveryErrors(event, () => assertAccountReceivablePaymentAllowed(db, { ...input, applicantRecipientId: input.applicantRecipientId! }))
}

export const assertPaymentMutationRecoveryAllowed = async (
  event: H3Event, db: Kysely<Database>,
  input: { agreementId: string; paymentId: string; operation: string; changes?: Record<string, unknown> }
) => {
  if (input.operation === 'payment.delete' || !await hasAccountingTable(db, 'Funding_Case_Account_Receivable_Pool')) return
  const destination = input.changes?.egcs_fc_fundingagreementpayment
  const paymentIds = [...new Set([input.paymentId, ...(typeof destination === 'string' ? [destination] : [])])]
  for (const paymentId of paymentIds) {
    const payment = await db.selectFrom('Funding_Case_Agreement_Payment')
      .select(['egcs_fc_applicantrecipient', 'egcs_fc_currency'])
      .where('id', '=', paymentId).where('egcs_fc_fundingagreement', '=', input.agreementId).where('_deleted', '=', false).executeTakeFirst()
    if (!payment) return await throwApiError(event, { statusCode: 404, code: 'AGREEMENT_PAYMENT_NOT_FOUND', key: 'apiErrors.agreement.payment_not_found' })
    const changedPayee = input.operation === 'payment.update' ? input.changes?.egcs_fc_applicantrecipient : undefined
    await assertPaymentRecoveryAllowed(event, db, { agreementId: input.agreementId, paymentId,
      applicantRecipientId: typeof changedPayee === 'string' ? changedPayee : payment.egcs_fc_applicantrecipient,
      currency: payment.egcs_fc_currency })
  }
}
