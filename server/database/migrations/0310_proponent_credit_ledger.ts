import { sql, type Kysely } from 'kysely'
import type { Database } from '../../../shared/types/database'
import { installAuditOwnershipFunctions } from '../audit-ownership-functions'

const replaceFunction = async (db:Kysely<Database>,name:string,transform:(definition:string)=>string) => {
  const result = await sql<{definition:string}>`SELECT pg_get_functiondef(${`${name}()`}::regprocedure) AS definition`.execute(db)
  const original = result.rows[0]!.definition
  const updated = transform(original)
  if (updated===original) throw new Error(`Expected deployed function boundary unavailable: ${name}`)
  await sql.raw(updated).execute(db)
}

export const up = async (db:Kysely<Database>):Promise<void> => {
  await sql`ALTER TABLE "Common_Entity_Type" DROP CONSTRAINT cn_chk_entitytypeowner`.execute(db)
  await sql`ALTER TABLE "Common_Entity_Type" ADD CONSTRAINT cn_chk_entitytypeowner CHECK (
    (egcs_cn_ownerkind IS NULL OR egcs_cn_ownerkind IN ('agency','agreement','proponent','runtime_source','funding_case'))
    AND (egcs_cn_assignmentmode IS NULL OR egcs_cn_assignmentmode IN ('independent','inherited')))`.execute(db)
  // Only this catalog declaration changes; restore its immutability guard before business writes.
  await sql`ALTER TABLE "Common_Entity_Type" DISABLE TRIGGER trg_lock_entity_type`.execute(db)
  await sql`UPDATE "Common_Entity_Type" SET egcs_cn_ownerkind='agency' WHERE egcs_cn_type='fundingcaseaccountreceivablecreditmemo'`.execute(db)
  await sql`ALTER TABLE "Common_Entity_Type" ENABLE TRIGGER trg_lock_entity_type`.execute(db)
  await sql`ALTER TABLE "Funding_Case_Account_Receivable_Credit_Memo"
    ALTER COLUMN egcs_fc_fundingagreement DROP NOT NULL,
    ALTER COLUMN egcs_fc_agreementnumber DROP NOT NULL,
    ADD COLUMN egcs_fc_ledgerkind varchar(16) NOT NULL DEFAULT 'legacy' CHECK (egcs_fc_ledgerkind IN ('legacy','pool'))`.execute(db)
  await sql`ALTER TABLE "Funding_Case_Account_Receivable_Credit_Memo" ALTER COLUMN egcs_fc_ledgerkind SET DEFAULT 'pool'`.execute(db)
  await sql`ALTER TABLE "Funding_Case_Account_Receivable_Recovery"
    ADD COLUMN egcs_fc_ledgerkind varchar(16) NOT NULL DEFAULT 'legacy' CHECK (egcs_fc_ledgerkind IN ('legacy','pool'))`.execute(db)
  // Existing engine identities/applications remain retained evidence; current plans no longer have an AR owner.
  await sql`ALTER TABLE "Funding_Case_Account_Receivable_Offset_Memo" RENAME COLUMN egcs_fc_receivable TO egcs_fc_legacyreceivable`.execute(db)
  await sql`ALTER TABLE "Funding_Case_Account_Receivable_Offset_Memo" ALTER COLUMN egcs_fc_legacyreceivable DROP NOT NULL`.execute(db)
  await sql`ALTER TABLE "Funding_Case_Account_Receivable_Offset_Memo_Application"
    ALTER COLUMN egcs_fc_allocation DROP NOT NULL,
    ADD COLUMN egcs_fc_recovery bigint REFERENCES "Funding_Case_Account_Receivable_Recovery"(id) ON DELETE RESTRICT,
    ADD COLUMN egcs_fc_amount numeric(19,2) CHECK (egcs_fc_amount>0)`.execute(db)
  // Do not mutate existing application rows: their allocation is immutable historical evidence.
  await sql`CREATE UNIQUE INDEX fc_uq_pool_memo_application ON "Funding_Case_Account_Receivable_Offset_Memo_Application"(egcs_fc_recovery) WHERE egcs_fc_recovery IS NOT NULL`.execute(db)
  await sql`CREATE UNIQUE INDEX fc_uq_pool_offset_memo ON "Funding_Case_Account_Receivable_Offset_Memo"(egcs_fc_pool) WHERE egcs_fc_legacyreceivable IS NULL`.execute(db)
  await sql`ALTER TABLE "Funding_Case_Account_Receivable_Offset_Memo_Application" ADD CONSTRAINT fc_chk_offset_application_basis
    CHECK (num_nonnulls(egcs_fc_allocation,egcs_fc_recovery)=1 AND ((egcs_fc_recovery IS NULL)=(egcs_fc_amount IS NULL)))`.execute(db)
  await sql`CREATE FUNCTION ar_pool_net(pool_id bigint) RETURNS numeric AS $$
    SELECT coalesce((SELECT sum(line.egcs_fc_amount) FROM "Funding_Case_Agreement_Account_Receivable" debt
      JOIN "Funding_Case_Agreement_Account_Receivable_Line" line ON line.egcs_fc_receivable=debt.id
      WHERE debt.egcs_fc_pool=pool_id AND debt.egcs_fc_outcome='posted' AND NOT debt._deleted AND NOT line._deleted),0)
      - coalesce((SELECT sum(memo.egcs_fc_amount) FROM "Funding_Case_Account_Receivable_Credit_Memo" memo
        WHERE memo.egcs_fc_pool=pool_id AND memo.egcs_fc_outcome='posted' AND NOT memo._deleted),0)
      - coalesce((SELECT sum(recovery.egcs_fc_amount) FROM "Funding_Case_Account_Receivable_Recovery" recovery
        WHERE recovery.egcs_fc_pool=pool_id AND recovery.egcs_fc_payment IS NOT NULL AND recovery.egcs_fc_outcome='posted' AND NOT recovery._deleted),0)
  $$ LANGUAGE sql STABLE`.execute(db)
  await sql`CREATE FUNCTION ar_validate_pool_credit_memo(previous jsonb,current_row jsonb,operation text) RETURNS void AS $$
    DECLARE pool record; status record;
    BEGIN
      IF operation='DELETE' THEN RAISE EXCEPTION 'Credit memo evidence uses soft deletion' USING ERRCODE='23514'; END IF;
      SELECT * INTO pool FROM "Funding_Case_Account_Receivable_Pool" WHERE id=(current_row->>'egcs_fc_pool')::bigint FOR UPDATE;
      SELECT * INTO status FROM "Common_Status" WHERE id=(current_row->>'egcs_fc_status')::bigint;
      IF pool.id IS NULL OR pool._deleted OR pool.egcs_fc_agency<>(current_row->>'egcs_fc_agency')::bigint
        OR pool.egcs_fc_applicantrecipient<>(current_row->>'egcs_fc_applicantrecipient')::bigint
        OR pool.egcs_fc_currency::text<>current_row->>'egcs_fc_currency' OR status.egcs_cn_agency<>pool.egcs_fc_agency OR status._deleted
        OR NOT EXISTS (SELECT 1 FROM "Agency_Profile" agency JOIN "Applicant_Recipient_Profile" proponent ON proponent.id=pool.egcs_fc_applicantrecipient
          WHERE agency.id=pool.egcs_fc_agency AND NOT agency._deleted AND NOT proponent._deleted)
        OR current_row->>'egcs_fc_fundingagreement' IS NOT NULL THEN
        RAISE EXCEPTION 'Credit memo requires its independent Agency Proponent currency pool' USING ERRCODE='23514';
      END IF;
      IF operation='INSERT' THEN
        IF NOT status.egcs_cn_isdraft OR status.egcs_cn_terminal OR current_row->>'egcs_fc_outcome'<>'open' OR (current_row->>'_deleted')::boolean THEN
          RAISE EXCEPTION 'Credit memo creation requires active Agency Draft status' USING ERRCODE='23514';
        END IF;
      ELSE
        IF previous->>'egcs_fc_ledgerkind'<>'pool' OR previous->>'egcs_fc_outcome'<>'open' AND previous IS DISTINCT FROM current_row THEN
          RAISE EXCEPTION 'Completed credit memo evidence is immutable' USING ERRCODE='23514';
        END IF;
        IF (previous - ARRAY['egcs_fc_amount','egcs_fc_receiveddate','egcs_fc_receiptreference','egcs_fc_narrative_en','egcs_fc_narrative_fr','_deleted','egcs_fc_status','egcs_fc_statusagency','egcs_fc_outcome','egcs_fc_postedat','egcs_fc_postingruntime','egcs_fc_terminalby','egcs_fc_terminalat','egcs_fc_terminalreason','egcs_fc_statusterminal','egcs_fc_statusdeleted'])
          IS DISTINCT FROM (current_row - ARRAY['egcs_fc_amount','egcs_fc_receiveddate','egcs_fc_receiptreference','egcs_fc_narrative_en','egcs_fc_narrative_fr','_deleted','egcs_fc_status','egcs_fc_statusagency','egcs_fc_outcome','egcs_fc_postedat','egcs_fc_postingruntime','egcs_fc_terminalby','egcs_fc_terminalat','egcs_fc_terminalreason','egcs_fc_statusterminal','egcs_fc_statusdeleted']) THEN
          RAISE EXCEPTION 'Credit memo owner identity is immutable' USING ERRCODE='23514';
        END IF;
        IF ar_has_lifecycle_evidence((current_row->>'id')::bigint,'fundingcaseaccountreceivablecreditmemo') AND
          (previous - ARRAY['egcs_fc_status','egcs_fc_statusagency','egcs_fc_outcome','egcs_fc_postedat','egcs_fc_postingruntime','egcs_fc_terminalby','egcs_fc_terminalat','egcs_fc_terminalreason','egcs_fc_statusterminal','egcs_fc_statusdeleted'])
          IS DISTINCT FROM (current_row - ARRAY['egcs_fc_status','egcs_fc_statusagency','egcs_fc_outcome','egcs_fc_postedat','egcs_fc_postingruntime','egcs_fc_terminalby','egcs_fc_terminalat','egcs_fc_terminalreason','egcs_fc_statusterminal','egcs_fc_statusdeleted']) THEN
          RAISE EXCEPTION 'Submitted credit memo content is immutable' USING ERRCODE='23514';
        END IF;
        IF NOT (previous->>'_deleted')::boolean AND (current_row->>'_deleted')::boolean
          AND (NOT status.egcs_cn_isdraft OR ar_has_lifecycle_evidence((current_row->>'id')::bigint,'fundingcaseaccountreceivablecreditmemo')) THEN
          RAISE EXCEPTION 'Only unsubmitted credit memo Drafts may be deleted' USING ERRCODE='23514';
        END IF;
      END IF;
    END $$ LANGUAGE plpgsql`.execute(db)
  await replaceFunction(db,'trg_fn_validate_ar_root',definition=>definition.replace('BEGIN',`BEGIN
      IF TG_OP='INSERT' AND TG_ARGV[0]='fundingcaseaccountreceivablecreditmemo' AND to_jsonb(NEW)->>'egcs_fc_ledgerkind'<>'pool' THEN
        RAISE EXCEPTION 'Legacy credit matching is retained evidence only' USING ERRCODE='23514';
      END IF;
      IF TG_ARGV[0]='fundingcaseaccountreceivablecreditmemo' AND to_jsonb(NEW)->>'egcs_fc_ledgerkind'='pool' THEN
        PERFORM ar_validate_pool_credit_memo(to_jsonb(OLD),to_jsonb(NEW),TG_OP);
        NEW.egcs_fc_statusagency:=NEW.egcs_fc_agency; RETURN NEW;
      END IF;`))
  await replaceFunction(db,'trg_fn_validate_ar_establishment',definition=>definition.replace("IF root.egcs_fc_outcome = 'posted' THEN",`IF target_type='fundingcaseaccountreceivablecreditmemo' AND to_jsonb(root)->>'egcs_fc_ledgerkind'='pool' THEN
        IF root.egcs_fc_outcome='posted' AND NOT ar_successful_submission(root_id,target_type,root.egcs_fc_postingruntime) THEN
          RAISE EXCEPTION 'Credit memo requires latest successful Completion approval' USING ERRCODE='23514';
        END IF; RETURN NULL;
      END IF;
      IF root.egcs_fc_outcome = 'posted' THEN`))
  await replaceFunction(db, 'trg_fn_validate_ar_establishment', definition => definition
    .replace(/IF root\.egcs_fc_linkedreceivable IS NOT NULL AND ar_line_principal\(source\.egcs_fc_originalline\) <\s+COALESCE\(\(SELECT sum\(allocation\.egcs_fc_amount\)[\s\S]+?\),0\) THEN/, 'IF root.egcs_fc_linkedreceivable IS NOT NULL AND ar_line_principal(source.egcs_fc_originalline) < 0 THEN')
    .replace("RAISE EXCEPTION 'AR adjustment cannot reduce recovered or reserved principal'", "RAISE EXCEPTION 'AR adjustment cannot reduce approved principal below zero'")
    // Historical postings keep their source capacity effect without negative consumption.
    .replace('IF principal > fiscal_capacity OR principal < 0 THEN', 'principal := greatest(principal,0); IF principal > fiscal_capacity THEN')
    .replace('IF consumed > source.egcs_fc_sourceamount OR consumed < 0 THEN', 'consumed := greatest(consumed,0); IF consumed > source.egcs_fc_sourceamount THEN')
    .replace('IF consumed > coding.paid_basis OR consumed < 0 THEN', 'consumed := greatest(consumed,0); IF consumed > coding.paid_basis THEN'))
  await sql`CREATE OR REPLACE FUNCTION ar_payment_control(payment_id bigint, agreement_id bigint, debtor_id bigint) RETURNS text AS $$
    DECLARE owner_agency bigint;
    BEGIN
      SELECT program.egcs_tp_agency INTO owner_agency FROM "Funding_Case_Agreement_Profile" agreement
        JOIN "Transfer_Payment_Stream" stream ON stream.id=agreement.egcs_fc_transferpaymentstream
        JOIN "Transfer_Payment_Profile" program ON program.id=stream.egcs_tp_transferpaymentprofile WHERE agreement.id=agreement_id;
      IF debtor_id IS NULL THEN RETURN 'payee_required'; END IF;
      PERFORM id FROM "Funding_Case_Account_Receivable_Pool" WHERE egcs_fc_agency=owner_agency AND egcs_fc_applicantrecipient=debtor_id ORDER BY id FOR UPDATE;
      IF EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Account_Receivable" debt
        JOIN "Funding_Case_Account_Receivable_Pool" pool ON pool.id=debt.egcs_fc_pool
        WHERE pool.egcs_fc_agency=owner_agency AND pool.egcs_fc_applicantrecipient=debtor_id AND ar_pool_net(pool.id)>0
          AND debt.egcs_fc_linkedreceivable IS NULL AND debt.egcs_fc_outcome='posted' AND NOT debt._deleted
          AND coalesce((SELECT latest.egcs_fc_recoverymethod FROM "Funding_Case_Agreement_Account_Receivable" latest
            WHERE (latest.id=debt.id OR latest.egcs_fc_linkedreceivable=debt.id) AND latest.egcs_fc_outcome='posted' AND NOT latest._deleted
            ORDER BY latest.egcs_fc_postedat DESC,latest.id DESC LIMIT 1),debt.egcs_fc_recoverymethod)='direct_repayment') THEN
        RETURN 'direct_repayment_hold';
      END IF;
      RETURN 'allowed';
    END $$ LANGUAGE plpgsql`.execute(db)
  await replaceFunction(db,'trg_fn_validate_ar_recovery',definition=>definition.replace('BEGIN',`BEGIN
      IF TG_OP='INSERT' AND (TG_TABLE_NAME='Funding_Case_Account_Receivable_Allocation' OR TG_TABLE_NAME='Funding_Case_Account_Receivable_Recovery' AND to_jsonb(NEW)->>'egcs_fc_ledgerkind'<>'pool') THEN
        RAISE EXCEPTION 'New credits are never matched to individual ARs' USING ERRCODE='23514';
      END IF;
      IF TG_TABLE_NAME='Funding_Case_Account_Receivable_Recovery' AND to_jsonb(NEW)->>'egcs_fc_ledgerkind'='pool' THEN
        IF TG_OP='DELETE' OR TG_OP='UPDATE' AND (OLD.egcs_fc_outcome<>'open' AND to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW)
          OR (to_jsonb(OLD)-ARRAY['egcs_fc_outcome','egcs_fc_postedat','egcs_fc_postingruntime','egcs_fc_releasedat']) IS DISTINCT FROM
            (to_jsonb(NEW)-ARRAY['egcs_fc_outcome','egcs_fc_postedat','egcs_fc_postingruntime','egcs_fc_releasedat'])) THEN
          RAISE EXCEPTION 'Pool deduction evidence is immutable' USING ERRCODE='23514';
        END IF;
        SELECT * INTO pool FROM "Funding_Case_Account_Receivable_Pool" WHERE id=NEW.egcs_fc_pool FOR UPDATE;
        IF NEW.egcs_fc_creditmemo IS NOT NULL OR NOT EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Payment" payment
          JOIN "Funding_Case_Agreement_Profile" agreement ON agreement.id=payment.egcs_fc_fundingagreement
          JOIN "Transfer_Payment_Stream" stream ON stream.id=agreement.egcs_fc_transferpaymentstream
          JOIN "Transfer_Payment_Profile" program ON program.id=stream.egcs_tp_transferpaymentprofile
          WHERE payment.id=NEW.egcs_fc_payment AND payment.egcs_fc_applicantrecipient=pool.egcs_fc_applicantrecipient
            AND payment.egcs_fc_currency=pool.egcs_fc_currency AND program.egcs_tp_agency=pool.egcs_fc_agency
            AND payment.egcs_fc_paymentamount>=NEW.egcs_fc_amount AND NOT payment._deleted) THEN
          RAISE EXCEPTION 'Pool deduction requires matching Payment payee Agency currency and gross' USING ERRCODE='23514';
        END IF;
        IF TG_OP='INSERT' AND (NEW.egcs_fc_outcome<>'open' OR NEW.egcs_fc_amount<=0 OR NEW.egcs_fc_amount>greatest(ar_pool_net(pool.id)-coalesce((
          SELECT sum(prior.egcs_fc_amount) FROM "Funding_Case_Account_Receivable_Recovery" prior
          WHERE prior.egcs_fc_pool=pool.id AND prior.egcs_fc_payment IS NOT NULL AND prior.egcs_fc_outcome='open' AND NOT prior._deleted),0),0)) THEN
          RAISE EXCEPTION 'Pool deduction exceeds aggregate receivable balance' USING ERRCODE='23514';
        END IF; RETURN NEW;
      END IF;
      IF TG_TABLE_NAME IN ('Funding_Case_Account_Receivable_Allocation','Funding_Case_Account_Receivable_Posting') AND EXISTS (
        SELECT 1 FROM "Funding_Case_Account_Receivable_Recovery" WHERE id=(to_jsonb(NEW)->>'egcs_fc_recovery')::bigint AND egcs_fc_ledgerkind='pool') THEN
        RAISE EXCEPTION 'Pool credits are never matched to individual AR sources' USING ERRCODE='23514';
      END IF;`))
  await replaceFunction(db,'trg_fn_validate_ar_recovery_posting',definition=>definition.replace("IF NOT recovery._deleted AND recovery.egcs_fc_outcome IN ('open','posted')",`IF recovery.egcs_fc_ledgerkind='pool' THEN
        IF NOT EXISTS (SELECT 1 FROM "Funding_Case_Account_Receivable_Offset_Memo_Application" application
          JOIN "Funding_Case_Account_Receivable_Offset_Memo" memo ON memo.id=application.egcs_fc_offsetmemo
          WHERE application.egcs_fc_recovery=recovery.id AND application.egcs_fc_amount=recovery.egcs_fc_amount
            AND memo.egcs_fc_pool=recovery.egcs_fc_pool AND memo.egcs_fc_legacyreceivable IS NULL) THEN
          RAISE EXCEPTION 'Pool deduction requires exact standalone offset memo application' USING ERRCODE='23514';
        END IF;
        IF recovery.egcs_fc_outcome='posted' AND (NOT ar_successful_submission(recovery.egcs_fc_payment,'fundingcasepayment',recovery.egcs_fc_postingruntime)
          OR ar_pool_net(recovery.egcs_fc_pool)<0) THEN RAISE EXCEPTION 'Pool deduction requires latest approval and available aggregate debt' USING ERRCODE='23514'; END IF;
        RETURN NULL;
      END IF;
      IF recovery.egcs_fc_outcome='posted' AND recovery.egcs_fc_payment IS NOT NULL AND ar_pool_net(recovery.egcs_fc_pool)<0 THEN
        RAISE EXCEPTION 'Retained Payment deduction cannot exceed the current aggregate receivable balance' USING ERRCODE='23514';
      END IF;
      IF NOT recovery._deleted AND recovery.egcs_fc_outcome IN ('open','posted')`))
  await sql`CREATE OR REPLACE FUNCTION trg_fn_validate_ar_offset_memo() RETURNS trigger AS $$
    DECLARE memo record; recovery record;
    BEGIN
      IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Offset credit evidence is immutable' USING ERRCODE='23514'; END IF;
      IF TG_TABLE_NAME='Funding_Case_Account_Receivable_Offset_Memo' THEN
        IF NEW.egcs_fc_legacyreceivable IS NOT NULL OR NEW.egcs_fc_amount<>greatest(ar_pool_net(NEW.egcs_fc_pool),0) THEN
          RAISE EXCEPTION 'Offset credit memo belongs only to its current aggregate pool' USING ERRCODE='23514'; END IF;
      ELSE
        SELECT * INTO memo FROM "Funding_Case_Account_Receivable_Offset_Memo" WHERE id=NEW.egcs_fc_offsetmemo FOR UPDATE;
        SELECT * INTO recovery FROM "Funding_Case_Account_Receivable_Recovery" WHERE id=NEW.egcs_fc_recovery;
        IF NEW.egcs_fc_allocation IS NOT NULL OR memo.egcs_fc_legacyreceivable IS NOT NULL OR recovery.egcs_fc_ledgerkind<>'pool'
          OR recovery.egcs_fc_pool<>memo.egcs_fc_pool OR recovery.egcs_fc_outcome<>'open' OR recovery.egcs_fc_amount<>NEW.egcs_fc_amount THEN
          RAISE EXCEPTION 'Offset application must preserve its standalone pool deduction' USING ERRCODE='23514'; END IF;
      END IF; RETURN NEW;
    END $$ LANGUAGE plpgsql`.execute(db)
  await sql`CREATE OR REPLACE FUNCTION trg_fn_require_ar_offset_memo_application() RETURNS trigger AS $$
    BEGIN RETURN NEW; END $$ LANGUAGE plpgsql`.execute(db)
  // Current pool credits have no AR matching; legacy execution/posting constraints still preserve their pinned evidence.
  await installAuditOwnershipFunctions(db)
  await sql`SELECT audit.reconcile_capture()`.execute(db)
}

export const down = async ():Promise<void> => {
  throw new Error('Proponent aggregate credit ledger preserves historical and standalone evidence; downgrade requires an explicit data-preserving migration.')
}
