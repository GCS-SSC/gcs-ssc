/* eslint-disable jsdoc/require-jsdoc */
type ListRouteCountResult = {
  total?: string | number | bigint | null
  active?: string | number | bigint | null
} | null | undefined

export const emptyListRouteResponse = (page: number, limit: number) => ({
  items: [],
  total: 0,
  stats: {
    total: 0,
    active: 0
  },
  page,
  limit
})

export const buildListRouteResponse = <Item>(
  items: Item[],
  countResult: ListRouteCountResult,
  statsResult: ListRouteCountResult,
  page: number,
  limit: number
) => ({
  items,
  total: Number(countResult?.total || 0),
  stats: {
    total: Number(statsResult?.total || 0),
    active: Number(statsResult?.active ?? statsResult?.total ?? 0)
  },
  page,
  limit
})
