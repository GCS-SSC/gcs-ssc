/**
 * Resolves catalog request filters identically for native and ofetch memory subscriptions.
 * @param request - The existing request URL.
 * @param query - Ofetch query parameters.
 * @param baseURL - An optional ofetch base URL.
 * @returns The complete request identity, including all filters.
 */
export const getCatalogRequestUrl = (
  request: string,
  query: Record<string, unknown> = {},
  baseURL?: string
): URL => {
  const origin = globalThis.location?.origin ?? 'http://localhost'
  const path = baseURL && !/^https?:\/\//.test(request)
    ? `${baseURL.replace(/\/$/, '')}/${request.replace(/^\//, '')}`
    : request
  const url = new URL(path, origin)
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue
    url.searchParams.delete(key)
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined) url.searchParams.append(key, item === null ? '' : typeof item === 'object' ? JSON.stringify(item) : String(item))
    }
  }
  url.searchParams.sort()
  return url
}
