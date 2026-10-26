import { computed, getCurrentScope, onScopeDispose, ref, toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type { CatalogCacheChange } from '~/utils/catalog-cache-client'
import { getCatalogCacheClient, subscribeCatalogCache } from '~/utils/catalog-cache'

type CatalogRequestSource = MaybeRefOrGetter<string | URL | Array<string | URL> | null>

/**
 * Keeps catalog-backed memory current while leaving form values with their owner.
 * @param source - Current catalog request URLs, including response filters.
 * @param refresh - Refreshes only the memory owned by this catalog consumer.
 * @param onError - Displays the consumer's existing recovery message.
 * @returns An explicit version check for controls using an existing local list.
 */
export const useCatalogCacheRefresh = (
  source: CatalogRequestSource,
  refresh: (change: CatalogCacheChange) => unknown,
  onError: (error: unknown) => void = () => undefined
) => {
  let pendingRefresh: Promise<boolean> | undefined
  let lastChange: CatalogCacheChange | undefined
  let refreshGeneration = 0
  let checkGeneration = 0
  let disposed = false
  const pendingChecks = ref(0)
  const refreshing = ref(false)
  const refreshFailed = ref(false)
  const versionCheckFailed = ref(false)
  const checking = computed(() => pendingChecks.value > 0 || refreshing.value)
  const failed = computed(() => refreshFailed.value || versionCheckFailed.value)
  const urls = () => {
    const value = toValue(source)
    return value === null ? [] : Array.isArray(value) ? value : [value]
  }
  /**
   * Tracks catalog refill failures separately from successful version checks.
   * @param change - Accepted catalog or security change.
   * @returns Whether the current memory was refreshed successfully.
   */
  const refreshMemory = (change: CatalogCacheChange) => {
    lastChange = change
    const generation = ++refreshGeneration
    refreshing.value = true
    // Invalidate synchronously so requests already in flight cannot settle into the old memory.
    let result: unknown
    try {
      result = refresh(change)
    } catch (error: unknown) {
      result = Promise.reject(error)
    }
    pendingRefresh = Promise.resolve(result).then(success => {
      if (generation === refreshGeneration) refreshFailed.value = success === false
      return success !== false
    }).catch((error: unknown) => {
      if (generation === refreshGeneration) refreshFailed.value = true
      if (generation === refreshGeneration && !disposed) onError(error)
      return false
    }).finally(() => {
      if (generation === refreshGeneration) refreshing.value = false
    })
    return pendingRefresh
  }
  const unsubscribe = subscribeCatalogCache(change => {
    const client = getCatalogCacheClient()
    if (client && urls().some(url => client.affects(url, change))) void refreshMemory(change)
  })
  if (getCurrentScope()) onScopeDispose(() => {
    disposed = true
    unsubscribe()
  })

  /**
   * Checks versions when an existing local control is used without a new request.
   * @returns Whether the version check succeeded.
   */
  const check = async (): Promise<boolean> => {
    const client = getCatalogCacheClient()
    if (!client || !urls().some(url => client.getRequestStamp(url))) return true
    const generation = ++checkGeneration
    const refreshAtStart = refreshGeneration
    pendingChecks.value += 1
    try {
      await client.checkVersions()
      if (generation === checkGeneration) versionCheckFailed.value = false
      if (refreshFailed.value && refreshAtStart === refreshGeneration && lastChange) await refreshMemory(lastChange)
      await pendingRefresh
      return !refreshFailed.value
    } catch (error: unknown) {
      if (generation === checkGeneration) versionCheckFailed.value = true
      if (generation === checkGeneration && !disposed) onError(error)
      return false
    } finally {
      pendingChecks.value -= 1
    }
  }
  return { check, checking, failed }
}
