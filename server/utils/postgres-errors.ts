const UNIQUE_VIOLATION_CODE = '23505'

/**
 * Detects a PostgreSQL unique-constraint violation by SQLSTATE.
 *
 * @param error - Unknown caught error.
 * @returns `true` when the error is a unique-constraint violation.
 */
export const isUniqueConstraintError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') {
    return false
  }

  return (error as { code?: unknown }).code === UNIQUE_VIOLATION_CODE
}
