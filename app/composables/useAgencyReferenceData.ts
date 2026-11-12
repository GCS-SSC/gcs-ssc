import { computed, getCurrentScope, isRef, onScopeDispose, ref, shallowRef, toValue, watch } from 'vue'
import type { Ref } from 'vue'

type AgencyReferenceOptions = {
  agencyId: Ref<string | null | undefined> | string | null | undefined
  buildUrl: (agencyId: string) => string
  query?: Record<string, unknown>
}

type AgencyReferenceResponse<T> = { items: T[], total?: number }

type AgencyReferenceSnapshot<T> =
  | { kind: 'idle'; data: null; error: null }
  | { kind: 'pending'; agencyId: string; controller: AbortController; data: AgencyReferenceResponse<T> | null; error: unknown }
  | { kind: 'success'; data: AgencyReferenceResponse<T>; error: null }
  | { kind: 'error'; data: null; error: unknown }

type AgencyReferenceState<T> = AgencyReferenceSnapshot<T> | { kind: 'disposed'; previous: AgencyReferenceSnapshot<T> }

/**
 * Fetches agency-scoped reference data and refreshes when agency changes.
 *
 * @param options - Agency id source, URL builder, and optional query params.
 * @param options.agencyId - A reactive reference or static string for the agency ID.
 * @param options.buildUrl - Function that generates the API endpoint based on the agency ID.
 * @param options.query - Optional reactive query parameters for the fetch call.
 * @returns Reactive response data and refresh handler.
 *
 * @example
 * ```typescript
 * const { data } = await useAgencyReferenceData({
 *   agencyId,
 *   buildUrl: id => `/api/agency/${id}/fiscal-years`
 * })
 * ```
 */
export const useAgencyReferenceData = <T>({ agencyId, buildUrl, query }: AgencyReferenceOptions) => {
  const agencyIdRef: Ref<string | null | undefined> = isRef(agencyId) ? agencyId : ref(agencyId)
  const state = shallowRef<AgencyReferenceState<T>>({ kind: 'idle', data: null, error: null })
  const snapshot = computed(() => state.value.kind === 'disposed' ? state.value.previous : state.value)
  const data = computed(() => snapshot.value.data)
  const error = computed(() => snapshot.value.error)

  /** Loads all pages for the current agency and rejects only current request failures. */
  const refresh = async (): Promise<void> => {
    if (state.value.kind === 'disposed') return
    if (state.value.kind === 'pending') state.value.controller.abort()
    const id = agencyIdRef.value
    if (!id) {
      state.value = { kind: 'idle', data: null, error: null }
      return
    }

    const controller = new AbortController()
    state.value = { kind: 'pending', agencyId: id, controller, data: data.value, error: error.value }
    const isCurrent = () => state.value.kind === 'pending'
      && state.value.controller === controller
      && agencyIdRef.value === id
    try {
      const url = buildUrl(id)
      const resolvedQuery = Object.fromEntries(Object.entries(query ?? {}).map(([key, value]) => [key, toValue(value)]))
      const limit = Number(resolvedQuery.limit ?? 100)
      let page = 1
      let items: T[] = []
      let total: number | undefined
      do {
        const response = await $fetch<AgencyReferenceResponse<T>, string>(url, {
          query: { ...resolvedQuery, page, limit },
          signal: controller.signal
        })
        if (!isCurrent()) return
        items = [...items, ...response.items]
        total = response.total
        if (response.items.length < limit || (total !== undefined && items.length >= total)) break
        page += 1
      } while (isCurrent())
      if (!isCurrent()) return
      state.value = { kind: 'success', data: { items, ...(total === undefined ? {} : { total }) }, error: null }
    } catch (requestError) {
      if (!isCurrent()) return
      state.value = { kind: 'error', data: null, error: requestError }
      throw requestError
    }
  }

  watch(
    agencyIdRef,
    value => {
      if (state.value.kind === 'disposed') return
      if (state.value.kind === 'pending') state.value.controller.abort()
      state.value = { kind: 'idle', data: null, error: null }
      if (value) void refresh().catch(() => undefined)
    },
    { immediate: true, flush: 'sync' }
  )

  if (getCurrentScope()) onScopeDispose(() => {
    if (state.value.kind === 'disposed') return
    const previous = state.value
    state.value = { kind: 'disposed', previous }
    if (previous.kind === 'pending') previous.controller.abort()
  })

  return {
    data,
    error,
    refresh
  }
}
