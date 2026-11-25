import type { H3Event } from 'h3'
import type { Transaction } from 'kysely'
import { agreementSubmissionTargetSchemas as schemas, type AgreementSubmissionTargetKind } from '~~/shared/types/schemas/agreement-submission-targets'
import type { Database } from '~~/shared/types/database'
import type { AgreementSubmissionPayload } from '~~/shared/types/agreement-submission-database'
import { createAgreementClaimAggregate } from './agreement-claim'
import { assertAgreementCurrency, assertCurrencyMoneyValues } from './agreement-currency'
import { createAgreementForecastAggregate } from './agreement-forecast-import'
import { badRequest, throwApiError } from './api-errors'
import { parseI18n } from './api-validate'

type TargetInput = {
  event: H3Event
  agreementId: string
  agencyId: string
  streamId: string
  target: AgreementSubmissionTargetKind
  payload: AgreementSubmissionPayload
  primaryUserId: string
}

/** An expected target precondition for a Claim or Forecast submission. */
export class SubmissionTargetError extends Error {
  /**
   * Stable blocker code and its default description.
   * @param code - Stable blocker code.
   * @param message - Default text describing the blocker.
   */
  constructor(readonly code: string, message: string) {
    super(message)
  }
}

/**
 * Materializes a target inside the caller's fresh, authorized Agreement transaction.
 * @param trx - Transaction holding the Agreement and target authorization.
 * @param input - Version-one target payload and transaction-resolved owner.
 * @returns Created Claim or Forecast ID.
 */
export const applyAgreementSubmissionTarget = async (trx: Transaction<Database>, input: TargetInput): Promise<{ id: string }> => {
  const { event, agreementId, streamId, agencyId, payload, primaryUserId } = input

  const currency = await assertAgreementCurrency(event, trx, agreementId)
  if (input.target === 'claim') {
    const candidate = await parseI18n(event, schemas.claim, payload)
    await assertCurrencyMoneyValues(event, currency, candidate.lineItems.map(line => line.amount))
    const result = await createAgreementClaimAggregate(trx, {
      ...candidate,
      agreementId,
      streamId,
      receivedDate: new Date(`${candidate.receivedDate}T00:00:00Z`),
      submissionUuid: null,
      lineItems: candidate.lineItems.map(line => ({ ...line, currency }))
    }, agencyId, primaryUserId, { event, answers: candidate.customFields })
    if (result.status === 'created') return { id: result.claimId }
    if (result.status === 'initial_approval_required') {
      return await throwApiError(event, { statusCode: 409, code: 'AGREEMENT_INITIAL_APPROVAL_REQUIRED', key: 'apiErrors.agreement.initial_approval_required' })
    }
    if (result.status === 'applicant_recipient_unavailable') {
      return await badRequest(event, 'AGREEMENT_CLAIM_PROPONENT_INVALID', 'apiErrors.agreement.invalid_claim_proponent')
    }
    if (result.status === 'fiscal_year_unavailable') {
      return await badRequest(event, 'INVALID_AGREEMENT_CLAIM_FISCAL_YEAR', 'apiErrors.agreement.invalid_claim_fiscal_year')
    }
    throw new SubmissionTargetError('SUBMISSION_CLAIM_UNAVAILABLE', 'The Agreement cannot create the Claim in Draft status.')
  }

  const candidate = await parseI18n(event, schemas.forecast, payload)
  await assertCurrencyMoneyValues(event, currency, candidate.lineItems.flatMap(line => [line.amount, ...(line.totalAmount ? [line.totalAmount] : [])]))
  const monthKeys = candidate.lineItems.map(line => `${line.budgetLineItemId}:${line.month}`)
  if (new Set(monthKeys).size !== monthKeys.length) {
    throw new SubmissionTargetError('SUBMISSION_FORECAST_DUPLICATE_MONTH', 'The Forecast repeats a month on the same budget line.')
  }
  const result = await createAgreementForecastAggregate(trx, {
    ...candidate,
    agreementId,
    streamId,
    lineItems: candidate.lineItems.map(line => ({ ...line, currency }))
  }, agencyId, primaryUserId, { event, answers: candidate.customFields })
  if (result.status === 'created') return { id: result.forecastId }
  if (result.status === 'fiscal_year_unavailable') {
    return await badRequest(event, 'INVALID_AGREEMENT_BUDGET_FISCAL_YEAR', 'apiErrors.agreement.invalid_budget_fiscal_year')
  }
  if (result.status === 'recipient_unavailable') {
    return await badRequest(event, 'AGREEMENT_FORECAST_PROPONENT_INVALID', 'apiErrors.agreement.invalid_claim_proponent')
  }
  if (result.status === 'total_cost_mismatch') {
    return await badRequest(event, 'AGREEMENT_FORECAST_TOTAL_COST_INVALID', 'apiErrors.agreement.funding_breakdown_required')
  }
  if (result.status === 'total_cost_hidden') {
    return await badRequest(event, 'AGREEMENT_FORECAST_TOTAL_COST_INVALID', 'apiErrors.agreement.total_cost_read_only')
  }
  throw new SubmissionTargetError('SUBMISSION_FORECAST_UNAVAILABLE', 'The Agreement cannot create the Forecast in Draft status.')
}
