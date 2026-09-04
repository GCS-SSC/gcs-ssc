import { buildListRouteResponse } from './list-route-response'

type AgencyScopedListCount = {
  total?: string | number | bigint | null
  active?: string | number | bigint | null
} | null | undefined

interface FetchAgencyScopedListOptions<Item> {
  items: Promise<Item[]>
  filteredCount: Promise<AgencyScopedListCount>
  scopedCount: Promise<AgencyScopedListCount>
  page: number
  limit: number
}

/**
 * Executes an agency-scoped page and its filtered and unfiltered counts concurrently.
 *
 * @param options - Page and count queries with pagination metadata.
 * @returns The standard paginated list response.
 */
export const fetchAgencyScopedList = async <Item>(options: FetchAgencyScopedListOptions<Item>) => {
  const { items, filteredCount, scopedCount, page, limit } = options
  const [resolvedItems, countResult, statsResult] = await Promise.all([
    items,
    filteredCount,
    scopedCount
  ])

  return buildListRouteResponse(resolvedItems, countResult, statsResult, page, limit)
}
