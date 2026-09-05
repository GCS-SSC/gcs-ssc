import type { Kysely, SqlBool } from 'kysely'
import { sql } from 'kysely'
import type { Database } from '../../../shared/types/database'

const TOTAL_BUDGET_TYPE = sql`numeric(19,2)`
const THRESHOLD_TYPE = sql`numeric(5,2)`
const MAX_ALLOWABLE_TYPE = sql`numeric(19,2)`
const PERCENT_TYPE = sql`numeric(5,2)`
const RISK_SCORE_TYPE = sql`numeric(8,2)`

const ROLE_TRANSFER_PAYMENT_SCOPE_UNIQUE_ACTIVE = 'role_transfer_payment_scope_unique_active'
const FINANCIAL_LIMITS_STREAM_STATUS_UNIQUE = 'tp_idx_financiallimitstransferpaymentstreamstatus'
const STREAM_CHART_OF_ACCOUNT_UNIQUE = 'tp_idx_uniquechartofaccount'
const STREAM_HOLDBACK_BASIS_UNIQUE = 'tp_idx_streamholdbackbasisstreamagencybasis'

const INDEX_NAMES = {
  profileNameEn: 'tp_idx_profilenameen',
  profileNameFr: 'tp_idx_profilenamefr',
  profileStatusUnique: 'tp_idx_profileagencynameennamefrstatus',
  streamNameEn: 'tp_idx_streamnameen',
  streamNameFr: 'tp_idx_streamnamefr',
  streamStatusUnique: 'tp_idx_streamtransferpaymentprofilenameennamefrstatus',
  programOutcomeNameEn: 'tp_idx_outcometransferpaymentprofilenameen',
  programOutcomeNameFr: 'tp_idx_outcometransferpaymentprofilenamefr',
  programObjectiveEn: 'tp_idx_objectivetransferpaymentprofileobjectiveen',
  programObjectiveFr: 'tp_idx_objectivetransferpaymentprofileobjectivefr',
  programBudgetFiscalYear: 'tp_idx_fiscalyearbudgettransferpaymentprofilefiscalyear',
  outcomePerformanceIndicatorNameEn: 'tp_idx_outcomeperformanceindicatortransferpaymentoutcomenameen',
  outcomePerformanceIndicatorNameFr: 'tp_idx_outcomeperformanceindicatortransferpaymentoutcomenamefr',
  streamOutcome: 'tp_idx_streamoutcometransferpaymentstreamtransferpaymentoutcome',
  streamBudgetFiscalYear: 'tp_idx_streambudgettransferpaymentstreamtransferpaymentbudget',
  streamEligibleRecipient: 'tp_idx_uniquestreameligiblerecipient',
  streamCostCategoryLineItem: 'tp_idx_uniqueastreamcostcatline',
  streamAmendmentTypeEn: 'tp_idx_amendmenttypetransferpaymentstreamnameen',
  streamAmendmentTypeFr: 'tp_idx_amendmenttypetransferpaymentstreamnamefr',
  streamAmendmentSubtypeEn: 'tp_idx_amendmentsubtypetransferpaymentstreamnameen',
  streamAmendmentSubtypeFr: 'tp_idx_amendmentsubtypetransferpaymentstreamnamefr',
  streamAmendmentSubtypeType: 'tp_idx_amendmentsubtypetype',
  streamAgreementSubtype: 'tp_idx_agreementsubtypetransferpaymentstreamagreementtype',
  streamAgreementSubtypeIdStreamUnique: 'tp_idx_agreementsubtypeidtransferpaymentstream',
  streamCommitmentTypeEn: 'tp_idx_commitmenttypetransferpaymentstreamnameen',
  streamCommitmentTypeFr: 'tp_idx_commitmenttypetransferpaymentstreamnamefr',
  streamMonitorTypeEn: 'tp_idx_monitortypetransferpaymentstreamnameen',
  streamMonitorTypeFr: 'tp_idx_monitortypetransferpaymentstreamnamefr',
  streamRiskRatingScore: 'tp_idx_streamriskratingtransferpaymentstreamriskscore',
  streamRiskRatingEn: 'tp_idx_streamriskratingtransferpaymentstreamnameen',
  streamRiskRatingFr: 'tp_idx_streamriskratingtransferpaymentstreamnamefr',
  streamAreaOfExpertiseEn: 'tp_idx_streamareaofexpertisetransferpaymentstreamnameen',
  streamAreaOfExpertiseFr: 'tp_idx_streamareaofexpertisetransferpaymentstreamnamefr'
} as const

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable('Transfer_Payment_Profile')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_tp_agency', 'bigint', col => col.notNull().references('Agency_Profile.id').onDelete('restrict'))
    .addColumn('egcs_tp_datestart', 'date', col => col.notNull())
    .addColumn('egcs_tp_dateend', 'date', col => col.notNull())
    .addColumn('egcs_tp_name_en', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_tp_name_fr', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_tp_abbreviation_en', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_tp_abbreviation_fr', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_tp_description_en', 'text', col => col.notNull())
    .addColumn('egcs_tp_description_fr', 'text', col => col.notNull())
    .addColumn('egcs_tp_purpose_en', 'text', col => col.notNull())
    .addColumn('egcs_tp_purpose_fr', 'text', col => col.notNull())
    .addColumn('egcs_tp_tclink', 'varchar(2000)', col => col.notNull())
    .addColumn('egcs_tp_active', 'boolean', col => col.notNull().defaultTo(false))
    .addCheckConstraint('tp_chk_profiledatestartdateend', sql`egcs_tp_dateend >= egcs_tp_datestart`)
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .execute()

  await db.schema
    .createTable('Transfer_Payment_Fiscal_Year_Budget')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_tp_transferpaymentprofile', 'bigint', col =>
      col.notNull().references('Transfer_Payment_Profile.id').onDelete('restrict')
    )
    .addColumn('egcs_tp_fiscalyear', 'bigint', col =>
      col.notNull().references('Agency_Fiscal_Year.id').onDelete('restrict')
    )
    .addColumn('egcs_tp_totalbudget', TOTAL_BUDGET_TYPE, col => col.notNull())
    .addColumn('egcs_tp_overcommitthreshold', THRESHOLD_TYPE, col => col.notNull())
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .execute()

  await db.schema
    .createTable('Transfer_Payment_Stream')
    .addColumn('id', 'bigint', col => col.primaryKey())
    .addColumn('egcs_tp_transferpaymentprofile', 'bigint', col =>
      col.notNull().references('Transfer_Payment_Profile.id').onDelete('restrict')
    )
    .addColumn('egcs_tp_parentstream', 'bigint', col =>
      col.references('Transfer_Payment_Stream.id').onDelete('restrict')
    )
    .addColumn('egcs_tp_name_en', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_tp_name_fr', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_tp_description_en', 'text', col => col.notNull())
    .addColumn('egcs_tp_description_fr', 'text', col => col.notNull())
    .addColumn('egcs_tp_abbreviation_en', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_tp_abbreviation_fr', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_tp_objective_en', 'text', col => col.notNull())
    .addColumn('egcs_tp_objective_fr', 'text', col => col.notNull())
    .addColumn('egcs_tp_allowsfurtherdistribution', 'boolean', col => col.defaultTo(false).notNull())
    .addColumn('egcs_tp_active', 'boolean', col => col.notNull().defaultTo(false))
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .execute()

  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_protect_transfer_payment_ownership() RETURNS trigger AS $$
    BEGIN
      IF TG_TABLE_NAME = 'Transfer_Payment_Profile' THEN
        IF NEW.egcs_tp_agency IS DISTINCT FROM OLD.egcs_tp_agency THEN
          RAISE EXCEPTION 'Transfer-payment Agency ownership is immutable'
            USING ERRCODE = '23514', CONSTRAINT = 'tp_chk_profile_agency_immutable';
        END IF;
      ELSIF TG_TABLE_NAME = 'Transfer_Payment_Stream' THEN
        IF NEW.egcs_tp_transferpaymentprofile IS DISTINCT FROM OLD.egcs_tp_transferpaymentprofile THEN
          RAISE EXCEPTION 'Transfer-payment Stream ownership is immutable'
            USING ERRCODE = '23514', CONSTRAINT = 'tp_chk_stream_profile_immutable';
        END IF;
      ELSIF TG_TABLE_NAME = 'Transfer_Payment_Fiscal_Year_Budget' THEN
        IF NEW.egcs_tp_transferpaymentprofile IS DISTINCT FROM OLD.egcs_tp_transferpaymentprofile THEN
          RAISE EXCEPTION 'Transfer-payment fiscal-year Budget ownership is immutable'
            USING ERRCODE = '23514', CONSTRAINT = 'tp_chk_fiscal_year_budget_profile_immutable';
        END IF;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_protect_transfer_payment_profile_ownership
    BEFORE UPDATE ON "Transfer_Payment_Profile"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_protect_transfer_payment_ownership()
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_protect_transfer_payment_stream_ownership
    BEFORE UPDATE ON "Transfer_Payment_Stream"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_protect_transfer_payment_ownership()
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_protect_transfer_payment_fiscal_year_budget_ownership
    BEFORE UPDATE ON "Transfer_Payment_Fiscal_Year_Budget"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_protect_transfer_payment_ownership()
  `.execute(db)

  await db.schema
    .createTable('Transfer_Payment_Objective')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_tp_transferpaymentprofile', 'bigint', col =>
      col.notNull().references('Transfer_Payment_Profile.id').onDelete('restrict')
    )
    .addColumn('egcs_tp_objective_en', 'text', col => col.notNull())
    .addColumn('egcs_tp_objective_fr', 'text', col => col.notNull())
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .execute()

  await db.schema
    .createTable('Transfer_Payment_Stream_Holdback_Basis')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_tp_transferpaymentstream', 'bigint', col =>
      col.notNull().references('Transfer_Payment_Stream.id').onDelete('restrict')
    )
    .addColumn('egcs_tp_agencyholdback', 'bigint', col =>
      col.notNull().references('Agency_Holdback_Basis.id').onDelete('restrict')
    )
    .addColumn('egcs_tp_name_en', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_tp_name_fr', 'varchar(255)', col => col.notNull())
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .execute()

  await db.schema
    .createIndex(STREAM_HOLDBACK_BASIS_UNIQUE)
    .on('Transfer_Payment_Stream_Holdback_Basis')
    .columns(['egcs_tp_transferpaymentstream', 'egcs_tp_agencyholdback'])
    .where(sql<SqlBool>`_deleted = false`)
    .unique()
    .execute()

  await db.schema
    .createTable('Transfer_Payment_Stream_Budget')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_tp_transferpaymentstream', 'bigint', col =>
      col.notNull().references('Transfer_Payment_Stream.id').onDelete('restrict')
    )
    .addColumn('egcs_tp_totalbudget', TOTAL_BUDGET_TYPE, col => col.notNull())
    .addColumn('egcs_tp_transferpaymentbudget', 'bigint', col =>
      col.notNull().references('Transfer_Payment_Fiscal_Year_Budget.id').onDelete('restrict')
    )
    .addColumn('egcs_tp_overcommitthreshold', THRESHOLD_TYPE, col => col.notNull())
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .addUniqueConstraint(
      'tp_uq_streambudgetidstream',
      ['id', 'egcs_tp_transferpaymentstream']
    )
    .execute()

  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_enforce_stream_budget_profile_ownership() RETURNS trigger AS $$
    DECLARE
      stream_profile_id bigint;
      budget_profile_id bigint;
    BEGIN
      SELECT stream.egcs_tp_transferpaymentprofile
      INTO stream_profile_id
      FROM "Transfer_Payment_Stream" stream
      WHERE stream.id = NEW.egcs_tp_transferpaymentstream;

      SELECT budget.egcs_tp_transferpaymentprofile
      INTO budget_profile_id
      FROM "Transfer_Payment_Fiscal_Year_Budget" budget
      WHERE budget.id = NEW.egcs_tp_transferpaymentbudget;

      IF stream_profile_id IS NOT NULL
        AND budget_profile_id IS NOT NULL
        AND stream_profile_id IS DISTINCT FROM budget_profile_id THEN
        RAISE EXCEPTION 'Transfer-payment Stream Budget parents must belong to the same Transfer Payment Profile'
          USING ERRCODE = '23514', CONSTRAINT = 'tp_chk_stream_budget_profile_ownership';
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_enforce_stream_budget_profile_ownership
    BEFORE INSERT OR UPDATE
    ON "Transfer_Payment_Stream_Budget"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_stream_budget_profile_ownership()
  `.execute(db)

  await db.schema
    .createTable('Transfer_Payment_Stream_Eligible_Recipient')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_tp_transferpaymentstream', 'bigint', col =>
      col.notNull().references('Transfer_Payment_Stream.id').onDelete('restrict')
    )
    .addColumn('egcs_tp_applicantrecipientsubtype', 'bigint', col =>
      col.notNull().references('Agency_Applicant_Recipient_Subtype.id').onDelete('restrict')
    )
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .execute()

  await db.schema
    .createTable('Transfer_Payment_Stream_Cost_Category_Line_Item')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_tp_transferpaymentstream', 'bigint', col =>
      col.notNull().references('Transfer_Payment_Stream.id').onDelete('restrict')
    )
    .addColumn('egcs_tp_organizationcostcategory', 'bigint', col =>
      col.notNull().references('Agency_Cost_Category_Line_Item.id').onDelete('restrict')
    )
    .addColumn('egcs_tp_costsharingratio', THRESHOLD_TYPE, col => col.notNull())
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .execute()

  await db.schema
    .createTable('Transfer_Payment_Outcome')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_tp_transferpaymentprofile', 'bigint', col =>
      col.notNull().references('Transfer_Payment_Profile.id').onDelete('restrict')
    )
    .addColumn('egcs_tp_name_en', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_tp_name_fr', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_tp_description_en', 'text', col => col.notNull())
    .addColumn('egcs_tp_description_fr', 'text', col => col.notNull())
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .execute()

  await db.schema
    .createTable('Transfer_Payment_Outcome_Performance_Indicator')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_tp_transferpaymentoutcome', 'bigint', col =>
      col.notNull().references('Transfer_Payment_Outcome.id').onDelete('restrict')
    )
    .addColumn('egcs_tp_name_en', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_tp_name_fr', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_tp_description_en', 'text', col => col.notNull())
    .addColumn('egcs_tp_description_fr', 'text', col => col.notNull())
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .execute()

  await db.schema
    .createTable('Transfer_Payment_Stream_Outcome')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_tp_transferpaymentstream', 'bigint', col =>
      col.notNull().references('Transfer_Payment_Stream.id').onDelete('restrict')
    )
    .addColumn('egcs_tp_transferpaymentoutcome', 'bigint', col =>
      col.notNull().references('Transfer_Payment_Outcome.id').onDelete('restrict')
    )
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .execute()

  await db.schema
    .createTable('role_transfer_payment_scope')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('role_id', 'bigint', col => col.notNull().references('role.id').onDelete('cascade'))
    .addColumn('transfer_payment_profile_id', 'bigint', col =>
      col.notNull().references('Transfer_Payment_Profile.id').onDelete('restrict')
    )
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .execute()

  await sql`
    CREATE UNIQUE INDEX ${sql.raw(ROLE_TRANSFER_PAYMENT_SCOPE_UNIQUE_ACTIVE)}
    ON role_transfer_payment_scope (role_id, transfer_payment_profile_id)
    WHERE _deleted = false
  `.execute(db)
  await sql`
    CREATE FUNCTION enforce_role_permission_scope() RETURNS trigger AS $$
    DECLARE target_role_id bigint; role_agency_id bigint; has_program_scope boolean; scope_type text; invalid_count integer;
    BEGIN
      IF TG_TABLE_NAME = 'role' THEN
        target_role_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
      ELSE
        target_role_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.role_id ELSE NEW.role_id END;
      END IF;
      SELECT agency_id INTO role_agency_id FROM role WHERE id = target_role_id AND _deleted = false;
      IF NOT FOUND THEN RETURN NULL; END IF;
      SELECT EXISTS(SELECT 1 FROM role_transfer_payment_scope WHERE role_id = target_role_id AND _deleted = false) INTO has_program_scope;
      IF role_agency_id IS NULL AND has_program_scope THEN
        RAISE EXCEPTION 'global role cannot have transfer payment scopes'
          USING ERRCODE = '23514', CONSTRAINT = 'role_permission_scope_check';
      END IF;
      scope_type := CASE WHEN role_agency_id IS NULL THEN 'global' WHEN has_program_scope THEN 'program' ELSE 'agency' END;
      SELECT count(*) INTO invalid_count FROM role_permission
      WHERE role_id = target_role_id AND _deleted = false AND (
        (subject = 'system' AND scope_type <> 'global')
        OR (subject IN ('agency', 'role', 'user', 'applicant_recipient') AND scope_type = 'program')
      );
      IF invalid_count > 0 THEN
        RAISE EXCEPTION 'role permission is incompatible with role scope'
          USING ERRCODE = '23514', CONSTRAINT = 'role_permission_scope_check';
      END IF;
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)
  await sql`CREATE CONSTRAINT TRIGGER trg_role_permission_scope_permission AFTER INSERT OR UPDATE OR DELETE ON role_permission DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_role_permission_scope()`.execute(db)
  await sql`CREATE CONSTRAINT TRIGGER trg_role_permission_scope_role AFTER UPDATE OF agency_id, _deleted ON role DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_role_permission_scope()`.execute(db)
  await sql`CREATE CONSTRAINT TRIGGER trg_role_permission_scope_program AFTER INSERT OR UPDATE OR DELETE ON role_transfer_payment_scope DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_role_permission_scope()`.execute(db)

  await db.schema
    .createTable('Transfer_Payment_Amendment_Type')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_tp_amended', sql`Amended_Type`, col => col.notNull())
    .addColumn('egcs_tp_name_en', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_tp_name_fr', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_tp_requiresamendmentsubtype', 'boolean', col => col.defaultTo(false).notNull())
    .addColumn('egcs_tp_transferpaymentstream', 'bigint', col =>
      col.notNull().references('Transfer_Payment_Stream.id').onDelete('restrict')
    )
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .execute()

  await db.schema
    .createTable('Transfer_Payment_Amendment_Subtype')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_tp_name_en', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_tp_name_fr', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_tp_description_en', 'text', col => col.notNull())
    .addColumn('egcs_tp_description_fr', 'text', col => col.notNull())
    .addColumn('egcs_tp_transferpaymentstream', 'bigint', col =>
      col.notNull().references('Transfer_Payment_Stream.id').onDelete('restrict')
    )
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .execute()

  await db.schema
    .createTable('Transfer_Payment_Amendment_Subtype_Type')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_tp_amendmentsubtype', 'bigint', col => col.notNull().references('Transfer_Payment_Amendment_Subtype.id').onDelete('restrict'))
    .addColumn('egcs_tp_amendmenttype', 'bigint', col => col.notNull().references('Transfer_Payment_Amendment_Type.id').onDelete('restrict'))
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .execute()

  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_enforce_amendment_subtype_type_stream_scope()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $function$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM "Transfer_Payment_Amendment_Subtype" subtype
        INNER JOIN "Transfer_Payment_Amendment_Type" amendment_type
          ON amendment_type.id = NEW.egcs_tp_amendmenttype
        WHERE subtype.id = NEW.egcs_tp_amendmentsubtype
          AND subtype.egcs_tp_transferpaymentstream = amendment_type.egcs_tp_transferpaymentstream
          AND subtype._deleted = false
          AND amendment_type._deleted = false
      ) THEN
        RAISE EXCEPTION 'Amendment subtype and type must belong to the same transfer payment stream'
          USING ERRCODE = '23514', CONSTRAINT = 'tp_chk_amendmentsubtypetypestreamscope';
      END IF;

      RETURN NEW;
    END
    $function$
  `.execute(db)

  await sql`
    CREATE TRIGGER trg_enforce_amendment_subtype_type_stream_scope
    BEFORE INSERT OR UPDATE OF egcs_tp_amendmentsubtype, egcs_tp_amendmenttype
    ON "Transfer_Payment_Amendment_Subtype_Type"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_amendment_subtype_type_stream_scope()
  `.execute(db)

  await db.schema
    .createTable('Transfer_Payment_Agreement_Subtype')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_tp_agreementtype', 'bigint', col =>
      col.notNull().references('Agency_Agreement_Type.id').onDelete('restrict')
    )
    .addColumn('egcs_tp_transferpaymentstream', 'bigint', col =>
      col.notNull().references('Transfer_Payment_Stream.id').onDelete('restrict')
    )
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .execute()

  await db.schema
    .createTable('Transfer_Payment_Stream_Chart_of_Account')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_tp_streambudget', 'bigint', col => col.notNull())
    .addColumn('egcs_tp_accountingdimensions', 'jsonb', col => col.notNull())
    .addColumn('egcs_tp_transferpaymentstream', 'bigint', col =>
      col.notNull().references('Transfer_Payment_Stream.id').onDelete('restrict')
    )
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .addForeignKeyConstraint(
      'tp_ref_chartofaccountbudgetstream',
      ['egcs_tp_streambudget', 'egcs_tp_transferpaymentstream'],
      'Transfer_Payment_Stream_Budget',
      ['id', 'egcs_tp_transferpaymentstream'],
      constraint => constraint.onDelete('restrict')
    )
    .addCheckConstraint(
      'tp_chk_chartofaccountdimensions',
      sql`jsonb_typeof(egcs_tp_accountingdimensions) = 'array' AND jsonb_array_length(egcs_tp_accountingdimensions) > 0`
    )
    .execute()

  await db.schema
    .createTable('Transfer_Payment_Stream_Commitment_Type')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_tp_name_en', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_tp_name_fr', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_tp_transferpaymentstream', 'bigint', col =>
      col.notNull().references('Transfer_Payment_Stream.id').onDelete('restrict')
    )
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .addUniqueConstraint('tp_unq_commitmenttypeidstream', ['id', 'egcs_tp_transferpaymentstream'])
    .execute()

  await db.schema
    .createTable('Transfer_Payment_Monitor_Type')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_tp_name_en', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_tp_name_fr', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_tp_transferpaymentstream', 'bigint', col =>
      col.notNull().references('Transfer_Payment_Stream.id').onDelete('restrict')
    )
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .execute()

  await db.schema
    .createTable('Transfer_Payment_Stream_Area_of_Expertise')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_tp_name_en', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_tp_name_fr', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_tp_description_en', 'text', col => col.notNull())
    .addColumn('egcs_tp_description_fr', 'text', col => col.notNull())
    .addColumn('egcs_tp_transferpaymentstream', 'bigint', col =>
      col.notNull().references('Transfer_Payment_Stream.id').onDelete('restrict')
    )
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .execute()

  await db.schema
    .createTable('Transfer_Payment_Stream_Risk_Rating')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_tp_transferpaymentstream', 'bigint', col =>
      col.notNull().references('Transfer_Payment_Stream.id').onDelete('restrict')
    )
    .addColumn('egcs_tp_riskscore', RISK_SCORE_TYPE, col => col.notNull())
    .addColumn('egcs_tp_name_en', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_tp_name_fr', 'varchar(255)', col => col.notNull())
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .addCheckConstraint('tp_chk_streamriskratingriskscore', sql`egcs_tp_riskscore >= 0`)
    .execute()

  await db.schema
    .createTable('Transfer_Payment_Financial_Limits')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_tp_transferpaymentstream', 'bigint', col =>
      col.notNull().references('Transfer_Payment_Stream.id').onDelete('restrict')
    )
    .addColumn('egcs_tp_maxallowableperrecipient', MAX_ALLOWABLE_TYPE, col => col.notNull())
    .addColumn('egcs_tp_maxpercentofsupportavailableperrecipient', PERCENT_TYPE, col => col.notNull())
    .addColumn('egcs_tp_maxpercentofretroactivecostsallowable', PERCENT_TYPE, col => col.notNull())
    .addColumn('egcs_tp_stackinglimit', PERCENT_TYPE, col => col.notNull())
    .addColumn('egcs_tp_active', 'boolean', col => col.notNull().defaultTo(false))
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .execute()

  await db.schema
    .createIndex(FINANCIAL_LIMITS_STREAM_STATUS_UNIQUE)
    .on('Transfer_Payment_Financial_Limits')
    .columns(['egcs_tp_transferpaymentstream', 'egcs_tp_active'])
    .where(sql<SqlBool>`_deleted = false`)
    .unique()
    .execute()

  await db.schema.createIndex(INDEX_NAMES.streamCommitmentTypeEn)
    .on('Transfer_Payment_Stream_Commitment_Type')
    .columns(['egcs_tp_transferpaymentstream', 'egcs_tp_name_en'])
    .where(sql<SqlBool>`_deleted = false`)
    .unique()
    .execute()
  await db.schema.createIndex(INDEX_NAMES.streamCommitmentTypeFr)
    .on('Transfer_Payment_Stream_Commitment_Type')
    .columns(['egcs_tp_transferpaymentstream', 'egcs_tp_name_fr'])
    .where(sql<SqlBool>`_deleted = false`)
    .unique()
    .execute()

  await db.schema
    .createIndex(STREAM_CHART_OF_ACCOUNT_UNIQUE)
    .on('Transfer_Payment_Stream_Chart_of_Account')
    .columns([
      'egcs_tp_transferpaymentstream',
      'egcs_tp_streambudget',
      'egcs_tp_accountingdimensions'
    ])
    .where(sql<SqlBool>`_deleted = false`)
    .unique()
    .execute()

  await sql`
    CREATE INDEX ${sql.raw(INDEX_NAMES.profileNameEn)}
    ON "Transfer_Payment_Profile" ("egcs_tp_name_en")
    WHERE "_deleted" = false AND "egcs_tp_active" = true
  `.execute(db)

  await sql`
    CREATE INDEX ${sql.raw(INDEX_NAMES.profileNameFr)}
    ON "Transfer_Payment_Profile" ("egcs_tp_name_fr")
    WHERE "_deleted" = false AND "egcs_tp_active" = true
  `.execute(db)

  await sql`
    CREATE UNIQUE INDEX ${sql.raw(INDEX_NAMES.profileStatusUnique)}
    ON "Transfer_Payment_Profile" (
      "egcs_tp_agency",
      "egcs_tp_name_en",
      "egcs_tp_name_fr",
      "egcs_tp_active"
    )
    WHERE "_deleted" = false AND "egcs_tp_active" = true
  `.execute(db)

  await sql`
    CREATE INDEX ${sql.raw(INDEX_NAMES.streamNameEn)}
    ON "Transfer_Payment_Stream" ("egcs_tp_name_en")
    WHERE "_deleted" = false AND "egcs_tp_active" = true
  `.execute(db)

  await sql`
    CREATE INDEX ${sql.raw(INDEX_NAMES.streamNameFr)}
    ON "Transfer_Payment_Stream" ("egcs_tp_name_fr")
    WHERE "_deleted" = false AND "egcs_tp_active" = true
  `.execute(db)

  await sql`
    CREATE UNIQUE INDEX ${sql.raw(INDEX_NAMES.streamStatusUnique)}
    ON "Transfer_Payment_Stream" (
      "egcs_tp_transferpaymentprofile",
      "egcs_tp_name_en",
      "egcs_tp_name_fr",
      "egcs_tp_active"
    )
    WHERE "_deleted" = false AND "egcs_tp_active" = true
  `.execute(db)

  await sql`
    CREATE UNIQUE INDEX ${sql.raw(INDEX_NAMES.programOutcomeNameEn)}
    ON "Transfer_Payment_Outcome" (
      "egcs_tp_transferpaymentprofile",
      lower(btrim("egcs_tp_name_en")),
      lower(btrim("egcs_tp_name_fr"))
    )
    WHERE "_deleted" = false
  `.execute(db)

  await sql`
    CREATE INDEX ${sql.raw(INDEX_NAMES.programOutcomeNameFr)}
    ON "Transfer_Payment_Outcome" (
      "egcs_tp_transferpaymentprofile",
      lower(btrim("egcs_tp_name_fr"))
    )
    WHERE "_deleted" = false
  `.execute(db)

  await sql`
    CREATE UNIQUE INDEX ${sql.raw(INDEX_NAMES.programObjectiveEn)}
    ON "Transfer_Payment_Objective" (
      "egcs_tp_transferpaymentprofile",
      md5(lower("egcs_tp_objective_en"))
    )
    WHERE "_deleted" = false
  `.execute(db)

  await sql`
    CREATE UNIQUE INDEX ${sql.raw(INDEX_NAMES.programObjectiveFr)}
    ON "Transfer_Payment_Objective" (
      "egcs_tp_transferpaymentprofile",
      md5(lower("egcs_tp_objective_fr"))
    )
    WHERE "_deleted" = false
  `.execute(db)

  await sql`
    CREATE UNIQUE INDEX ${sql.raw(INDEX_NAMES.programBudgetFiscalYear)}
    ON "Transfer_Payment_Fiscal_Year_Budget" (
      "egcs_tp_transferpaymentprofile",
      "egcs_tp_fiscalyear"
    )
    WHERE "_deleted" = false
  `.execute(db)

  await sql`
    CREATE UNIQUE INDEX ${sql.raw(INDEX_NAMES.outcomePerformanceIndicatorNameEn)}
    ON "Transfer_Payment_Outcome_Performance_Indicator" (
      "egcs_tp_transferpaymentoutcome",
      "egcs_tp_name_en"
    )
    WHERE "_deleted" = false
  `.execute(db)

  await sql`
    CREATE UNIQUE INDEX ${sql.raw(INDEX_NAMES.outcomePerformanceIndicatorNameFr)}
    ON "Transfer_Payment_Outcome_Performance_Indicator" (
      "egcs_tp_transferpaymentoutcome",
      "egcs_tp_name_fr"
    )
    WHERE "_deleted" = false
  `.execute(db)

  await sql`
    CREATE UNIQUE INDEX ${sql.raw(INDEX_NAMES.streamOutcome)}
    ON "Transfer_Payment_Stream_Outcome" (
      "egcs_tp_transferpaymentstream",
      "egcs_tp_transferpaymentoutcome"
    )
    WHERE "_deleted" = false
  `.execute(db)

  await sql`
    CREATE UNIQUE INDEX ${sql.raw(INDEX_NAMES.streamBudgetFiscalYear)}
    ON "Transfer_Payment_Stream_Budget" (
      "egcs_tp_transferpaymentstream",
      "egcs_tp_transferpaymentbudget"
    )
    WHERE "_deleted" = false
  `.execute(db)

  await sql`
    CREATE UNIQUE INDEX ${sql.raw(INDEX_NAMES.streamEligibleRecipient)}
    ON "Transfer_Payment_Stream_Eligible_Recipient" (
      "egcs_tp_transferpaymentstream",
      "egcs_tp_applicantrecipientsubtype"
    )
    WHERE "_deleted" = false
  `.execute(db)

  await sql`
    CREATE UNIQUE INDEX ${sql.raw(INDEX_NAMES.streamCostCategoryLineItem)}
    ON "Transfer_Payment_Stream_Cost_Category_Line_Item" (
      "egcs_tp_transferpaymentstream",
      "egcs_tp_organizationcostcategory"
    )
    WHERE "_deleted" = false
  `.execute(db)

  await sql`
    CREATE UNIQUE INDEX ${sql.raw(INDEX_NAMES.streamAmendmentTypeEn)}
    ON "Transfer_Payment_Amendment_Type" (
      "egcs_tp_transferpaymentstream",
      "egcs_tp_amended",
      lower(btrim("egcs_tp_name_en")),
      lower(btrim("egcs_tp_name_fr"))
    )
    WHERE "_deleted" = false
  `.execute(db)

  await sql`
    CREATE INDEX ${sql.raw(INDEX_NAMES.streamAmendmentTypeFr)}
    ON "Transfer_Payment_Amendment_Type" (
      "egcs_tp_transferpaymentstream",
      lower(btrim("egcs_tp_name_fr"))
    )
    WHERE "_deleted" = false
  `.execute(db)

  await sql`
    CREATE UNIQUE INDEX ${sql.raw(INDEX_NAMES.streamAmendmentSubtypeEn)}
    ON "Transfer_Payment_Amendment_Subtype" (
      "egcs_tp_transferpaymentstream",
      lower(btrim("egcs_tp_name_en")),
      lower(btrim("egcs_tp_name_fr"))
    )
    WHERE "_deleted" = false
  `.execute(db)

  await sql`
    CREATE INDEX ${sql.raw(INDEX_NAMES.streamAmendmentSubtypeFr)}
    ON "Transfer_Payment_Amendment_Subtype" (
      "egcs_tp_transferpaymentstream",
      lower(btrim("egcs_tp_name_fr"))
    )
    WHERE "_deleted" = false
  `.execute(db)

  await sql`
    CREATE UNIQUE INDEX ${sql.raw(INDEX_NAMES.streamAmendmentSubtypeType)}
    ON "Transfer_Payment_Amendment_Subtype_Type" ("egcs_tp_amendmentsubtype", "egcs_tp_amendmenttype")
    WHERE "_deleted" = false
  `.execute(db)

  await sql`
    CREATE UNIQUE INDEX ${sql.raw(INDEX_NAMES.streamAgreementSubtype)}
    ON "Transfer_Payment_Agreement_Subtype" (
      "egcs_tp_transferpaymentstream",
      "egcs_tp_agreementtype"
    )
    WHERE "_deleted" = false
  `.execute(db)

  await sql`
    CREATE UNIQUE INDEX ${sql.raw(INDEX_NAMES.streamAgreementSubtypeIdStreamUnique)}
    ON "Transfer_Payment_Agreement_Subtype" (
      "id",
      "egcs_tp_transferpaymentstream"
    )
  `.execute(db)

  await sql`
    CREATE UNIQUE INDEX ${sql.raw(INDEX_NAMES.streamMonitorTypeEn)}
    ON "Transfer_Payment_Monitor_Type" (
      "egcs_tp_transferpaymentstream",
      "egcs_tp_name_en"
    )
    WHERE "_deleted" = false
  `.execute(db)

  await sql`
    CREATE UNIQUE INDEX ${sql.raw(INDEX_NAMES.streamMonitorTypeFr)}
    ON "Transfer_Payment_Monitor_Type" (
      "egcs_tp_transferpaymentstream",
      "egcs_tp_name_fr"
    )
    WHERE "_deleted" = false
  `.execute(db)

  await sql`
    CREATE UNIQUE INDEX ${sql.raw(INDEX_NAMES.streamRiskRatingScore)}
    ON "Transfer_Payment_Stream_Risk_Rating" (
      "egcs_tp_transferpaymentstream",
      "egcs_tp_riskscore"
    )
    WHERE "_deleted" = false
  `.execute(db)

  await sql`
    CREATE UNIQUE INDEX ${sql.raw(INDEX_NAMES.streamRiskRatingEn)}
    ON "Transfer_Payment_Stream_Risk_Rating" (
      "egcs_tp_transferpaymentstream",
      "egcs_tp_name_en"
    )
    WHERE "_deleted" = false
  `.execute(db)

  await sql`
    CREATE UNIQUE INDEX ${sql.raw(INDEX_NAMES.streamRiskRatingFr)}
    ON "Transfer_Payment_Stream_Risk_Rating" (
      "egcs_tp_transferpaymentstream",
      "egcs_tp_name_fr"
    )
    WHERE "_deleted" = false
  `.execute(db)

  await sql`
    CREATE UNIQUE INDEX ${sql.raw(INDEX_NAMES.streamAreaOfExpertiseEn)}
    ON "Transfer_Payment_Stream_Area_of_Expertise" (
      "egcs_tp_transferpaymentstream",
      lower(btrim("egcs_tp_name_en")),
      lower(btrim("egcs_tp_name_fr"))
    )
    WHERE "_deleted" = false
  `.execute(db)

  await sql`
    CREATE INDEX ${sql.raw(INDEX_NAMES.streamAreaOfExpertiseFr)}
    ON "Transfer_Payment_Stream_Area_of_Expertise" (
      "egcs_tp_transferpaymentstream",
      lower(btrim("egcs_tp_name_fr"))
    )
    WHERE "_deleted" = false
  `.execute(db)
  await sql`
    CREATE TABLE "Transfer_Payment_Stream_Field_Section" (
      id bigserial PRIMARY KEY,
      egcs_tp_transferpaymentstream bigint NOT NULL REFERENCES "Transfer_Payment_Stream"(id) ON DELETE RESTRICT,
      name_en text NOT NULL, name_fr text NOT NULL,
      display_order integer NOT NULL DEFAULT 0 CHECK (display_order >= 0),
      _deleted boolean NOT NULL DEFAULT false,
      UNIQUE (id, egcs_tp_transferpaymentstream)
    )
  `.execute(db)
  await sql`
    CREATE TABLE "Transfer_Payment_Stream_Field" (
      id bigserial PRIMARY KEY,
      egcs_tp_transferpaymentstream bigint NOT NULL REFERENCES "Transfer_Payment_Stream"(id) ON DELETE RESTRICT,
      name_en text NOT NULL, name_fr text NOT NULL,
      section_id bigint NOT NULL,
      FOREIGN KEY (section_id, egcs_tp_transferpaymentstream) REFERENCES "Transfer_Payment_Stream_Field_Section"(id, egcs_tp_transferpaymentstream) ON DELETE RESTRICT,
      kind text NOT NULL CHECK (kind IN ('text', 'relational')),
      presentation text NOT NULL DEFAULT 'single_line' CHECK (presentation IN ('single_line', 'multiline')),
      required boolean NOT NULL DEFAULT false,
      discriminator boolean NOT NULL DEFAULT false,
      active boolean NOT NULL DEFAULT true,
      display_order integer NOT NULL DEFAULT 0 CHECK (display_order >= 0),
      _deleted boolean NOT NULL DEFAULT false,
      CHECK (NOT discriminator OR kind = 'relational'),
      CHECK (kind = 'text' OR presentation = 'single_line'),
      UNIQUE (id, egcs_tp_transferpaymentstream)
    )
  `.execute(db)
  await sql`
    CREATE TABLE "Transfer_Payment_Stream_Field_Option" (
      id bigserial PRIMARY KEY,
      field_id bigint NOT NULL REFERENCES "Transfer_Payment_Stream_Field"(id) ON DELETE RESTRICT,
      name_en text NOT NULL, name_fr text NOT NULL,
      category_en text, category_fr text,
      active boolean NOT NULL DEFAULT true,
      display_order integer NOT NULL DEFAULT 0 CHECK (display_order >= 0),
      _deleted boolean NOT NULL DEFAULT false,
      CHECK ((category_en IS NULL) = (category_fr IS NULL)),
      UNIQUE (id, field_id)
    )
  `.execute(db)
  await sql`
    CREATE FUNCTION protect_stream_field_identity() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.kind IS DISTINCT FROM OLD.kind OR NEW.egcs_tp_transferpaymentstream IS DISTINCT FROM OLD.egcs_tp_transferpaymentstream THEN
        RAISE EXCEPTION 'Stream field identity is immutable' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END $$
  `.execute(db)
  await sql`
    CREATE TRIGGER protect_stream_field_identity BEFORE UPDATE ON "Transfer_Payment_Stream_Field"
      FOR EACH ROW EXECUTE FUNCTION protect_stream_field_identity()
  `.execute(db)

}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable('Transfer_Payment_Stream_Field_Option').execute()
  await db.schema.dropTable('Transfer_Payment_Stream_Field').execute()
  await db.schema.dropTable('Transfer_Payment_Stream_Field_Section').execute()
  await sql`DROP FUNCTION protect_stream_field_identity()`.execute(db)
  await db.schema.dropIndex(STREAM_HOLDBACK_BASIS_UNIQUE).execute()
  await db.schema.dropIndex(INDEX_NAMES.streamAreaOfExpertiseFr).execute()
  await db.schema.dropIndex(INDEX_NAMES.streamAreaOfExpertiseEn).execute()
  await db.schema.dropIndex(INDEX_NAMES.streamRiskRatingFr).execute()
  await db.schema.dropIndex(INDEX_NAMES.streamRiskRatingEn).execute()
  await db.schema.dropIndex(INDEX_NAMES.streamRiskRatingScore).execute()
  await db.schema.dropIndex(INDEX_NAMES.streamMonitorTypeFr).execute()
  await db.schema.dropIndex(INDEX_NAMES.streamMonitorTypeEn).execute()
  await db.schema.dropIndex(INDEX_NAMES.streamAgreementSubtype).execute()
  await db.schema.dropIndex(INDEX_NAMES.streamAmendmentSubtypeFr).execute()
  await db.schema.dropIndex(INDEX_NAMES.streamAmendmentSubtypeEn).execute()
  await db.schema.dropIndex(INDEX_NAMES.streamAmendmentSubtypeType).execute()
  await db.schema.dropIndex(INDEX_NAMES.streamAmendmentTypeFr).execute()
  await db.schema.dropIndex(INDEX_NAMES.streamAmendmentTypeEn).execute()
  await db.schema.dropIndex(INDEX_NAMES.streamCostCategoryLineItem).execute()
  await db.schema.dropIndex(INDEX_NAMES.streamEligibleRecipient).execute()
  await db.schema.dropIndex(INDEX_NAMES.streamBudgetFiscalYear).execute()
  await db.schema.dropIndex(INDEX_NAMES.streamOutcome).execute()
  await db.schema.dropIndex(INDEX_NAMES.outcomePerformanceIndicatorNameFr).execute()
  await db.schema.dropIndex(INDEX_NAMES.outcomePerformanceIndicatorNameEn).execute()
  await db.schema.dropIndex(INDEX_NAMES.programBudgetFiscalYear).execute()
  await db.schema.dropIndex(INDEX_NAMES.programObjectiveFr).execute()
  await db.schema.dropIndex(INDEX_NAMES.programObjectiveEn).execute()
  await db.schema.dropIndex(INDEX_NAMES.programOutcomeNameFr).execute()
  await db.schema.dropIndex(INDEX_NAMES.programOutcomeNameEn).execute()
  await db.schema.dropIndex(INDEX_NAMES.streamStatusUnique).execute()
  await db.schema.dropIndex(INDEX_NAMES.streamNameFr).execute()
  await db.schema.dropIndex(INDEX_NAMES.streamNameEn).execute()
  await db.schema.dropIndex(INDEX_NAMES.profileStatusUnique).execute()
  await db.schema.dropIndex(INDEX_NAMES.profileNameFr).execute()
  await db.schema.dropIndex(INDEX_NAMES.profileNameEn).execute()
  await db.schema.dropIndex(STREAM_CHART_OF_ACCOUNT_UNIQUE).execute()
  await db.schema.dropIndex(INDEX_NAMES.streamCommitmentTypeFr).execute()
  await db.schema.dropIndex(INDEX_NAMES.streamCommitmentTypeEn).execute()
  await db.schema.dropIndex(FINANCIAL_LIMITS_STREAM_STATUS_UNIQUE).execute()

  await sql`DROP INDEX IF EXISTS ${sql.raw(ROLE_TRANSFER_PAYMENT_SCOPE_UNIQUE_ACTIVE)}`.execute(db)

  await db.schema.dropTable('Transfer_Payment_Financial_Limits').execute()
  await db.schema.dropTable('Transfer_Payment_Stream_Risk_Rating').execute()
  await db.schema.dropTable('Transfer_Payment_Stream_Area_of_Expertise').execute()
  await db.schema.dropTable('Transfer_Payment_Monitor_Type').execute()
  await db.schema.dropTable('Transfer_Payment_Stream_Commitment_Type').execute()
  await db.schema.dropTable('Transfer_Payment_Stream_Chart_of_Account').execute()
  await db.schema.dropTable('Transfer_Payment_Agreement_Subtype').execute()
  await sql`DROP TRIGGER IF EXISTS trg_enforce_amendment_subtype_type_stream_scope ON "Transfer_Payment_Amendment_Subtype_Type"`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_enforce_amendment_subtype_type_stream_scope()`.execute(db)
  await db.schema.dropTable('Transfer_Payment_Amendment_Subtype_Type').execute()
  await db.schema.dropTable('Transfer_Payment_Amendment_Subtype').execute()
  await db.schema.dropTable('Transfer_Payment_Amendment_Type').execute()
  await sql`DROP TRIGGER IF EXISTS trg_role_permission_scope_program ON role_transfer_payment_scope`.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_role_permission_scope_role ON role`.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_role_permission_scope_permission ON role_permission`.execute(db)
  await sql`DROP FUNCTION IF EXISTS enforce_role_permission_scope()`.execute(db)
  await db.schema.dropTable('role_transfer_payment_scope').execute()
  await db.schema.dropTable('Transfer_Payment_Stream_Outcome').execute()
  await db.schema.dropTable('Transfer_Payment_Outcome_Performance_Indicator').execute()
  await db.schema.dropTable('Transfer_Payment_Outcome').execute()
  await db.schema.dropTable('Transfer_Payment_Stream_Cost_Category_Line_Item').execute()
  await db.schema.dropTable('Transfer_Payment_Stream_Eligible_Recipient').execute()
  await sql`DROP TRIGGER IF EXISTS trg_enforce_stream_budget_profile_ownership ON "Transfer_Payment_Stream_Budget"`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_enforce_stream_budget_profile_ownership()`.execute(db)
  await db.schema.dropTable('Transfer_Payment_Stream_Budget').execute()
  await db.schema.dropTable('Transfer_Payment_Objective').execute()
  await db.schema.dropTable('Transfer_Payment_Stream_Holdback_Basis').execute()
  await sql`DROP TRIGGER IF EXISTS trg_protect_transfer_payment_stream_ownership ON "Transfer_Payment_Stream"`.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_protect_transfer_payment_fiscal_year_budget_ownership ON "Transfer_Payment_Fiscal_Year_Budget"`.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_protect_transfer_payment_profile_ownership ON "Transfer_Payment_Profile"`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_protect_transfer_payment_ownership()`.execute(db)
  await db.schema.dropTable('Transfer_Payment_Stream').execute()
  await db.schema.dropTable('Transfer_Payment_Fiscal_Year_Budget').execute()
  await db.schema.dropTable('Transfer_Payment_Profile').execute()
}
