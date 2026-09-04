import type { H3Event } from 'h3'
import { badRequest } from '~~/server/utils/api-errors'

export type ConstraintErrorMapping = {
  code: string
  key: string
}

/**
 * Extracts the database constraint name from a Postgres-style error payload.
 *
 * @param error - The raw database error.
 * @returns Constraint name when available.
 */
export const getDatabaseConstraintName = (error: unknown): string | null => {
  if (!error || typeof error !== 'object') return null

  const withConstraint = error as { constraint?: unknown; message?: unknown; detail?: unknown }
  if (typeof withConstraint.constraint === 'string' && withConstraint.constraint.length > 0) {
    return withConstraint.constraint
  }

  const candidates = [withConstraint.message, withConstraint.detail]
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue
    const match = candidate.match(/constraint ["']([^"']+)["']/i)
    if (match?.[1]) return match[1]
  }

  return null
}

/**
 * Throws a mapped API error for known database constraint violations.
 *
 * @param event - Active H3 event.
 * @param error - The caught database error.
 * @param sqlStateCodes - SQLSTATE codes that this mapper should handle.
 * @param mappings - Constraint-name to API-error mapping.
 * @returns Never when a known constraint is matched.
 */
export const throwIfMappedConstraintError = async (
  event: H3Event,
  error: unknown,
  sqlStateCodes: readonly string[],
  mappings: Record<string, ConstraintErrorMapping>
): Promise<never> => {
  if (!error || typeof error !== 'object') throw error

  const maybeCode = (error as { code?: unknown }).code
  if (typeof maybeCode !== 'string' || !sqlStateCodes.includes(maybeCode)) throw error

  const constraintName = getDatabaseConstraintName(error)
  if (!constraintName) throw error

  const mapped = mappings[constraintName]
  if (!mapped) throw error

  return await badRequest(event, mapped.code, mapped.key)
}
