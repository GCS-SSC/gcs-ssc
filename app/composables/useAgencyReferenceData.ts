import { isRef, toValue } from 'vue'
import type { Ref } from 'vue'

type AgencyReferenceOptions = {
  agencyId: Ref<string | null | undefined> | string | null | undefined
  buildUrl: (agencyId: string) => string
  query?: Record<string, unknown>
}

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
  const data: Ref<{ items: T[], total?: number } | null> = ref(null)
  const error: Ref<unknown> = ref(null)
  const fetchReference = $fetch as (url: string, options: { query: Record<string, unknown> }) => Promise<{ items: T[], total?: number }>
  let generation = 0

  /** Loads the current agency only and discards superseded responses. */
  const refresh = async () => {
    const id = agencyIdRef.value
    const requestGeneration = ++generation
    if (!id) {
      data.value = null
      error.value = null
      return
    }

    try {
      const resolvedQuery = Object.fromEntries(Object.entries(query ?? {}).map(([key, value]) => [key, toValue(value)]))
      const limit = Number(resolvedQuery.limit ?? 100)
      let page = 1
      let items: T[] = []
      let total: number | undefined
      do {
        const response = await fetchReference(buildUrl(String(id)), {
          query: { ...resolvedQuery, page, limit }
        })
        items = [...items, ...response.items]
        total = response.total
        if (response.items.length < limit || (total !== undefined && items.length >= total)) break
        page += 1
      } while (requestGeneration === generation && agencyIdRef.value === id)
      if (requestGeneration !== generation || agencyIdRef.value !== id) return
      data.value = { items, ...(total === undefined ? {} : { total }) }
      error.value = null
    } catch (requestError) {
      if (requestGeneration !== generation || agencyIdRef.value !== id) return
      data.value = null
      error.value = requestError
      throw requestError
    }
  }

  watch(
    agencyIdRef,
    value => {
      data.value = null
      error.value = null
      if (!value) {
        generation += 1
        return
      }
      void refresh().catch(() => undefined)
    },
    { immediate: true }
  )

  return {
    data,
    error,
    refresh
  }
}
