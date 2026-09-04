import { statusCatalogService } from '~~/server/utils/status-catalog'

// eslint-disable-next-line local/require-authorize -- API auth middleware guarantees an active user; the catalog is intentionally non-sensitive.
export default defineEventHandler(async event => {
  const catalog = event.context.$statusCatalog ?? statusCatalogService
  return catalog ? await catalog.getAll(event.context.$db) : []
})
