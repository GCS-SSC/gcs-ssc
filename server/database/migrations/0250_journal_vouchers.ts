import { sql, type Kysely } from 'kysely'
import type { Database } from '../../../shared/types/database'
import { installAuditOwnershipFunctions } from '../audit-ownership-functions'
import { AUDIT_TABLE_OWNERSHIP } from '../audit-ownership-registry'

/** Adds ordinary Journal Voucher accounting records without changing source financial rows. */
export const up = async (db: Kysely<Database>): Promise<void> => {
  // A clean demo migrates populated seed rows in this same transaction. Flush
  // their deferred reference/roster checks before altering the referenced tables.
  await sql`SET CONSTRAINTS ALL IMMEDIATE`.execute(db)
  await sql`SET CONSTRAINTS ALL DEFERRED`.execute(db)
  await sql`ALTER TABLE "Agency_Fiscal_Year" ADD COLUMN egcs_ay_jvopen boolean NOT NULL DEFAULT false`.execute(db)
  await sql`ALTER TABLE role_permission DROP CONSTRAINT role_permission_subject_check`.execute(db)
  await sql`ALTER TABLE role_permission ADD CONSTRAINT role_permission_subject_check CHECK (subject IN ('audit','system','agency','transfer_payment','role','user','group','agreement','applicant_recipient','funding_case','journal_voucher'))`.execute(db)
  await sql`ALTER TABLE role_permission DROP CONSTRAINT role_permission_assignment_subject_check`.execute(db)
  await sql`ALTER TABLE role_permission ADD CONSTRAINT role_permission_assignment_subject_check CHECK (can_manage_assignments = false OR subject IN ('agreement','applicant_recipient','funding_case','journal_voucher'))`.execute(db)
  await sql`INSERT INTO "Common_Entity_Type" (egcs_cn_type, egcs_cn_localtype, egcs_cn_label_en, egcs_cn_label_fr,
    egcs_cn_completion, egcs_cn_approvalsubmission, egcs_cn_standardworkflow, egcs_cn_riskrating,
    egcs_cn_supportsdirectreviews, egcs_cn_ownerkind, egcs_cn_assignmentmode)
    VALUES ('fundingcasejournalvoucher','fundingcasejournalvoucher','Journal Voucher','Pièce de journal',
      'supported','on_completion','explicit','none',true,'agreement','independent')
    ON CONFLICT (egcs_cn_type) DO NOTHING`.execute(db)
  await sql`ALTER TABLE "Funding_Case_Agreement_Payment" ADD CONSTRAINT fc_uq_payment_agreement UNIQUE (id,egcs_fc_fundingagreement)`.execute(db)
  await sql`CREATE TABLE "Funding_Case_Agreement_Journal_Voucher" (
    id bigint PRIMARY KEY REFERENCES "Common_Entity"(id) ON DELETE RESTRICT,
    egcs_fc_fundingagreement bigint NOT NULL REFERENCES "Funding_Case_Agreement_Profile"(id) ON DELETE RESTRICT,
    egcs_fc_payment bigint NOT NULL,
    egcs_fc_fiscalyear bigint NOT NULL REFERENCES "Funding_Case_Agreement_Budget_Fiscal_Year"(id) ON DELETE RESTRICT,
    egcs_fc_agencyfiscalyear bigint NOT NULL REFERENCES "Agency_Fiscal_Year"(id) ON DELETE RESTRICT,
    egcs_fc_currency currency_codes NOT NULL,
    egcs_fc_number integer NOT NULL CHECK (egcs_fc_number > 0),
    egcs_fc_agreementnumber text NOT NULL,
    egcs_fc_fiscalyeardisplay text NOT NULL,
    egcs_fc_requesteddate date NOT NULL,
    egcs_fc_narrative_en text NOT NULL DEFAULT '',
    egcs_fc_narrative_fr text NOT NULL DEFAULT '',
    egcs_fc_status bigint NOT NULL REFERENCES "Common_Status"(id) ON DELETE RESTRICT,
    egcs_fc_reversalof bigint,
    egcs_fc_replacementof bigint,
    _deleted boolean NOT NULL DEFAULT false,
    CONSTRAINT fc_uq_jv_payment UNIQUE (id,egcs_fc_payment),
    CONSTRAINT fc_uq_jv_number UNIQUE (egcs_fc_fundingagreement,egcs_fc_number),
    CONSTRAINT fc_fk_jv_payment_agreement FOREIGN KEY (egcs_fc_payment,egcs_fc_fundingagreement)
      REFERENCES "Funding_Case_Agreement_Payment"(id,egcs_fc_fundingagreement) ON DELETE RESTRICT,
    CONSTRAINT fc_fk_jv_reversal FOREIGN KEY (egcs_fc_reversalof,egcs_fc_payment)
      REFERENCES "Funding_Case_Agreement_Journal_Voucher"(id,egcs_fc_payment) ON DELETE RESTRICT,
    CONSTRAINT fc_fk_jv_replacement FOREIGN KEY (egcs_fc_replacementof,egcs_fc_payment)
      REFERENCES "Funding_Case_Agreement_Journal_Voucher"(id,egcs_fc_payment) ON DELETE RESTRICT,
    CONSTRAINT fc_chk_jv_links CHECK (egcs_fc_reversalof IS NULL OR egcs_fc_replacementof IS NULL),
    CONSTRAINT fc_chk_jv_self CHECK (id IS DISTINCT FROM egcs_fc_reversalof AND id IS DISTINCT FROM egcs_fc_replacementof)
  )`.execute(db)
  await sql`CREATE UNIQUE INDEX fc_uq_jv_reversal_active ON "Funding_Case_Agreement_Journal_Voucher"(egcs_fc_reversalof) WHERE _deleted = false AND egcs_fc_reversalof IS NOT NULL`.execute(db)
  await sql`CREATE UNIQUE INDEX fc_uq_jv_replacement_active ON "Funding_Case_Agreement_Journal_Voucher"(egcs_fc_replacementof) WHERE _deleted = false AND egcs_fc_replacementof IS NOT NULL`.execute(db)
  await sql`CREATE INDEX fc_idx_jv_payment ON "Funding_Case_Agreement_Journal_Voucher"(egcs_fc_payment)`.execute(db)
  await sql`CREATE TRIGGER trg_register_fundingcasejournalvoucher BEFORE INSERT ON "Funding_Case_Agreement_Journal_Voucher" FOR EACH ROW EXECUTE FUNCTION register_entity('fundingcasejournalvoucher')`.execute(db)
  await sql`CREATE TRIGGER trg_soft_delete_jv_assignments AFTER UPDATE OF _deleted ON "Funding_Case_Agreement_Journal_Voucher" FOR EACH ROW EXECUTE FUNCTION trg_fn_soft_delete_entity_assignments('fundingcasejournalvoucher')`.execute(db)
  await sql`CREATE CONSTRAINT TRIGGER trg_enforce_jv_roster AFTER INSERT OR UPDATE OF _deleted ON "Funding_Case_Agreement_Journal_Voucher" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_assignable_entity_roster('fundingcasejournalvoucher')`.execute(db)
  await sql`CREATE TABLE "Funding_Case_Agreement_Journal_Voucher_Line" (
    id bigserial PRIMARY KEY,
    egcs_fc_journalvoucher bigint NOT NULL,
    egcs_fc_payment bigint NOT NULL,
    egcs_fc_commitmentline bigint NOT NULL REFERENCES "Funding_Case_Agreement_Commitment_Line"(id) ON DELETE RESTRICT,
    egcs_fc_commitmentlinenumber integer NOT NULL,
    egcs_fc_kind varchar(16) NOT NULL CHECK (egcs_fc_kind IN ('original','corrected','adjustment')),
    egcs_fc_chartofaccount bigint NOT NULL REFERENCES "Transfer_Payment_Stream_Chart_of_Account"(id) ON DELETE RESTRICT,
    egcs_fc_accountingdimensions jsonb NOT NULL CHECK (jsonb_typeof(egcs_fc_accountingdimensions) = 'array'),
    egcs_fc_amount numeric(19,2) NOT NULL,
    _deleted boolean NOT NULL DEFAULT false,
    CONSTRAINT fc_fk_jv_line_root FOREIGN KEY (egcs_fc_journalvoucher,egcs_fc_payment)
      REFERENCES "Funding_Case_Agreement_Journal_Voucher"(id,egcs_fc_payment) ON DELETE RESTRICT,
    CONSTRAINT fc_chk_jv_line_amount CHECK (egcs_fc_kind = 'adjustment' OR egcs_fc_amount >= 0)
  )`.execute(db)
  await sql`CREATE INDEX fc_idx_jv_lines_root ON "Funding_Case_Agreement_Journal_Voucher_Line"(egcs_fc_journalvoucher)`.execute(db)
  await sql`CREATE FUNCTION trg_fn_validate_jv() RETURNS trigger AS $$
    DECLARE owner_agency bigint; definition record; source record;
    BEGIN
      SELECT p.egcs_tp_agency INTO owner_agency FROM "Funding_Case_Agreement_Profile" a
        JOIN "Transfer_Payment_Stream" s ON s.id = a.egcs_fc_transferpaymentstream
        JOIN "Transfer_Payment_Profile" p ON p.id = s.egcs_tp_transferpaymentprofile
        WHERE a.id = NEW.egcs_fc_fundingagreement;
      SELECT * INTO definition FROM "Common_Status" WHERE id = NEW.egcs_fc_status AND _deleted = false;
      IF definition.egcs_cn_agency IS DISTINCT FROM owner_agency OR owner_agency IS NULL
        OR (TG_OP = 'INSERT' AND NOT definition.egcs_cn_isdraft) THEN
        RAISE EXCEPTION 'JV status must belong to its Agency and start Draft' USING ERRCODE = '23514';
      END IF;
      SELECT * INTO source FROM "Funding_Case_Agreement_Payment" WHERE id = NEW.egcs_fc_payment;
      IF source.egcs_fc_fiscalyear IS DISTINCT FROM NEW.egcs_fc_fiscalyear
        OR source.egcs_fc_currency IS DISTINCT FROM NEW.egcs_fc_currency
        OR NOT EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Budget_Fiscal_Year" y
          WHERE y.id = NEW.egcs_fc_fiscalyear AND y.egcs_fc_fiscalyear = NEW.egcs_fc_agencyfiscalyear)
        OR NOT EXISTS (SELECT 1 FROM "Agency_Fiscal_Year" y WHERE y.id = NEW.egcs_fc_agencyfiscalyear AND y.egcs_ay_organizationagency = owner_agency) THEN
        RAISE EXCEPTION 'JV source fiscal year and currency must match Payment' USING ERRCODE = '23514';
      END IF;
      IF TG_OP = 'UPDATE' AND (to_jsonb(OLD) - 'egcs_fc_status') IS DISTINCT FROM (to_jsonb(NEW) - 'egcs_fc_status')
        AND EXISTS (SELECT 1 FROM "Common_Completion" WHERE egcs_cn_entitytype = 'fundingcasejournalvoucher' AND egcs_cn_entityid = OLD.id) THEN
        RAISE EXCEPTION 'Completed JV accounting data is locked' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END $$ LANGUAGE plpgsql`.execute(db)
  await sql`CREATE TRIGGER trg_validate_jv BEFORE INSERT OR UPDATE ON "Funding_Case_Agreement_Journal_Voucher" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_jv()`.execute(db)
  await sql`CREATE FUNCTION trg_fn_protect_jv_line() RETURNS trigger AS $$
    DECLARE root_id bigint; source_id bigint;
    BEGIN
      root_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.egcs_fc_journalvoucher ELSE NEW.egcs_fc_journalvoucher END;
      SELECT egcs_fc_payment INTO source_id FROM "Funding_Case_Agreement_Journal_Voucher" WHERE id = root_id FOR UPDATE;
      IF EXISTS (SELECT 1 FROM "Common_Completion" WHERE egcs_cn_entitytype = 'fundingcasejournalvoucher' AND egcs_cn_entityid = root_id) THEN
        RAISE EXCEPTION 'Completed JV lines are locked' USING ERRCODE = '23514';
      END IF;
      IF TG_OP <> 'DELETE' AND NOT EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Payment_Line"
        WHERE egcs_fc_fundingagreementpayment = source_id AND egcs_fc_fundingagreementcommitmentline = NEW.egcs_fc_commitmentline) THEN
        RAISE EXCEPTION 'JV commitment line must belong to source Payment' USING ERRCODE = '23514';
      END IF;
      IF TG_OP <> 'DELETE' AND NOT EXISTS (
        SELECT 1 FROM "Funding_Case_Agreement_Journal_Voucher" voucher
        JOIN "Transfer_Payment_Stream_Chart_of_Account" coding ON coding.id = NEW.egcs_fc_chartofaccount
        JOIN "Agency_Chart_of_Account" account ON account.id = coding.egcs_tp_agencychartofaccount
        WHERE voucher.id = root_id AND account.egcs_ay_currency = voucher.egcs_fc_currency
      ) THEN
        RAISE EXCEPTION 'JV Chart of Account currency must match its Payment' USING ERRCODE = '23514';
      END IF;
      IF TG_OP = 'UPDATE' AND OLD.egcs_fc_journalvoucher IS DISTINCT FROM NEW.egcs_fc_journalvoucher THEN
        RAISE EXCEPTION 'JV lines cannot move between roots' USING ERRCODE = '23514';
      END IF;
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
      RETURN NEW;
    END $$ LANGUAGE plpgsql`.execute(db)
  await sql`CREATE TRIGGER trg_protect_jv_line BEFORE INSERT OR UPDATE OR DELETE ON "Funding_Case_Agreement_Journal_Voucher_Line" FOR EACH ROW EXECUTE FUNCTION trg_fn_protect_jv_line()`.execute(db)
  await sql`CREATE TRIGGER zz_guard_agreement_financial_currency
    BEFORE INSERT OR UPDATE ON "Funding_Case_Agreement_Journal_Voucher"
    FOR EACH ROW EXECUTE FUNCTION guard_agreement_financial_currency()`.execute(db)
  await installAuditOwnershipFunctions(db)
  await sql`SELECT audit.reconcile_capture()`.execute(db)
}

/** Refuses to discard authored accounting evidence on rollback. */
export const down = async (db: Kysely<Database>): Promise<void> => {
  const authored = await sql`SELECT 1 FROM "Funding_Case_Agreement_Journal_Voucher" LIMIT 1`.execute(db)
  if (authored.rows.length) throw new Error('Cannot roll back authored Journal Vouchers')
  const configured = await sql`SELECT 1 FROM role_permission WHERE subject = 'journal_voucher' UNION ALL SELECT 1 FROM "Agency_Fiscal_Year" WHERE egcs_ay_jvopen LIMIT 1`.execute(db)
  if (configured.rows.length) throw new Error('Cannot roll back retained Journal Voucher configuration')
  await sql`DROP TABLE "Funding_Case_Agreement_Journal_Voucher_Line"`.execute(db)
  await sql`DROP TABLE "Funding_Case_Agreement_Journal_Voucher"`.execute(db)
  await sql`DROP FUNCTION trg_fn_protect_jv_line()`.execute(db)
  await sql`DROP FUNCTION trg_fn_validate_jv()`.execute(db)
  await sql`ALTER TABLE "Funding_Case_Agreement_Payment" DROP CONSTRAINT fc_uq_payment_agreement`.execute(db)
  await sql`ALTER TABLE "Agency_Fiscal_Year" DROP COLUMN egcs_ay_jvopen`.execute(db)
  await sql`ALTER TABLE role_permission DROP CONSTRAINT role_permission_subject_check`.execute(db)
  await sql`ALTER TABLE role_permission ADD CONSTRAINT role_permission_subject_check CHECK (subject IN ('audit','system','agency','transfer_payment','role','user','group','agreement','applicant_recipient','funding_case'))`.execute(db)
  await sql`ALTER TABLE role_permission DROP CONSTRAINT role_permission_assignment_subject_check`.execute(db)
  await sql`ALTER TABLE role_permission ADD CONSTRAINT role_permission_assignment_subject_check CHECK (can_manage_assignments = false OR subject IN ('agreement','applicant_recipient','funding_case'))`.execute(db)
  const previous = { ...AUDIT_TABLE_OWNERSHIP }
  delete previous['public.Funding_Case_Agreement_Journal_Voucher']
  delete previous['public.Funding_Case_Agreement_Journal_Voucher_Line']
  await installAuditOwnershipFunctions(db, previous)
  await sql`SELECT audit.reconcile_capture()`.execute(db)
}
