import type { H3Event } from 'h3'
import type { Kysely } from 'kysely'
import { notFound } from '~~/server/utils/api-errors'
import type { Database } from '~~/shared/types/database'

export const AGREEMENT_CHILD_ERROR_KEYS = {
  applicantRecipientNotFound: ['AGREEMENT_APPLICANT_RECIPIENT_NOT_FOUND', 'apiErrors.agreement.applicant_recipient_not_found'],
  addressNotFound: ['AGREEMENT_ADDRESS_NOT_FOUND', 'apiErrors.agreement.address_not_found'],
  addressTypeNotFound: ['AGREEMENT_ADDRESS_TYPE_NOT_FOUND', 'apiErrors.agreement.invalid_address_type'],
  activityNotFound: ['AGREEMENT_ACTIVITY_NOT_FOUND', 'apiErrors.agreement.activity_not_found'],
  budgetFiscalYearNotFound: ['AGREEMENT_BUDGET_FISCAL_YEAR_NOT_FOUND', 'apiErrors.agreement.budget_fiscal_year_not_found'],
  budgetLineItemNotFound: ['AGREEMENT_BUDGET_LINE_ITEM_NOT_FOUND', 'apiErrors.agreement.budget_line_item_not_found'],
  claimNotFound: ['AGREEMENT_CLAIM_NOT_FOUND', 'apiErrors.agreement.claim_not_found'],
  claimLineItemNotFound: ['AGREEMENT_CLAIM_LINE_ITEM_NOT_FOUND', 'apiErrors.agreement.claim_line_item_not_found'],
  claimReconcileNotFound: ['AGREEMENT_CLAIM_RECONCILE_NOT_FOUND', 'apiErrors.agreement.claim_reconcile_not_found'],
  claimReconcileLineItemNotFound: ['AGREEMENT_CLAIM_RECONCILE_LINE_ITEM_NOT_FOUND', 'apiErrors.agreement.claim_reconcile_line_item_not_found'],
  commitmentNotFound: ['AGREEMENT_COMMITMENT_NOT_FOUND', 'apiErrors.agreement.commitment_not_found'],
  commitmentLineNotFound: ['AGREEMENT_COMMITMENT_LINE_NOT_FOUND', 'apiErrors.agreement.commitment_line_not_found'],
  paymentLineNotFound: ['AGREEMENT_PAYMENT_LINE_NOT_FOUND', 'apiErrors.agreement.payment_line_not_found']
} as const

type AgreementLookup = {
  id: string
}

type AgreementLookupResult = AgreementLookup | Awaited<ReturnType<typeof notFound>>

/**
 * Resolves an active agreement profile by id.
 *
 * @param event - The active H3 event.
 * @param agreementId - Funding case agreement id.
 * @param db - Database instance.
 * @returns The active agreement row.
 */
export const assertAgreementExists = async (
  event: H3Event,
  agreementId: string,
  db: Kysely<Database>
): Promise<AgreementLookupResult> => {
  const agreement = await db
    .selectFrom('Funding_Case_Agreement_Profile')
    .where('id', '=', agreementId)
    .where('_deleted', '=', false)
    .select('id')
    .executeTakeFirst()

  if (!agreement) {
    return await notFound(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  }

  return agreement
}

/**
 * Resolves a child record scoped to an agreement and throws a localized not-found error when missing.
 *
 * @param event - The active H3 event.
 * @param query - Child lookup query promise.
 * @param code - Stable API error code.
 * @param key - Localized translation key.
 * @returns The resolved child row.
 */
export const assertAgreementChildExists = async <T>(
  event: H3Event,
  query: Promise<T | undefined>,
  code: string,
  key: string
): Promise<T | Awaited<ReturnType<typeof notFound>>> => {
  const row = await query

  if (!row) {
    return await notFound(event, code, key)
  }

  return row
}
