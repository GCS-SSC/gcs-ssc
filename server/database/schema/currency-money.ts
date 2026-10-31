import { getCurrencyMinorUnitFactor, supportedCurrencyCodes } from '@gcs-ssc/extensions/money'
import { sql, type Kysely } from 'kysely'

type MoneySubject = 'transfer-payment' | 'applicant-recipient' | 'agreement'

interface MonetaryTable {
  subject: MoneySubject
  table: string
  columns: readonly string[]
  currency: string
}

const directCurrency = (column: string) => `SELECT $1->>'${column}'`
const inheritedCurrency = (table: string, foreignKey: string, column = 'egcs_fc_currency') =>
  `SELECT ${column}::text FROM "${table}" WHERE id = ($1->>'${foreignKey}')::bigint`

/** Complete persisted-money inventory; the same declarations install guards and validate restored seeds. */
export const monetaryTables: readonly MonetaryTable[] = [
  { subject: 'transfer-payment', table: 'Transfer_Payment_Fiscal_Year_Budget', columns: ['egcs_tp_totalbudget'], currency: directCurrency('egcs_tp_currency') },
  { subject: 'transfer-payment', table: 'Transfer_Payment_Stream_Budget', columns: ['egcs_tp_totalbudget'], currency: inheritedCurrency('Transfer_Payment_Fiscal_Year_Budget', 'egcs_tp_transferpaymentbudget', 'egcs_tp_currency') },
  { subject: 'applicant-recipient', table: 'Applicant_Recipient_Funding_History', columns: ['egcs_ar_fundingamount'], currency: directCurrency('egcs_ar_currency') },
  { subject: 'agreement', table: 'Funding_Case_Account_Receivable_Credit_Memo', columns: ['egcs_fc_totalamount', 'egcs_fc_amount'], currency: directCurrency('egcs_fc_currency') },
  { subject: 'agreement', table: 'Funding_Case_Account_Receivable_Credit_Memo_Line', columns: ['egcs_fc_amount'], currency: inheritedCurrency('Funding_Case_Account_Receivable_Credit_Memo', 'egcs_fc_creditmemo') },
  { subject: 'agreement', table: 'Funding_Case_Account_Receivable_Offset_Memo', columns: ['egcs_fc_amount'], currency: inheritedCurrency('Funding_Case_Account_Receivable_Pool', 'egcs_fc_pool') },
  { subject: 'agreement', table: 'Funding_Case_Account_Receivable_Offset_Memo_Line', columns: ['egcs_fc_amount'], currency: 'SELECT pool.egcs_fc_currency::text FROM "Funding_Case_Account_Receivable_Offset_Memo" memo JOIN "Funding_Case_Account_Receivable_Pool" pool ON pool.id = memo.egcs_fc_pool WHERE memo.id = ($1->>\'egcs_fc_offsetmemo\')::bigint' },
  { subject: 'agreement', table: 'Funding_Case_Account_Receivable_Offset_Memo_Application', columns: ['egcs_fc_amount'], currency: 'SELECT pool.egcs_fc_currency::text FROM "Funding_Case_Account_Receivable_Offset_Memo" memo JOIN "Funding_Case_Account_Receivable_Pool" pool ON pool.id = memo.egcs_fc_pool WHERE memo.id = ($1->>\'egcs_fc_offsetmemo\')::bigint' },
  { subject: 'agreement', table: 'Funding_Case_Account_Receivable_Recovery', columns: ['egcs_fc_amount'], currency: inheritedCurrency('Funding_Case_Account_Receivable_Pool', 'egcs_fc_pool') },
  { subject: 'agreement', table: 'Funding_Case_Agreement_Account_Receivable', columns: ['egcs_fc_amount', 'egcs_fc_fiscaloutstanding'], currency: directCurrency('egcs_fc_currency') },
  { subject: 'agreement', table: 'Funding_Case_Agreement_Account_Receivable_Coding', columns: ['egcs_fc_paidbasis', 'egcs_fc_sharedpaidbasis', 'egcs_fc_amount'], currency: inheritedCurrency('Funding_Case_Agreement_Account_Receivable', 'egcs_fc_receivable') },
  { subject: 'agreement', table: 'Funding_Case_Agreement_Account_Receivable_Line', columns: ['egcs_fc_sourceamount', 'egcs_fc_amount'], currency: inheritedCurrency('Funding_Case_Agreement_Account_Receivable', 'egcs_fc_receivable') },
  { subject: 'agreement', table: 'Funding_Case_Account_Receivable_Claim_Reduction', columns: ['egcs_fc_amount'], currency: inheritedCurrency('Funding_Case_Agreement_Account_Receivable', 'egcs_fc_receivable') },
  { subject: 'agreement', table: 'Funding_Case_Agreement_Budget_Line_Item', columns: ['egcs_fc_totalamount', 'egcs_fc_programfunding'], currency: directCurrency('egcs_fc_currency') },
  { subject: 'agreement', table: 'Funding_Case_Agreement_Budget_Line_Item_Funding', columns: ['egcs_fc_amount'], currency: inheritedCurrency('Funding_Case_Agreement_Budget_Line_Item', 'egcs_fc_budgetlineitem') },
  { subject: 'agreement', table: 'Funding_Case_Agreement_Claim_Line_Item', columns: ['egcs_fc_amount', 'egcs_fc_totalamount'], currency: directCurrency('egcs_fc_currency') },
  { subject: 'agreement', table: 'Funding_Case_Agreement_Claim_Line_Item_Funding', columns: ['egcs_fc_amount'], currency: inheritedCurrency('Funding_Case_Agreement_Claim_Line_Item', 'egcs_fc_claimlineitem') },
  { subject: 'agreement', table: 'Funding_Case_Agreement_Claim_Reconcile_Line_Item', columns: ['egcs_fc_reconciled', 'egcs_fc_sampled'], currency: inheritedCurrency('Funding_Case_Agreement_Claim_Line_Item', 'egcs_fc_lineitem') },
  { subject: 'agreement', table: 'Funding_Case_Agreement_Commitment', columns: ['egcs_fc_totalamount'], currency: directCurrency('egcs_fc_currency') },
  { subject: 'agreement', table: 'Funding_Case_Agreement_Commitment_Line', columns: ['egcs_fc_amount'], currency: inheritedCurrency('Funding_Case_Agreement_Commitment', 'egcs_fc_commitment') },
  { subject: 'agreement', table: 'Funding_Case_Agreement_Correction_Adjustment', columns: ['egcs_fc_amount'], currency: inheritedCurrency('Funding_Case_Agreement_Correction', 'egcs_fc_correction') },
  { subject: 'agreement', table: 'Funding_Case_Agreement_Correction_Line', columns: ['egcs_fc_commitmentamount', 'egcs_fc_originalpaid', 'egcs_fc_jveffect', 'egcs_fc_priorcorrections', 'egcs_fc_adjustment', 'egcs_fc_arrecoveries'], currency: inheritedCurrency('Funding_Case_Agreement_Correction', 'egcs_fc_correction') },
  { subject: 'agreement', table: 'Funding_Case_Agreement_Forecast_Line_Item', columns: ['egcs_fc_amount', 'egcs_fc_totalamount'], currency: directCurrency('egcs_fc_currency') },
  { subject: 'agreement', table: 'Funding_Case_Agreement_Forecast_Line_Item_Funding', columns: ['egcs_fc_amount'], currency: inheritedCurrency('Funding_Case_Agreement_Forecast_Line_Item', 'egcs_fc_forecastlineitem') },
  { subject: 'agreement', table: 'Funding_Case_Agreement_Journal_Voucher_Line', columns: ['egcs_fc_amount'], currency: inheritedCurrency('Funding_Case_Agreement_Journal_Voucher', 'egcs_fc_journalvoucher') },
  { subject: 'agreement', table: 'Funding_Case_Agreement_Payment', columns: ['egcs_fc_paymentamount'], currency: directCurrency('egcs_fc_currency') },
  { subject: 'agreement', table: 'Funding_Case_Agreement_Payment_Line', columns: ['egcs_fc_amount'], currency: inheritedCurrency('Funding_Case_Agreement_Payment', 'egcs_fc_fundingagreementpayment') }
]

/**
 * Installs integer minor-unit and supported-denomination checks before business subjects.
 * @param db - Fresh database being migrated.
 */
export const installCurrencyMoneyFunctions = async <DB>(db: Kysely<DB>): Promise<void> => {
  const factors = supportedCurrencyCodes.map(code => `WHEN '${code}' THEN ${getCurrencyMinorUnitFactor(code)}`).join('\n')
  await sql.raw(`DO $money_baseline$ BEGIN
CREATE FUNCTION money_minor_unit_factor(currency text) RETURNS numeric
LANGUAGE sql IMMUTABLE STRICT AS $function$
  SELECT CASE lower(currency) ${factors} ELSE NULL END
$function$;
CREATE FUNCTION money_amount_is_persistable(amount numeric) RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT AS $function$
  SELECT abs(amount) < 100000000000000000000000000000000000000 AND amount = trunc(amount) AND scale(amount) = 0
$function$;
CREATE FUNCTION money_amount_matches_currency(amount numeric, currency text) RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT AS $function$
  SELECT money_amount_is_persistable(amount)
    AND money_minor_unit_factor(currency) IS NOT NULL

$function$;
CREATE FUNCTION validate_currency_money_row(row_value jsonb, currency_query text, columns text[]) RETURNS void
LANGUAGE plpgsql AS $function$
DECLARE denomination text; column_name text; amount numeric;
BEGIN
  EXECUTE currency_query INTO denomination USING row_value;
  IF denomination IS NULL OR money_minor_unit_factor(denomination) IS NULL THEN
    RAISE EXCEPTION 'Money requires its owning currency' USING ERRCODE = '23514', CONSTRAINT = 'money_currency_precision';
  END IF;
  FOREACH column_name IN ARRAY columns LOOP
    IF NOT row_value ? column_name THEN
      RAISE EXCEPTION 'Unknown monetary column %', column_name;
    END IF;
    amount := (row_value->>column_name)::numeric;
    IF amount IS NULL THEN CONTINUE; END IF;
    IF NOT money_amount_is_persistable(amount)
      OR NOT money_amount_matches_currency(amount, denomination) THEN
      RAISE EXCEPTION 'Money must contain supported-currency integer minor units within the amount range: %', column_name
        USING ERRCODE = '23514', CONSTRAINT = 'money_currency_precision', COLUMN = column_name;
    END IF;
  END LOOP;
END $function$;
CREATE FUNCTION trg_fn_validate_currency_money() RETURNS trigger
LANGUAGE plpgsql AS $function$
BEGIN
  PERFORM validate_currency_money_row(to_jsonb(NEW), TG_ARGV[0], TG_ARGV[1]::text[]);
  RETURN NEW;
END $function$;
END $money_baseline$`).execute(db)
}

/**
 * Adds guards after existing BEFORE triggers have resolved immutable currency lineage.
 * @param db - Fresh database being migrated.
 * @param subject - Owning baseline whose tables have just been installed.
 */
export const installMonetaryTableGuards = async <DB>(db: Kysely<DB>, subject: MoneySubject): Promise<void> => {
  for (const [name, definition] of Object.entries({
    tp_chk_program_budget_totalbudget_minor: { subject: 'transfer-payment', table: 'Transfer_Payment_Fiscal_Year_Budget', column: 'egcs_tp_totalbudget' },
    tp_chk_stream_budget_totalbudget_minor: { subject: 'transfer-payment', table: 'Transfer_Payment_Stream_Budget', column: 'egcs_tp_totalbudget' },
    ar_chk_funding_history_fundingamount_minor: { subject: 'applicant-recipient', table: 'Applicant_Recipient_Funding_History', column: 'egcs_ar_fundingamount' },
    fc_chk_credit_memo_totalamount_minor: { subject: 'agreement', table: 'Funding_Case_Account_Receivable_Credit_Memo', column: 'egcs_fc_totalamount' },
    fc_chk_credit_memo_amount_minor: { subject: 'agreement', table: 'Funding_Case_Account_Receivable_Credit_Memo', column: 'egcs_fc_amount' },
    fc_chk_credit_memo_line_amount_minor: { subject: 'agreement', table: 'Funding_Case_Account_Receivable_Credit_Memo_Line', column: 'egcs_fc_amount' },
    fc_chk_offset_memo_amount_minor: { subject: 'agreement', table: 'Funding_Case_Account_Receivable_Offset_Memo', column: 'egcs_fc_amount' },
    fc_chk_offset_memo_line_amount_minor: { subject: 'agreement', table: 'Funding_Case_Account_Receivable_Offset_Memo_Line', column: 'egcs_fc_amount' },
    fc_chk_offset_application_amount_minor: { subject: 'agreement', table: 'Funding_Case_Account_Receivable_Offset_Memo_Application', column: 'egcs_fc_amount' },
    fc_chk_ar_recovery_amount_minor: { subject: 'agreement', table: 'Funding_Case_Account_Receivable_Recovery', column: 'egcs_fc_amount' },
    fc_chk_ar_amount_minor: { subject: 'agreement', table: 'Funding_Case_Agreement_Account_Receivable', column: 'egcs_fc_amount' },
    fc_chk_ar_fiscaloutstanding_minor: { subject: 'agreement', table: 'Funding_Case_Agreement_Account_Receivable', column: 'egcs_fc_fiscaloutstanding' },
    fc_chk_ar_coding_paidbasis_minor: { subject: 'agreement', table: 'Funding_Case_Agreement_Account_Receivable_Coding', column: 'egcs_fc_paidbasis' },
    fc_chk_ar_coding_sharedpaidbasis_minor: { subject: 'agreement', table: 'Funding_Case_Agreement_Account_Receivable_Coding', column: 'egcs_fc_sharedpaidbasis' },
    fc_chk_ar_coding_amount_minor: { subject: 'agreement', table: 'Funding_Case_Agreement_Account_Receivable_Coding', column: 'egcs_fc_amount' },
    fc_chk_ar_line_sourceamount_minor: { subject: 'agreement', table: 'Funding_Case_Agreement_Account_Receivable_Line', column: 'egcs_fc_sourceamount' },
    fc_chk_ar_line_amount_minor: { subject: 'agreement', table: 'Funding_Case_Agreement_Account_Receivable_Line', column: 'egcs_fc_amount' },
    fc_chk_ar_claim_reduction_amount_minor: { subject: 'agreement', table: 'Funding_Case_Account_Receivable_Claim_Reduction', column: 'egcs_fc_amount' },
    fc_chk_budget_line_totalamount_minor: { subject: 'agreement', table: 'Funding_Case_Agreement_Budget_Line_Item', column: 'egcs_fc_totalamount' },
    fc_chk_budget_line_programfunding_minor: { subject: 'agreement', table: 'Funding_Case_Agreement_Budget_Line_Item', column: 'egcs_fc_programfunding' },
    fc_chk_budget_funding_amount_minor: { subject: 'agreement', table: 'Funding_Case_Agreement_Budget_Line_Item_Funding', column: 'egcs_fc_amount' },
    fc_chk_claim_line_amount_minor: { subject: 'agreement', table: 'Funding_Case_Agreement_Claim_Line_Item', column: 'egcs_fc_amount' },
    fc_chk_claim_line_totalamount_minor: { subject: 'agreement', table: 'Funding_Case_Agreement_Claim_Line_Item', column: 'egcs_fc_totalamount' },
    fc_chk_claim_funding_amount_minor: { subject: 'agreement', table: 'Funding_Case_Agreement_Claim_Line_Item_Funding', column: 'egcs_fc_amount' },
    fc_chk_reconcile_line_reconciled_minor: { subject: 'agreement', table: 'Funding_Case_Agreement_Claim_Reconcile_Line_Item', column: 'egcs_fc_reconciled' },
    fc_chk_reconcile_line_sampled_minor: { subject: 'agreement', table: 'Funding_Case_Agreement_Claim_Reconcile_Line_Item', column: 'egcs_fc_sampled' },
    fc_chk_commitment_totalamount_minor: { subject: 'agreement', table: 'Funding_Case_Agreement_Commitment', column: 'egcs_fc_totalamount' },
    fc_chk_commitment_line_amount_minor: { subject: 'agreement', table: 'Funding_Case_Agreement_Commitment_Line', column: 'egcs_fc_amount' },
    fc_chk_correction_adjustment_amount_minor: { subject: 'agreement', table: 'Funding_Case_Agreement_Correction_Adjustment', column: 'egcs_fc_amount' },
    fc_chk_correction_line_commitmentamount_minor: { subject: 'agreement', table: 'Funding_Case_Agreement_Correction_Line', column: 'egcs_fc_commitmentamount' },
    fc_chk_correction_line_originalpaid_minor: { subject: 'agreement', table: 'Funding_Case_Agreement_Correction_Line', column: 'egcs_fc_originalpaid' },
    fc_chk_correction_line_jveffect_minor: { subject: 'agreement', table: 'Funding_Case_Agreement_Correction_Line', column: 'egcs_fc_jveffect' },
    fc_chk_correction_line_priorcorrections_minor: { subject: 'agreement', table: 'Funding_Case_Agreement_Correction_Line', column: 'egcs_fc_priorcorrections' },
    fc_chk_correction_line_adjustment_minor: { subject: 'agreement', table: 'Funding_Case_Agreement_Correction_Line', column: 'egcs_fc_adjustment' },
    fc_chk_correction_line_arrecoveries_minor: { subject: 'agreement', table: 'Funding_Case_Agreement_Correction_Line', column: 'egcs_fc_arrecoveries' },
    fc_chk_forecast_line_amount_minor: { subject: 'agreement', table: 'Funding_Case_Agreement_Forecast_Line_Item', column: 'egcs_fc_amount' },
    fc_chk_forecast_line_totalamount_minor: { subject: 'agreement', table: 'Funding_Case_Agreement_Forecast_Line_Item', column: 'egcs_fc_totalamount' },
    fc_chk_forecast_funding_amount_minor: { subject: 'agreement', table: 'Funding_Case_Agreement_Forecast_Line_Item_Funding', column: 'egcs_fc_amount' },
    fc_chk_jv_line_amount_minor: { subject: 'agreement', table: 'Funding_Case_Agreement_Journal_Voucher_Line', column: 'egcs_fc_amount' },
    fc_chk_payment_paymentamount_minor: { subject: 'agreement', table: 'Funding_Case_Agreement_Payment', column: 'egcs_fc_paymentamount' },
    fc_chk_payment_line_amount_minor: { subject: 'agreement', table: 'Funding_Case_Agreement_Payment_Line', column: 'egcs_fc_amount' }
  })) {
    if (definition.subject === subject) {
      await sql`ALTER TABLE ${sql.id(definition.table)} ADD CONSTRAINT ${sql.id(name)}
        CHECK (money_amount_is_persistable(${sql.id(definition.column)}))`.execute(db)
    }
  }
  for (const definition of monetaryTables.filter(table => table.subject === subject)) {
    await sql`CREATE TRIGGER trg_validate_currency_money AFTER INSERT OR UPDATE ON ${sql.id(definition.table)}
      FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_currency_money(${sql.lit(definition.currency)}, ${sql.lit(`{${definition.columns.join(',')}}`)})`.execute(db)
  }
}

/**
 * Checks every retained row after snapshot restoration, which deliberately disables user triggers.
 * @param db - Database containing the fully restored snapshot.
 */
export const validatePersistedMonetaryRows = async <DB>(db: Kysely<DB>): Promise<void> => {
  for (const definition of monetaryTables) {
    await sql`SELECT validate_currency_money_row(to_jsonb(money_row), ${definition.currency}, ${definition.columns}::text[])
      FROM ${sql.id(definition.table)} AS money_row`.execute(db)
  }
}
