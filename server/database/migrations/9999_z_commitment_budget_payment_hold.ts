import { sql, type Kysely } from 'kysely'

/** Removes obsolete budget-side Commitment caps without changing retained business data. */
export const up = async (db: Kysely<unknown>): Promise<void> => {
  await sql`DROP TRIGGER IF EXISTS trg_enforce_budget_line_commitment_program_funding_total
    ON "Funding_Case_Agreement_Budget_Line_Item"`.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_enforce_budget_version_commitment_program_funding_total
    ON "Funding_Case_Agreement_Budget_Version"`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_enforce_budget_line_commitment_program_funding_total()`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_enforce_budget_version_commitment_program_funding_total()`.execute(db)
}
