import { defineEventHandler, getRouterParam } from 'h3'
import { captureAgreementPaymentEvidence } from '~~/server/utils/agreement-payment-evidence'
import { assertPaymentRecoveryAllowed } from '~~/server/utils/payment-recovery-controls'
import type { Currency_Codes } from '~~/shared/types/database'
import { resolveAgreementCurrency } from '~~/server/utils/agreement-currency'
import { FundingCaseAgreementPaymentCreateSchema, FundingCaseAgreementPaymentPatchSchema } from '~~/shared/types/schemas'
import {
  assertAgreementPaymentEditable,
  assertAgreementPaymentFiscalYear,
  buildAgreementPaymentPatchUpdateValues,
  normalizeAgreementPaymentEditingResponse,
  prepareAgreementPaymentRoute,
  resolveAgreementPaymentPatchCommitmentId,
  syncAgreementPaymentEditingStatus,
  validateAgreementPaymentPatchContext
} from '~~/server/utils/agreement-payment'
import { badRequest } from '~~/server/utils/api-errors'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { runExtensionAgreementPaymentMutationGuards } from '~~/server/utils/extensions'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { validateMergedFinancialPeriodPatch } from '~~/server/utils/agreement-financial-patch-validation'
import { sql } from 'kysely'
import { databaseMoneyText, parseDatabaseMoney } from '~~/server/utils/database-money'
import { prepareAgreementPaymentOffsetPlan, validateAgreementPaymentOffsetPlan } from '~~/server/utils/agreement-payment-offset-plan'

export default defineEventHandler(async event => {
  const paymentId = getRouterParam(event, 'paymentId')
  if (!paymentId || !isPositivePostgresBigintText(paymentId)) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }

  const prepared = await prepareAgreementPaymentRoute(event, 'update', {
    entityType: 'fundingcasepayment',
    entityId: paymentId
  })
  if (!prepared || !('agreementId' in prepared)) {
    return prepared
  }

  const { agreementId, agreementContext, db } = prepared
  const patchValues = await readValidatedBodyI18n(event, FundingCaseAgreementPaymentPatchSchema)

  const updated = await executeFreshAuthorizedAgreementWrite(event, db, agreementId, agreementContext, async (trx, currentContext) => {
    const editablePayment = await assertAgreementPaymentEditable(
      event,
      trx,
      agreementId,
      paymentId,
      { lockPayment: true }
    )
    if (!editablePayment || typeof editablePayment !== 'object' || !('id' in editablePayment)) {
      return editablePayment
    }

    await assertPaymentRecoveryAllowed(event, trx, { agreementId, applicantRecipientId: patchValues.egcs_fc_applicantrecipient ?? editablePayment.egcs_fc_applicantrecipient, currency: patchValues.egcs_fc_currency ?? editablePayment.egcs_fc_currency, paymentId })
    await validateMergedFinancialPeriodPatch(event, editablePayment, patchValues)

    const { response, nextCommitmentId } = await resolveAgreementPaymentPatchCommitmentId(event, trx, agreementId, patchValues, editablePayment.egcs_fc_currency)
    if (response) {
      return response
    }

    const updateValues = buildAgreementPaymentPatchUpdateValues(patchValues, nextCommitmentId)
    const contextGuard = await validateAgreementPaymentPatchContext(
      event,
      trx,
      agreementId,
      paymentId,
      editablePayment,
      patchValues,
      updateValues,
      nextCommitmentId,
      { lockPaymentLines: true }
    )
    if (contextGuard) {
      return contextGuard
    }

    const explicitOffsetPlan = patchValues.egcs_fc_offsetplanhash !== undefined || patchValues.egcs_fc_offsetcreditmemos !== undefined
    const nextCommitment = explicitOffsetPlan
      ? await trx.selectFrom('Funding_Case_Agreement_Commitment').select('egcs_fc_type')
          .where('id', '=', nextCommitmentId ?? String(editablePayment.egcs_fc_fundingagreementcommitment)).executeTakeFirstOrThrow()
      : null
    const nextHeader = explicitOffsetPlan
      ? FundingCaseAgreementPaymentCreateSchema.parse({ ...editablePayment, ...patchValues,
          egcs_fc_commitmenttype: String(nextCommitment!.egcs_fc_type) })
      : null
    const offsetPlans = nextHeader
      ? await validateAgreementPaymentOffsetPlan(event,
          await prepareAgreementPaymentOffsetPlan(event, trx, currentContext, nextHeader, { paymentId }), nextHeader)
      : undefined

    if (Object.keys(updateValues).length === 0 && !explicitOffsetPlan) {
      return editablePayment
    }

    await runExtensionAgreementPaymentMutationGuards(event, trx, {
      operation: 'payment.update',
      agreementId,
      paymentId,
      changes: {
        ...patchValues,
        ...(nextCommitmentId === undefined ? {} : { egcs_fc_fundingagreementcommitment: nextCommitmentId })
      }
    })

    const recalculateEvidence = explicitOffsetPlan || [
      'egcs_fc_commitmenttype', 'egcs_fc_fiscalyear', 'egcs_fc_paymenttype', 'egcs_fc_applicantrecipient',
      'egcs_fc_periodstart', 'egcs_fc_periodend', 'egcs_fc_paymentamount', 'egcs_fc_currency'
    ].some(key => key in patchValues)
    let evidence = null
    if (recalculateEvidence) {
      const commitmentId = nextCommitmentId ?? String(editablePayment.egcs_fc_fundingagreementcommitment)
      const commitment = await trx.selectFrom('Funding_Case_Agreement_Commitment').select('egcs_fc_type')
        .where('id', '=', commitmentId).executeTakeFirstOrThrow()
      const input = FundingCaseAgreementPaymentCreateSchema.parse({ ...editablePayment, ...patchValues,
        egcs_fc_commitmenttype: String(commitment.egcs_fc_type) })
      const fiscalYear = await assertAgreementPaymentFiscalYear(event, trx, agreementId, input.egcs_fc_fiscalyear, input.egcs_fc_currency)
      if (!fiscalYear || typeof fiscalYear !== 'object' || !('id' in fiscalYear)) return fiscalYear
      evidence = await captureAgreementPaymentEvidence(trx, agreementId, commitmentId, input, fiscalYear.fiscal_year_display, { excludePaymentId: paymentId })
    }
    const row = Object.keys(updateValues).length || evidence
      ? await trx
          .updateTable('Funding_Case_Agreement_Payment')
          .set({ ...updateValues, ...(evidence ? { egcs_fc_evidence: sql`${JSON.stringify(evidence)}::jsonb` } : {}) })
          .where('id', '=', paymentId)
          .where('_deleted', '=', false)
          .returning([
            'id',
            'egcs_fc_evidence',
            'egcs_fc_fundingagreementcommitment',
            'egcs_fc_fiscalyear',
            'egcs_fc_paymenttype',
            'egcs_fc_applicantrecipient',
            'egcs_fc_periodstart',
            'egcs_fc_periodend',
            databaseMoneyText(sql.ref('egcs_fc_paymentamount')).as('egcs_fc_paymentamount'),
            'egcs_fc_currency',
            'egcs_fc_comment',
            'egcs_fc_status',
            '_deleted'
          ])
          .executeTakeFirstOrThrow()
      : editablePayment

    await syncAgreementPaymentEditingStatus(trx, paymentId, { event, agreementId, offsetPlans })
    return { ...row, egcs_fc_paymentamount: parseDatabaseMoney(row.egcs_fc_paymentamount) }
  }, {
    accountReceivablePayees: patchValues.egcs_fc_applicantrecipient ? [{ applicantRecipientId: patchValues.egcs_fc_applicantrecipient, currency: patchValues.egcs_fc_currency ?? await resolveAgreementCurrency(db, agreementId) as Currency_Codes }] : undefined,
    assignmentTarget: { entityType: 'fundingcasepayment', entityId: paymentId },
    businessStatusTarget: { entityType: 'fundingcasepayment', entityId: paymentId }
  })

  if (!updated || typeof updated !== 'object' || !('egcs_fc_status' in updated)) {
    return updated
  }

  return normalizeAgreementPaymentEditingResponse(updated as Parameters<typeof normalizeAgreementPaymentEditingResponse>[0])
})
