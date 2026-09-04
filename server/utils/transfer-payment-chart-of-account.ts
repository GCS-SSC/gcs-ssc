import type { Kysely, Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'

type DbClient = Kysely<Database> | Transaction<Database>

/**
 * Checks whether an active agreement line references a chart entry.
 *
 * @param db - Active database client or transaction.
 * @param chartOfAccountId - Chart entry to delete.
 * @returns Whether an active agreement line references the chart entry.
 */
export const hasActiveChartOfAccountCommitmentLine = async (
  db: DbClient,
  chartOfAccountId: string
): Promise<boolean> => {
  const activeCommitmentLine = await db
    .selectFrom('Funding_Case_Agreement_Commitment_Line')
    .select('id')
    .where('egcs_fc_transferpaymentstreamchartofaccount', '=', chartOfAccountId)
    .where('_deleted', '=', false)
    .limit(1)
    .executeTakeFirst()
  return Boolean(activeCommitmentLine)
}
