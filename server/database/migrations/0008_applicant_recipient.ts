import type { Kysely, SqlBool } from 'kysely'
import { sql } from 'kysely'
import type { Database } from '../../../shared/types/database'
import { REGISTRY_TYPE_ENUM } from '../../../shared/constants/enums'

export const up = async (db: Kysely<Database>): Promise<void> => {
  await sql`CREATE TYPE Registry_Type AS ENUM (${sql.join(REGISTRY_TYPE_ENUM.map(value => sql.lit(value)))})`.execute(db)

  await db.schema
    .createTable('Applicant_Recipient_Profile')
    .addColumn('id', 'bigint', col => col.primaryKey())
    .addColumn('egcs_ar_description_en', 'text')
    .addColumn('egcs_ar_description_fr', 'text')
    .addColumn('egcs_ar_operatingname_en', 'varchar(255)')
    .addColumn('egcs_ar_operatingname_fr', 'varchar(255)')
    .addColumn('egcs_ar_applicantrecipientsubtypes', 'bigint', col =>
      col.notNull().references('Agency_Applicant_Recipient_Subtype.id').onDelete('restrict')
    )
    .addColumn('egcs_ar_leadagency', 'bigint', col => col.references('Agency_Profile.id').onDelete('restrict'))
    .addColumn('egcs_ar_legalname_en', 'varchar(255)')
    .addColumn('egcs_ar_legalname_fr', 'varchar(255)')
    .addColumn('egcs_ar_researchorganization_en', 'varchar(255)')
    .addColumn('egcs_ar_researchorganization_fr', 'varchar(255)')
    .addColumn('egcs_ar_active', 'boolean', col => col.notNull().defaultTo(false))
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .addCheckConstraint(
      'ar_chk_profile_description_language',
      sql`NULLIF(BTRIM(egcs_ar_description_en), '') IS NOT NULL OR NULLIF(BTRIM(egcs_ar_description_fr), '') IS NOT NULL`
    )
    .addCheckConstraint(
      'ar_chk_profile_operatingname_language',
      sql`NULLIF(BTRIM(egcs_ar_operatingname_en), '') IS NOT NULL OR NULLIF(BTRIM(egcs_ar_operatingname_fr), '') IS NOT NULL`
    )
    .addCheckConstraint(
      'ar_chk_profile_legalname_language',
      sql`NULLIF(BTRIM(egcs_ar_legalname_en), '') IS NOT NULL OR NULLIF(BTRIM(egcs_ar_legalname_fr), '') IS NOT NULL`
    )
    .execute()

  await sql`
    ALTER TABLE "Applicant_Recipient_Profile"
      ADD CONSTRAINT ar_ref_profileid
      FOREIGN KEY (id)
      REFERENCES "Common_Entity"(id)
      ON DELETE RESTRICT
  `.execute(db)

  await db.schema
    .createTable('Applicant_Recipient_Registry')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_ar_applicantrecipient', 'bigint', col =>
      col.notNull().references('Applicant_Recipient_Profile.id').onDelete('restrict')
    )
    .addColumn('egcs_ar_number', 'text', col => col.notNull())
    .addColumn('egcs_ar_registry', sql`Registry_Type`, col => col.notNull())
    .addColumn('egcs_ar_othercomment', 'text')
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .addCheckConstraint(
      'ar_chk_registry_number_format',
      sql`CASE
        WHEN egcs_ar_registry = 'federalbusinessnumber' THEN egcs_ar_number ~ '^[0-9]{9}$'
        WHEN egcs_ar_registry = 'craprogramaccountnumber' THEN egcs_ar_number ~ '^[0-9]{15}$'
        WHEN egcs_ar_registry = 'naics' THEN egcs_ar_number ~ '^[0-9]{2,6}$'
        ELSE TRUE
      END`
    )
    .addCheckConstraint(
      'ar_chk_registry_othercomment',
      sql`(egcs_ar_registry = 'other' AND NULLIF(BTRIM(egcs_ar_othercomment), '') IS NOT NULL) OR egcs_ar_registry <> 'other'`
    )
    .execute()

  await db.schema
    .createIndex('ar_idx_registryregistrynumber')
    .on('Applicant_Recipient_Registry')
    .columns(['egcs_ar_registry', 'egcs_ar_number'])
    .where(sql<SqlBool>`_deleted = false`)
    .unique()
    .execute()

  await db.schema
    .createTable('Applicant_Recipient_Agency_Financial_Id')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_ar_applicantrecipient', 'bigint', col =>
      col.notNull().references('Applicant_Recipient_Profile.id').onDelete('restrict')
    )
    .addColumn('egcs_ar_agency', 'bigint', col => col.references('Agency_Profile.id').onDelete('restrict'))
    .addColumn('egcs_ar_financialsystemid', 'bigint', col => col.notNull())
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .execute()

  await db.schema
    .createIndex('ar_idx_agencyfinancialidagencyfinancialsystemid')
    .on('Applicant_Recipient_Agency_Financial_Id')
    .columns(['egcs_ar_agency', 'egcs_ar_applicantrecipient', 'egcs_ar_financialsystemid'])
    .where(sql<SqlBool>`_deleted = false`)
    .unique()
    .execute()

  await db.schema
    .createTable('Applicant_Recipient_Other_Name')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_ar_othername', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_ar_applicantrecipient', 'bigint', col =>
      col.notNull().references('Applicant_Recipient_Profile.id').onDelete('restrict')
    )
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .execute()

  await db.schema
    .createIndex('ar_idx_othernameothername')
    .on('Applicant_Recipient_Other_Name')
    .columns(['egcs_ar_applicantrecipient', 'egcs_ar_othername'])
    .where(sql<SqlBool>`_deleted = false`)
    .unique()
    .execute()

  await db.schema
    .createTable('Applicant_Recipient_Address')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_ar_applicantrecipient', 'bigint', col =>
      col.notNull().references('Applicant_Recipient_Profile.id').onDelete('restrict')
    )
    .addColumn('egcs_ar_address', 'bigint', col =>
      col.notNull().references('Common_Address.id').onDelete('restrict')
    )
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .execute()

  await db.schema
    .createIndex('ar_idx_addressaddress')
    .on('Applicant_Recipient_Address')
    .columns(['egcs_ar_applicantrecipient', 'egcs_ar_address'])
    .where(sql<SqlBool>`_deleted = false`)
    .unique()
    .execute()

  await db.schema
    .createTable('Applicant_Recipient_Contact')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_ar_applicantrecipient', 'bigint', col =>
      col.notNull().references('Applicant_Recipient_Profile.id').onDelete('restrict')
    )
    .addColumn('egcs_ar_contact', 'bigint', col =>
      col.notNull().references('Common_Contact.id').onDelete('restrict')
    )
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .execute()

  await db.schema
    .createIndex('ar_idx_contactcontact')
    .on('Applicant_Recipient_Contact')
    .columns(['egcs_ar_applicantrecipient', 'egcs_ar_contact'])
    .where(sql<SqlBool>`_deleted = false`)
    .unique()
    .execute()

  await db.schema
    .createTable('Applicant_Recipient_Funding_History')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_ar_agencyname_en', 'varchar(255)')
    .addColumn('egcs_ar_agencyname_fr', 'varchar(255)')
    .addColumn('egcs_ar_programname_en', 'varchar(255)')
    .addColumn('egcs_ar_programname_fr', 'varchar(255)')
    .addColumn('egcs_ar_agreementnumber', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_ar_title_en', 'varchar(255)')
    .addColumn('egcs_ar_title_fr', 'varchar(255)')
    .addColumn('egcs_ar_description_en', 'text')
    .addColumn('egcs_ar_description_fr', 'text')
    .addColumn('egcs_ar_startdate', 'date', col => col.notNull())
    .addColumn('egcs_ar_enddate', 'date', col => col.notNull())
    .addColumn('egcs_ar_fundingamount', 'numeric(19, 2)', col => col.notNull())
    .addColumn('egcs_ar_currency', sql`currency_codes`, col => col.notNull())
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .addCheckConstraint(
      'ar_chk_fundinghistory_agency_language',
      sql`NULLIF(BTRIM(egcs_ar_agencyname_en), '') IS NOT NULL OR NULLIF(BTRIM(egcs_ar_agencyname_fr), '') IS NOT NULL`
    )
    .addCheckConstraint(
      'ar_chk_fundinghistory_program_language',
      sql`NULLIF(BTRIM(egcs_ar_programname_en), '') IS NOT NULL OR NULLIF(BTRIM(egcs_ar_programname_fr), '') IS NOT NULL`
    )
    .addCheckConstraint(
      'ar_chk_fundinghistory_agreementnumber',
      sql`NULLIF(BTRIM(egcs_ar_agreementnumber), '') IS NOT NULL`
    )
    .addCheckConstraint(
      'ar_chk_fundinghistory_title_language',
      sql`NULLIF(BTRIM(egcs_ar_title_en), '') IS NOT NULL OR NULLIF(BTRIM(egcs_ar_title_fr), '') IS NOT NULL`
    )
    .addCheckConstraint(
      'ar_chk_fundinghistory_description_language',
      sql`NULLIF(BTRIM(egcs_ar_description_en), '') IS NOT NULL OR NULLIF(BTRIM(egcs_ar_description_fr), '') IS NOT NULL`
    )
    .addCheckConstraint('ar_chk_fundinghistory_dates', sql`egcs_ar_enddate >= egcs_ar_startdate`)
    .addCheckConstraint('ar_chk_fundinghistory_amount', sql`egcs_ar_fundingamount >= 0`)
    .execute()

  await db.schema
    .createTable('Applicant_Recipient_Funding_History_Recipient')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_ar_fundinghistory', 'bigint', col =>
      col.notNull().references('Applicant_Recipient_Funding_History.id').onDelete('restrict')
    )
    .addColumn('egcs_ar_applicantrecipient', 'bigint', col =>
      col.notNull().references('Applicant_Recipient_Profile.id').onDelete('restrict')
    )
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .execute()

  await sql`
    CREATE UNIQUE INDEX ar_idx_fundinghistoryrecipienthistoryrecipient
    ON "Applicant_Recipient_Funding_History_Recipient" (
      egcs_ar_fundinghistory,
      egcs_ar_applicantrecipient
    )
    WHERE _deleted = false
  `.execute(db)

  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_soft_delete_unlinked_funding_history()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $function$
    BEGIN
      IF OLD._deleted = false AND NEW._deleted = true AND NOT EXISTS (
        SELECT 1
        FROM "Applicant_Recipient_Funding_History_Recipient" recipient
        WHERE recipient.egcs_ar_fundinghistory = NEW.egcs_ar_fundinghistory
          AND recipient._deleted = false
      ) THEN
        UPDATE "Applicant_Recipient_Funding_History"
        SET _deleted = true
        WHERE id = NEW.egcs_ar_fundinghistory
          AND _deleted = false;
      END IF;
      RETURN NEW;
    END
    $function$
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_soft_delete_unlinked_funding_history
    AFTER UPDATE OF _deleted
    ON "Applicant_Recipient_Funding_History_Recipient"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_soft_delete_unlinked_funding_history()
  `.execute(db)

  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_enforce_funding_history_recipient_roster()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $function$
    DECLARE
      history_id bigint;
      history_deleted boolean;
    BEGIN
      FOR history_id IN
        SELECT DISTINCT candidate_id
        FROM unnest(ARRAY[
          CASE
            WHEN TG_TABLE_NAME = 'Applicant_Recipient_Funding_History'
              THEN COALESCE(
                (to_jsonb(NEW) ->> 'id')::bigint,
                (to_jsonb(OLD) ->> 'id')::bigint
              )
            ELSE COALESCE(
              (to_jsonb(NEW) ->> 'egcs_ar_fundinghistory')::bigint,
              (to_jsonb(OLD) ->> 'egcs_ar_fundinghistory')::bigint
            )
          END,
          CASE
            WHEN TG_TABLE_NAME = 'Applicant_Recipient_Funding_History_Recipient'
              AND TG_OP = 'UPDATE'
              AND (to_jsonb(NEW) ->> 'egcs_ar_fundinghistory')::bigint
                IS DISTINCT FROM (to_jsonb(OLD) ->> 'egcs_ar_fundinghistory')::bigint
              THEN (to_jsonb(OLD) ->> 'egcs_ar_fundinghistory')::bigint
            ELSE NULL
          END
        ]) AS candidate_id
        WHERE candidate_id IS NOT NULL
        ORDER BY candidate_id
      LOOP
        SELECT funding_history._deleted
        INTO history_deleted
        FROM "Applicant_Recipient_Funding_History" funding_history
        WHERE funding_history.id = history_id
        FOR UPDATE;

        IF FOUND AND history_deleted = false AND NOT EXISTS (
          SELECT 1
          FROM "Applicant_Recipient_Funding_History_Recipient" recipient
          WHERE recipient.egcs_ar_fundinghistory = history_id
            AND recipient._deleted = false
        ) THEN
          RAISE EXCEPTION 'active funding history requires at least one active recipient'
            USING ERRCODE = 'check_violation',
              CONSTRAINT = 'ar_chk_fundinghistory_recipient_roster';
        END IF;
      END LOOP;

      RETURN NULL;
    END
    $function$
  `.execute(db)
  await sql`
    CREATE CONSTRAINT TRIGGER trg_enforce_funding_history_recipient_roster_from_history
    AFTER INSERT OR UPDATE OR DELETE ON "Applicant_Recipient_Funding_History"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
    EXECUTE FUNCTION trg_fn_enforce_funding_history_recipient_roster()
  `.execute(db)
  await sql`
    CREATE CONSTRAINT TRIGGER trg_enforce_funding_history_recipient_roster_from_recipient
    AFTER INSERT OR UPDATE OR DELETE ON "Applicant_Recipient_Funding_History_Recipient"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
    EXECUTE FUNCTION trg_fn_enforce_funding_history_recipient_roster()
  `.execute(db)

  await sql`DROP TRIGGER IF EXISTS trg_register_applicantrecipient ON "Applicant_Recipient_Profile"`.execute(db)
  await sql`
    CREATE TRIGGER trg_register_applicantrecipient
    BEFORE INSERT ON "Applicant_Recipient_Profile"
    FOR EACH ROW EXECUTE FUNCTION register_entity('applicantrecipient');
  `.execute(db)
  await sql`
    CREATE CONSTRAINT TRIGGER trg_enforce_applicantrecipient_assignment_roster
    AFTER INSERT OR UPDATE OF _deleted ON "Applicant_Recipient_Profile"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
    EXECUTE FUNCTION trg_fn_enforce_assignable_entity_roster('applicantrecipient')
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_soft_delete_applicantrecipient_assignments
    AFTER UPDATE OF _deleted ON "Applicant_Recipient_Profile" FOR EACH ROW
    EXECUTE FUNCTION trg_fn_soft_delete_entity_assignments('applicantrecipient')
  `.execute(db)
}

export const down = async (db: Kysely<Database>): Promise<void> => {
  await sql`DROP TRIGGER IF EXISTS trg_soft_delete_applicantrecipient_assignments ON "Applicant_Recipient_Profile"`.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_enforce_applicantrecipient_assignment_roster ON "Applicant_Recipient_Profile"`.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_register_applicantrecipient ON "Applicant_Recipient_Profile"`.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_enforce_funding_history_recipient_roster_from_recipient ON "Applicant_Recipient_Funding_History_Recipient"`.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_enforce_funding_history_recipient_roster_from_history ON "Applicant_Recipient_Funding_History"`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_enforce_funding_history_recipient_roster()`.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_soft_delete_unlinked_funding_history ON "Applicant_Recipient_Funding_History_Recipient"`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_soft_delete_unlinked_funding_history()`.execute(db)
  await db.schema.dropIndex('ar_idx_fundinghistoryrecipienthistoryrecipient').execute()
  await db.schema.dropTable('Applicant_Recipient_Funding_History_Recipient').execute()
  await db.schema.dropTable('Applicant_Recipient_Funding_History').execute()
  await db.schema.dropIndex('ar_idx_contactcontact').execute()
  await db.schema.dropTable('Applicant_Recipient_Contact').execute()
  await db.schema.dropIndex('ar_idx_addressaddress').execute()
  await db.schema.dropTable('Applicant_Recipient_Address').execute()
  await db.schema.dropIndex('ar_idx_othernameothername').execute()
  await db.schema.dropTable('Applicant_Recipient_Other_Name').execute()
  await db.schema.dropIndex('ar_idx_agencyfinancialidagencyfinancialsystemid').execute()
  await db.schema.dropTable('Applicant_Recipient_Agency_Financial_Id').execute()
  await db.schema.dropIndex('ar_idx_registryregistrynumber').execute()
  await db.schema.dropTable('Applicant_Recipient_Registry').execute()
  await db.schema.dropTable('Applicant_Recipient_Profile').execute()
  await sql`DROP TYPE Registry_Type`.execute(db)
}
