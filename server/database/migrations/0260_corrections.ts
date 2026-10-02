import { sql, type Kysely } from 'kysely'
import type { Database } from '../../../shared/types/database'
import { installAuditOwnershipFunctions } from '../audit-ownership-functions'
import { AUDIT_TABLE_OWNERSHIP } from '../audit-ownership-registry'

const correctionTables = [
  'Funding_Case_Agreement_Correction',
  'Funding_Case_Agreement_Correction_Line',
  'Funding_Case_Agreement_Correction_Source',
  'Funding_Case_Agreement_Correction_Adjustment',
  'Funding_Case_Agreement_Correction_Notification'
] as const

const correctionFinancialTables = [
  'Funding_Case_Agreement_Payment', 'Funding_Case_Agreement_Payment_Line',
  'Funding_Case_Agreement_Commitment', 'Funding_Case_Agreement_Commitment_Line',
  'Funding_Case_Agreement_Journal_Voucher', 'Funding_Case_Agreement_Journal_Voucher_Line',
  'Funding_Case_Agreement_Budget_Version', 'Funding_Case_Agreement_Budget_Fiscal_Year',
  'Funding_Case_Agreement_Budget_Line_Item', 'Funding_Case_Agreement_Budget_Line_Item_Funding',
  'Funding_Case_Agreement_Closeout', 'Common_Completion', 'Common_Runtime'
] as const

/** Adds separately attributable signed adjustments, preserving deployed source records. */
export const up = async (db: Kysely<Database>): Promise<void> => {
  await sql`SET CONSTRAINTS ALL IMMEDIATE`.execute(db)
  await sql`SET CONSTRAINTS ALL DEFERRED`.execute(db)
  await sql`ALTER TABLE "Agency_Profile" ADD COLUMN egcs_ay_correctioncreatorapproval boolean NOT NULL DEFAULT false`.execute(db)
  // Composite FK checks use PostgreSQL's referential-integrity snapshots, including
  // concurrent rows invisible to a REPEATABLE READ metadata transaction.
  await sql`ALTER TABLE "Common_Status" ADD CONSTRAINT cn_uq_correction_status_owner UNIQUE (id,egcs_cn_agency,_deleted)`.execute(db)
  await sql`ALTER TABLE "Common_Status" ADD CONSTRAINT cn_uq_correction_status_terminal UNIQUE (id,egcs_cn_terminal)`.execute(db)
  await sql`ALTER TABLE role_permission DROP CONSTRAINT role_permission_subject_check`.execute(db)
  await sql`ALTER TABLE role_permission ADD CONSTRAINT role_permission_subject_check CHECK (subject IN ('audit','system','agency','transfer_payment','role','user','group','agreement','applicant_recipient','funding_case','journal_voucher','correction'))`.execute(db)
  await sql`ALTER TABLE role_permission DROP CONSTRAINT role_permission_assignment_subject_check`.execute(db)
  await sql`ALTER TABLE role_permission ADD CONSTRAINT role_permission_assignment_subject_check CHECK (can_manage_assignments = false OR subject IN ('agreement','applicant_recipient','funding_case','journal_voucher','correction'))`.execute(db)
  // No existing role acquires Correction permissions.
  await sql`INSERT INTO "Common_Entity_Type" (egcs_cn_type,egcs_cn_localtype,egcs_cn_label_en,egcs_cn_label_fr,
    egcs_cn_completion,egcs_cn_approvalsubmission,egcs_cn_standardworkflow,egcs_cn_riskrating,
    egcs_cn_supportsdirectreviews,egcs_cn_ownerkind,egcs_cn_assignmentmode)
    VALUES ('fundingcasecorrection','fundingcasecorrection','Correction','Correction',
      'supported','on_completion','explicit','none',true,'agreement','independent') ON CONFLICT (egcs_cn_type) DO NOTHING`.execute(db)
  await sql`CREATE TABLE "Funding_Case_Agreement_Correction" (
    id bigint PRIMARY KEY REFERENCES "Common_Entity"(id) ON DELETE RESTRICT,
    egcs_fc_fundingagreement bigint NOT NULL REFERENCES "Funding_Case_Agreement_Profile"(id) ON DELETE RESTRICT,
    egcs_fc_commitment bigint NOT NULL,
    egcs_fc_number integer NOT NULL CHECK (egcs_fc_number > 0),
    egcs_fc_agreementnumber text NOT NULL,
    egcs_fc_currency currency_codes NOT NULL,
    egcs_fc_requesteddate date NOT NULL,
    egcs_fc_narrative_en text NOT NULL DEFAULT '',
    egcs_fc_narrative_fr text NOT NULL DEFAULT '',
    egcs_fc_linkedcorrection bigint,
    egcs_fc_createdby bigint NOT NULL REFERENCES "Common_User"(id) ON DELETE RESTRICT,
    egcs_fc_createdat timestamptz NOT NULL DEFAULT now(),
    egcs_fc_status bigint NOT NULL REFERENCES "Common_Status"(id) ON DELETE RESTRICT,
    egcs_fc_statusagency bigint NOT NULL,
    egcs_fc_outcome varchar(16) NOT NULL DEFAULT 'open' CHECK (egcs_fc_outcome IN ('open','posted','denied','failed','cancelled')),
    egcs_fc_postedat timestamptz,
    egcs_fc_postingruntime bigint REFERENCES "Common_Runtime"(id) ON DELETE RESTRICT,
    egcs_fc_terminalby bigint REFERENCES "Common_User"(id) ON DELETE RESTRICT,
    egcs_fc_terminalat timestamptz,
    egcs_fc_terminalreason text,
    _deleted boolean NOT NULL DEFAULT false,
    egcs_fc_statusterminal boolean GENERATED ALWAYS AS (CASE WHEN _deleted THEN NULL ELSE egcs_fc_outcome <> 'open' END) STORED,
    egcs_fc_statusdeleted boolean GENERATED ALWAYS AS (CASE WHEN _deleted THEN NULL ELSE false END) STORED,
    CONSTRAINT fc_uq_correction_agreement UNIQUE (id,egcs_fc_fundingagreement),
    CONSTRAINT fc_uq_correction_number UNIQUE (egcs_fc_fundingagreement,egcs_fc_number),
    CONSTRAINT fc_fk_correction_commitment FOREIGN KEY (egcs_fc_commitment,egcs_fc_fundingagreement)
      REFERENCES "Funding_Case_Agreement_Commitment"(id,egcs_fc_fundingagreement) ON DELETE RESTRICT,
    CONSTRAINT fc_fk_correction_link FOREIGN KEY (egcs_fc_linkedcorrection,egcs_fc_fundingagreement)
      REFERENCES "Funding_Case_Agreement_Correction"(id,egcs_fc_fundingagreement) ON DELETE RESTRICT,
    CONSTRAINT cn_chk_correction_status_in_use FOREIGN KEY (egcs_fc_status,egcs_fc_statusagency,egcs_fc_statusdeleted)
      REFERENCES "Common_Status"(id,egcs_cn_agency,_deleted) DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT cn_chk_correction_status_outcome FOREIGN KEY (egcs_fc_status,egcs_fc_statusterminal)
      REFERENCES "Common_Status"(id,egcs_cn_terminal) DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT fc_chk_correction_self CHECK (id IS DISTINCT FROM egcs_fc_linkedcorrection),
    CONSTRAINT fc_chk_correction_posting CHECK ((egcs_fc_outcome = 'posted') = (egcs_fc_postedat IS NOT NULL AND egcs_fc_postingruntime IS NOT NULL)),
    CONSTRAINT fc_chk_correction_terminal CHECK ((egcs_fc_outcome = 'open') = (egcs_fc_terminalat IS NULL))
  )`.execute(db)
  await sql`CREATE UNIQUE INDEX fc_uq_correction_open ON "Funding_Case_Agreement_Correction"(egcs_fc_fundingagreement) WHERE _deleted = false AND egcs_fc_outcome = 'open'`.execute(db)
  await sql`CREATE TRIGGER trg_register_fundingcasecorrection BEFORE INSERT ON "Funding_Case_Agreement_Correction" FOR EACH ROW EXECUTE FUNCTION register_entity('fundingcasecorrection')`.execute(db)
  await sql`CREATE TRIGGER trg_soft_delete_correction_assignments AFTER UPDATE OF _deleted ON "Funding_Case_Agreement_Correction" FOR EACH ROW EXECUTE FUNCTION trg_fn_soft_delete_entity_assignments('fundingcasecorrection')`.execute(db)
  await sql`CREATE CONSTRAINT TRIGGER trg_enforce_correction_roster AFTER INSERT OR UPDATE OF _deleted ON "Funding_Case_Agreement_Correction" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_assignable_entity_roster('fundingcasecorrection')`.execute(db)
  await sql`CREATE TABLE "Funding_Case_Agreement_Correction_Line" (
    id bigserial PRIMARY KEY,
    egcs_fc_correction bigint NOT NULL,
    egcs_fc_fundingagreement bigint NOT NULL,
    egcs_fc_commitmentline bigint NOT NULL REFERENCES "Funding_Case_Agreement_Commitment_Line"(id) ON DELETE RESTRICT,
    egcs_fc_commitmentlinenumber integer NOT NULL,
    egcs_fc_chartofaccount bigint NOT NULL REFERENCES "Transfer_Payment_Stream_Chart_of_Account"(id) ON DELETE RESTRICT,
    egcs_fc_agencyfiscalyear bigint NOT NULL REFERENCES "Agency_Fiscal_Year"(id) ON DELETE RESTRICT,
    egcs_fc_fiscalyeardisplay text NOT NULL,
    egcs_fc_accountingdimensions jsonb NOT NULL CHECK (jsonb_typeof(egcs_fc_accountingdimensions) = 'array'),
    egcs_fc_commitmentamount numeric(19,2) NOT NULL CHECK (egcs_fc_commitmentamount >= 0),
    egcs_fc_originalpaid numeric(19,2) NOT NULL CHECK (egcs_fc_originalpaid >= 0),
    egcs_fc_jveffect numeric(19,2) NOT NULL,
    egcs_fc_priorcorrections numeric(19,2) NOT NULL,
    egcs_fc_adjustment numeric(19,2) NOT NULL DEFAULT 0,
    _deleted boolean NOT NULL DEFAULT false,
    CONSTRAINT fc_uq_correction_line_root UNIQUE (id,egcs_fc_correction,egcs_fc_fundingagreement),
    CONSTRAINT fc_fk_correction_line_root FOREIGN KEY (egcs_fc_correction,egcs_fc_fundingagreement)
      REFERENCES "Funding_Case_Agreement_Correction"(id,egcs_fc_fundingagreement) ON DELETE RESTRICT
  )`.execute(db)
  await sql`CREATE UNIQUE INDEX fc_uq_correction_line_active ON "Funding_Case_Agreement_Correction_Line"(egcs_fc_correction,egcs_fc_commitmentline) WHERE _deleted = false`.execute(db)
  await sql`CREATE TABLE "Funding_Case_Agreement_Correction_Source" (
    id bigserial PRIMARY KEY,
    egcs_fc_correction bigint NOT NULL,
    egcs_fc_fundingagreement bigint NOT NULL,
    egcs_fc_payment bigint NOT NULL,
    egcs_fc_evidence jsonb NOT NULL CHECK (jsonb_typeof(egcs_fc_evidence) = 'object' AND egcs_fc_evidence ? 'header' AND jsonb_typeof(egcs_fc_evidence->'allocations') = 'array'),
    _deleted boolean NOT NULL DEFAULT false,
    CONSTRAINT fc_fk_correction_source_root FOREIGN KEY (egcs_fc_correction,egcs_fc_fundingagreement)
      REFERENCES "Funding_Case_Agreement_Correction"(id,egcs_fc_fundingagreement) ON DELETE RESTRICT,
    CONSTRAINT fc_fk_correction_source_payment FOREIGN KEY (egcs_fc_payment,egcs_fc_fundingagreement)
      REFERENCES "Funding_Case_Agreement_Payment"(id,egcs_fc_fundingagreement) ON DELETE RESTRICT
  )`.execute(db)
  await sql`CREATE UNIQUE INDEX fc_uq_correction_source_active ON "Funding_Case_Agreement_Correction_Source"(egcs_fc_correction,egcs_fc_payment) WHERE _deleted = false`.execute(db)
  await sql`CREATE TABLE "Funding_Case_Agreement_Correction_Adjustment" (
    id bigserial PRIMARY KEY,
    egcs_fc_correction bigint NOT NULL,
    egcs_fc_fundingagreement bigint NOT NULL,
    egcs_fc_correctionline bigint NOT NULL,
    egcs_fc_commitmentline bigint NOT NULL REFERENCES "Funding_Case_Agreement_Commitment_Line"(id) ON DELETE RESTRICT,
    egcs_fc_chartofaccount bigint NOT NULL REFERENCES "Transfer_Payment_Stream_Chart_of_Account"(id) ON DELETE RESTRICT,
    egcs_fc_agencyfiscalyear bigint NOT NULL REFERENCES "Agency_Fiscal_Year"(id) ON DELETE RESTRICT,
    egcs_fc_amount numeric(19,2) NOT NULL CHECK (egcs_fc_amount <> 0),
    _deleted boolean NOT NULL DEFAULT false,
    CONSTRAINT fc_fk_correction_adjustment_root FOREIGN KEY (egcs_fc_correction,egcs_fc_fundingagreement)
      REFERENCES "Funding_Case_Agreement_Correction"(id,egcs_fc_fundingagreement) ON DELETE RESTRICT,
    CONSTRAINT fc_fk_correction_adjustment_line FOREIGN KEY (egcs_fc_correctionline,egcs_fc_correction,egcs_fc_fundingagreement)
      REFERENCES "Funding_Case_Agreement_Correction_Line"(id,egcs_fc_correction,egcs_fc_fundingagreement) ON DELETE RESTRICT
  )`.execute(db)
  await sql`CREATE INDEX fc_idx_correction_adjustment_agreement ON "Funding_Case_Agreement_Correction_Adjustment"(egcs_fc_fundingagreement,egcs_fc_agencyfiscalyear) WHERE _deleted = false`.execute(db)
  await sql`CREATE UNIQUE INDEX fc_uq_correction_adjustment_active ON "Funding_Case_Agreement_Correction_Adjustment"(egcs_fc_correctionline) WHERE _deleted = false`.execute(db)
  await sql`CREATE TABLE "Funding_Case_Agreement_Correction_Notification" (
    id bigserial PRIMARY KEY,
    egcs_fc_correction bigint NOT NULL REFERENCES "Funding_Case_Agreement_Correction"(id) ON DELETE RESTRICT,
    egcs_fc_user bigint NOT NULL REFERENCES "Common_User"(id) ON DELETE RESTRICT,
    egcs_fc_outcome varchar(16) NOT NULL CHECK (egcs_fc_outcome IN ('posted','denied','failed','cancelled')),
    egcs_fc_recordedat timestamptz NOT NULL DEFAULT now(),
    egcs_fc_runtime bigint REFERENCES "Common_Runtime"(id) ON DELETE RESTRICT,
    _deleted boolean NOT NULL DEFAULT false,
    CONSTRAINT fc_uq_correction_notification UNIQUE (egcs_fc_correction,egcs_fc_user)
  )`.execute(db)
  await sql`CREATE FUNCTION correction_has_lifecycle_evidence(root_id bigint) RETURNS boolean AS $$
    SELECT EXISTS (SELECT 1 FROM "Common_Completion" WHERE egcs_cn_entitytype = 'fundingcasecorrection' AND egcs_cn_entityid = root_id)
      OR EXISTS (SELECT 1 FROM "Common_Runtime" WHERE egcs_cn_entitytype = 'fundingcasecorrection' AND egcs_cn_entityid = root_id)
      OR EXISTS (SELECT 1 FROM "Common_Routing_Slip" WHERE egcs_cn_entitytype = 'fundingcasecorrection' AND egcs_cn_entityid = root_id)
    $$ LANGUAGE sql STABLE`.execute(db)
  await sql`CREATE FUNCTION trg_fn_validate_correction() RETURNS trigger AS $$
    DECLARE owner_agency bigint; definition record;
    BEGIN
      IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Correction evidence must be retained' USING ERRCODE = '23514'; END IF;
      PERFORM id FROM "Funding_Case_Agreement_Profile" WHERE id = NEW.egcs_fc_fundingagreement FOR UPDATE;
      SELECT p.egcs_tp_agency INTO owner_agency FROM "Funding_Case_Agreement_Profile" a
        JOIN "Transfer_Payment_Stream" s ON s.id = a.egcs_fc_transferpaymentstream
        JOIN "Transfer_Payment_Profile" p ON p.id = s.egcs_tp_transferpaymentprofile WHERE a.id = NEW.egcs_fc_fundingagreement;
      SELECT * INTO definition FROM "Common_Status" WHERE id = NEW.egcs_fc_status AND _deleted = false FOR KEY SHARE;
      IF owner_agency IS NULL OR definition.egcs_cn_agency IS DISTINCT FROM owner_agency
        OR (TG_OP = 'INSERT' AND (NOT definition.egcs_cn_isdraft OR NEW.egcs_fc_outcome <> 'open')) THEN
        RAISE EXCEPTION 'Correction must have an Agency-owned status and start Draft' USING ERRCODE = '23514';
      END IF;
      IF TG_OP = 'UPDATE' THEN
        IF NEW.egcs_fc_statusagency IS DISTINCT FROM OLD.egcs_fc_statusagency THEN
          RAISE EXCEPTION 'Correction status owner is protected' USING ERRCODE = '23514';
        END IF;
        -- Stored generated columns are unavailable in NEW during BEFORE triggers.
        IF OLD.egcs_fc_outcome <> 'open' AND
          (to_jsonb(NEW) - ARRAY['egcs_fc_statusterminal','egcs_fc_statusdeleted'])
          IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['egcs_fc_statusterminal','egcs_fc_statusdeleted']) THEN
          RAISE EXCEPTION 'Terminal Corrections are immutable' USING ERRCODE = '23514';
        END IF;
        IF (OLD.id,OLD.egcs_fc_fundingagreement,OLD.egcs_fc_commitment,OLD.egcs_fc_number,OLD.egcs_fc_agreementnumber,OLD.egcs_fc_currency,OLD.egcs_fc_createdby,OLD.egcs_fc_createdat)
          IS DISTINCT FROM (NEW.id,NEW.egcs_fc_fundingagreement,NEW.egcs_fc_commitment,NEW.egcs_fc_number,NEW.egcs_fc_agreementnumber,NEW.egcs_fc_currency,NEW.egcs_fc_createdby,NEW.egcs_fc_createdat) THEN
          RAISE EXCEPTION 'Correction identity and attribution are immutable' USING ERRCODE = '23514';
        END IF;
        IF correction_has_lifecycle_evidence(OLD.id) AND
          (to_jsonb(OLD) - ARRAY['egcs_fc_status','egcs_fc_outcome','egcs_fc_postedat','egcs_fc_postingruntime','egcs_fc_terminalby','egcs_fc_terminalat','egcs_fc_terminalreason','egcs_fc_statusterminal','egcs_fc_statusdeleted'])
          IS DISTINCT FROM
          (to_jsonb(NEW) - ARRAY['egcs_fc_status','egcs_fc_outcome','egcs_fc_postedat','egcs_fc_postingruntime','egcs_fc_terminalby','egcs_fc_terminalat','egcs_fc_terminalreason','egcs_fc_statusterminal','egcs_fc_statusdeleted']) THEN
          RAISE EXCEPTION 'Submitted Correction content is immutable' USING ERRCODE = '23514';
        END IF;
        IF NEW._deleted AND NOT OLD._deleted AND (NOT definition.egcs_cn_isdraft OR correction_has_lifecycle_evidence(OLD.id)) THEN
          RAISE EXCEPTION 'Only unsubmitted Correction Drafts may be deleted' USING ERRCODE = '23514';
        END IF;
      END IF;
      NEW.egcs_fc_statusagency := owner_agency;
      RETURN NEW;
    END $$ LANGUAGE plpgsql`.execute(db)
  await sql`CREATE TRIGGER trg_validate_correction BEFORE INSERT OR UPDATE OR DELETE ON "Funding_Case_Agreement_Correction" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_correction()`.execute(db)
  await sql`CREATE FUNCTION trg_fn_protect_correction_content() RETURNS trigger AS $$
    DECLARE root_id bigint; root record; owner_agency bigint;
    BEGIN
      root_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.egcs_fc_correction ELSE NEW.egcs_fc_correction END;
      SELECT * INTO root FROM "Funding_Case_Agreement_Correction" WHERE id = root_id FOR UPDATE;
      IF root.egcs_fc_outcome <> 'open' OR correction_has_lifecycle_evidence(root_id) THEN
        RAISE EXCEPTION 'Submitted Correction evidence is immutable' USING ERRCODE = '23514';
      END IF;
      IF TG_OP = 'UPDATE' AND (OLD.egcs_fc_correction,OLD.egcs_fc_fundingagreement) IS DISTINCT FROM (NEW.egcs_fc_correction,NEW.egcs_fc_fundingagreement) THEN
        RAISE EXCEPTION 'Correction evidence cannot move between roots' USING ERRCODE = '23514';
      END IF;
      IF TG_OP <> 'DELETE' AND TG_TABLE_NAME = 'Funding_Case_Agreement_Correction_Line' THEN
        SELECT p.egcs_tp_agency INTO owner_agency FROM "Funding_Case_Agreement_Profile" a
          JOIN "Transfer_Payment_Stream" s ON s.id = a.egcs_fc_transferpaymentstream
          JOIN "Transfer_Payment_Profile" p ON p.id = s.egcs_tp_transferpaymentprofile WHERE a.id = root.egcs_fc_fundingagreement;
        IF NOT EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Commitment_Line" l
          JOIN "Transfer_Payment_Stream_Chart_of_Account" original ON original.id = l.egcs_fc_transferpaymentstreamchartofaccount
          JOIN "Transfer_Payment_Stream_Chart_of_Account" retained ON retained.id = NEW.egcs_fc_chartofaccount
          JOIN "Transfer_Payment_Stream" retained_stream ON retained_stream.id = retained.egcs_tp_transferpaymentstream
          JOIN "Transfer_Payment_Profile" retained_program ON retained_program.id = retained_stream.egcs_tp_transferpaymentprofile
          JOIN "Agency_Chart_of_Account" account ON account.id = retained.egcs_tp_agencychartofaccount
          JOIN "Agency_Fiscal_Year" fiscal ON fiscal.id = NEW.egcs_fc_agencyfiscalyear
          WHERE l.id = NEW.egcs_fc_commitmentline AND l.egcs_fc_commitment = root.egcs_fc_commitment
            AND l.egcs_fc_fundingagreement = NEW.egcs_fc_fundingagreement
            AND original.egcs_tp_agencychartofaccount = retained.egcs_tp_agencychartofaccount
            AND retained_program.egcs_tp_agency = owner_agency AND account.egcs_ay_organizationagency = owner_agency
            AND account.egcs_ay_fiscalyear = fiscal.id AND fiscal.egcs_ay_organizationagency = owner_agency) THEN
          RAISE EXCEPTION 'Correction line must retain owning Commitment and Agency coding lineage' USING ERRCODE = '23514';
        END IF;
      END IF;
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
      RETURN NEW;
    END $$ LANGUAGE plpgsql`.execute(db)
  for (const table of ['Funding_Case_Agreement_Correction_Line','Funding_Case_Agreement_Correction_Source']) {
    await sql`CREATE TRIGGER trg_protect_correction_content BEFORE INSERT OR UPDATE OR DELETE ON ${sql.table(table)} FOR EACH ROW EXECUTE FUNCTION trg_fn_protect_correction_content()`.execute(db)
  }
  await sql`CREATE FUNCTION trg_fn_protect_correction_roster() RETURNS trigger AS $$
    DECLARE root_id bigint; target_type text; root record;
    BEGIN
      root_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.egcs_cn_entityid ELSE NEW.egcs_cn_entityid END;
      target_type := CASE WHEN TG_OP = 'DELETE' THEN OLD.egcs_cn_entitytype ELSE NEW.egcs_cn_entitytype END;
      IF target_type <> 'fundingcasecorrection' THEN IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW; END IF;
      SELECT * INTO root FROM "Funding_Case_Agreement_Correction" WHERE id = root_id FOR UPDATE;
      IF root.egcs_fc_outcome <> 'open' OR correction_has_lifecycle_evidence(root_id) THEN
        RAISE EXCEPTION 'Submitted Correction roster is immutable' USING ERRCODE = '23514';
      END IF;
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
      RETURN NEW;
    END $$ LANGUAGE plpgsql`.execute(db)
  await sql`CREATE TRIGGER trg_protect_correction_roster BEFORE INSERT OR UPDATE OR DELETE ON "Common_Entity_Assignment" FOR EACH ROW EXECUTE FUNCTION trg_fn_protect_correction_roster()`.execute(db)
  await sql`CREATE FUNCTION trg_fn_protect_correction_posting() RETURNS trigger AS $$
    BEGIN
      IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Posted Correction evidence is immutable' USING ERRCODE = '23514'; END IF;
      RETURN NEW;
    END $$ LANGUAGE plpgsql`.execute(db)
  for (const table of ['Funding_Case_Agreement_Correction_Adjustment','Funding_Case_Agreement_Correction_Notification']) {
    await sql`CREATE TRIGGER trg_protect_correction_posting BEFORE UPDATE OR DELETE ON ${sql.table(table)} FOR EACH ROW EXECUTE FUNCTION trg_fn_protect_correction_posting()`.execute(db)
  }
  await sql`CREATE FUNCTION trg_fn_validate_correction_posting() RETURNS trigger AS $$
    DECLARE root_id bigint; root record;
    BEGIN
      IF TG_TABLE_NAME = 'Funding_Case_Agreement_Correction' THEN root_id := NEW.id; ELSE root_id := NEW.egcs_fc_correction; END IF;
      SELECT * INTO root FROM "Funding_Case_Agreement_Correction" WHERE id = root_id;
      IF NOT root._deleted AND root.egcs_fc_outcome = 'open' AND EXISTS (SELECT 1 FROM "Common_Status" WHERE id = root.egcs_fc_status AND egcs_cn_terminal) THEN
        RAISE EXCEPTION 'Open Corrections require a nonterminal Agency status' USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_correction_status_outcome';
      END IF;
      IF NOT root._deleted AND root.egcs_fc_outcome <> 'open' AND NOT EXISTS (SELECT 1 FROM "Common_Status" WHERE id = root.egcs_fc_status AND egcs_cn_terminal) THEN
        RAISE EXCEPTION 'Terminal Correction outcomes require a terminal Agency status' USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_correction_status_outcome';
      END IF;
      IF root.egcs_fc_outcome = 'posted' THEN
        IF NOT EXISTS (SELECT 1 FROM "Common_Runtime" runtime
          JOIN "Common_Workflow_Run" run ON run.id = runtime.id
          JOIN "Common_Completion" completion ON completion.id = run.egcs_cn_completion
          WHERE runtime.id = root.egcs_fc_postingruntime AND runtime.egcs_cn_kind = 'workflow'
            AND runtime.egcs_cn_entitytype = 'fundingcasecorrection' AND runtime.egcs_cn_entityid = root_id
            AND runtime.egcs_cn_purpose = 'approval_submission' AND runtime.egcs_cn_state IN ('succeeded','approved')
            AND completion.egcs_cn_entitytype = 'fundingcasecorrection' AND completion.egcs_cn_entityid = root_id
            AND completion.egcs_cn_disposition = 'workflow_started'
            AND NOT runtime._deleted AND NOT completion._deleted) THEN
          RAISE EXCEPTION 'Correction posting requires its successful Completion-linked approval submission' USING ERRCODE = '23514';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Correction_Line" WHERE egcs_fc_correction = root_id AND NOT _deleted AND egcs_fc_adjustment <> 0)
          OR EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Correction_Line" line
            LEFT JOIN "Funding_Case_Agreement_Correction_Adjustment" adjustment ON adjustment.egcs_fc_correctionline = line.id AND NOT adjustment._deleted
            WHERE line.egcs_fc_correction = root_id AND NOT line._deleted AND
              ((line.egcs_fc_adjustment <> 0 AND (adjustment.id IS NULL OR adjustment.egcs_fc_amount <> line.egcs_fc_adjustment))
               OR (line.egcs_fc_adjustment = 0 AND adjustment.id IS NOT NULL))) THEN
          RAISE EXCEPTION 'Correction posting must contain every nonzero signed adjustment exactly once' USING ERRCODE = '23514';
        END IF;
      ELSIF EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Correction_Adjustment" WHERE egcs_fc_correction = root_id) THEN
        RAISE EXCEPTION 'Only posted Corrections may have adjustment entries' USING ERRCODE = '23514';
      END IF;
      IF EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Correction_Adjustment" adjustment
        JOIN "Funding_Case_Agreement_Correction_Line" line ON line.id = adjustment.egcs_fc_correctionline
        WHERE adjustment.egcs_fc_correction = root_id AND
          (adjustment._deleted OR line._deleted OR adjustment.egcs_fc_commitmentline <> line.egcs_fc_commitmentline
            OR adjustment.egcs_fc_chartofaccount <> line.egcs_fc_chartofaccount
            OR adjustment.egcs_fc_agencyfiscalyear <> line.egcs_fc_agencyfiscalyear)) THEN
        RAISE EXCEPTION 'Correction posting must preserve captured line lineage' USING ERRCODE = '23514';
      END IF;
      IF EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Correction_Notification" notification
        WHERE notification.egcs_fc_correction = root_id AND (root.egcs_fc_outcome = 'open' OR notification.egcs_fc_outcome <> root.egcs_fc_outcome)) THEN
        RAISE EXCEPTION 'Correction outcome notifications must match retained outcome' USING ERRCODE = '23514';
      END IF;
      RETURN NULL;
    END $$ LANGUAGE plpgsql`.execute(db)
  for (const table of ['Funding_Case_Agreement_Correction','Funding_Case_Agreement_Correction_Adjustment','Funding_Case_Agreement_Correction_Notification']) {
    await sql`CREATE CONSTRAINT TRIGGER trg_validate_correction_posting AFTER INSERT OR UPDATE ON ${sql.table(table)} DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_correction_posting()`.execute(db)
  }
  await sql`CREATE FUNCTION trg_fn_correction_financial_lock() RETURNS trigger AS $$
    DECLARE row_data jsonb; agreement_id bigint; version record; target_type text; target_id bigint;
    BEGIN
      IF TG_OP = 'UPDATE' AND to_jsonb(OLD) = to_jsonb(NEW) THEN RETURN NEW; END IF;
      FOR row_data IN SELECT value FROM jsonb_array_elements(
        CASE WHEN TG_OP = 'INSERT' THEN jsonb_build_array(to_jsonb(NEW))
          WHEN TG_OP = 'DELETE' THEN jsonb_build_array(to_jsonb(OLD))
          ELSE jsonb_build_array(to_jsonb(OLD),to_jsonb(NEW)) END
      ) LOOP
        agreement_id := NULL;
        CASE TG_TABLE_NAME
          WHEN 'Funding_Case_Agreement_Payment','Funding_Case_Agreement_Commitment','Funding_Case_Agreement_Journal_Voucher' THEN
            agreement_id := (row_data->>'egcs_fc_fundingagreement')::bigint;
          WHEN 'Funding_Case_Agreement_Payment_Line' THEN
            SELECT egcs_fc_fundingagreement INTO agreement_id FROM "Funding_Case_Agreement_Payment"
              WHERE id = (row_data->>'egcs_fc_fundingagreementpayment')::bigint;
          WHEN 'Funding_Case_Agreement_Commitment_Line' THEN
            SELECT egcs_fc_fundingagreement INTO agreement_id FROM "Funding_Case_Agreement_Commitment"
              WHERE id = (row_data->>'egcs_fc_commitment')::bigint;
          WHEN 'Funding_Case_Agreement_Journal_Voucher_Line' THEN
            SELECT egcs_fc_fundingagreement INTO agreement_id FROM "Funding_Case_Agreement_Journal_Voucher"
              WHERE id = (row_data->>'egcs_fc_journalvoucher')::bigint;
          WHEN 'Funding_Case_Agreement_Budget_Version' THEN
            IF (row_data->>'egcs_fc_iscurrent')::boolean = false AND row_data->>'egcs_fc_amendment' IS NOT NULL THEN CONTINUE; END IF;
            agreement_id := (row_data->>'egcs_fc_fundingagreement')::bigint;
          WHEN 'Funding_Case_Agreement_Budget_Fiscal_Year' THEN
            SELECT * INTO version FROM "Funding_Case_Agreement_Budget_Version" WHERE id = (row_data->>'egcs_fc_budgetversion')::bigint;
            IF version.egcs_fc_iscurrent = false AND version.egcs_fc_amendment IS NOT NULL THEN CONTINUE; END IF;
            agreement_id := COALESCE(version.egcs_fc_fundingagreement,(row_data->>'egcs_fc_fundingagreement')::bigint);
          WHEN 'Funding_Case_Agreement_Budget_Line_Item' THEN
            SELECT v.* INTO version FROM "Funding_Case_Agreement_Budget_Fiscal_Year" y
              JOIN "Funding_Case_Agreement_Budget_Version" v ON v.id = y.egcs_fc_budgetversion
              WHERE y.id = (row_data->>'egcs_fc_fundingagreementbudgetfiscalyear')::bigint;
            IF version.egcs_fc_iscurrent = false AND version.egcs_fc_amendment IS NOT NULL THEN CONTINUE; END IF;
            agreement_id := COALESCE(version.egcs_fc_fundingagreement,(row_data->>'egcs_fc_fundingagreement')::bigint);
          WHEN 'Funding_Case_Agreement_Budget_Line_Item_Funding' THEN
            SELECT v.* INTO version FROM "Funding_Case_Agreement_Budget_Line_Item" l
              JOIN "Funding_Case_Agreement_Budget_Version" v ON v.id = l.egcs_fc_budgetversion
              WHERE l.id = (row_data->>'egcs_fc_budgetlineitem')::bigint;
            IF version.egcs_fc_iscurrent = false AND version.egcs_fc_amendment IS NOT NULL THEN CONTINUE; END IF;
            agreement_id := version.egcs_fc_fundingagreement;
          WHEN 'Funding_Case_Agreement_Closeout' THEN
            IF NOT EXISTS (SELECT 1 FROM "Common_Status" WHERE id = (row_data->>'egcs_fc_status')::bigint AND egcs_cn_terminal) THEN CONTINUE; END IF;
            agreement_id := (row_data->>'egcs_fc_fundingagreement')::bigint;
          WHEN 'Common_Completion','Common_Runtime' THEN
            target_type := row_data->>'egcs_cn_entitytype';
            target_id := (row_data->>'egcs_cn_entityid')::bigint;
            CASE target_type
              WHEN 'fundingcasepayment' THEN SELECT egcs_fc_fundingagreement INTO agreement_id FROM "Funding_Case_Agreement_Payment" WHERE id = target_id;
              WHEN 'fundingcaseagreementcommitment' THEN SELECT egcs_fc_fundingagreement INTO agreement_id FROM "Funding_Case_Agreement_Commitment" WHERE id = target_id;
              WHEN 'fundingcasejournalvoucher' THEN SELECT egcs_fc_fundingagreement INTO agreement_id FROM "Funding_Case_Agreement_Journal_Voucher" WHERE id = target_id;
              WHEN 'fundingcaseagreementcloseout' THEN SELECT egcs_fc_fundingagreement INTO agreement_id FROM "Funding_Case_Agreement_Closeout" WHERE id = target_id;
              ELSE CONTINUE;
            END CASE;
          ELSE CONTINUE;
        END CASE;
        IF agreement_id IS NOT NULL THEN
          PERFORM id FROM "Funding_Case_Agreement_Profile" WHERE id = agreement_id FOR UPDATE;
          IF EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Correction" WHERE egcs_fc_fundingagreement = agreement_id AND egcs_fc_outcome = 'open' AND NOT _deleted) THEN
            RAISE EXCEPTION 'An open Correction locks Agreement financial activity' USING ERRCODE = '23514';
          END IF;
        END IF;
      END LOOP;
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
      RETURN NEW;
    END $$ LANGUAGE plpgsql`.execute(db)
  for (const table of correctionFinancialTables) {
    await sql`CREATE TRIGGER trg_correction_financial_lock BEFORE INSERT OR UPDATE OR DELETE ON ${sql.table(table)} FOR EACH ROW EXECUTE FUNCTION trg_fn_correction_financial_lock()`.execute(db)
  }
  await sql`CREATE FUNCTION trg_fn_enforce_correction_completion() RETURNS trigger AS $$
    BEGIN
      IF NEW.egcs_cn_entitytype = 'fundingcasecorrection' THEN
        IF NEW.egcs_cn_disposition <> 'workflow_started' OR NOT EXISTS (
          SELECT 1 FROM "Common_Workflow_Run" run JOIN "Common_Runtime" runtime ON runtime.id = run.id
          WHERE run.egcs_cn_completion = NEW.id AND runtime.egcs_cn_entitytype = 'fundingcasecorrection'
            AND runtime.egcs_cn_entityid = NEW.egcs_cn_entityid AND runtime.egcs_cn_kind = 'workflow'
            AND runtime.egcs_cn_purpose = 'approval_submission' AND NOT runtime._deleted
        ) THEN RAISE EXCEPTION 'Correction Completion requires a linked approval submission' USING ERRCODE = '23514'; END IF;
      END IF;
      RETURN NULL;
    END $$ LANGUAGE plpgsql`.execute(db)
  await sql`CREATE CONSTRAINT TRIGGER trg_enforce_correction_completion AFTER INSERT ON "Common_Completion" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_correction_completion()`.execute(db)
  await installAuditOwnershipFunctions(db)
  await sql`SELECT audit.reconcile_capture()`.execute(db)
}

/** Refuses rollback when any authored Correction or permission would be discarded. */
export const down = async (db: Kysely<Database>): Promise<void> => {
  const authored = await sql`SELECT 1 FROM "Funding_Case_Agreement_Correction" UNION ALL SELECT 1 FROM role_permission WHERE subject = 'correction' UNION ALL SELECT 1 FROM "Agency_Profile" WHERE egcs_ay_correctioncreatorapproval UNION ALL SELECT 1 FROM "Common_Entity" WHERE egcs_cn_entitytype = 'fundingcasecorrection' UNION ALL SELECT 1 FROM "Common_Workflow_Setup" WHERE egcs_cn_entitytype = 'fundingcasecorrection' UNION ALL SELECT 1 FROM "Common_Review_Set_Setup" WHERE egcs_cn_entitytype = 'fundingcasecorrection' LIMIT 1`.execute(db)
  if (authored.rows.length) throw new Error('Cannot roll back retained Correction evidence or configuration')
  for (const table of correctionFinancialTables) await sql`DROP TRIGGER trg_correction_financial_lock ON ${sql.table(table)}`.execute(db)
  await sql`DROP TRIGGER trg_enforce_correction_completion ON "Common_Completion"`.execute(db)
  await sql`DROP FUNCTION trg_fn_enforce_correction_completion()`.execute(db)
  await sql`DROP FUNCTION trg_fn_correction_financial_lock()`.execute(db)
  await sql`DROP TRIGGER trg_protect_correction_roster ON "Common_Entity_Assignment"`.execute(db)
  for (const table of [...correctionTables].reverse()) await sql`DROP TABLE ${sql.table(table)}`.execute(db)
  await sql`ALTER TABLE "Common_Status" DROP CONSTRAINT cn_uq_correction_status_owner`.execute(db)
  await sql`ALTER TABLE "Common_Status" DROP CONSTRAINT cn_uq_correction_status_terminal`.execute(db)
  for (const name of ['trg_fn_validate_correction_posting','trg_fn_protect_correction_posting','trg_fn_protect_correction_roster','trg_fn_protect_correction_content','trg_fn_validate_correction','correction_has_lifecycle_evidence']) {
    await sql`DROP FUNCTION ${sql.ref(name)}(${name === 'correction_has_lifecycle_evidence' ? sql.raw('bigint') : sql.raw('')})`.execute(db)
  }
  await sql`ALTER TABLE "Agency_Profile" DROP COLUMN egcs_ay_correctioncreatorapproval`.execute(db)
  // Installed entity-type declarations are immutable, matching the JV rollback boundary.
  await sql`ALTER TABLE role_permission DROP CONSTRAINT role_permission_subject_check`.execute(db)
  await sql`ALTER TABLE role_permission ADD CONSTRAINT role_permission_subject_check CHECK (subject IN ('audit','system','agency','transfer_payment','role','user','group','agreement','applicant_recipient','funding_case','journal_voucher'))`.execute(db)
  await sql`ALTER TABLE role_permission DROP CONSTRAINT role_permission_assignment_subject_check`.execute(db)
  await sql`ALTER TABLE role_permission ADD CONSTRAINT role_permission_assignment_subject_check CHECK (can_manage_assignments = false OR subject IN ('agreement','applicant_recipient','funding_case','journal_voucher'))`.execute(db)
  const previous = { ...AUDIT_TABLE_OWNERSHIP }
  for (const table of correctionTables) delete previous[`public.${table}`]
  await installAuditOwnershipFunctions(db, previous)
  await sql`SELECT audit.reconcile_capture()`.execute(db)
}
