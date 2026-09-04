import { z } from 'zod'
import { PositivePostgresBigintIdSchema, WorkflowTargetEntityTypeIdentitySchema } from './common'
import { RecommendationResponsesSchema } from './recommendation/recommendation'

const RequiredId = () => z.union([z.string().trim().min(1), z.number().int().positive()]).transform(String)

export const WorkflowSourceSchema = z.object({
  entityType: WorkflowTargetEntityTypeIdentitySchema,
  entityId: RequiredId(),
  purpose: z.enum(['standard', 'approval_submission', 'risk_rating']).default('standard')
})

export const WorkflowStartSchema = WorkflowSourceSchema.extend({
  workflowSetupId: PositivePostgresBigintIdSchema.optional()
}).superRefine((data, ctx) => {
  if (data.purpose === 'standard' && !data.workflowSetupId) {
    ctx.addIssue({ code: 'custom', message: 'validation.workflow_setup_required', path: ['workflowSetupId'] })
  }
})
export const WorkflowCancelSchema = WorkflowSourceSchema.extend({ runtimeId: PositivePostgresBigintIdSchema })
export const WorkflowRetrySchema = WorkflowSourceSchema.extend({ runtimeId: PositivePostgresBigintIdSchema })
export const WorkflowRuntimeQuerySchema = WorkflowSourceSchema.extend({ runtimeId: PositivePostgresBigintIdSchema.optional() })
export const WorkflowOwnerCandidatesQuerySchema = WorkflowSourceSchema.extend({ runtimeId: PositivePostgresBigintIdSchema })
export const WorkflowResumeSchema = WorkflowSourceSchema.extend({
  runtimeId: PositivePostgresBigintIdSchema,
  replacements: z.array(z.object({
    blockerId: PositivePostgresBigintIdSchema,
    ownerId: PositivePostgresBigintIdSchema
  })).min(1)
})

export const WorkflowRecommendationSaveSchema = z.object({
  revision: z.number().int().positive(),
  responses: RecommendationResponsesSchema.default([])
})
