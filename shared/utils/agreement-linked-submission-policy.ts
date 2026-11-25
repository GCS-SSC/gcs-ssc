import type { AgreementSubmissionState } from '../types/agreement-submission'

/**
 * Determines which native actions are available for a linked financial record.
 * @param state - Linked Submission state, or null for an unlinked record.
 * @param action - Native edit or an operation that could end review.
 * @returns Whether the action can proceed.
 */
export const allowsLinkedSubmissionAction = (
  state: AgreementSubmissionState | null,
  action: 'edit' | 'lifecycle'
): boolean => state === null || state === 'accepted' || (action === 'edit' && state === 'reviewing')
