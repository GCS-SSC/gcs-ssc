/* eslint-disable jsdoc/require-param, jsdoc/require-returns -- Catalog boundary helpers have explicit signatures. */
import { getResponseHeader, getResponseStatus, setResponseHeader, type H3Event } from 'h3'
import { z } from 'zod'
import { CATALOG_CACHE_QUERY_KEYS, getCatalogCacheRule } from '../../shared/utils/catalog-cache'
import { isPositivePostgresBigintText } from '../../shared/utils/database-id'

interface CatalogCacheRequest {
  url: URL
  rule: NonNullable<ReturnType<typeof getCatalogCacheRule>>
  agencies: string[] | null
}

const requests = new WeakMap<H3Event, CatalogCacheRequest>()
const RevisionPairsSchema = z.array(z.tuple([
  z.string().refine(isPositivePostgresBigintText),
  z.string().regex(/^[A-Za-z0-9_-]{21}$/)
])).max(1000)

/** Removes transport metadata before ordinary route query validation. */
export const prepareCatalogCacheRequest = (event: H3Event): void => {
  const url = new URL(event.path, 'http://catalog.local')
  if (url.pathname === '/api/catalog-versions') setResponseHeader(event, 'Cache-Control', 'no-store')
  if (event.method !== 'GET') return
  const rule = getCatalogCacheRule(url)
  if (!rule) return
  requests.set(event, { url, rule, agencies: null })
  setResponseHeader(event, 'Cache-Control', 'no-store')
  stripCatalogCacheRequestMetadata(event)
}

/** H3 restores its captured path after onRequest; validation reapplies this same transport boundary. */
export const stripCatalogCacheRequestMetadata = (event: H3Event): void => {
  const request = requests.get(event)
  if (!request) return
  const cleaned = new URL(event.path, request.url)
  for (const key of CATALOG_CACHE_QUERY_KEYS) cleaned.searchParams.delete(key)
  const path = `${cleaned.pathname}${cleaned.search}`
  event.node.req.url = path
  if (event.node.req.originalUrl !== undefined) {
    const original = new URL(event.node.req.originalUrl, request.url)
    for (const key of CATALOG_CACHE_QUERY_KEYS) original.searchParams.delete(key)
    event.node.req.originalUrl = `${original.pathname}${original.search}`
  }
  // H3 1.x reads getQuery() through its cached path, and web adapters retain a Request.
  event._path = undefined
  if (event.web) {
    const webUrl = new URL(path, event.web.request?.url ?? event.web.url ?? request.url)
    if (event.web.request) event.web.request = new Request(webUrl, event.web.request)
    event.web.url = webUrl
  }
}

/** Returns the original transport URL only for an approved catalog request. */
export const getCatalogCacheRequestUrl = (event: H3Event): URL | null => requests.get(event)?.url ?? null

/** Retains ownership from the route's authorized snapshot without another ownership query. */
export const setCatalogCacheAgencies = (event: H3Event, agencyIds: readonly string[]): void => {
  const request = requests.get(event)
  if (request) request.agencies = [...new Set(agencyIds)].sort()
}

/** Preserves response negotiation fields while adding private authentication variation. */
const appendAuthenticationVary = (event: H3Event): void => {
  const existing = getResponseHeader(event, 'Vary')
  const values = (Array.isArray(existing) ? existing.join(',') : String(existing ?? ''))
    .split(',').map(value => value.trim()).filter(Boolean)
  for (const value of ['Cookie', 'Accept-Language']) {
    if (!values.some(existingValue => existingValue.toLowerCase() === value.toLowerCase())) values.push(value)
  }
  setResponseHeader(event, 'Vary', values.join(', '))
}

/** Validates opaque revision pairs against the complete authorized Agency identity. */
const hasRevisionIdentity = (request: CatalogCacheRequest): boolean => {
  const { agencies, url } = request
  if (!agencies?.length || url.searchParams.get('catalogAgencies') !== agencies.join(',')) return false
  if (CATALOG_CACHE_QUERY_KEYS.some(key => url.searchParams.getAll(key).length !== 1)) return false
  const revision = url.searchParams.get('catalogRevision')
  if (!revision || revision.length > 16_384) return false
  let parsed: unknown
  try {
    parsed = JSON.parse(revision)
  } catch {
    return false
  }
  const pairs = RevisionPairsSchema.safeParse(parsed)
  return pairs.success && pairs.data.length === agencies.length
    && pairs.data.every(([agencyId], index) => agencyId === agencies[index])
}

/** Enables private HTTP reuse only after the original route authorized and completed. */
export const finishCatalogCacheResponse = async (event: H3Event, body?: unknown): Promise<void> => {
  const request = requests.get(event)
  if (!request) return
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const status = getResponseStatus(event)
  const returnedError = typeof body === 'object' && body !== null && 'statusCode' in body
    && typeof body.statusCode === 'number' && body.statusCode >= 400
  if (status < 200 || status >= 300 || returnedError) return
  const accountId = event.context.$authContext?.userId
  if (!accountId || request.agencies === null) return

  setResponseHeader(event, 'X-Catalog-Agencies', JSON.stringify(request.agencies))
  appendAuthenticationVary(event)
  if (!hasRevisionIdentity(request) || request.url.searchParams.get('catalogAccount') !== accountId) return
  const { auth } = await import('./auth')
  const session = await auth.api.getSession({ headers: event.headers })
  if (!session || String(session.user.id) !== accountId
    || request.url.searchParams.get('catalogSession') !== String(session.session.id)) return

  // An old browser revision remains valid until the agreed version check; always return live data.
  setResponseHeader(event, 'Cache-Control', `private, max-age=${request.rule.maxAge}, must-revalidate`)
}
