import type { CompletionDisposition, RuntimeState } from '../constants/system-lifecycle'

export type BusinessLifecycleTerminus = 'not_completed' | 'orchestration_in_progress' | 'positive' | 'negative'

/** Immutable completion and target-level approval evidence projected beside a business status. */
export interface BusinessRecordStateFields {
  isCompleted: boolean
  completionDisposition: CompletionDisposition | null
  workflowRuntimeId: string | null
  workflowRuntimeState: RuntimeState | null
  lifecycleTerminus: BusinessLifecycleTerminus
  approvalRuntimeId: string | null
  approvalRuntimeState: RuntimeState | null
  routingSlipId: string | null
}
