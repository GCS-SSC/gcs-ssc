/* eslint-disable jsdoc/require-jsdoc -- Scoped reporting shares the Correction collection contract. */
import { sql, type Kysely } from 'kysely'
import { z } from 'zod'
import type { Database } from '~~/shared/types/database'
import { PaginationSchema, PositivePostgresBigintIdSchema } from '~~/shared/types/schemas'
import { escapeLikePattern } from './sql-like'

export const CorrectionCollectionQuerySchema = PaginationSchema.extend({
  egcs_fc_outcome: z.enum(['open', 'posted', 'denied', 'failed', 'cancelled']).optional(),
  egcs_fc_agencyfiscalyear: PositivePostgresBigintIdSchema.optional()
})

export const correctionCollectionQuery = (db: Kysely<Database>, agreementId: string,
  input: z.infer<typeof CorrectionCollectionQuerySchema>) => {
  let query = db.selectFrom('Funding_Case_Agreement_Correction as correction')
    .where('correction.egcs_fc_fundingagreement', '=', agreementId).where('correction._deleted', '=', false)
  if (input.egcs_fc_outcome) query = query.where('correction.egcs_fc_outcome', '=', input.egcs_fc_outcome)
  if (input.egcs_fc_agencyfiscalyear) query = query.where(eb => eb.exists(eb.selectFrom('Funding_Case_Agreement_Correction_Line as line')
    .select('line.id').whereRef('line.egcs_fc_correction', '=', 'correction.id')
    .where('line.egcs_fc_agencyfiscalyear', '=', input.egcs_fc_agencyfiscalyear!).where('line._deleted', '=', false)))
  if (input.search) query = query.where(eb => eb.or([
    eb('correction.egcs_fc_agreementnumber', 'ilike', `%${escapeLikePattern(input.search!)}%`),
    eb('correction.egcs_fc_narrative_en', 'ilike', `%${escapeLikePattern(input.search!)}%`),
    eb('correction.egcs_fc_narrative_fr', 'ilike', `%${escapeLikePattern(input.search!)}%`),
    sql<boolean>`correction.egcs_fc_number::text ILIKE ${`%${escapeLikePattern(input.search!)}%`}`]))
  return query
}

export const correctionCsvCell = (value: unknown): string => {
  const text = value === null || value === undefined ? '' : String(value)
  // Spreadsheet formula-like authored text is exported as literal evidence.
  const literal = /^[=+\-@\t\r]/.test(text) && !/^-?\d+\.\d{2}$/.test(text) ? `'${text}` : text
  return `"${literal.replace(/"/g, '""')}"`
}
