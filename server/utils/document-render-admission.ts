const activeRenders = new Map<string, number>()
const MAX_ACTIVE_RENDERS_PER_PRINCIPAL = 2

/**
 * Acquires one bounded in-process render slot for a tenant/user principal.
 * @param agencyId Tenant Agency identifier.
 * @param userId Authenticated user identifier.
 * @returns Idempotent release callback, or null when the ceiling is reached.
 */
export const acquireDocumentRenderSlot = (agencyId: string, userId: string): (() => void) | null => {
  const key = `${agencyId}:${userId}`
  const active = activeRenders.get(key) ?? 0
  if (active >= MAX_ACTIVE_RENDERS_PER_PRINCIPAL) return null
  activeRenders.set(key, active + 1)
  let released = false
  return () => {
    if (released) return
    released = true
    const remaining = (activeRenders.get(key) ?? 1) - 1
    if (remaining > 0) activeRenders.set(key, remaining)
    else activeRenders.delete(key)
  }
}
