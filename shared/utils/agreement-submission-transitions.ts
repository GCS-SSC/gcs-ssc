import type { AgreementSubmissionCommand, AgreementSubmissionEventKind, AgreementSubmissionState } from '../types/agreement-submission'

export type AgreementSubmissionTransition = {
  state: AgreementSubmissionState
  event: Exclude<AgreementSubmissionEventKind, 'edited'> | null
}

export const agreementSubmissionAcceptance = { state: 'accepted', event: 'accepted' } as const satisfies AgreementSubmissionTransition

// Target adapters still own authorization, command inputs, and decision evidence.
export const agreementSubmissionReviewTransitions = {
  start: { from: 'submitted', state: 'reviewing', event: 'review_started' },
  save: { from: 'reviewing', state: 'reviewing', event: null },
  return: { from: 'reviewing', state: 'returned', event: 'returned' },
  withdraw_return: { from: 'returned', state: 'reviewing', event: 'return_withdrawn' },
  accept: { from: 'reviewing', ...agreementSubmissionAcceptance }
} as const satisfies Record<AgreementSubmissionCommand['action'], AgreementSubmissionTransition & { from: AgreementSubmissionState }>

/**
 * Resolves a new source revision after the adapter rules out a replay.
 * @param state - Current lifecycle state, or null for the first receipt.
 * @returns The admitted receipt transition, if any.
 */
export const resolveAgreementSubmissionReceiptTransition = (state: AgreementSubmissionState | null) =>
  state === null || state === 'returned' || state === 'proponent_editing'
    ? { state: 'submitted', event: 'received' } as const satisfies AgreementSubmissionTransition
    : null
