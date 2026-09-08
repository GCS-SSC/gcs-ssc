import type { H3Event } from 'h3'
import { throwApiError } from '~~/server/utils/api-errors'
import { getDatabaseConstraintName, throwIfMappedConstraintError } from '~~/server/utils/database-constraint-errors'

/**
 * Maps expected GWCOA uniqueness and Agency reference conflicts to the stable bilingual API contract.
 *
 * @param event - Active request event.
 * @param error - Database error raised by the attempted mutation.
 * @returns The mapped API response; unexpected failures are rethrown.
 */
export const throwIfGwcoaConstraintError = async (event: H3Event, error: unknown): Promise<never> => {
  if (error && typeof error === 'object' && 'code' in error
    && error.code === '23503' && getDatabaseConstraintName(error) === 'ay_ref_profilegwcoanumber') {
    return await throwApiError(event, {
      statusCode: 409,
      code: 'GWCOA_NUMBER_IN_USE',
      key: 'apiErrors.agency.gwcoa_number_in_use'
    })
  }
  return await throwIfMappedConstraintError(event, error, ['23505'], {
    cn_uq_gwcoa_number: {
      code: 'GWCOA_DUPLICATE_NUMBER',
      key: 'apiErrors.agency.duplicate_gwcoa_number'
    }
  })
}
