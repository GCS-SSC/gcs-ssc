import type { Kysely } from 'kysely'
import { sql } from 'kysely'
import type { Database } from '../../../shared/types/database'

const INDEX_NAMES = {
  profileStreamAgreementNumber: 'fc_idx_profiletransferpaymentstreamagreementnumber',
  applicantRecipientAgreement: 'fc_idx_applicantrecipientapplicantrecipientfundingagreement',
  addressAgreementAddress: 'fc_idx_addressfundingagreementaddress',
  activityAgreement: 'fc_idx_activityfundingagreement',
  amendmentNumber: 'fc_idx_amendmentnumber',
  openAmendment: 'fc_idx_openamendment',
  closeoutNumber: 'fc_idx_closeoutnumber',
  openCloseout: 'fc_idx_opencloseout',
  amendmentType: 'fc_idx_amendmenttype',
  amendmentSubtype: 'fc_idx_amendmentsubtype',
  currentBudgetVersion: 'fc_idx_currentbudgetversion',
  amendmentBudgetVersion: 'fc_idx_amendmentbudgetversion',
  currentActivityVersion: 'fc_idx_currentactivityversion',
  amendmentActivityVersion: 'fc_idx_amendmentactivityversion',
  outcomeActivityOutcomeActivity: 'fc_idx_outcomeactivityoutcomesactivity',
  responsiblePartyActivityActivityResponsibleParty: 'fc_idx_responsiblepartyactivityactivityresponsibleparty',
  budgetFiscalYearAgreementFiscalYear: 'fc_idx_budgetfiscalyearfundingagreementfiscalyear',
  budgetFiscalYearVersionIdentity: 'fc_idx_budgetfiscalyearversionidentity',
  budgetLineItemAgreementBudgetFiscalYearCostCategory: 'fc_idx_uniquebudgetline',
  forecastFiscalYearAgreement: 'fc_idx_forecastfiscalyearfundingagreement',
  activeForecastFiscalYearAgreement: 'fc_idx_activeforecastfiscalyearfundingagreement',
  forecastLineItem: 'fc_idx_forecastlineitem',
  claimAgreementFiscalYear: 'fc_idx_claimfundingagreementfiscalyear',
  claimLineItem: 'fc_idx_claimlineitem',
  claimReconcileFinalUnique: 'fc_idx_uniquefinalclaimreconcile',
  claimReconcileLineUnique: 'fc_idx_uniquereconcilelineitem',
  commitmentAgreement: 'fc_idx_commitmentfundingagreement',
  activeCommitmentAgreement: 'fc_idx_activecommitmentfundingagreement',
  commitmentLineUnique: 'fc_idx_uniquecommitmentline',
  paymentCommitmentFiscalYear: 'fc_idx_paymentcommitmentfiscalyear',
  paymentLinePaymentCommitmentLine: 'fc_idx_paymentlinepaymentcommitmentline',
  paymentLineCommitmentLine: 'fc_idx_paymentlinefundingagreementcommitmentline',
  monitorAgreement: 'fc_idx_monitorfundingagreement',
  monitorPlanningMonitor: 'fc_idx_monitorplanningfundingagreementmonitor',
  monitorItemsMonitor: 'fc_idx_monitoritemsfundingagreementmonitor',
  monitorFindingMonitor: 'fc_idx_monitorfindingfundingagreementmonitor',
  monitorFollowupMonitor: 'fc_idx_monitorfollowupfundingagreementmonitor',
  monitorFollowupUpdateFollowup: 'fc_idx_monitorfollowupupdatefundingagreementmonitorfollowup',
  monitorPromisingPracticeMonitor: 'fc_idx_monitorpromisingpracticefundingagreementmonitor',
  generatedDocumentAgreement: 'fc_idx_generateddocumentagreement'
} as const

const createAssignmentLifecycleTriggers = async (
  db: Kysely<Database>,
  table: string,
  entityType: string,
  triggerKey: string
): Promise<void> => {
  await sql.raw(`
    CREATE CONSTRAINT TRIGGER trg_enforce_${triggerKey}_assignment_roster
    AFTER INSERT OR UPDATE OF _deleted ON "${table}"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
    EXECUTE FUNCTION trg_fn_enforce_assignable_entity_roster('${entityType}')
  `).execute(db)
  await sql.raw(`
    CREATE TRIGGER trg_soft_delete_${triggerKey}_assignments
    AFTER UPDATE OF _deleted ON "${table}" FOR EACH ROW
    EXECUTE FUNCTION trg_fn_soft_delete_entity_assignments('${entityType}')
  `).execute(db)
}

const createStatusAgencyConstraintTrigger = async (
  db: Kysely<Database>,
  table: string,
  triggerKey: string
): Promise<void> => {
  await sql.raw(`
    CREATE CONSTRAINT TRIGGER trg_validate_${triggerKey}_status_agency
    AFTER INSERT OR UPDATE ON "${table}"
    DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW
    EXECUTE FUNCTION trg_fn_validate_funding_status_agency()
  `).execute(db)
}

export const up = async (db: Kysely<Database>): Promise<void> => {
  await db.schema
    .createTable('Funding_Case_Agreement_Profile')
    .addColumn('id', 'bigint', col =>
      col.primaryKey().notNull().references('Common_Entity.id').onDelete('restrict')
    )
    .addColumn('egcs_fc_agreementnumber', 'varchar(15)', col => col.notNull())
    .addColumn('egcs_fc_transferpaymentstream', 'bigint', col =>
      col.notNull().references('Transfer_Payment_Stream.id').onDelete('restrict')
    )
    .addColumn('egcs_fc_financialsystemnumber', 'bigint', col => col.notNull())
    .addColumn('egcs_fc_title_en', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_fc_title_fr', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_fc_description_en', 'text', col => col.notNull())
    .addColumn('egcs_fc_description_fr', 'text', col => col.notNull())
    .addColumn('egcs_fc_agreementtype', sql`Agreement_Type`, col => col.notNull())
    .addColumn('egcs_fc_agreementsubtype', 'bigint', col => col.notNull())
    .addColumn('egcs_fc_furtherdistribution', 'boolean', col => col.notNull())
    .addColumn('egcs_fc_holdback', 'numeric(5, 2)', col => col.defaultTo(10).notNull())
    .addColumn('egcs_fc_holdbackbasis', 'bigint', col =>
      col.notNull().references('Transfer_Payment_Stream_Holdback_Basis.id').onDelete('restrict')
    )
    .addColumn('egcs_fc_riskscore', 'numeric(8, 2)')
    .addColumn('egcs_fc_status', 'bigint', col => col.notNull().references('Common_Status.id').onDelete('restrict'))
    .addColumn('egcs_fc_authorizedassistancestartdate', 'date', col => col.notNull())
    .addColumn('egcs_fc_authorizedassistanceenddate', 'date', col => col.notNull())
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .addCheckConstraint(
      'fc_chk_profileauthorizedassistance',
      sql`egcs_fc_authorizedassistanceenddate >= egcs_fc_authorizedassistancestartdate`
    )
    .addCheckConstraint('fc_chk_profileholdback', sql`egcs_fc_holdback BETWEEN 0 AND 100`)
    .addCheckConstraint('fc_chk_profileriskscore', sql`egcs_fc_riskscore IS NULL OR egcs_fc_riskscore >= 0`)
    .addUniqueConstraint('fc_unq_profileidtransferpaymentstream', ['id', 'egcs_fc_transferpaymentstream'])
    .addForeignKeyConstraint(
      'fc_ref_profileagreementsubtypetransferpaymentstream',
      ['egcs_fc_agreementsubtype', 'egcs_fc_transferpaymentstream'],
      'Transfer_Payment_Agreement_Subtype',
      ['id', 'egcs_tp_transferpaymentstream'],
      constraint => constraint.onDelete('restrict')
    )
    .execute()

  await sql`
    CREATE UNIQUE INDEX ${sql.raw(INDEX_NAMES.profileStreamAgreementNumber)}
    ON "Funding_Case_Agreement_Profile" (
      "egcs_fc_transferpaymentstream",
      "egcs_fc_agreementnumber"
    )
    WHERE "_deleted" = false
  `.execute(db)

  await sql`DROP TRIGGER IF EXISTS trg_register_fundingcaseagreement ON "Funding_Case_Agreement_Profile"`.execute(db)
  await sql`
    CREATE TRIGGER trg_register_fundingcaseagreement
    BEFORE INSERT ON "Funding_Case_Agreement_Profile"
    FOR EACH ROW EXECUTE FUNCTION register_entity('fundingcaseagreement');
  `.execute(db)
  await createAssignmentLifecycleTriggers(
    db,
    'Funding_Case_Agreement_Profile',
    'fundingcaseagreement',
    'agreement'
  )

  await db.schema
    .createTable('Funding_Case_Agreement_Amendment')
    .addColumn('id', 'bigint', col =>
      col.primaryKey().notNull().references('Common_Entity.id').onDelete('restrict')
    )
    .addColumn('egcs_fc_fundingagreement', 'bigint', col =>
      col.notNull().references('Funding_Case_Agreement_Profile.id').onDelete('restrict')
    )
    .addColumn('egcs_fc_amendmentnumber', 'integer', col => col.notNull())
    .addColumn('egcs_fc_name_en', 'varchar(255)')
    .addColumn('egcs_fc_name_fr', 'varchar(255)')
    .addColumn('egcs_fc_status', 'bigint', col => col.notNull().references('Common_Status.id').onDelete('restrict'))
    .addColumn('egcs_fc_isopen', 'boolean', col => col.defaultTo(true).notNull())
    .addColumn('egcs_fc_proposedauthorizedassistancestartdate', 'date')
    .addColumn('egcs_fc_proposedauthorizedassistanceenddate', 'date')
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .addCheckConstraint(
      'fc_chk_amendmentname',
      sql`NULLIF(BTRIM(egcs_fc_name_en), '') IS NOT NULL OR NULLIF(BTRIM(egcs_fc_name_fr), '') IS NOT NULL`
    )
    .addCheckConstraint('fc_chk_amendmentnumberpositive', sql`egcs_fc_amendmentnumber >= 1`)
    .addUniqueConstraint(
      'fc_unq_amendmentidfundingagreement',
      ['id', 'egcs_fc_fundingagreement']
    )
    .addCheckConstraint(
      'fc_chk_amendmentauthorizedassistancedates',
      sql`(
        egcs_fc_proposedauthorizedassistancestartdate IS NULL
        AND egcs_fc_proposedauthorizedassistanceenddate IS NULL
      ) OR (
        egcs_fc_proposedauthorizedassistancestartdate IS NOT NULL
        AND egcs_fc_proposedauthorizedassistanceenddate IS NOT NULL
        AND egcs_fc_proposedauthorizedassistanceenddate >= egcs_fc_proposedauthorizedassistancestartdate
      )`
    )
    .execute()

  await sql`
    CREATE UNIQUE INDEX ${sql.raw(INDEX_NAMES.amendmentNumber)}
    ON "Funding_Case_Agreement_Amendment" (
      "egcs_fc_fundingagreement",
      "egcs_fc_amendmentnumber"
    )
  `.execute(db)

  await sql`
    CREATE UNIQUE INDEX ${sql.raw(INDEX_NAMES.openAmendment)}
    ON "Funding_Case_Agreement_Amendment" ("egcs_fc_fundingagreement")
    WHERE "_deleted" = false AND "egcs_fc_isopen" = true
  `.execute(db)

  await sql`
    CREATE TRIGGER trg_register_fundingcaseamendment
    BEFORE INSERT ON "Funding_Case_Agreement_Amendment"
    FOR EACH ROW EXECUTE FUNCTION register_entity('fundingcaseamendment');
  `.execute(db)

  await db.schema
    .createTable('Funding_Case_Agreement_Closeout')
    .addColumn('id', 'bigint', col => col.primaryKey().notNull().references('Common_Entity.id').onDelete('restrict'))
    .addColumn('egcs_fc_fundingagreement', 'bigint', col => col.notNull().references('Funding_Case_Agreement_Profile.id').onDelete('restrict'))
    .addColumn('egcs_fc_closeoutnumber', 'integer', col => col.notNull())
    .addColumn('egcs_fc_status', 'bigint', col => col.notNull().references('Common_Status.id').onDelete('restrict'))
    .addColumn('egcs_fc_isopen', 'boolean', col => col.defaultTo(true).notNull())
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .addCheckConstraint('fc_chk_closeoutnumberpositive', sql`egcs_fc_closeoutnumber >= 1`)
    .addUniqueConstraint('fc_unq_closeoutidagreement', ['id', 'egcs_fc_fundingagreement'])
    .execute()
  await sql`
    CREATE UNIQUE INDEX ${sql.raw(INDEX_NAMES.closeoutNumber)}
    ON "Funding_Case_Agreement_Closeout" (egcs_fc_fundingagreement, egcs_fc_closeoutnumber)
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX ${sql.raw(INDEX_NAMES.openCloseout)}
    ON "Funding_Case_Agreement_Closeout" (egcs_fc_fundingagreement)
    WHERE _deleted = false AND egcs_fc_isopen = true
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_register_fundingcaseagreementcloseout
    BEFORE INSERT ON "Funding_Case_Agreement_Closeout"
    FOR EACH ROW EXECUTE FUNCTION register_entity('fundingcaseagreementcloseout')
  `.execute(db)

  await db.schema
    .createTable('Funding_Case_Agreement_Amendment_Type')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_fc_amendment', 'bigint', col =>
      col.notNull().references('Funding_Case_Agreement_Amendment.id').onDelete('restrict')
    )
    .addColumn('egcs_fc_amendmenttype', 'bigint', col =>
      col.notNull().references('Transfer_Payment_Amendment_Type.id').onDelete('restrict')
    )
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .execute()

  await sql`
    CREATE UNIQUE INDEX ${sql.raw(INDEX_NAMES.amendmentType)}
    ON "Funding_Case_Agreement_Amendment_Type" (
      "egcs_fc_amendment",
      "egcs_fc_amendmenttype"
    )
    WHERE "_deleted" = false
  `.execute(db)

  await db.schema
    .createTable('Funding_Case_Agreement_Amendment_Subtype')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_fc_amendment', 'bigint', col => col.notNull().references('Funding_Case_Agreement_Amendment.id').onDelete('restrict'))
    .addColumn('egcs_fc_amendmentsubtype', 'bigint', col => col.notNull().references('Transfer_Payment_Amendment_Subtype.id').onDelete('restrict'))
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .execute()

  await sql`
    CREATE UNIQUE INDEX ${sql.raw(INDEX_NAMES.amendmentSubtype)}
    ON "Funding_Case_Agreement_Amendment_Subtype" ("egcs_fc_amendment", "egcs_fc_amendmentsubtype")
    WHERE "_deleted" = false
  `.execute(db)

  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_enforce_amendment_type_stream_scope()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $function$
    BEGIN
      IF TG_OP = 'UPDATE' AND NEW._deleted = true THEN
        RETURN NEW;
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM "Funding_Case_Agreement_Amendment" amendment
        INNER JOIN "Funding_Case_Agreement_Profile" agreement
          ON agreement.id = amendment.egcs_fc_fundingagreement
        INNER JOIN "Transfer_Payment_Amendment_Type" amendment_type
          ON amendment_type.id = NEW.egcs_fc_amendmenttype
        WHERE amendment.id = NEW.egcs_fc_amendment
          AND amendment_type.egcs_tp_transferpaymentstream = agreement.egcs_fc_transferpaymentstream
          AND amendment._deleted = false
          AND agreement._deleted = false
          AND amendment_type._deleted = false
      ) THEN
        RAISE EXCEPTION 'Amendment type must belong to the agreement transfer payment stream'
          USING ERRCODE = '23514', CONSTRAINT = 'fc_chk_amendmenttypestreamscope';
      END IF;

      RETURN NEW;
    END
    $function$
  `.execute(db)

  await sql`
    CREATE TRIGGER trg_enforce_amendment_type_stream_scope
    BEFORE INSERT OR UPDATE OF egcs_fc_amendment, egcs_fc_amendmenttype
    ON "Funding_Case_Agreement_Amendment_Type"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_amendment_type_stream_scope()
  `.execute(db)

  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_enforce_agreement_amendment_subtype_scope()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $function$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM "Funding_Case_Agreement_Amendment" amendment
        INNER JOIN "Funding_Case_Agreement_Profile" agreement
          ON agreement.id = amendment.egcs_fc_fundingagreement
        INNER JOIN "Transfer_Payment_Amendment_Subtype" subtype
          ON subtype.id = NEW.egcs_fc_amendmentsubtype
        INNER JOIN "Transfer_Payment_Amendment_Subtype_Type" subtype_type
          ON subtype_type.egcs_tp_amendmentsubtype = subtype.id
        INNER JOIN "Funding_Case_Agreement_Amendment_Type" selected_type
          ON selected_type.egcs_fc_amendment = amendment.id
          AND selected_type.egcs_fc_amendmenttype = subtype_type.egcs_tp_amendmenttype
        WHERE amendment.id = NEW.egcs_fc_amendment
          AND subtype.egcs_tp_transferpaymentstream = agreement.egcs_fc_transferpaymentstream
          AND amendment._deleted = false
          AND agreement._deleted = false
          AND subtype._deleted = false
          AND subtype_type._deleted = false
          AND selected_type._deleted = false
      ) THEN
        RAISE EXCEPTION 'Amendment subtype must belong to the agreement stream and a selected amendment type'
          USING ERRCODE = '23514', CONSTRAINT = 'fc_chk_amendmentsubtypeselectedtype';
      END IF;

      RETURN NEW;
    END
    $function$
  `.execute(db)

  await sql`
    CREATE TRIGGER trg_enforce_agreement_amendment_subtype_scope
    BEFORE INSERT OR UPDATE OF egcs_fc_amendment, egcs_fc_amendmentsubtype
    ON "Funding_Case_Agreement_Amendment_Subtype"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_agreement_amendment_subtype_scope()
  `.execute(db)

  await db.schema
    .createTable('Funding_Case_Agreement_Budget_Version')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_fc_fundingagreement', 'bigint', col =>
      col.notNull().references('Funding_Case_Agreement_Profile.id').onDelete('restrict')
    )
    .addColumn('egcs_fc_amendment', 'bigint')
    .addColumn('egcs_fc_sourceversion', 'bigint')
    .addColumn('egcs_fc_iscurrent', 'boolean', col => col.defaultTo(false).notNull())
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .addCheckConstraint(
      'fc_chk_budgetversionownership',
      sql`(egcs_fc_iscurrent AND egcs_fc_amendment IS NULL) OR (NOT egcs_fc_iscurrent)`
    )
    .addUniqueConstraint('fc_unq_budgetversionidfundingagreement', ['id', 'egcs_fc_fundingagreement'])
    .addForeignKeyConstraint(
      'fc_ref_budgetversionamendmentagreement',
      ['egcs_fc_amendment', 'egcs_fc_fundingagreement'],
      'Funding_Case_Agreement_Amendment',
      ['id', 'egcs_fc_fundingagreement'],
      constraint => constraint.onDelete('restrict')
    )
    .addForeignKeyConstraint(
      'fc_ref_budgetversionsourceagreement',
      ['egcs_fc_sourceversion', 'egcs_fc_fundingagreement'],
      'Funding_Case_Agreement_Budget_Version',
      ['id', 'egcs_fc_fundingagreement'],
      constraint => constraint.onDelete('restrict')
    )
    .execute()

  await sql`
    CREATE UNIQUE INDEX ${sql.raw(INDEX_NAMES.currentBudgetVersion)}
    ON "Funding_Case_Agreement_Budget_Version" ("egcs_fc_fundingagreement")
    WHERE "_deleted" = false AND "egcs_fc_iscurrent" = true
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX ${sql.raw(INDEX_NAMES.amendmentBudgetVersion)}
    ON "Funding_Case_Agreement_Budget_Version" ("egcs_fc_amendment")
    WHERE "_deleted" = false AND "egcs_fc_amendment" IS NOT NULL
  `.execute(db)

  await db.schema
    .createTable('Funding_Case_Agreement_Activity_Version')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_fc_fundingagreement', 'bigint', col =>
      col.notNull().references('Funding_Case_Agreement_Profile.id').onDelete('restrict')
    )
    .addColumn('egcs_fc_amendment', 'bigint')
    .addColumn('egcs_fc_sourceversion', 'bigint')
    .addColumn('egcs_fc_iscurrent', 'boolean', col => col.defaultTo(false).notNull())
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .addCheckConstraint(
      'fc_chk_activityversionownership',
      sql`(egcs_fc_iscurrent AND egcs_fc_amendment IS NULL) OR (NOT egcs_fc_iscurrent)`
    )
    .addUniqueConstraint('fc_unq_activityversionidfundingagreement', ['id', 'egcs_fc_fundingagreement'])
    .addForeignKeyConstraint(
      'fc_ref_activityversionamendmentagreement',
      ['egcs_fc_amendment', 'egcs_fc_fundingagreement'],
      'Funding_Case_Agreement_Amendment',
      ['id', 'egcs_fc_fundingagreement'],
      constraint => constraint.onDelete('restrict')
    )
    .addForeignKeyConstraint(
      'fc_ref_activityversionsourceagreement',
      ['egcs_fc_sourceversion', 'egcs_fc_fundingagreement'],
      'Funding_Case_Agreement_Activity_Version',
      ['id', 'egcs_fc_fundingagreement'],
      constraint => constraint.onDelete('restrict')
    )
    .execute()

  await sql`
    CREATE UNIQUE INDEX ${sql.raw(INDEX_NAMES.currentActivityVersion)}
    ON "Funding_Case_Agreement_Activity_Version" ("egcs_fc_fundingagreement")
    WHERE "_deleted" = false AND "egcs_fc_iscurrent" = true
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX ${sql.raw(INDEX_NAMES.amendmentActivityVersion)}
    ON "Funding_Case_Agreement_Activity_Version" ("egcs_fc_amendment")
    WHERE "_deleted" = false AND "egcs_fc_amendment" IS NOT NULL
  `.execute(db)

  await db.schema
    .createTable('Funding_Case_Agreement_Approval_Submission')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_fc_fundingagreement', 'bigint', col => col.notNull().references('Funding_Case_Agreement_Profile.id').onDelete('restrict'))
    .addColumn('egcs_fc_amendment', 'bigint')
    .addColumn('egcs_fc_workflowrun', 'bigint', col => col.notNull().unique().references('Common_Workflow_Run.id').onDelete('restrict'))
    .addColumn('egcs_fc_snapshotschemaversion', 'integer', col => col.notNull())
    .addColumn('egcs_fc_packet', 'jsonb', col => col.notNull())
    .addColumn('egcs_fc_canonicalhash', 'varchar(64)', col => col.notNull())
    .addColumn('egcs_fc_submittedat', 'timestamptz', col => col.defaultTo(sql`now()`).notNull())
    .addCheckConstraint('fc_chk_approvalsubmissionversion', sql`egcs_fc_snapshotschemaversion = 1`)
    .addCheckConstraint('fc_chk_approvalsubmissionhash', sql`egcs_fc_canonicalhash ~ '^[0-9a-f]{64}$'`)
    .addForeignKeyConstraint('fc_ref_approvalsubmissionamendmentagreement', ['egcs_fc_amendment', 'egcs_fc_fundingagreement'], 'Funding_Case_Agreement_Amendment', ['id', 'egcs_fc_fundingagreement'], constraint => constraint.onDelete('restrict'))
    .execute()

  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_validate_agreement_approval_submission() RETURNS trigger AS $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM "Common_Workflow_Run" workflow_run
        JOIN "Common_Runtime" runtime ON runtime.id = workflow_run.id
        WHERE workflow_run.id = NEW.egcs_fc_workflowrun
          AND runtime.egcs_cn_kind = 'workflow'
          AND runtime.egcs_cn_purpose = 'approval_submission'
          AND ((runtime.egcs_cn_entitytype = 'fundingcaseagreement' AND NEW.egcs_fc_amendment IS NULL AND runtime.egcs_cn_entityid = NEW.egcs_fc_fundingagreement)
            OR (runtime.egcs_cn_entitytype = 'fundingcaseamendment' AND runtime.egcs_cn_entityid = NEW.egcs_fc_amendment))
          AND runtime._deleted = false
      ) THEN RAISE EXCEPTION 'Approval submission target and workflow run mismatch'; END IF;
      RETURN NEW;
    END; $$ LANGUAGE plpgsql
  `.execute(db)
  await sql`CREATE TRIGGER trg_validate_agreement_approval_submission BEFORE INSERT ON "Funding_Case_Agreement_Approval_Submission" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_agreement_approval_submission()`.execute(db)
  await sql`CREATE OR REPLACE FUNCTION trg_fn_immutable_agreement_approval_submission() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'Agreement approval submissions are immutable'; END; $$ LANGUAGE plpgsql`.execute(db)
  await sql`CREATE TRIGGER trg_immutable_agreement_approval_submission BEFORE UPDATE OR DELETE ON "Funding_Case_Agreement_Approval_Submission" FOR EACH ROW EXECUTE FUNCTION trg_fn_immutable_agreement_approval_submission()`.execute(db)

  await db.schema
    .createTable('Funding_Case_Agreement_Revision')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_fc_fundingagreement', 'bigint', col =>
      col.notNull().references('Funding_Case_Agreement_Profile.id').onDelete('restrict')
    )
    .addColumn('egcs_fc_amendment', 'bigint')
    .addColumn('egcs_fc_approvalsubmission', 'bigint', col =>
      col.notNull().references('Funding_Case_Agreement_Approval_Submission.id').onDelete('restrict')
    )
    .addColumn('egcs_fc_revisionnumber', 'integer', col => col.notNull())
    .addColumn('egcs_fc_approvedat', 'timestamptz', col => col.defaultTo(sql`now()`).notNull())
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .addCheckConstraint('fc_chk_revisionnumber', sql`egcs_fc_revisionnumber >= 0`)
    .addCheckConstraint(
      'fc_chk_revisionamendment',
      sql`(egcs_fc_revisionnumber = 0 AND egcs_fc_amendment IS NULL)
        OR (egcs_fc_revisionnumber > 0 AND egcs_fc_amendment IS NOT NULL)`
    )
    .addForeignKeyConstraint(
      'fc_ref_revisionamendmentagreement',
      ['egcs_fc_amendment', 'egcs_fc_fundingagreement'],
      'Funding_Case_Agreement_Amendment',
      ['id', 'egcs_fc_fundingagreement'],
      constraint => constraint.onDelete('restrict')
    )
    .execute()

  await sql`
    CREATE UNIQUE INDEX fc_idx_revisionagreementnumber
    ON "Funding_Case_Agreement_Revision" (egcs_fc_fundingagreement, egcs_fc_revisionnumber)
    WHERE _deleted = false
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX fc_idx_revisionamendment
    ON "Funding_Case_Agreement_Revision" (egcs_fc_amendment)
    WHERE _deleted = false AND egcs_fc_amendment IS NOT NULL
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX fc_idx_revisionapprovalsubmission
    ON "Funding_Case_Agreement_Revision" (egcs_fc_approvalsubmission)
    WHERE _deleted = false
  `.execute(db)

  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_validate_agreement_revision() RETURNS trigger AS $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM "Funding_Case_Agreement_Approval_Submission" submission
        WHERE submission.id = NEW.egcs_fc_approvalsubmission
          AND submission.egcs_fc_fundingagreement = NEW.egcs_fc_fundingagreement
          AND submission.egcs_fc_amendment IS NOT DISTINCT FROM NEW.egcs_fc_amendment
      ) THEN RAISE EXCEPTION 'Agreement revision submission target mismatch'; END IF;
      RETURN NEW;
    END; $$ LANGUAGE plpgsql
  `.execute(db)
  await sql`CREATE TRIGGER trg_validate_agreement_revision BEFORE INSERT OR UPDATE ON "Funding_Case_Agreement_Revision" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_agreement_revision()`.execute(db)

  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_create_agreement_working_versions()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $function$
    BEGIN
      INSERT INTO "Funding_Case_Agreement_Budget_Version" (
        egcs_fc_fundingagreement, egcs_fc_iscurrent
      ) VALUES (NEW.id, true);
      INSERT INTO "Funding_Case_Agreement_Activity_Version" (
        egcs_fc_fundingagreement, egcs_fc_iscurrent
      ) VALUES (NEW.id, true);
      RETURN NEW;
    END
    $function$
  `.execute(db)

  await sql`
    CREATE TRIGGER trg_create_agreement_working_versions
    AFTER INSERT ON "Funding_Case_Agreement_Profile"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_create_agreement_working_versions()
  `.execute(db)

  await db.schema
    .createTable('Funding_Case_Agreement_Applicant_Recipient')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_fc_fundingagreement', 'bigint', col =>
      col.notNull().references('Funding_Case_Agreement_Profile.id').onDelete('restrict')
    )
    .addColumn('egcs_fc_applicantrecipient', 'bigint', col =>
      col.notNull().references('Applicant_Recipient_Profile.id').onDelete('restrict')
    )
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .execute()

  await sql`
    CREATE UNIQUE INDEX ${sql.raw(INDEX_NAMES.applicantRecipientAgreement)}
    ON "Funding_Case_Agreement_Applicant_Recipient" (
      "egcs_fc_applicantrecipient",
      "egcs_fc_fundingagreement"
    )
    WHERE "_deleted" = false
  `.execute(db)

  await db.schema
    .createTable('Funding_Case_Agreement_Budget_Fiscal_Year')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_fc_fundingagreement', 'bigint', col =>
      col.notNull().references('Funding_Case_Agreement_Profile.id').onDelete('restrict')
    )
    .addColumn('egcs_fc_budgetversion', 'bigint', col => col.notNull())
    .addColumn('egcs_fc_originalbudgetfiscalyear', 'bigint')
    .addColumn('egcs_fc_fiscalyear', 'bigint', col =>
      col.notNull().references('Agency_Fiscal_Year.id').onDelete('restrict')
    )
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .addUniqueConstraint(
      'fc_unq_budgetfiscalyearidfundingagreement',
      ['id', 'egcs_fc_fundingagreement']
    )
    .addForeignKeyConstraint(
      'fc_ref_budgetfiscalyearversionagreement',
      ['egcs_fc_budgetversion', 'egcs_fc_fundingagreement'],
      'Funding_Case_Agreement_Budget_Version',
      ['id', 'egcs_fc_fundingagreement'],
      constraint => constraint.onDelete('restrict')
    )
    .addForeignKeyConstraint(
      'fc_ref_budgetfiscalyearoriginalagreement',
      ['egcs_fc_originalbudgetfiscalyear', 'egcs_fc_fundingagreement'],
      'Funding_Case_Agreement_Budget_Fiscal_Year',
      ['id', 'egcs_fc_fundingagreement'],
      constraint => constraint.onDelete('restrict')
    )
    .addCheckConstraint(
      'fc_chk_budgetfiscalyearoriginalnotself',
      sql`egcs_fc_originalbudgetfiscalyear IS NULL OR egcs_fc_originalbudgetfiscalyear <> id`
    )
    .execute()

  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_resolve_current_budget_version()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $function$
    BEGIN
      IF NEW.egcs_fc_budgetversion IS NULL THEN
        SELECT id INTO NEW.egcs_fc_budgetversion
        FROM "Funding_Case_Agreement_Budget_Version"
        WHERE egcs_fc_fundingagreement = NEW.egcs_fc_fundingagreement
          AND egcs_fc_iscurrent = true
          AND _deleted = false;
      END IF;

      RETURN NEW;
    END
    $function$
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_resolve_current_budget_version
    BEFORE INSERT ON "Funding_Case_Agreement_Budget_Fiscal_Year"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_resolve_current_budget_version()
  `.execute(db)

  await sql`
    CREATE UNIQUE INDEX ${sql.raw(INDEX_NAMES.budgetFiscalYearAgreementFiscalYear)}
    ON "Funding_Case_Agreement_Budget_Fiscal_Year" (
      "egcs_fc_budgetversion",
      "egcs_fc_fiscalyear"
    )
    WHERE "_deleted" = false
  `.execute(db)

  await sql`
    CREATE UNIQUE INDEX ${sql.raw(INDEX_NAMES.budgetFiscalYearVersionIdentity)}
    ON "Funding_Case_Agreement_Budget_Fiscal_Year" (
      "egcs_fc_budgetversion",
      (COALESCE("egcs_fc_originalbudgetfiscalyear", "id"))
    )
    WHERE "_deleted" = false
  `.execute(db)

  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_enforce_budget_fiscal_year_root()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $function$
    BEGIN
      IF NEW.egcs_fc_originalbudgetfiscalyear IS NOT NULL AND EXISTS (
        SELECT 1 FROM "Funding_Case_Agreement_Budget_Fiscal_Year" original
        WHERE original.id = NEW.egcs_fc_originalbudgetfiscalyear
          AND original.egcs_fc_originalbudgetfiscalyear IS NOT NULL
      ) THEN
        RAISE EXCEPTION 'Budget fiscal year original must be a root row'
          USING ERRCODE = '23514', CONSTRAINT = 'fc_chk_budgetfiscalyearoriginalroot';
      END IF;
      RETURN NEW;
    END
    $function$
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_enforce_budget_fiscal_year_root
    BEFORE INSERT OR UPDATE OF egcs_fc_originalbudgetfiscalyear
    ON "Funding_Case_Agreement_Budget_Fiscal_Year"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_budget_fiscal_year_root()
  `.execute(db)

  await db.schema
    .createTable('Funding_Case_Agreement_Budget_Line_Item')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_fc_fundingagreement', 'bigint', col => col.notNull())
    .addColumn('egcs_fc_budgetversion', 'bigint', col => col.notNull())
    .addColumn('egcs_fc_originalbudgetlineitem', 'bigint')
    .addColumn('egcs_fc_fundingagreementbudgetfiscalyear', 'bigint', col => col.notNull())
    .addColumn('egcs_fc_organizationcostcategory', 'bigint', col =>
      col.notNull().references('Transfer_Payment_Stream_Cost_Category_Line_Item.id').onDelete('restrict')
    )
    .addColumn('egcs_fc_costsubsection', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_fc_description', 'text', col => col.notNull())
    .addColumn('egcs_fc_totalamount', 'numeric(19, 2)', col => col.notNull())
    .addColumn('egcs_fc_programfunding', 'numeric(19, 2)', col => col.notNull())
    .addColumn('egcs_fc_otherfederalfunding', 'numeric(19, 2)')
    .addColumn('egcs_fc_othergovfunding', 'numeric(19, 2)')
    .addColumn('egcs_fc_otherfunding', 'numeric(19, 2)')
    .addColumn('egcs_fc_currency', sql`currency_codes`, col => col.notNull())
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .addUniqueConstraint('fc_unq_budgetlineitemidfundingagreement', ['id', 'egcs_fc_fundingagreement'])
    .addCheckConstraint(
      'fc_chk_budgetlineitemtotalamountcoversfunding',
      sql`"egcs_fc_totalamount" >= (
        "egcs_fc_programfunding"
        + COALESCE("egcs_fc_otherfederalfunding", 0)
        + COALESCE("egcs_fc_othergovfunding", 0)
        + COALESCE("egcs_fc_otherfunding", 0)
      )`
    )
    .addForeignKeyConstraint(
      'fc_ref_budgetlineitemoriginalagreement',
      ['egcs_fc_originalbudgetlineitem', 'egcs_fc_fundingagreement'],
      'Funding_Case_Agreement_Budget_Line_Item',
      ['id', 'egcs_fc_fundingagreement'],
      constraint => constraint.onDelete('restrict')
    )
    .addCheckConstraint('fc_chk_budgetlineitemoriginalnotself', sql`egcs_fc_originalbudgetlineitem IS NULL OR egcs_fc_originalbudgetlineitem <> id`)
    .addForeignKeyConstraint(
      'fc_ref_budgetlineitemfiscalyearagreement',
      ['egcs_fc_fundingagreementbudgetfiscalyear', 'egcs_fc_fundingagreement'],
      'Funding_Case_Agreement_Budget_Fiscal_Year',
      ['id', 'egcs_fc_fundingagreement'],
      constraint => constraint.onDelete('restrict')
    )
    .execute()

  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_resolve_budget_line_item_identity()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $function$
    DECLARE
      resolved_agreement bigint;
      resolved_budget_version bigint;
    BEGIN
      SELECT egcs_fc_fundingagreement, egcs_fc_budgetversion
      INTO resolved_agreement, resolved_budget_version
      FROM "Funding_Case_Agreement_Budget_Fiscal_Year"
      WHERE id = NEW.egcs_fc_fundingagreementbudgetfiscalyear;

      IF resolved_agreement IS NULL THEN
        RAISE EXCEPTION 'Budget line item fiscal year is unavailable'
          USING ERRCODE = '23514', CONSTRAINT = 'fc_chk_budgetlineitemfiscalyearscope';
      END IF;

      IF NEW.egcs_fc_fundingagreement IS NULL THEN
        NEW.egcs_fc_fundingagreement := resolved_agreement;
      ELSIF NEW.egcs_fc_fundingagreement IS DISTINCT FROM resolved_agreement THEN
        RAISE EXCEPTION 'Budget line item fiscal year must belong to its agreement'
          USING ERRCODE = '23514', CONSTRAINT = 'fc_chk_budgetlineitemfiscalyearscope';
      END IF;

      NEW.egcs_fc_budgetversion := resolved_budget_version;

      RETURN NEW;
    END
    $function$
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX fc_idx_budgetlineitemversionidentity
    ON "Funding_Case_Agreement_Budget_Line_Item" (
      "egcs_fc_budgetversion",
      (COALESCE("egcs_fc_originalbudgetlineitem", "id"))
    )
    WHERE "_deleted" = false
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_resolve_budget_line_item_identity
    BEFORE INSERT OR UPDATE OF
      egcs_fc_fundingagreement,
      egcs_fc_fundingagreementbudgetfiscalyear,
      egcs_fc_originalbudgetlineitem,
      _deleted
    ON "Funding_Case_Agreement_Budget_Line_Item"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_resolve_budget_line_item_identity()
  `.execute(db)

  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_enforce_budget_line_item_root()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $function$
    BEGIN
      IF NEW.egcs_fc_originalbudgetlineitem IS NOT NULL AND EXISTS (
        SELECT 1 FROM "Funding_Case_Agreement_Budget_Line_Item" original
        WHERE original.id = NEW.egcs_fc_originalbudgetlineitem
          AND original.egcs_fc_originalbudgetlineitem IS NOT NULL
      ) THEN
        RAISE EXCEPTION 'Budget line item original must be a root row'
          USING ERRCODE = '23514', CONSTRAINT = 'fc_chk_budgetlineitemoriginalroot';
      END IF;
      RETURN NEW;
    END
    $function$
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_enforce_budget_line_item_root
    BEFORE INSERT OR UPDATE OF egcs_fc_originalbudgetlineitem
    ON "Funding_Case_Agreement_Budget_Line_Item"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_budget_line_item_root()
  `.execute(db)

  await sql`
    CREATE INDEX ${sql.raw(INDEX_NAMES.budgetLineItemAgreementBudgetFiscalYearCostCategory)}
    ON "Funding_Case_Agreement_Budget_Line_Item" (
      "egcs_fc_fundingagreementbudgetfiscalyear",
      "egcs_fc_organizationcostcategory"
    )
    WHERE "_deleted" = false
  `.execute(db)

  await db.schema
    .createTable('Funding_Case_Agreement_Forecast')
    .addColumn('id', 'bigint', col =>
      col.primaryKey().notNull().references('Common_Entity.id').onDelete('restrict')
    )
    .addColumn('egcs_fc_fundingagreement', 'bigint', col =>
      col.notNull().references('Funding_Case_Agreement_Profile.id').onDelete('restrict')
    )
    .addColumn('egcs_fc_fiscalyear', 'bigint', col =>
      col.notNull().references('Funding_Case_Agreement_Budget_Fiscal_Year.id').onDelete('restrict')
    )
    .addColumn('egcs_fc_status', 'bigint', col => col.notNull().references('Common_Status.id').onDelete('restrict'))
    .addColumn('egcs_fc_active', 'boolean', col => col.defaultTo(false).notNull())
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .addUniqueConstraint('fc_unq_forecastidfundingagreement', ['id', 'egcs_fc_fundingagreement'])
    .addForeignKeyConstraint(
      'fc_ref_forecastfiscalyearagreement',
      ['egcs_fc_fiscalyear', 'egcs_fc_fundingagreement'],
      'Funding_Case_Agreement_Budget_Fiscal_Year',
      ['id', 'egcs_fc_fundingagreement'],
      constraint => constraint.onDelete('restrict')
    )
    .execute()

  await sql`
    CREATE INDEX ${sql.raw(INDEX_NAMES.forecastFiscalYearAgreement)}
    ON "Funding_Case_Agreement_Forecast" (
      "egcs_fc_fiscalyear",
      "egcs_fc_fundingagreement"
    )
    WHERE "_deleted" = false
  `.execute(db)

  await sql`
    CREATE UNIQUE INDEX ${sql.raw(INDEX_NAMES.activeForecastFiscalYearAgreement)}
    ON "Funding_Case_Agreement_Forecast" (
      "egcs_fc_fiscalyear",
      "egcs_fc_fundingagreement"
    )
    WHERE "_deleted" = false AND "egcs_fc_active" = true
  `.execute(db)

  await sql`DROP TRIGGER IF EXISTS trg_register_fundingcaseforecast ON "Funding_Case_Agreement_Forecast"`.execute(db)
  await sql`
    CREATE TRIGGER trg_register_fundingcaseforecast
    BEFORE INSERT ON "Funding_Case_Agreement_Forecast"
    FOR EACH ROW EXECUTE FUNCTION register_entity('fundingcaseforecast');
  `.execute(db)

  await db.schema
    .createTable('Funding_Case_Agreement_Forecast_Line_Item')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_fc_agreementforecast', 'bigint', col =>
      col.notNull().references('Funding_Case_Agreement_Forecast.id').onDelete('restrict')
    )
    .addColumn('egcs_fc_fundingagreement', 'bigint', col => col.notNull())
    .addColumn('egcs_fc_fundingagreementbudgetlineitem', 'bigint', col =>
      col.notNull().references('Funding_Case_Agreement_Budget_Line_Item.id').onDelete('restrict')
    )
    .addColumn('egcs_fc_month', 'smallint', col => col.notNull())
    .addColumn('egcs_fc_amount', 'numeric(19, 2)', col => col.notNull())
    .addColumn('egcs_fc_currency', sql`currency_codes`, col => col.notNull())
    .addColumn('egcs_fc_version', 'bigint', col => col.notNull())
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .addCheckConstraint('fc_chk_forecastlineitemmonth', sql`"egcs_fc_month" BETWEEN 0 AND 11`)
    .addCheckConstraint('fc_chk_forecastlineitemversion', sql`"egcs_fc_version" >= 0`)
    .addForeignKeyConstraint(
      'fc_ref_forecastlineforecastagreement',
      ['egcs_fc_agreementforecast', 'egcs_fc_fundingagreement'],
      'Funding_Case_Agreement_Forecast',
      ['id', 'egcs_fc_fundingagreement'],
      constraint => constraint.onDelete('restrict')
    )
    .addForeignKeyConstraint(
      'fc_ref_forecastlinebudgetlineagreement',
      ['egcs_fc_fundingagreementbudgetlineitem', 'egcs_fc_fundingagreement'],
      'Funding_Case_Agreement_Budget_Line_Item',
      ['id', 'egcs_fc_fundingagreement'],
      constraint => constraint.onDelete('restrict')
    )
    .execute()

  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_resolve_forecast_line_agreement() RETURNS trigger AS $$
    BEGIN
      SELECT "egcs_fc_fundingagreement" INTO NEW."egcs_fc_fundingagreement"
      FROM "Funding_Case_Agreement_Forecast"
      WHERE "id" = NEW."egcs_fc_agreementforecast";
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_resolve_forecast_line_agreement
    BEFORE INSERT OR UPDATE OF egcs_fc_agreementforecast, egcs_fc_fundingagreement
    ON "Funding_Case_Agreement_Forecast_Line_Item"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_resolve_forecast_line_agreement();
  `.execute(db)

  await sql`
    CREATE INDEX ${sql.raw(INDEX_NAMES.forecastLineItem)}
    ON "Funding_Case_Agreement_Forecast_Line_Item" (
      "egcs_fc_agreementforecast",
      "egcs_fc_fundingagreementbudgetlineitem"
    )
    WHERE "_deleted" = false
  `.execute(db)

  await db.schema
    .createTable('Funding_Case_Agreement_Claim')
    .addColumn('id', 'bigint', col => col.primaryKey().notNull().references('Common_Entity.id').onDelete('restrict'))
    .addColumn('egcs_fc_fundingagreement', 'bigint', col =>
      col.notNull().references('Funding_Case_Agreement_Profile.id').onDelete('restrict')
    )
    .addColumn('egcs_fc_fiscalyear', 'bigint', col =>
      col.notNull().references('Funding_Case_Agreement_Budget_Fiscal_Year.id').onDelete('restrict')
    )
    .addColumn('egcs_fc_isfinalforyear', 'boolean', col => col.notNull())
    .addColumn('egcs_fc_periodend', 'smallint', col => col.notNull())
    .addColumn('egcs_fc_periodstart', 'smallint', col => col.notNull())
    .addColumn('egcs_fc_receiveddate', 'timestamptz', col => col.notNull())
    .addColumn('egcs_fc_gcformssubmissionuuid', 'varchar(80)')
    .addColumn('egcs_fc_status', 'bigint', col => col.notNull().references('Common_Status.id').onDelete('restrict'))
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .addCheckConstraint('fc_chk_claimperiodstart', sql`"egcs_fc_periodstart" BETWEEN 0 AND 11`)
    .addCheckConstraint('fc_chk_claimperiodend', sql`"egcs_fc_periodend" BETWEEN 0 AND 11`)
    .addCheckConstraint('fc_chk_claimperiodrange', sql`"egcs_fc_periodend" >= "egcs_fc_periodstart"`)
    .addUniqueConstraint('fc_unq_claimidfundingagreement', ['id', 'egcs_fc_fundingagreement'])
    .addForeignKeyConstraint(
      'fc_ref_claimfiscalyearagreement',
      ['egcs_fc_fiscalyear', 'egcs_fc_fundingagreement'],
      'Funding_Case_Agreement_Budget_Fiscal_Year',
      ['id', 'egcs_fc_fundingagreement'],
      constraint => constraint.onDelete('restrict')
    )
    .execute()

  await sql`DROP TRIGGER IF EXISTS trg_register_fundingcaseagreementclaim ON "Funding_Case_Agreement_Claim"`.execute(db)
  await sql`
    CREATE TRIGGER trg_register_fundingcaseagreementclaim
    BEFORE INSERT ON "Funding_Case_Agreement_Claim"
    FOR EACH ROW EXECUTE FUNCTION register_entity('fundingcaseagreementclaim');
  `.execute(db)

  await sql`
    CREATE INDEX ${sql.raw(INDEX_NAMES.claimAgreementFiscalYear)}
    ON "Funding_Case_Agreement_Claim" (
      "egcs_fc_fundingagreement",
      "egcs_fc_fiscalyear"
    )
    WHERE "_deleted" = false
  `.execute(db)

  await sql`
    CREATE UNIQUE INDEX fc_idx_claim_gcforms_submission_uuid
    ON "Funding_Case_Agreement_Claim" ("egcs_fc_gcformssubmissionuuid")
    WHERE "_deleted" = false AND "egcs_fc_gcformssubmissionuuid" IS NOT NULL
  `.execute(db)

  await db.schema
    .createTable('Funding_Case_Agreement_Claim_Line_Item')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_fc_fundingagreementclaim', 'bigint', col =>
      col.notNull().references('Funding_Case_Agreement_Claim.id').onDelete('restrict')
    )
    .addColumn('egcs_fc_fundingagreement', 'bigint', col => col.notNull())
    .addColumn('egcs_fc_fundingagreementbudgetlineitem', 'bigint', col =>
      col.references('Funding_Case_Agreement_Budget_Line_Item.id').onDelete('restrict')
    )
    .addColumn('egcs_fc_submittedcostcategory', 'text')
    .addColumn('egcs_fc_submittedcostsubsection', 'text')
    .addColumn('egcs_fc_submittedlineitem', 'text')
    .addColumn('egcs_fc_description', 'text', col => col.notNull())
    .addColumn('egcs_fc_amount', 'numeric(19, 2)', col => col.notNull())
    .addColumn('egcs_fc_currency', sql`currency_codes`, col => col.notNull())
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .addForeignKeyConstraint(
      'fc_ref_claimlineclaimagreement',
      ['egcs_fc_fundingagreementclaim', 'egcs_fc_fundingagreement'],
      'Funding_Case_Agreement_Claim',
      ['id', 'egcs_fc_fundingagreement'],
      constraint => constraint.onDelete('restrict')
    )
    .addForeignKeyConstraint(
      'fc_ref_claimlinebudgetlineagreement',
      ['egcs_fc_fundingagreementbudgetlineitem', 'egcs_fc_fundingagreement'],
      'Funding_Case_Agreement_Budget_Line_Item',
      ['id', 'egcs_fc_fundingagreement'],
      constraint => constraint.onDelete('restrict')
    )
    .addUniqueConstraint('fc_unq_claimlineidclaim', ['id', 'egcs_fc_fundingagreementclaim'])
    .execute()

  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_resolve_claim_line_agreement() RETURNS trigger AS $$
    BEGIN
      SELECT "egcs_fc_fundingagreement" INTO NEW."egcs_fc_fundingagreement"
      FROM "Funding_Case_Agreement_Claim"
      WHERE "id" = NEW."egcs_fc_fundingagreementclaim";
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_resolve_claim_line_agreement
    BEFORE INSERT OR UPDATE OF egcs_fc_fundingagreementclaim, egcs_fc_fundingagreement
    ON "Funding_Case_Agreement_Claim_Line_Item"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_resolve_claim_line_agreement();
  `.execute(db)

  await sql`
    CREATE INDEX ${sql.raw(INDEX_NAMES.claimLineItem)}
    ON "Funding_Case_Agreement_Claim_Line_Item" (
      "egcs_fc_fundingagreementclaim",
      "egcs_fc_fundingagreementbudgetlineitem"
    )
    WHERE "_deleted" = false AND "egcs_fc_fundingagreementbudgetlineitem" IS NOT NULL
  `.execute(db)

  await db.schema
    .createTable('Funding_Case_Agreement_Claim_Reconcile')
    .addColumn('id', 'bigint', col =>
      col.primaryKey().notNull().references('Common_Entity.id').onDelete('restrict')
    )
    .addColumn('egcs_fc_fundingagreementclaim', 'bigint', col =>
      col.notNull().references('Funding_Case_Agreement_Claim.id').onDelete('restrict')
    )
    .addColumn('egcs_fc_user', 'bigint', col =>
      col.notNull().references('Common_User.id').onDelete('restrict')
    )
    .addColumn('egcs_fc_status', 'bigint', col => col.notNull().references('Common_Status.id').onDelete('restrict'))
    .addColumn('egcs_fc_isfinal', 'boolean', col => col.notNull())
    .addColumn('egcs_fc_isopen', 'boolean', col => col.defaultTo(true).notNull())
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .addUniqueConstraint('fc_unq_claimreconcileidclaim', ['id', 'egcs_fc_fundingagreementclaim'])
    .execute()

  await sql`DROP TRIGGER IF EXISTS trg_register_fundingclaimreconcile ON "Funding_Case_Agreement_Claim_Reconcile"`.execute(db)
  await sql`
    CREATE TRIGGER trg_register_fundingclaimreconcile
    BEFORE INSERT ON "Funding_Case_Agreement_Claim_Reconcile"
    FOR EACH ROW EXECUTE FUNCTION register_entity('fundingclaimreconcile');
  `.execute(db)

  await sql`
    CREATE UNIQUE INDEX ${sql.raw(INDEX_NAMES.claimReconcileFinalUnique)}
    ON "Funding_Case_Agreement_Claim_Reconcile" (
      "egcs_fc_fundingagreementclaim"
    )
    WHERE "_deleted" = false AND "egcs_fc_isfinal" = true AND "egcs_fc_isopen" = true
  `.execute(db)

  await db.schema
    .createTable('Funding_Case_Agreement_Claim_Reconcile_Line_Item')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_fc_fundingagreementclaimreconcile', 'bigint', col =>
      col.notNull().references('Funding_Case_Agreement_Claim_Reconcile.id').onDelete('restrict')
    )
    .addColumn('egcs_fc_fundingagreementclaim', 'bigint', col => col.notNull())
    .addColumn('egcs_fc_lineitem', 'bigint', col =>
      col.notNull().references('Funding_Case_Agreement_Claim_Line_Item.id').onDelete('restrict')
    )
    .addColumn('egcs_fc_reconciled', 'numeric(19, 2)', col => col.notNull())
    .addColumn('egcs_fc_sampled', 'numeric(19, 2)')
    .addColumn('egcs_fc_rationale', 'text')
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .addForeignKeyConstraint(
      'fc_ref_reconcilelineclaim',
      ['egcs_fc_fundingagreementclaimreconcile', 'egcs_fc_fundingagreementclaim'],
      'Funding_Case_Agreement_Claim_Reconcile',
      ['id', 'egcs_fc_fundingagreementclaim'],
      constraint => constraint.onDelete('restrict')
    )
    .addForeignKeyConstraint(
      'fc_ref_reconcilelineclaimline',
      ['egcs_fc_lineitem', 'egcs_fc_fundingagreementclaim'],
      'Funding_Case_Agreement_Claim_Line_Item',
      ['id', 'egcs_fc_fundingagreementclaim'],
      constraint => constraint.onDelete('restrict')
    )
    .execute()

  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_resolve_reconcile_line_claim() RETURNS trigger AS $$
    BEGIN
      SELECT "egcs_fc_fundingagreementclaim" INTO NEW."egcs_fc_fundingagreementclaim"
      FROM "Funding_Case_Agreement_Claim_Reconcile"
      WHERE "id" = NEW."egcs_fc_fundingagreementclaimreconcile";
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_resolve_reconcile_line_claim
    BEFORE INSERT OR UPDATE OF egcs_fc_fundingagreementclaimreconcile, egcs_fc_fundingagreementclaim
    ON "Funding_Case_Agreement_Claim_Reconcile_Line_Item"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_resolve_reconcile_line_claim();
  `.execute(db)

  await sql`
    CREATE UNIQUE INDEX ${sql.raw(INDEX_NAMES.claimReconcileLineUnique)}
    ON "Funding_Case_Agreement_Claim_Reconcile_Line_Item" (
      "egcs_fc_fundingagreementclaimreconcile",
      "egcs_fc_lineitem"
    )
    WHERE "_deleted" = false
  `.execute(db)

  await db.schema
    .createTable('Funding_Case_Agreement_Commitment')
    .addColumn('id', 'bigint', col =>
      col.primaryKey().notNull().references('Common_Entity.id').onDelete('restrict')
    )
    .addColumn('egcs_fc_fundingagreement', 'bigint', col =>
      col.notNull().references('Funding_Case_Agreement_Profile.id').onDelete('restrict')
    )
    .addColumn('egcs_fc_transferpaymentstream', 'bigint', col => col.notNull())
    .addColumn('egcs_fc_type', 'bigint', col => col.notNull())
    .addColumn('egcs_fc_status', 'bigint', col => col.notNull().references('Common_Status.id').onDelete('restrict'))
    .addColumn('egcs_fc_financialsystemnumber', 'bigint')
    .addColumn('egcs_fc_active', 'boolean', col => col.defaultTo(false).notNull())
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .addUniqueConstraint('fc_unq_commitmentidfundingagreement', ['id', 'egcs_fc_fundingagreement'])
    .addForeignKeyConstraint(
      'fc_ref_commitmenttypestream',
      ['egcs_fc_type', 'egcs_fc_transferpaymentstream'],
      'Transfer_Payment_Stream_Commitment_Type',
      ['id', 'egcs_tp_transferpaymentstream'],
      constraint => constraint.onDelete('restrict')
    )
    .execute()

  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_resolve_commitment_stream() RETURNS trigger AS $$
    BEGIN
      SELECT agreement."egcs_fc_transferpaymentstream"
      INTO NEW."egcs_fc_transferpaymentstream"
      FROM "Funding_Case_Agreement_Profile" agreement
      WHERE agreement."id" = NEW."egcs_fc_fundingagreement";
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_resolve_commitment_stream
    BEFORE INSERT OR UPDATE OF egcs_fc_fundingagreement, egcs_fc_transferpaymentstream
    ON "Funding_Case_Agreement_Commitment"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_resolve_commitment_stream();
  `.execute(db)

  await sql`
    CREATE INDEX ${sql.raw(INDEX_NAMES.commitmentAgreement)}
    ON "Funding_Case_Agreement_Commitment" (
      "egcs_fc_fundingagreement"
    )
    WHERE "_deleted" = false
  `.execute(db)

  await sql`
    CREATE UNIQUE INDEX ${sql.raw(INDEX_NAMES.activeCommitmentAgreement)}
    ON "Funding_Case_Agreement_Commitment" (
      "egcs_fc_fundingagreement",
      "egcs_fc_type"
    )
    WHERE "_deleted" = false AND "egcs_fc_active" = true
  `.execute(db)

  await sql`DROP TRIGGER IF EXISTS trg_register_fundingcaseagreementcommitment ON "Funding_Case_Agreement_Commitment"`.execute(db)
  await sql`
    CREATE TRIGGER trg_register_fundingcaseagreementcommitment
    BEFORE INSERT ON "Funding_Case_Agreement_Commitment"
    FOR EACH ROW EXECUTE FUNCTION register_entity('fundingcaseagreementcommitment');
  `.execute(db)

  await db.schema
    .alterTable('Transfer_Payment_Stream_Chart_of_Account')
    .addUniqueConstraint('fc_unq_chartofaccountidstream', ['id', 'egcs_tp_transferpaymentstream'])
    .execute()

  await db.schema
    .createTable('Funding_Case_Agreement_Commitment_Line')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_fc_commitment', 'bigint', col =>
      col.notNull().references('Funding_Case_Agreement_Commitment.id').onDelete('restrict')
    )
    .addColumn('egcs_fc_fundingagreement', 'bigint', col => col.notNull())
    .addColumn('egcs_fc_transferpaymentstream', 'bigint', col => col.notNull())
    .addColumn('egcs_fc_commitmentlinenumber', 'smallint', col => col.notNull())
    .addColumn('egcs_fc_transferpaymentstreamchartofaccount', 'bigint', col =>
      col.notNull().references('Transfer_Payment_Stream_Chart_of_Account.id').onDelete('restrict')
    )
    .addColumn('egcs_fc_amount', 'numeric(19, 2)', col => col.notNull())
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .addUniqueConstraint('fc_unq_commitmentlineidcommitment', ['id', 'egcs_fc_commitment'])
    .addForeignKeyConstraint(
      'fc_ref_commitmentlinecommitmentagreement',
      ['egcs_fc_commitment', 'egcs_fc_fundingagreement'],
      'Funding_Case_Agreement_Commitment',
      ['id', 'egcs_fc_fundingagreement'],
      constraint => constraint.onDelete('restrict')
    )
    .addForeignKeyConstraint(
      'fc_ref_commitmentlineagreementstream',
      ['egcs_fc_fundingagreement', 'egcs_fc_transferpaymentstream'],
      'Funding_Case_Agreement_Profile',
      ['id', 'egcs_fc_transferpaymentstream'],
      constraint => constraint.onDelete('restrict')
    )
    .addForeignKeyConstraint(
      'fc_ref_commitmentlinestreamconfig',
      ['egcs_fc_transferpaymentstreamchartofaccount', 'egcs_fc_transferpaymentstream'],
      'Transfer_Payment_Stream_Chart_of_Account',
      ['id', 'egcs_tp_transferpaymentstream'],
      constraint => constraint.onDelete('restrict')
    )
    .execute()

  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_resolve_commitment_line_scope() RETURNS trigger AS $$
    BEGIN
      SELECT commitment."egcs_fc_fundingagreement", agreement."egcs_fc_transferpaymentstream"
      INTO NEW."egcs_fc_fundingagreement", NEW."egcs_fc_transferpaymentstream"
      FROM "Funding_Case_Agreement_Commitment" commitment
      JOIN "Funding_Case_Agreement_Profile" agreement
        ON agreement."id" = commitment."egcs_fc_fundingagreement"
      WHERE commitment."id" = NEW."egcs_fc_commitment";
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_resolve_commitment_line_scope
    BEFORE INSERT OR UPDATE OF egcs_fc_commitment, egcs_fc_fundingagreement, egcs_fc_transferpaymentstream
    ON "Funding_Case_Agreement_Commitment_Line"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_resolve_commitment_line_scope();
  `.execute(db)

  await sql`
    CREATE UNIQUE INDEX ${sql.raw(INDEX_NAMES.commitmentLineUnique)}
    ON "Funding_Case_Agreement_Commitment_Line" (
      "egcs_fc_commitment",
      "egcs_fc_commitmentlinenumber",
      "egcs_fc_transferpaymentstreamchartofaccount"
    )
    WHERE "_deleted" = false
  `.execute(db)

  await sql`
    CREATE OR REPLACE FUNCTION fc_enforce_commitment_program_funding_total(
      target_agreement_id bigint,
      target_commitment_id bigint DEFAULT NULL
    ) RETURNS void AS $$
    DECLARE
      program_funding_total numeric;
      violating_commitment_id bigint;
    BEGIN
      SELECT COALESCE(SUM(line_item."egcs_fc_programfunding"), 0)
      INTO program_funding_total
      FROM "Funding_Case_Agreement_Budget_Line_Item" line_item
      INNER JOIN "Funding_Case_Agreement_Budget_Fiscal_Year" budget_year
        ON budget_year."id" = line_item."egcs_fc_fundingagreementbudgetfiscalyear"
      INNER JOIN "Funding_Case_Agreement_Budget_Version" budget_version
        ON budget_version."id" = budget_year."egcs_fc_budgetversion"
        AND budget_version."egcs_fc_fundingagreement" = budget_year."egcs_fc_fundingagreement"
      WHERE budget_year."egcs_fc_fundingagreement" = target_agreement_id
        AND line_item."_deleted" = false
        AND budget_year."_deleted" = false
        AND budget_version."egcs_fc_iscurrent" = true
        AND budget_version."_deleted" = false;

      SELECT commitment_totals."commitment_id"
      INTO violating_commitment_id
      FROM (
        SELECT
          commitment."id" AS "commitment_id",
          COALESCE(SUM(commitment_line."egcs_fc_amount"), 0) AS "commitment_total"
        FROM "Funding_Case_Agreement_Commitment" commitment
        INNER JOIN "Funding_Case_Agreement_Commitment_Line" commitment_line
          ON commitment_line."egcs_fc_commitment" = commitment."id"
        WHERE commitment."egcs_fc_fundingagreement" = target_agreement_id
          AND (target_commitment_id IS NULL OR commitment."id" = target_commitment_id)
          AND commitment."_deleted" = false
          AND commitment_line."_deleted" = false
        GROUP BY commitment."id"
      ) commitment_totals
      WHERE commitment_totals."commitment_total" > program_funding_total
      LIMIT 1;

      IF violating_commitment_id IS NOT NULL THEN
        RAISE EXCEPTION 'Agreement commitment % exceeds program funding total for agreement %', violating_commitment_id, target_agreement_id
          USING ERRCODE = '23514', CONSTRAINT = 'fc_chk_commitmenttotalprogramfunding';
      END IF;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db)

  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_enforce_commitment_line_program_funding_total() RETURNS trigger AS $$
    DECLARE
      target_agreement_id bigint;
      target_commitment_id bigint;
    BEGIN
      target_commitment_id := NEW."egcs_fc_commitment";

      SELECT "egcs_fc_fundingagreement"
      INTO target_agreement_id
      FROM "Funding_Case_Agreement_Commitment"
      WHERE "id" = target_commitment_id
        AND "_deleted" = false;

      IF target_agreement_id IS NOT NULL THEN
        PERFORM fc_enforce_commitment_program_funding_total(target_agreement_id, target_commitment_id);
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db)

  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_enforce_budget_line_commitment_program_funding_total() RETURNS trigger AS $$
    DECLARE
      target_agreement_id bigint;
      old_agreement_id bigint;
    BEGIN
      SELECT "egcs_fc_fundingagreement"
      INTO target_agreement_id
      FROM "Funding_Case_Agreement_Budget_Fiscal_Year"
      WHERE "id" = NEW."egcs_fc_fundingagreementbudgetfiscalyear";

      IF TG_OP = 'UPDATE' THEN
        SELECT "egcs_fc_fundingagreement"
        INTO old_agreement_id
        FROM "Funding_Case_Agreement_Budget_Fiscal_Year"
        WHERE "id" = OLD."egcs_fc_fundingagreementbudgetfiscalyear";
      END IF;

      IF target_agreement_id IS NOT NULL THEN
        PERFORM fc_enforce_commitment_program_funding_total(target_agreement_id, NULL);
      END IF;

      IF old_agreement_id IS NOT NULL AND old_agreement_id IS DISTINCT FROM target_agreement_id THEN
        PERFORM fc_enforce_commitment_program_funding_total(old_agreement_id, NULL);
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db)

  await sql`DROP TRIGGER IF EXISTS trg_enforce_commitment_line_program_funding_total ON "Funding_Case_Agreement_Commitment_Line"`.execute(db)
  await sql`
    CREATE CONSTRAINT TRIGGER trg_enforce_commitment_line_program_funding_total
    AFTER INSERT OR UPDATE
    ON "Funding_Case_Agreement_Commitment_Line"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_commitment_line_program_funding_total();
  `.execute(db)

  await sql`DROP TRIGGER IF EXISTS trg_enforce_budget_line_commitment_program_funding_total ON "Funding_Case_Agreement_Budget_Line_Item"`.execute(db)
  await sql`
    CREATE CONSTRAINT TRIGGER trg_enforce_budget_line_commitment_program_funding_total
    AFTER INSERT OR UPDATE
    ON "Funding_Case_Agreement_Budget_Line_Item"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_budget_line_commitment_program_funding_total();
  `.execute(db)

  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_enforce_budget_version_commitment_program_funding_total() RETURNS trigger AS $$
    BEGIN
      PERFORM fc_enforce_commitment_program_funding_total(NEW."egcs_fc_fundingagreement", NULL);
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db)

  await sql`DROP TRIGGER IF EXISTS trg_enforce_budget_version_commitment_program_funding_total ON "Funding_Case_Agreement_Budget_Version"`.execute(db)
  await sql`
    CREATE CONSTRAINT TRIGGER trg_enforce_budget_version_commitment_program_funding_total
    AFTER UPDATE
    ON "Funding_Case_Agreement_Budget_Version"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    WHEN (COALESCE(NEW."egcs_fc_iscurrent", false) OR COALESCE(OLD."egcs_fc_iscurrent", false))
    EXECUTE FUNCTION trg_fn_enforce_budget_version_commitment_program_funding_total();
  `.execute(db)

  await db.schema
    .createTable('Funding_Case_Agreement_Payment')
    .addColumn('id', 'bigint', col =>
      col.primaryKey().notNull().references('Common_Entity.id').onDelete('restrict')
    )
    .addColumn('egcs_fc_fundingagreementcommitment', 'bigint', col =>
      col.notNull().references('Funding_Case_Agreement_Commitment.id').onDelete('restrict')
    )
    .addColumn('egcs_fc_fundingagreement', 'bigint', col => col.notNull())
    .addColumn('egcs_fc_fiscalyear', 'bigint', col =>
      col.notNull().references('Funding_Case_Agreement_Budget_Fiscal_Year.id').onDelete('restrict')
    )
    .addColumn('egcs_fc_paymenttype', sql`Payment_Type`, col => col.notNull())
    .addColumn('egcs_fc_periodstart', 'smallint', col => col.notNull())
    .addColumn('egcs_fc_periodend', 'smallint', col => col.notNull())
    .addColumn('egcs_fc_paymentamount', 'numeric(19, 2)', col => col.notNull())
    .addColumn('egcs_fc_currency', sql`currency_codes`, col => col.defaultTo('cad').notNull())
    .addColumn('egcs_fc_comment', 'text')
    .addColumn('egcs_fc_status', 'bigint', col => col.notNull().references('Common_Status.id').onDelete('restrict'))
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .addCheckConstraint('fc_chk_paymentperiodstart', sql`"egcs_fc_periodstart" BETWEEN 0 AND 11`)
    .addCheckConstraint('fc_chk_paymentperiodend', sql`"egcs_fc_periodend" BETWEEN 0 AND 11`)
    .addCheckConstraint('fc_chk_paymentperiodrange', sql`"egcs_fc_periodend" >= "egcs_fc_periodstart"`)
    .addCheckConstraint('fc_chk_paymentamountpositive', sql`"egcs_fc_paymentamount" > 0`)
    .addUniqueConstraint('fc_unq_paymentidcommitment', ['id', 'egcs_fc_fundingagreementcommitment'])
    .addForeignKeyConstraint(
      'fc_ref_paymentcommitmentagreement',
      ['egcs_fc_fundingagreementcommitment', 'egcs_fc_fundingagreement'],
      'Funding_Case_Agreement_Commitment',
      ['id', 'egcs_fc_fundingagreement'],
      constraint => constraint.onDelete('restrict')
    )
    .addForeignKeyConstraint(
      'fc_ref_paymentfiscalyearagreement',
      ['egcs_fc_fiscalyear', 'egcs_fc_fundingagreement'],
      'Funding_Case_Agreement_Budget_Fiscal_Year',
      ['id', 'egcs_fc_fundingagreement'],
      constraint => constraint.onDelete('restrict')
    )
    .execute()

  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_resolve_payment_agreement() RETURNS trigger AS $$
    BEGIN
      SELECT "egcs_fc_fundingagreement" INTO NEW."egcs_fc_fundingagreement"
      FROM "Funding_Case_Agreement_Commitment"
      WHERE "id" = NEW."egcs_fc_fundingagreementcommitment";
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_resolve_payment_agreement
    BEFORE INSERT OR UPDATE OF egcs_fc_fundingagreementcommitment, egcs_fc_fundingagreement
    ON "Funding_Case_Agreement_Payment"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_resolve_payment_agreement();
  `.execute(db)

  await sql`
    CREATE INDEX ${sql.raw(INDEX_NAMES.paymentCommitmentFiscalYear)}
    ON "Funding_Case_Agreement_Payment" (
      "egcs_fc_fundingagreementcommitment",
      "egcs_fc_fiscalyear"
    )
    WHERE "_deleted" = false
  `.execute(db)

  await sql`DROP TRIGGER IF EXISTS trg_register_fundingcasepayment ON "Funding_Case_Agreement_Payment"`.execute(db)
  await sql`
    CREATE TRIGGER trg_register_fundingcasepayment
    BEFORE INSERT ON "Funding_Case_Agreement_Payment"
    FOR EACH ROW EXECUTE FUNCTION register_entity('fundingcasepayment');
  `.execute(db)

  await db.schema
    .createTable('Funding_Case_Agreement_Payment_Line')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_fc_fundingagreementpayment', 'bigint', col =>
      col.notNull().references('Funding_Case_Agreement_Payment.id').onDelete('restrict')
    )
    .addColumn('egcs_fc_fundingagreementcommitment', 'bigint', col => col.notNull())
    .addColumn('egcs_fc_fundingagreementcommitmentline', 'bigint', col =>
      col.notNull().references('Funding_Case_Agreement_Commitment_Line.id').onDelete('restrict')
    )
    .addColumn('egcs_fc_amount', 'numeric(19, 2)', col => col.notNull())
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .addCheckConstraint('fc_chk_paymentlineamountpositive', sql`"egcs_fc_amount" > 0`)
    .addForeignKeyConstraint(
      'fc_ref_paymentlinepaymentcommitment',
      ['egcs_fc_fundingagreementpayment', 'egcs_fc_fundingagreementcommitment'],
      'Funding_Case_Agreement_Payment',
      ['id', 'egcs_fc_fundingagreementcommitment'],
      constraint => constraint.onDelete('restrict')
    )
    .addForeignKeyConstraint(
      'fc_ref_paymentlinecommitmentline',
      ['egcs_fc_fundingagreementcommitmentline', 'egcs_fc_fundingagreementcommitment'],
      'Funding_Case_Agreement_Commitment_Line',
      ['id', 'egcs_fc_commitment'],
      constraint => constraint.onDelete('restrict')
    )
    .execute()

  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_resolve_payment_line_commitment() RETURNS trigger AS $$
    BEGIN
      SELECT "egcs_fc_fundingagreementcommitment"
      INTO NEW."egcs_fc_fundingagreementcommitment"
      FROM "Funding_Case_Agreement_Payment"
      WHERE "id" = NEW."egcs_fc_fundingagreementpayment";
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_resolve_payment_line_commitment
    BEFORE INSERT OR UPDATE OF egcs_fc_fundingagreementpayment, egcs_fc_fundingagreementcommitment
    ON "Funding_Case_Agreement_Payment_Line"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_resolve_payment_line_commitment();
  `.execute(db)

  await sql`
    CREATE UNIQUE INDEX ${sql.raw(INDEX_NAMES.paymentLinePaymentCommitmentLine)}
    ON "Funding_Case_Agreement_Payment_Line" (
      "egcs_fc_fundingagreementpayment",
      "egcs_fc_fundingagreementcommitmentline"
    )
    WHERE "_deleted" = false
  `.execute(db)

  await sql`
    CREATE INDEX ${sql.raw(INDEX_NAMES.paymentLineCommitmentLine)}
    ON "Funding_Case_Agreement_Payment_Line" (
      "egcs_fc_fundingagreementcommitmentline"
    )
    WHERE "_deleted" = false
  `.execute(db)

  await db.schema
    .createTable('Funding_Case_Agreement_Address')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_fc_fundingagreement', 'bigint', col =>
      col.notNull().references('Funding_Case_Agreement_Profile.id').onDelete('restrict')
    )
    .addColumn('egcs_fc_addresstype', 'bigint', col =>
      col.notNull().references('Agency_Address_Type.id').onDelete('restrict')
    )
    .addColumn('egcs_fc_address', 'bigint', col =>
      col.notNull().references('Common_Address.id').onDelete('restrict')
    )
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .execute()

  await sql`
    CREATE INDEX ${sql.raw(INDEX_NAMES.addressAgreementAddress)}
    ON "Funding_Case_Agreement_Address" (
      "egcs_fc_fundingagreement",
      "egcs_fc_address"
    )
    WHERE "_deleted" = false
  `.execute(db)

  await db.schema
    .createTable('Funding_Case_Agreement_Activity')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_fc_fundingagreement', 'bigint', col =>
      col.notNull().references('Funding_Case_Agreement_Profile.id').onDelete('restrict')
    )
    .addColumn('egcs_fc_activityversion', 'bigint', col => col.notNull())
    .addColumn('egcs_fc_description_en', 'text', col => col.notNull())
    .addColumn('egcs_fc_description_fr', 'text', col => col.notNull())
    .addColumn('egcs_fc_startdate', 'date', col => col.notNull())
    .addColumn('egcs_fc_enddate', 'date', col => col.notNull())
    .addColumn('egcs_fc_expectedresults_en', 'text', col => col.notNull())
    .addColumn('egcs_fc_expectedresults_fr', 'text', col => col.notNull())
    .addColumn('egcs_fc_name_en', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_fc_name_fr', 'varchar(255)', col => col.notNull())
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .addCheckConstraint(
      'fc_chk_activitydaterange',
      sql`"egcs_fc_enddate" >= "egcs_fc_startdate"`
    )
    .addForeignKeyConstraint(
      'fc_ref_activityversionagreement',
      ['egcs_fc_activityversion', 'egcs_fc_fundingagreement'],
      'Funding_Case_Agreement_Activity_Version',
      ['id', 'egcs_fc_fundingagreement'],
      constraint => constraint.onDelete('restrict')
    )
    .execute()

  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_resolve_current_activity_version()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $function$
    BEGIN
      IF NEW.egcs_fc_activityversion IS NULL THEN
        SELECT id INTO NEW.egcs_fc_activityversion
        FROM "Funding_Case_Agreement_Activity_Version"
        WHERE egcs_fc_fundingagreement = NEW.egcs_fc_fundingagreement
          AND egcs_fc_iscurrent = true
          AND _deleted = false;
      END IF;
      RETURN NEW;
    END
    $function$
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_resolve_current_activity_version
    BEFORE INSERT ON "Funding_Case_Agreement_Activity"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_resolve_current_activity_version()
  `.execute(db)

  await sql`
    CREATE INDEX ${sql.raw(INDEX_NAMES.activityAgreement)}
    ON "Funding_Case_Agreement_Activity" (
      "egcs_fc_activityversion",
      "egcs_fc_fundingagreement"
    )
    WHERE "_deleted" = false
  `.execute(db)

  await db.schema
    .createTable('Funding_Case_Agreement_Outcome_Activity')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_fc_outcomes', 'bigint', col =>
      col.notNull().references('Transfer_Payment_Outcome.id').onDelete('restrict')
    )
    .addColumn('egcs_fc_activity', 'bigint', col =>
      col.notNull().references('Funding_Case_Agreement_Activity.id').onDelete('restrict')
    )
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .execute()

  await sql`
    CREATE UNIQUE INDEX ${sql.raw(INDEX_NAMES.outcomeActivityOutcomeActivity)}
    ON "Funding_Case_Agreement_Outcome_Activity" (
      "egcs_fc_outcomes",
      "egcs_fc_activity"
    )
    WHERE "_deleted" = false
  `.execute(db)

  await db.schema
    .createTable('Funding_Case_Agreement_Responsible_Party_Activity')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_fc_responsibleparty', 'bigint', col =>
      col.notNull().references('Funding_Case_Agreement_Applicant_Recipient.id').onDelete('restrict')
    )
    .addColumn('egcs_fc_activity', 'bigint', col =>
      col.notNull().references('Funding_Case_Agreement_Activity.id').onDelete('restrict')
    )
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .execute()

  await sql`
    CREATE UNIQUE INDEX ${sql.raw(INDEX_NAMES.responsiblePartyActivityActivityResponsibleParty)}
    ON "Funding_Case_Agreement_Responsible_Party_Activity" (
      "egcs_fc_activity",
      "egcs_fc_responsibleparty"
    )
    WHERE "_deleted" = false
  `.execute(db)

  await db.schema
    .createTable('Funding_Case_Agreement_Monitor')
    .addColumn('id', 'bigint', col =>
      col.primaryKey().notNull().references('Common_Entity.id').onDelete('restrict')
    )
    .addColumn('egcs_fc_fundingagreement', 'bigint', col =>
      col.notNull().references('Funding_Case_Agreement_Profile.id').onDelete('restrict')
    )
    .addColumn('egcs_fc_type', 'bigint', col =>
      col.notNull().references('Transfer_Payment_Monitor_Type.id').onDelete('restrict')
    )
    .addColumn('egcs_fc_onsite', 'boolean', col => col.notNull())
    .addColumn('egcs_fc_tentativefiscalyear', 'bigint', col =>
      col.notNull().references('Agency_Fiscal_Year.id').onDelete('restrict')
    )
    .addColumn('egcs_fc_tentativequarter', 'smallint', col => col.notNull())
    .addColumn('egcs_fc_status', 'bigint', col => col.notNull().references('Common_Status.id').onDelete('restrict'))
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .addCheckConstraint('fc_chk_monitorquarter', sql`"egcs_fc_tentativequarter" BETWEEN 1 AND 4`)
    .execute()

  await sql`
    CREATE INDEX ${sql.raw(INDEX_NAMES.monitorAgreement)}
    ON "Funding_Case_Agreement_Monitor" (
      "egcs_fc_fundingagreement"
    )
    WHERE "_deleted" = false
  `.execute(db)

  await sql`DROP TRIGGER IF EXISTS trg_register_fundingcasemonitor ON "Funding_Case_Agreement_Monitor"`.execute(db)
  await sql`
    CREATE TRIGGER trg_register_fundingcasemonitor
    BEFORE INSERT ON "Funding_Case_Agreement_Monitor"
    FOR EACH ROW EXECUTE FUNCTION register_entity('fundingcasemonitor');
  `.execute(db)

  await db.schema
    .createTable('Funding_Case_Agreement_Monitor_Planning')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_fc_fundingagreementmonitor', 'bigint', col =>
      col.notNull().references('Funding_Case_Agreement_Monitor.id').onDelete('restrict')
    )
    .addColumn('egcs_fc_objective', 'text', col => col.notNull())
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .execute()

  await sql`
    CREATE INDEX ${sql.raw(INDEX_NAMES.monitorPlanningMonitor)}
    ON "Funding_Case_Agreement_Monitor_Planning" (
      "egcs_fc_fundingagreementmonitor"
    )
    WHERE "_deleted" = false
  `.execute(db)

  await db.schema
    .createTable('Funding_Case_Agreement_Monitor_Items')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_fc_fundingagreementmonitor', 'bigint', col =>
      col.notNull().references('Funding_Case_Agreement_Monitor.id').onDelete('restrict')
    )
    .addColumn('egcs_fc_item', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_fc_plannedstart', 'date', col => col.notNull())
    .addColumn('egcs_fc_plannedend', 'date', col => col.notNull())
    .addColumn('egcs_fc_detail', 'text', col => col.notNull())
    .addColumn('egcs_fc_monitored', 'boolean', col => col.notNull())
    .addColumn('egcs_fc_actualstart', 'date')
    .addColumn('egcs_fc_actualend', 'date')
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .addCheckConstraint('fc_chk_monitoritemplannedrange', sql`"egcs_fc_plannedend" >= "egcs_fc_plannedstart"`)
    .addCheckConstraint(
      'fc_chk_monitoritemactualrange',
      sql`"egcs_fc_actualstart" IS NULL OR "egcs_fc_actualend" IS NULL OR "egcs_fc_actualend" >= "egcs_fc_actualstart"`
    )
    .execute()

  await sql`
    CREATE INDEX ${sql.raw(INDEX_NAMES.monitorItemsMonitor)}
    ON "Funding_Case_Agreement_Monitor_Items" (
      "egcs_fc_fundingagreementmonitor"
    )
    WHERE "_deleted" = false
  `.execute(db)

  await db.schema
    .createTable('Funding_Case_Agreement_Monitor_Finding')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_fc_fundingagreementmonitor', 'bigint', col =>
      col.notNull().references('Funding_Case_Agreement_Monitor.id').onDelete('restrict')
    )
    .addColumn('egcs_fc_findingname', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_fc_recommendationtype', sql`"Monitor_Action_Type"`, col => col.notNull())
    .addColumn('egcs_fc_responsibleparty', sql`"Monitor_Responsible_Party"`, col => col.notNull())
    .addColumn('egcs_fc_detail', 'text', col => col.notNull())
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .execute()

  await sql`
    CREATE INDEX ${sql.raw(INDEX_NAMES.monitorFindingMonitor)}
    ON "Funding_Case_Agreement_Monitor_Finding" (
      "egcs_fc_fundingagreementmonitor"
    )
    WHERE "_deleted" = false
  `.execute(db)

  await db.schema
    .createTable('Funding_Case_Agreement_Monitor_Followup')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_fc_fundingagreementmonitor', 'bigint', col =>
      col.notNull().references('Funding_Case_Agreement_Monitor.id').onDelete('restrict')
    )
    .addColumn('egcs_fc_followupname', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_fc_responsibleparty', sql`"Monitor_Responsible_Party"`, col => col.notNull())
    .addColumn('egcs_fc_status', sql`Follow_Up_Status`, col => col.notNull())
    .addColumn('egcs_fc_duedate', 'date', col => col.notNull())
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .execute()

  await sql`
    CREATE INDEX ${sql.raw(INDEX_NAMES.monitorFollowupMonitor)}
    ON "Funding_Case_Agreement_Monitor_Followup" (
      "egcs_fc_fundingagreementmonitor"
    )
    WHERE "_deleted" = false
  `.execute(db)

  await db.schema
    .createTable('Funding_Case_Agreement_Monitor_Followup_Update')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_fc_fundingagreementmonitorfollowup', 'bigint', col =>
      col.notNull().references('Funding_Case_Agreement_Monitor_Followup.id').onDelete('restrict')
    )
    .addColumn('egcs_fc_update', 'text', col => col.notNull())
    .addColumn('egcs_fc_status', sql`Follow_Up_Status`, col => col.notNull())
    .addColumn('egcs_fc_updatedate', 'date', col => col.notNull())
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .execute()

  await sql`
    CREATE INDEX ${sql.raw(INDEX_NAMES.monitorFollowupUpdateFollowup)}
    ON "Funding_Case_Agreement_Monitor_Followup_Update" (
      "egcs_fc_fundingagreementmonitorfollowup"
    )
    WHERE "_deleted" = false
  `.execute(db)

  await db.schema
    .createTable('Funding_Case_Agreement_Monitor_Promising_Practice')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_fc_fundingagreementmonitor', 'bigint', col =>
      col.notNull().references('Funding_Case_Agreement_Monitor.id').onDelete('restrict')
    )
    .addColumn('egcs_fc_practice', 'text', col => col.notNull())
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .execute()

  await sql`
    CREATE INDEX ${sql.raw(INDEX_NAMES.monitorPromisingPracticeMonitor)}
    ON "Funding_Case_Agreement_Monitor_Promising_Practice" (
      "egcs_fc_fundingagreementmonitor"
    )
    WHERE "_deleted" = false
  `.execute(db)

  await sql`
    CREATE TABLE IF NOT EXISTS "Funding_Case_Agreement_Generated_Document" (
      id bigserial PRIMARY KEY,
      egcs_fc_fundingagreement bigint NOT NULL REFERENCES "Funding_Case_Agreement_Profile"(id) ON DELETE RESTRICT,
      egcs_fc_closeout bigint,
      egcs_fc_documenttemplate bigint NOT NULL REFERENCES "Transfer_Payment_Stream_Document_Template"(id) ON DELETE RESTRICT,
      egcs_fc_generatedattachment bigint NOT NULL REFERENCES "Common_Attachment"(id) ON DELETE RESTRICT,
      egcs_fc_language "Language_Preference" NOT NULL,
      egcs_fc_name_en varchar(255) NOT NULL,
      egcs_fc_name_fr varchar(255) NOT NULL,
      egcs_fc_outputformat varchar(16) NOT NULL,
      egcs_fc_generatedat timestamptz NOT NULL,
      _deleted boolean NOT NULL DEFAULT false,
      CONSTRAINT fc_chk_generateddocument_output CHECK (egcs_fc_outputformat IN ('docx', 'html', 'pdf')),
      CONSTRAINT fc_ref_generateddocumentcloseoutagreement FOREIGN KEY (egcs_fc_closeout, egcs_fc_fundingagreement)
        REFERENCES "Funding_Case_Agreement_Closeout"(id, egcs_fc_fundingagreement) ON DELETE RESTRICT
    )
  `.execute(db)
  await sql`
    CREATE INDEX ${sql.raw(INDEX_NAMES.generatedDocumentAgreement)}
    ON "Funding_Case_Agreement_Generated_Document" (
      egcs_fc_fundingagreement,
      egcs_fc_generatedat DESC,
      id
    )
    WHERE _deleted = false
  `.execute(db)

  await sql`
    CREATE TABLE "Funding_Case_Agreement_Closeout_Snapshot" (
      id bigserial PRIMARY KEY,
      egcs_fc_fundingagreement bigint NOT NULL REFERENCES "Funding_Case_Agreement_Profile"(id) ON DELETE RESTRICT,
      egcs_fc_closeout bigint NOT NULL,
      egcs_fc_workflowrun bigint NOT NULL UNIQUE REFERENCES "Common_Workflow_Run"(id) ON DELETE RESTRICT,
      egcs_fc_snapshotschemaversion integer NOT NULL,
      egcs_fc_packet jsonb NOT NULL,
      egcs_fc_canonicalhash varchar(64) NOT NULL,
      egcs_fc_capturedat timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT fc_chk_closeoutsnapshotversion CHECK (egcs_fc_snapshotschemaversion = 1),
      CONSTRAINT fc_chk_closeoutsnapshothash CHECK (egcs_fc_canonicalhash ~ '^[0-9a-f]{64}$'),
      CONSTRAINT fc_ref_closeoutsnapshotcloseoutagreement FOREIGN KEY (egcs_fc_closeout, egcs_fc_fundingagreement)
        REFERENCES "Funding_Case_Agreement_Closeout"(id, egcs_fc_fundingagreement) ON DELETE RESTRICT
    )
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_validate_agreement_closeout_snapshot() RETURNS trigger AS $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM "Common_Workflow_Run" workflow_run
        JOIN "Common_Runtime" runtime ON runtime.id = workflow_run.id
        WHERE workflow_run.id = NEW.egcs_fc_workflowrun
          AND runtime.egcs_cn_kind = 'workflow'
          AND runtime.egcs_cn_entitytype = 'fundingcaseagreementcloseout'
          AND runtime.egcs_cn_entityid = NEW.egcs_fc_closeout
          AND runtime.egcs_cn_purpose = 'approval_submission'
          AND runtime._deleted = false
      ) THEN RAISE EXCEPTION 'Closeout snapshot target and workflow run mismatch'; END IF;
      RETURN NEW;
    END; $$ LANGUAGE plpgsql
  `.execute(db)
  await sql`CREATE TRIGGER trg_validate_agreement_closeout_snapshot BEFORE INSERT ON "Funding_Case_Agreement_Closeout_Snapshot" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_agreement_closeout_snapshot()`.execute(db)
  await sql`CREATE OR REPLACE FUNCTION trg_fn_immutable_agreement_closeout_snapshot() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'Agreement closeout snapshots are immutable'; END; $$ LANGUAGE plpgsql`.execute(db)
  await sql`CREATE TRIGGER trg_immutable_agreement_closeout_snapshot BEFORE UPDATE OR DELETE ON "Funding_Case_Agreement_Closeout_Snapshot" FOR EACH ROW EXECUTE FUNCTION trg_fn_immutable_agreement_closeout_snapshot()`.execute(db)

  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_validate_funding_status_agency() RETURNS trigger AS $$
    DECLARE
      resolved_agency bigint;
      previous_agency bigint;
      status_agency bigint;
      status_is_draft boolean;
    BEGIN
      CASE
        WHEN TG_TABLE_NAME = 'Funding_Case_Agreement_Profile' THEN
          SELECT profile.egcs_tp_agency INTO resolved_agency
          FROM "Transfer_Payment_Stream" stream
          JOIN "Transfer_Payment_Profile" profile
            ON profile.id = stream.egcs_tp_transferpaymentprofile
          WHERE stream.id = NEW.egcs_fc_transferpaymentstream;
        WHEN TG_TABLE_NAME IN (
          'Funding_Case_Agreement_Amendment',
          'Funding_Case_Agreement_Closeout',
          'Funding_Case_Agreement_Forecast',
          'Funding_Case_Agreement_Claim',
          'Funding_Case_Agreement_Commitment',
          'Funding_Case_Agreement_Monitor'
        ) THEN
          SELECT profile.egcs_tp_agency INTO resolved_agency
          FROM "Funding_Case_Agreement_Profile" agreement
          JOIN "Transfer_Payment_Stream" stream
            ON stream.id = agreement.egcs_fc_transferpaymentstream
          JOIN "Transfer_Payment_Profile" profile
            ON profile.id = stream.egcs_tp_transferpaymentprofile
          WHERE agreement.id = NEW.egcs_fc_fundingagreement;
        WHEN TG_TABLE_NAME = 'Funding_Case_Agreement_Claim_Reconcile' THEN
          SELECT profile.egcs_tp_agency INTO resolved_agency
          FROM "Funding_Case_Agreement_Claim" claim
          JOIN "Funding_Case_Agreement_Profile" agreement
            ON agreement.id = claim.egcs_fc_fundingagreement
          JOIN "Transfer_Payment_Stream" stream
            ON stream.id = agreement.egcs_fc_transferpaymentstream
          JOIN "Transfer_Payment_Profile" profile
            ON profile.id = stream.egcs_tp_transferpaymentprofile
          WHERE claim.id = NEW.egcs_fc_fundingagreementclaim;
        WHEN TG_TABLE_NAME = 'Funding_Case_Agreement_Payment' THEN
          SELECT profile.egcs_tp_agency INTO resolved_agency
          FROM "Funding_Case_Agreement_Commitment" commitment
          JOIN "Funding_Case_Agreement_Profile" agreement
            ON agreement.id = commitment.egcs_fc_fundingagreement
          JOIN "Transfer_Payment_Stream" stream
            ON stream.id = agreement.egcs_fc_transferpaymentstream
          JOIN "Transfer_Payment_Profile" profile
            ON profile.id = stream.egcs_tp_transferpaymentprofile
          WHERE commitment.id = NEW.egcs_fc_fundingagreementcommitment;
        ELSE
          RAISE EXCEPTION 'Unsupported funding status carrier %', TG_TABLE_NAME
            USING ERRCODE = '23514', CONSTRAINT = 'fc_ref_statusagency';
      END CASE;

      IF TG_OP = 'UPDATE' THEN
        CASE
          WHEN TG_TABLE_NAME = 'Funding_Case_Agreement_Profile' THEN
            SELECT profile.egcs_tp_agency INTO previous_agency
            FROM "Transfer_Payment_Stream" stream
            JOIN "Transfer_Payment_Profile" profile
              ON profile.id = stream.egcs_tp_transferpaymentprofile
            WHERE stream.id = OLD.egcs_fc_transferpaymentstream;
          WHEN TG_TABLE_NAME IN (
            'Funding_Case_Agreement_Amendment',
            'Funding_Case_Agreement_Closeout',
            'Funding_Case_Agreement_Forecast',
            'Funding_Case_Agreement_Claim',
            'Funding_Case_Agreement_Commitment',
            'Funding_Case_Agreement_Monitor'
          ) THEN
            SELECT profile.egcs_tp_agency INTO previous_agency
            FROM "Funding_Case_Agreement_Profile" agreement
            JOIN "Transfer_Payment_Stream" stream
              ON stream.id = agreement.egcs_fc_transferpaymentstream
            JOIN "Transfer_Payment_Profile" profile
              ON profile.id = stream.egcs_tp_transferpaymentprofile
            WHERE agreement.id = OLD.egcs_fc_fundingagreement;
          WHEN TG_TABLE_NAME = 'Funding_Case_Agreement_Claim_Reconcile' THEN
            SELECT profile.egcs_tp_agency INTO previous_agency
            FROM "Funding_Case_Agreement_Claim" claim
            JOIN "Funding_Case_Agreement_Profile" agreement
              ON agreement.id = claim.egcs_fc_fundingagreement
            JOIN "Transfer_Payment_Stream" stream
              ON stream.id = agreement.egcs_fc_transferpaymentstream
            JOIN "Transfer_Payment_Profile" profile
              ON profile.id = stream.egcs_tp_transferpaymentprofile
            WHERE claim.id = OLD.egcs_fc_fundingagreementclaim;
          WHEN TG_TABLE_NAME = 'Funding_Case_Agreement_Payment' THEN
            SELECT profile.egcs_tp_agency INTO previous_agency
            FROM "Funding_Case_Agreement_Commitment" commitment
            JOIN "Funding_Case_Agreement_Profile" agreement
              ON agreement.id = commitment.egcs_fc_fundingagreement
            JOIN "Transfer_Payment_Stream" stream
              ON stream.id = agreement.egcs_fc_transferpaymentstream
            JOIN "Transfer_Payment_Profile" profile
              ON profile.id = stream.egcs_tp_transferpaymentprofile
            WHERE commitment.id = OLD.egcs_fc_fundingagreementcommitment;
          ELSE
            RAISE EXCEPTION 'Unsupported funding status carrier %', TG_TABLE_NAME
              USING ERRCODE = '23514', CONSTRAINT = 'fc_ref_statusagency';
        END CASE;

        IF previous_agency IS NULL OR previous_agency IS DISTINCT FROM resolved_agency THEN
          RAISE EXCEPTION 'Funding Agency ownership is immutable'
            USING ERRCODE = '23514', CONSTRAINT = 'fc_ref_statusagency';
        END IF;
      END IF;

      IF resolved_agency IS NULL THEN
        RAISE EXCEPTION 'Funding status Agency could not be resolved'
          USING ERRCODE = '23514', CONSTRAINT = 'fc_ref_statusagency';
      END IF;

      SELECT egcs_cn_agency, egcs_cn_isdraft
      INTO status_agency, status_is_draft
      FROM "Common_Status"
      WHERE id = NEW.egcs_fc_status
        AND _deleted = false
      FOR UPDATE;

      IF status_agency IS NULL OR status_agency <> resolved_agency THEN
        RAISE EXCEPTION 'Funding status does not belong to the resolved Agency'
          USING ERRCODE = '23514', CONSTRAINT = 'fc_ref_statusagency';
      END IF;

      IF TG_OP = 'INSERT' AND NOT status_is_draft THEN
        RAISE EXCEPTION 'New funding records must start with the Agency Draft status'
          USING ERRCODE = '23514', CONSTRAINT = 'fc_chk_initialdraftstatus';
      END IF;

      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)

  const statusCarrierTables = [
    ['Funding_Case_Agreement_Profile', 'fundingcaseagreement'],
    ['Funding_Case_Agreement_Amendment', 'fundingcaseamendment'],
    ['Funding_Case_Agreement_Closeout', 'fundingcaseagreementcloseout'],
    ['Funding_Case_Agreement_Forecast', 'fundingcaseforecast'],
    ['Funding_Case_Agreement_Claim', 'fundingcaseagreementclaim'],
    ['Funding_Case_Agreement_Claim_Reconcile', 'fundingclaimreconcile'],
    ['Funding_Case_Agreement_Commitment', 'fundingcaseagreementcommitment'],
    ['Funding_Case_Agreement_Payment', 'fundingcasepayment'],
    ['Funding_Case_Agreement_Monitor', 'fundingcasemonitor']
  ] as const
  for (const [table, triggerKey] of statusCarrierTables) {
    await createStatusAgencyConstraintTrigger(db, table, triggerKey)
  }

  const assignmentEntities = [
    ['Funding_Case_Agreement_Claim', 'fundingcaseagreementclaim', 'fundingcaseagreementclaim'],
    ['Funding_Case_Agreement_Claim_Reconcile', 'fundingclaimreconcile', 'fundingclaimreconcile'],
    ['Funding_Case_Agreement_Payment', 'fundingcasepayment', 'fundingcasepayment'],
    ['Funding_Case_Agreement_Forecast', 'fundingcaseforecast', 'fundingcaseforecast'],
    ['Funding_Case_Agreement_Monitor', 'fundingcasemonitor', 'fundingcasemonitor'],
    ['Funding_Case_Agreement_Amendment', 'fundingcaseamendment', 'fundingcaseamendment'],
    ['Funding_Case_Agreement_Commitment', 'fundingcaseagreementcommitment', 'fundingcaseagreementcommitment'],
    ['Funding_Case_Agreement_Closeout', 'fundingcaseagreementcloseout', 'fundingcaseagreementcloseout']
  ] as const
  for (const [table, entityType, triggerKey] of assignmentEntities) {
    await createAssignmentLifecycleTriggers(db, table, entityType, triggerKey)
  }
}

export const down = async (db: Kysely<Database>): Promise<void> => {
  await sql`DROP TRIGGER IF EXISTS trg_immutable_agreement_closeout_snapshot ON "Funding_Case_Agreement_Closeout_Snapshot"`.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_validate_agreement_closeout_snapshot ON "Funding_Case_Agreement_Closeout_Snapshot"`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_immutable_agreement_closeout_snapshot()`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_validate_agreement_closeout_snapshot()`.execute(db)
  await db.schema.dropTable('Funding_Case_Agreement_Closeout_Snapshot').execute()
  await db.schema.dropIndex(INDEX_NAMES.generatedDocumentAgreement).execute()
  await db.schema.dropTable('Funding_Case_Agreement_Generated_Document').execute()
  await db.schema.dropIndex(INDEX_NAMES.monitorPromisingPracticeMonitor).execute()
  await db.schema.dropTable('Funding_Case_Agreement_Monitor_Promising_Practice').execute()
  await db.schema.dropIndex(INDEX_NAMES.monitorFollowupUpdateFollowup).execute()
  await db.schema.dropTable('Funding_Case_Agreement_Monitor_Followup_Update').execute()
  await db.schema.dropIndex(INDEX_NAMES.monitorFollowupMonitor).execute()
  await db.schema.dropTable('Funding_Case_Agreement_Monitor_Followup').execute()
  await db.schema.dropIndex(INDEX_NAMES.monitorFindingMonitor).execute()
  await db.schema.dropTable('Funding_Case_Agreement_Monitor_Finding').execute()
  await db.schema.dropIndex(INDEX_NAMES.monitorItemsMonitor).execute()
  await db.schema.dropTable('Funding_Case_Agreement_Monitor_Items').execute()
  await db.schema.dropIndex(INDEX_NAMES.monitorPlanningMonitor).execute()
  await db.schema.dropTable('Funding_Case_Agreement_Monitor_Planning').execute()
  await sql`DROP TRIGGER IF EXISTS trg_register_fundingcasemonitor ON "Funding_Case_Agreement_Monitor"`.execute(db)
  await db.schema.dropIndex(INDEX_NAMES.monitorAgreement).execute()
  await db.schema.dropTable('Funding_Case_Agreement_Monitor').execute()
  await sql`DROP TRIGGER IF EXISTS trg_register_fundingcaseforecast ON "Funding_Case_Agreement_Forecast"`.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_register_fundingclaimreconcile ON "Funding_Case_Agreement_Claim_Reconcile"`.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_register_fundingcaseagreementcommitment ON "Funding_Case_Agreement_Commitment"`.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_register_fundingcasepayment ON "Funding_Case_Agreement_Payment"`.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_create_agreement_working_versions ON "Funding_Case_Agreement_Profile"`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_create_agreement_working_versions()`.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_register_fundingcaseagreement ON "Funding_Case_Agreement_Profile"`.execute(db)
  await db.schema.dropIndex(INDEX_NAMES.responsiblePartyActivityActivityResponsibleParty).execute()
  await db.schema.dropTable('Funding_Case_Agreement_Responsible_Party_Activity').execute()
  await db.schema.dropIndex(INDEX_NAMES.outcomeActivityOutcomeActivity).execute()
  await db.schema.dropTable('Funding_Case_Agreement_Outcome_Activity').execute()
  await sql`DROP TRIGGER IF EXISTS trg_resolve_current_activity_version ON "Funding_Case_Agreement_Activity"`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_resolve_current_activity_version()`.execute(db)
  await db.schema.dropIndex(INDEX_NAMES.activityAgreement).execute()
  await db.schema.dropTable('Funding_Case_Agreement_Activity').execute()
  await db.schema.dropIndex(INDEX_NAMES.addressAgreementAddress).execute()
  await db.schema.dropTable('Funding_Case_Agreement_Address').execute()
  await db.schema.dropIndex(INDEX_NAMES.paymentLineCommitmentLine).execute()
  await db.schema.dropIndex(INDEX_NAMES.paymentLinePaymentCommitmentLine).execute()
  await sql`DROP TRIGGER IF EXISTS trg_resolve_payment_line_commitment ON "Funding_Case_Agreement_Payment_Line"`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_resolve_payment_line_commitment()`.execute(db)
  await db.schema.dropTable('Funding_Case_Agreement_Payment_Line').execute()
  await db.schema.dropIndex(INDEX_NAMES.paymentCommitmentFiscalYear).execute()
  await sql`DROP TRIGGER IF EXISTS trg_resolve_payment_agreement ON "Funding_Case_Agreement_Payment"`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_resolve_payment_agreement()`.execute(db)
  await db.schema.dropTable('Funding_Case_Agreement_Payment').execute()
  await sql`DROP TRIGGER IF EXISTS trg_enforce_budget_version_commitment_program_funding_total ON "Funding_Case_Agreement_Budget_Version"`.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_enforce_budget_line_commitment_program_funding_total ON "Funding_Case_Agreement_Budget_Line_Item"`.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_enforce_commitment_line_program_funding_total ON "Funding_Case_Agreement_Commitment_Line"`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_enforce_budget_line_commitment_program_funding_total()`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_enforce_commitment_line_program_funding_total()`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_enforce_budget_version_commitment_program_funding_total()`.execute(db)
  await sql`DROP FUNCTION IF EXISTS fc_enforce_commitment_program_funding_total(bigint, bigint)`.execute(db)
  await db.schema.dropIndex(INDEX_NAMES.commitmentLineUnique).execute()
  await sql`DROP TRIGGER IF EXISTS trg_resolve_commitment_line_scope ON "Funding_Case_Agreement_Commitment_Line"`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_resolve_commitment_line_scope()`.execute(db)
  await db.schema.dropTable('Funding_Case_Agreement_Commitment_Line').execute()
  await db.schema.dropIndex(INDEX_NAMES.activeCommitmentAgreement).execute()
  await db.schema.dropIndex(INDEX_NAMES.commitmentAgreement).execute()
  await sql`DROP TRIGGER IF EXISTS trg_resolve_commitment_stream ON "Funding_Case_Agreement_Commitment"`.execute(db)
  await db.schema.dropTable('Funding_Case_Agreement_Commitment').execute()
  await sql`DROP FUNCTION IF EXISTS trg_fn_resolve_commitment_stream()`.execute(db)
  await db.schema.dropIndex(INDEX_NAMES.claimReconcileLineUnique).execute()
  await sql`DROP TRIGGER IF EXISTS trg_resolve_reconcile_line_claim ON "Funding_Case_Agreement_Claim_Reconcile_Line_Item"`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_resolve_reconcile_line_claim()`.execute(db)
  await db.schema.dropTable('Funding_Case_Agreement_Claim_Reconcile_Line_Item').execute()
  await db.schema.dropIndex(INDEX_NAMES.claimReconcileFinalUnique).execute()
  await db.schema.dropTable('Funding_Case_Agreement_Claim_Reconcile').execute()
  await db.schema.dropIndex(INDEX_NAMES.claimLineItem).execute()
  await sql`DROP TRIGGER IF EXISTS trg_resolve_claim_line_agreement ON "Funding_Case_Agreement_Claim_Line_Item"`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_resolve_claim_line_agreement()`.execute(db)
  await db.schema.dropTable('Funding_Case_Agreement_Claim_Line_Item').execute()
  await db.schema.dropIndex(INDEX_NAMES.claimAgreementFiscalYear).execute()
  await db.schema.dropTable('Funding_Case_Agreement_Claim').execute()
  await db.schema.dropIndex(INDEX_NAMES.forecastLineItem).execute()
  await sql`DROP TRIGGER IF EXISTS trg_resolve_forecast_line_agreement ON "Funding_Case_Agreement_Forecast_Line_Item"`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_resolve_forecast_line_agreement()`.execute(db)
  await db.schema.dropTable('Funding_Case_Agreement_Forecast_Line_Item').execute()
  await db.schema.dropIndex(INDEX_NAMES.activeForecastFiscalYearAgreement).execute()
  await db.schema.dropIndex(INDEX_NAMES.forecastFiscalYearAgreement).execute()
  await db.schema.dropTable('Funding_Case_Agreement_Forecast').execute()
  await sql`DROP TRIGGER IF EXISTS trg_enforce_budget_line_item_root ON "Funding_Case_Agreement_Budget_Line_Item"`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_enforce_budget_line_item_root()`.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_resolve_budget_line_item_identity ON "Funding_Case_Agreement_Budget_Line_Item"`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_resolve_budget_line_item_identity()`.execute(db)
  await db.schema.dropIndex('fc_idx_budgetlineitemversionidentity').execute()
  await db.schema.dropIndex(INDEX_NAMES.budgetLineItemAgreementBudgetFiscalYearCostCategory).execute()
  await db.schema.dropTable('Funding_Case_Agreement_Budget_Line_Item').execute()
  await sql`DROP TRIGGER IF EXISTS trg_enforce_budget_fiscal_year_root ON "Funding_Case_Agreement_Budget_Fiscal_Year"`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_enforce_budget_fiscal_year_root()`.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_resolve_current_budget_version ON "Funding_Case_Agreement_Budget_Fiscal_Year"`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_resolve_current_budget_version()`.execute(db)
  await db.schema.dropIndex(INDEX_NAMES.budgetFiscalYearVersionIdentity).execute()
  await db.schema.dropIndex(INDEX_NAMES.budgetFiscalYearAgreementFiscalYear).execute()
  await db.schema.dropTable('Funding_Case_Agreement_Budget_Fiscal_Year').execute()
  await db.schema.dropIndex(INDEX_NAMES.amendmentActivityVersion).execute()
  await db.schema.dropIndex(INDEX_NAMES.currentActivityVersion).execute()
  await sql`DROP TRIGGER IF EXISTS trg_validate_agreement_revision ON "Funding_Case_Agreement_Revision"`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_validate_agreement_revision()`.execute(db)
  await db.schema.dropIndex('fc_idx_revisionapprovalsubmission').execute()
  await db.schema.dropIndex('fc_idx_revisionamendment').execute()
  await db.schema.dropIndex('fc_idx_revisionagreementnumber').execute()
  await db.schema.dropTable('Funding_Case_Agreement_Revision').execute()
  await sql`DROP TRIGGER IF EXISTS trg_immutable_agreement_approval_submission ON "Funding_Case_Agreement_Approval_Submission"`.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_validate_agreement_approval_submission ON "Funding_Case_Agreement_Approval_Submission"`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_immutable_agreement_approval_submission()`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_validate_agreement_approval_submission()`.execute(db)
  await db.schema.dropTable('Funding_Case_Agreement_Approval_Submission').execute()
  await db.schema.dropTable('Funding_Case_Agreement_Activity_Version').execute()
  await db.schema.dropIndex(INDEX_NAMES.amendmentBudgetVersion).execute()
  await db.schema.dropIndex(INDEX_NAMES.currentBudgetVersion).execute()
  await db.schema.dropTable('Funding_Case_Agreement_Budget_Version').execute()
  await sql`DROP TRIGGER IF EXISTS trg_enforce_amendment_type_stream_scope ON "Funding_Case_Agreement_Amendment_Type"`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_enforce_amendment_type_stream_scope()`.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_enforce_agreement_amendment_subtype_scope ON "Funding_Case_Agreement_Amendment_Subtype"`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_enforce_agreement_amendment_subtype_scope()`.execute(db)
  await db.schema.dropIndex(INDEX_NAMES.amendmentSubtype).execute()
  await db.schema.dropTable('Funding_Case_Agreement_Amendment_Subtype').execute()
  await db.schema.dropIndex(INDEX_NAMES.amendmentType).execute()
  await db.schema.dropTable('Funding_Case_Agreement_Amendment_Type').execute()
  await sql`DROP TRIGGER IF EXISTS trg_register_fundingcaseamendment ON "Funding_Case_Agreement_Amendment"`.execute(db)
  await db.schema.dropIndex(INDEX_NAMES.openAmendment).execute()
  await db.schema.dropIndex(INDEX_NAMES.amendmentNumber).execute()
  await db.schema.dropTable('Funding_Case_Agreement_Amendment').execute()
  await sql`DROP TRIGGER IF EXISTS trg_register_fundingcaseagreementcloseout ON "Funding_Case_Agreement_Closeout"`.execute(db)
  await db.schema.dropIndex(INDEX_NAMES.openCloseout).execute()
  await db.schema.dropIndex(INDEX_NAMES.closeoutNumber).execute()
  await db.schema.dropTable('Funding_Case_Agreement_Closeout').execute()
  await db.schema.dropIndex('fc_idx_applicantrecipientapplicantrecipientfundingagreement').execute()
  await db.schema.dropTable('Funding_Case_Agreement_Applicant_Recipient').execute()
  await db.schema.alterTable('Transfer_Payment_Stream_Chart_of_Account').dropConstraint('fc_unq_chartofaccountidstream').execute()
  await db.schema.dropIndex(INDEX_NAMES.profileStreamAgreementNumber).execute()
  await db.schema.dropTable('Funding_Case_Agreement_Profile').execute()
  await sql`DROP FUNCTION IF EXISTS trg_fn_validate_funding_status_agency()`.execute(db)
}
