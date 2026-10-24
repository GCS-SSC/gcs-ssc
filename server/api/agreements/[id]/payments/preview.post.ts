import { defineEventHandler } from 'h3'
import { FundingCaseAgreementPaymentCreateSchema } from '~~/shared/types/schemas'
import { assertAgreementCurrency } from '~~/server/utils/agreement-currency'
import { assertAgreementPaymentFiscalYear, prepareAgreementPaymentRoute, resolveActiveAgreementPaymentCommitmentByType } from '~~/server/utils/agreement-payment'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { prepareAgreementPaymentOffsetPlan } from '~~/server/utils/agreement-payment-offset-plan'
import { withPaymentRecoveryErrors } from '~~/server/utils/payment-recovery-controls'

export default defineEventHandler(async event => {
  const prepared = await prepareAgreementPaymentRoute(event, 'create')
  if (!prepared || !('agreementId' in prepared)) return prepared
  const { agreementId, agreementContext, db } = prepared
  const validated = await readValidatedBodyI18n(event, FundingCaseAgreementPaymentCreateSchema)
  return await executeFreshAuthorizedAgreementWrite(event, db, agreementId, agreementContext, async (trx, currentContext) => {
    await assertAgreementCurrency(event, trx, agreementId, validated.egcs_fc_currency)
    await resolveActiveAgreementPaymentCommitmentByType(event, trx, agreementId, validated.egcs_fc_commitmenttype, validated.egcs_fc_currency)
    await assertAgreementPaymentFiscalYear(event, trx, agreementId, validated.egcs_fc_fiscalyear, validated.egcs_fc_currency)
    return await withPaymentRecoveryErrors(event, async () => (await prepareAgreementPaymentOffsetPlan(event, trx, currentContext, validated, { preview: true })).preview)
  }, { action: 'create', correctionFinancialMutation: true, accountReceivableReadOnly: true,
    accountReceivablePayees: [{ applicantRecipientId: validated.egcs_fc_applicantrecipient, currency: validated.egcs_fc_currency }] })
})
