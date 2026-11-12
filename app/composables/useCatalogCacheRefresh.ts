import { computed, getCurrentScope, onScopeDispose, shallowRef, toValue, watch } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type { CatalogCacheChange } from '~/utils/catalog-cache-client'
import { getCatalogCacheClient, subscribeCatalogCache } from '~/utils/catalog-cache'
import { getCatalogRequestUrl } from '~/utils/catalog-request-url'

type RefreshState =
  | { kind: 'idle' }
  | { kind: 'pending'; work: Promise<boolean>; failed: boolean }
  | { kind: 'settled'; work: Promise<boolean>; failed: boolean }

type VersionCheckState =
  | { kind: 'idle' | 'success' | 'error'; latest: number }
  | { kind: 'pending'; latest: number; count: number; failed: boolean }

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
  const refreshState = shallowRef<RefreshState>({ kind: 'idle' })
  const versionCheckState = shallowRef<VersionCheckState>({ kind: 'idle', latest: 0 })
  let lastChange: CatalogCacheChange | undefined
  let refreshGeneration = 0
  let sourceEpoch = 0
  const lifetime = shallowRef<'active' | 'disposed'>('active')
  const isDisposed = () => lifetime.value === 'disposed'
  const refreshFailed = () => refreshState.value.kind !== 'idle' && refreshState.value.failed
  const versionCheckFailed = () => versionCheckState.value.kind === 'error'
    || (versionCheckState.value.kind === 'pending' && versionCheckState.value.failed)
  const checking = computed(() => !isDisposed()
    && (versionCheckState.value.kind === 'pending' || refreshState.value.kind === 'pending'))
  const failed = computed(() => refreshFailed() || versionCheckFailed())
  const urls = () => {
    const value = toValue(source)
    return value === null ? [] : Array.isArray(value) ? value : [value]
  }
  const sourceKey = computed(() => JSON.stringify([...new Set(urls().map(url => getCatalogRequestUrl(String(url)).href))].sort()))
  /** Abandons local feedback when the source or authenticated session changes. */
  const resetConsumer = () => {
    sourceEpoch += 1
    refreshGeneration += 1
    lastChange = undefined
    refreshState.value = { kind: 'idle' }
    versionCheckState.value = { kind: 'idle', latest: versionCheckState.value.latest + 1 }
  }
  watch(sourceKey, resetConsumer, { flush: 'sync' })
  /**
   * Tracks catalog refill failures separately from successful version checks.
   * @param change - Accepted catalog or security change.
   * @returns Whether the current memory was refreshed successfully.
   */
  const refreshMemory = (change: CatalogCacheChange) => {
    if (isDisposed()) return Promise.resolve(false)
    const epoch = sourceEpoch
    lastChange = change
    refreshGeneration += 1
    let complete: (success: boolean) => void = () => undefined
    const work = new Promise<boolean>(resolve => {
      complete = resolve
    })
    refreshState.value = { kind: 'pending', work, failed: refreshFailed() }
    const ownsRefresh = () => !isDisposed() && epoch === sourceEpoch
      && refreshState.value.kind === 'pending' && refreshState.value.work === work
    // Invalidate synchronously so requests already in flight cannot settle into the old memory.
    let result: unknown
    try {
      result = refresh(change)
    } catch (error: unknown) {
      result = Promise.reject(error)
    }
    void Promise.resolve(result).then(success => {
      if (ownsRefresh()) refreshState.value = { kind: 'settled', work, failed: success === false }
      complete(success !== false)
    }).catch((error: unknown) => {
      if (ownsRefresh()) {
        refreshState.value = { kind: 'settled', work, failed: true }
        onError(error)
      }
      complete(false)
    })
    return work
  }
  const unsubscribe = subscribeCatalogCache(change => {
    if (change.securityContextChanged) resetConsumer()
    const client = getCatalogCacheClient()
    if (client && urls().some(url => client.affects(url, change))) void refreshMemory(change)
  })
  if (getCurrentScope()) onScopeDispose(() => {
    lifetime.value = 'disposed'
    refreshState.value = { kind: 'idle' }
    versionCheckState.value = { kind: 'idle', latest: versionCheckState.value.latest + 1 }
    unsubscribe()
  })

  /**
   * Checks versions when an existing local control is used without a new request.
   * @returns Whether the version check succeeded.
   */
  const check = async (): Promise<boolean> => {
    if (isDisposed()) return false
    const client = getCatalogCacheClient()
    if (!client || !urls().some(url => client.getRequestStamp(url))) return true
    const current = versionCheckState.value
    const epoch = sourceEpoch
    const ownsSource = () => !isDisposed() && epoch === sourceEpoch
    const generation = current.latest + 1
    const refreshAtStart = refreshGeneration
    versionCheckState.value = {
      kind: 'pending', latest: generation,
      count: current.kind === 'pending' ? current.count + 1 : 1,
      failed: versionCheckFailed()
    }
    /**
     * Updates the latest result without completing overlapping checks.
     * @param hasFailed - Whether the owning check failed.
     */
    const settleCheck = (hasFailed: boolean) => {
      if (ownsSource() && versionCheckState.value.kind === 'pending'
        && generation === versionCheckState.value.latest) {
        versionCheckState.value = { ...versionCheckState.value, failed: hasFailed }
      }
    }
    try {
      await client.checkVersions()
      if (!ownsSource()) return false
      settleCheck(false)
      if (refreshFailed() && refreshAtStart === refreshGeneration && lastChange) await refreshMemory(lastChange)
      if (!ownsSource()) return false
      const currentRefresh = refreshState.value
      if (currentRefresh.kind !== 'idle') await currentRefresh.work
      return ownsSource() && !refreshFailed()
    } catch (error: unknown) {
      settleCheck(true)
      if (ownsSource() && generation === versionCheckState.value.latest) onError(error)
      return false
    } finally {
      const pending = versionCheckState.value
      if (ownsSource() && pending.kind === 'pending') {
        versionCheckState.value = pending.count > 1
          ? { ...pending, count: pending.count - 1 }
          : { kind: pending.failed ? 'error' : 'success', latest: pending.latest }
      }
    }
  }
  return { check, checking, failed }
}
