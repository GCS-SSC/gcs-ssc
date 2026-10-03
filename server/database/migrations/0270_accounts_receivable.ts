import { sql, type Kysely } from 'kysely'
import type { Database } from '../../../shared/types/database'
import { installAuditOwnershipFunctions } from '../audit-ownership-functions'
import { AUDIT_TABLE_OWNERSHIP } from '../audit-ownership-registry'

const tables = [
  'Funding_Case_Account_Receivable_Pool', 'Funding_Case_Agreement_Account_Receivable',
  'Funding_Case_Agreement_Account_Receivable_Line', 'Funding_Case_Agreement_Account_Receivable_Coding',
  'Funding_Case_Account_Receivable_Credit_Memo', 'Funding_Case_Account_Receivable_Recovery',
  'Funding_Case_Account_Receivable_Allocation', 'Funding_Case_Account_Receivable_Posting'
] as const
const roots = [
  ['Funding_Case_Agreement_Account_Receivable', 'fundingcaseaccountreceivable', 'ar'],
  ['Funding_Case_Account_Receivable_Credit_Memo', 'fundingcaseaccountreceivablecreditmemo', 'ar_creditmemo']
] as const
const lifecycleColumns = `
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
  egcs_fc_statusdeleted boolean GENERATED ALWAYS AS (CASE WHEN _deleted THEN NULL ELSE false END) STORED`

/** Incremental AR infrastructure with preserved historical payment attribution. */
export const up = async (db: Kysely<Database>): Promise<void> => {
  await sql`SET CONSTRAINTS ALL IMMEDIATE`.execute(db)
  await sql`SET CONSTRAINTS ALL DEFERRED`.execute(db)
  await sql`ALTER TABLE role_permission DROP CONSTRAINT role_permission_subject_check`.execute(db)
  await sql`ALTER TABLE role_permission ADD CONSTRAINT role_permission_subject_check CHECK (subject IN ('audit','system','agency','transfer_payment','role','user','group','agreement','applicant_recipient','funding_case','journal_voucher','correction','account_receivable'))`.execute(db)
  await sql`ALTER TABLE role_permission DROP CONSTRAINT role_permission_assignment_subject_check`.execute(db)
  await sql`ALTER TABLE role_permission ADD CONSTRAINT role_permission_assignment_subject_check CHECK (can_manage_assignments = false OR subject IN ('agreement','applicant_recipient','funding_case','journal_voucher','correction','account_receivable'))`.execute(db)
  // Do not elevate any existing role by manufacturing AR grants.
  for (const [, type] of roots) {
    await sql`INSERT INTO "Common_Entity_Type" (egcs_cn_type,egcs_cn_localtype,egcs_cn_label_en,egcs_cn_label_fr,
      egcs_cn_completion,egcs_cn_approvalsubmission,egcs_cn_standardworkflow,egcs_cn_riskrating,
      egcs_cn_supportsdirectreviews,egcs_cn_ownerkind,egcs_cn_assignmentmode)
      VALUES (${type},${type},${type === 'fundingcaseaccountreceivable' ? 'Accounts Receivable' : 'Accounts Receivable Credit Memo'},
        ${type === 'fundingcaseaccountreceivable' ? 'Compte débiteur' : 'Note de crédit de compte débiteur'},
        'supported','on_completion','explicit','none',true,'agreement','independent') ON CONFLICT (egcs_cn_type) DO NOTHING`.execute(db)
  }
  await sql`ALTER TABLE "Funding_Case_Agreement_Payment" ADD COLUMN egcs_fc_applicantrecipient bigint REFERENCES "Applicant_Recipient_Profile"(id) ON DELETE RESTRICT`.execute(db)
  // Only a single active retained Agreement relationship is attributable. Multi-Proponent
  // rows remain NULL, including their immutable packets and monetary source evidence.
  await sql`UPDATE "Funding_Case_Agreement_Payment" payment SET egcs_fc_applicantrecipient = single.payee
    FROM (SELECT egcs_fc_fundingagreement,min(egcs_fc_applicantrecipient) payee
      FROM "Funding_Case_Agreement_Applicant_Recipient" WHERE NOT _deleted
      GROUP BY egcs_fc_fundingagreement HAVING count(DISTINCT egcs_fc_applicantrecipient) = 1) single
    WHERE single.egcs_fc_fundingagreement = payment.egcs_fc_fundingagreement`.execute(db)
  await sql`ALTER TABLE "Funding_Case_Agreement_Claim" ADD COLUMN IF NOT EXISTS egcs_fc_applicantrecipient bigint REFERENCES "Applicant_Recipient_Profile"(id) ON DELETE RESTRICT`.execute(db)
  await sql`UPDATE "Funding_Case_Agreement_Claim" claim SET egcs_fc_applicantrecipient = single.proponent
    FROM (SELECT egcs_fc_fundingagreement,min(egcs_fc_applicantrecipient) proponent
      FROM "Funding_Case_Agreement_Applicant_Recipient" WHERE NOT _deleted
      GROUP BY egcs_fc_fundingagreement HAVING count(DISTINCT egcs_fc_applicantrecipient) = 1) single
    WHERE single.egcs_fc_fundingagreement = claim.egcs_fc_fundingagreement AND claim.egcs_fc_applicantrecipient IS NULL`.execute(db)
  await sql`CREATE FUNCTION trg_fn_validate_claim_submitting_proponent() RETURNS trigger AS $$
    BEGIN
      IF TG_OP = 'UPDATE' AND (OLD.egcs_fc_fundingagreement,OLD.egcs_fc_applicantrecipient)
        IS NOT DISTINCT FROM (NEW.egcs_fc_fundingagreement,NEW.egcs_fc_applicantrecipient) THEN RETURN NEW; END IF;
      IF NEW.egcs_fc_applicantrecipient IS NULL OR NOT EXISTS (
        SELECT 1 FROM "Funding_Case_Agreement_Applicant_Recipient" relation
        JOIN "Applicant_Recipient_Profile" proponent ON proponent.id = relation.egcs_fc_applicantrecipient AND NOT proponent._deleted AND proponent.egcs_ar_active
        WHERE relation.egcs_fc_fundingagreement = NEW.egcs_fc_fundingagreement
          AND relation.egcs_fc_applicantrecipient = NEW.egcs_fc_applicantrecipient AND NOT relation._deleted
      ) THEN RAISE EXCEPTION 'Claim requires an active submitting Proponent on its Agreement'
        USING ERRCODE = '23514', CONSTRAINT = 'fc_chk_claim_submitting_proponent'; END IF;
      RETURN NEW;
    END $$ LANGUAGE plpgsql`.execute(db)
  await sql`CREATE TRIGGER trg_validate_claim_submitting_proponent BEFORE INSERT OR UPDATE OF egcs_fc_applicantrecipient,egcs_fc_fundingagreement
    ON "Funding_Case_Agreement_Claim" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_claim_submitting_proponent()`.execute(db)
  await sql`ALTER TABLE "Funding_Case_Agreement_Correction_Line" ADD COLUMN egcs_fc_arrecoveries numeric(19,2) NOT NULL DEFAULT 0 CHECK (egcs_fc_arrecoveries <= 0)`.execute(db)
  await sql`ALTER TABLE "Funding_Case_Agreement_Monitor_Followup" ADD COLUMN egcs_fc_requiresreceivable boolean NOT NULL DEFAULT false`.execute(db)
  await sql`CREATE TABLE "Funding_Case_Account_Receivable_Pool" (
    id bigserial PRIMARY KEY,
    egcs_fc_agency bigint NOT NULL REFERENCES "Agency_Profile"(id) ON DELETE RESTRICT,
    egcs_fc_applicantrecipient bigint NOT NULL REFERENCES "Applicant_Recipient_Profile"(id) ON DELETE RESTRICT,
    egcs_fc_currency currency_codes NOT NULL,
    _deleted boolean NOT NULL DEFAULT false,
    CONSTRAINT fc_uq_ar_pool UNIQUE (egcs_fc_agency,egcs_fc_applicantrecipient,egcs_fc_currency),
    CONSTRAINT fc_uq_ar_pool_identity UNIQUE (id,egcs_fc_applicantrecipient,egcs_fc_currency)
  )`.execute(db)
  await sql.raw(`CREATE TABLE "Funding_Case_Agreement_Account_Receivable" (
    id bigint PRIMARY KEY REFERENCES "Common_Entity"(id) ON DELETE RESTRICT,
    egcs_fc_fundingagreement bigint NOT NULL REFERENCES "Funding_Case_Agreement_Profile"(id) ON DELETE RESTRICT,
    egcs_fc_pool bigint NOT NULL,
    egcs_fc_applicantrecipient bigint NOT NULL REFERENCES "Applicant_Recipient_Profile"(id) ON DELETE RESTRICT,
    egcs_fc_agencyfiscalyear bigint NOT NULL REFERENCES "Agency_Fiscal_Year"(id) ON DELETE RESTRICT,
    egcs_fc_type varchar(32) NOT NULL CHECK (egcs_fc_type IN ('ineligible_expense','outstanding_advance')),
    egcs_fc_recoverymethod varchar(32) NOT NULL CHECK (egcs_fc_recoverymethod IN ('offset','direct_repayment')),
    egcs_fc_recipientpreference varchar(32) CHECK (egcs_fc_recipientpreference IN ('offset','direct_repayment')),
    egcs_fc_preferenceoverride_en text NOT NULL DEFAULT '', egcs_fc_preferenceoverride_fr text NOT NULL DEFAULT '',
    egcs_fc_currency currency_codes NOT NULL,
    egcs_fc_number integer NOT NULL CHECK (egcs_fc_number > 0), egcs_fc_agreementnumber text NOT NULL,
    egcs_fc_requesteddate date NOT NULL,
    egcs_fc_narrative_en text NOT NULL DEFAULT '', egcs_fc_narrative_fr text NOT NULL DEFAULT '',
    egcs_fc_linkedreceivable bigint,
    egcs_fc_monitorfollowup bigint REFERENCES "Funding_Case_Agreement_Monitor_Followup"(id) ON DELETE RESTRICT,
    ${lifecycleColumns},
    CONSTRAINT fc_uq_ar_agreement UNIQUE (id,egcs_fc_fundingagreement),
    CONSTRAINT fc_uq_ar_pool_root UNIQUE (id,egcs_fc_pool),
    CONSTRAINT fc_uq_ar_number UNIQUE (egcs_fc_fundingagreement,egcs_fc_number),
    CONSTRAINT fc_fk_ar_pool FOREIGN KEY (egcs_fc_pool,egcs_fc_applicantrecipient,egcs_fc_currency)
      REFERENCES "Funding_Case_Account_Receivable_Pool"(id,egcs_fc_applicantrecipient,egcs_fc_currency) ON DELETE RESTRICT,
    CONSTRAINT fc_fk_ar_link FOREIGN KEY (egcs_fc_linkedreceivable,egcs_fc_fundingagreement)
      REFERENCES "Funding_Case_Agreement_Account_Receivable"(id,egcs_fc_fundingagreement) ON DELETE RESTRICT,
    CONSTRAINT fc_chk_ar_self CHECK (id IS DISTINCT FROM egcs_fc_linkedreceivable)
  )`).execute(db)
  await sql`CREATE TABLE "Funding_Case_Agreement_Account_Receivable_Line" (
    id bigserial PRIMARY KEY, egcs_fc_receivable bigint NOT NULL, egcs_fc_fundingagreement bigint NOT NULL,
    egcs_fc_originalline bigint,
    egcs_fc_sourcekey text NOT NULL,
    egcs_fc_claim bigint REFERENCES "Funding_Case_Agreement_Claim"(id) ON DELETE RESTRICT,
    egcs_fc_claimline bigint REFERENCES "Funding_Case_Agreement_Claim_Line_Item"(id) ON DELETE RESTRICT,
    egcs_fc_reconcileline bigint REFERENCES "Funding_Case_Agreement_Claim_Reconcile_Line_Item"(id) ON DELETE RESTRICT,
    egcs_fc_payment bigint REFERENCES "Funding_Case_Agreement_Payment"(id) ON DELETE RESTRICT,
    egcs_fc_periodstart integer NOT NULL CHECK (egcs_fc_periodstart BETWEEN 0 AND 11),
    egcs_fc_periodend integer NOT NULL CHECK (egcs_fc_periodend BETWEEN 0 AND 11 AND egcs_fc_periodend >= egcs_fc_periodstart),
    egcs_fc_sourceamount numeric(19,2) NOT NULL CHECK (egcs_fc_sourceamount > 0),
    egcs_fc_amount numeric(19,2) NOT NULL DEFAULT 0,
    egcs_fc_evidence jsonb NOT NULL,
    _deleted boolean NOT NULL DEFAULT false,
    CONSTRAINT fc_fk_ar_line_root FOREIGN KEY (egcs_fc_receivable,egcs_fc_fundingagreement)
      REFERENCES "Funding_Case_Agreement_Account_Receivable"(id,egcs_fc_fundingagreement) ON DELETE RESTRICT,
    CONSTRAINT fc_uq_ar_line_identity UNIQUE (id,egcs_fc_receivable,egcs_fc_fundingagreement),
    CONSTRAINT fc_uq_ar_line_source UNIQUE (egcs_fc_receivable,egcs_fc_sourcekey),
    CONSTRAINT fc_fk_ar_line_original FOREIGN KEY (egcs_fc_originalline)
      REFERENCES "Funding_Case_Agreement_Account_Receivable_Line"(id) ON DELETE RESTRICT
  )`.execute(db)
  await sql`CREATE TABLE "Funding_Case_Agreement_Account_Receivable_Coding" (
    id bigserial PRIMARY KEY, egcs_fc_receivableline bigint NOT NULL, egcs_fc_receivable bigint NOT NULL, egcs_fc_fundingagreement bigint NOT NULL,
    egcs_fc_commitmentline bigint NOT NULL REFERENCES "Funding_Case_Agreement_Commitment_Line"(id) ON DELETE RESTRICT,
    egcs_fc_chartofaccount bigint NOT NULL REFERENCES "Transfer_Payment_Stream_Chart_of_Account"(id) ON DELETE RESTRICT,
    egcs_fc_agencychartofaccount bigint NOT NULL REFERENCES "Agency_Chart_of_Account"(id) ON DELETE RESTRICT,
    egcs_fc_agencyfiscalyear bigint NOT NULL REFERENCES "Agency_Fiscal_Year"(id) ON DELETE RESTRICT,
    egcs_fc_periodstart integer NOT NULL CHECK (egcs_fc_periodstart BETWEEN 0 AND 11),
    egcs_fc_periodend integer NOT NULL CHECK (egcs_fc_periodend BETWEEN 0 AND 11 AND egcs_fc_periodend >= egcs_fc_periodstart),
    egcs_fc_paidbasis numeric(19,2) NOT NULL CHECK (egcs_fc_paidbasis > 0),
    egcs_fc_amount numeric(19,2) NOT NULL DEFAULT 0,
    egcs_fc_accountingdimensions jsonb NOT NULL,
    _deleted boolean NOT NULL DEFAULT false,
    CONSTRAINT fc_fk_ar_coding_line FOREIGN KEY (egcs_fc_receivableline,egcs_fc_receivable,egcs_fc_fundingagreement)
      REFERENCES "Funding_Case_Agreement_Account_Receivable_Line"(id,egcs_fc_receivable,egcs_fc_fundingagreement) ON DELETE RESTRICT,
    CONSTRAINT fc_uq_ar_coding_line UNIQUE (id,egcs_fc_receivableline),
    CONSTRAINT fc_uq_ar_coding_basis UNIQUE (egcs_fc_receivableline,egcs_fc_commitmentline,egcs_fc_chartofaccount,egcs_fc_periodstart,egcs_fc_periodend)
  )`.execute(db)
  await sql.raw(`CREATE TABLE "Funding_Case_Account_Receivable_Credit_Memo" (
    id bigint PRIMARY KEY REFERENCES "Common_Entity"(id) ON DELETE RESTRICT,
    egcs_fc_fundingagreement bigint NOT NULL REFERENCES "Funding_Case_Agreement_Profile"(id) ON DELETE RESTRICT,
    egcs_fc_agency bigint NOT NULL REFERENCES "Agency_Profile"(id) ON DELETE RESTRICT,
    egcs_fc_pool bigint NOT NULL, egcs_fc_applicantrecipient bigint NOT NULL, egcs_fc_currency currency_codes NOT NULL,
    egcs_fc_number integer NOT NULL CHECK (egcs_fc_number > 0), egcs_fc_agreementnumber text NOT NULL,
    egcs_fc_receiveddate date NOT NULL, egcs_fc_amount numeric(19,2) NOT NULL CHECK (egcs_fc_amount > 0),
    egcs_fc_receiptreference text,
    egcs_fc_narrative_en text NOT NULL DEFAULT '', egcs_fc_narrative_fr text NOT NULL DEFAULT '',
    ${lifecycleColumns},
    CONSTRAINT fc_uq_ar_creditmemo_number UNIQUE (egcs_fc_fundingagreement,egcs_fc_number),
    CONSTRAINT fc_fk_ar_creditmemo_pool FOREIGN KEY (egcs_fc_pool,egcs_fc_applicantrecipient,egcs_fc_currency)
      REFERENCES "Funding_Case_Account_Receivable_Pool"(id,egcs_fc_applicantrecipient,egcs_fc_currency) ON DELETE RESTRICT
  )`).execute(db)
  for (const [table, type, key] of roots) {
    await sql.raw(`ALTER TABLE "${table}" ADD CONSTRAINT fc_chk_${key}_posting CHECK ((egcs_fc_outcome = 'posted') = (egcs_fc_postedat IS NOT NULL AND egcs_fc_postingruntime IS NOT NULL))`).execute(db)
    await sql.raw(`ALTER TABLE "${table}" ADD CONSTRAINT fc_chk_${key}_terminal CHECK ((egcs_fc_outcome = 'open') = (egcs_fc_terminalat IS NULL))`).execute(db)
    await sql.raw(`ALTER TABLE "${table}" ADD CONSTRAINT cn_chk_${key}_status_in_use FOREIGN KEY (egcs_fc_status,egcs_fc_statusagency,egcs_fc_statusdeleted)
      REFERENCES "Common_Status"(id,egcs_cn_agency,_deleted) DEFERRABLE INITIALLY DEFERRED`).execute(db)
    await sql.raw(`ALTER TABLE "${table}" ADD CONSTRAINT cn_chk_${key}_status_outcome FOREIGN KEY (egcs_fc_status,egcs_fc_statusterminal)
      REFERENCES "Common_Status"(id,egcs_cn_terminal) DEFERRABLE INITIALLY DEFERRED`).execute(db)
    await sql.raw(`CREATE TRIGGER trg_register_${key} BEFORE INSERT ON "${table}" FOR EACH ROW EXECUTE FUNCTION register_entity('${type}')`).execute(db)
    await sql.raw(`CREATE TRIGGER trg_soft_delete_${key}_assignments AFTER UPDATE OF _deleted ON "${table}" FOR EACH ROW EXECUTE FUNCTION trg_fn_soft_delete_entity_assignments('${type}')`).execute(db)
    await sql.raw(`CREATE CONSTRAINT TRIGGER trg_enforce_${key}_roster AFTER INSERT OR UPDATE OF _deleted ON "${table}" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_assignable_entity_roster('${type}')`).execute(db)
  }
  await sql`CREATE TABLE "Funding_Case_Account_Receivable_Recovery" (
    id bigserial PRIMARY KEY,
    egcs_fc_pool bigint NOT NULL REFERENCES "Funding_Case_Account_Receivable_Pool"(id) ON DELETE RESTRICT,
    egcs_fc_payment bigint REFERENCES "Funding_Case_Agreement_Payment"(id) ON DELETE RESTRICT,
    egcs_fc_creditmemo bigint REFERENCES "Funding_Case_Account_Receivable_Credit_Memo"(id) ON DELETE RESTRICT,
    egcs_fc_amount numeric(19,2) NOT NULL CHECK (egcs_fc_amount >= 0),
    egcs_fc_outcome varchar(16) NOT NULL DEFAULT 'open' CHECK (egcs_fc_outcome IN ('open','posted','released')),
    egcs_fc_createdat timestamptz NOT NULL DEFAULT now(),
    egcs_fc_postedat timestamptz, egcs_fc_postingruntime bigint REFERENCES "Common_Runtime"(id) ON DELETE RESTRICT,
    egcs_fc_releasedat timestamptz,
    _deleted boolean NOT NULL DEFAULT false,
    CONSTRAINT fc_chk_ar_recovery_retained CHECK (_deleted = false),
    CONSTRAINT fc_chk_ar_recovery_author CHECK (num_nonnulls(egcs_fc_payment,egcs_fc_creditmemo) = 1),
    CONSTRAINT fc_chk_ar_recovery_posting CHECK ((egcs_fc_outcome = 'posted') = (egcs_fc_postedat IS NOT NULL AND egcs_fc_postingruntime IS NOT NULL)),
    CONSTRAINT fc_chk_ar_recovery_release CHECK ((egcs_fc_outcome = 'released') = (egcs_fc_releasedat IS NOT NULL))
  )`.execute(db)
  await sql`CREATE UNIQUE INDEX fc_uq_ar_open_pool ON "Funding_Case_Account_Receivable_Recovery"(egcs_fc_pool) WHERE egcs_fc_outcome = 'open' AND NOT _deleted`.execute(db)
  await sql`CREATE UNIQUE INDEX fc_uq_ar_payment_recovery ON "Funding_Case_Account_Receivable_Recovery"(egcs_fc_payment) WHERE egcs_fc_payment IS NOT NULL AND egcs_fc_outcome <> 'released' AND NOT _deleted`.execute(db)
  await sql`CREATE UNIQUE INDEX fc_uq_ar_creditmemo_recovery ON "Funding_Case_Account_Receivable_Recovery"(egcs_fc_creditmemo) WHERE egcs_fc_creditmemo IS NOT NULL AND egcs_fc_outcome <> 'released' AND NOT _deleted`.execute(db)
  await sql`CREATE TABLE "Funding_Case_Account_Receivable_Allocation" (
    id bigserial PRIMARY KEY,
    egcs_fc_recovery bigint NOT NULL REFERENCES "Funding_Case_Account_Receivable_Recovery"(id) ON DELETE RESTRICT,
    egcs_fc_receivable bigint NOT NULL, egcs_fc_receivableline bigint NOT NULL, egcs_fc_fundingagreement bigint NOT NULL,
    egcs_fc_amount numeric(19,2) NOT NULL CHECK (egcs_fc_amount > 0),
    _deleted boolean NOT NULL DEFAULT false,
    CONSTRAINT fc_fk_ar_allocation_line FOREIGN KEY (egcs_fc_receivableline,egcs_fc_receivable,egcs_fc_fundingagreement)
      REFERENCES "Funding_Case_Agreement_Account_Receivable_Line"(id,egcs_fc_receivable,egcs_fc_fundingagreement) ON DELETE RESTRICT,
    CONSTRAINT fc_uq_ar_allocation_source UNIQUE (egcs_fc_recovery,egcs_fc_receivableline),
    CONSTRAINT fc_uq_ar_allocation_identity UNIQUE (id,egcs_fc_recovery)
  )`.execute(db)
  await sql`CREATE TABLE "Funding_Case_Account_Receivable_Posting" (
    id bigserial PRIMARY KEY, egcs_fc_recovery bigint NOT NULL, egcs_fc_allocation bigint NOT NULL,
    egcs_fc_coding bigint NOT NULL REFERENCES "Funding_Case_Agreement_Account_Receivable_Coding"(id) ON DELETE RESTRICT,
    egcs_fc_receivable bigint NOT NULL REFERENCES "Funding_Case_Agreement_Account_Receivable"(id) ON DELETE RESTRICT,
    egcs_fc_fundingagreement bigint NOT NULL REFERENCES "Funding_Case_Agreement_Profile"(id) ON DELETE RESTRICT,
    egcs_fc_commitmentline bigint NOT NULL REFERENCES "Funding_Case_Agreement_Commitment_Line"(id) ON DELETE RESTRICT,
    egcs_fc_chartofaccount bigint NOT NULL REFERENCES "Transfer_Payment_Stream_Chart_of_Account"(id) ON DELETE RESTRICT,
    egcs_fc_agencychartofaccount bigint NOT NULL REFERENCES "Agency_Chart_of_Account"(id) ON DELETE RESTRICT,
    egcs_fc_agencyfiscalyear bigint NOT NULL REFERENCES "Agency_Fiscal_Year"(id) ON DELETE RESTRICT,
    egcs_fc_periodstart integer NOT NULL CHECK (egcs_fc_periodstart BETWEEN 0 AND 11),
    egcs_fc_periodend integer NOT NULL CHECK (egcs_fc_periodend BETWEEN 0 AND 11 AND egcs_fc_periodend >= egcs_fc_periodstart),
    egcs_fc_amount numeric(19,2) NOT NULL CHECK (egcs_fc_amount > 0),
    _deleted boolean NOT NULL DEFAULT false,
    CONSTRAINT fc_fk_ar_posting_allocation FOREIGN KEY (egcs_fc_allocation,egcs_fc_recovery)
      REFERENCES "Funding_Case_Account_Receivable_Allocation"(id,egcs_fc_recovery) ON DELETE RESTRICT,
    CONSTRAINT fc_chk_ar_posting_retained CHECK (_deleted = false),
    CONSTRAINT fc_uq_ar_posting_coding UNIQUE (egcs_fc_allocation,egcs_fc_coding)
  )`.execute(db)
  await installIntegrity(db)
  await installAuditOwnershipFunctions(db)
  await sql`SELECT audit.reconcile_capture()`.execute(db)
}

const installIntegrity = async (db: Kysely<Database>): Promise<void> => {
  await sql`CREATE FUNCTION trg_fn_protect_ar_pool() RETURNS trigger AS $$
    BEGIN
      IF TG_OP = 'DELETE' OR to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW) THEN
        RAISE EXCEPTION 'AR Agency debtor currency pool identity is immutable' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END $$ LANGUAGE plpgsql`.execute(db)
  await sql`CREATE TRIGGER trg_protect_ar_pool BEFORE UPDATE OR DELETE ON "Funding_Case_Account_Receivable_Pool" FOR EACH ROW EXECUTE FUNCTION trg_fn_protect_ar_pool()`.execute(db)
  await sql`CREATE FUNCTION ar_has_lifecycle_evidence(root_id bigint, target_type text) RETURNS boolean AS $$
    SELECT EXISTS (SELECT 1 FROM "Common_Completion" WHERE egcs_cn_entityid = root_id AND egcs_cn_entitytype = target_type)
      OR EXISTS (SELECT 1 FROM "Common_Runtime" WHERE egcs_cn_entityid = root_id AND egcs_cn_entitytype = target_type)
      OR EXISTS (SELECT 1 FROM "Common_Routing_Slip" WHERE egcs_cn_entityid = root_id AND egcs_cn_entitytype = target_type)
  $$ LANGUAGE sql STABLE`.execute(db)
  await sql`CREATE FUNCTION ar_successful_submission(root_id bigint, target_type text, runtime_id bigint) RETURNS boolean AS $$
    SELECT EXISTS (SELECT 1 FROM "Common_Runtime" runtime
      JOIN "Common_Workflow_Run" run ON run.id = runtime.id
      JOIN "Common_Completion" completion ON completion.id = run.egcs_cn_completion
      WHERE runtime.id = runtime_id AND runtime.egcs_cn_kind = 'workflow'
        AND runtime.egcs_cn_entitytype = target_type AND runtime.egcs_cn_entityid = root_id
        AND runtime.egcs_cn_purpose = 'approval_submission' AND runtime.egcs_cn_state IN ('succeeded','approved')
        AND completion.egcs_cn_entitytype = target_type AND completion.egcs_cn_entityid = root_id
        AND completion.egcs_cn_disposition = 'workflow_started' AND NOT runtime._deleted AND NOT completion._deleted
        AND NOT EXISTS (SELECT 1 FROM "Common_Completion" newer WHERE newer.egcs_cn_entityid = root_id
          AND newer.egcs_cn_entitytype = target_type AND NOT newer._deleted AND newer.id > completion.id))
  $$ LANGUAGE sql STABLE`.execute(db)
  await sql`CREATE FUNCTION ar_line_principal(source_id bigint) RETURNS numeric AS $$
    SELECT COALESCE(sum(line.egcs_fc_amount),0) FROM "Funding_Case_Agreement_Account_Receivable_Line" line
      JOIN "Funding_Case_Agreement_Account_Receivable" root ON root.id = line.egcs_fc_receivable
      WHERE (line.id = source_id OR line.egcs_fc_originalline = source_id) AND root.egcs_fc_outcome = 'posted'
        AND NOT line._deleted AND NOT root._deleted
  $$ LANGUAGE sql STABLE`.execute(db)
  await sql`CREATE FUNCTION ar_outstanding(root_id bigint) RETURNS numeric AS $$
    SELECT COALESCE((SELECT sum(line.egcs_fc_amount) FROM "Funding_Case_Agreement_Account_Receivable_Line" line
      JOIN "Funding_Case_Agreement_Account_Receivable" root ON root.id = line.egcs_fc_receivable
      WHERE (root.id = root_id OR root.egcs_fc_linkedreceivable = root_id) AND root.egcs_fc_outcome = 'posted'
        AND NOT root._deleted AND NOT line._deleted),0)
      - COALESCE((SELECT sum(allocation.egcs_fc_amount) FROM "Funding_Case_Account_Receivable_Allocation" allocation
        JOIN "Funding_Case_Account_Receivable_Recovery" recovery ON recovery.id = allocation.egcs_fc_recovery
        WHERE allocation.egcs_fc_receivable = root_id AND recovery.egcs_fc_outcome = 'posted'
          AND NOT allocation._deleted AND NOT recovery._deleted),0)
  $$ LANGUAGE sql STABLE`.execute(db)
  await sql`CREATE FUNCTION trg_fn_validate_ar_root() RETURNS trigger AS $$
    DECLARE owner_agency bigint; owner_currency currency_codes; pool record; definition record; linked record; target_type text;
    BEGIN
      IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'AR evidence uses soft deletion' USING ERRCODE = '23514'; END IF;
      target_type := TG_ARGV[0];
      SELECT program.egcs_tp_agency,agreement.egcs_fc_currency INTO owner_agency,owner_currency
        FROM "Funding_Case_Agreement_Profile" agreement
        JOIN "Transfer_Payment_Stream" stream ON stream.id = agreement.egcs_fc_transferpaymentstream
        JOIN "Transfer_Payment_Profile" program ON program.id = stream.egcs_tp_transferpaymentprofile
        WHERE agreement.id = NEW.egcs_fc_fundingagreement;
      SELECT * INTO pool FROM "Funding_Case_Account_Receivable_Pool" WHERE id = NEW.egcs_fc_pool FOR UPDATE;
      IF owner_agency IS NULL OR owner_agency IS DISTINCT FROM pool.egcs_fc_agency
        OR NEW.egcs_fc_currency IS DISTINCT FROM owner_currency OR pool._deleted THEN
        RAISE EXCEPTION 'AR Agency and currencies must match Agreement and pool' USING ERRCODE = '23514';
      END IF;
      SELECT * INTO definition FROM "Common_Status" WHERE id = NEW.egcs_fc_status;
      IF TG_OP = 'INSERT' THEN
        IF NOT definition.egcs_cn_isdraft OR definition.egcs_cn_terminal OR definition._deleted OR definition.egcs_cn_agency <> owner_agency OR NEW.egcs_fc_outcome <> 'open' OR NEW._deleted THEN
          RAISE EXCEPTION 'AR creation requires the owning Agency Draft status' USING ERRCODE = '23514';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Applicant_Recipient" relation
          WHERE relation.egcs_fc_fundingagreement = NEW.egcs_fc_fundingagreement
            AND relation.egcs_fc_applicantrecipient = NEW.egcs_fc_applicantrecipient AND NOT relation._deleted) THEN
          RAISE EXCEPTION 'AR debtor must be an Agreement Proponent' USING ERRCODE = '23514';
        END IF;
      ELSE
        IF (OLD.id,OLD.egcs_fc_fundingagreement,OLD.egcs_fc_pool,OLD.egcs_fc_applicantrecipient,OLD.egcs_fc_currency,OLD.egcs_fc_number,OLD.egcs_fc_agreementnumber,OLD.egcs_fc_createdby,OLD.egcs_fc_createdat)
          IS DISTINCT FROM (NEW.id,NEW.egcs_fc_fundingagreement,NEW.egcs_fc_pool,NEW.egcs_fc_applicantrecipient,NEW.egcs_fc_currency,NEW.egcs_fc_number,NEW.egcs_fc_agreementnumber,NEW.egcs_fc_createdby,NEW.egcs_fc_createdat) THEN
          RAISE EXCEPTION 'AR identity is immutable' USING ERRCODE = '23514';
        END IF;
        IF OLD.egcs_fc_outcome <> 'open' AND to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW) THEN
          RAISE EXCEPTION 'Established AR evidence is immutable' USING ERRCODE = '23514';
        END IF;
        IF ar_has_lifecycle_evidence(OLD.id,target_type)
          AND (to_jsonb(OLD) - ARRAY['egcs_fc_status','egcs_fc_statusagency','egcs_fc_outcome','egcs_fc_postedat','egcs_fc_postingruntime','egcs_fc_terminalby','egcs_fc_terminalat','egcs_fc_terminalreason','egcs_fc_statusterminal','egcs_fc_statusdeleted'])
          IS DISTINCT FROM (to_jsonb(NEW) - ARRAY['egcs_fc_status','egcs_fc_statusagency','egcs_fc_outcome','egcs_fc_postedat','egcs_fc_postingruntime','egcs_fc_terminalby','egcs_fc_terminalat','egcs_fc_terminalreason','egcs_fc_statusterminal','egcs_fc_statusdeleted']) THEN
          RAISE EXCEPTION 'Submitted AR content is immutable' USING ERRCODE = '23514';
        END IF;
        IF NEW._deleted AND NOT OLD._deleted AND (ar_has_lifecycle_evidence(OLD.id,target_type) OR NOT definition.egcs_cn_isdraft) THEN
          RAISE EXCEPTION 'Only unsubmitted AR Drafts may be deleted' USING ERRCODE = '23514';
        END IF;
      END IF;
      NEW.egcs_fc_statusagency := owner_agency;
      IF target_type = 'fundingcaseaccountreceivable' THEN
        IF NOT EXISTS (SELECT 1 FROM "Agency_Fiscal_Year" fiscal WHERE fiscal.id = NEW.egcs_fc_agencyfiscalyear AND fiscal.egcs_ay_organizationagency = owner_agency) THEN
          RAISE EXCEPTION 'AR fiscal year must belong to owning Agency' USING ERRCODE = '23514';
        END IF;
        IF TG_OP = 'UPDATE' AND (OLD.egcs_fc_type,OLD.egcs_fc_agencyfiscalyear,OLD.egcs_fc_linkedreceivable) IS DISTINCT FROM (NEW.egcs_fc_type,NEW.egcs_fc_agencyfiscalyear,NEW.egcs_fc_linkedreceivable) THEN
          RAISE EXCEPTION 'AR source identity is immutable' USING ERRCODE = '23514';
        END IF;
        IF NEW.egcs_fc_linkedreceivable IS NOT NULL THEN
          SELECT * INTO linked FROM "Funding_Case_Agreement_Account_Receivable" WHERE id = NEW.egcs_fc_linkedreceivable;
          IF linked.egcs_fc_outcome <> 'posted' OR linked.egcs_fc_linkedreceivable IS NOT NULL OR linked._deleted
            OR (linked.egcs_fc_pool,linked.egcs_fc_type,linked.egcs_fc_agencyfiscalyear)
              IS DISTINCT FROM (NEW.egcs_fc_pool,NEW.egcs_fc_type,NEW.egcs_fc_agencyfiscalyear) THEN
            RAISE EXCEPTION 'AR adjustment must link its established original debt' USING ERRCODE = '23514';
          END IF;
          IF TG_OP = 'INSERT' AND ar_outstanding(linked.id) <= 0 THEN
            RAISE EXCEPTION 'A cleared AR cannot be reopened by adjustment' USING ERRCODE = '23514';
          END IF;
          IF EXISTS (SELECT 1 FROM "Funding_Case_Account_Receivable_Recovery" recovery WHERE recovery.egcs_fc_pool = NEW.egcs_fc_pool AND recovery.egcs_fc_outcome = 'open' AND NOT recovery._deleted) THEN
            RAISE EXCEPTION 'Unresolved recovery blocks AR adjustments' USING ERRCODE = '23514';
          END IF;
        END IF;
        IF NEW.egcs_fc_monitorfollowup IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Monitor_Followup" followup
          JOIN "Funding_Case_Agreement_Monitor" monitor ON monitor.id = followup.egcs_fc_fundingagreementmonitor
          WHERE followup.id = NEW.egcs_fc_monitorfollowup AND monitor.egcs_fc_fundingagreement = NEW.egcs_fc_fundingagreement) THEN
          RAISE EXCEPTION 'AR Monitor follow-up must belong to its Agreement' USING ERRCODE = '23514';
        END IF;
      ELSE
        IF NEW.egcs_fc_agency <> owner_agency THEN RAISE EXCEPTION 'Credit Memo Agency must match its pool and anchor Agreement' USING ERRCODE = '23514'; END IF;
      END IF;
      IF EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Correction" correction WHERE correction.egcs_fc_fundingagreement = NEW.egcs_fc_fundingagreement AND correction.egcs_fc_outcome = 'open' AND NOT correction._deleted) THEN
        RAISE EXCEPTION 'An open Correction locks AR source financial activity' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END $$ LANGUAGE plpgsql`.execute(db)
  for (const [table, type, key] of roots) await sql.raw(`CREATE TRIGGER trg_validate_${key}_root BEFORE INSERT OR UPDATE OR DELETE ON "${table}" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_ar_root('${type}')`).execute(db)
  await sql`CREATE FUNCTION trg_fn_validate_ar_content() RETURNS trigger AS $$
    DECLARE root record; source record; original record; owner_agency bigint; root_id bigint;
    BEGIN
      root_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.egcs_fc_receivable ELSE NEW.egcs_fc_receivable END;
      SELECT * INTO root FROM "Funding_Case_Agreement_Account_Receivable" WHERE id = root_id FOR UPDATE;
      IF root.egcs_fc_outcome <> 'open' OR ar_has_lifecycle_evidence(root_id,'fundingcaseaccountreceivable') THEN
        RAISE EXCEPTION 'Submitted AR source evidence is immutable' USING ERRCODE = '23514';
      END IF;
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
      IF TG_OP = 'UPDATE' AND (OLD.egcs_fc_receivable,OLD.egcs_fc_fundingagreement)
        IS DISTINCT FROM (NEW.egcs_fc_receivable,NEW.egcs_fc_fundingagreement) THEN
        RAISE EXCEPTION 'AR evidence cannot move between roots' USING ERRCODE = '23514';
      END IF;
      IF TG_TABLE_NAME = 'Funding_Case_Agreement_Account_Receivable_Line' THEN
        IF root.egcs_fc_linkedreceivable IS NULL AND (NEW.egcs_fc_originalline IS NOT NULL OR NEW.egcs_fc_amount < 0 OR NEW.egcs_fc_amount > NEW.egcs_fc_sourceamount) THEN
          RAISE EXCEPTION 'Initial AR amounts must remain within their source basis' USING ERRCODE = '23514';
        END IF;
        IF root.egcs_fc_linkedreceivable IS NOT NULL THEN
          SELECT * INTO original FROM "Funding_Case_Agreement_Account_Receivable_Line" WHERE id = NEW.egcs_fc_originalline;
          IF original.id IS NULL OR original.egcs_fc_originalline IS NOT NULL OR original.egcs_fc_receivable <> root.egcs_fc_linkedreceivable
            OR (original.egcs_fc_sourcekey,original.egcs_fc_claim,original.egcs_fc_claimline,original.egcs_fc_reconcileline,original.egcs_fc_payment,original.egcs_fc_periodstart,original.egcs_fc_periodend,original.egcs_fc_sourceamount,original.egcs_fc_evidence)
              IS DISTINCT FROM (NEW.egcs_fc_sourcekey,NEW.egcs_fc_claim,NEW.egcs_fc_claimline,NEW.egcs_fc_reconcileline,NEW.egcs_fc_payment,NEW.egcs_fc_periodstart,NEW.egcs_fc_periodend,NEW.egcs_fc_sourceamount,NEW.egcs_fc_evidence) THEN
            RAISE EXCEPTION 'AR adjustment must preserve its original source lineage' USING ERRCODE = '23514';
          END IF;
        END IF;
        IF root.egcs_fc_type = 'ineligible_expense' THEN
          IF NEW.egcs_fc_claim IS NULL OR NEW.egcs_fc_claimline IS NULL OR NEW.egcs_fc_reconcileline IS NULL THEN
            RAISE EXCEPTION 'Ineligible expense AR requires Claim reconciliation lineage' USING ERRCODE = '23514';
          END IF;
          IF NOT EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Claim_Reconcile_Line_Item" reconciled
            JOIN "Funding_Case_Agreement_Claim_Reconcile" reconciliation ON reconciliation.id = reconciled.egcs_fc_fundingagreementclaimreconcile
            JOIN "Funding_Case_Agreement_Claim" claim ON claim.id = reconciliation.egcs_fc_fundingagreementclaim
            JOIN "Funding_Case_Agreement_Claim_Line_Item" claimline ON claimline.id = reconciled.egcs_fc_lineitem
            JOIN "Funding_Case_Agreement_Budget_Fiscal_Year" fiscal ON fiscal.id = claim.egcs_fc_fiscalyear
            WHERE reconciled.id = NEW.egcs_fc_reconcileline AND reconciled.egcs_fc_lineitem = NEW.egcs_fc_claimline
              AND claim.id = NEW.egcs_fc_claim AND claimline.egcs_fc_fundingagreementclaim = claim.id
              AND claim.egcs_fc_fundingagreement = root.egcs_fc_fundingagreement AND fiscal.egcs_fc_fiscalyear = root.egcs_fc_agencyfiscalyear
              AND claim.egcs_fc_applicantrecipient = root.egcs_fc_applicantrecipient
              AND NEW.egcs_fc_periodstart = claim.egcs_fc_periodstart AND NEW.egcs_fc_periodend = claim.egcs_fc_periodend
              AND (root.egcs_fc_linkedreceivable IS NOT NULL OR (reconciliation.egcs_fc_isfinal AND reconciled.egcs_fc_reconciled >= NEW.egcs_fc_sourceamount))) THEN
            RAISE EXCEPTION 'AR Claim source must preserve Agreement fiscal and period lineage' USING ERRCODE = '23514';
          END IF;
        ELSE
          IF num_nonnulls(NEW.egcs_fc_claim,NEW.egcs_fc_claimline,NEW.egcs_fc_reconcileline) <> 0 OR NEW.egcs_fc_payment IS NULL THEN
            RAISE EXCEPTION 'Advance AR requires paid evidence without invented Claim lineage' USING ERRCODE = '23514';
          END IF;
          IF NOT EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Payment" payment
            JOIN "Funding_Case_Agreement_Budget_Fiscal_Year" fiscal ON fiscal.id = payment.egcs_fc_fiscalyear
            WHERE payment.id = NEW.egcs_fc_payment AND payment.egcs_fc_fundingagreement = root.egcs_fc_fundingagreement
              AND payment.egcs_fc_applicantrecipient = root.egcs_fc_applicantrecipient AND payment.egcs_fc_currency = root.egcs_fc_currency
              AND fiscal.egcs_fc_fiscalyear = root.egcs_fc_agencyfiscalyear) THEN
            RAISE EXCEPTION 'Advance AR source requires explicit payee and retained fiscal lineage' USING ERRCODE = '23514';
          END IF;
        END IF;
      ELSE
        SELECT egcs_fc_agency INTO owner_agency FROM "Funding_Case_Account_Receivable_Pool" WHERE id = root.egcs_fc_pool;
        SELECT * INTO source FROM "Funding_Case_Agreement_Account_Receivable_Line" WHERE id = NEW.egcs_fc_receivableline;
        IF NEW.egcs_fc_agencyfiscalyear IS DISTINCT FROM root.egcs_fc_agencyfiscalyear THEN
          RAISE EXCEPTION 'AR coding must retain original source fiscal period' USING ERRCODE = '23514';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Commitment_Line" line
          JOIN "Transfer_Payment_Stream_Chart_of_Account" retained_chart ON retained_chart.id = NEW.egcs_fc_chartofaccount
          JOIN "Agency_Chart_of_Account" account ON account.id = NEW.egcs_fc_agencychartofaccount
          JOIN "Transfer_Payment_Stream" stream ON stream.id = retained_chart.egcs_tp_transferpaymentstream
          JOIN "Transfer_Payment_Profile" program ON program.id = stream.egcs_tp_transferpaymentprofile
          WHERE line.id = NEW.egcs_fc_commitmentline AND line.egcs_fc_fundingagreement = root.egcs_fc_fundingagreement
            AND retained_chart.egcs_tp_agencychartofaccount = account.id
            AND account.egcs_ay_organizationagency = owner_agency AND program.egcs_tp_agency = owner_agency
            AND account.egcs_ay_fiscalyear = root.egcs_fc_agencyfiscalyear AND account.egcs_ay_currency = root.egcs_fc_currency) THEN
          RAISE EXCEPTION 'AR coding must preserve Commitment and Agency Chart currency lineage' USING ERRCODE = '23514';
        END IF;
        IF root.egcs_fc_linkedreceivable IS NULL AND (NEW.egcs_fc_amount < 0 OR NEW.egcs_fc_amount > NEW.egcs_fc_paidbasis) THEN
          RAISE EXCEPTION 'AR coding principal exceeds its retained paid basis' USING ERRCODE = '23514';
        END IF;
      END IF;
      RETURN NEW;
    END $$ LANGUAGE plpgsql`.execute(db)
  for (const table of ['Funding_Case_Agreement_Account_Receivable_Line','Funding_Case_Agreement_Account_Receivable_Coding']) {
    await sql`CREATE TRIGGER trg_validate_ar_content BEFORE INSERT OR UPDATE OR DELETE ON ${sql.table(table)} FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_ar_content()`.execute(db)
  }
  await sql`CREATE FUNCTION trg_fn_protect_ar_roster() RETURNS trigger AS $$
    DECLARE root_id bigint; target_type text; root_outcome text;
    BEGIN
      root_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.egcs_cn_entityid ELSE NEW.egcs_cn_entityid END;
      target_type := CASE WHEN TG_OP = 'DELETE' THEN OLD.egcs_cn_entitytype ELSE NEW.egcs_cn_entitytype END;
      IF target_type = 'fundingcaseaccountreceivable' THEN
        SELECT egcs_fc_outcome INTO root_outcome FROM "Funding_Case_Agreement_Account_Receivable" WHERE id = root_id FOR UPDATE;
      ELSIF target_type = 'fundingcaseaccountreceivablecreditmemo' THEN
        SELECT egcs_fc_outcome INTO root_outcome FROM "Funding_Case_Account_Receivable_Credit_Memo" WHERE id = root_id FOR UPDATE;
      ELSE IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW;
      END IF;
      IF root_outcome <> 'open' OR ar_has_lifecycle_evidence(root_id,target_type) THEN RAISE EXCEPTION 'Submitted AR roster is immutable' USING ERRCODE = '23514'; END IF;
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW;
    END $$ LANGUAGE plpgsql`.execute(db)
  await sql`CREATE TRIGGER trg_protect_ar_roster BEFORE INSERT OR UPDATE OR DELETE ON "Common_Entity_Assignment" FOR EACH ROW EXECUTE FUNCTION trg_fn_protect_ar_roster()`.execute(db)
  await sql`CREATE FUNCTION trg_fn_validate_ar_establishment() RETURNS trigger AS $$
    DECLARE root record; root_id bigint; source record; coding record; principal numeric; consumed numeric; target_type text;
    BEGIN
      target_type := TG_ARGV[0];
      root_id := CASE WHEN TG_TABLE_NAME IN ('Funding_Case_Agreement_Account_Receivable_Line','Funding_Case_Agreement_Account_Receivable_Coding') THEN (to_jsonb(NEW)->>'egcs_fc_receivable')::bigint ELSE NEW.id END;
      IF target_type = 'fundingcaseaccountreceivable' THEN
        SELECT * INTO root FROM "Funding_Case_Agreement_Account_Receivable" WHERE id = root_id;
      ELSE
        SELECT * INTO root FROM "Funding_Case_Account_Receivable_Credit_Memo" WHERE id = root_id;
      END IF;
      IF root.egcs_fc_outcome = 'posted' THEN
        IF NOT ar_successful_submission(root_id,target_type,root.egcs_fc_postingruntime) THEN
          RAISE EXCEPTION 'AR posting requires its latest successful Completion-linked approval submission' USING ERRCODE = '23514';
        END IF;
        IF target_type = 'fundingcaseaccountreceivable' THEN
          IF EXISTS (SELECT 1 FROM "Funding_Case_Account_Receivable_Recovery" pending
            WHERE pending.egcs_fc_pool = root.egcs_fc_pool AND pending.egcs_fc_outcome = 'open' AND NOT pending._deleted) THEN
            RAISE EXCEPTION 'Unresolved recovery blocks AR establishment' USING ERRCODE = '23514';
          END IF;
          IF btrim(root.egcs_fc_narrative_en) = '' AND btrim(root.egcs_fc_narrative_fr) = '' THEN RAISE EXCEPTION 'AR establishment requires a bilingual-group rationale' USING ERRCODE = '23514'; END IF;
          IF root.egcs_fc_recipientpreference IS NOT NULL AND root.egcs_fc_recipientpreference <> root.egcs_fc_recoverymethod
            AND btrim(root.egcs_fc_preferenceoverride_en) = '' AND btrim(root.egcs_fc_preferenceoverride_fr) = '' THEN
            RAISE EXCEPTION 'AR preference override requires a rationale' USING ERRCODE = '23514';
          END IF;
          SELECT COALESCE(sum(egcs_fc_amount),0) INTO principal FROM "Funding_Case_Agreement_Account_Receivable_Line" WHERE egcs_fc_receivable = root_id AND NOT _deleted;
          IF root.egcs_fc_linkedreceivable IS NULL AND principal <= 0 THEN RAISE EXCEPTION 'AR establishment requires positive principal' USING ERRCODE = '23514'; END IF;
          FOR source IN SELECT * FROM "Funding_Case_Agreement_Account_Receivable_Line" WHERE egcs_fc_receivable = root_id AND NOT _deleted LOOP
            IF COALESCE((SELECT sum(egcs_fc_amount) FROM "Funding_Case_Agreement_Account_Receivable_Coding" WHERE egcs_fc_receivableline = source.id AND NOT _deleted),0) <> source.egcs_fc_amount THEN
              RAISE EXCEPTION 'AR coding must partition source principal exactly once' USING ERRCODE = '23514';
            END IF;
            SELECT COALESCE(sum(CASE WHEN other.egcs_fc_outcome = 'posted' THEN line.egcs_fc_amount ELSE greatest(line.egcs_fc_amount,0) END),0) INTO consumed FROM "Funding_Case_Agreement_Account_Receivable_Line" line
              JOIN "Funding_Case_Agreement_Account_Receivable" other ON other.id = line.egcs_fc_receivable
              WHERE line.egcs_fc_fundingagreement = root.egcs_fc_fundingagreement AND line.egcs_fc_sourcekey = source.egcs_fc_sourcekey
                AND other.egcs_fc_applicantrecipient = root.egcs_fc_applicantrecipient
                AND NOT line._deleted AND NOT other._deleted
                AND (other.egcs_fc_outcome = 'posted' OR (other.egcs_fc_outcome = 'open' AND ar_has_lifecycle_evidence(other.id,'fundingcaseaccountreceivable')));
            IF root.egcs_fc_type = 'outstanding_advance' THEN
              consumed := consumed - COALESCE((SELECT sum(allocation.egcs_fc_amount)
                FROM "Funding_Case_Account_Receivable_Allocation" allocation
                JOIN "Funding_Case_Account_Receivable_Recovery" recovery ON recovery.id = allocation.egcs_fc_recovery
                JOIN "Funding_Case_Agreement_Account_Receivable_Line" original ON original.id = allocation.egcs_fc_receivableline
                JOIN "Funding_Case_Agreement_Account_Receivable" originaldebt ON originaldebt.id = original.egcs_fc_receivable
                WHERE original.egcs_fc_fundingagreement = root.egcs_fc_fundingagreement AND original.egcs_fc_sourcekey = source.egcs_fc_sourcekey
                  AND originaldebt.egcs_fc_applicantrecipient = root.egcs_fc_applicantrecipient
                  AND recovery.egcs_fc_outcome = 'posted' AND NOT allocation._deleted AND NOT recovery._deleted),0);
            END IF;
            IF consumed > source.egcs_fc_sourceamount OR consumed < 0 THEN RAISE EXCEPTION 'AR source principal is already reserved or established' USING ERRCODE = '23514'; END IF;
            IF root.egcs_fc_linkedreceivable IS NOT NULL AND ar_line_principal(source.egcs_fc_originalline) <
              COALESCE((SELECT sum(allocation.egcs_fc_amount) FROM "Funding_Case_Account_Receivable_Allocation" allocation
                JOIN "Funding_Case_Account_Receivable_Recovery" recovery ON recovery.id = allocation.egcs_fc_recovery
                WHERE allocation.egcs_fc_receivableline = source.egcs_fc_originalline AND recovery.egcs_fc_outcome IN ('open','posted')
                  AND NOT allocation._deleted AND NOT recovery._deleted),0) THEN
              RAISE EXCEPTION 'AR adjustment cannot reduce recovered or reserved principal' USING ERRCODE = '23514';
            END IF;
          END LOOP;
          -- Different Claim source lines can retain the same paid coding basis.
          -- Reserve its outstanding principal once across every established or
          -- submitted AR, including approved signed adjustments and collections.
          FOR coding IN SELECT egcs_fc_commitmentline,egcs_fc_chartofaccount,egcs_fc_agencyfiscalyear,
              egcs_fc_periodstart,egcs_fc_periodend,min(egcs_fc_paidbasis) paid_basis
            FROM "Funding_Case_Agreement_Account_Receivable_Coding"
            WHERE egcs_fc_receivable = root_id AND NOT _deleted
            GROUP BY egcs_fc_commitmentline,egcs_fc_chartofaccount,egcs_fc_agencyfiscalyear,egcs_fc_periodstart,egcs_fc_periodend LOOP
            SELECT COALESCE(sum(CASE WHEN other.egcs_fc_outcome = 'posted' THEN retained.egcs_fc_amount
              ELSE greatest(retained.egcs_fc_amount,0) END),0) INTO consumed
              FROM "Funding_Case_Agreement_Account_Receivable_Coding" retained
              JOIN "Funding_Case_Agreement_Account_Receivable" other ON other.id = retained.egcs_fc_receivable
              WHERE retained.egcs_fc_fundingagreement = root.egcs_fc_fundingagreement AND other.egcs_fc_pool = root.egcs_fc_pool
                AND (retained.egcs_fc_commitmentline,retained.egcs_fc_chartofaccount,retained.egcs_fc_agencyfiscalyear,retained.egcs_fc_periodstart,retained.egcs_fc_periodend)
                  = (coding.egcs_fc_commitmentline,coding.egcs_fc_chartofaccount,coding.egcs_fc_agencyfiscalyear,coding.egcs_fc_periodstart,coding.egcs_fc_periodend)
                AND NOT retained._deleted AND NOT other._deleted
                AND (other.egcs_fc_outcome = 'posted' OR (other.egcs_fc_outcome = 'open' AND ar_has_lifecycle_evidence(other.id,'fundingcaseaccountreceivable')));
            consumed := consumed - COALESCE((SELECT sum(posting.egcs_fc_amount)
              FROM "Funding_Case_Account_Receivable_Posting" posting
              JOIN "Funding_Case_Account_Receivable_Recovery" recovery ON recovery.id = posting.egcs_fc_recovery
              WHERE posting.egcs_fc_fundingagreement = root.egcs_fc_fundingagreement AND recovery.egcs_fc_pool = root.egcs_fc_pool
                AND (posting.egcs_fc_commitmentline,posting.egcs_fc_chartofaccount,posting.egcs_fc_agencyfiscalyear,posting.egcs_fc_periodstart,posting.egcs_fc_periodend)
                  = (coding.egcs_fc_commitmentline,coding.egcs_fc_chartofaccount,coding.egcs_fc_agencyfiscalyear,coding.egcs_fc_periodstart,coding.egcs_fc_periodend)
                AND recovery.egcs_fc_outcome = 'posted' AND NOT posting._deleted AND NOT recovery._deleted),0);
            IF consumed > coding.paid_basis OR consumed < 0 THEN
              RAISE EXCEPTION 'AR coding principal is already reserved or established against its shared paid basis' USING ERRCODE = '23514';
            END IF;
          END LOOP;
        ELSE
          IF NOT EXISTS (SELECT 1 FROM "Funding_Case_Account_Receivable_Recovery" recovery WHERE recovery.egcs_fc_creditmemo = root_id
            AND recovery.egcs_fc_outcome = 'posted' AND recovery.egcs_fc_amount = root.egcs_fc_amount AND NOT recovery._deleted) THEN
            RAISE EXCEPTION 'Approved Credit Memo must post its received amount exactly once' USING ERRCODE = '23514';
          END IF;
        END IF;
      END IF;
      RETURN NULL;
    END $$ LANGUAGE plpgsql`.execute(db)
  for (const [table, type] of roots) {
    await sql.raw(`CREATE CONSTRAINT TRIGGER trg_validate_ar_establishment AFTER INSERT OR UPDATE ON "${table}" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_ar_establishment('${type}')`).execute(db)
  }
  for (const table of ['Funding_Case_Agreement_Account_Receivable_Line','Funding_Case_Agreement_Account_Receivable_Coding']) {
    await sql`CREATE CONSTRAINT TRIGGER trg_validate_ar_establishment AFTER INSERT OR UPDATE ON ${sql.table(table)} DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_ar_establishment('fundingcaseaccountreceivable')`.execute(db)
  }
  await sql`CREATE FUNCTION trg_fn_validate_ar_recovery() RETURNS trigger AS $$
    DECLARE recovery record; pool record; root record; allocation record; coding record; operation record; principal numeric; consumed numeric; recovery_id bigint;
    BEGIN
      IF TG_TABLE_NAME = 'Funding_Case_Account_Receivable_Recovery' THEN
        IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Recovery reservations retain evidence' USING ERRCODE = '23514'; END IF;
        SELECT * INTO pool FROM "Funding_Case_Account_Receivable_Pool" WHERE id = NEW.egcs_fc_pool FOR UPDATE;
        IF TG_OP = 'UPDATE' THEN
          IF (OLD.egcs_fc_pool,OLD.egcs_fc_payment,OLD.egcs_fc_creditmemo) IS DISTINCT FROM (NEW.egcs_fc_pool,NEW.egcs_fc_payment,NEW.egcs_fc_creditmemo) THEN
            RAISE EXCEPTION 'Recovery owner identity is immutable' USING ERRCODE = '23514';
          END IF;
          IF OLD.egcs_fc_outcome <> 'open' AND to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW) THEN RAISE EXCEPTION 'Completed recovery is immutable' USING ERRCODE = '23514'; END IF;
          IF NEW.egcs_fc_payment IS NOT NULL AND ar_has_lifecycle_evidence(NEW.egcs_fc_payment,'fundingcasepayment') AND NEW.egcs_fc_amount <> OLD.egcs_fc_amount THEN
            RAISE EXCEPTION 'Submitted offset allocation is immutable' USING ERRCODE = '23514';
          END IF;
          IF NEW.egcs_fc_creditmemo IS NOT NULL AND ar_has_lifecycle_evidence(NEW.egcs_fc_creditmemo,'fundingcaseaccountreceivablecreditmemo') AND NEW.egcs_fc_amount <> OLD.egcs_fc_amount THEN
            RAISE EXCEPTION 'Submitted repayment allocation is immutable' USING ERRCODE = '23514';
          END IF;
        END IF;
        IF NEW.egcs_fc_outcome = 'open' AND NOT NEW._deleted AND EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Account_Receivable" adjustment
          WHERE adjustment.egcs_fc_pool = NEW.egcs_fc_pool AND adjustment.egcs_fc_linkedreceivable IS NOT NULL
            AND adjustment.egcs_fc_outcome = 'open' AND NOT adjustment._deleted) THEN
          RAISE EXCEPTION 'Pending AR adjustment blocks recovery processing' USING ERRCODE = '23514';
        END IF;
        IF NEW.egcs_fc_payment IS NOT NULL THEN
          IF NOT EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Payment" payment
            JOIN "Funding_Case_Agreement_Profile" agreement ON agreement.id = payment.egcs_fc_fundingagreement
            JOIN "Transfer_Payment_Stream" stream ON stream.id = agreement.egcs_fc_transferpaymentstream
            JOIN "Transfer_Payment_Profile" program ON program.id = stream.egcs_tp_transferpaymentprofile
            WHERE payment.id = NEW.egcs_fc_payment AND payment.egcs_fc_applicantrecipient = pool.egcs_fc_applicantrecipient
              AND program.egcs_tp_agency = pool.egcs_fc_agency AND payment.egcs_fc_currency = pool.egcs_fc_currency
              AND payment.egcs_fc_paymentamount >= NEW.egcs_fc_amount AND NOT payment._deleted) THEN
            RAISE EXCEPTION 'Offset must match actual Payment payee Agency currency and gross amount' USING ERRCODE = '23514';
          END IF;
        ELSE
          IF NOT EXISTS (SELECT 1 FROM "Funding_Case_Account_Receivable_Credit_Memo" repayment WHERE repayment.id = NEW.egcs_fc_creditmemo
            AND repayment.egcs_fc_pool = NEW.egcs_fc_pool AND repayment.egcs_fc_amount = NEW.egcs_fc_amount AND NOT repayment._deleted) THEN
            RAISE EXCEPTION 'Recovery must match received repayment amount and Agency pool' USING ERRCODE = '23514';
          END IF;
        END IF;
        RETURN NEW;
      END IF;
      recovery_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.egcs_fc_recovery ELSE NEW.egcs_fc_recovery END;
      SELECT * INTO recovery FROM "Funding_Case_Account_Receivable_Recovery" WHERE id = recovery_id FOR UPDATE;
      SELECT * INTO pool FROM "Funding_Case_Account_Receivable_Pool" WHERE id = recovery.egcs_fc_pool FOR UPDATE;
      IF recovery.egcs_fc_outcome <> 'open' THEN RAISE EXCEPTION 'Completed recovery evidence is immutable' USING ERRCODE = '23514'; END IF;
      IF TG_TABLE_NAME = 'Funding_Case_Account_Receivable_Allocation' THEN
        IF (recovery.egcs_fc_payment IS NOT NULL AND ar_has_lifecycle_evidence(recovery.egcs_fc_payment,'fundingcasepayment'))
          OR (recovery.egcs_fc_creditmemo IS NOT NULL AND ar_has_lifecycle_evidence(recovery.egcs_fc_creditmemo,'fundingcaseaccountreceivablecreditmemo')) THEN
          RAISE EXCEPTION 'Submitted recovery allocations are immutable' USING ERRCODE = '23514';
        END IF;
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        SELECT * INTO root FROM "Funding_Case_Agreement_Account_Receivable" WHERE id = NEW.egcs_fc_receivable FOR UPDATE;
        IF root.egcs_fc_pool <> recovery.egcs_fc_pool OR root.egcs_fc_outcome <> 'posted' OR root.egcs_fc_linkedreceivable IS NOT NULL OR root._deleted THEN
          RAISE EXCEPTION 'Recovery allocation requires original established debt in its pool' USING ERRCODE = '23514';
        END IF;
        IF recovery.egcs_fc_payment IS NOT NULL AND COALESCE((SELECT latest.egcs_fc_recoverymethod FROM "Funding_Case_Agreement_Account_Receivable" latest
          WHERE (latest.id = root.id OR latest.egcs_fc_linkedreceivable = root.id) AND latest.egcs_fc_outcome = 'posted' AND NOT latest._deleted
          ORDER BY latest.egcs_fc_postedat DESC,latest.id DESC LIMIT 1),root.egcs_fc_recoverymethod) <> 'offset' THEN
          RAISE EXCEPTION 'Automatic recovery must apply approved AR offset policy' USING ERRCODE = '23514';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Account_Receivable_Line" line WHERE line.id = NEW.egcs_fc_receivableline
          AND line.egcs_fc_originalline IS NULL AND line.egcs_fc_receivable = root.id AND NOT line._deleted) THEN
          RAISE EXCEPTION 'Recovery must allocate original source lines' USING ERRCODE = '23514';
        END IF;
        principal := ar_line_principal(NEW.egcs_fc_receivableline);
        SELECT COALESCE(sum(existing.egcs_fc_amount),0) INTO consumed FROM "Funding_Case_Account_Receivable_Allocation" existing
          JOIN "Funding_Case_Account_Receivable_Recovery" prior ON prior.id = existing.egcs_fc_recovery
          WHERE existing.egcs_fc_receivableline = NEW.egcs_fc_receivableline AND existing.id <> COALESCE(NEW.id,-1)
            AND prior.egcs_fc_outcome IN ('open','posted') AND NOT existing._deleted AND NOT prior._deleted;
        IF NOT NEW._deleted AND consumed + NEW.egcs_fc_amount > principal THEN RAISE EXCEPTION 'Recovery exceeds available source principal' USING ERRCODE = '23514'; END IF;
        IF EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Correction" correction WHERE correction.egcs_fc_fundingagreement = root.egcs_fc_fundingagreement AND correction.egcs_fc_outcome = 'open' AND NOT correction._deleted) THEN
          RAISE EXCEPTION 'An open Correction locks recovery source accounting' USING ERRCODE = '23514';
        END IF;
      ELSE
        IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Recovery postings are immutable' USING ERRCODE = '23514'; END IF;
        SELECT * INTO allocation FROM "Funding_Case_Account_Receivable_Allocation" WHERE id = NEW.egcs_fc_allocation;
        SELECT * INTO coding FROM "Funding_Case_Agreement_Account_Receivable_Coding" WHERE id = NEW.egcs_fc_coding;
        IF coding.egcs_fc_receivableline <> allocation.egcs_fc_receivableline
          OR (NEW.egcs_fc_receivable,NEW.egcs_fc_fundingagreement,NEW.egcs_fc_commitmentline,NEW.egcs_fc_chartofaccount,NEW.egcs_fc_agencychartofaccount,NEW.egcs_fc_agencyfiscalyear,NEW.egcs_fc_periodstart,NEW.egcs_fc_periodend)
          IS DISTINCT FROM (coding.egcs_fc_receivable,coding.egcs_fc_fundingagreement,coding.egcs_fc_commitmentline,coding.egcs_fc_chartofaccount,coding.egcs_fc_agencychartofaccount,coding.egcs_fc_agencyfiscalyear,coding.egcs_fc_periodstart,coding.egcs_fc_periodend) THEN
          RAISE EXCEPTION 'Recovery posting must preserve exact source coding and period' USING ERRCODE = '23514';
        END IF;
        SELECT COALESCE(sum(posting.egcs_fc_amount),0) INTO consumed FROM "Funding_Case_Account_Receivable_Posting" posting
          JOIN "Funding_Case_Account_Receivable_Recovery" prior ON prior.id = posting.egcs_fc_recovery
          WHERE posting.egcs_fc_coding = coding.id AND prior.egcs_fc_outcome IN ('open','posted') AND NOT posting._deleted AND NOT prior._deleted;
        SELECT COALESCE(sum(adjusted.egcs_fc_amount),0) INTO principal FROM "Funding_Case_Agreement_Account_Receivable_Coding" adjusted
          JOIN "Funding_Case_Agreement_Account_Receivable_Line" adjusted_line ON adjusted_line.id = adjusted.egcs_fc_receivableline
          JOIN "Funding_Case_Agreement_Account_Receivable" adjusted_root ON adjusted_root.id = adjusted.egcs_fc_receivable
          WHERE adjusted_line.egcs_fc_originalline = coding.egcs_fc_receivableline
            AND adjusted.egcs_fc_commitmentline = coding.egcs_fc_commitmentline AND adjusted.egcs_fc_chartofaccount = coding.egcs_fc_chartofaccount
            AND adjusted.egcs_fc_periodstart = coding.egcs_fc_periodstart AND adjusted.egcs_fc_periodend = coding.egcs_fc_periodend
            AND adjusted_root.egcs_fc_outcome = 'posted' AND NOT adjusted._deleted AND NOT adjusted_root._deleted;
        IF consumed + NEW.egcs_fc_amount > coding.egcs_fc_amount + principal THEN
          RAISE EXCEPTION 'Recovery posting exceeds retained coding principal' USING ERRCODE = '23514';
        END IF;
      END IF;
      RETURN NEW;
    END $$ LANGUAGE plpgsql`.execute(db)
  for (const table of ['Funding_Case_Account_Receivable_Recovery','Funding_Case_Account_Receivable_Allocation','Funding_Case_Account_Receivable_Posting']) {
    await sql`CREATE TRIGGER trg_validate_ar_recovery BEFORE INSERT OR UPDATE OR DELETE ON ${sql.table(table)} FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_ar_recovery()`.execute(db)
  }
  await sql`CREATE FUNCTION trg_fn_validate_ar_recovery_posting() RETURNS trigger AS $$
    DECLARE recovery_id bigint; recovery record; operation record; target_id bigint; target_type text;
    BEGIN
      recovery_id := CASE WHEN TG_TABLE_NAME = 'Funding_Case_Account_Receivable_Recovery' THEN NEW.id ELSE (to_jsonb(NEW)->>'egcs_fc_recovery')::bigint END;
      SELECT * INTO recovery FROM "Funding_Case_Account_Receivable_Recovery" WHERE id = recovery_id;
      IF NOT recovery._deleted AND recovery.egcs_fc_outcome IN ('open','posted') AND COALESCE((SELECT sum(egcs_fc_amount)
        FROM "Funding_Case_Account_Receivable_Allocation" WHERE egcs_fc_recovery = recovery_id AND NOT _deleted),0) <> recovery.egcs_fc_amount THEN
        RAISE EXCEPTION 'Recovery allocations must sum exactly to received or offset principal' USING ERRCODE = '23514';
      END IF;
      IF recovery.egcs_fc_outcome = 'posted' THEN
        target_id := COALESCE(recovery.egcs_fc_payment,recovery.egcs_fc_creditmemo);
        target_type := CASE WHEN recovery.egcs_fc_payment IS NOT NULL THEN 'fundingcasepayment' ELSE 'fundingcaseaccountreceivablecreditmemo' END;
        IF NOT ar_successful_submission(target_id,target_type,recovery.egcs_fc_postingruntime) THEN
          RAISE EXCEPTION 'Recovery posting requires its latest successful approval submission' USING ERRCODE = '23514';
        END IF;
        IF recovery.egcs_fc_creditmemo IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Funding_Case_Account_Receivable_Credit_Memo" repayment WHERE repayment.id = recovery.egcs_fc_creditmemo
          AND repayment.egcs_fc_outcome = 'posted' AND repayment.egcs_fc_postingruntime = recovery.egcs_fc_postingruntime) THEN
          RAISE EXCEPTION 'Recovery and repayment must post atomically' USING ERRCODE = '23514';
        END IF;
        IF EXISTS (SELECT 1 FROM "Funding_Case_Account_Receivable_Allocation" allocation WHERE allocation.egcs_fc_recovery = recovery_id AND NOT allocation._deleted
          AND allocation.egcs_fc_amount <> COALESCE((SELECT sum(posting.egcs_fc_amount) FROM "Funding_Case_Account_Receivable_Posting" posting WHERE posting.egcs_fc_allocation = allocation.id AND NOT posting._deleted),0)) THEN
          RAISE EXCEPTION 'Recovery coding must post every allocated source amount once' USING ERRCODE = '23514';
        END IF;
      ELSIF EXISTS (SELECT 1 FROM "Funding_Case_Account_Receivable_Posting" posting WHERE posting.egcs_fc_recovery = recovery_id) THEN
        RAISE EXCEPTION 'Only successful recoveries may retain accounting postings' USING ERRCODE = '23514';
      END IF;
      RETURN NULL;
    END $$ LANGUAGE plpgsql`.execute(db)
  for (const table of ['Funding_Case_Account_Receivable_Recovery','Funding_Case_Account_Receivable_Allocation','Funding_Case_Account_Receivable_Posting']) {
    await sql`CREATE CONSTRAINT TRIGGER trg_validate_ar_recovery_posting AFTER INSERT OR UPDATE ON ${sql.table(table)} DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_ar_recovery_posting()`.execute(db)
  }
  await sql`CREATE FUNCTION ar_payment_control(payment_id bigint, agreement_id bigint, debtor_id bigint) RETURNS text AS $$
    DECLARE owner_agency bigint;
    BEGIN
      SELECT program.egcs_tp_agency INTO owner_agency FROM "Funding_Case_Agreement_Profile" agreement
        JOIN "Transfer_Payment_Stream" stream ON stream.id = agreement.egcs_fc_transferpaymentstream
        JOIN "Transfer_Payment_Profile" program ON program.id = stream.egcs_tp_transferpaymentprofile WHERE agreement.id = agreement_id;
      IF debtor_id IS NULL THEN RETURN 'payee_required'; END IF;
      PERFORM id FROM "Funding_Case_Account_Receivable_Pool" WHERE egcs_fc_agency = owner_agency AND egcs_fc_applicantrecipient = debtor_id ORDER BY id FOR UPDATE;
      IF EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Account_Receivable" debt
        JOIN "Funding_Case_Account_Receivable_Pool" pool ON pool.id = debt.egcs_fc_pool
        WHERE pool.egcs_fc_agency = owner_agency AND pool.egcs_fc_applicantrecipient = debtor_id
          AND debt.egcs_fc_linkedreceivable IS NULL AND debt.egcs_fc_outcome = 'posted' AND NOT debt._deleted
          AND ar_outstanding(debt.id) > 0 AND (SELECT latest.egcs_fc_recoverymethod FROM "Funding_Case_Agreement_Account_Receivable" latest
            WHERE (latest.id = debt.id OR latest.egcs_fc_linkedreceivable = debt.id) AND latest.egcs_fc_outcome = 'posted' AND NOT latest._deleted
            ORDER BY latest.egcs_fc_postedat DESC,latest.id DESC LIMIT 1) = 'direct_repayment') THEN RETURN 'direct_repayment_hold'; END IF;
      RETURN 'allowed';
    END $$ LANGUAGE plpgsql`.execute(db)
  await sql`CREATE FUNCTION trg_fn_ar_payment_control() RETURNS trigger AS $$
    DECLARE control text;
    BEGIN
      IF TG_OP = 'INSERT' OR (OLD.egcs_fc_applicantrecipient,OLD.egcs_fc_fundingagreementcommitment,OLD.egcs_fc_paymentamount,OLD.egcs_fc_periodstart,OLD.egcs_fc_periodend,OLD.egcs_fc_fiscalyear)
        IS DISTINCT FROM (NEW.egcs_fc_applicantrecipient,NEW.egcs_fc_fundingagreementcommitment,NEW.egcs_fc_paymentamount,NEW.egcs_fc_periodstart,NEW.egcs_fc_periodend,NEW.egcs_fc_fiscalyear) THEN
        IF NOT NEW._deleted THEN
          control := ar_payment_control(NEW.id,NEW.egcs_fc_fundingagreement,NEW.egcs_fc_applicantrecipient);
          IF control <> 'allowed' THEN RAISE EXCEPTION 'Payment recovery control: %',control USING ERRCODE = '23514'; END IF;
          IF NOT EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Applicant_Recipient" relation
            WHERE relation.egcs_fc_fundingagreement = NEW.egcs_fc_fundingagreement AND relation.egcs_fc_applicantrecipient = NEW.egcs_fc_applicantrecipient AND NOT relation._deleted) THEN
            RAISE EXCEPTION 'Payment payee must be one of its Agreement Proponents' USING ERRCODE = '23514';
          END IF;
        END IF;
      END IF;
      IF TG_OP = 'UPDATE' AND NEW.egcs_fc_applicantrecipient IS DISTINCT FROM OLD.egcs_fc_applicantrecipient
        AND ar_has_lifecycle_evidence(OLD.id,'fundingcasepayment') THEN RAISE EXCEPTION 'Submitted Payment payee attribution is immutable' USING ERRCODE = '23514'; END IF;
      RETURN NEW;
    END $$ LANGUAGE plpgsql`.execute(db)
  // Existing derive-parent trigger runs first; this trigger validates the resulting Agreement.
  await sql`CREATE TRIGGER zz_ar_payment_control BEFORE INSERT OR UPDATE ON "Funding_Case_Agreement_Payment" FOR EACH ROW EXECUTE FUNCTION trg_fn_ar_payment_control()`.execute(db)
  await sql`CREATE FUNCTION trg_fn_ar_payment_line_control() RETURNS trigger AS $$
    DECLARE payment record; payment_id bigint;
    BEGIN
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
      IF NEW._deleted THEN RETURN NEW; END IF;
      payment_id := NEW.egcs_fc_fundingagreementpayment;
      SELECT * INTO payment FROM "Funding_Case_Agreement_Payment" WHERE id = payment_id;
      IF ar_payment_control(payment.id,payment.egcs_fc_fundingagreement,payment.egcs_fc_applicantrecipient) <> 'allowed' THEN
        RAISE EXCEPTION 'Payment line calculation is blocked by debtor recovery control' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END $$ LANGUAGE plpgsql`.execute(db)
  await sql`CREATE TRIGGER zz_ar_payment_line_control BEFORE INSERT OR UPDATE ON "Funding_Case_Agreement_Payment_Line" FOR EACH ROW EXECUTE FUNCTION trg_fn_ar_payment_line_control()`.execute(db)
  await sql`CREATE FUNCTION trg_fn_ar_completion_control() RETURNS trigger AS $$
    DECLARE payment record;
    BEGIN
      IF NEW.egcs_cn_entitytype IN ('fundingcaseaccountreceivable','fundingcaseaccountreceivablecreditmemo')
        OR (NEW.egcs_cn_entitytype = 'fundingcasepayment' AND EXISTS (SELECT 1 FROM "Funding_Case_Account_Receivable_Recovery" recovery
          WHERE recovery.egcs_fc_payment = NEW.egcs_cn_entityid AND recovery.egcs_fc_outcome <> 'released' AND NOT recovery._deleted AND recovery.egcs_fc_amount > 0)) THEN
        IF NEW.egcs_cn_disposition <> 'workflow_started' OR NOT EXISTS (SELECT 1 FROM "Common_Workflow_Run" run
          JOIN "Common_Runtime" runtime ON runtime.id = run.id WHERE run.egcs_cn_completion = NEW.id
            AND runtime.egcs_cn_entitytype = NEW.egcs_cn_entitytype AND runtime.egcs_cn_entityid = NEW.egcs_cn_entityid
            AND runtime.egcs_cn_kind = 'workflow' AND runtime.egcs_cn_purpose = 'approval_submission' AND NOT runtime._deleted) THEN
          RAISE EXCEPTION 'AR and automatic offsets require a Completion-linked approval submission' USING ERRCODE = '23514';
        END IF;
      END IF;
      IF NEW.egcs_cn_entitytype = 'fundingcasepayment' THEN
        SELECT * INTO payment FROM "Funding_Case_Agreement_Payment" WHERE id = NEW.egcs_cn_entityid;
        IF ar_payment_control(payment.id,payment.egcs_fc_fundingagreement,payment.egcs_fc_applicantrecipient) <> 'allowed' THEN
          RAISE EXCEPTION 'Payment is blocked by debtor recovery control' USING ERRCODE = '23514';
        END IF;
      END IF;
      RETURN NULL;
    END $$ LANGUAGE plpgsql`.execute(db)
  await sql`CREATE CONSTRAINT TRIGGER trg_ar_completion_control AFTER INSERT ON "Common_Completion" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_ar_completion_control()`.execute(db)
  await sql`CREATE FUNCTION trg_fn_ar_payment_terminal_control() RETURNS trigger AS $$
    DECLARE payment record;
    BEGIN
      IF NEW.egcs_cn_entitytype = 'fundingcasepayment' AND NEW.egcs_cn_kind = 'workflow'
        AND NEW.egcs_cn_purpose = 'approval_submission' AND NEW.egcs_cn_state IN ('succeeded','approved') AND NOT NEW._deleted THEN
        SELECT * INTO payment FROM "Funding_Case_Agreement_Payment" WHERE id = NEW.egcs_cn_entityid;
        IF ar_payment_control(payment.id,payment.egcs_fc_fundingagreement,payment.egcs_fc_applicantrecipient) <> 'allowed' THEN
          RAISE EXCEPTION 'Final Payment is blocked by debtor recovery control' USING ERRCODE = '23514';
        END IF;
        IF EXISTS (SELECT 1 FROM "Funding_Case_Account_Receivable_Recovery" recovery WHERE recovery.egcs_fc_payment = payment.id
          AND recovery.egcs_fc_outcome = 'open' AND recovery.egcs_fc_amount > 0) THEN
          RAISE EXCEPTION 'Final Payment must post its Credit Memo atomically' USING ERRCODE = '23514';
        END IF;
      END IF;
      RETURN NULL;
    END $$ LANGUAGE plpgsql`.execute(db)
  await sql`CREATE CONSTRAINT TRIGGER trg_ar_payment_terminal_control AFTER INSERT OR UPDATE ON "Common_Runtime" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_ar_payment_terminal_control()`.execute(db)
  await sql`CREATE FUNCTION trg_fn_ar_monitor_followup() RETURNS trigger AS $$
    BEGIN
      IF NEW.egcs_fc_requiresreceivable AND NEW.egcs_fc_status = 'completed' AND NOT NEW._deleted AND NOT EXISTS (
        SELECT 1 FROM "Funding_Case_Agreement_Account_Receivable" root WHERE root.egcs_fc_monitorfollowup = NEW.id
          AND root.egcs_fc_linkedreceivable IS NULL AND root.egcs_fc_outcome = 'posted' AND NOT root._deleted) THEN
        RAISE EXCEPTION 'Recovery follow-up requires actual AR establishment evidence' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END $$ LANGUAGE plpgsql`.execute(db)
  await sql`CREATE TRIGGER trg_ar_monitor_followup BEFORE INSERT OR UPDATE ON "Funding_Case_Agreement_Monitor_Followup" FOR EACH ROW EXECUTE FUNCTION trg_fn_ar_monitor_followup()`.execute(db)
}

/** Refuses to discard authored AR evidence, grants, or explicitly attributed payees. */
export const down = async (db: Kysely<Database>): Promise<void> => {
  const authored = await sql`SELECT 1 FROM "Funding_Case_Agreement_Account_Receivable"
    UNION ALL SELECT 1 FROM "Funding_Case_Account_Receivable_Credit_Memo"
    UNION ALL SELECT 1 FROM "Funding_Case_Account_Receivable_Recovery"
    UNION ALL SELECT 1 FROM role_permission WHERE subject = 'account_receivable'
    UNION ALL SELECT 1 FROM "Common_Entity" WHERE egcs_cn_entitytype IN ('fundingcaseaccountreceivable','fundingcaseaccountreceivablecreditmemo')
    UNION ALL SELECT 1 FROM "Common_Workflow_Setup" WHERE egcs_cn_entitytype IN ('fundingcaseaccountreceivable','fundingcaseaccountreceivablecreditmemo')
    UNION ALL SELECT 1 FROM "Common_Review_Set_Setup" WHERE egcs_cn_entitytype IN ('fundingcaseaccountreceivable','fundingcaseaccountreceivablecreditmemo')
    UNION ALL SELECT 1 FROM "Funding_Case_Agreement_Monitor_Followup" WHERE egcs_fc_requiresreceivable
    UNION ALL SELECT 1 FROM "Funding_Case_Agreement_Payment" payment WHERE payment.egcs_fc_applicantrecipient IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM "Funding_Case_Agreement_Applicant_Recipient" relation WHERE relation.egcs_fc_fundingagreement = payment.egcs_fc_fundingagreement AND NOT relation._deleted
      GROUP BY relation.egcs_fc_fundingagreement HAVING count(DISTINCT relation.egcs_fc_applicantrecipient) = 1 AND min(relation.egcs_fc_applicantrecipient) = payment.egcs_fc_applicantrecipient)
    UNION ALL SELECT 1 FROM "Funding_Case_Agreement_Claim" claim WHERE claim.egcs_fc_applicantrecipient IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM "Funding_Case_Agreement_Applicant_Recipient" relation WHERE relation.egcs_fc_fundingagreement = claim.egcs_fc_fundingagreement AND NOT relation._deleted
      GROUP BY relation.egcs_fc_fundingagreement HAVING count(DISTINCT relation.egcs_fc_applicantrecipient) = 1 AND min(relation.egcs_fc_applicantrecipient) = claim.egcs_fc_applicantrecipient)
    LIMIT 1`.execute(db)
  if (authored.rows.length) throw new Error('Cannot roll back retained Accounts Receivable evidence, permissions, or payee attribution')
  await sql`DROP TRIGGER zz_ar_payment_line_control ON "Funding_Case_Agreement_Payment_Line"`.execute(db)
  await sql`DROP TRIGGER trg_validate_claim_submitting_proponent ON "Funding_Case_Agreement_Claim"`.execute(db)
  await sql`DROP FUNCTION trg_fn_validate_claim_submitting_proponent()`.execute(db)
  await sql`DROP TRIGGER zz_ar_payment_control ON "Funding_Case_Agreement_Payment"`.execute(db)
  await sql`DROP TRIGGER trg_ar_completion_control ON "Common_Completion"`.execute(db)
  await sql`DROP TRIGGER trg_ar_payment_terminal_control ON "Common_Runtime"`.execute(db)
  await sql`DROP TRIGGER trg_ar_monitor_followup ON "Funding_Case_Agreement_Monitor_Followup"`.execute(db)
  await sql`DROP TRIGGER trg_protect_ar_roster ON "Common_Entity_Assignment"`.execute(db)
  for (const table of [...tables].reverse()) await sql`DROP TABLE ${sql.table(table)}`.execute(db)
  for (const name of ['trg_fn_ar_payment_line_control','trg_fn_protect_ar_pool','trg_fn_ar_payment_terminal_control','trg_fn_ar_payment_control','trg_fn_ar_completion_control','trg_fn_ar_monitor_followup','trg_fn_protect_ar_roster','trg_fn_validate_ar_root','trg_fn_validate_ar_content','trg_fn_validate_ar_establishment','trg_fn_validate_ar_recovery','trg_fn_validate_ar_recovery_posting']) {
    await sql.raw(`DROP FUNCTION ${name}()`).execute(db)
  }
  await sql`DROP FUNCTION ar_payment_control(bigint,bigint,bigint)`.execute(db)
  await sql`DROP FUNCTION ar_outstanding(bigint)`.execute(db)
  await sql`DROP FUNCTION ar_line_principal(bigint)`.execute(db)
  await sql`DROP FUNCTION ar_successful_submission(bigint,text,bigint)`.execute(db)
  await sql`DROP FUNCTION ar_has_lifecycle_evidence(bigint,text)`.execute(db)
  await sql`ALTER TABLE "Funding_Case_Agreement_Payment" DROP COLUMN egcs_fc_applicantrecipient`.execute(db)
  await sql`ALTER TABLE "Funding_Case_Agreement_Claim" DROP COLUMN egcs_fc_applicantrecipient`.execute(db)
  await sql`ALTER TABLE "Funding_Case_Agreement_Correction_Line" DROP COLUMN egcs_fc_arrecoveries`.execute(db)
  await sql`ALTER TABLE "Funding_Case_Agreement_Monitor_Followup" DROP COLUMN egcs_fc_requiresreceivable`.execute(db)
  await sql`ALTER TABLE role_permission DROP CONSTRAINT role_permission_subject_check`.execute(db)
  await sql`ALTER TABLE role_permission ADD CONSTRAINT role_permission_subject_check CHECK (subject IN ('audit','system','agency','transfer_payment','role','user','group','agreement','applicant_recipient','funding_case','journal_voucher','correction'))`.execute(db)
  await sql`ALTER TABLE role_permission DROP CONSTRAINT role_permission_assignment_subject_check`.execute(db)
  await sql`ALTER TABLE role_permission ADD CONSTRAINT role_permission_assignment_subject_check CHECK (can_manage_assignments = false OR subject IN ('agreement','applicant_recipient','funding_case','journal_voucher','correction'))`.execute(db)
  const prior = { ...AUDIT_TABLE_OWNERSHIP }
  for (const table of tables) delete prior[`public.${table}`]
  await installAuditOwnershipFunctions(db, prior)
  await sql`SELECT audit.reconcile_capture()`.execute(db)
}
