import type { Kysely, SqlBool } from 'kysely'
import { sql } from 'kysely'
import type { Database } from '../../../shared/types/database'

const INDEX_NAMES = {
  profileNameEn: 'ay_idx_profilenameen',
  profileNameFr: 'ay_idx_profilenamefr',
  profileStatusUnique: 'ay_idx_profileagencyfinancialsystemidnameennamefrstatus',
  costCategoryNameEnUnique: 'ay_idx_costcategoryorganizationagencynameen',
  costCategoryNameFrUnique: 'ay_idx_costcategoryorganizationagencynamefr',
  lineItemNameEnUnique: 'ay_idx_costcategorylineitemorganizationcostcategorynameen',
  lineItemNameFrUnique: 'ay_idx_costcategorylineitemorganizationcostcategorynamefr',
  fiscalYearDisplayUnique: 'ay_idx_fiscalyearorganizationagencyfiscalyeardisplay',
  fiscalYearYearUnique: 'ay_idx_fiscalyearorganizationagencyfiscalyear',
  addressTypeNameEnUnique: 'ay_idx_addresstypeorganizationagencytypenameen',
  addressTypeNameFrUnique: 'ay_idx_addresstypeorganizationagencytypenamefr',
  applicantSubtypeNameEnUnique: 'ay_idx_uniqueartypeen',
  applicantSubtypeNameFrUnique: 'ay_idx_uniqueartypefr',
  approvalBehalfNameEnUnique: 'ay_idx_approvalbehalftypeorganizationagencynameen',
  approvalBehalfNameFrUnique: 'ay_idx_approvalbehalftypeorganizationagencynamefr',
  agreementTypeNameEnUnique: 'ay_idx_agreementtypeorganizationagencyagreementtypenameen',
  agreementTypeNameFrUnique: 'ay_idx_agreementtypeorganizationagencyagreementtypenamefr',
  holdbackBasisCodeUnique: 'ay_idx_holdbackbasisorganizationagencycode'
} as const

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable('Agency_Profile')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_ay_agencyfinancialsystemid', 'bigint', col => col.notNull())
    .addColumn('egcs_ay_name_en', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_ay_name_fr', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_ay_abbreviation_en', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_ay_abbreviation_fr', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_ay_active', 'boolean', col => col.notNull().defaultTo(false))
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .execute()

  await db.schema
    .createTable('Common_Status')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_cn_agency', 'bigint', col => col.notNull().references('Agency_Profile.id').onDelete('restrict'))
    .addColumn('egcs_cn_name_en', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_cn_name_fr', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_cn_color', 'varchar(7)', col => col.notNull())
    .addColumn('egcs_cn_icon', 'varchar(100)', col => col.notNull())
    .addColumn('egcs_cn_readonly', 'boolean', col => col.notNull().defaultTo(false))
    .addColumn('egcs_cn_terminal', 'boolean', col => col.notNull().defaultTo(false))
    .addColumn('egcs_cn_isdraft', 'boolean', col => col.notNull().defaultTo(false))
    .addColumn('_deleted', 'boolean', col => col.notNull().defaultTo(false))
    .addCheckConstraint('cn_chk_status_color', sql`egcs_cn_color ~ '^#[0-9A-Fa-f]{6}$'`)
    .addCheckConstraint('cn_chk_status_icon', sql`egcs_cn_icon ~ '^i-lucide-[a-z0-9]+(?:-[a-z0-9]+)*$'`)
    .addCheckConstraint('cn_chk_status_flags', sql`NOT (egcs_cn_readonly AND egcs_cn_terminal)`)
    .addCheckConstraint(
      'cn_chk_status_draft_flags',
      sql`NOT egcs_cn_isdraft OR (NOT egcs_cn_readonly AND NOT egcs_cn_terminal AND NOT _deleted)`
    )
    .addCheckConstraint('cn_chk_status_names', sql`length(btrim(egcs_cn_name_en)) > 0 AND length(btrim(egcs_cn_name_fr)) > 0`)
    .execute()

  await db.schema.alterTable('Agency_Profile')
    .addColumn('egcs_ay_claimreconciliationstartstatus', 'bigint', col => col.references('Common_Status.id').onDelete('restrict'))
    .addColumn('egcs_ay_claimreconciliationfinalstatus', 'bigint', col => col.references('Common_Status.id').onDelete('restrict'))
    .execute()

  await sql`
    CREATE OR REPLACE FUNCTION enforce_agency_claim_reconciliation_statuses() RETURNS trigger AS $$
    BEGIN
      IF NEW.egcs_ay_claimreconciliationstartstatus IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM "Common_Status"
        WHERE id = NEW.egcs_ay_claimreconciliationstartstatus
          AND egcs_cn_agency = NEW.id
          AND egcs_cn_readonly = false
          AND egcs_cn_terminal = false
          AND _deleted = false
      ) THEN
        RAISE EXCEPTION 'Claim reconciliation start status must belong to the Agency'
          USING ERRCODE = '23514', CONSTRAINT = 'ay_chk_claim_reconciliation_start_status_agency';
      END IF;
      IF NEW.egcs_ay_claimreconciliationfinalstatus IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM "Common_Status"
        WHERE id = NEW.egcs_ay_claimreconciliationfinalstatus
          AND egcs_cn_agency = NEW.id
          AND _deleted = false
      ) THEN
        RAISE EXCEPTION 'Claim reconciliation final status must belong to the Agency'
          USING ERRCODE = '23514', CONSTRAINT = 'ay_chk_claim_reconciliation_final_status_agency';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_enforce_agency_claim_reconciliation_statuses
    BEFORE INSERT OR UPDATE OF egcs_ay_claimreconciliationstartstatus, egcs_ay_claimreconciliationfinalstatus
    ON "Agency_Profile"
    FOR EACH ROW EXECUTE FUNCTION enforce_agency_claim_reconciliation_statuses();
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION protect_agency_claim_reconciliation_status_refs() RETURNS trigger AS $$
    BEGIN
      IF (
        NEW._deleted
        OR NEW.egcs_cn_agency IS DISTINCT FROM OLD.egcs_cn_agency
        OR NEW.egcs_cn_readonly
        OR NEW.egcs_cn_terminal
      )
        AND EXISTS (
          SELECT 1 FROM "Agency_Profile"
          WHERE _deleted = false
            AND egcs_ay_claimreconciliationstartstatus = NEW.id
        ) THEN
        RAISE EXCEPTION 'Status is configured as a writable claim reconciliation start status'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_status_claim_reconciliation_in_use';
      END IF;
      IF (NEW._deleted OR NEW.egcs_cn_agency IS DISTINCT FROM OLD.egcs_cn_agency)
        AND EXISTS (
          SELECT 1 FROM "Agency_Profile"
          WHERE _deleted = false
            AND egcs_ay_claimreconciliationfinalstatus = NEW.id
        ) THEN
        RAISE EXCEPTION 'Status is configured as a claim reconciliation final status'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_status_claim_reconciliation_in_use';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_protect_agency_claim_reconciliation_status_refs
    BEFORE UPDATE OF _deleted, egcs_cn_agency, egcs_cn_readonly, egcs_cn_terminal ON "Common_Status"
    FOR EACH ROW EXECUTE FUNCTION protect_agency_claim_reconciliation_status_refs();
  `.execute(db)

  await sql`
    CREATE UNIQUE INDEX cn_idx_status_draft_per_agency
    ON "Common_Status" (egcs_cn_agency)
    WHERE egcs_cn_isdraft = true
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX cn_idx_status_name_en_per_agency
    ON "Common_Status" (egcs_cn_agency, lower(btrim(egcs_cn_name_en)))
    WHERE _deleted = false
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX cn_idx_status_name_fr_per_agency
    ON "Common_Status" (egcs_cn_agency, lower(btrim(egcs_cn_name_fr)))
    WHERE _deleted = false
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION protect_agency_draft_status() RETURNS trigger AS $$
    BEGIN
      IF TG_OP = 'UPDATE' AND NEW.egcs_cn_agency IS DISTINCT FROM OLD.egcs_cn_agency THEN
        RAISE EXCEPTION 'Status Agency is immutable'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_status_agency_immutable';
      END IF;

      IF TG_OP = 'UPDATE' AND OLD.egcs_cn_terminal AND NOT NEW.egcs_cn_terminal THEN
        RAISE EXCEPTION 'Terminal status definitions cannot become nonterminal'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_status_terminal_permanent';
      END IF;

      IF OLD.egcs_cn_isdraft THEN
        IF TG_OP = 'DELETE' THEN
          RAISE EXCEPTION 'The protected Draft status is immutable' USING ERRCODE = '23514';
        END IF;
        IF NEW.egcs_cn_agency IS DISTINCT FROM OLD.egcs_cn_agency
          OR NEW.egcs_cn_name_en IS DISTINCT FROM OLD.egcs_cn_name_en
          OR NEW.egcs_cn_name_fr IS DISTINCT FROM OLD.egcs_cn_name_fr
          OR NEW.egcs_cn_color IS DISTINCT FROM OLD.egcs_cn_color
          OR NEW.egcs_cn_icon IS DISTINCT FROM OLD.egcs_cn_icon
          OR NEW.egcs_cn_readonly IS DISTINCT FROM OLD.egcs_cn_readonly
          OR NEW.egcs_cn_terminal IS DISTINCT FROM OLD.egcs_cn_terminal
          OR NEW.egcs_cn_isdraft IS DISTINCT FROM OLD.egcs_cn_isdraft
          OR NEW._deleted IS DISTINCT FROM OLD._deleted THEN
          RAISE EXCEPTION 'The protected Draft status is immutable' USING ERRCODE = '23514';
        END IF;
      END IF;
      RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_protect_agency_draft_status
    BEFORE UPDATE OR DELETE ON "Common_Status"
    FOR EACH ROW EXECUTE FUNCTION protect_agency_draft_status()
  `.execute(db)

  await sql`
    CREATE OR REPLACE FUNCTION create_default_agency_statuses() RETURNS trigger AS $$
    BEGIN
      INSERT INTO "Common_Status" (
        egcs_cn_agency,
        egcs_cn_name_en,
        egcs_cn_name_fr,
        egcs_cn_color,
        egcs_cn_icon,
        egcs_cn_readonly,
        egcs_cn_isdraft
      ) VALUES
        (NEW.id, 'Draft', 'Brouillon', '#64748b', 'i-lucide-file-pen-line', false, true),
        (NEW.id, 'Active', 'Actif', '#16a34a', 'i-lucide-circle-check', false, false),
        (NEW.id, 'Inactive', 'Inactif', '#71717a', 'i-lucide-circle-pause', true, false);
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_create_default_agency_statuses
    AFTER INSERT ON "Agency_Profile"
    FOR EACH ROW EXECUTE FUNCTION create_default_agency_statuses()
  `.execute(db)

  await db.schema
    .createTable('Agency_Cost_Category')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_ay_organizationagency', 'bigint', col =>
      col.notNull().references('Agency_Profile.id').onDelete('restrict')
    )
    .addColumn('egcs_ay_name_en', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_ay_name_fr', 'varchar(255)', col => col.notNull())
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .execute()

  await db.schema
    .createTable('Agency_Holdback_Basis')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_ay_organizationagency', 'bigint', col =>
      col.notNull().references('Agency_Profile.id').onDelete('restrict')
    )
    .addColumn('egcs_ay_languageindependentcode', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_ay_name_en', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_ay_name_fr', 'varchar(255)', col => col.notNull())
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .execute()

  await db.schema
    .createTable('Agency_Cost_Category_Line_Item')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_ay_name_en', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_ay_name_fr', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_ay_organizationcostcategory', 'bigint', col =>
      col.notNull().references('Agency_Cost_Category.id').onDelete('restrict')
    )
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .execute()

  await db.schema
    .createTable('Agency_Fiscal_Year')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_ay_organizationagency', 'bigint', col =>
      col.notNull().references('Agency_Profile.id').onDelete('restrict')
    )
    .addColumn('egcs_ay_fiscalyeardisplay', 'varchar(9)', col => col.notNull())
    .addColumn('egcs_ay_fiscalyear', 'smallint', col => col.notNull())
    .addColumn('egcs_ay_startdate', 'date', col => col.notNull())
    .addColumn('egcs_ay_enddate', 'date', col => col.notNull())
    .addCheckConstraint('ay_chk_fiscalyear_dates', sql`egcs_ay_enddate >= egcs_ay_startdate`)
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .execute()

  await db.schema
    .createTable('Agency_Address_Type')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_ay_organizationagency', 'bigint', col =>
      col.notNull().references('Agency_Profile.id').onDelete('restrict')
    )
    .addColumn('egcs_ay_typename_en', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_ay_typename_fr', 'varchar(255)', col => col.notNull())
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .execute()

  await db.schema
    .createTable('Agency_Applicant_Recipient_Subtype')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_ay_applicantrecipienttype', sql`Applicant_Recipient_Type`, col => col.notNull())
    .addColumn('egcs_ay_organizationagency', 'bigint', col =>
      col.notNull().references('Agency_Profile.id').onDelete('restrict')
    )
    .addColumn('egcs_ay_description_en', 'text', col => col.notNull())
    .addColumn('egcs_ay_description_fr', 'text', col => col.notNull())
    .addColumn('egcs_ay_name_en', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_ay_name_fr', 'varchar(255)', col => col.notNull())
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .execute()

  await db.schema
    .createTable('Agency_Approval_Behalf_Type')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_ay_organizationagency', 'bigint', col =>
      col.notNull().references('Agency_Profile.id').onDelete('restrict')
    )
    .addColumn('egcs_ay_name_en', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_ay_name_fr', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_ay_require_actual', 'boolean', col => col.notNull())
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .execute()

  await db.schema
    .createTable('Agency_Agreement_Type')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_ay_organizationagency', 'bigint', col =>
      col.notNull().references('Agency_Profile.id').onDelete('restrict')
    )
    .addColumn('egcs_ay_agreementtype', sql`Agreement_Type`, col => col.notNull())
    .addColumn('egcs_ay_name_en', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_ay_name_fr', 'varchar(255)', col => col.notNull())
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .execute()

  await db.schema
    .createIndex(INDEX_NAMES.profileNameEn)
    .on('Agency_Profile')
    .column('egcs_ay_name_en')
    .where(sql<SqlBool>`_deleted = false`)
    .execute()

  await db.schema
    .createIndex(INDEX_NAMES.profileNameFr)
    .on('Agency_Profile')
    .column('egcs_ay_name_fr')
    .where(sql<SqlBool>`_deleted = false`)
    .execute()

  await db.schema
    .createIndex(INDEX_NAMES.profileStatusUnique)
    .on('Agency_Profile')
    .columns(['egcs_ay_agencyfinancialsystemid', 'egcs_ay_name_en', 'egcs_ay_name_fr', 'egcs_ay_active'])
    .where(sql<SqlBool>`_deleted = false`)
    .unique()
    .execute()

  await db.schema
    .createIndex(INDEX_NAMES.costCategoryNameEnUnique)
    .on('Agency_Cost_Category')
    .columns(['egcs_ay_organizationagency', 'egcs_ay_name_en'])
    .where(sql<SqlBool>`_deleted = false`)
    .unique()
    .execute()

  await db.schema
    .createIndex(INDEX_NAMES.costCategoryNameFrUnique)
    .on('Agency_Cost_Category')
    .columns(['egcs_ay_organizationagency', 'egcs_ay_name_fr'])
    .where(sql<SqlBool>`_deleted = false`)
    .unique()
    .execute()

  await db.schema
    .createIndex(INDEX_NAMES.lineItemNameEnUnique)
    .on('Agency_Cost_Category_Line_Item')
    .columns(['egcs_ay_organizationcostcategory', 'egcs_ay_name_en'])
    .where(sql<SqlBool>`_deleted = false`)
    .unique()
    .execute()

  await db.schema
    .createIndex(INDEX_NAMES.lineItemNameFrUnique)
    .on('Agency_Cost_Category_Line_Item')
    .columns(['egcs_ay_organizationcostcategory', 'egcs_ay_name_fr'])
    .where(sql<SqlBool>`_deleted = false`)
    .unique()
    .execute()

  await db.schema
    .createIndex(INDEX_NAMES.fiscalYearDisplayUnique)
    .on('Agency_Fiscal_Year')
    .columns(['egcs_ay_organizationagency', 'egcs_ay_fiscalyeardisplay'])
    .where(sql<SqlBool>`_deleted = false`)
    .unique()
    .execute()

  await db.schema
    .createIndex(INDEX_NAMES.fiscalYearYearUnique)
    .on('Agency_Fiscal_Year')
    .columns(['egcs_ay_organizationagency', 'egcs_ay_fiscalyear'])
    .where(sql<SqlBool>`_deleted = false`)
    .unique()
    .execute()

  await db.schema
    .createIndex(INDEX_NAMES.addressTypeNameEnUnique)
    .on('Agency_Address_Type')
    .columns(['egcs_ay_organizationagency', 'egcs_ay_typename_en'])
    .where(sql<SqlBool>`_deleted = false`)
    .unique()
    .execute()

  await db.schema
    .createIndex(INDEX_NAMES.addressTypeNameFrUnique)
    .on('Agency_Address_Type')
    .columns(['egcs_ay_organizationagency', 'egcs_ay_typename_fr'])
    .where(sql<SqlBool>`_deleted = false`)
    .unique()
    .execute()

  await db.schema
    .createIndex(INDEX_NAMES.applicantSubtypeNameEnUnique)
    .on('Agency_Applicant_Recipient_Subtype')
    .columns(['egcs_ay_organizationagency', 'egcs_ay_applicantrecipienttype', 'egcs_ay_name_en'])
    .where(sql<SqlBool>`_deleted = false`)
    .unique()
    .execute()

  await db.schema
    .createIndex(INDEX_NAMES.applicantSubtypeNameFrUnique)
    .on('Agency_Applicant_Recipient_Subtype')
    .columns(['egcs_ay_organizationagency', 'egcs_ay_applicantrecipienttype', 'egcs_ay_name_fr'])
    .where(sql<SqlBool>`_deleted = false`)
    .unique()
    .execute()

  await db.schema
    .createIndex(INDEX_NAMES.approvalBehalfNameEnUnique)
    .on('Agency_Approval_Behalf_Type')
    .columns(['egcs_ay_organizationagency', 'egcs_ay_name_en'])
    .where(sql<SqlBool>`_deleted = false`)
    .unique()
    .execute()

  await db.schema
    .createIndex(INDEX_NAMES.approvalBehalfNameFrUnique)
    .on('Agency_Approval_Behalf_Type')
    .columns(['egcs_ay_organizationagency', 'egcs_ay_name_fr'])
    .where(sql<SqlBool>`_deleted = false`)
    .unique()
    .execute()

  await db.schema
    .createIndex(INDEX_NAMES.agreementTypeNameEnUnique)
    .on('Agency_Agreement_Type')
    .columns(['egcs_ay_organizationagency', 'egcs_ay_agreementtype', 'egcs_ay_name_en'])
    .where(sql<SqlBool>`_deleted = false`)
    .unique()
    .execute()

  await db.schema
    .createIndex(INDEX_NAMES.agreementTypeNameFrUnique)
    .on('Agency_Agreement_Type')
    .columns(['egcs_ay_organizationagency', 'egcs_ay_agreementtype', 'egcs_ay_name_fr'])
    .where(sql<SqlBool>`_deleted = false`)
    .unique()
    .execute()

  await db.schema
    .createIndex(INDEX_NAMES.holdbackBasisCodeUnique)
    .on('Agency_Holdback_Basis')
    .columns(['egcs_ay_organizationagency', 'egcs_ay_languageindependentcode'])
    .where(sql<SqlBool>`_deleted = false`)
    .unique()
    .execute()

  // Expression indexes align database uniqueness with the trimmed, case-insensitive
  // identifiers presented by the API and browser forms.
  await sql`CREATE UNIQUE INDEX ay_uq_profile_normalized ON "Agency_Profile"
    (egcs_ay_agencyfinancialsystemid, lower(btrim(egcs_ay_name_en)), lower(btrim(egcs_ay_name_fr)), egcs_ay_active)
    WHERE _deleted = false`.execute(db)
  await sql`CREATE UNIQUE INDEX ay_uq_cost_category_name_en_normalized ON "Agency_Cost_Category"
    (egcs_ay_organizationagency, lower(btrim(egcs_ay_name_en))) WHERE _deleted = false`.execute(db)
  await sql`CREATE UNIQUE INDEX ay_uq_cost_category_name_fr_normalized ON "Agency_Cost_Category"
    (egcs_ay_organizationagency, lower(btrim(egcs_ay_name_fr))) WHERE _deleted = false`.execute(db)
  await sql`CREATE UNIQUE INDEX ay_uq_line_item_name_en_normalized ON "Agency_Cost_Category_Line_Item"
    (egcs_ay_organizationcostcategory, lower(btrim(egcs_ay_name_en))) WHERE _deleted = false`.execute(db)
  await sql`CREATE UNIQUE INDEX ay_uq_line_item_name_fr_normalized ON "Agency_Cost_Category_Line_Item"
    (egcs_ay_organizationcostcategory, lower(btrim(egcs_ay_name_fr))) WHERE _deleted = false`.execute(db)
  await sql`CREATE UNIQUE INDEX ay_uq_address_type_name_en_normalized ON "Agency_Address_Type"
    (egcs_ay_organizationagency, lower(btrim(egcs_ay_typename_en))) WHERE _deleted = false`.execute(db)
  await sql`CREATE UNIQUE INDEX ay_uq_address_type_name_fr_normalized ON "Agency_Address_Type"
    (egcs_ay_organizationagency, lower(btrim(egcs_ay_typename_fr))) WHERE _deleted = false`.execute(db)
  await sql`CREATE UNIQUE INDEX ay_uq_recipient_subtype_name_en_normalized ON "Agency_Applicant_Recipient_Subtype"
    (egcs_ay_organizationagency, egcs_ay_applicantrecipienttype, lower(btrim(egcs_ay_name_en))) WHERE _deleted = false`.execute(db)
  await sql`CREATE UNIQUE INDEX ay_uq_recipient_subtype_name_fr_normalized ON "Agency_Applicant_Recipient_Subtype"
    (egcs_ay_organizationagency, egcs_ay_applicantrecipienttype, lower(btrim(egcs_ay_name_fr))) WHERE _deleted = false`.execute(db)
  await sql`CREATE UNIQUE INDEX ay_uq_approval_behalf_name_en_normalized ON "Agency_Approval_Behalf_Type"
    (egcs_ay_organizationagency, lower(btrim(egcs_ay_name_en))) WHERE _deleted = false`.execute(db)
  await sql`CREATE UNIQUE INDEX ay_uq_approval_behalf_name_fr_normalized ON "Agency_Approval_Behalf_Type"
    (egcs_ay_organizationagency, lower(btrim(egcs_ay_name_fr))) WHERE _deleted = false`.execute(db)
  await sql`CREATE UNIQUE INDEX ay_uq_agreement_type_name_en_normalized ON "Agency_Agreement_Type"
    (egcs_ay_organizationagency, egcs_ay_agreementtype, lower(btrim(egcs_ay_name_en))) WHERE _deleted = false`.execute(db)
  await sql`CREATE UNIQUE INDEX ay_uq_agreement_type_name_fr_normalized ON "Agency_Agreement_Type"
    (egcs_ay_organizationagency, egcs_ay_agreementtype, lower(btrim(egcs_ay_name_fr))) WHERE _deleted = false`.execute(db)
  await sql`CREATE UNIQUE INDEX ay_uq_holdback_code_normalized ON "Agency_Holdback_Basis"
    (egcs_ay_organizationagency, lower(btrim(egcs_ay_languageindependentcode))) WHERE _deleted = false`.execute(db)
}

export async function down(db: Kysely<Database>): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS trg_protect_agency_claim_reconciliation_status_refs ON "Common_Status"`.execute(db)
  await sql`DROP FUNCTION IF EXISTS protect_agency_claim_reconciliation_status_refs()`.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_enforce_agency_claim_reconciliation_statuses ON "Agency_Profile"`.execute(db)
  await sql`DROP FUNCTION IF EXISTS enforce_agency_claim_reconciliation_statuses()`.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_create_default_agency_statuses ON "Agency_Profile"`.execute(db)
  await sql`DROP FUNCTION IF EXISTS create_default_agency_statuses()`.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_protect_agency_draft_status ON "Common_Status"`.execute(db)
  await sql`DROP FUNCTION IF EXISTS protect_agency_draft_status()`.execute(db)
  await db.schema.alterTable('Agency_Profile')
    .dropColumn('egcs_ay_claimreconciliationfinalstatus')
    .dropColumn('egcs_ay_claimreconciliationstartstatus')
    .execute()
  await db.schema.dropTable('Common_Status').execute()
  await db.schema.dropIndex(INDEX_NAMES.holdbackBasisCodeUnique).execute()
  await db.schema.dropIndex(INDEX_NAMES.agreementTypeNameFrUnique).execute()
  await db.schema.dropIndex(INDEX_NAMES.agreementTypeNameEnUnique).execute()
  await db.schema.dropIndex(INDEX_NAMES.approvalBehalfNameFrUnique).execute()
  await db.schema.dropIndex(INDEX_NAMES.approvalBehalfNameEnUnique).execute()
  await db.schema.dropIndex(INDEX_NAMES.applicantSubtypeNameFrUnique).execute()
  await db.schema.dropIndex(INDEX_NAMES.applicantSubtypeNameEnUnique).execute()
  await db.schema.dropIndex(INDEX_NAMES.addressTypeNameFrUnique).execute()
  await db.schema.dropIndex(INDEX_NAMES.addressTypeNameEnUnique).execute()
  await db.schema.dropIndex(INDEX_NAMES.fiscalYearYearUnique).execute()
  await db.schema.dropIndex(INDEX_NAMES.fiscalYearDisplayUnique).execute()
  await db.schema.dropIndex(INDEX_NAMES.lineItemNameFrUnique).execute()
  await db.schema.dropIndex(INDEX_NAMES.lineItemNameEnUnique).execute()
  await db.schema.dropIndex(INDEX_NAMES.costCategoryNameFrUnique).execute()
  await db.schema.dropIndex(INDEX_NAMES.costCategoryNameEnUnique).execute()
  await db.schema.dropIndex(INDEX_NAMES.profileStatusUnique).execute()
  await db.schema.dropIndex(INDEX_NAMES.profileNameFr).execute()
  await db.schema.dropIndex(INDEX_NAMES.profileNameEn).execute()

  await db.schema.dropTable('Agency_Agreement_Type').execute()
  await db.schema.dropTable('Agency_Holdback_Basis').execute()
  await db.schema.dropTable('Agency_Approval_Behalf_Type').execute()
  await db.schema.dropTable('Agency_Applicant_Recipient_Subtype').execute()
  await db.schema.dropTable('Agency_Address_Type').execute()
  await db.schema.dropTable('Agency_Fiscal_Year').execute()
  await db.schema.dropTable('Agency_Cost_Category_Line_Item').execute()
  await db.schema.dropTable('Agency_Cost_Category').execute()
  await db.schema.dropTable('Agency_Profile').execute()
}
