/* eslint-disable jsdoc/require-jsdoc -- Request lifecycle helpers are local to the palette. */
import { computed, onBeforeUnmount, ref, toValue, watch } from 'vue'
import type { MaybeRefOrGetter, Ref } from 'vue'
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
  const response: Ref<SearchResponse | null> = ref(null)
  const loading: Ref<boolean> = ref(false)
  const failed: Ref<boolean> = ref(false)
  const searchText = computed(() => toValue(search).trim())
  let generation = 0
  let controller: AbortController | null = null
  let timeout: ReturnType<typeof setTimeout> | null = null
  const invalidate = () => {
    generation += 1
    controller?.abort()
    controller = null
    if (timeout !== null) clearTimeout(timeout)
    timeout = null
  }
  const fetchResults = async () => {
    if (!toValue(open)) return
    invalidate()
    const requestGeneration = generation
    const requestController = new AbortController()
    controller = requestController
    loading.value = true
    failed.value = false
    try {
      const url = getClientRequestUrl('/api/search')
      if (searchText.value) url.searchParams.set('search', searchText.value)
      const result = await fetch(url, {
        signal: requestController.signal,
        headers: { 'Accept-Language': toValue(locale) }
      })
      if (!result.ok) throw new Error('Search request failed')
      const payload = await result.json() as SearchResponse
      if (generation === requestGeneration && !requestController.signal.aborted) response.value = payload
    } catch {
      if (generation === requestGeneration && !requestController.signal.aborted) failed.value = true
    } finally {
      if (generation === requestGeneration) loading.value = false
    }
  }
  watch([() => toValue(open), searchText, () => toValue(locale)], ([isOpen], previous) => {
    invalidate()
    response.value = null
    failed.value = false
    loading.value = isOpen
    if (!isOpen) return
    if (!previous || !previous[0] || searchText.value === '') {
      void fetchResults()
      return
    }
    timeout = setTimeout(() => {
      void fetchResults()
    }, 200)
  }, { immediate: true, flush: 'sync' })
  onBeforeUnmount(invalidate)
  return { response, loading, failed, retry: fetchResults }
}
