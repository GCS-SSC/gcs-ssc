import type { ActionContext } from '~/composables/useActionContext'
import type { CaptureCommittedSettlement } from '~/composables/useCommittedSettlement'

type EditorOpening = {
  captureSession: () => number | null
  isCurrentSession: (session: number) => boolean
  isLatestSession: (session: number) => boolean
  closeSession: (session: number) => boolean
}

/**
 * Captures an editor opening and its live parent before a write. Acknowledgment
 * closes only the initiating opening, then refreshes the parent even if that
 * opening has been dismissed or replaced.
 *
 * @param opening - Owner of the current editable draft.
 * @returns Capture function for a specific action and its parent settlement.
 */
export const useEditorSettlement = (opening: EditorOpening) => (
  context: ActionContext,
  captureCommitted: CaptureCommittedSettlement
) => {
  const session = opening.captureSession()
  const action = context.capture()
  const committed = captureCommitted()
  if (session === null || !action?.canDispatch() || !committed?.canDispatch()) return null

  const isCurrent = () => action.isCurrent() && opening.isCurrentSession(session)
  return {
    session,
    action,
    isCurrent,
    canDispatch: () => opening.isCurrentSession(session) && action.canDispatch() && committed.canDispatch(),
    /** @returns Whether refreshed evidence can be reported to the initiating opening. */
    acknowledge: async () => {
      const closed = isCurrent() && opening.closeSession(session)
      const result = await committed.settle()
      return closed && result.kind === 'refreshed' && action.isCurrent() && opening.isLatestSession(session)
    }
  }
}
