import { sql, type Kysely } from 'kysely'
import type { Database } from '../../../shared/types/database'

/** Retains the immutable source identity and export for externally received intakes. */
export const up = async (db: Kysely<Database>): Promise<void> => {
  await sql`ALTER TABLE "Funding_Case_Intake_Profile"
    ADD COLUMN egcs_fi_sourcesystem varchar(100),
    ADD COLUMN egcs_fi_sourcesubmissionid varchar(255),
    ADD COLUMN egcs_fi_sourceexport jsonb`.execute(db)
  await sql`ALTER TABLE "Funding_Case_Intake_Profile"
    ADD CONSTRAINT fi_chk_source_contract CHECK (
      (egcs_fi_sourcesystem IS NULL AND egcs_fi_sourcesubmissionid IS NULL AND egcs_fi_sourceexport IS NULL)
      OR (egcs_fi_sourcesystem IS NOT NULL AND length(btrim(egcs_fi_sourcesystem)) > 0
        AND egcs_fi_sourcesubmissionid IS NOT NULL AND length(btrim(egcs_fi_sourcesubmissionid)) > 0
        AND egcs_fi_sourceexport IS NOT NULL AND jsonb_typeof(egcs_fi_sourceexport) = 'object')
    )`.execute(db)
  await sql`CREATE UNIQUE INDEX fi_idx_source_submission ON "Funding_Case_Intake_Profile"
    (egcs_fi_sourcesystem, egcs_fi_sourcesubmissionid)
    WHERE egcs_fi_sourcesystem IS NOT NULL`.execute(db)
  await sql`CREATE FUNCTION trg_fn_lock_intake_source() RETURNS trigger AS $$
    BEGIN
      IF OLD.egcs_fi_sourcesystem IS DISTINCT FROM NEW.egcs_fi_sourcesystem
        OR OLD.egcs_fi_sourcesubmissionid IS DISTINCT FROM NEW.egcs_fi_sourcesubmissionid
        OR OLD.egcs_fi_sourceexport IS DISTINCT FROM NEW.egcs_fi_sourceexport THEN
        RAISE EXCEPTION 'Funding case intake source evidence is immutable' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END;
  $$ LANGUAGE plpgsql`.execute(db)
  await sql`CREATE TRIGGER trg_lock_intake_source BEFORE UPDATE ON "Funding_Case_Intake_Profile"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_lock_intake_source()`.execute(db)
}

export const down = async (db: Kysely<Database>): Promise<void> => {
  const imported = await db.selectFrom('Funding_Case_Intake_Profile').select('id')
    .where('egcs_fi_sourcesystem', 'is not', null).executeTakeFirst()
  if (imported) throw new Error('Cannot remove the external Intake contract while source evidence exists.')
  await sql`DROP TRIGGER trg_lock_intake_source ON "Funding_Case_Intake_Profile"`.execute(db)
  await sql`DROP FUNCTION trg_fn_lock_intake_source()`.execute(db)
  await sql`DROP INDEX fi_idx_source_submission`.execute(db)
  await sql`ALTER TABLE "Funding_Case_Intake_Profile" DROP CONSTRAINT fi_chk_source_contract`.execute(db)
  await sql`ALTER TABLE "Funding_Case_Intake_Profile"
    DROP COLUMN egcs_fi_sourceexport,
    DROP COLUMN egcs_fi_sourcesubmissionid,
    DROP COLUMN egcs_fi_sourcesystem`.execute(db)
}
