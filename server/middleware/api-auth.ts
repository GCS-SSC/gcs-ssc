import { requireAuthContext } from '~~/server/utils/authorize'

/**
 * Establishes an active authenticated user before any protected API handler runs.
 *
 * Per-route authorization remains mandatory. This boundary only prevents request
 * validation, parameter checks, and ownership lookups from running first.
 */
export default defineEventHandler(async event => {
  const path = getRequestURL(event).pathname
  if (!path.startsWith('/api/')) {
    return
  }

  const isBetterAuthProtocol = path === '/api/auth' || path.startsWith('/api/auth/')
  const isPublicEnumMetadata = path === '/api/metadata/enums'
  const isPublicHealthCheck = path === '/api/health'
  if (isBetterAuthProtocol || isPublicEnumMetadata || isPublicHealthCheck) {
    return
  }

  await requireAuthContext(event)
})
