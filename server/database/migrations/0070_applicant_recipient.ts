import { sql, type Kysely } from 'kysely'
import type { Database } from '../../../shared/types/database'

// Clean-cutover baseline: applicant recipient. Edit this subject directly.

/** Installs the current up definitions for this subject on a fresh database. */
export const up = async (db: Kysely<Database>): Promise<void> => {
  await sql`DO $baseline$ BEGIN
CREATE SEQUENCE "Applicant_Recipient_Address_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Applicant_Recipient_Agency_Financial_Id_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Applicant_Recipient_Contact_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Applicant_Recipient_Funding_History_Recipient_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Applicant_Recipient_Funding_History_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Applicant_Recipient_Note_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Applicant_Recipient_Other_Name_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Applicant_Recipient_Registry_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE TABLE "Applicant_Recipient_Address" (
  "id" bigint DEFAULT nextval('"Applicant_Recipient_Address_id_seq"'::regclass) NOT NULL,
  "egcs_ar_applicantrecipient" bigint NOT NULL,
  "egcs_ar_address" bigint NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Applicant_Recipient_Address_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX ar_idx_addressaddress ON "Applicant_Recipient_Address" USING btree (egcs_ar_applicantrecipient, egcs_ar_address) WHERE (_deleted = false);

CREATE TABLE "Applicant_Recipient_Agency_Financial_Id" (
  "id" bigint DEFAULT nextval('"Applicant_Recipient_Agency_Financial_Id_id_seq"'::regclass) NOT NULL,
  "egcs_ar_applicantrecipient" bigint NOT NULL,
  "egcs_ar_agency" bigint,
  "egcs_ar_financialsystemid" bigint NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Applicant_Recipient_Agency_Financial_Id_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX ar_idx_agencyfinancialidagencyfinancialsystemid ON "Applicant_Recipient_Agency_Financial_Id" USING btree (egcs_ar_agency, egcs_ar_applicantrecipient, egcs_ar_financialsystemid) WHERE (_deleted = false);

CREATE TABLE "Applicant_Recipient_Contact" (
  "id" bigint DEFAULT nextval('"Applicant_Recipient_Contact_id_seq"'::regclass) NOT NULL,
  "egcs_ar_applicantrecipient" bigint NOT NULL,
  "egcs_ar_contact" bigint NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Applicant_Recipient_Contact_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX ar_idx_contactcontact ON "Applicant_Recipient_Contact" USING btree (egcs_ar_applicantrecipient, egcs_ar_contact) WHERE (_deleted = false);

CREATE TABLE "Applicant_Recipient_Funding_History" (
  "id" bigint DEFAULT nextval('"Applicant_Recipient_Funding_History_id_seq"'::regclass) NOT NULL,
  "egcs_ar_agencyname_en" character varying(255),
  "egcs_ar_agencyname_fr" character varying(255),
  "egcs_ar_programname_en" character varying(255),
  "egcs_ar_programname_fr" character varying(255),
  "egcs_ar_agreementnumber" character varying(255) NOT NULL,
  "egcs_ar_title_en" character varying(255),
  "egcs_ar_title_fr" character varying(255),
  "egcs_ar_description_en" text,
  "egcs_ar_description_fr" text,
  "egcs_ar_startdate" date NOT NULL,
  "egcs_ar_enddate" date NOT NULL,
  "egcs_ar_fundingamount" numeric(19,2) NOT NULL,
  "egcs_ar_currency" currency_codes NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Applicant_Recipient_Funding_History_pkey" PRIMARY KEY (id),
  CONSTRAINT "ar_chk_fundinghistory_agency_language" CHECK (((NULLIF(btrim((egcs_ar_agencyname_en)::text), ''::text) IS NOT NULL) OR (NULLIF(btrim((egcs_ar_agencyname_fr)::text), ''::text) IS NOT NULL))),
  CONSTRAINT "ar_chk_fundinghistory_agreementnumber" CHECK ((NULLIF(btrim((egcs_ar_agreementnumber)::text), ''::text) IS NOT NULL)),
  CONSTRAINT "ar_chk_fundinghistory_amount" CHECK ((egcs_ar_fundingamount >= (0)::numeric)),
  CONSTRAINT "ar_chk_fundinghistory_dates" CHECK ((egcs_ar_enddate >= egcs_ar_startdate)),
  CONSTRAINT "ar_chk_fundinghistory_description_language" CHECK (((NULLIF(btrim(egcs_ar_description_en), ''::text) IS NOT NULL) OR (NULLIF(btrim(egcs_ar_description_fr), ''::text) IS NOT NULL))),
  CONSTRAINT "ar_chk_fundinghistory_program_language" CHECK (((NULLIF(btrim((egcs_ar_programname_en)::text), ''::text) IS NOT NULL) OR (NULLIF(btrim((egcs_ar_programname_fr)::text), ''::text) IS NOT NULL))),
  CONSTRAINT "ar_chk_fundinghistory_title_language" CHECK (((NULLIF(btrim((egcs_ar_title_en)::text), ''::text) IS NOT NULL) OR (NULLIF(btrim((egcs_ar_title_fr)::text), ''::text) IS NOT NULL)))
);

CREATE TABLE "Applicant_Recipient_Funding_History_Recipient" (
  "id" bigint DEFAULT nextval('"Applicant_Recipient_Funding_History_Recipient_id_seq"'::regclass) NOT NULL,
  "egcs_ar_fundinghistory" bigint NOT NULL,
  "egcs_ar_applicantrecipient" bigint NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Applicant_Recipient_Funding_History_Recipient_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX ar_idx_fundinghistoryrecipienthistoryrecipient ON "Applicant_Recipient_Funding_History_Recipient" USING btree (egcs_ar_fundinghistory, egcs_ar_applicantrecipient) WHERE (_deleted = false);

CREATE TABLE "Applicant_Recipient_Note" (
  "id" bigint DEFAULT nextval('"Applicant_Recipient_Note_id_seq"'::regclass) NOT NULL,
  "egcs_ar_applicantrecipient" bigint NOT NULL,
  "egcs_ar_agency" bigint NOT NULL,
  "egcs_ar_subject_en" character varying(255),
  "egcs_ar_subject_fr" character varying(255),
  "egcs_ar_body_en" text,
  "egcs_ar_body_fr" text,
  "egcs_ar_createdby" bigint NOT NULL,
  "egcs_ar_updatedby" bigint NOT NULL,
  "egcs_ar_createdat" timestamp with time zone DEFAULT now() NOT NULL,
  "egcs_ar_updatedat" timestamp with time zone DEFAULT now() NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Applicant_Recipient_Note_pkey" PRIMARY KEY (id),
  CONSTRAINT "ar_chk_note_body_language" CHECK (((NULLIF(btrim(egcs_ar_body_en), ''::text) IS NOT NULL) OR (NULLIF(btrim(egcs_ar_body_fr), ''::text) IS NOT NULL))),
  CONSTRAINT "ar_chk_note_subject_language" CHECK (((NULLIF(btrim((egcs_ar_subject_en)::text), ''::text) IS NOT NULL) OR (NULLIF(btrim((egcs_ar_subject_fr)::text), ''::text) IS NOT NULL)))
);

CREATE INDEX ar_idx_note_parent_agency ON "Applicant_Recipient_Note" USING btree (egcs_ar_applicantrecipient, egcs_ar_agency);

CREATE TABLE "Applicant_Recipient_Other_Name" (
  "id" bigint DEFAULT nextval('"Applicant_Recipient_Other_Name_id_seq"'::regclass) NOT NULL,
  "egcs_ar_othername" character varying(255) NOT NULL,
  "egcs_ar_applicantrecipient" bigint NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Applicant_Recipient_Other_Name_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX ar_idx_othernameothername ON "Applicant_Recipient_Other_Name" USING btree (egcs_ar_applicantrecipient, egcs_ar_othername) WHERE (_deleted = false);

CREATE TABLE "Applicant_Recipient_Profile" (
  "id" bigint NOT NULL,
  "egcs_ar_description_en" text,
  "egcs_ar_description_fr" text,
  "egcs_ar_operatingname_en" character varying(255),
  "egcs_ar_operatingname_fr" character varying(255),
  "egcs_ar_leadagency" bigint,
  "egcs_ar_legalname_en" character varying(255),
  "egcs_ar_legalname_fr" character varying(255),
  "egcs_ar_researchorganization_en" character varying(255),
  "egcs_ar_researchorganization_fr" character varying(255),
  "egcs_ar_active" boolean DEFAULT false NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Applicant_Recipient_Profile_pkey" PRIMARY KEY (id),
  CONSTRAINT "ar_chk_profile_description_language" CHECK (((NULLIF(btrim(egcs_ar_description_en), ''::text) IS NOT NULL) OR (NULLIF(btrim(egcs_ar_description_fr), ''::text) IS NOT NULL))),
  CONSTRAINT "ar_chk_profile_legalname_language" CHECK (((NULLIF(btrim((egcs_ar_legalname_en)::text), ''::text) IS NOT NULL) OR (NULLIF(btrim((egcs_ar_legalname_fr)::text), ''::text) IS NOT NULL))),
  CONSTRAINT "ar_chk_profile_operatingname_language" CHECK (((NULLIF(btrim((egcs_ar_operatingname_en)::text), ''::text) IS NOT NULL) OR (NULLIF(btrim((egcs_ar_operatingname_fr)::text), ''::text) IS NOT NULL)))
);

CREATE TABLE "Applicant_Recipient_Registry" (
  "id" bigint DEFAULT nextval('"Applicant_Recipient_Registry_id_seq"'::regclass) NOT NULL,
  "egcs_ar_applicantrecipient" bigint NOT NULL,
  "egcs_ar_number" text NOT NULL,
  "egcs_ar_registry" registry_type NOT NULL,
  "egcs_ar_othercomment" text,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Applicant_Recipient_Registry_pkey" PRIMARY KEY (id),
  CONSTRAINT "ar_chk_registry_number_format" CHECK (
CASE
    WHEN (egcs_ar_registry = 'federalbusinessnumber'::registry_type) THEN (egcs_ar_number ~ '^[0-9]{9}$'::text)
    WHEN (egcs_ar_registry = 'craprogramaccountnumber'::registry_type) THEN (egcs_ar_number ~ '^[0-9]{15}$'::text)
    WHEN (egcs_ar_registry = 'naics'::registry_type) THEN (egcs_ar_number ~ '^[0-9]{2,6}$'::text)
    ELSE true
END),
  CONSTRAINT "ar_chk_registry_othercomment" CHECK ((((egcs_ar_registry = 'other'::registry_type) AND (NULLIF(btrim(egcs_ar_othercomment), ''::text) IS NOT NULL)) OR (egcs_ar_registry <> 'other'::registry_type)))
);

CREATE UNIQUE INDEX ar_idx_registryregistrynumber ON "Applicant_Recipient_Registry" USING btree (egcs_ar_registry, egcs_ar_number) WHERE (_deleted = false);

ALTER SEQUENCE "Applicant_Recipient_Address_id_seq" OWNED BY "Applicant_Recipient_Address"."id";

ALTER SEQUENCE "Applicant_Recipient_Agency_Financial_Id_id_seq" OWNED BY "Applicant_Recipient_Agency_Financial_Id"."id";

ALTER SEQUENCE "Applicant_Recipient_Contact_id_seq" OWNED BY "Applicant_Recipient_Contact"."id";

ALTER SEQUENCE "Applicant_Recipient_Funding_History_Recipient_id_seq" OWNED BY "Applicant_Recipient_Funding_History_Recipient"."id";

ALTER SEQUENCE "Applicant_Recipient_Funding_History_id_seq" OWNED BY "Applicant_Recipient_Funding_History"."id";

ALTER SEQUENCE "Applicant_Recipient_Note_id_seq" OWNED BY "Applicant_Recipient_Note"."id";

ALTER SEQUENCE "Applicant_Recipient_Other_Name_id_seq" OWNED BY "Applicant_Recipient_Other_Name"."id";

ALTER SEQUENCE "Applicant_Recipient_Registry_id_seq" OWNED BY "Applicant_Recipient_Registry"."id";
END $baseline$`.execute(db)
}

/** Installs the current installFunctions definitions for this subject on a fresh database. */
export const installFunctions = async (db: Kysely<Database>): Promise<void> => {
  await sql`DO $baseline$ BEGIN
CREATE FUNCTION trg_fn_enforce_funding_history_recipient_roster()
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
    $function$;

CREATE FUNCTION trg_fn_soft_delete_unlinked_funding_history()
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
    $function$;
END $baseline$`.execute(db)
}

/** Installs the current installForeignKeys definitions for this subject on a fresh database. */
export const installForeignKeys = async (db: Kysely<Database>): Promise<void> => {
  await sql`DO $baseline$ BEGIN
ALTER TABLE "Applicant_Recipient_Address" ADD CONSTRAINT "Applicant_Recipient_Address_egcs_ar_address_fkey" FOREIGN KEY (egcs_ar_address) REFERENCES "Common_Address"(id) ON DELETE RESTRICT;

ALTER TABLE "Applicant_Recipient_Address" ADD CONSTRAINT "Applicant_Recipient_Address_egcs_ar_applicantrecipient_fkey" FOREIGN KEY (egcs_ar_applicantrecipient) REFERENCES "Applicant_Recipient_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Applicant_Recipient_Agency_Financial_Id" ADD CONSTRAINT "Applicant_Recipient_Agency_Fina_egcs_ar_applicantrecipient_fkey" FOREIGN KEY (egcs_ar_applicantrecipient) REFERENCES "Applicant_Recipient_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Applicant_Recipient_Agency_Financial_Id" ADD CONSTRAINT "Applicant_Recipient_Agency_Financial_Id_egcs_ar_agency_fkey" FOREIGN KEY (egcs_ar_agency) REFERENCES "Agency_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Applicant_Recipient_Contact" ADD CONSTRAINT "Applicant_Recipient_Contact_egcs_ar_applicantrecipient_fkey" FOREIGN KEY (egcs_ar_applicantrecipient) REFERENCES "Applicant_Recipient_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Applicant_Recipient_Contact" ADD CONSTRAINT "Applicant_Recipient_Contact_egcs_ar_contact_fkey" FOREIGN KEY (egcs_ar_contact) REFERENCES "Common_Contact"(id) ON DELETE RESTRICT;

ALTER TABLE "Applicant_Recipient_Funding_History_Recipient" ADD CONSTRAINT "Applicant_Recipient_Funding_His_egcs_ar_applicantrecipient_fkey" FOREIGN KEY (egcs_ar_applicantrecipient) REFERENCES "Applicant_Recipient_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Applicant_Recipient_Funding_History_Recipient" ADD CONSTRAINT "Applicant_Recipient_Funding_History_egcs_ar_fundinghistory_fkey" FOREIGN KEY (egcs_ar_fundinghistory) REFERENCES "Applicant_Recipient_Funding_History"(id) ON DELETE RESTRICT;

ALTER TABLE "Applicant_Recipient_Note" ADD CONSTRAINT "Applicant_Recipient_Note_egcs_ar_agency_fkey" FOREIGN KEY (egcs_ar_agency) REFERENCES "Agency_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Applicant_Recipient_Note" ADD CONSTRAINT "Applicant_Recipient_Note_egcs_ar_applicantrecipient_fkey" FOREIGN KEY (egcs_ar_applicantrecipient) REFERENCES "Applicant_Recipient_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Applicant_Recipient_Note" ADD CONSTRAINT "Applicant_Recipient_Note_egcs_ar_createdby_fkey" FOREIGN KEY (egcs_ar_createdby) REFERENCES "Common_User"(id) ON DELETE RESTRICT;

ALTER TABLE "Applicant_Recipient_Note" ADD CONSTRAINT "Applicant_Recipient_Note_egcs_ar_updatedby_fkey" FOREIGN KEY (egcs_ar_updatedby) REFERENCES "Common_User"(id) ON DELETE RESTRICT;

ALTER TABLE "Applicant_Recipient_Other_Name" ADD CONSTRAINT "Applicant_Recipient_Other_Name_egcs_ar_applicantrecipient_fkey" FOREIGN KEY (egcs_ar_applicantrecipient) REFERENCES "Applicant_Recipient_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Applicant_Recipient_Profile" ADD CONSTRAINT "Applicant_Recipient_Profile_egcs_ar_leadagency_fkey" FOREIGN KEY (egcs_ar_leadagency) REFERENCES "Agency_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Applicant_Recipient_Profile" ADD CONSTRAINT "ar_ref_profileid" FOREIGN KEY (id) REFERENCES "Common_Entity"(id) ON DELETE RESTRICT;

ALTER TABLE "Applicant_Recipient_Registry" ADD CONSTRAINT "Applicant_Recipient_Registry_egcs_ar_applicantrecipient_fkey" FOREIGN KEY (egcs_ar_applicantrecipient) REFERENCES "Applicant_Recipient_Profile"(id) ON DELETE RESTRICT;
END $baseline$`.execute(db)
}

/** Installs the current installTriggers definitions for this subject on a fresh database. */
export const installTriggers = async (db: Kysely<Database>): Promise<void> => {
  await sql`DO $baseline$ BEGIN
CREATE CONSTRAINT TRIGGER trg_enforce_funding_history_recipient_roster_from_history AFTER INSERT OR DELETE OR UPDATE ON "Applicant_Recipient_Funding_History" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_funding_history_recipient_roster();

CREATE CONSTRAINT TRIGGER trg_enforce_funding_history_recipient_roster_from_recipient AFTER INSERT OR DELETE OR UPDATE ON "Applicant_Recipient_Funding_History_Recipient" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_funding_history_recipient_roster();

CREATE TRIGGER trg_soft_delete_unlinked_funding_history AFTER UPDATE OF _deleted ON "Applicant_Recipient_Funding_History_Recipient" FOR EACH ROW EXECUTE FUNCTION trg_fn_soft_delete_unlinked_funding_history();

CREATE CONSTRAINT TRIGGER trg_enforce_applicantrecipient_assignment_roster AFTER INSERT OR UPDATE OF _deleted ON "Applicant_Recipient_Profile" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_assignable_entity_roster('applicantrecipient');

CREATE TRIGGER trg_register_applicantrecipient BEFORE INSERT ON "Applicant_Recipient_Profile" FOR EACH ROW EXECUTE FUNCTION register_entity('applicantrecipient');

CREATE TRIGGER trg_soft_delete_applicantrecipient_assignments AFTER UPDATE OF _deleted ON "Applicant_Recipient_Profile" FOR EACH ROW EXECUTE FUNCTION trg_fn_soft_delete_entity_assignments('applicantrecipient');
END $baseline$`.execute(db)
}
