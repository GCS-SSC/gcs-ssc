/**
 * Returns a safe application-relative post-login target.
 *
 * @param value - Untrusted return value supplied by the route query.
 * @param fallback - Localized application route used when the value is unsafe.
 * @param loginPaths - Localized login paths that must not be used as return targets.
 * @returns The validated application-relative target or the supplied fallback.
 */
export const resolveAuthReturnTarget = (
  value: unknown,
  fallback: string,
  loginPaths: readonly string[]
): string => {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return fallback

  try {
    const parsed = new URL(value, 'http://gcs-ssc.local')
    if (parsed.origin !== 'http://gcs-ssc.local') return fallback
    if (loginPaths.includes(parsed.pathname)) return fallback
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return fallback
  }
}
