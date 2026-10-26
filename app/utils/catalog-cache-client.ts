/* eslint-disable jsdoc/require-jsdoc -- The browser cache boundary is covered by focused behavioral tests. */
import { z } from 'zod'
import {
  CATALOG_CACHE_QUERY_KEYS,
  CATALOG_GROUPS,
  CatalogVersionsEnvelopeSchema,
  getCatalogCacheRule
} from '~~/shared/utils/catalog-cache'
import type { CatalogGroup, CatalogVersionsEnvelope } from '~~/shared/utils/catalog-cache'
import { throwFetchResponseError } from './fetch-error'

export const CATALOG_VERSION_CHECK_MAX_AGE = 24 * 60 * 60 * 1000
const STORAGE_PREFIX = 'gcs-ssc:catalog-versions:'
const StoredVersionsSchema = CatalogVersionsEnvelopeSchema.pick({ agencies: true }).extend({
  checkedAt: z.number().finite().positive()
})
const AgencyIdsSchema = z.array(z.string().regex(/^\d+$/))
type StoredVersions = z.infer<typeof StoredVersionsSchema>
export type CatalogCacheIdentity = Pick<CatalogVersionsEnvelope, 'accountId' | 'sessionId'>
export interface CatalogCacheChange {
  groupsByAgency: Record<string, CatalogGroup[]>
  securityContextChanged: boolean
}
interface CatalogCacheClientOptions {
  fetcher?: typeof globalThis.fetch
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>
  origin?: string
  now?: () => number
  waitForIdentity?: () => Promise<void>
}

export interface CatalogCacheClient {
  fetch: typeof globalThis.fetch
  setIdentity: (identity: CatalogCacheIdentity | null) => void
  checkVersions: (force?: boolean) => Promise<void>
  subscribe: (listener: (change: CatalogCacheChange) => void) => () => void
  affects: (url: string | URL, change: CatalogCacheChange) => boolean
  getRequestStamp: (url: string | URL) => string
}

const obsoleteRequest = (): DOMException => new DOMException('Catalog request belongs to an obsolete session or revision.', 'AbortError')

export const createCatalogCacheClient = (options: CatalogCacheClientOptions = {}): CatalogCacheClient => {
  const fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis)
  const now = options.now ?? Date.now
  const origin = options.origin ?? window.location.origin
  const storage = options.storage
  const listeners = new Set<(change: CatalogCacheChange) => void>()
  const owners = new Map<string, string[]>()
  const staleOwners = new Set<string>()
  let identity: CatalogCacheIdentity | null = null
  let versions: StoredVersions | null = null
  let generation = 0
  let nextCheckId = 0
  let forceNextCheck = false
  let pendingCheck: { generation: number, id: number, promise: Promise<void> } | null = null

  const identityKey = (): string => identity ? `${encodeURIComponent(identity.accountId)}:${encodeURIComponent(identity.sessionId)}` : ''
  const storageKey = (): string => `${STORAGE_PREFIX}${identityKey()}`
  const readStorage = (): string | null => {
    try {
      return storage?.getItem(storageKey()) ?? null
    } catch {
      return null
    }
  }
  const readVersions = (): StoredVersions | null => {
    try {
      const raw = readStorage()
      if (!raw) return null
      const parsed = StoredVersionsSchema.safeParse(JSON.parse(raw))
      return parsed.success && parsed.data.checkedAt <= now() ? parsed.data : null
    } catch { return null }
  }
  const emit = (change: CatalogCacheChange): void => {
    for (const listener of [...listeners]) listener(change)
  }
  const acceptVersions = (next: StoredVersions): void => {
    const groupsByAgency: Record<string, CatalogGroup[]> = {}
    if (versions) {
      const agencies = new Set([...Object.keys(versions.agencies), ...Object.keys(next.agencies)])
      for (const agencyId of agencies) {
        const changed = CATALOG_GROUPS.filter(group => versions?.agencies[agencyId]?.[group] !== next.agencies[agencyId]?.[group])
        if (changed.length > 0) groupsByAgency[agencyId] = changed
      }
    }
    versions = next
    if (Object.keys(groupsByAgency).length > 0) {
      for (const url of owners.keys()) staleOwners.add(url)
      emit({ groupsByAgency, securityContextChanged: false })
    }
  }
  const syncStorage = (): boolean => {
    const saved = readVersions()
    if (saved && (!versions || saved.checkedAt >= versions.checkedAt)) acceptVersions(saved)
    return saved !== null
  }
  const clearAccountStorage = (accountId: string): void => {
    try {
      const prefix = `${STORAGE_PREFIX}${encodeURIComponent(accountId)}:`
      const keys = Array.from({ length: storage?.length ?? 0 }, (_, index) => storage?.key(index))
      for (const key of keys) if (key?.startsWith(prefix)) storage?.removeItem(key)
    } catch { /* Storage restrictions must not prevent abandoning the in-memory security context. */ }
  }
  const setIdentity = (next: CatalogCacheIdentity | null): void => {
    if (identity?.accountId === next?.accountId && identity?.sessionId === next?.sessionId) return
    if (identity) clearAccountStorage(identity.accountId)
    const previousIdentity = identity
    identity = next
    versions = null
    owners.clear()
    staleOwners.clear()
    generation += 1
    pendingCheck = null
    if (previousIdentity) emit({ groupsByAgency: {}, securityContextChanged: true })
    if (identity) syncStorage()
  }

  const checkVersions = async (force = false): Promise<void> => {
    if (!identity) return
    const hasSavedVersions = syncStorage()
    if (pendingCheck?.generation === generation) return await pendingCheck.promise
    if (!force && !forceNextCheck && (!storage || hasSavedVersions) && versions && now() - versions.checkedAt < CATALOG_VERSION_CHECK_MAX_AGE) return
    const requestedIdentity = identity
    const requestedGeneration = generation
    const requestedCheckId = ++nextCheckId
    const storageAtStart = readStorage()
    const startedAt = now()
    const promise = Promise.resolve().then(async () => {
      const response = await fetcher(new URL('/api/catalog-versions', origin), { cache: 'no-store' })
      if (requestedGeneration !== generation || requestedCheckId !== nextCheckId) throw obsoleteRequest()
      if (response.status === 401) setIdentity(null)
      if (!response.ok) await throwFetchResponseError(response)
      const envelope = CatalogVersionsEnvelopeSchema.parse(await response.json())
      if (requestedGeneration !== generation || requestedCheckId !== nextCheckId) throw obsoleteRequest()
      if (envelope.accountId !== requestedIdentity.accountId || envelope.sessionId !== requestedIdentity.sessionId) {
        setIdentity(null)
        throw obsoleteRequest()
      }
      // A different tab may have completed a newer check while this response was in flight.
      const saved = readVersions()
      if (readStorage() !== storageAtStart && saved && saved.checkedAt >= startedAt) {
        acceptVersions(saved)
      } else {
        const next = { agencies: envelope.agencies, checkedAt: now() }
        try {
          storage?.setItem(storageKey(), JSON.stringify(next))
        } catch { /* Recheck after browser restarts when storage is unavailable. */ }
        acceptVersions(next)
      }
      forceNextCheck = false
    }).finally(() => {
      if (pendingCheck?.id === requestedCheckId) pendingCheck = null
    })
    pendingCheck = { generation: requestedGeneration, id: requestedCheckId, promise }
    return await promise
  }

  const requestUrl = (value: string | URL): URL => {
    const url = new URL(value, origin)
    for (const key of CATALOG_CACHE_QUERY_KEYS) url.searchParams.delete(key)
    url.searchParams.sort()
    return url
  }
  const getRequestStamp = (value: string | URL): string => {
    const url = requestUrl(value)
    const rule = getCatalogCacheRule(url)
    if (!rule || url.origin !== origin) return ''
    return JSON.stringify([identityKey(), (owners.get(url.href) ?? []).map(agencyId => [agencyId, versions?.agencies[agencyId]?.[rule.group] ?? null])])
  }
  const affects = (value: string | URL, change: CatalogCacheChange): boolean => {
    const url = requestUrl(value)
    const rule = getCatalogCacheRule(url)
    if (!rule || url.origin !== origin) return false
    return change.securityContextChanged
      || (rule.id === 'C051' && Object.values(change.groupsByAgency).some(groups => groups.includes('streams')))
      || (owners.get(url.href) ?? []).some(agencyId => change.groupsByAgency[agencyId]?.includes(rule.group))
  }
  const wrappedFetch: typeof globalThis.fetch = async (input, init) => {
    const rawUrl = input instanceof Request ? input.url : String(input)
    const url = requestUrl(rawUrl)
    const sameOriginApi = url.origin === origin && url.pathname.startsWith('/api/')
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const rule = sameOriginApi && method === 'GET' ? getCatalogCacheRule(url) : null
    if (rule) await options.waitForIdentity?.()
    const requestedGeneration = generation
    if (rule) {
      await checkVersions()
      if (requestedGeneration !== generation) throw obsoleteRequest()
    }
    const stamp = getRequestStamp(url)
    const versionsAtStart = versions
    const requestedOwners = owners.get(url.href)
    const networkUrl = new URL(url)
    if (rule && identity) {
      networkUrl.searchParams.set('catalogAccount', identity.accountId)
      networkUrl.searchParams.set('catalogSession', identity.sessionId)
      if (!staleOwners.has(url.href) && requestedOwners?.length && requestedOwners.every(agencyId => versions?.agencies[agencyId]?.[rule.group])) {
        networkUrl.searchParams.set('catalogAgencies', requestedOwners.join(','))
        networkUrl.searchParams.set('catalogRevision', JSON.stringify(requestedOwners.map(agencyId => [agencyId, versions?.agencies[agencyId]?.[rule.group]])))
      }
    }
    const requestInput = rule
      ? input instanceof Request ? new Request(networkUrl, input) : networkUrl
      : input
    const response = await fetcher(requestInput, init)
    if (sameOriginApi && requestedGeneration === generation && response.status === 401) setIdentity(null)
    if (sameOriginApi && requestedGeneration === generation && response.ok && method === 'POST' && url.pathname.startsWith('/api/auth/sign-in/')) {
      forceNextCheck = true
      if (identity) {
        pendingCheck = null
        void checkVersions(true).catch(() => undefined)
      }
    }
    if (sameOriginApi && requestedGeneration === generation && response.ok && method === 'POST' && url.pathname === '/api/auth/sign-out') setIdentity(null)
    if (!rule) return response
    syncStorage()
    if (requestedGeneration !== generation || stamp !== getRequestStamp(url)) throw obsoleteRequest()
    if (response.ok) {
      try {
        const parsed = AgencyIdsSchema.safeParse(JSON.parse(response.headers.get('X-Catalog-Agencies') ?? 'null'))
        if (parsed.success) {
          if (parsed.data.some(agencyId => versionsAtStart?.agencies[agencyId]?.[rule.group] !== versions?.agencies[agencyId]?.[rule.group])) throw obsoleteRequest()
          owners.set(url.href, [...new Set(parsed.data)].sort())
          staleOwners.delete(url.href)
        }
      } catch (error) {
        if (error instanceof DOMException) throw error
        // Missing ownership metadata leaves this request uncached.
      }
    }
    const acceptedStamp = getRequestStamp(url)
    const guardResponse = (currentResponse: Response): Response => {
      const ensureCurrent = (): void => {
        syncStorage()
        if (generation !== requestedGeneration || acceptedStamp !== getRequestStamp(url)) throw obsoleteRequest()
      }
      const json = currentResponse.json.bind(currentResponse)
      const text = currentResponse.text.bind(currentResponse)
      const clone = currentResponse.clone.bind(currentResponse)
      currentResponse.json = async () => {
        const value: unknown = await json()
        ensureCurrent()
        return value
      }
      currentResponse.text = async () => {
        const value = await text()
        ensureCurrent()
        return value
      }
      currentResponse.clone = () => guardResponse(clone())
      return currentResponse
    }
    return guardResponse(response)
  }
  return {
    fetch: wrappedFetch,
    setIdentity,
    checkVersions,
    affects,
    getRequestStamp,
    subscribe: listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}
