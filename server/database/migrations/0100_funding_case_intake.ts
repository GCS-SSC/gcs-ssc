import { sql, type Kysely } from 'kysely'
import type { Database } from '../../../shared/types/database'

// Clean-cutover baseline: funding case intake. Edit this subject directly.

/** Installs the current up definitions for this subject on a fresh database. */
export const up = async (db: Kysely<Database>): Promise<void> => {
  await sql`DO $baseline$ BEGIN
CREATE TABLE "Funding_Case_Intake_Profile" (
  "id" bigint NOT NULL,
  "egcs_fi_applicationid" bigint,
  "egcs_fi_application" jsonb NOT NULL,
  "egcs_fi_fundingopportunity" bigint NOT NULL,
  "egcs_fi_applicantrecipient" bigint NOT NULL,
  "egcs_fi_status" bigint NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  "egcs_fi_sourcesystem" character varying(100),
  "egcs_fi_externalsourceid" character varying(255),
  "egcs_fi_sourceexport" jsonb,
  "egcs_fi_group" bigint,
  "egcs_fi_groupclaimedby" bigint,
  CONSTRAINT "Funding_Case_Intake_Profile_pkey" PRIMARY KEY (id),
  CONSTRAINT "fi_chk_application_object" CHECK ((jsonb_typeof(egcs_fi_application) = 'object'::text)),
  CONSTRAINT "fi_chk_group_claim" CHECK (((egcs_fi_groupclaimedby IS NULL) OR (egcs_fi_group IS NOT NULL))),
  CONSTRAINT "fi_chk_source_contract" CHECK ((((egcs_fi_sourcesystem IS NULL) AND (egcs_fi_externalsourceid IS NULL) AND (egcs_fi_sourceexport IS NULL)) OR ((egcs_fi_sourcesystem IS NOT NULL) AND (length(btrim((egcs_fi_sourcesystem)::text)) > 0) AND (egcs_fi_externalsourceid IS NOT NULL) AND (length(btrim((egcs_fi_externalsourceid)::text)) > 0) AND (egcs_fi_sourceexport IS NOT NULL) AND (jsonb_typeof(egcs_fi_sourceexport) = 'object'::text))))
);

CREATE UNIQUE INDEX fi_idx_external_source ON "Funding_Case_Intake_Profile" USING btree (egcs_fi_sourcesystem, egcs_fi_externalsourceid) WHERE (egcs_fi_sourcesystem IS NOT NULL);

CREATE UNIQUE INDEX fi_idx_profile_applicationid ON "Funding_Case_Intake_Profile" USING btree (egcs_fi_applicationid) WHERE (_deleted = false);

CREATE INDEX fi_idx_profile_opportunity ON "Funding_Case_Intake_Profile" USING btree (egcs_fi_fundingopportunity) WHERE (_deleted = false);
END $baseline$`.execute(db)
}

/** Installs the current installFunctions definitions for this subject on a fresh database. */
export const installFunctions = async (db: Kysely<Database>): Promise<void> => {
  await sql`DO $baseline$ BEGIN
CREATE FUNCTION trg_fn_lock_intake_source()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      IF OLD.egcs_fi_sourcesystem IS DISTINCT FROM NEW.egcs_fi_sourcesystem
        OR OLD.egcs_fi_externalsourceid IS DISTINCT FROM NEW.egcs_fi_externalsourceid
        OR OLD.egcs_fi_sourceexport IS DISTINCT FROM NEW.egcs_fi_sourceexport THEN
        RAISE EXCEPTION 'Funding case intake source evidence is immutable' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END;
  $function$;

CREATE FUNCTION trg_fn_validate_intake_group_agency()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE owner_agency bigint; group_agency bigint;
    BEGIN
      IF NEW.egcs_fi_group IS NULL THEN RETURN NEW; END IF;
      SELECT profile.egcs_tp_agency INTO owner_agency
      FROM "Funding_Opportunity_Profile" opportunity
      JOIN "Transfer_Payment_Stream" stream ON stream.id = opportunity.egcs_fo_transferpaymentstream
      JOIN "Transfer_Payment_Profile" profile ON profile.id = stream.egcs_tp_transferpaymentprofile
      WHERE opportunity.id = NEW.egcs_fi_fundingopportunity;
      SELECT egcs_cn_agency INTO group_agency FROM "Common_Group"
      WHERE id = NEW.egcs_fi_group AND _deleted = false;
      IF owner_agency IS NULL OR group_agency IS NULL OR owner_agency <> group_agency THEN
        RAISE EXCEPTION 'Intake group must belong to the opportunity Agency'
          USING ERRCODE = '23514', CONSTRAINT = 'fi_chk_group_agency';
      END IF;
      RETURN NEW;
    END;
  $function$;

CREATE FUNCTION trg_fn_validate_intake_status_agency()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE owner_agency bigint; status_agency bigint;
    BEGIN
      SELECT profile.egcs_tp_agency INTO owner_agency
      FROM "Funding_Opportunity_Profile" opportunity
      JOIN "Transfer_Payment_Stream" stream ON stream.id = opportunity.egcs_fo_transferpaymentstream
      JOIN "Transfer_Payment_Profile" profile ON profile.id = stream.egcs_tp_transferpaymentprofile
      WHERE opportunity.id = NEW.egcs_fi_fundingopportunity;
      SELECT egcs_cn_agency INTO status_agency FROM "Common_Status" WHERE id = NEW.egcs_fi_status AND _deleted = false;
      IF owner_agency IS NULL OR status_agency IS NULL OR owner_agency <> status_agency THEN
        RAISE EXCEPTION 'Intake status must belong to the opportunity Agency'
          USING ERRCODE = '23514', CONSTRAINT = 'fi_chk_status_agency';
      END IF;
      RETURN NEW;
    END;
    $function$;
END $baseline$`.execute(db)
}

/** Installs the current installForeignKeys definitions for this subject on a fresh database. */
export const installForeignKeys = async (db: Kysely<Database>): Promise<void> => {
  await sql`DO $baseline$ BEGIN
ALTER TABLE "Funding_Case_Intake_Profile" ADD CONSTRAINT "Funding_Case_Intake_Profile_egcs_fi_applicantrecipient_fkey" FOREIGN KEY (egcs_fi_applicantrecipient) REFERENCES "Applicant_Recipient_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Intake_Profile" ADD CONSTRAINT "Funding_Case_Intake_Profile_egcs_fi_fundingopportunity_fkey" FOREIGN KEY (egcs_fi_fundingopportunity) REFERENCES "Funding_Opportunity_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Intake_Profile" ADD CONSTRAINT "Funding_Case_Intake_Profile_egcs_fi_group_fkey" FOREIGN KEY (egcs_fi_group) REFERENCES "Common_Group"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Intake_Profile" ADD CONSTRAINT "Funding_Case_Intake_Profile_egcs_fi_groupclaimedby_fkey" FOREIGN KEY (egcs_fi_groupclaimedby) REFERENCES "Common_User"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Intake_Profile" ADD CONSTRAINT "Funding_Case_Intake_Profile_egcs_fi_status_fkey" FOREIGN KEY (egcs_fi_status) REFERENCES "Common_Status"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Intake_Profile" ADD CONSTRAINT "Funding_Case_Intake_Profile_id_fkey" FOREIGN KEY (id) REFERENCES "Common_Entity"(id) ON DELETE RESTRICT;
END $baseline$`.execute(db)
}

/** Installs the current installTriggers definitions for this subject on a fresh database. */
export const installTriggers = async (db: Kysely<Database>): Promise<void> => {
  await sql`DO $baseline$ BEGIN
CREATE CONSTRAINT TRIGGER trg_enforce_fundingcaseintake_assignment_roster AFTER INSERT OR UPDATE OF _deleted ON "Funding_Case_Intake_Profile" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_assignable_entity_roster('fundingcaseintake');

CREATE CONSTRAINT TRIGGER trg_enforce_intake_group_roster AFTER INSERT OR UPDATE OF egcs_fi_group, egcs_fi_groupclaimedby, _deleted ON "Funding_Case_Intake_Profile" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_assignable_entity_roster('fundingcaseintake');

CREATE TRIGGER trg_lock_intake_source BEFORE UPDATE ON "Funding_Case_Intake_Profile" FOR EACH ROW EXECUTE FUNCTION trg_fn_lock_intake_source();

CREATE TRIGGER trg_register_fundingcaseintake BEFORE INSERT ON "Funding_Case_Intake_Profile" FOR EACH ROW EXECUTE FUNCTION register_entity('fundingcaseintake');

CREATE TRIGGER trg_soft_delete_fundingcaseintake_assignments AFTER UPDATE OF _deleted ON "Funding_Case_Intake_Profile" FOR EACH ROW EXECUTE FUNCTION trg_fn_soft_delete_entity_assignments('fundingcaseintake');

CREATE CONSTRAINT TRIGGER trg_validate_intake_group_agency AFTER INSERT OR UPDATE OF egcs_fi_group, egcs_fi_fundingopportunity ON "Funding_Case_Intake_Profile" DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_intake_group_agency();

CREATE CONSTRAINT TRIGGER trg_validate_intake_status_agency AFTER INSERT OR UPDATE OF egcs_fi_status, egcs_fi_fundingopportunity ON "Funding_Case_Intake_Profile" DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_intake_status_agency();
END $baseline$`.execute(db)
}
