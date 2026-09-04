import { z } from 'zod'
import { AssessmentResponseSchema } from './assessment/assessmentresponse'
import { ChecklistResponseEnvelopeSchema } from './checklist/checklist'
import { CompletionTargetEntityTypeIdentitySchema, OptionalNullableTrimmedString, RequiredStringId } from './common'

export const CompletionRuntimeEntitySchema = z.object({
  entityType: CompletionTargetEntityTypeIdentitySchema,
  entityId: RequiredStringId()
})

export const CompletionRuntimeQuerySchema = CompletionRuntimeEntitySchema

export const CompletionExecuteSchema = CompletionRuntimeEntitySchema.extend({
  comments: OptionalNullableTrimmedString(''),
  payload: z.unknown().optional()
})

export const CommonReviewCompletionPayloadSchema = z.union([
  z.object({ assessmentResponse: AssessmentResponseSchema }),
  z.object({ checklistResponse: ChecklistResponseEnvelopeSchema })
])

export type CompletionRuntimeEntityInput = z.infer<typeof CompletionRuntimeEntitySchema>
export type CompletionRuntimeQueryInput = z.infer<typeof CompletionRuntimeQuerySchema>
export type CompletionExecuteInput = z.infer<typeof CompletionExecuteSchema>
export type CommonReviewCompletionPayloadInput = z.infer<typeof CommonReviewCompletionPayloadSchema>
