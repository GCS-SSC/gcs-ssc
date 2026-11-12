/* eslint-disable jsdoc/require-jsdoc -- Request lifecycle helpers are local to the palette. */
import { computed, toValue, watch } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import { useDebouncedRequest } from '~/composables/useDebouncedRequest'
import type { SearchResponse } from '~~/shared/types/search'
import { getClientRequestUrl } from '~/utils/client-request-url'

/**
 * Fetches open-palette results, isolating every text, locale and open-state change.
 * @param open - Whether remote search is visible.
 * @param search - Optional user-entered identity text.
 * @param locale - Current request locale.
 * @returns Accepted results, progress, safe failure state and retry action.
 */
export const usePaletteSearch = (
  open: MaybeRefOrGetter<boolean>,
  search: MaybeRefOrGetter<string>,
  locale: MaybeRefOrGetter<string>
) => {
  const searchText = computed(() => toValue(search).trim())
  const request = useDebouncedRequest<SearchResponse | null>({
    initialData: null,
    failureEvidence: 'retain',
    load: async signal => {
      const url = getClientRequestUrl('/api/search')
      if (searchText.value) url.searchParams.set('search', searchText.value)
      const result = await fetch(url, {
        signal,
        headers: { 'Accept-Language': toValue(locale) }
      })
      if (!result.ok) throw new Error('Search request failed')
      return await result.json() as SearchResponse
    }
  })
  const loading = computed(() => request.state.value.kind === 'pending' || request.state.value.kind === 'debouncing')
  const failed = computed(() => request.state.value.kind === 'error')
  const fetchResults = async () => {
    if (toValue(open)) await request.execute()
  }
  watch([() => toValue(open), searchText, () => toValue(locale)], ([isOpen], previous) => {
    request.clear()
    if (!isOpen) return
    if (!previous || !previous[0] || searchText.value === '') {
      void fetchResults()
      return
    }
    request.schedule()
  }, { immediate: true, flush: 'sync' })
  return { response: request.data, loading, failed, retry: fetchResults }
}
