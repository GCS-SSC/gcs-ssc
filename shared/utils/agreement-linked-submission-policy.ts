import type { AgreementSubmissionState } from '../types/agreement-submission'
import { agreementSubmissionReviewTransitions } from './agreement-submission-transitions'

/**
 * Determines which actions are available for a financial record based on its linked Submission.
 * @param state - Linked Submission state, or null for an unlinked record.
 * @param action - Native edit, an operation that could end review, or withdrawal of a pending return.
 * @returns Whether the action can proceed.
 */
export const allowsLinkedSubmissionAction = (
  state: AgreementSubmissionState | null,
  action: 'edit' | 'lifecycle' | 'withdraw_return'
): boolean => {
  if (action === 'withdraw_return') return state === agreementSubmissionReviewTransitions.withdraw_return.from
  return state === null || state === 'accepted' || (action === 'edit' && state === 'reviewing')
}
