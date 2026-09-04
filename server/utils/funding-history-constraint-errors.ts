import type { H3Event } from 'h3'
import { throwIfMappedConstraintError, type ConstraintErrorMapping } from '~~/server/utils/database-constraint-errors'

const CONSTRAINT_ERROR_MAP: Record<string, ConstraintErrorMapping> = {
  ar_idx_fundinghistoryrecipienthistoryrecipient: {
    code: 'FUNDING_HISTORY_DUPLICATE_RECIPIENT',
    key: 'apiErrors.funding_history.duplicate_recipient'
  }
}

export const throwIfFundingHistoryConstraintError = async (event: H3Event, error: unknown): Promise<never> =>
  await throwIfMappedConstraintError(event, error, ['23505', '23514'], CONSTRAINT_ERROR_MAP)
