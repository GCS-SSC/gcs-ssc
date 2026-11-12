/* eslint-disable jsdoc/require-jsdoc -- Request transitions are local to this composable. */
import { computed, onBeforeUnmount, shallowRef } from 'vue'

type DebouncedRequestState<T> =
  | { kind: 'idle'; data: T }
  | { kind: 'debouncing'; data: T; timer: ReturnType<typeof setTimeout> }
  | { kind: 'pending'; data: T; controller: AbortController }
  | { kind: 'success'; data: T; controller: AbortController }
  | { kind: 'error'; data: T; error: unknown; controller: AbortController }
  | { kind: 'disposed'; data: T }

/**
 * Owns cancellable debounce and request phases for remote palette queries.
 * @param options - Initial evidence and the query-specific request adapter.
 * @param options.initialData - Evidence restored when the owning query is cleared.
 * @param options.load - Captures request context before awaiting remote work.
 * @param options.failureEvidence - Whether a failed refresh preserves prior accepted evidence.
 * @returns Explicit phase, accepted evidence and constrained request transitions.
 */
export const useDebouncedRequest = <T>(options: {
  initialData: T
  failureEvidence: 'retain' | 'clear'
  load: (signal: AbortSignal) => Promise<T>
}) => {
  const state = shallowRef<DebouncedRequestState<T>>({ kind: 'idle', data: options.initialData })
  const cancel = () => {
    if (state.value.kind === 'debouncing') clearTimeout(state.value.timer)
    if (state.value.kind === 'pending' || state.value.kind === 'success' || state.value.kind === 'error') {
      state.value.controller.abort()
    }
  }
  const execute = async () => {
    if (state.value.kind === 'disposed') return
    cancel()
    const controller = new AbortController()
    state.value = { kind: 'pending', data: state.value.data, controller }
    const isCurrent = () => state.value.kind === 'pending' && state.value.controller === controller
    try {
      const data = await options.load(controller.signal)
      if (isCurrent()) state.value = { kind: 'success', data, controller }
    } catch (error) {
      if (isCurrent()) {
        const data = options.failureEvidence === 'retain' ? state.value.data : options.initialData
        state.value = { kind: 'error', data, error, controller }
      }
    }
  }
  const schedule = () => {
    if (state.value.kind === 'disposed') return
    cancel()
    const timer = setTimeout(() => {
      void execute()
    }, 200)
    state.value = { kind: 'debouncing', data: state.value.data, timer }
  }
  const clear = () => {
    if (state.value.kind === 'disposed') return
    cancel()
    state.value = { kind: 'idle', data: options.initialData }
  }
  onBeforeUnmount(() => {
    cancel()
    state.value = { kind: 'disposed', data: state.value.data }
  })
  return {
    state: computed(() => state.value),
    data: computed(() => state.value.data),
    execute,
    schedule,
    clear
  }
}
