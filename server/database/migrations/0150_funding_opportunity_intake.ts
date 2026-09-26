import { sql, type Kysely } from 'kysely'
import type { Database } from '../../../shared/types/database'

/** Introduces opportunities and their independently assigned intake cases. */
export const up = async (db: Kysely<Database>): Promise<void> => {
  await sql`ALTER TABLE "Common_Entity_Type" DROP CONSTRAINT cn_chk_entitytypeowner`.execute(db)
  await sql`ALTER TABLE "Common_Entity_Type" ADD CONSTRAINT cn_chk_entitytypeowner CHECK ((egcs_cn_ownerkind IS NULL OR egcs_cn_ownerkind IN ('agreement', 'proponent', 'runtime_source', 'funding_case')) AND (egcs_cn_assignmentmode IS NULL OR egcs_cn_assignmentmode IN ('independent', 'inherited')))`.execute(db)
  await sql`DROP TRIGGER trg_lock_entity_type ON "Common_Entity_Type"`.execute(db)
  await sql`UPDATE "Common_Entity_Type" SET egcs_cn_approvalsubmission = 'explicit', egcs_cn_standardworkflow = 'explicit', egcs_cn_ownerkind = 'funding_case', egcs_cn_assignmentmode = 'independent' WHERE egcs_cn_type = 'fundingcaseintake'`.execute(db)
  await sql`CREATE TRIGGER trg_lock_entity_type BEFORE UPDATE OR DELETE ON "Common_Entity_Type" FOR EACH ROW EXECUTE FUNCTION trg_fn_lock_entity_type()`.execute(db)
  await sql`ALTER TABLE role_permission DROP CONSTRAINT role_permission_subject_check`.execute(db)
  await sql`ALTER TABLE role_permission ADD CONSTRAINT role_permission_subject_check CHECK (subject IN ('audit', 'system', 'agency', 'transfer_payment', 'role', 'user', 'group', 'agreement', 'applicant_recipient', 'funding_case'))`.execute(db)
  await sql`ALTER TABLE role_permission DROP CONSTRAINT role_permission_assignment_subject_check`.execute(db)
  await sql`ALTER TABLE role_permission ADD CONSTRAINT role_permission_assignment_subject_check CHECK (can_manage_assignments = false OR subject IN ('agreement', 'applicant_recipient', 'funding_case'))`.execute(db)

  await sql`
    CREATE TABLE "Funding_Opportunity_Profile" (
      id bigint PRIMARY KEY REFERENCES "Common_Entity"(id) ON DELETE RESTRICT,
      egcs_fo_transferpaymentstream bigint NOT NULL REFERENCES "Transfer_Payment_Stream"(id) ON DELETE RESTRICT,
      egcs_fo_datestart date NOT NULL,
      egcs_fo_dateend date NOT NULL,
      egcs_fo_name_en varchar(255) NOT NULL,
      egcs_fo_name_fr varchar(255) NOT NULL,
      egcs_fo_objective_en text NOT NULL,
      egcs_fo_objective_fr text NOT NULL,
      egcs_fo_applicationschema jsonb,
      egcs_fo_status varchar(16) NOT NULL DEFAULT 'draft',
      _deleted boolean NOT NULL DEFAULT false,
      CONSTRAINT fo_chk_dates CHECK (egcs_fo_dateend >= egcs_fo_datestart),
      CONSTRAINT fo_chk_status CHECK (egcs_fo_status IN ('draft', 'open', 'closed')),
      CONSTRAINT fo_chk_application_schema CHECK (egcs_fo_applicationschema IS NULL OR jsonb_typeof(egcs_fo_applicationschema) = 'object')
    )
  `.execute(db)
  await sql`CREATE UNIQUE INDEX fo_idx_profile_stream_name_en ON "Funding_Opportunity_Profile" (egcs_fo_transferpaymentstream, lower(btrim(egcs_fo_name_en))) WHERE _deleted = false`.execute(db)
  await sql`CREATE UNIQUE INDEX fo_idx_profile_stream_name_fr ON "Funding_Opportunity_Profile" (egcs_fo_transferpaymentstream, lower(btrim(egcs_fo_name_fr))) WHERE _deleted = false`.execute(db)
  await sql`CREATE TRIGGER trg_register_fundingopportunity BEFORE INSERT ON "Funding_Opportunity_Profile" FOR EACH ROW EXECUTE FUNCTION register_entity('fundingopportunity')`.execute(db)

  await sql`
    CREATE TABLE "Funding_Opportunity_Review_Set" (
      id bigserial PRIMARY KEY,
      egcs_fo_fundingopportunity bigint NOT NULL REFERENCES "Funding_Opportunity_Profile"(id) ON DELETE RESTRICT,
      egcs_fo_reviewsetsetup bigint NOT NULL REFERENCES "Common_Review_Set_Setup"(id) ON DELETE RESTRICT,
      _deleted boolean NOT NULL DEFAULT false
    )
  `.execute(db)
  await sql`CREATE UNIQUE INDEX fo_idx_review_set_active ON "Funding_Opportunity_Review_Set" (egcs_fo_fundingopportunity, egcs_fo_reviewsetsetup) WHERE _deleted = false`.execute(db)
  await sql`
    CREATE TABLE "Funding_Opportunity_Workflow" (
      id bigserial PRIMARY KEY,
      egcs_fo_fundingopportunity bigint NOT NULL REFERENCES "Funding_Opportunity_Profile"(id) ON DELETE RESTRICT,
      egcs_fo_workflowsetup bigint NOT NULL REFERENCES "Common_Workflow_Setup"(id) ON DELETE RESTRICT,
      _deleted boolean NOT NULL DEFAULT false
    )
  `.execute(db)
  await sql`CREATE UNIQUE INDEX fo_idx_workflow_active ON "Funding_Opportunity_Workflow" (egcs_fo_fundingopportunity, egcs_fo_workflowsetup) WHERE _deleted = false`.execute(db)

  await sql`
    CREATE TABLE "Funding_Case_Intake_Profile" (
      id bigint PRIMARY KEY REFERENCES "Common_Entity"(id) ON DELETE RESTRICT,
      egcs_fi_applicationid bigint NOT NULL,
      egcs_fi_application jsonb NOT NULL,
      egcs_fi_fundingopportunity bigint NOT NULL REFERENCES "Funding_Opportunity_Profile"(id) ON DELETE RESTRICT,
      egcs_fi_applicantrecipient bigint NOT NULL REFERENCES "Applicant_Recipient_Profile"(id) ON DELETE RESTRICT,
      egcs_fi_status bigint NOT NULL REFERENCES "Common_Status"(id) ON DELETE RESTRICT,
      _deleted boolean NOT NULL DEFAULT false,
      CONSTRAINT fi_chk_application_object CHECK (jsonb_typeof(egcs_fi_application) = 'object')
    )
  `.execute(db)
  await sql`CREATE UNIQUE INDEX fi_idx_profile_applicationid ON "Funding_Case_Intake_Profile" (egcs_fi_applicationid) WHERE _deleted = false`.execute(db)
  await sql`CREATE INDEX fi_idx_profile_opportunity ON "Funding_Case_Intake_Profile" (egcs_fi_fundingopportunity) WHERE _deleted = false`.execute(db)
  await sql`CREATE TRIGGER trg_register_fundingcaseintake BEFORE INSERT ON "Funding_Case_Intake_Profile" FOR EACH ROW EXECUTE FUNCTION register_entity('fundingcaseintake')`.execute(db)
  await sql`CREATE TRIGGER trg_soft_delete_fundingcaseintake_assignments AFTER UPDATE OF _deleted ON "Funding_Case_Intake_Profile" FOR EACH ROW EXECUTE FUNCTION trg_fn_soft_delete_entity_assignments('fundingcaseintake')`.execute(db)
  await sql`CREATE CONSTRAINT TRIGGER trg_enforce_fundingcaseintake_assignment_roster AFTER INSERT OR UPDATE OF _deleted ON "Funding_Case_Intake_Profile" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_assignable_entity_roster('fundingcaseintake')`.execute(db)
  await sql`
    CREATE FUNCTION trg_fn_validate_intake_status_agency() RETURNS trigger AS $$
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
    $$ LANGUAGE plpgsql
  `.execute(db)
  await sql`CREATE CONSTRAINT TRIGGER trg_validate_intake_status_agency AFTER INSERT OR UPDATE OF egcs_fi_status, egcs_fi_fundingopportunity ON "Funding_Case_Intake_Profile" DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_intake_status_agency()`.execute(db)
}

export const down = async (db: Kysely<Database>): Promise<void> => {
  await sql`DROP TABLE "Funding_Case_Intake_Profile"`.execute(db)
  await sql`DROP FUNCTION trg_fn_validate_intake_status_agency()`.execute(db)
  await sql`DROP TABLE "Funding_Opportunity_Workflow"`.execute(db)
  await sql`DROP TABLE "Funding_Opportunity_Review_Set"`.execute(db)
  await sql`DROP TABLE "Funding_Opportunity_Profile"`.execute(db)
  await sql`DELETE FROM role_permission WHERE subject = 'funding_case'`.execute(db)
  await sql`ALTER TABLE role_permission DROP CONSTRAINT role_permission_assignment_subject_check`.execute(db)
  await sql`ALTER TABLE role_permission ADD CONSTRAINT role_permission_assignment_subject_check CHECK (can_manage_assignments = false OR subject IN ('agreement', 'applicant_recipient'))`.execute(db)
  await sql`ALTER TABLE role_permission DROP CONSTRAINT role_permission_subject_check`.execute(db)
  await sql`ALTER TABLE role_permission ADD CONSTRAINT role_permission_subject_check CHECK (subject IN ('audit', 'system', 'agency', 'transfer_payment', 'role', 'user', 'group', 'agreement', 'applicant_recipient'))`.execute(db)
  await sql`DROP TRIGGER trg_lock_entity_type ON "Common_Entity_Type"`.execute(db)
  await sql`UPDATE "Common_Entity_Type" SET egcs_cn_approvalsubmission = 'none', egcs_cn_standardworkflow = 'none', egcs_cn_ownerkind = NULL, egcs_cn_assignmentmode = NULL WHERE egcs_cn_type = 'fundingcaseintake'`.execute(db)
  await sql`CREATE TRIGGER trg_lock_entity_type BEFORE UPDATE OR DELETE ON "Common_Entity_Type" FOR EACH ROW EXECUTE FUNCTION trg_fn_lock_entity_type()`.execute(db)
  await sql`ALTER TABLE "Common_Entity_Type" DROP CONSTRAINT cn_chk_entitytypeowner`.execute(db)
  await sql`ALTER TABLE "Common_Entity_Type" ADD CONSTRAINT cn_chk_entitytypeowner CHECK ((egcs_cn_ownerkind IS NULL OR egcs_cn_ownerkind IN ('agreement', 'proponent', 'runtime_source')) AND (egcs_cn_assignmentmode IS NULL OR egcs_cn_assignmentmode IN ('independent', 'inherited')))`.execute(db)
}
