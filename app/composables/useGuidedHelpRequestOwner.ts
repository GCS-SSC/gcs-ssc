import { computed, getCurrentScope, onScopeDispose, shallowRef } from 'vue'

type GuidedHelpRequestState<TAction extends string> =
  | { kind: 'idle' }
  | { kind: 'pending'; request: symbol; action: TAction }
  | { kind: 'success'; request: symbol; action: TAction }
  | { kind: 'error'; request: symbol; action: TAction; error: unknown }
  | { kind: 'disposed' }

/**
 * Owns one latest-request lane without imposing reader or publisher evidence policy.
 * @returns Explicit ownership and guarded request transitions.
 */
export const useGuidedHelpRequestOwner = <TAction extends string>() => {
  const current = shallowRef<GuidedHelpRequestState<TAction>>({ kind: 'idle' })
  const state = computed(() => current.value)
  const pending = computed(() => current.value.kind === 'pending')
  const status = computed(() => current.value.kind)

  /**
   * Starts a request unless this owner has been disposed.
   * @param action Kind of work owned by this lane.
   * @returns Current request identity, or null after disposal.
   */
  const begin = (action: TAction): symbol | null => {
    if (current.value.kind === 'disposed') return null
    const request = Symbol(action)
    current.value = { kind: 'pending', request, action }
    return request
  }
  /**
   * Tests whether an asynchronous continuation still belongs to this lane.
   * @param request Captured identity from begin.
   * @returns Whether this request still owns the lane.
   */
  const isCurrent = (request: symbol) => 'request' in current.value && current.value.request === request
  /**
   * Accepts successful settlement only once for the current pending request.
   * @param request Captured identity from begin.
   * @returns Whether the settlement was accepted.
   */
  const succeed = (request: symbol) => {
    if (current.value.kind !== 'pending' || !isCurrent(request)) return false
    current.value = { kind: 'success', request, action: current.value.action }
    return true
  }
  /**
   * Accepts failed settlement only once for the current pending request.
   * @param request Captured identity from begin.
   * @param error Failure for the current request.
   * @returns Whether the settlement was accepted.
   */
  const fail = (request: symbol, error: unknown) => {
    if (current.value.kind !== 'pending' || !isCurrent(request)) return false
    current.value = { kind: 'error', request, action: current.value.action, error }
    return true
  }
  /** Invalidates pending work while allowing the owner to accept another request. */
  const reset = () => {
    if (current.value.kind !== 'disposed') current.value = { kind: 'idle' }
  }
  /** Invalidates pending work permanently when its owning UI scope ends. */
  const dispose = () => {
    current.value = { kind: 'disposed' }
  }
  if (getCurrentScope()) onScopeDispose(dispose)

  return { state, pending, status, begin, isCurrent, succeed, fail, reset, dispose }
}
