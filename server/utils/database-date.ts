import { sql, type RawBuilder } from 'kysely'

/**
 * Writes a calendar date without allowing the process timezone to change its day.
 *
 * @param value - Calendar date to persist.
 * @returns PostgreSQL date expression containing the UTC calendar day.
 */
export const dateOnlySql = (value: Date): RawBuilder<Date> => {
  // ISO uses signed six-digit years outside 0000..9999; truncating that text
  // loses the day. PostgreSQL represents astronomical year zero as 1 BC.
  const year = value.getUTCFullYear()
  const calendarYear = String(year > 0 ? year : 1 - year).padStart(4, '0')
  const month = String(value.getUTCMonth() + 1).padStart(2, '0')
  const day = String(value.getUTCDate()).padStart(2, '0')
  const calendar = `${calendarYear}-${month}-${day}${year > 0 ? '' : ' BC'}`
  return sql<Date>`${calendar}::date`
}
