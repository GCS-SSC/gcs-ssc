import { sql, type Kysely } from 'kysely'
import type { Database } from '../../../shared/types/database'

/** Move classification without inferring values or rewriting retained evidence. */
export const up = async (db: Kysely<Database>): Promise<void> => {
  await sql`ALTER TABLE "Funding_Case_Agreement_Applicant_Recipient"
      ADD COLUMN egcs_fc_applicantrecipientsubtype bigint REFERENCES "Agency_Applicant_Recipient_Subtype"(id)`.execute(db)
  await sql`ALTER TABLE "Transfer_Payment_Stream"
      ADD COLUMN egcs_tp_requireconsistentproponenttype boolean NOT NULL DEFAULT false`.execute(db)
}

/** This transition cannot reconstruct a single profile type from relationship types. */
export const down = async (_db: Kysely<Database>): Promise<void> => {
  throw new Error('0018_agreement_proponent_type is forward-only; restore a pre-release backup to roll back')
}
