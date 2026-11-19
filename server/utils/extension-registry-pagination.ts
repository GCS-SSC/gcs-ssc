import { getQuery, type H3Event } from 'h3'
import { PaginationSchema } from '~~/shared/types/schemas/common'
import { parseI18n } from './api-validate'

/**
 * Filters and pages an authorized registry while allowing unpaged configuration lookups.
 * @param event - Request with optional pagination and search parameters.
 * @param rows - Authorized extension rows in registry order.
 * @returns Rows and count for the requested view.
 */
export const paginateExtensionRegistry = async <T extends {
  extension: { name: { en: string; fr: string }; description?: { en: string; fr: string } }
}>(event: H3Event, rows: T[]) => {
  const query = getQuery(event)
  if (query.page === undefined && query.limit === undefined && query.search === undefined) {
    return { items: rows, total: rows.length, page: 1, limit: rows.length || 10 }
  }

  const { page, limit, search } = await parseI18n(event, PaginationSchema, query)
  const term = search?.trim().toLowerCase()
  const filtered = term
    ? rows.filter(({ extension: { name, description } }) =>
        [name.en, name.fr, description?.en, description?.fr].some(text => text?.toLowerCase().includes(term))
      )
    : rows
  const offset = (page - 1) * limit

  return { items: filtered.slice(offset, offset + limit), total: filtered.length, page, limit }
}
