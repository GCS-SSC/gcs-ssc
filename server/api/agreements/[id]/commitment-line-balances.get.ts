import { defineEventHandler, getRouterParam } from 'h3'
import { FundingCaseAgreementPaymentBaseSchema, FundingCaseAgreementPaymentCreateSchema } from '~~/shared/types/schemas'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { assertAgreementCurrency } from '~~/server/utils/agreement-currency'
import { assertAgreementPaymentFiscalYear } from '~~/server/utils/agreement-payment'
import { getAgreementCommitmentLineBalances } from '~~/server/utils/agreement-commitment-line-balances'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'
import type { FundingCaseAgreementCommitmentLineBalances } from '~~/shared/types/funding-case-agreement-ui'

export const CommitmentLineBalancesQuerySchema = FundingCaseAgreementPaymentBaseSchema.pick({ egcs_fc_fiscalyear: true }).extend({
  egcs_fc_commitmenttype: FundingCaseAgreementPaymentCreateSchema.shape.egcs_fc_commitmenttype
}).strict()

/** Publishes selected-year coding balances before a Payment is created. */
export default defineEventHandler(async event => {
  const agreementId = getRouterParam(event, 'id')
  if (!agreementId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  return await executeFreshReadSnapshot(event, async (db, freshAuthContext): Promise<FundingCaseAgreementCommitmentLineBalances> => {
    const context = await authorizeAgreementResource(event, 'read', agreementId, db, { freshAuth: true, freshAuthContext })
    if (!context) return await notFound(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
    const input = await getValidatedQueryI18n(event, CommitmentLineBalancesQuerySchema)
    const currency = await assertAgreementCurrency(event, db, agreementId)
    await assertAgreementPaymentFiscalYear(event, db, agreementId, input.egcs_fc_fiscalyear, currency)
    const commitment = await db.selectFrom('Funding_Case_Agreement_Commitment').select('id')
      .where('egcs_fc_fundingagreement', '=', agreementId).where('egcs_fc_type', '=', input.egcs_fc_commitmenttype)
      .where('egcs_fc_currency', '=', currency).where('egcs_fc_active', '=', true).where('_deleted', '=', false).executeTakeFirst()
    return { commitmentId: commitment ? String(commitment.id) : null, currency,
      lines: commitment ? await getAgreementCommitmentLineBalances(db, agreementId, String(commitment.id), { fiscalYearId: input.egcs_fc_fiscalyear, currency }) : [] }
  })
})
