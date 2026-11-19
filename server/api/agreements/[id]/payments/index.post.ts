import { defineEventHandler } from 'h3'
import { captureAgreementPaymentEvidence } from '~~/server/utils/agreement-payment-evidence'
import { assertPaymentRecoveryAllowed, withPaymentRecoveryErrors } from '~~/server/utils/payment-recovery-controls'
import { assertAgreementCurrency, assertCurrencyMoneyValues } from '~~/server/utils/agreement-currency'
import { sql } from 'kysely'
import type { PaymentAROverride } from '~~/shared/types/database'
import { FundingCaseAgreementPaymentCreateSchema } from '~~/shared/types/schemas'
import {
  assertAgreementPaymentFiscalYear,
  prepareAgreementPaymentRoute,
  syncAgreementPaymentEditingStatus,
  resolveActiveAgreementPaymentCommitmentByType
} from '~~/server/utils/agreement-payment'
import { runExtensionCreateOperationHooks } from '~~/server/utils/extensions'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { createPrimaryEntityAssignment, resolveAssignmentCommonUserId } from '~~/server/utils/entity-assignment'
import { forbidden, notFound } from '~~/server/utils/api-errors'
import { lockAgencyDraftStatus } from '~~/server/utils/business-status-runtime'
import { databaseMoneyText, databaseMoneyValue, parseDatabaseMoney } from '~~/server/utils/database-money'
import { allocateAgreementPayment } from '~~/server/utils/agreement-coding-allocator'
import { prepareAgreementPaymentOffsetPlan, readAgreementPaymentDebtEffect, validateAgreementPaymentOffsetPlan } from '~~/server/utils/agreement-payment-offset-plan'
import { hasSuccessfulInitialAgreementApproval, throwAgreementInitialApprovalRequired } from '~~/server/utils/agreement-approval-submission'

export default defineEventHandler(async event => {
  const prepared = await prepareAgreementPaymentRoute(event, 'create')
  if (!prepared || !('agreementId' in prepared)) {
    return prepared
  }

  const { agreementId, agreementContext, db } = prepared
  const validated = await readValidatedBodyI18n(event, FundingCaseAgreementPaymentCreateSchema)

  return await executeFreshAuthorizedAgreementWrite(event, db, agreementId, agreementContext, async (trx, currentContext, auth) => {
    if (!await hasSuccessfulInitialAgreementApproval(trx, agreementId)) return await throwAgreementInitialApprovalRequired(event)
    const currency = await assertAgreementCurrency(event, trx, agreementId, validated.egcs_fc_currency)
    await assertCurrencyMoneyValues(event, currency, [validated.egcs_fc_paymentamount])
    const overrideReason = validated.egcs_fc_aroverridereason
    if (overrideReason && !auth.userAbilities.canOverridePaymentDebt(currentContext.scope)) return await forbidden(event)
    await assertPaymentRecoveryAllowed(event, trx, { agreementId, applicantRecipientId: validated.egcs_fc_applicantrecipient, currency: validated.egcs_fc_currency },
      { skipRecovery: Boolean(overrideReason) })
    const commitment = await resolveActiveAgreementPaymentCommitmentByType(
      event,
      trx,
      agreementId,
      validated.egcs_fc_commitmenttype,
      validated.egcs_fc_currency
    )
    if (!commitment || typeof commitment !== 'object' || !('id' in commitment)) {
      return commitment
    }

    const fiscalYear = await assertAgreementPaymentFiscalYear(
      event,
      trx,
      agreementId,
      validated.egcs_fc_fiscalyear,
      validated.egcs_fc_currency
    )
    if (!fiscalYear || typeof fiscalYear !== 'object' || !('id' in fiscalYear)) {
      return fiscalYear
    }

    const offsetPlans = await withPaymentRecoveryErrors(event, async () => {
      if (overrideReason) {
        if (validated.egcs_fc_offsetplanhash || validated.egcs_fc_offsetcreditmemos?.length) throw new Error('AR_OFFSET_PLAN_CHANGED')
        if (await readAgreementPaymentDebtEffect(trx, currentContext, validated) === 'none') throw new Error('AR_OVERRIDE_NOT_APPLICABLE')
        return []
      }
      const offsetPlan = await prepareAgreementPaymentOffsetPlan(event, trx, currentContext, validated)
      return await validateAgreementPaymentOffsetPlan(event, offsetPlan, validated)
    })

    const paymentValues = {
      egcs_fc_fundingagreementcommitment: String(commitment.id),
      egcs_fc_fiscalyear: validated.egcs_fc_fiscalyear,
      egcs_fc_paymenttype: validated.egcs_fc_paymenttype,
      egcs_fc_applicantrecipient: validated.egcs_fc_applicantrecipient,
      egcs_fc_periodstart: validated.egcs_fc_periodstart,
      egcs_fc_periodend: validated.egcs_fc_periodend,
      egcs_fc_paymentamount: validated.egcs_fc_paymentamount,
      egcs_fc_currency: validated.egcs_fc_currency,
      egcs_fc_comment: validated.egcs_fc_comment
    }
    const hookValues = {
      ...paymentValues,
      egcs_fc_commitmenttype: validated.egcs_fc_commitmenttype,
      ...(validated.extensions ? { extensions: validated.extensions } : {})
    }

    const extensionResponse = await runExtensionCreateOperationHooks(
      event,
      trx,
      'agreement.payments.create',
      currentContext,
      hookValues
    )
    if (extensionResponse) {
      return extensionResponse
    }

    const creatorId = await resolveAssignmentCommonUserId(trx, auth.userId)
    if (!creatorId) return await notFound(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')
    const draftStatusId = await lockAgencyDraftStatus(trx, currentContext.agencyId)

    const evidence = await captureAgreementPaymentEvidence(trx, agreementId, String(commitment.id), validated, fiscalYear.fiscal_year_display)
    const arOverride: PaymentAROverride | null = overrideReason
      ? {
          actorId: creatorId,
          reason: overrideReason,
          enabledAt: new Date().toISOString(),
          payeeId: validated.egcs_fc_applicantrecipient,
          currency: validated.egcs_fc_currency,
          grossMinorUnits: validated.egcs_fc_paymentamount.amount
        }
      : null
    const createdPayment = await trx
      .insertInto('Funding_Case_Agreement_Payment')
      .values({
        ...paymentValues,
        egcs_fc_evidence: sql`${JSON.stringify(evidence)}::jsonb`,
        egcs_fc_paymentamount: databaseMoneyValue(paymentValues.egcs_fc_paymentamount),
        egcs_fc_status: draftStatusId,
        egcs_fc_aroverride: arOverride ? sql`${JSON.stringify(arOverride)}::jsonb` : null
      })
      .returning([
        'id',
        'egcs_fc_evidence',
        'egcs_fc_aroverride',
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
    const exactCreatedPayment = {
      ...createdPayment,
      egcs_fc_paymentamount: parseDatabaseMoney(createdPayment.egcs_fc_paymentamount, createdPayment.egcs_fc_currency)
    }

    await createPrimaryEntityAssignment(trx, 'fundingcasepayment', String(createdPayment.id), creatorId)

    await runExtensionCreateOperationHooks(
      event,
      trx,
      'agreement.payments.create',
      currentContext,
      hookValues,
      exactCreatedPayment as Record<string, unknown>
    )

    await syncAgreementPaymentEditingStatus(trx, String(createdPayment.id), { event, agreementId, offsetPlans })
    await allocateAgreementPayment(event, trx, { agreementId, agencyId: currentContext.agencyId, streamId: currentContext.streamId,
      paymentId: String(createdPayment.id), commitmentId: String(commitment.id), commitmentTypeId: validated.egcs_fc_commitmenttype, amount: validated.egcs_fc_paymentamount,
      currency: validated.egcs_fc_currency, fiscalYearId: validated.egcs_fc_fiscalyear })
    return exactCreatedPayment
  }, { action: 'create', correctionFinancialMutation: true, accountReceivablePayees: [{ applicantRecipientId: validated.egcs_fc_applicantrecipient, currency: validated.egcs_fc_currency }] })
})
