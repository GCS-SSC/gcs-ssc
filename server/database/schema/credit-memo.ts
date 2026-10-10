import { sql, type Kysely } from 'kysely'
import type { Database } from '../../../shared/types/database'

/**
 * Installs the Credit Memo portion of the Agreement subject's clean baseline.
 * @param db Database being initialized.
 */
export const installCreditMemoFunctions = async (db: Kysely<Database>): Promise<void> => {
  await sql`DO $baseline$ BEGIN
    CREATE FUNCTION ar_validate_pool_credit_memo(previous jsonb, current_row jsonb, operation text)
    RETURNS void LANGUAGE plpgsql AS $function$
    DECLARE pool record; status record; debt record; coding record; memo_id bigint; selected_id bigint;
    BEGIN
      IF operation='DELETE' THEN RAISE EXCEPTION 'Credit memo evidence uses soft deletion' USING ERRCODE='23514'; END IF;
      memo_id := (current_row->>'id')::bigint;
      SELECT * INTO pool FROM "Funding_Case_Account_Receivable_Pool" WHERE id=(current_row->>'egcs_fc_pool')::bigint FOR UPDATE;
      SELECT * INTO status FROM "Common_Status" WHERE id=(current_row->>'egcs_fc_status')::bigint;
      IF pool.id IS NULL OR pool._deleted OR pool.egcs_fc_agency<>(current_row->>'egcs_fc_agency')::bigint
        OR pool.egcs_fc_applicantrecipient<>(current_row->>'egcs_fc_applicantrecipient')::bigint
        OR pool.egcs_fc_currency::text<>current_row->>'egcs_fc_currency' OR status.egcs_cn_agency<>pool.egcs_fc_agency OR status._deleted THEN
        RAISE EXCEPTION 'Credit memo requires its Agency Proponent currency pool' USING ERRCODE='23514';
      END IF;
      IF jsonb_array_length(current_row->'egcs_fc_receivables')=0
        OR NOT (current_row->'egcs_fc_receivables' @> jsonb_build_array(current_row->>'egcs_fc_receivable'))
        OR jsonb_array_length(current_row->'egcs_fc_receivables')<>(SELECT count(DISTINCT value) FROM jsonb_array_elements_text(current_row->'egcs_fc_receivables')) THEN
        RAISE EXCEPTION 'Credit memo requires unique tagged receivables including its workflow anchor' USING ERRCODE='23514';
      END IF;
      FOR selected_id IN SELECT value::bigint FROM jsonb_array_elements_text(current_row->'egcs_fc_receivables') LOOP
        SELECT * INTO debt FROM "Funding_Case_Agreement_Account_Receivable" WHERE id=selected_id;
        IF debt.id IS NULL OR debt._deleted OR debt.egcs_fc_outcome<>'posted' OR debt.egcs_fc_linkedreceivable IS NOT NULL OR debt.egcs_fc_pool<>pool.id THEN
          RAISE EXCEPTION 'Tagged receivables must be established originals in the same pool' USING ERRCODE='23514';
        END IF;
      END LOOP;
      IF current_row->>'egcs_fc_outcome' IN ('open','posted') AND NOT (current_row->>'_deleted')::boolean THEN
        FOR coding IN SELECT egcs_fc_receivable, sum(egcs_fc_amount) amount FROM "Funding_Case_Account_Receivable_Credit_Memo_Line"
          WHERE egcs_fc_creditmemo=memo_id AND NOT _deleted GROUP BY egcs_fc_receivable LOOP
          IF coding.amount > ar_receivable_cash_net(coding.egcs_fc_receivable,memo_id)
            -coalesce((SELECT sum(line.egcs_fc_amount) FROM "Funding_Case_Account_Receivable_Credit_Memo_Line" line
              JOIN "Funding_Case_Account_Receivable_Credit_Memo" other ON other.id=line.egcs_fc_creditmemo
              WHERE line.egcs_fc_receivable=coding.egcs_fc_receivable AND other.id<>memo_id AND other.egcs_fc_outcome='open' AND NOT other._deleted AND NOT line._deleted),0)
            -coalesce((SELECT sum(application.egcs_fc_amount) FROM "Funding_Case_Account_Receivable_Offset_Memo" offset_memo
              JOIN "Funding_Case_Account_Receivable_Offset_Memo_Application" application ON application.egcs_fc_offsetmemo=offset_memo.id
              JOIN "Funding_Case_Account_Receivable_Recovery" recovery ON recovery.id=application.egcs_fc_recovery
              WHERE offset_memo.egcs_fc_receivable=coding.egcs_fc_receivable AND recovery.egcs_fc_outcome='open' AND NOT recovery._deleted),0) THEN
            RAISE EXCEPTION 'Credit coding exceeds its receivable available balance' USING ERRCODE='23514';
          END IF;
        END LOOP;
        IF EXISTS (SELECT 1 FROM "Funding_Case_Account_Receivable_Recovery" recovery WHERE recovery.egcs_fc_pool=pool.id AND recovery.egcs_fc_outcome='open' AND NOT recovery._deleted) THEN
          RAISE EXCEPTION 'Pending recovery blocks Credit Memo changes' USING ERRCODE='23514';
        END IF;
        IF (current_row->>'egcs_fc_amount')::numeric > ar_pool_net(pool.id)
          -coalesce((SELECT sum(other.egcs_fc_amount) FROM "Funding_Case_Account_Receivable_Credit_Memo" other
            WHERE other.egcs_fc_pool=pool.id AND other.id<>memo_id AND other.egcs_fc_outcome='open' AND NOT other._deleted),0)
          +coalesce((SELECT egcs_fc_amount FROM "Funding_Case_Account_Receivable_Credit_Memo" WHERE id=memo_id AND egcs_fc_outcome='posted' AND NOT _deleted),0) THEN
          RAISE EXCEPTION 'Credit memo exceeds its pool available balance' USING ERRCODE='23514';
        END IF;
      END IF;
      IF operation='INSERT' THEN
        IF NOT status.egcs_cn_isdraft OR status.egcs_cn_terminal OR current_row->>'egcs_fc_outcome'<>'open' OR (current_row->>'_deleted')::boolean THEN
          RAISE EXCEPTION 'Credit memo creation requires active Draft status' USING ERRCODE='23514';
        END IF;
      ELSE
        IF previous->>'egcs_fc_ledgerkind'<>'pool' OR previous->>'egcs_fc_outcome'<>'open' AND previous IS DISTINCT FROM current_row THEN
          RAISE EXCEPTION 'Completed credit memo evidence is immutable' USING ERRCODE='23514';
        END IF;
        IF (previous - ARRAY['egcs_fc_amount','egcs_fc_totalamount','egcs_fc_receiveddate','egcs_fc_reason','_deleted','egcs_fc_status','egcs_fc_statusagency','egcs_fc_outcome','egcs_fc_postedat','egcs_fc_postingruntime','egcs_fc_terminalby','egcs_fc_terminalat','egcs_fc_terminalreason','egcs_fc_statusterminal','egcs_fc_statusdeleted'])
          IS DISTINCT FROM (current_row - ARRAY['egcs_fc_amount','egcs_fc_totalamount','egcs_fc_receiveddate','egcs_fc_reason','_deleted','egcs_fc_status','egcs_fc_statusagency','egcs_fc_outcome','egcs_fc_postedat','egcs_fc_postingruntime','egcs_fc_terminalby','egcs_fc_terminalat','egcs_fc_terminalreason','egcs_fc_statusterminal','egcs_fc_statusdeleted']) THEN
          RAISE EXCEPTION 'Credit memo owner and tags are immutable' USING ERRCODE='23514';
        END IF;
        IF ar_has_lifecycle_evidence(memo_id,'fundingcaseaccountreceivablecreditmemo') AND
          (previous - ARRAY['egcs_fc_status','egcs_fc_statusagency','egcs_fc_outcome','egcs_fc_postedat','egcs_fc_postingruntime','egcs_fc_terminalby','egcs_fc_terminalat','egcs_fc_terminalreason','egcs_fc_statusterminal','egcs_fc_statusdeleted'])
          IS DISTINCT FROM (current_row - ARRAY['egcs_fc_status','egcs_fc_statusagency','egcs_fc_outcome','egcs_fc_postedat','egcs_fc_postingruntime','egcs_fc_terminalby','egcs_fc_terminalat','egcs_fc_terminalreason','egcs_fc_statusterminal','egcs_fc_statusdeleted']) THEN
          RAISE EXCEPTION 'Submitted credit memo content is immutable' USING ERRCODE='23514';
        END IF;
        IF NOT (previous->>'_deleted')::boolean AND (current_row->>'_deleted')::boolean AND (NOT status.egcs_cn_isdraft OR ar_has_lifecycle_evidence(memo_id,'fundingcaseaccountreceivablecreditmemo')) THEN
          RAISE EXCEPTION 'Only unsubmitted Drafts may be deleted' USING ERRCODE='23514';
        END IF;
      END IF;
    END $function$;

    CREATE FUNCTION trg_fn_validate_ar_creditmemo_line() RETURNS trigger LANGUAGE plpgsql AS $function$
    DECLARE memo record; debt record; status record; account record; stream_id bigint;
    BEGIN
      IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Credit memo lines use soft deletion' USING ERRCODE='23514'; END IF;
      IF TG_OP='UPDATE' AND (OLD.id,OLD.egcs_fc_creditmemo,OLD.egcs_fc_receivable) IS DISTINCT FROM (NEW.id,NEW.egcs_fc_creditmemo,NEW.egcs_fc_receivable) THEN
        RAISE EXCEPTION 'Credit line parent and receivable are immutable' USING ERRCODE='23514';
      END IF;
      PERFORM 1 FROM "Funding_Case_Account_Receivable_Pool" WHERE id=(SELECT egcs_fc_pool FROM "Funding_Case_Account_Receivable_Credit_Memo" WHERE id=NEW.egcs_fc_creditmemo) FOR UPDATE;
      SELECT * INTO memo FROM "Funding_Case_Account_Receivable_Credit_Memo" WHERE id=NEW.egcs_fc_creditmemo FOR UPDATE;
      SELECT * INTO status FROM "Common_Status" WHERE id=memo.egcs_fc_status;
      IF memo.id IS NULL OR memo._deleted OR memo.egcs_fc_ledgerkind<>'pool' OR memo.egcs_fc_outcome<>'open'
        OR status.id IS NULL OR status._deleted OR status.egcs_cn_readonly OR status.egcs_cn_terminal OR ar_has_lifecycle_evidence(memo.id,'fundingcaseaccountreceivablecreditmemo') THEN
        RAISE EXCEPTION 'Credit lines require a workable unsubmitted parent' USING ERRCODE='23514';
      END IF;
      IF TG_OP='INSERT' AND NEW._deleted OR TG_OP='UPDATE' AND OLD._deleted THEN RAISE EXCEPTION 'Deleted credit lines are immutable' USING ERRCODE='23514'; END IF;
      SELECT * INTO debt FROM "Funding_Case_Agreement_Account_Receivable" WHERE id=NEW.egcs_fc_receivable;
      IF NOT memo.egcs_fc_receivables @> jsonb_build_array(NEW.egcs_fc_receivable::text) THEN RAISE EXCEPTION 'Credit line receivable must be tagged on the memo' USING ERRCODE='23514'; END IF;
      SELECT agreement.egcs_fc_transferpaymentstream INTO stream_id FROM "Funding_Case_Agreement_Profile" agreement
        JOIN "Transfer_Payment_Stream" stream ON stream.id=agreement.egcs_fc_transferpaymentstream AND NOT stream._deleted
        JOIN "Transfer_Payment_Profile" program ON program.id=stream.egcs_tp_transferpaymentprofile AND NOT program._deleted
        WHERE agreement.id=debt.egcs_fc_fundingagreement AND NOT agreement._deleted AND program.egcs_tp_agency=memo.egcs_fc_agency AND agreement.egcs_fc_currency=memo.egcs_fc_currency;
      SELECT * INTO account FROM "Agency_Chart_of_Account" WHERE id=NEW.egcs_fc_creditmemochartofaccount;
      IF debt.id IS NULL OR debt._deleted OR debt.egcs_fc_outcome<>'posted' OR debt.egcs_fc_linkedreceivable IS NOT NULL OR debt.egcs_fc_pool<>memo.egcs_fc_pool
        OR stream_id IS NULL OR account.id IS NULL OR account._deleted OR account.egcs_ay_kind<>'credit_memo'
        OR account.egcs_ay_organizationagency<>memo.egcs_fc_agency OR account.egcs_ay_currency<>memo.egcs_fc_currency OR account.egcs_ay_fiscalyear<>debt.egcs_fc_agencyfiscalyear
        OR NOT EXISTS (SELECT 1 FROM "Transfer_Payment_Stream_Chart_of_Account" selection WHERE selection.egcs_tp_transferpaymentstream=stream_id AND selection.egcs_tp_agencychartofaccount=account.id AND NOT selection._deleted) THEN
        RAISE EXCEPTION 'Credit coding must match its receivable Stream fiscal year currency' USING ERRCODE='23514';
      END IF;
      IF TG_OP='UPDATE' AND OLD.egcs_fc_creditmemochartofaccount=NEW.egcs_fc_creditmemochartofaccount THEN
        IF (NEW.egcs_fc_creditmemoaccountingdimensions,NEW.egcs_fc_commitmentchartofaccount) IS DISTINCT FROM (OLD.egcs_fc_creditmemoaccountingdimensions,OLD.egcs_fc_commitmentchartofaccount) THEN
          RAISE EXCEPTION 'Credit lines retain captured coding and commitment linkage' USING ERRCODE='23514';
        END IF;
      ELSIF NEW.egcs_fc_creditmemoaccountingdimensions IS DISTINCT FROM account.egcs_ay_accountingdimensions OR NEW.egcs_fc_commitmentchartofaccount IS DISTINCT FROM account.egcs_ay_commitmentchartofaccount THEN
        RAISE EXCEPTION 'Credit lines must capture their catalog coding and commitment linkage' USING ERRCODE='23514';
      END IF;
      RETURN NEW;
    END $function$;

    CREATE FUNCTION trg_fn_validate_ar_creditmemo_lines_total() RETURNS trigger LANGUAGE plpgsql AS $function$
    DECLARE memo record; memo_id bigint; total numeric; line_count bigint;
    BEGIN
      memo_id := CASE WHEN TG_TABLE_NAME='Funding_Case_Account_Receivable_Credit_Memo_Line' THEN (to_jsonb(NEW)->>'egcs_fc_creditmemo')::bigint ELSE NEW.id END;
      SELECT * INTO memo FROM "Funding_Case_Account_Receivable_Credit_Memo" WHERE id=memo_id;
      SELECT coalesce(sum(egcs_fc_amount),0), count(*) INTO total,line_count FROM "Funding_Case_Account_Receivable_Credit_Memo_Line" WHERE egcs_fc_creditmemo=memo_id AND NOT _deleted;
      IF memo.egcs_fc_amount IS DISTINCT FROM total OR total>memo.egcs_fc_totalamount THEN RAISE EXCEPTION 'Credit amount must equal active coding and stay within declared total' USING ERRCODE='23514'; END IF;
      IF memo.egcs_fc_outcome='posted' AND (line_count=0 OR total<>memo.egcs_fc_totalamount) THEN RAISE EXCEPTION 'Posted credit coding must equal requested amount' USING ERRCODE='23514'; END IF;
      PERFORM ar_validate_pool_credit_memo(to_jsonb(memo),to_jsonb(memo),'UPDATE');
      RETURN NULL;
    END $function$;
    END $baseline$;`.execute(db)
}
