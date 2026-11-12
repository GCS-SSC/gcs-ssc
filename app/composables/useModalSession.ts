import { computed, getCurrentScope, onScopeDispose, shallowRef } from 'vue'
import type { Ref } from 'vue'

type ModalSessionState =
  | { kind: 'closed' }
  | { kind: 'open'; session: number }
  | { kind: 'disposed' }

/**
 * Owns an explicitly opened modal session and invalidates it with its Vue scope.
 *
 * @returns Writable visibility and captured-session ownership checks.
 */
export const useModalSession = () => {
  const state: Ref<ModalSessionState> = shallowRef({ kind: 'closed' })
  let nextSession = 0
  const isDisposed = () => state.value.kind === 'disposed'
  const captureSession = () => state.value.kind === 'open' ? state.value.session : null
  const isOpen = computed({
    get: () => state.value.kind === 'open',
    set: (open: boolean) => {
      if (isDisposed() || open === (state.value.kind === 'open')) return
      state.value = open ? { kind: 'open', session: ++nextSession } : { kind: 'closed' }
    }
  })

  /**
   * Checks a captured session, including a still-closed caller's null session.
   *
   * @param session - Session captured before asynchronous work.
   * @returns Whether the captured session matches the current live scope.
   */
  const isCurrentSession = (session: number | null) => !isDisposed() && captureSession() === session

  /**
   * Checks the latest opening even after it closes, until replacement or disposal.
   *
   * @param session - Session captured before asynchronous work.
   * @returns Whether the opening still owns settlement in the live scope.
   */
  const isLatestSession = (session: number | null) => !isDisposed() && session !== null && session === nextSession

  if (getCurrentScope()) {
    onScopeDispose(() => {
      state.value = { kind: 'disposed' }
    })
  }

  return { isOpen, captureSession, isCurrentSession, isLatestSession, isDisposed }
}
