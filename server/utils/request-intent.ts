import { getHeader, getMethod, type H3Event } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { resolveAuthRuntimeConfig } from './auth'
import { throwApiError } from './api-errors'

/**
 * Parses only HTTP(S) origins, excluding opaque and malformed values.
 * @param value - Configured URL or request header.
 * @returns The serialized origin when valid.
 */
const parseHttpOrigin = (value: string): string | undefined => {
  try {
    const url = new URL(value)
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) {
      return undefined
    }
    return url.origin
  } catch {
    return undefined
  }
}

/**
 * Requires browser request intent before a protected business mutation.
 * @param event - Current HTTP request.
 * @returns Resolves for safe reads or a trusted mutation source.
 */
export const requireBusinessRequestIntent = async (event: H3Event): Promise<void> => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(getMethod(event))) {
    return
  }

  const origin = getHeader(event, 'origin')
  const referer = getHeader(event, 'referer')
  const isSerializedOrigin = origin === undefined || origin === parseHttpOrigin(origin)
  if (isSerializedOrigin && getHeader(event, 'sec-fetch-site') === 'same-origin') {
    return
  }

  const config = resolveAuthRuntimeConfig(useRuntimeConfig())
  const trustedOrigins = [config.authUrl ?? '', ...(config.authTrustedOrigins?.split(',') ?? [])]
    .map(value => parseHttpOrigin(value.trim()))
    .filter(value => value !== undefined)
  const source = origin ?? referer
  const requestOrigin = source === undefined ? undefined : parseHttpOrigin(source)

  if (isSerializedOrigin && requestOrigin !== undefined
    && trustedOrigins.includes(requestOrigin)) {
    return
  }

  await throwApiError(event, {
    statusCode: 403,
    code: 'REQUEST_ORIGIN_FORBIDDEN',
    key: 'apiErrors.auth.forbidden'
  })
}
