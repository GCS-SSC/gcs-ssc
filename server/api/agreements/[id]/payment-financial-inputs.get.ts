import { FundingCaseAgreementPaymentBaseSchema, FundingCaseAgreementPaymentCreateSchema } from '~~/shared/types/schemas'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { assertAgreementCurrency } from '~~/server/utils/agreement-currency'
import { assertAgreementPaymentFiscalYear } from '~~/server/utils/agreement-payment'
import { createExtensionAgreementFinancials } from '~~/server/utils/extension-agreement-financials'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'

export const PaymentFinancialInputsQuerySchema = FundingCaseAgreementPaymentBaseSchema.pick({
  egcs_fc_fiscalyear: true,
  egcs_fc_currency: true,
  egcs_fc_periodstart: true,
  egcs_fc_periodend: true
}).extend({
  egcs_fc_currency: FundingCaseAgreementPaymentBaseSchema.shape.egcs_fc_currency.optional(),
  egcs_fc_commitmenttype: FundingCaseAgreementPaymentCreateSchema.shape.egcs_fc_commitmenttype
}).strict().refine(data => data.egcs_fc_periodstart <= data.egcs_fc_periodend, {
  message: 'validation.date_range',
  path: ['egcs_fc_periodend']
})

/** Publishes host financial inputs independently of extension configuration and calculations. */
export default defineEventHandler(async event => {
  const agreementId = getRouterParam(event, 'id')
  if (!agreementId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')

  return await executeFreshReadSnapshot(event, async (db, freshAuthContext) => {
    const context = await authorizeAgreementResource(event, 'read', agreementId, db, { freshAuth: true, freshAuthContext })
    if (!context) return await notFound(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
    const input = await getValidatedQueryI18n(event, PaymentFinancialInputsQuerySchema)
    const currency = await assertAgreementCurrency(event, db, agreementId, input.egcs_fc_currency)
    await assertAgreementPaymentFiscalYear(event, db, agreementId, input.egcs_fc_fiscalyear)

    return await createExtensionAgreementFinancials(db, agreementId).getPaymentCalculation({
      fiscalYearId: input.egcs_fc_fiscalyear,
      commitmentTypeId: input.egcs_fc_commitmenttype,
      currency,
      paymentType: 'advance',
      periodStart: input.egcs_fc_periodstart,
      periodEnd: input.egcs_fc_periodend
    })
  })
})
