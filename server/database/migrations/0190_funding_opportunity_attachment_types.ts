import { sql, type Kysely } from 'kysely'
import type { Database } from '../../../shared/types/database'
import { AUDIT_TABLE_OWNERSHIP } from '../audit-ownership-registry'
import { installAuditOwnershipFunctions } from '../audit-ownership-functions'

/** Adds Opportunity-specific attachment requirements without changing existing types or evidence. */
export const up = async (db: Kysely<Database>): Promise<void> => {
  await sql`CREATE TABLE "Funding_Opportunity_Attachment_Type" (
    id bigserial PRIMARY KEY,
    egcs_fo_fundingopportunity bigint NOT NULL REFERENCES "Funding_Opportunity_Profile"(id) ON DELETE RESTRICT,
    egcs_fo_attachmenttype bigint NOT NULL REFERENCES "Common_Attachment_Types"(id) ON DELETE RESTRICT,
    egcs_fo_isinternal boolean NOT NULL DEFAULT false,
    _deleted boolean NOT NULL DEFAULT false
  )`.execute(db)
  await sql`CREATE UNIQUE INDEX fo_idx_attachment_type_active
    ON "Funding_Opportunity_Attachment_Type" (egcs_fo_fundingopportunity, egcs_fo_attachmenttype)
    WHERE _deleted = false`.execute(db)
  await sql`CREATE INDEX fo_idx_attachment_type_type_active
    ON "Funding_Opportunity_Attachment_Type" (egcs_fo_attachmenttype)
    WHERE _deleted = false`.execute(db)
  await installAuditOwnershipFunctions(db)
}

export const down = async (db: Kysely<Database>): Promise<void> => {
  await sql`DROP TABLE "Funding_Opportunity_Attachment_Type"`.execute(db)
  const previousRegistry = { ...AUDIT_TABLE_OWNERSHIP }
  delete previousRegistry['public.Funding_Opportunity_Attachment_Type']
  await installAuditOwnershipFunctions(db, previousRegistry)
}
