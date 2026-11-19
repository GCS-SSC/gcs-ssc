import { defineEventHandler, isError } from 'h3'
import { FundingCaseAgreementPaymentCreateSchema } from '~~/shared/types/schemas'
import { assertAgreementCurrency, assertCurrencyMoneyValues } from '~~/server/utils/agreement-currency'
import { assertAgreementPaymentFiscalYear, prepareAgreementPaymentRoute, resolveActiveAgreementPaymentCommitmentByType } from '~~/server/utils/agreement-payment'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { buildPaymentPreviewWithoutOffset, prepareAgreementPaymentOffsetPlan, readAgreementPaymentDebtEffect } from '~~/server/utils/agreement-payment-offset-plan'
import { assertPaymentRecoveryAllowed, withPaymentRecoveryErrors } from '~~/server/utils/payment-recovery-controls'

export default defineEventHandler(async event => {
  const prepared = await prepareAgreementPaymentRoute(event, 'create')
  if (!prepared || !('agreementId' in prepared)) return prepared
  const { agreementId, agreementContext, db } = prepared
  const validated = await readValidatedBodyI18n(event, FundingCaseAgreementPaymentCreateSchema)
  return await executeFreshAuthorizedAgreementWrite(event, db, agreementId, agreementContext, async (trx, currentContext, auth) => {
    const currency = await assertAgreementCurrency(event, trx, agreementId, validated.egcs_fc_currency)
    await assertCurrencyMoneyValues(event, currency, [validated.egcs_fc_paymentamount])
    await resolveActiveAgreementPaymentCommitmentByType(event, trx, agreementId, validated.egcs_fc_commitmenttype, validated.egcs_fc_currency)
    await assertAgreementPaymentFiscalYear(event, trx, agreementId, validated.egcs_fc_fiscalyear, validated.egcs_fc_currency)
    return await withPaymentRecoveryErrors(event, async () => {
      if (!auth.userAbilities.canOverridePaymentDebt(currentContext.scope)) {
        return (await prepareAgreementPaymentOffsetPlan(event, trx, currentContext, validated, { preview: true })).preview
      }
      await assertPaymentRecoveryAllowed(event, trx, { agreementId, applicantRecipientId: validated.egcs_fc_applicantrecipient,
        currency: validated.egcs_fc_currency }, { skipRecovery: true })
      const effect = await readAgreementPaymentDebtEffect(trx, currentContext, validated)
      const blockedPreview = () => ({ ...buildPaymentPreviewWithoutOffset(validated), egcs_fc_arblocked: true, egcs_fc_aroverrideavailable: true })
      if (effect === 'blocked') return blockedPreview()
      try {
        const { preview } = await prepareAgreementPaymentOffsetPlan(event, trx, currentContext, validated, { preview: true })
        return effect === 'offset' ? { ...preview, egcs_fc_aroverrideavailable: true } : preview
      } catch (error) {
        if (effect === 'offset' && isError(error) && error.data && typeof error.data === 'object'
          && 'code' in error.data && typeof error.data.code === 'string'
          && ['CODING_ALLOCATOR_CONFLICT', 'INVALID_CODING_ALLOCATION', 'AR_OFFSET_CODING_INVALID'].includes(error.data.code)) {
          return blockedPreview()
        }
        throw error
      }
    })
  }, { action: 'create', correctionFinancialMutation: true, accountReceivableReadOnly: true,
    accountReceivablePayees: [{ applicantRecipientId: validated.egcs_fc_applicantrecipient, currency: validated.egcs_fc_currency }] })
})
