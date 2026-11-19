import { defineEventHandler, getRouterParam } from 'h3'
import { FundingCaseAgreementPaymentCreateSchema } from '~~/shared/types/schemas'
import { assertAgreementCurrency, assertCurrencyMoneyValues } from '~~/server/utils/agreement-currency'
import { assertAgreementPaymentEditable, assertAgreementPaymentFiscalYear, prepareAgreementPaymentRoute, resolveActiveAgreementPaymentCommitmentByType } from '~~/server/utils/agreement-payment'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { buildPaymentPreviewWithoutOffset, prepareAgreementPaymentOffsetPlan } from '~~/server/utils/agreement-payment-offset-plan'
import { assertPaymentOverrideTerms, withPaymentRecoveryErrors } from '~~/server/utils/payment-recovery-controls'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { badRequest } from '~~/server/utils/api-errors'

export default defineEventHandler(async event => {
  const paymentId = getRouterParam(event, 'paymentId')
  if (!paymentId || !isPositivePostgresBigintText(paymentId)) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  const target = { entityType: 'fundingcasepayment' as const, entityId: paymentId }
  const prepared = await prepareAgreementPaymentRoute(event, 'update', target)
  if (!prepared || !('agreementId' in prepared)) return prepared
  const { agreementId, agreementContext, db } = prepared
  const validated = await readValidatedBodyI18n(event, FundingCaseAgreementPaymentCreateSchema)
  if (validated.egcs_fc_aroverridereason) return await badRequest(event, 'AR_OVERRIDE_CREATION_ONLY', 'validation.payment_override_creation_only')
  return await executeFreshAuthorizedAgreementWrite(event, db, agreementId, agreementContext, async (trx, currentContext) => {
    const payment = await assertAgreementPaymentEditable(event, trx, agreementId, paymentId, { lockPayment: true })
    const currency = await assertAgreementCurrency(event, trx, agreementId, validated.egcs_fc_currency)
    await assertCurrencyMoneyValues(event, currency, [validated.egcs_fc_paymentamount])
    await resolveActiveAgreementPaymentCommitmentByType(event, trx, agreementId, validated.egcs_fc_commitmenttype, validated.egcs_fc_currency)
    await assertAgreementPaymentFiscalYear(event, trx, agreementId, validated.egcs_fc_fiscalyear, validated.egcs_fc_currency)
    if (payment && typeof payment === 'object' && 'egcs_fc_aroverride' in payment && payment.egcs_fc_aroverride) {
      await assertPaymentOverrideTerms(event, payment.egcs_fc_aroverride, {
        applicantRecipientId: validated.egcs_fc_applicantrecipient, currency: validated.egcs_fc_currency, gross: validated.egcs_fc_paymentamount
      })
      return buildPaymentPreviewWithoutOffset(validated)
    }
    return await withPaymentRecoveryErrors(event, async () => (await prepareAgreementPaymentOffsetPlan(event, trx, currentContext, validated, { paymentId, preview: true })).preview)
  }, { action: 'update', assignmentTarget: target, businessStatusTarget: target, correctionFinancialMutation: true,
    accountReceivableReadOnly: true,
    accountReceivablePayees: [{ applicantRecipientId: validated.egcs_fc_applicantrecipient, currency: validated.egcs_fc_currency }] })
})
