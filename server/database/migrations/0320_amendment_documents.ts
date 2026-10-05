import { sql, type Kysely } from 'kysely'
import type { Database } from '../../../shared/types/database'

/** Adds Amendment-scoped artifacts without reclassifying existing Agreement or Closeout documents. */
export const up = async (db: Kysely<Database>): Promise<void> => {
  await sql`ALTER TABLE "Agency_Document_Template" DROP CONSTRAINT ay_chk_documenttemplate_entitytype`.execute(db)
  await sql`ALTER TABLE "Agency_Document_Template" ADD CONSTRAINT ay_chk_documenttemplate_entitytype
    CHECK (egcs_ay_entitytype IN ('fundingcaseagreement', 'fundingcaseagreementcloseout', 'fundingcaseamendment'))`.execute(db)
  await sql`ALTER TABLE "Funding_Case_Agreement_Generated_Document"
    ADD COLUMN egcs_fc_amendment bigint,
    ADD CONSTRAINT fc_ref_generateddocumentamendmentagreement FOREIGN KEY (egcs_fc_amendment, egcs_fc_fundingagreement)
      REFERENCES "Funding_Case_Agreement_Amendment"(id, egcs_fc_fundingagreement) ON DELETE RESTRICT,
    ADD CONSTRAINT fc_chk_generateddocumentscope CHECK (num_nonnulls(egcs_fc_closeout, egcs_fc_amendment) <= 1)`.execute(db)
  await sql`CREATE INDEX fc_idx_generateddocumentamendment
    ON "Funding_Case_Agreement_Generated_Document" (egcs_fc_amendment, egcs_fc_generatedat DESC, id)
    WHERE NOT _deleted AND egcs_fc_amendment IS NOT NULL`.execute(db)
}

/** Refuses a rollback that would discard Amendment identity or make authored templates unsupported. */
export const down = async (db: Kysely<Database>): Promise<void> => {
  await sql`DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Generated_Document" WHERE egcs_fc_amendment IS NOT NULL)
      OR EXISTS (SELECT 1 FROM "Agency_Document_Template" WHERE egcs_ay_entitytype = 'fundingcaseamendment') THEN
      RAISE EXCEPTION 'Cannot remove Amendment document support while retained Amendment documents or templates exist';
    END IF;
  END $$`.execute(db)
  await sql`DROP INDEX fc_idx_generateddocumentamendment`.execute(db)
  await sql`ALTER TABLE "Funding_Case_Agreement_Generated_Document"
    DROP CONSTRAINT fc_chk_generateddocumentscope,
    DROP CONSTRAINT fc_ref_generateddocumentamendmentagreement,
    DROP COLUMN egcs_fc_amendment`.execute(db)
  await sql`ALTER TABLE "Agency_Document_Template" DROP CONSTRAINT ay_chk_documenttemplate_entitytype`.execute(db)
  await sql`ALTER TABLE "Agency_Document_Template" ADD CONSTRAINT ay_chk_documenttemplate_entitytype
    CHECK (egcs_ay_entitytype IN ('fundingcaseagreement', 'fundingcaseagreementcloseout'))`.execute(db)
}
