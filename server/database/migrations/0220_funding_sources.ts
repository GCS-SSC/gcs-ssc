import { sql, type Kysely } from 'kysely'
import type { Database } from '../../../shared/types/database'
import { AUDIT_TABLE_OWNERSHIP } from '../audit-ownership-registry'
import { installAuditOwnershipFunctions } from '../audit-ownership-functions'

/** Adds Agency-defined other-funding sources and line-level financial breakdowns. */
export const up = async (db: Kysely<Database>): Promise<void> => {
  await sql`CREATE TABLE "Agency_Funding_Type" (
    id bigserial PRIMARY KEY,
    egcs_ay_organizationagency bigint NOT NULL REFERENCES "Agency_Profile"(id) ON DELETE RESTRICT,
    egcs_ay_name_en varchar(255) NOT NULL,
    egcs_ay_name_fr varchar(255) NOT NULL,
    egcs_ay_instacking boolean NOT NULL DEFAULT false,
    egcs_ay_incostsharing boolean NOT NULL DEFAULT false,
    egcs_ay_active boolean NOT NULL DEFAULT true,
    _deleted boolean NOT NULL DEFAULT false,
    CONSTRAINT ay_uq_funding_type_id_agency UNIQUE (id, egcs_ay_organizationagency)
  )`.execute(db)
  await sql`CREATE TABLE "Agency_Funding_Subtype" (
    id bigserial PRIMARY KEY,
    egcs_ay_fundingtype bigint NOT NULL REFERENCES "Agency_Funding_Type"(id) ON DELETE RESTRICT,
    egcs_ay_name_en varchar(255) NOT NULL,
    egcs_ay_name_fr varchar(255) NOT NULL,
    egcs_ay_active boolean NOT NULL DEFAULT true,
    _deleted boolean NOT NULL DEFAULT false,
    CONSTRAINT ay_uq_funding_subtype_id_type UNIQUE (id, egcs_ay_fundingtype)
  )`.execute(db)
  await sql`CREATE UNIQUE INDEX ay_uq_funding_type_name_en_active ON "Agency_Funding_Type" (egcs_ay_organizationagency, lower(egcs_ay_name_en)) WHERE _deleted = false`.execute(db)
  await sql`CREATE UNIQUE INDEX ay_uq_funding_type_name_fr_active ON "Agency_Funding_Type" (egcs_ay_organizationagency, lower(egcs_ay_name_fr)) WHERE _deleted = false`.execute(db)
  await sql`CREATE UNIQUE INDEX ay_uq_funding_subtype_name_en_active ON "Agency_Funding_Subtype" (egcs_ay_fundingtype, lower(egcs_ay_name_en)) WHERE _deleted = false`.execute(db)
  await sql`CREATE UNIQUE INDEX ay_uq_funding_subtype_name_fr_active ON "Agency_Funding_Subtype" (egcs_ay_fundingtype, lower(egcs_ay_name_fr)) WHERE _deleted = false`.execute(db)
  await sql`CREATE TABLE "Transfer_Payment_Stream_Funding_Subtype" (
    id bigserial PRIMARY KEY,
    egcs_tp_transferpaymentstream bigint NOT NULL REFERENCES "Transfer_Payment_Stream"(id) ON DELETE RESTRICT,
    egcs_tp_fundingsubtype bigint NOT NULL REFERENCES "Agency_Funding_Subtype"(id) ON DELETE RESTRICT,
    _deleted boolean NOT NULL DEFAULT false
  )`.execute(db)
  await sql`CREATE UNIQUE INDEX tp_uq_stream_funding_subtype_active ON "Transfer_Payment_Stream_Funding_Subtype" (egcs_tp_transferpaymentstream, egcs_tp_fundingsubtype) WHERE _deleted = false`.execute(db)
  await sql`CREATE FUNCTION trg_fn_validate_stream_funding_subtype_agency() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE stream_agency bigint; subtype_agency bigint;
    BEGIN
      IF NEW._deleted THEN RETURN NEW; END IF;
      SELECT program.egcs_tp_agency INTO stream_agency FROM "Transfer_Payment_Stream" stream
      JOIN "Transfer_Payment_Profile" program ON program.id = stream.egcs_tp_transferpaymentprofile
      WHERE stream.id = NEW.egcs_tp_transferpaymentstream;
      SELECT type.egcs_ay_organizationagency INTO subtype_agency FROM "Agency_Funding_Subtype" subtype
      JOIN "Agency_Funding_Type" type ON type.id = subtype.egcs_ay_fundingtype
      WHERE subtype.id = NEW.egcs_tp_fundingsubtype;
      IF stream_agency IS NULL OR subtype_agency IS NULL OR stream_agency <> subtype_agency THEN
        RAISE EXCEPTION 'Funding subtype must belong to Stream Agency' USING ERRCODE = '23514', CONSTRAINT = 'tp_chk_stream_funding_subtype_agency';
      END IF;
      RETURN NEW;
    END $$`.execute(db)
  await sql`CREATE TRIGGER trg_validate_stream_funding_subtype_agency BEFORE INSERT OR UPDATE OF egcs_tp_transferpaymentstream, egcs_tp_fundingsubtype, _deleted
    ON "Transfer_Payment_Stream_Funding_Subtype" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_stream_funding_subtype_agency()`.execute(db)
  await sql`CREATE FUNCTION trg_fn_protect_profile_funding_subtype_links() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.egcs_tp_agency IS DISTINCT FROM OLD.egcs_tp_agency AND (
        EXISTS (SELECT 1 FROM "Transfer_Payment_Stream" stream
          JOIN "Transfer_Payment_Stream_Funding_Subtype" link ON link.egcs_tp_transferpaymentstream = stream.id
          WHERE stream.egcs_tp_transferpaymentprofile = OLD.id AND link._deleted = false)
        OR EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Profile" agreement
          JOIN "Transfer_Payment_Stream" stream ON stream.id = agreement.egcs_fc_transferpaymentstream
          JOIN "Funding_Case_Agreement_Budget_Line_Item" line ON line.egcs_fc_fundingagreement = agreement.id
          JOIN "Funding_Case_Agreement_Budget_Line_Item_Funding" funding ON funding.egcs_fc_budgetlineitem = line.id
          WHERE stream.egcs_tp_transferpaymentprofile = OLD.id)
        OR EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Profile" agreement
          JOIN "Transfer_Payment_Stream" stream ON stream.id = agreement.egcs_fc_transferpaymentstream
          JOIN "Funding_Case_Agreement_Forecast_Line_Item" line ON line.egcs_fc_fundingagreement = agreement.id
          JOIN "Funding_Case_Agreement_Forecast_Line_Item_Funding" funding ON funding.egcs_fc_forecastlineitem = line.id
          WHERE stream.egcs_tp_transferpaymentprofile = OLD.id)
        OR EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Profile" agreement
          JOIN "Transfer_Payment_Stream" stream ON stream.id = agreement.egcs_fc_transferpaymentstream
          JOIN "Funding_Case_Agreement_Claim_Line_Item" line ON line.egcs_fc_fundingagreement = agreement.id
          JOIN "Funding_Case_Agreement_Claim_Line_Item_Funding" funding ON funding.egcs_fc_claimlineitem = line.id
          WHERE stream.egcs_tp_transferpaymentprofile = OLD.id)
      ) THEN
        RAISE EXCEPTION 'Transfer-payment Agency cannot change while funding sources are linked or retained'
          USING ERRCODE = '23514', CONSTRAINT = 'tp_chk_profile_agency_catalog_links';
      END IF;
      RETURN NEW;
    END $$`.execute(db)
  await sql`CREATE TRIGGER trg_protect_profile_funding_subtype_links BEFORE UPDATE OF egcs_tp_agency
    ON "Transfer_Payment_Profile" FOR EACH ROW EXECUTE FUNCTION trg_fn_protect_profile_funding_subtype_links()`.execute(db)
  await sql`ALTER TABLE "Transfer_Payment_Stream" ADD COLUMN egcs_tp_requireforecastfundingbreakdown boolean NOT NULL DEFAULT false,
    ADD COLUMN egcs_tp_requireclaimfundingbreakdown boolean NOT NULL DEFAULT false`.execute(db)
  await sql`ALTER TABLE "Funding_Case_Agreement_Forecast_Line_Item" ADD COLUMN egcs_fc_totalamount numeric(19,2)`.execute(db)
  await sql`UPDATE "Funding_Case_Agreement_Forecast_Line_Item" SET egcs_fc_totalamount = egcs_fc_amount`.execute(db)
  await sql`ALTER TABLE "Funding_Case_Agreement_Forecast_Line_Item" ALTER COLUMN egcs_fc_totalamount SET NOT NULL`.execute(db)
  await sql`ALTER TABLE "Funding_Case_Agreement_Claim_Line_Item" ADD COLUMN egcs_fc_totalamount numeric(19,2)`.execute(db)
  await sql`UPDATE "Funding_Case_Agreement_Claim_Line_Item" SET egcs_fc_totalamount = egcs_fc_amount`.execute(db)
  await sql`ALTER TABLE "Funding_Case_Agreement_Claim_Line_Item" ALTER COLUMN egcs_fc_totalamount SET NOT NULL`.execute(db)
  await sql`CREATE TABLE "Funding_Case_Agreement_Budget_Line_Item_Funding" (
    id bigserial PRIMARY KEY,
    egcs_fc_budgetlineitem bigint NOT NULL REFERENCES "Funding_Case_Agreement_Budget_Line_Item"(id) ON DELETE RESTRICT,
    egcs_fc_fundingsubtype bigint NOT NULL REFERENCES "Agency_Funding_Subtype"(id) ON DELETE RESTRICT,
    egcs_fc_amount numeric(19,2) NOT NULL CHECK (egcs_fc_amount >= 0),
    egcs_fc_description_en varchar(255),
    egcs_fc_description_fr varchar(255),
    _deleted boolean NOT NULL DEFAULT false
  )`.execute(db)
  await sql`CREATE UNIQUE INDEX fc_uq_budget_line_funding_active ON "Funding_Case_Agreement_Budget_Line_Item_Funding" (egcs_fc_budgetlineitem, egcs_fc_fundingsubtype) WHERE _deleted = false`.execute(db)
  await sql`CREATE TABLE "Funding_Case_Agreement_Forecast_Line_Item_Funding" (
    id bigserial PRIMARY KEY,
    egcs_fc_forecastlineitem bigint NOT NULL REFERENCES "Funding_Case_Agreement_Forecast_Line_Item"(id) ON DELETE RESTRICT,
    egcs_fc_fundingsubtype bigint NOT NULL REFERENCES "Agency_Funding_Subtype"(id) ON DELETE RESTRICT,
    egcs_fc_amount numeric(19,2) NOT NULL CHECK (egcs_fc_amount >= 0),
    _deleted boolean NOT NULL DEFAULT false
  )`.execute(db)
  await sql`CREATE UNIQUE INDEX fc_uq_forecast_line_funding_active ON "Funding_Case_Agreement_Forecast_Line_Item_Funding" (egcs_fc_forecastlineitem, egcs_fc_fundingsubtype) WHERE _deleted = false`.execute(db)
  await sql`CREATE TABLE "Funding_Case_Agreement_Claim_Line_Item_Funding" (
    id bigserial PRIMARY KEY,
    egcs_fc_claimlineitem bigint NOT NULL REFERENCES "Funding_Case_Agreement_Claim_Line_Item"(id) ON DELETE RESTRICT,
    egcs_fc_fundingsubtype bigint NOT NULL REFERENCES "Agency_Funding_Subtype"(id) ON DELETE RESTRICT,
    egcs_fc_amount numeric(19,2) NOT NULL CHECK (egcs_fc_amount >= 0),
    _deleted boolean NOT NULL DEFAULT false
  )`.execute(db)
  await sql`CREATE UNIQUE INDEX fc_uq_claim_line_funding_active ON "Funding_Case_Agreement_Claim_Line_Item_Funding" (egcs_fc_claimlineitem, egcs_fc_fundingsubtype) WHERE _deleted = false`.execute(db)
  await sql`CREATE FUNCTION trg_fn_validate_agreement_line_funding_agency() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE agreement_id bigint; source_agency bigint; agreement_agency bigint; agreement_stream bigint;
      parent_column text; parent_id bigint; old_parent_id bigint;
    BEGIN
      IF TG_TABLE_NAME = 'Funding_Case_Agreement_Budget_Line_Item_Funding' THEN
        parent_column := 'egcs_fc_budgetlineitem';
      ELSIF TG_TABLE_NAME = 'Funding_Case_Agreement_Forecast_Line_Item_Funding' THEN
        parent_column := 'egcs_fc_forecastlineitem';
      ELSE
        parent_column := 'egcs_fc_claimlineitem';
      END IF;
      parent_id := (to_jsonb(NEW)->>parent_column)::bigint;
      IF NEW._deleted THEN RETURN NEW; END IF;
      IF TG_OP = 'UPDATE' THEN
        old_parent_id := (to_jsonb(OLD)->>parent_column)::bigint;
        IF NOT OLD._deleted AND NEW.egcs_fc_fundingsubtype IS NOT DISTINCT FROM OLD.egcs_fc_fundingsubtype
          AND parent_id IS NOT DISTINCT FROM old_parent_id THEN
          RETURN NEW;
        END IF;
      END IF;
      IF TG_TABLE_NAME = 'Funding_Case_Agreement_Budget_Line_Item_Funding' THEN
        SELECT egcs_fc_fundingagreement INTO agreement_id FROM "Funding_Case_Agreement_Budget_Line_Item" WHERE id = parent_id;
      ELSIF TG_TABLE_NAME = 'Funding_Case_Agreement_Forecast_Line_Item_Funding' THEN
        SELECT egcs_fc_fundingagreement INTO agreement_id FROM "Funding_Case_Agreement_Forecast_Line_Item" WHERE id = parent_id;
      ELSE
        SELECT egcs_fc_fundingagreement INTO agreement_id FROM "Funding_Case_Agreement_Claim_Line_Item" WHERE id = parent_id;
      END IF;
      SELECT program.egcs_tp_agency, agreement.egcs_fc_transferpaymentstream INTO agreement_agency, agreement_stream FROM "Funding_Case_Agreement_Profile" agreement
      JOIN "Transfer_Payment_Stream" stream ON stream.id = agreement.egcs_fc_transferpaymentstream
      JOIN "Transfer_Payment_Profile" program ON program.id = stream.egcs_tp_transferpaymentprofile
      WHERE agreement.id = agreement_id;
      SELECT type.egcs_ay_organizationagency INTO source_agency FROM "Agency_Funding_Subtype" subtype
      JOIN "Agency_Funding_Type" type ON type.id = subtype.egcs_ay_fundingtype WHERE subtype.id = NEW.egcs_fc_fundingsubtype;
      IF agreement_agency IS NULL OR source_agency IS NULL OR agreement_agency <> source_agency THEN
        RAISE EXCEPTION 'Funding subtype must belong to Agreement Agency' USING ERRCODE = '23514', CONSTRAINT = 'fc_chk_line_funding_subtype_agency';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM "Transfer_Payment_Stream_Funding_Subtype" link
        WHERE link.egcs_tp_transferpaymentstream = agreement_stream
          AND link.egcs_tp_fundingsubtype = NEW.egcs_fc_fundingsubtype AND link._deleted = false) THEN
        IF TG_TABLE_NAME = 'Funding_Case_Agreement_Budget_Line_Item_Funding' THEN
          IF EXISTS (
          SELECT 1 FROM "Funding_Case_Agreement_Budget_Line_Item" destination
          JOIN "Funding_Case_Agreement_Budget_Fiscal_Year" destination_year
            ON destination_year.id = destination.egcs_fc_fundingagreementbudgetfiscalyear
          JOIN "Funding_Case_Agreement_Budget_Version" destination_version
            ON destination_version.id = destination_year.egcs_fc_budgetversion
          JOIN "Funding_Case_Agreement_Budget_Line_Item" predecessor
            ON predecessor.egcs_fc_fundingagreement = destination.egcs_fc_fundingagreement
            AND COALESCE(predecessor.egcs_fc_originalbudgetlineitem, predecessor.id) = destination.egcs_fc_originalbudgetlineitem
          JOIN "Funding_Case_Agreement_Budget_Fiscal_Year" predecessor_year
            ON predecessor_year.id = predecessor.egcs_fc_fundingagreementbudgetfiscalyear
            AND predecessor_year.egcs_fc_budgetversion = destination_version.egcs_fc_sourceversion
            AND predecessor_year.egcs_fc_fiscalyear = destination_year.egcs_fc_fiscalyear
          JOIN "Funding_Case_Agreement_Budget_Line_Item_Funding" prior
            ON prior.egcs_fc_budgetlineitem = predecessor.id
            AND prior.egcs_fc_fundingsubtype = NEW.egcs_fc_fundingsubtype
          WHERE destination.id = parent_id AND destination.egcs_fc_originalbudgetlineitem IS NOT NULL
            AND destination._deleted = false AND destination_year._deleted = false AND destination_version._deleted = false
            AND predecessor.id <> destination.id AND predecessor._deleted = false AND predecessor_year._deleted = false
            AND prior._deleted = false AND prior.egcs_fc_amount = NEW.egcs_fc_amount
            AND prior.egcs_fc_description_en IS NOT DISTINCT FROM NEW.egcs_fc_description_en
            AND prior.egcs_fc_description_fr IS NOT DISTINCT FROM NEW.egcs_fc_description_fr
          ) THEN RETURN NEW; END IF;
        END IF;
        RAISE EXCEPTION 'Funding subtype must be available to Agreement Stream' USING ERRCODE = '23514', CONSTRAINT = 'fc_chk_line_funding_subtype_stream';
      END IF;
      RETURN NEW;
    END $$`.execute(db)
  for (const table of ['Funding_Case_Agreement_Budget_Line_Item_Funding', 'Funding_Case_Agreement_Forecast_Line_Item_Funding', 'Funding_Case_Agreement_Claim_Line_Item_Funding']) {
    await sql`CREATE TRIGGER trg_validate_agreement_line_funding_agency BEFORE INSERT OR UPDATE ON ${sql.table(table)}
      FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_agreement_line_funding_agency()`.execute(db)
  }

  await installAuditOwnershipFunctions(db)
  await sql`SELECT audit.reconcile_capture()`.execute(db)

  // The former fixed other-funding fields have no supported mapping to Agency-defined subtypes.
  await sql`ALTER TABLE "Funding_Case_Agreement_Budget_Line_Item" DROP CONSTRAINT fc_chk_budgetlineitemtotalamountcoversfunding`.execute(db)
  await sql`ALTER TABLE "Funding_Case_Agreement_Budget_Line_Item"
    DROP COLUMN egcs_fc_otherfederalfunding,
    DROP COLUMN egcs_fc_othergovfunding,
    DROP COLUMN egcs_fc_otherfunding`.execute(db)
}

/** Restores the previous schema only when no new funding configuration or rows would be discarded. */
export const down = async (db: Kysely<Database>): Promise<void> => {
  const authored = await sql`SELECT 1 FROM "Agency_Funding_Type"
    UNION ALL SELECT 1 FROM "Agency_Funding_Subtype"
    UNION ALL SELECT 1 FROM "Transfer_Payment_Stream_Funding_Subtype"
    UNION ALL SELECT 1 FROM "Funding_Case_Agreement_Budget_Line_Item_Funding"
    UNION ALL SELECT 1 FROM "Funding_Case_Agreement_Forecast_Line_Item_Funding"
    UNION ALL SELECT 1 FROM "Funding_Case_Agreement_Claim_Line_Item_Funding" LIMIT 1`.execute(db)
  if (authored.rows.length) throw new Error('Cannot roll back authored funding-source evidence')
  const changedConfiguration = await sql`SELECT 1 FROM "Transfer_Payment_Stream"
    WHERE egcs_tp_requireforecastfundingbreakdown OR egcs_tp_requireclaimfundingbreakdown LIMIT 1`.execute(db)
  if (changedConfiguration.rows.length) throw new Error('Cannot roll back Stream funding requirements')
  const changedTotals = await sql`SELECT 1 FROM "Funding_Case_Agreement_Forecast_Line_Item" WHERE egcs_fc_totalamount <> egcs_fc_amount
    UNION ALL SELECT 1 FROM "Funding_Case_Agreement_Claim_Line_Item" WHERE egcs_fc_totalamount <> egcs_fc_amount LIMIT 1`.execute(db)
  if (changedTotals.rows.length) throw new Error('Cannot roll back authored total-cost evidence')
  await sql`DROP TRIGGER trg_protect_profile_funding_subtype_links ON "Transfer_Payment_Profile"`.execute(db)
  await sql`DROP FUNCTION trg_fn_protect_profile_funding_subtype_links()`.execute(db)
  for (const table of ['Funding_Case_Agreement_Claim_Line_Item_Funding', 'Funding_Case_Agreement_Forecast_Line_Item_Funding', 'Funding_Case_Agreement_Budget_Line_Item_Funding', 'Transfer_Payment_Stream_Funding_Subtype', 'Agency_Funding_Subtype', 'Agency_Funding_Type']) {
    await sql`DROP TABLE ${sql.table(table)}`.execute(db)
  }
  await sql`DROP FUNCTION trg_fn_validate_agreement_line_funding_agency()`.execute(db)
  await sql`DROP FUNCTION trg_fn_validate_stream_funding_subtype_agency()`.execute(db)
  await sql`ALTER TABLE "Transfer_Payment_Stream" DROP COLUMN egcs_tp_requireforecastfundingbreakdown, DROP COLUMN egcs_tp_requireclaimfundingbreakdown`.execute(db)
  await sql`ALTER TABLE "Funding_Case_Agreement_Forecast_Line_Item" DROP COLUMN egcs_fc_totalamount`.execute(db)
  await sql`ALTER TABLE "Funding_Case_Agreement_Claim_Line_Item" DROP COLUMN egcs_fc_totalamount`.execute(db)
  // Removed fixed values are intentionally unrecoverable; rollback restores nullable columns only.
  await sql`ALTER TABLE "Funding_Case_Agreement_Budget_Line_Item"
    ADD COLUMN egcs_fc_otherfederalfunding numeric(19,2),
    ADD COLUMN egcs_fc_othergovfunding numeric(19,2),
    ADD COLUMN egcs_fc_otherfunding numeric(19,2)`.execute(db)
  await sql`ALTER TABLE "Funding_Case_Agreement_Budget_Line_Item" ADD CONSTRAINT fc_chk_budgetlineitemtotalamountcoversfunding CHECK (
    egcs_fc_totalamount >= egcs_fc_programfunding + COALESCE(egcs_fc_otherfederalfunding,0) + COALESCE(egcs_fc_othergovfunding,0) + COALESCE(egcs_fc_otherfunding,0))`.execute(db)
  const previous = { ...AUDIT_TABLE_OWNERSHIP }
  for (const table of ['Agency_Funding_Type', 'Agency_Funding_Subtype', 'Transfer_Payment_Stream_Funding_Subtype', 'Funding_Case_Agreement_Budget_Line_Item_Funding', 'Funding_Case_Agreement_Forecast_Line_Item_Funding', 'Funding_Case_Agreement_Claim_Line_Item_Funding']) delete previous[`public.${table}`]
  await installAuditOwnershipFunctions(db, previous)
  await sql`SELECT audit.reconcile_capture()`.execute(db)
}
