import type { H3Event } from 'h3'
import { getDatabaseConstraintName } from './database-constraint-errors'
import { throwApiError } from './api-errors'
import { PublicationLifecycleConflictError } from './system-publication'

const publicationFailurePatterns = [
  /Workflow discriminator/i,
  /Workflow approval-submission success/i,
  /members are not contiguous/i,
  /review setup members must use contiguous ordering beginning at 1/i,
  /review schemas must be published before activating a review setup/i,
  /approval templates? must be published first/i,
  /checklist review schemas must be published/i,
  /assessment review schemas must be published/i,
  /workflow approval template must be published/i,
  /workflow recommendation setup must be published/i,
  /workflow review setup must be published/i,
  /workflow requires at least one contiguously ordered member/i,
  /workflow member statuses do not satisfy/i,
  /workflow requires a recommendation set member/i,
  /workflow requires a recommendation set and approval stage/i,
  /claim reconciliation workflow uses an unsupported status/i,
  /workflow references an unavailable Agency status/i,
  /workflow requires at least one allowed-start status/i,
  /terminal statuses cannot start a workflow/i,
  /terminal statuses cannot be workflow materialization statuses/i,
  /a terminal workflow output must immediately end the run/i,
  /closeout workflow success must produce a terminal status/i,
  /Agency status workflows require a Stream scope/i,
  /Workflow Stream Agency is unavailable/i,
  /Risk Rating workflow/i,
  /Risk Rating assessment/i,
  /approval template .*must be published first/i,
  /review schema .*must be published first/i,
  /recommendation setup members must use contiguous ordering beginning at 1/i,
  /recommendation schema .*must be published first/i,
  /workflow recommendation setup .*unpublished/i,
  /assessment schema .*must be published/i,
  /assessment schema.*invalid/i,
  /entity type must match/i,
  /entity type must be commonreview/i,
  /entity type must be commonrecommendation/i
]

export const isExpectedPublicationFailure = (error: unknown): boolean =>
  error instanceof Error && publicationFailurePatterns.some(pattern => pattern.test(error.message))

/**
 * Maps the canonical published-selection uniqueness constraint to a stable API conflict.
 * @param event Active request used to localize the response.
 * @param error Database error raised by publication selection insertion.
 * @returns Never; throws either the mapped conflict or the original error.
 */
export const throwIfPublicationSelectionConflict = async (
  event: H3Event,
  error: unknown
): Promise<never> => {
  if (error && typeof error === 'object'
    && (error as { code?: unknown }).code === '23505'
    && getDatabaseConstraintName(error) === 'cn_uq_publicationselectionkey') {
    return await throwApiError(event, {
      statusCode: 409,
      code: 'PUBLICATION_SELECTION_CONFLICT',
      key: 'apiErrors.request.publication_selection_conflict'
    })
  }
  throw error
}

/**
 * Maps canonical publication domain and selection conflicts to localized API responses.
 * @param event Active request used to localize the response.
 * @param error Domain or database conflict raised by publication.
 * @returns Never; throws either a localized conflict or the original error.
 */
export const throwIfPublicationConflict = async (event: H3Event, error: unknown): Promise<never> => {
  if (error instanceof PublicationLifecycleConflictError) {
    return await throwApiError(event, {
      statusCode: 409,
      code: error.code,
      key: 'apiErrors.request.invalid_status'
    })
  }
  return await throwIfPublicationSelectionConflict(event, error)
}
