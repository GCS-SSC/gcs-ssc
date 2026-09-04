import type { H3Event } from 'h3'
import { throwApiError } from './api-errors'
import { getDatabaseConstraintName, throwIfMappedConstraintError, type ConstraintErrorMapping } from './database-constraint-errors'

const REVIEW_SETUP_MEMBER_CONSTRAINT_ERRORS: Record<string, ConstraintErrorMapping> = {
  cn_idx_reviewsetupreviewsetorder: {
    code: 'DUPLICATE_REVIEW_SETUP_ORDER',
    key: 'apiErrors.transfer_payment.duplicate_review_setup_order'
  },
  cn_idx_reviewsetupreviewsetschema: {
    code: 'DUPLICATE_REVIEW_SETUP_MEMBERS',
    key: 'apiErrors.transfer_payment.duplicate_review_setup_members'
  }
}

/**
 * Translates expected concurrent review-member conflicts without hiding unexpected database failures.
 *
 * @param event - Active request event.
 * @param error - Database error raised by the write.
 * @returns Never for thrown errors, or the framework's bad-request result in tests.
 */
export const throwIfReviewSetupMemberConstraintError = async (
  event: H3Event,
  error: unknown
): Promise<never> => {
  if (error && typeof error === 'object'
    && (error as { code?: unknown }).code === '23514'
    && getDatabaseConstraintName(error) === 'cn_chk_retiredpublicationimmutable') {
    return await throwApiError(event, {
      statusCode: 409,
      code: 'PUBLICATION_RETIRED',
      key: 'apiErrors.request.invalid_status'
    })
  }
  return await throwIfMappedConstraintError(event, error, ['23505'], REVIEW_SETUP_MEMBER_CONSTRAINT_ERRORS)
}
