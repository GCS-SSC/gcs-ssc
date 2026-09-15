import { sql, type Kysely } from 'kysely'
import type { Database } from '../../../shared/types/database'

export const up = async (db: Kysely<Database>): Promise<void> => {
  await db.schema.alterTable('Transfer_Payment_Profile')
    .addColumn('egcs_tp_tclink_en', 'varchar(2000)')
    .addColumn('egcs_tp_tclink_fr', 'varchar(2000)').execute()
  // Preserve the existing destination in both languages, including retired programs.
  await sql`UPDATE "Transfer_Payment_Profile"
    SET egcs_tp_tclink_en = egcs_tp_tclink, egcs_tp_tclink_fr = egcs_tp_tclink`.execute(db)
  await db.schema.alterTable('Transfer_Payment_Profile')
    .alterColumn('egcs_tp_tclink_en', col => col.setNotNull())
    .alterColumn('egcs_tp_tclink_fr', col => col.setNotNull()).execute()

  // Historical migrations are immutable. The unchanged seed still inserts the old
  // column on fresh installations; current API writes require both new columns.
  await sql`
    CREATE FUNCTION program_terms_legacy_insert() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.egcs_tp_tclink IS NOT NULL THEN
        NEW.egcs_tp_tclink_en := COALESCE(NEW.egcs_tp_tclink_en, NEW.egcs_tp_tclink);
        NEW.egcs_tp_tclink_fr := COALESCE(NEW.egcs_tp_tclink_fr, NEW.egcs_tp_tclink);
      ELSE
        NEW.egcs_tp_tclink := NEW.egcs_tp_tclink_en;
      END IF;
      RETURN NEW;
    END;
    $$
  `.execute(db)
  await sql`
    CREATE TRIGGER program_terms_legacy_insert
      BEFORE INSERT ON "Transfer_Payment_Profile"
      FOR EACH ROW EXECUTE FUNCTION program_terms_legacy_insert();
  `.execute(db)
}

// Deliberately forward-only: collapsing independently authored URLs would lose data.
