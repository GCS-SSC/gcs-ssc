import type { H3Event } from 'h3'
import { sql, type Expression } from 'kysely'
import { z } from 'zod'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { RECENT_RECORD_HEADERS, RECENT_RECORDS_LIMIT } from '~~/shared/utils/recent-records'
import { parseI18n } from './api-validate'

const RecentRecordIdsHeaderSchema = z
  .string({ error: 'validation.invalid_selection' })
  .max(RECENT_RECORDS_LIMIT * 20 - 1, { error: 'validation.invalid_selection' })
  .transform(value => value.split(','))
  .refine(ids => ids.length <= RECENT_RECORDS_LIMIT && ids.every(isPositivePostgresBigintText), { error: 'validation.invalid_selection' })

/**
 * Parses the transient sort hint without putting it in audited URL parameters.
 * @param event Authenticated request.
 * @param resource Kind of record to rank.
 * @returns IDs in most-recent-first order.
 */
export const readRecentRecordIds = async (event: H3Event, resource: keyof typeof RECENT_RECORD_HEADERS): Promise<string[]> => {
  const header = event.headers?.get(RECENT_RECORD_HEADERS[resource])
  return header == null ? [] : await parseI18n(event, RecentRecordIdsHeaderSchema, header)
}

/**
 * Ranks returned rows by their position in the hint, with unranked rows last.
 * @param id Row identifier expression.
 * @param recentIds Validated IDs in most-recent-first order.
 * @returns SQL ordering expression.
 */
export const recentRecordRank = (id: Expression<unknown>, recentIds: readonly string[]) =>
  sql<number | null>`array_position(${`{${recentIds.join(',')}}`}, ${id})`
