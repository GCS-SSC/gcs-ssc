import { RUNTIME_TERMINAL_STATES, type RuntimeState } from '~~/shared/constants/system-lifecycle'
import { badRequest } from '~~/server/utils/api-errors'

/**
 * Review-set terminal statuses represent completed workflow history and are read-only.
 *
 * @param status - Review-set status value to evaluate.
 * @returns True when the parent review set is terminal.
 */
export const isTerminalReviewSetStatus = (status: string | null | undefined): boolean => {
  if (!status) {
    return false
  }

  return RUNTIME_TERMINAL_STATES.has(status as RuntimeState)
}

/**
 * Review runtime mutations must treat terminal and approval-execution states as read-only.
 *
 * @param status - Review status value to evaluate.
 * @param reviewSetStatus - Parent review-set status value to evaluate.
 * @returns True when the review is in a locked workflow state.
 */
export const isReviewLockedStatus = (
  status: string | null | undefined,
  reviewSetStatus?: string | null | undefined
): boolean => (
  status !== 'active'
  || isTerminalReviewSetStatus(reviewSetStatus)
)

/**
 * Throws the shared localized invalid-state error for locked review mutations.
 *
 * @param event - Active request event.
 * @param status - Review status value to validate.
 * @param reviewSetStatus - Parent review-set status value to validate.
 * @returns Undefined for writable reviews; otherwise throws the localized bad request error.
 */
export const assertReviewNotLocked = async (
  event: Parameters<typeof badRequest>[0],
  status: string | null | undefined,
  reviewSetStatus?: string | null | undefined
): Promise<void> => {
  if (!isReviewLockedStatus(status, reviewSetStatus)) {
    return
  }

  await badRequest(event, 'REVIEW_LOCKED', 'apiErrors.request.review_locked')
}
