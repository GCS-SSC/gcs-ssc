import { betterAuth } from 'better-auth'
import { kyselyAdapter } from '@better-auth/kysely-adapter'
import { useDb } from './db'

const localIpPattern = /^(10(?:\.\d{1,3}){3}|127(?:\.\d{1,3}){3}|169\.254(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}|192\.168(?:\.\d{1,3}){2})$/
type RuntimeConfig = ReturnType<typeof useRuntimeConfig>
type ConfiguredAuthOrigin = { origin: string, port: string, protocol: string }
type RequestOrigin = { hostname: string, origin: string, port: string, protocol: string }

interface ResolvedAuthRuntimeConfig {
  authCookieCacheVersion: string
  authSecret: string | undefined
  authTrustedOrigins: string | undefined
  authUrl: string | undefined
  githubClientId: string
  githubClientSecret: string
}

/**
 * Converts a Railway public hostname into an absolute HTTPS URL.
 *
 * @param hostname - Railway-provided public hostname.
 * @returns Absolute public URL when configured.
 */
const resolveRailwayAuthUrl = (hostname: string | undefined): string | undefined => {
  if (hostname === undefined || hostname.trim().length === 0) {
    return undefined
  }

  const configuredHostname = hostname.trim()
  return configuredHostname.includes('://')
    ? configuredHostname
    : `https://${configuredHostname}`
}

/**
 * Selects a non-empty environment value before its Nuxt runtime fallback.
 *
 * @param environmentValue - Direct process environment value.
 * @param runtimeValue - Nuxt runtime configuration fallback.
 * @returns Trimmed configured value when present.
 */
const resolveConfiguredValue = (
  environmentValue: string | undefined,
  runtimeValue: string | undefined
): string | undefined => {
  if (environmentValue !== undefined && environmentValue.trim().length > 0) {
    return environmentValue.trim()
  }
  if (runtimeValue !== undefined && runtimeValue.trim().length > 0) {
    return runtimeValue.trim()
  }
  return undefined
}

/**
 * Resolves the Better Auth cookie cache version.
 *
 * @param environmentValue - Direct process environment version.
 * @param runtimeValue - Nuxt runtime configuration fallback.
 * @returns Configured version or the stable default.
 */
const resolveCookieCacheVersion = (
  environmentValue: string | undefined,
  runtimeValue: string | undefined
): string => {
  const configuredVersion = resolveConfiguredValue(environmentValue, runtimeValue)
  if (configuredVersion !== undefined) {
    return configuredVersion
  }
  return '1'
}

/**
 * Resolves legacy Better Auth variables at server runtime ahead of Nuxt config.
 *
 * GitHub OAuth credentials remain sourced from Nuxt runtime config so matching
 * `NUXT_GITHUB_CLIENT_ID` and `NUXT_GITHUB_CLIENT_SECRET` variables continue to
 * use Nuxt's runtime replacement.
 *
 * @param runtimeConfig - Nuxt runtime authentication configuration.
 * @param env - Runtime process environment.
 * @returns Authentication configuration used to create Better Auth.
 */
export const resolveAuthRuntimeConfig = (
  runtimeConfig: RuntimeConfig,
  env: NodeJS.ProcessEnv = process.env
): ResolvedAuthRuntimeConfig => {
  const railwayAuthUrl = resolveRailwayAuthUrl(env.RAILWAY_PUBLIC_DOMAIN)

  return {
    authCookieCacheVersion: resolveCookieCacheVersion(
      env.BETTER_AUTH_COOKIE_VERSION,
      runtimeConfig.authCookieCacheVersion
    ),
    authSecret: resolveConfiguredValue(env.BETTER_AUTH_SECRET, runtimeConfig.authSecret),
    authTrustedOrigins: resolveConfiguredValue(
      env.BETTER_AUTH_TRUSTED_ORIGINS,
      runtimeConfig.authTrustedOrigins
    ),
    authUrl: resolveConfiguredValue(
      env.BETTER_AUTH_URL,
      resolveConfiguredValue(runtimeConfig.authUrl, railwayAuthUrl)
    ),
    githubClientId: runtimeConfig.githubClientId,
    githubClientSecret: runtimeConfig.githubClientSecret
  }
}

/**
 * Normalizes a configured Better Auth origin value into an origin string.
 *
 * @param value - Raw configured origin value.
 * @returns A normalized origin array, or an empty array when unset.
 */
const normalizeOrigin = (value: string | undefined): string[] => {
  if (!value) {
    return []
  }

  const trimmedValue = value.trim()

  if (trimmedValue.length === 0) {
    return []
  }

  try {
    const url = new URL(trimmedValue)
    return [url.origin]
  } catch {
    return [trimmedValue]
  }
}

/**
 * Checks whether a hostname is a localhost or private-network development host.
 *
 * @param hostname - Hostname from a URL origin.
 * @returns True when the host is suitable for local development trusted-origin matching.
 */
const isLocalDevelopmentHostname = (hostname: string): boolean => {
  const normalizedHostname = hostname.trim().toLowerCase()

  return normalizedHostname === 'localhost'
    || normalizedHostname === '0.0.0.0'
    || normalizedHostname === '::1'
    || normalizedHostname === '[::1]'
    || localIpPattern.test(normalizedHostname)
}

/**
 * Resolves the configured Better Auth base URL origin and port.
 *
 * @param runtimeConfig - Runtime authentication configuration.
 * @returns Parsed origin details, or null when the auth URL is absent or invalid.
 */
const resolveConfiguredAuthOrigin = (
  runtimeConfig: ResolvedAuthRuntimeConfig
): ConfiguredAuthOrigin | null => {
  if (!runtimeConfig.authUrl) {
    return null
  }

  try {
    const url = new URL(runtimeConfig.authUrl)

    return {
      origin: url.origin,
      port: url.port || (url.protocol === 'https:' ? '443' : '80'),
      protocol: url.protocol
    }
  } catch {
    return null
  }
}

/**
 * Parses a request origin into the fields needed for local trusted-origin matching.
 *
 * @param requestOrigin - Raw request origin header value.
 * @returns Parsed origin details, or null for invalid origin values.
 */
const parseRequestOrigin = (requestOrigin: string): RequestOrigin | null => {
  try {
    const url = new URL(requestOrigin)

    return {
      hostname: url.hostname,
      origin: url.origin,
      port: url.port || (url.protocol === 'https:' ? '443' : '80'),
      protocol: url.protocol
    }
  } catch {
    return null
  }
}

/**
 * Checks whether a request origin can be trusted for local development access.
 *
 * @param requestOrigin - Parsed request origin.
 * @param configuredAuthOrigin - Parsed configured auth origin.
 * @returns True when the origin matches the configured protocol and port on a local host.
 */
const isMatchingLocalDevelopmentOrigin = (
  requestOrigin: RequestOrigin,
  configuredAuthOrigin: ConfiguredAuthOrigin
): boolean => (
  requestOrigin.protocol === configuredAuthOrigin.protocol
  && requestOrigin.port === configuredAuthOrigin.port
  && isLocalDevelopmentHostname(requestOrigin.hostname)
)

/**
 * Resolves the complete trusted-origin list for Better Auth.
 *
 * @param runtimeConfig - Runtime authentication configuration.
 * @returns A deduplicated trusted-origin list, or undefined when none are configured.
 */
const resolveTrustedOrigins = (
  runtimeConfig: ResolvedAuthRuntimeConfig
): string[] | undefined => {
  const trustedOriginValues = [
    runtimeConfig.authUrl,
    ...(runtimeConfig.authTrustedOrigins?.split(',') ?? [])
  ]

  const trustedOrigins = Array.from(new Set(
    trustedOriginValues.flatMap(normalizeOrigin)
  ))

  return trustedOrigins.length > 0 ? trustedOrigins : undefined
}

/**
 * Dynamically resolves trusted origins for Better Auth.
 *
 * In development, this permits local-network access on the same configured port
 * so launching with a custom `--port` and then opening the app via a LAN IP does
 * not trigger Better Auth origin errors.
 *
 * @param runtimeConfig - Runtime authentication configuration.
 * @param request - Better Auth request context when available.
 * @returns The merged trusted-origin list.
 */
const resolveTrustedOriginsForRequest = async (
  runtimeConfig: ResolvedAuthRuntimeConfig,
  request?: Request
): Promise<string[]> => {
  const trustedOrigins = resolveTrustedOrigins(runtimeConfig) ?? []

  if (process.env.NODE_ENV === 'production' || !request) {
    return trustedOrigins
  }

  const requestOrigin = request.headers.get('origin')
  const configuredAuthOrigin = resolveConfiguredAuthOrigin(runtimeConfig)

  if (!requestOrigin || !configuredAuthOrigin) {
    return trustedOrigins
  }

  const requestUrl = parseRequestOrigin(requestOrigin)
  if (!requestUrl) {
    return trustedOrigins
  }

  return isMatchingLocalDevelopmentOrigin(requestUrl, configuredAuthOrigin)
    ? Array.from(new Set([...trustedOrigins, requestUrl.origin]))
    : trustedOrigins
}

/**
 * Creates the Better Auth instance after runtime config and database setup are available.
 *
 * @returns A configured Better Auth instance.
 */
const createAuth = () => {
  const runtimeConfig = resolveAuthRuntimeConfig(useRuntimeConfig())
  const logger = process.env.BETTER_AUTH_DISABLE_LOGGER === 'true'
    ? { disabled: true as const }
    : undefined
  const socialProviders = runtimeConfig.githubClientId && runtimeConfig.githubClientSecret
    ? {
        github: {
          clientId: runtimeConfig.githubClientId,
          clientSecret: runtimeConfig.githubClientSecret
        }
      }
    : undefined

  return betterAuth({
    database: kyselyAdapter(useDb(), {
      type: 'postgres'
    }),
    secret: runtimeConfig.authSecret,
    baseURL: runtimeConfig.authUrl,
    logger,
    trustedOrigins: request => resolveTrustedOriginsForRequest(runtimeConfig, request),
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 15 * 60,
        strategy: 'compact',
        version: runtimeConfig.authCookieCacheVersion
      }
    },
    account: {
      storeStateStrategy: 'cookie',
      storeAccountCookie: true
    },
    emailAndPassword: {
      enabled: true
    },
    // GitHub social login is only active when runtime GitHub OAuth credentials are present.
    // In local/demo environments these may be unset and the login UI is expected to remain disabled.
    socialProviders
  })
}

type AuthInstance = ReturnType<typeof createAuth>

let authInstance: AuthInstance | undefined

/**
 * Lazily resolves the singleton Better Auth instance.
 *
 * @returns The configured Better Auth instance.
 */
const getAuth = (): AuthInstance => {
  if (!authInstance) {
    authInstance = createAuth()
  }

  return authInstance
}

export const auth = new Proxy({} as AuthInstance, {
  get: (_target, property, receiver) => Reflect.get(getAuth(), property, receiver)
})
