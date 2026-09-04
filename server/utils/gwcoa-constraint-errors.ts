import type { H3Event } from 'h3'
import { throwIfMappedConstraintError } from '~~/server/utils/database-constraint-errors'

/**
 * Maps expected GWCOA uniqueness conflicts to the stable bilingual API contract.
 *
 * @param event - Active request event.
 * @param error - Database error raised by the attempted mutation.
 * @returns The mapped API response; unexpected failures are rethrown.
 */
export const throwIfGwcoaConstraintError = async (event: H3Event, error: unknown): Promise<never> =>
  await throwIfMappedConstraintError(event, error, ['23505'], {
    cn_uq_gwcoa_number: {
      code: 'GWCOA_DUPLICATE_NUMBER',
      key: 'apiErrors.agency.duplicate_gwcoa_number'
    }
  })
