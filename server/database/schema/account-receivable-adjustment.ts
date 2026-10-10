/** Retained claim reductions are authored with the AR and take effect only at full clearance. */
export const ACCOUNT_RECEIVABLE_CLAIM_REDUCTION_SQL = `
CREATE TABLE "Funding_Case_Account_Receivable_Claim_Reduction" (
  id bigserial PRIMARY KEY,
  egcs_fc_receivable bigint NOT NULL REFERENCES "Funding_Case_Agreement_Account_Receivable"(id),
  egcs_fc_claim bigint NOT NULL REFERENCES "Funding_Case_Agreement_Claim"(id),
  egcs_fc_claimline bigint NOT NULL REFERENCES "Funding_Case_Agreement_Claim_Line_Item"(id),
  egcs_fc_amount numeric(19,2) NOT NULL CHECK (egcs_fc_amount > 0),
  egcs_fc_appliedat timestamptz,
  _deleted boolean NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX fc_uq_ar_claim_reduction_line ON "Funding_Case_Account_Receivable_Claim_Reduction"
  (egcs_fc_receivable,egcs_fc_claimline) WHERE NOT _deleted;
CREATE FUNCTION trg_fn_validate_ar_claim_reduction() RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE debt record; claim_line record; claim_header record; retained_total numeric; reconciled_basis numeric;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Claim reduction evidence uses soft deletion' USING ERRCODE='23514'; END IF;
  SELECT * INTO debt FROM "Funding_Case_Agreement_Account_Receivable" WHERE id=NEW.egcs_fc_receivable FOR UPDATE;
  IF TG_OP='UPDATE' AND OLD.egcs_fc_appliedat IS NOT NULL AND to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW) THEN
    RAISE EXCEPTION 'Applied claim reduction evidence is immutable' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND OLD.egcs_fc_appliedat IS NULL AND NEW.egcs_fc_appliedat IS NOT NULL THEN
    IF (to_jsonb(OLD)-'egcs_fc_appliedat') IS DISTINCT FROM (to_jsonb(NEW)-'egcs_fc_appliedat')
      OR debt.egcs_fc_outcome<>'posted' OR ar_receivable_cash_net(debt.id)<>0 OR NEW._deleted THEN
      RAISE EXCEPTION 'Claim reduction requires complete AR clearance' USING ERRCODE='23514';
    END IF;
  ELSE
    IF debt.egcs_fc_outcome<>'open' OR ar_has_lifecycle_evidence(debt.id,debt.egcs_fc_entitytype) THEN
      RAISE EXCEPTION 'Submitted claim reduction evidence is immutable' USING ERRCODE='23514';
    END IF;
    IF NEW.egcs_fc_appliedat IS NOT NULL THEN RAISE EXCEPTION 'New claim reductions cannot be preapplied' USING ERRCODE='23514'; END IF;
  END IF;
  IF debt.id IS NULL OR debt._deleted OR NOT debt.egcs_fc_claimrelated OR debt.egcs_fc_linkedreceivable IS NOT NULL
    THEN
    RAISE EXCEPTION 'Claim reductions require the AR debtor and Agreement' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND (OLD.egcs_fc_receivable,OLD.egcs_fc_claim,OLD.egcs_fc_claimline)
    IS DISTINCT FROM (NEW.egcs_fc_receivable,NEW.egcs_fc_claim,NEW.egcs_fc_claimline) THEN
    RAISE EXCEPTION 'Claim reduction lineage is immutable' USING ERRCODE='23514';
  END IF;
  -- An unapplied, unsubmitted plan can be cleared even if its source was lost.
  -- Soft deletion cannot also rewrite its lineage, amount or applied marker.
  IF TG_OP='UPDATE' AND NOT OLD._deleted AND NEW._deleted AND OLD.egcs_fc_appliedat IS NULL
    AND (to_jsonb(OLD)-'_deleted') IS NOT DISTINCT FROM (to_jsonb(NEW)-'_deleted') THEN RETURN NEW; END IF;
  SELECT * INTO claim_line FROM "Funding_Case_Agreement_Claim_Line_Item" WHERE id=NEW.egcs_fc_claimline FOR UPDATE;
  SELECT * INTO claim_header FROM "Funding_Case_Agreement_Claim" WHERE id=NEW.egcs_fc_claim;
  IF claim_line.id IS NULL OR claim_line._deleted OR claim_header.id IS NULL OR claim_header._deleted
    OR claim_line.egcs_fc_fundingagreementclaim<>claim_header.id
    OR claim_header.egcs_fc_fundingagreement<>debt.egcs_fc_fundingagreement
    OR claim_header.egcs_fc_applicantrecipient<>debt.egcs_fc_applicantrecipient THEN
    RAISE EXCEPTION 'Claim reductions require the AR debtor and Agreement' USING ERRCODE='23514';
  END IF;
  SELECT sum(source_basis.amount) INTO reconciled_basis FROM (
    SELECT egcs_fc_sourcekey,max(egcs_fc_sourceamount) AS amount FROM "Funding_Case_Agreement_Account_Receivable_Line"
      WHERE egcs_fc_receivable=debt.id AND egcs_fc_claimline=NEW.egcs_fc_claimline AND NOT _deleted
      GROUP BY egcs_fc_sourcekey) source_basis;
  IF reconciled_basis IS NULL OR NEW.egcs_fc_amount>least(claim_line.egcs_fc_amount,reconciled_basis) THEN
    RAISE EXCEPTION 'Claim reductions require retained successful Reconciliation capacity' USING ERRCODE='23514';
  END IF;
  SELECT coalesce(sum(reduction.egcs_fc_amount),0) INTO retained_total FROM "Funding_Case_Account_Receivable_Claim_Reduction" reduction
    JOIN "Funding_Case_Agreement_Account_Receivable" owner ON owner.id=reduction.egcs_fc_receivable
    WHERE reduction.egcs_fc_claimline=NEW.egcs_fc_claimline AND reduction.id<>NEW.id AND NOT reduction._deleted
      AND (reduction.egcs_fc_appliedat IS NOT NULL OR (NOT owner._deleted AND owner.egcs_fc_outcome IN ('open','posted')));
  IF NOT NEW._deleted AND retained_total+NEW.egcs_fc_amount>claim_line.egcs_fc_amount THEN
    RAISE EXCEPTION 'Claim reductions exceed claimed amount' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $function$;
CREATE TRIGGER trg_validate_ar_claim_reduction BEFORE INSERT OR UPDATE OR DELETE
  ON "Funding_Case_Account_Receivable_Claim_Reduction" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_ar_claim_reduction();
`
