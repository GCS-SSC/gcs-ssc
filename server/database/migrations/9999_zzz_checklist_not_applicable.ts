import { sql, type Kysely } from 'kysely'

export const up = async (db: Kysely<unknown>): Promise<void> => {
  await sql`ALTER TYPE "Checklist_Answer" ADD VALUE IF NOT EXISTS 'not_applicable'`.execute(db)
}

// Forward-only: retained responses and immutable evidence may reference this value.
export const down = async (): Promise<void> => {
  throw new Error('Checklist N/A answers are forward-only; recorded answers cannot be removed or reinterpreted.')
}
