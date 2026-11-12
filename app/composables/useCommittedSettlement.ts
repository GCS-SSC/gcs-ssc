import type { ActionContext } from '~/composables/useActionContext'

export type CommittedSettlementResult =
  | { kind: 'refreshed' }
  | { kind: 'unavailable'; error: unknown }
  | { kind: 'retired' }

export type CommittedReadbackResult =
  | { kind: 'available' }
  | { kind: 'unavailable'; error: unknown }

export type CapturedCommittedSettlement = {
  canDispatch: () => boolean
  settle: () => Promise<CommittedSettlementResult>
}

export type CaptureCommittedSettlement = () => CapturedCommittedSettlement | null

/**
 * Captures the parent resource before a child write, independently of its editor opening.
 * @param options - Parent action ownership and explicit committed readback evidence.
 * @param options.context - Stable setup-owned parent action context.
 * @param options.settle - Refreshes parent evidence and reports its actual read status.
 * @returns Capture factory required by mutation-owning children before dispatch.
 */
export const useCommittedSettlement = (options: {
  context: ActionContext
  settle: () => Promise<CommittedReadbackResult>
}): CaptureCommittedSettlement => () => {
  const operation = options.context.capture()
  if (!operation?.canDispatch()) return null

  return {
    canDispatch: operation.canDispatch,
    /** @returns Readback evidence for the captured live parent. */
    settle: async () => {
      if (!operation.isCurrent()) return { kind: 'retired' }
      try {
        const readback = await options.settle()
        if (!operation.isCurrent()) return { kind: 'retired' }
        return readback.kind === 'available' ? { kind: 'refreshed' } : readback
      } catch (error) {
        return operation.isCurrent() ? { kind: 'unavailable', error } : { kind: 'retired' }
      }
    }
  }
}
