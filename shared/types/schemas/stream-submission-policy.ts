import { z } from 'zod'
import { AGREEMENT_SUBMISSION_MODES } from '../agreement-submission'

const mode = z.enum(AGREEMENT_SUBMISSION_MODES, { error: 'validation.invalid_selection' })

export const StreamSubmissionPolicySchema = z.strictObject({
  claim: mode,
  forecast: mode
})

export const StreamSubmissionPolicyPatchSchema = StreamSubmissionPolicySchema.partial()

export type StreamSubmissionPolicy = z.infer<typeof StreamSubmissionPolicySchema>

/**
 * Resolves omitted settings to the stream policy default.
 * @param policy - Stored stream overrides.
 * @returns Effective mode for every supported target.
 */
export const effectiveStreamSubmissionPolicy = (
  policy: Partial<StreamSubmissionPolicy>
): StreamSubmissionPolicy => ({
  claim: policy.claim ?? 'review',
  forecast: policy.forecast ?? 'review'
})
