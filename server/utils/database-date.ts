import { sql, type RawBuilder } from 'kysely'

/**
 * Writes a calendar date without allowing the process timezone to change its day.
 *
 * @param value - Calendar date to persist.
 * @returns PostgreSQL date expression containing the UTC calendar day.
 */
export const dateOnlySql = (value: Date): RawBuilder<Date> =>
  sql<Date>`${value.toISOString().slice(0, 10)}::date`
