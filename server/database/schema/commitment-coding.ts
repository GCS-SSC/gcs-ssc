import { sql, type Kysely } from 'kysely'
import type { Database } from '../../../shared/types/database'

/**
 * Installs exact paid-floor and Completion allocation guards in the Agreement baseline.
 * @param db Database being initialized.
 */
export const installCommitmentCodingFunctions = async (db: Kysely<Database>): Promise<void> => {
  await sql`DO $baseline$ BEGIN
    CREATE FUNCTION fc_payment_counts_for_coding(payment_id bigint) RETURNS boolean LANGUAGE sql STABLE AS $function$
      SELECT coalesce((SELECT item.egcs_cn_state::text<>'denied'
        FROM "Common_Routing_Slip" slip JOIN "Common_Runtime_Item" item ON item.id=slip.egcs_cn_runtimeitem
        JOIN "Common_Runtime" runtime ON runtime.id=item.egcs_cn_runtime
        WHERE slip.egcs_cn_entitytype='fundingcasepayment' AND slip.egcs_cn_entityid=payment_id
          AND item.egcs_cn_parentruntimeitem IS NULL AND NOT slip._deleted AND NOT item._deleted AND NOT runtime._deleted
        ORDER BY runtime.id DESC,slip.id DESC LIMIT 1),true)
    $function$;

    CREATE FUNCTION fc_positive_coding_completion(target_type text,target_id bigint) RETURNS boolean LANGUAGE sql STABLE AS $function$
      SELECT EXISTS (SELECT 1 FROM "Common_Completion" completion
        WHERE completion.egcs_cn_entitytype::text=target_type AND completion.egcs_cn_entityid=target_id AND NOT completion._deleted
          AND (completion.egcs_cn_disposition='no_workflow' OR completion.egcs_cn_disposition='workflow_started' AND
            (SELECT runtime.egcs_cn_state::text IN ('approved','succeeded') FROM "Common_Workflow_Run" run
              JOIN "Common_Runtime" runtime ON runtime.id=run.id WHERE run.egcs_cn_completion=completion.id AND NOT runtime._deleted
              ORDER BY runtime.egcs_cn_attempt DESC LIMIT 1)))
    $function$;

    CREATE FUNCTION fc_commitment_line_gross_paid(target_line bigint) RETURNS numeric LANGUAGE sql STABLE AS $function$
      SELECT coalesce((SELECT sum(payment_line.egcs_fc_amount) FROM "Funding_Case_Agreement_Payment_Line" payment_line
        JOIN "Funding_Case_Agreement_Payment" payment ON payment.id=payment_line.egcs_fc_fundingagreementpayment
        WHERE payment_line.egcs_fc_fundingagreementcommitmentline=line.id AND payment.egcs_fc_currency=commitment.egcs_fc_currency
          AND NOT payment_line._deleted AND NOT payment._deleted AND fc_payment_counts_for_coding(payment.id)),0)
        +coalesce((SELECT sum(adjustment.egcs_fc_amount) FROM "Funding_Case_Agreement_Journal_Voucher_Line" adjustment
          JOIN "Funding_Case_Agreement_Journal_Voucher" voucher ON voucher.id=adjustment.egcs_fc_journalvoucher
          JOIN "Funding_Case_Agreement_Payment" payment ON payment.id=voucher.egcs_fc_payment
          JOIN "Transfer_Payment_Stream_Chart_of_Account" adjusted_coding ON adjusted_coding.id=adjustment.egcs_fc_chartofaccount
          WHERE adjustment.egcs_fc_commitmentline=line.id AND adjustment.egcs_fc_kind='adjustment'
            AND adjusted_coding.egcs_tp_agencychartofaccount=coding.egcs_tp_agencychartofaccount
            AND voucher.egcs_fc_currency=commitment.egcs_fc_currency AND payment.egcs_fc_currency=commitment.egcs_fc_currency
            AND NOT adjustment._deleted AND NOT voucher._deleted AND NOT payment._deleted
            AND fc_payment_counts_for_coding(payment.id) AND fc_positive_coding_completion('fundingcasejournalvoucher',voucher.id)),0)
        +coalesce((SELECT sum(adjustment.egcs_fc_amount) FROM "Funding_Case_Agreement_Correction_Adjustment" adjustment
          JOIN "Funding_Case_Agreement_Correction" correction ON correction.id=adjustment.egcs_fc_correction
          WHERE adjustment.egcs_fc_commitmentline=line.id AND correction.egcs_fc_outcome='posted'
            AND correction.egcs_fc_currency=commitment.egcs_fc_currency AND NOT correction._deleted AND NOT adjustment._deleted),0)
      FROM "Funding_Case_Agreement_Commitment_Line" line
      JOIN "Funding_Case_Agreement_Commitment" commitment ON commitment.id=line.egcs_fc_commitment
      JOIN "Transfer_Payment_Stream_Chart_of_Account" coding ON coding.id=line.egcs_fc_transferpaymentstreamchartofaccount
      WHERE line.id=target_line
    $function$;

    CREATE FUNCTION fc_commitment_coding_credits(agreement_id bigint,currency text,agency_chart_id bigint) RETURNS numeric LANGUAGE sql STABLE AS $function$
      SELECT coalesce(sum(amount),0) FROM (
        SELECT credit_line.egcs_fc_amount amount FROM "Funding_Case_Account_Receivable_Credit_Memo_Line" credit_line
          JOIN "Funding_Case_Account_Receivable_Credit_Memo" memo ON memo.id=credit_line.egcs_fc_creditmemo
          JOIN "Funding_Case_Agreement_Account_Receivable" debt ON debt.id=credit_line.egcs_fc_receivable
          WHERE debt.egcs_fc_fundingagreement=agreement_id AND memo.egcs_fc_currency::text=currency
            AND credit_line.egcs_fc_commitmentchartofaccount=agency_chart_id
            AND memo.egcs_fc_outcome='posted' AND NOT memo._deleted AND NOT credit_line._deleted
        UNION ALL
        SELECT memo.egcs_fc_amount amount FROM "Funding_Case_Account_Receivable_Offset_Memo" memo
          JOIN "Funding_Case_Agreement_Account_Receivable" debt ON debt.id=memo.egcs_fc_receivable
          JOIN "Funding_Case_Account_Receivable_Pool" pool ON pool.id=memo.egcs_fc_pool
          JOIN "Funding_Case_Account_Receivable_Offset_Memo_Application" application ON application.egcs_fc_offsetmemo=memo.id
          JOIN "Funding_Case_Account_Receivable_Recovery" recovery ON recovery.id=application.egcs_fc_recovery
          WHERE debt.egcs_fc_fundingagreement=agreement_id AND pool.egcs_fc_currency::text=currency
            AND memo.egcs_fc_commitmentchartofaccount=agency_chart_id
            AND recovery.egcs_fc_outcome='posted' AND NOT recovery._deleted AND NOT memo._deleted) received
    $function$;

    CREATE FUNCTION fc_commitment_coding_available(target_line bigint) RETURNS numeric LANGUAGE sql STABLE AS $function$
      WITH target AS (SELECT line.id,line.egcs_fc_fundingagreement,commitment.egcs_fc_currency,
        coding.egcs_tp_agencychartofaccount FROM "Funding_Case_Agreement_Commitment_Line" line
        JOIN "Funding_Case_Agreement_Commitment" commitment ON commitment.id=line.egcs_fc_commitment
        JOIN "Transfer_Payment_Stream_Chart_of_Account" coding ON coding.id=line.egcs_fc_transferpaymentstreamchartofaccount WHERE line.id=target_line),
      pool AS (SELECT line.id,line.egcs_fc_amount FROM "Funding_Case_Agreement_Commitment_Line" line
        JOIN "Funding_Case_Agreement_Commitment" commitment ON commitment.id=line.egcs_fc_commitment
        JOIN "Transfer_Payment_Stream_Chart_of_Account" coding ON coding.id=line.egcs_fc_transferpaymentstreamchartofaccount
        JOIN target ON target.egcs_fc_fundingagreement=line.egcs_fc_fundingagreement
          AND target.egcs_fc_currency=commitment.egcs_fc_currency AND target.egcs_tp_agencychartofaccount=coding.egcs_tp_agencychartofaccount
        WHERE (commitment.egcs_fc_active OR line.id=target_line) AND NOT commitment._deleted AND NOT line._deleted)
      SELECT least((SELECT coalesce(sum(egcs_fc_amount),0) FROM pool),(SELECT coalesce(sum(egcs_fc_amount),0) FROM pool)
        -coalesce((SELECT sum(line.egcs_fc_amount) FROM "Funding_Case_Agreement_Payment_Line" line
          JOIN "Funding_Case_Agreement_Payment" payment ON payment.id=line.egcs_fc_fundingagreementpayment
          WHERE line.egcs_fc_fundingagreementcommitmentline IN (SELECT id FROM pool)
            AND payment.egcs_fc_currency=target.egcs_fc_currency AND NOT line._deleted AND NOT payment._deleted
            AND fc_payment_counts_for_coding(payment.id)),0)
        -coalesce((SELECT sum(adjustment.egcs_fc_amount) FROM "Funding_Case_Agreement_Journal_Voucher_Line" adjustment
          JOIN "Funding_Case_Agreement_Journal_Voucher" voucher ON voucher.id=adjustment.egcs_fc_journalvoucher
          JOIN "Funding_Case_Agreement_Payment" payment ON payment.id=voucher.egcs_fc_payment
          JOIN "Transfer_Payment_Stream_Chart_of_Account" coding ON coding.id=adjustment.egcs_fc_chartofaccount
          WHERE voucher.egcs_fc_fundingagreement=target.egcs_fc_fundingagreement
            AND voucher.egcs_fc_currency=target.egcs_fc_currency AND payment.egcs_fc_currency=target.egcs_fc_currency
            AND coding.egcs_tp_agencychartofaccount=target.egcs_tp_agencychartofaccount AND adjustment.egcs_fc_kind='adjustment'
            AND NOT adjustment._deleted AND NOT voucher._deleted AND NOT payment._deleted
            AND fc_payment_counts_for_coding(payment.id) AND fc_positive_coding_completion('fundingcasejournalvoucher',voucher.id)),0)
        -coalesce((SELECT sum(adjustment.egcs_fc_amount) FROM "Funding_Case_Agreement_Correction_Adjustment" adjustment
          JOIN "Funding_Case_Agreement_Correction" correction ON correction.id=adjustment.egcs_fc_correction
          JOIN "Transfer_Payment_Stream_Chart_of_Account" coding ON coding.id=adjustment.egcs_fc_chartofaccount
          WHERE correction.egcs_fc_fundingagreement=target.egcs_fc_fundingagreement AND correction.egcs_fc_currency=target.egcs_fc_currency
            AND coding.egcs_tp_agencychartofaccount=target.egcs_tp_agencychartofaccount AND correction.egcs_fc_outcome='posted'
            AND NOT correction._deleted AND NOT adjustment._deleted),0)
        +fc_commitment_coding_credits(target.egcs_fc_fundingagreement,target.egcs_fc_currency::text,target.egcs_tp_agencychartofaccount)) FROM target
    $function$;

    CREATE FUNCTION fc_commitment_line_net_paid(target_line bigint) RETURNS numeric LANGUAGE plpgsql STABLE AS $function$
    DECLARE line record; gross numeric; credits numeric; prior_paid numeric;
    BEGIN
      SELECT selected_line.id,selected_line.egcs_fc_fundingagreement,selected_line._deleted,commitment.egcs_fc_active,
        commitment.egcs_fc_currency,coding.egcs_tp_agencychartofaccount INTO line
        FROM "Funding_Case_Agreement_Commitment_Line" selected_line
        JOIN "Funding_Case_Agreement_Commitment" commitment ON commitment.id=selected_line.egcs_fc_commitment
        JOIN "Transfer_Payment_Stream_Chart_of_Account" coding ON coding.id=selected_line.egcs_fc_transferpaymentstreamchartofaccount
        WHERE selected_line.id=target_line;
      gross := coalesce(fc_commitment_line_gross_paid(target_line),0);
      IF NOT line.egcs_fc_active OR line._deleted THEN RETURN greatest(gross,0); END IF;
      credits := fc_commitment_coding_credits(line.egcs_fc_fundingagreement,line.egcs_fc_currency::text,line.egcs_tp_agencychartofaccount);
      SELECT coalesce(sum(greatest(coalesce(fc_commitment_line_gross_paid(prior.id),0),0)),0) INTO prior_paid
        FROM "Funding_Case_Agreement_Commitment_Line" prior
        JOIN "Funding_Case_Agreement_Commitment" commitment ON commitment.id=prior.egcs_fc_commitment
        JOIN "Transfer_Payment_Stream_Chart_of_Account" coding ON coding.id=prior.egcs_fc_transferpaymentstreamchartofaccount
        WHERE prior.id<line.id AND prior.egcs_fc_fundingagreement=line.egcs_fc_fundingagreement
          AND coding.egcs_tp_agencychartofaccount=line.egcs_tp_agencychartofaccount AND commitment.egcs_fc_currency=line.egcs_fc_currency
          AND commitment.egcs_fc_active AND NOT commitment._deleted AND NOT prior._deleted;
      RETURN greatest(gross-greatest(credits-prior_paid,0),0);
    END $function$;

    CREATE FUNCTION trg_fn_protect_commitment_line_paid_floor() RETURNS trigger LANGUAGE plpgsql AS $function$
    DECLARE paid numeric;
    BEGIN
      IF TG_OP='UPDATE' AND (NEW.egcs_fc_amount,NEW._deleted,NEW.egcs_fc_transferpaymentstreamchartofaccount)
        IS NOT DISTINCT FROM (OLD.egcs_fc_amount,OLD._deleted,OLD.egcs_fc_transferpaymentstreamchartofaccount) THEN RETURN NEW; END IF;
      PERFORM 1 FROM "Funding_Case_Agreement_Profile" WHERE id=OLD.egcs_fc_fundingagreement FOR UPDATE;
      paid := greatest(coalesce(fc_commitment_line_net_paid(OLD.id),0),
        OLD.egcs_fc_amount-coalesce(fc_commitment_coding_available(OLD.id),OLD.egcs_fc_amount),0);
      IF paid>0 AND (TG_OP='DELETE' OR NEW._deleted OR NEW.egcs_fc_amount<paid
        OR NEW.egcs_fc_transferpaymentstreamchartofaccount<>OLD.egcs_fc_transferpaymentstreamchartofaccount) THEN
        RAISE EXCEPTION 'Commitment coding cannot fall below already paid amount'
          USING ERRCODE='23514',CONSTRAINT='fc_chk_commitmentlinepaidfloor';
      END IF;
      IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
    END $function$;

    CREATE FUNCTION trg_fn_validate_completed_commitment_coding() RETURNS trigger LANGUAGE plpgsql AS $function$
    DECLARE commitment_id bigint; declared numeric; allocated numeric; line_count bigint;
    BEGIN
      commitment_id := CASE WHEN TG_TABLE_NAME='Common_Completion' THEN (to_jsonb(NEW)->>'egcs_cn_entityid')::bigint
        WHEN TG_TABLE_NAME='Funding_Case_Agreement_Commitment_Line' THEN (to_jsonb(NEW)->>'egcs_fc_commitment')::bigint ELSE NEW.id END;
      IF TG_TABLE_NAME='Common_Completion' AND to_jsonb(NEW)->>'egcs_cn_entitytype'<>'fundingcaseagreementcommitment' THEN RETURN NULL; END IF;
      IF NOT EXISTS (SELECT 1 FROM "Common_Completion" WHERE egcs_cn_entitytype='fundingcaseagreementcommitment'
        AND egcs_cn_entityid=commitment_id AND NOT _deleted) THEN RETURN NULL; END IF;
      SELECT egcs_fc_totalamount INTO declared FROM "Funding_Case_Agreement_Commitment" WHERE id=commitment_id AND NOT _deleted;
      IF declared IS NULL THEN RETURN NULL; END IF;
      SELECT coalesce(sum(egcs_fc_amount),0),count(*) INTO allocated,line_count
        FROM "Funding_Case_Agreement_Commitment_Line" WHERE egcs_fc_commitment=commitment_id AND NOT _deleted;
      IF line_count=0 OR allocated<>declared THEN RAISE EXCEPTION 'Completed Commitment coding must match declared amount'
        USING ERRCODE='23514',CONSTRAINT='fc_chk_commitmentallocationtotal'; END IF;
      RETURN NULL;
    END $function$;
  END $baseline$;`.execute(db)
}
