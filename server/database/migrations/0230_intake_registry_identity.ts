import { sql, type Kysely } from 'kysely'
import type { Database } from '../../../shared/types/database'

/** Manual applications use their Common_Entity ID; retain existing external application references. */
const lockSource = async (db: Kysely<Database>, sourceColumn: 'egcs_fi_externalsourceid' | 'egcs_fi_sourcesubmissionid') => {
  await sql.raw(`CREATE OR REPLACE FUNCTION trg_fn_lock_intake_source() RETURNS trigger AS $$
    BEGIN
      IF OLD.egcs_fi_sourcesystem IS DISTINCT FROM NEW.egcs_fi_sourcesystem
        OR OLD.${sourceColumn} IS DISTINCT FROM NEW.${sourceColumn}
        OR OLD.egcs_fi_sourceexport IS DISTINCT FROM NEW.egcs_fi_sourceexport THEN
        RAISE EXCEPTION 'Funding case intake source evidence is immutable' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END;
  $$ LANGUAGE plpgsql`).execute(db)
}

export const up = async (db: Kysely<Database>): Promise<void> => {
  await sql`ALTER TABLE "Funding_Case_Intake_Profile" ALTER COLUMN egcs_fi_applicationid DROP NOT NULL`.execute(db)
  await sql`ALTER TABLE "Funding_Case_Intake_Profile" RENAME COLUMN egcs_fi_sourcesubmissionid TO egcs_fi_externalsourceid`.execute(db)
  await sql`ALTER INDEX fi_idx_source_submission RENAME TO fi_idx_external_source`.execute(db)
  await lockSource(db, 'egcs_fi_externalsourceid')
}

export const down = async (db: Kysely<Database>): Promise<void> => {
  const manual = await db.selectFrom('Funding_Case_Intake_Profile').select('id')
    .where('egcs_fi_applicationid', 'is', null).executeTakeFirst()
  if (manual) throw new Error('Cannot restore required external application references while registry-only applications exist.')
  await sql`ALTER TABLE "Funding_Case_Intake_Profile" ALTER COLUMN egcs_fi_applicationid SET NOT NULL`.execute(db)
  await sql`ALTER TABLE "Funding_Case_Intake_Profile" RENAME COLUMN egcs_fi_externalsourceid TO egcs_fi_sourcesubmissionid`.execute(db)
  await sql`ALTER INDEX fi_idx_external_source RENAME TO fi_idx_source_submission`.execute(db)
  await lockSource(db, 'egcs_fi_sourcesubmissionid')
}
