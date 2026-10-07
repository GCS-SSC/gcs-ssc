import { sql, type Kysely } from 'kysely'
import type { Database } from '../../../shared/types/database'

// Clean-cutover baseline: funding opportunity. Edit this subject directly.

/** Installs the current up definitions for this subject on a fresh database. */
export const up = async (db: Kysely<Database>): Promise<void> => {
  await sql`DO $baseline$ BEGIN
CREATE SEQUENCE "Funding_Opportunity_Attachment_Type_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Funding_Opportunity_Review_Set_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Funding_Opportunity_Stream_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Funding_Opportunity_Workflow_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE TABLE "Funding_Opportunity_Attachment_Type" (
  "id" bigint DEFAULT nextval('"Funding_Opportunity_Attachment_Type_id_seq"'::regclass) NOT NULL,
  "egcs_fo_fundingopportunity" bigint NOT NULL,
  "egcs_fo_attachmenttype" bigint NOT NULL,
  "egcs_fo_isinternal" boolean DEFAULT false NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Funding_Opportunity_Attachment_Type_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX fo_idx_attachment_type_active ON "Funding_Opportunity_Attachment_Type" USING btree (egcs_fo_fundingopportunity, egcs_fo_attachmenttype) WHERE (_deleted = false);

CREATE INDEX fo_idx_attachment_type_type_active ON "Funding_Opportunity_Attachment_Type" USING btree (egcs_fo_attachmenttype) WHERE (_deleted = false);

CREATE TABLE "Funding_Opportunity_Profile" (
  "id" bigint NOT NULL,
  "egcs_fo_transferpaymentstream" bigint NOT NULL,
  "egcs_fo_datestart" date NOT NULL,
  "egcs_fo_dateend" date NOT NULL,
  "egcs_fo_name_en" character varying(255) NOT NULL,
  "egcs_fo_name_fr" character varying(255) NOT NULL,
  "egcs_fo_objective_en" text NOT NULL,
  "egcs_fo_objective_fr" text NOT NULL,
  "egcs_fo_applicationschema" jsonb,
  "_deleted" boolean DEFAULT false NOT NULL,
  "egcs_fo_status" bigint NOT NULL,
  CONSTRAINT "Funding_Opportunity_Profile_pkey" PRIMARY KEY (id),
  CONSTRAINT "fo_chk_application_schema" CHECK (((egcs_fo_applicationschema IS NULL) OR (jsonb_typeof(egcs_fo_applicationschema) = 'object'::text))),
  CONSTRAINT "fo_chk_dates" CHECK ((egcs_fo_dateend >= egcs_fo_datestart))
);

CREATE UNIQUE INDEX fo_idx_profile_stream_name_en ON "Funding_Opportunity_Profile" USING btree (egcs_fo_transferpaymentstream, lower(btrim((egcs_fo_name_en)::text))) WHERE (_deleted = false);

CREATE UNIQUE INDEX fo_idx_profile_stream_name_fr ON "Funding_Opportunity_Profile" USING btree (egcs_fo_transferpaymentstream, lower(btrim((egcs_fo_name_fr)::text))) WHERE (_deleted = false);

CREATE TABLE "Funding_Opportunity_Review_Set" (
  "id" bigint DEFAULT nextval('"Funding_Opportunity_Review_Set_id_seq"'::regclass) NOT NULL,
  "egcs_fo_fundingopportunity" bigint NOT NULL,
  "egcs_fo_reviewsetsetup" bigint NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Funding_Opportunity_Review_Set_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX fo_idx_review_set_active ON "Funding_Opportunity_Review_Set" USING btree (egcs_fo_fundingopportunity, egcs_fo_reviewsetsetup) WHERE (_deleted = false);

CREATE TABLE "Funding_Opportunity_Stream" (
  "id" bigint DEFAULT nextval('"Funding_Opportunity_Stream_id_seq"'::regclass) NOT NULL,
  "egcs_fo_fundingopportunity" bigint NOT NULL,
  "egcs_fo_transferpaymentstream" bigint NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Funding_Opportunity_Stream_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX fo_idx_opportunity_stream_active ON "Funding_Opportunity_Stream" USING btree (egcs_fo_fundingopportunity, egcs_fo_transferpaymentstream) WHERE (_deleted = false);

CREATE INDEX fo_idx_opportunity_stream_stream_active ON "Funding_Opportunity_Stream" USING btree (egcs_fo_transferpaymentstream) WHERE (_deleted = false);

CREATE TABLE "Funding_Opportunity_Workflow" (
  "id" bigint DEFAULT nextval('"Funding_Opportunity_Workflow_id_seq"'::regclass) NOT NULL,
  "egcs_fo_fundingopportunity" bigint NOT NULL,
  "egcs_fo_workflowsetup" bigint NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Funding_Opportunity_Workflow_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX fo_idx_workflow_active ON "Funding_Opportunity_Workflow" USING btree (egcs_fo_fundingopportunity, egcs_fo_workflowsetup) WHERE (_deleted = false);

ALTER SEQUENCE "Funding_Opportunity_Attachment_Type_id_seq" OWNED BY "Funding_Opportunity_Attachment_Type"."id";

ALTER SEQUENCE "Funding_Opportunity_Review_Set_id_seq" OWNED BY "Funding_Opportunity_Review_Set"."id";

ALTER SEQUENCE "Funding_Opportunity_Stream_id_seq" OWNED BY "Funding_Opportunity_Stream"."id";

ALTER SEQUENCE "Funding_Opportunity_Workflow_id_seq" OWNED BY "Funding_Opportunity_Workflow"."id";
-- Palette matching uses only this source's own identity fields.
CREATE INDEX fo_profile_search_name_en_trgm ON "Funding_Opportunity_Profile" USING gin (lower(coalesce(egcs_fo_name_en, '')) gin_trgm_ops) WHERE (_deleted = false);
CREATE INDEX fo_profile_search_name_en_prefix ON "Funding_Opportunity_Profile" USING btree (lower(coalesce(egcs_fo_name_en, '')) text_pattern_ops) WHERE (_deleted = false);
CREATE INDEX fo_profile_search_name_fr_trgm ON "Funding_Opportunity_Profile" USING gin (lower(coalesce(egcs_fo_name_fr, '')) gin_trgm_ops) WHERE (_deleted = false);
CREATE INDEX fo_profile_search_name_fr_prefix ON "Funding_Opportunity_Profile" USING btree (lower(coalesce(egcs_fo_name_fr, '')) text_pattern_ops) WHERE (_deleted = false);
END $baseline$`.execute(db)
}

/** Installs the current installFunctions definitions for this subject on a fresh database. */
export const installFunctions = async (db: Kysely<Database>): Promise<void> => {
  await sql`DO $baseline$ BEGIN
CREATE FUNCTION trg_fn_link_opportunity_anchor_stream()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      INSERT INTO "Funding_Opportunity_Stream" (egcs_fo_fundingopportunity, egcs_fo_transferpaymentstream)
      VALUES (NEW.id, NEW.egcs_fo_transferpaymentstream)
      ON CONFLICT (egcs_fo_fundingopportunity, egcs_fo_transferpaymentstream)
        WHERE _deleted = false DO NOTHING;
      RETURN NEW;
    END;
  $function$;

CREATE FUNCTION trg_fn_validate_opportunity_status_agency()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE owner_agency bigint; status_agency bigint;
    BEGIN
      SELECT program.egcs_tp_agency INTO owner_agency
      FROM "Transfer_Payment_Stream" stream
      JOIN "Transfer_Payment_Profile" program ON program.id = stream.egcs_tp_transferpaymentprofile
      WHERE stream.id = NEW.egcs_fo_transferpaymentstream;
      SELECT egcs_cn_agency INTO status_agency FROM "Common_Status"
      WHERE id = NEW.egcs_fo_status AND _deleted = false;
      IF owner_agency IS NULL OR status_agency IS NULL OR owner_agency <> status_agency THEN
        RAISE EXCEPTION 'Opportunity status must belong to its Agency'
          USING ERRCODE = '23514', CONSTRAINT = 'fo_chk_status_agency';
      END IF;
      RETURN NEW;
    END;
    $function$;
END $baseline$`.execute(db)
}

/** Installs the current installForeignKeys definitions for this subject on a fresh database. */
export const installForeignKeys = async (db: Kysely<Database>): Promise<void> => {
  await sql`DO $baseline$ BEGIN
ALTER TABLE "Funding_Opportunity_Attachment_Type" ADD CONSTRAINT "Funding_Opportunity_Attachment__egcs_fo_fundingopportunity_fkey" FOREIGN KEY (egcs_fo_fundingopportunity) REFERENCES "Funding_Opportunity_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Opportunity_Attachment_Type" ADD CONSTRAINT "Funding_Opportunity_Attachment_Type_egcs_fo_attachmenttype_fkey" FOREIGN KEY (egcs_fo_attachmenttype) REFERENCES "Common_Attachment_Types"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Opportunity_Profile" ADD CONSTRAINT "fo_fk_status" FOREIGN KEY (egcs_fo_status) REFERENCES "Common_Status"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Opportunity_Profile" ADD CONSTRAINT "Funding_Opportunity_Profile_egcs_fo_transferpaymentstream_fkey" FOREIGN KEY (egcs_fo_transferpaymentstream) REFERENCES "Transfer_Payment_Stream"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Opportunity_Profile" ADD CONSTRAINT "Funding_Opportunity_Profile_id_fkey" FOREIGN KEY (id) REFERENCES "Common_Entity"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Opportunity_Review_Set" ADD CONSTRAINT "Funding_Opportunity_Review_Set_egcs_fo_fundingopportunity_fkey" FOREIGN KEY (egcs_fo_fundingopportunity) REFERENCES "Funding_Opportunity_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Opportunity_Review_Set" ADD CONSTRAINT "Funding_Opportunity_Review_Set_egcs_fo_reviewsetsetup_fkey" FOREIGN KEY (egcs_fo_reviewsetsetup) REFERENCES "Common_Review_Set_Setup"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Opportunity_Stream" ADD CONSTRAINT "Funding_Opportunity_Stream_egcs_fo_fundingopportunity_fkey" FOREIGN KEY (egcs_fo_fundingopportunity) REFERENCES "Funding_Opportunity_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Opportunity_Stream" ADD CONSTRAINT "Funding_Opportunity_Stream_egcs_fo_transferpaymentstream_fkey" FOREIGN KEY (egcs_fo_transferpaymentstream) REFERENCES "Transfer_Payment_Stream"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Opportunity_Workflow" ADD CONSTRAINT "Funding_Opportunity_Workflow_egcs_fo_fundingopportunity_fkey" FOREIGN KEY (egcs_fo_fundingopportunity) REFERENCES "Funding_Opportunity_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Opportunity_Workflow" ADD CONSTRAINT "Funding_Opportunity_Workflow_egcs_fo_workflowsetup_fkey" FOREIGN KEY (egcs_fo_workflowsetup) REFERENCES "Common_Workflow_Setup"(id) ON DELETE RESTRICT;
END $baseline$`.execute(db)
}

/** Installs the current installTriggers definitions for this subject on a fresh database. */
export const installTriggers = async (db: Kysely<Database>): Promise<void> => {
  await sql`DO $baseline$ BEGIN
CREATE TRIGGER trg_link_opportunity_anchor_stream AFTER INSERT OR UPDATE OF egcs_fo_transferpaymentstream ON "Funding_Opportunity_Profile" FOR EACH ROW EXECUTE FUNCTION trg_fn_link_opportunity_anchor_stream();

CREATE TRIGGER trg_register_fundingopportunity BEFORE INSERT ON "Funding_Opportunity_Profile" FOR EACH ROW EXECUTE FUNCTION register_entity('fundingopportunity');

CREATE CONSTRAINT TRIGGER trg_validate_opportunity_status_agency AFTER INSERT OR UPDATE OF egcs_fo_status, egcs_fo_transferpaymentstream ON "Funding_Opportunity_Profile" DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_opportunity_status_agency();

CREATE CONSTRAINT TRIGGER trg_validate_opportunity_streams_profile AFTER INSERT OR UPDATE OF egcs_fo_transferpaymentstream, egcs_fo_name_en, egcs_fo_name_fr, _deleted ON "Funding_Opportunity_Profile" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_opportunity_stream_links();

CREATE CONSTRAINT TRIGGER trg_validate_opportunity_streams_link AFTER INSERT OR DELETE OR UPDATE ON "Funding_Opportunity_Stream" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_opportunity_stream_links();
END $baseline$`.execute(db)
}
