/**
 * Allows the localized service-unavailable contract through while hiding provider details.
 * @param error - Better Auth or fetch error.
 * @param fallback - Safe localized login failure message.
 * @returns Public service message or the generic login failure.
 */
export const resolveLoginError = (error: unknown, fallback: string): string => {
  if (!error || typeof error !== 'object') return fallback
  const payload = error as Record<string, unknown>
  if (payload.code === 'HEALTH_UNAVAILABLE' && typeof payload.message === 'string') return payload.message
  if (payload.data && typeof payload.data === 'object') return resolveLoginError(payload.data, fallback)
  return fallback
}
