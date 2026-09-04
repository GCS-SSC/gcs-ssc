export interface CompletionHookPayload {
  completionId: string
  entityType: string
  entityId: string
  completedByUserId: string
  completedAt: string
  comments: string
  context?: Record<string, unknown>
}
