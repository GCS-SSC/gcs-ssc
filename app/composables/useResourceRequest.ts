import { computed, getCurrentScope, onScopeDispose, shallowRef, toValue, watch } from 'vue'
import type { MaybeRefOrGetter } from 'vue'

type ResourceRequestSnapshot<T> =
  | { kind: 'idle'; data: null }
  | { kind: 'queued'; data: null }
  | { kind: 'pending'; data: T | null; identity: string; controller: AbortController }
  | { kind: 'success'; data: T }
  | { kind: 'error'; data: T | null; error: unknown }

type ResourceRequestState<T> = ResourceRequestSnapshot<T> | { kind: 'disposed'; previous: ResourceRequestSnapshot<T> }

/**
 * Owns accepted evidence, cancellation and settlement for one reactive subject.
 *
 * @param options - Subject, loader, and the caller's evidence retention policy.
 * @param options.identity - Identity whose changes discard prior evidence.
 * @param options.load - Loader capturing its domain-specific request context.
 * @param options.enabled - Whether this owner may request the subject.
 * @param options.initial - Whether the initial request waits one microtask.
 * @param options.trigger - Load automatically on identity changes or only explicit refresh.
 * @param options.refreshData - Whether same-subject refresh retains evidence.
 * @param options.failureData - Whether failure retains accepted evidence.
 * @returns Read-only request state, data, and a retry action.
 */
export const useResourceRequest = <T>(options: {
  identity: MaybeRefOrGetter<string>
  load: (signal: AbortSignal) => Promise<T>
  enabled?: MaybeRefOrGetter<boolean>
  initial?: 'immediate' | 'deferred'
  trigger?: 'identity' | 'refresh'
  refreshData?: 'retain' | 'clear'
  failureData?: 'retain' | 'clear'
}) => {
  const enabled = () => options.enabled === undefined || toValue(options.enabled)
  let startup: 'deferred' | 'ready' = options.initial === 'deferred' ? 'deferred' : 'ready'
  const state = shallowRef<ResourceRequestState<T>>({ kind: 'idle', data: null })
  const snapshot = computed(() => state.value.kind === 'disposed' ? state.value.previous : state.value)
  const data = computed(() => snapshot.value.data)
  const status = computed(() => snapshot.value.kind === 'queued' ? 'pending' : snapshot.value.kind)
  const error = computed(() => snapshot.value.kind === 'error' ? snapshot.value.error : null)

  /**
   * Replaces active work; only its owning controller may commit evidence.
   * @returns Whether this request committed current evidence.
   */
  const refresh = async (): Promise<boolean> => {
    if (state.value.kind === 'disposed' || !enabled()) return false
    if (state.value.kind === 'pending') state.value.controller.abort()
    const controller = new AbortController()
    const identity = toValue(options.identity)
    state.value = { kind: 'pending', data: options.refreshData === 'clear' ? null : data.value, identity, controller }
    const isCurrent = () => state.value.kind === 'pending'
      && state.value.controller === controller
      && identity === toValue(options.identity) && enabled()
    try {
      const result = await options.load(controller.signal)
      if (!isCurrent()) return false
      state.value = { kind: 'success', data: result }
      return true
    } catch (failure) {
      if (!isCurrent()) return false
      state.value = { kind: 'error', data: options.failureData === 'clear' ? null : data.value, error: failure }
      return false
    }
  }

  /** Invalidates active work and clears evidence without starting another request. */
  const reset = () => {
    if (state.value.kind === 'disposed') return
    if (state.value.kind === 'pending') state.value.controller.abort()
    state.value = { kind: 'idle', data: null }
  }

  watch([() => toValue(options.identity), enabled], () => {
    if (state.value.kind === 'disposed') return
    reset()
    if (!enabled() || options.trigger === 'refresh') return
    if (startup === 'deferred') state.value = { kind: 'queued', data: null }
    else void refresh()
  }, { immediate: true, flush: 'sync' })
  if (startup === 'deferred') queueMicrotask(() => {
    startup = 'ready'
    if (state.value.kind === 'queued') void refresh()
  })

  if (getCurrentScope()) onScopeDispose(() => {
    if (state.value.kind === 'disposed') return
    const previous = state.value
    state.value = { kind: 'disposed', previous }
    if (previous.kind === 'pending') previous.controller.abort()
  })

  return { state: computed(() => state.value), data, status, error, refresh, reset }
}
