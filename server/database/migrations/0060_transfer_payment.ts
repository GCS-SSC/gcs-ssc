import { sql, type Kysely } from 'kysely'
import type { Database } from '../../../shared/types/database'

// Clean-cutover baseline: transfer payment. Edit this subject directly.

/** Installs the current up definitions for this subject on a fresh database. */
export const up = async (db: Kysely<Database>): Promise<void> => {
  await sql`DO $baseline$ BEGIN
CREATE SEQUENCE "Transfer_Payment_Agreement_Subtype_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Transfer_Payment_Amendment_Subtype_Type_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Transfer_Payment_Amendment_Subtype_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Transfer_Payment_Amendment_Type_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Transfer_Payment_Financial_Limits_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Transfer_Payment_Fiscal_Year_Budget_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Transfer_Payment_Monitor_Type_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Transfer_Payment_Objective_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Transfer_Payment_Outcome_Performance_Indicator_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Transfer_Payment_Outcome_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Transfer_Payment_Profile_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Transfer_Payment_Stream_Area_of_Expertise_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Transfer_Payment_Stream_Budget_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Transfer_Payment_Stream_Chart_of_Account_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Transfer_Payment_Stream_Commitment_Type_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Transfer_Payment_Stream_Cost_Category_Line_Item_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Transfer_Payment_Stream_Document_Template_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Transfer_Payment_Stream_Eligible_Recipient_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Transfer_Payment_Stream_Field_Assignment_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Transfer_Payment_Stream_Field_Section_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Transfer_Payment_Stream_Funding_Subtype_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Transfer_Payment_Stream_Holdback_Basis_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Transfer_Payment_Stream_Outcome_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Transfer_Payment_Stream_Review_Set_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Transfer_Payment_Stream_Risk_Rating_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Transfer_Payment_Stream_Workflow_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE TABLE "Transfer_Payment_Agreement_Subtype" (
  "id" bigint DEFAULT nextval('"Transfer_Payment_Agreement_Subtype_id_seq"'::regclass) NOT NULL,
  "egcs_tp_agreementtype" bigint NOT NULL,
  "egcs_tp_transferpaymentstream" bigint NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Transfer_Payment_Agreement_Subtype_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX tp_idx_agreementsubtypeidtransferpaymentstream ON "Transfer_Payment_Agreement_Subtype" USING btree (id, egcs_tp_transferpaymentstream);

CREATE UNIQUE INDEX tp_idx_agreementsubtypetransferpaymentstreamagreementtype ON "Transfer_Payment_Agreement_Subtype" USING btree (egcs_tp_transferpaymentstream, egcs_tp_agreementtype) WHERE (_deleted = false);

CREATE TABLE "Transfer_Payment_Amendment_Subtype" (
  "id" bigint DEFAULT nextval('"Transfer_Payment_Amendment_Subtype_id_seq"'::regclass) NOT NULL,
  "egcs_tp_name_en" character varying(255) NOT NULL,
  "egcs_tp_name_fr" character varying(255) NOT NULL,
  "egcs_tp_description_en" text NOT NULL,
  "egcs_tp_description_fr" text NOT NULL,
  "egcs_tp_transferpaymentstream" bigint NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Transfer_Payment_Amendment_Subtype_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX tp_idx_amendmentsubtypetransferpaymentstreamnameen ON "Transfer_Payment_Amendment_Subtype" USING btree (egcs_tp_transferpaymentstream, lower(btrim((egcs_tp_name_en)::text)), lower(btrim((egcs_tp_name_fr)::text))) WHERE (_deleted = false);

CREATE INDEX tp_idx_amendmentsubtypetransferpaymentstreamnamefr ON "Transfer_Payment_Amendment_Subtype" USING btree (egcs_tp_transferpaymentstream, lower(btrim((egcs_tp_name_fr)::text))) WHERE (_deleted = false);

CREATE TABLE "Transfer_Payment_Amendment_Subtype_Type" (
  "id" bigint DEFAULT nextval('"Transfer_Payment_Amendment_Subtype_Type_id_seq"'::regclass) NOT NULL,
  "egcs_tp_amendmentsubtype" bigint NOT NULL,
  "egcs_tp_amendmenttype" bigint NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Transfer_Payment_Amendment_Subtype_Type_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX tp_idx_amendmentsubtypetype ON "Transfer_Payment_Amendment_Subtype_Type" USING btree (egcs_tp_amendmentsubtype, egcs_tp_amendmenttype) WHERE (_deleted = false);

CREATE TABLE "Transfer_Payment_Amendment_Type" (
  "id" bigint DEFAULT nextval('"Transfer_Payment_Amendment_Type_id_seq"'::regclass) NOT NULL,
  "egcs_tp_amended" amended_type NOT NULL,
  "egcs_tp_name_en" character varying(255) NOT NULL,
  "egcs_tp_name_fr" character varying(255) NOT NULL,
  "egcs_tp_requiresamendmentsubtype" boolean DEFAULT false NOT NULL,
  "egcs_tp_transferpaymentstream" bigint NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Transfer_Payment_Amendment_Type_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX tp_idx_amendmenttypetransferpaymentstreamnameen ON "Transfer_Payment_Amendment_Type" USING btree (egcs_tp_transferpaymentstream, egcs_tp_amended, lower(btrim((egcs_tp_name_en)::text)), lower(btrim((egcs_tp_name_fr)::text))) WHERE (_deleted = false);

CREATE INDEX tp_idx_amendmenttypetransferpaymentstreamnamefr ON "Transfer_Payment_Amendment_Type" USING btree (egcs_tp_transferpaymentstream, lower(btrim((egcs_tp_name_fr)::text))) WHERE (_deleted = false);

CREATE TABLE "Transfer_Payment_Financial_Limits" (
  "id" bigint DEFAULT nextval('"Transfer_Payment_Financial_Limits_id_seq"'::regclass) NOT NULL,
  "egcs_tp_transferpaymentstream" bigint NOT NULL,
  "egcs_tp_maxallowableperrecipient" numeric(19,2) NOT NULL,
  "egcs_tp_maxpercentofsupportavailableperrecipient" numeric(5,2) NOT NULL,
  "egcs_tp_maxpercentofretroactivecostsallowable" numeric(5,2) NOT NULL,
  "egcs_tp_stackinglimit" numeric(5,2) NOT NULL,
  "egcs_tp_active" boolean DEFAULT false NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Transfer_Payment_Financial_Limits_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX tp_idx_financiallimitstransferpaymentstreamstatus ON "Transfer_Payment_Financial_Limits" USING btree (egcs_tp_transferpaymentstream, egcs_tp_active) WHERE (_deleted = false);

CREATE TABLE "Transfer_Payment_Fiscal_Year_Budget" (
  "id" bigint DEFAULT nextval('"Transfer_Payment_Fiscal_Year_Budget_id_seq"'::regclass) NOT NULL,
  "egcs_tp_transferpaymentprofile" bigint NOT NULL,
  "egcs_tp_fiscalyear" bigint NOT NULL,
  "egcs_tp_totalbudget" numeric(19,2) NOT NULL,
  "egcs_tp_currency" currency_codes DEFAULT 'cad'::currency_codes NOT NULL,
  "egcs_tp_overcommitthreshold" numeric(5,2) NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Transfer_Payment_Fiscal_Year_Budget_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX tp_idx_fiscalyearbudgettransferpaymentprofilefiscalyear ON "Transfer_Payment_Fiscal_Year_Budget" USING btree (egcs_tp_transferpaymentprofile, egcs_tp_fiscalyear, egcs_tp_currency) WHERE (_deleted = false);

CREATE TABLE "Transfer_Payment_Monitor_Type" (
  "id" bigint DEFAULT nextval('"Transfer_Payment_Monitor_Type_id_seq"'::regclass) NOT NULL,
  "egcs_tp_agencymonitortype" bigint NOT NULL,
  "egcs_tp_transferpaymentstream" bigint NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "tp_uq_monitortypeidstream" UNIQUE (id, egcs_tp_transferpaymentstream),
  CONSTRAINT "Transfer_Payment_Monitor_Type_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX tp_idx_monitortypetransferpaymentstreamagencytype ON "Transfer_Payment_Monitor_Type" USING btree (egcs_tp_transferpaymentstream, egcs_tp_agencymonitortype) WHERE (_deleted = false);

CREATE TABLE "Transfer_Payment_Objective" (
  "id" bigint DEFAULT nextval('"Transfer_Payment_Objective_id_seq"'::regclass) NOT NULL,
  "egcs_tp_transferpaymentprofile" bigint NOT NULL,
  "egcs_tp_objective_en" text NOT NULL,
  "egcs_tp_objective_fr" text NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Transfer_Payment_Objective_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX tp_idx_objectivetransferpaymentprofileobjectiveen ON "Transfer_Payment_Objective" USING btree (egcs_tp_transferpaymentprofile, md5(lower(egcs_tp_objective_en))) WHERE (_deleted = false);

CREATE UNIQUE INDEX tp_idx_objectivetransferpaymentprofileobjectivefr ON "Transfer_Payment_Objective" USING btree (egcs_tp_transferpaymentprofile, md5(lower(egcs_tp_objective_fr))) WHERE (_deleted = false);

CREATE TABLE "Transfer_Payment_Outcome" (
  "id" bigint DEFAULT nextval('"Transfer_Payment_Outcome_id_seq"'::regclass) NOT NULL,
  "egcs_tp_transferpaymentprofile" bigint NOT NULL,
  "egcs_tp_name_en" character varying(255) NOT NULL,
  "egcs_tp_name_fr" character varying(255) NOT NULL,
  "egcs_tp_description_en" text NOT NULL,
  "egcs_tp_description_fr" text NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Transfer_Payment_Outcome_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX tp_idx_outcometransferpaymentprofilenameen ON "Transfer_Payment_Outcome" USING btree (egcs_tp_transferpaymentprofile, lower(btrim((egcs_tp_name_en)::text)), lower(btrim((egcs_tp_name_fr)::text))) WHERE (_deleted = false);

CREATE INDEX tp_idx_outcometransferpaymentprofilenamefr ON "Transfer_Payment_Outcome" USING btree (egcs_tp_transferpaymentprofile, lower(btrim((egcs_tp_name_fr)::text))) WHERE (_deleted = false);

CREATE TABLE "Transfer_Payment_Outcome_Performance_Indicator" (
  "id" bigint DEFAULT nextval('"Transfer_Payment_Outcome_Performance_Indicator_id_seq"'::regclass) NOT NULL,
  "egcs_tp_transferpaymentoutcome" bigint NOT NULL,
  "egcs_tp_name_en" character varying(255) NOT NULL,
  "egcs_tp_name_fr" character varying(255) NOT NULL,
  "egcs_tp_description_en" text NOT NULL,
  "egcs_tp_description_fr" text NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Transfer_Payment_Outcome_Performance_Indicator_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX tp_idx_outcomeperformanceindicatortransferpaymentoutcomenameen ON "Transfer_Payment_Outcome_Performance_Indicator" USING btree (egcs_tp_transferpaymentoutcome, egcs_tp_name_en) WHERE (_deleted = false);

CREATE UNIQUE INDEX tp_idx_outcomeperformanceindicatortransferpaymentoutcomenamefr ON "Transfer_Payment_Outcome_Performance_Indicator" USING btree (egcs_tp_transferpaymentoutcome, egcs_tp_name_fr) WHERE (_deleted = false);

CREATE TABLE "Transfer_Payment_Profile" (
  "id" bigint DEFAULT nextval('"Transfer_Payment_Profile_id_seq"'::regclass) NOT NULL,
  "egcs_tp_agency" bigint NOT NULL,
  "egcs_tp_datestart" date NOT NULL,
  "egcs_tp_dateend" date NOT NULL,
  "egcs_tp_name_en" character varying(255) NOT NULL,
  "egcs_tp_name_fr" character varying(255) NOT NULL,
  "egcs_tp_abbreviation_en" character varying(255) NOT NULL,
  "egcs_tp_abbreviation_fr" character varying(255) NOT NULL,
  "egcs_tp_description_en" text NOT NULL,
  "egcs_tp_description_fr" text NOT NULL,
  "egcs_tp_purpose_en" text NOT NULL,
  "egcs_tp_purpose_fr" text NOT NULL,
  "egcs_tp_tclink_en" character varying(2000) NOT NULL,
  "egcs_tp_tclink_fr" character varying(2000) NOT NULL,
  "egcs_tp_active" boolean DEFAULT false NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Transfer_Payment_Profile_pkey" PRIMARY KEY (id),
  CONSTRAINT "tp_chk_profiledatestartdateend" CHECK ((egcs_tp_dateend >= egcs_tp_datestart))
);

CREATE UNIQUE INDEX tp_idx_profileagencynameennamefrstatus ON "Transfer_Payment_Profile" USING btree (egcs_tp_agency, egcs_tp_name_en, egcs_tp_name_fr, egcs_tp_active) WHERE ((_deleted = false) AND (egcs_tp_active = true));

CREATE INDEX tp_idx_profilenameen ON "Transfer_Payment_Profile" USING btree (egcs_tp_name_en) WHERE ((_deleted = false) AND (egcs_tp_active = true));

CREATE INDEX tp_idx_profilenamefr ON "Transfer_Payment_Profile" USING btree (egcs_tp_name_fr) WHERE ((_deleted = false) AND (egcs_tp_active = true));

CREATE TABLE "Transfer_Payment_Stream" (
  "id" bigint NOT NULL,
  "egcs_tp_transferpaymentprofile" bigint NOT NULL,
  "egcs_tp_parentstream" bigint,
  "egcs_tp_name_en" character varying(255) NOT NULL,
  "egcs_tp_name_fr" character varying(255) NOT NULL,
  "egcs_tp_description_en" text NOT NULL,
  "egcs_tp_description_fr" text NOT NULL,
  "egcs_tp_abbreviation_en" character varying(255) NOT NULL,
  "egcs_tp_abbreviation_fr" character varying(255) NOT NULL,
  "egcs_tp_objective_en" text NOT NULL,
  "egcs_tp_objective_fr" text NOT NULL,
  "egcs_tp_allowsfurtherdistribution" boolean DEFAULT false NOT NULL,
  "egcs_tp_requireconsistentproponenttype" boolean DEFAULT false NOT NULL,
  "egcs_tp_active" boolean DEFAULT false NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  "egcs_tp_requireforecastfundingbreakdown" boolean DEFAULT false NOT NULL,
  "egcs_tp_requireclaimfundingbreakdown" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Transfer_Payment_Stream_pkey" PRIMARY KEY (id)
);

CREATE INDEX tp_idx_streamnameen ON "Transfer_Payment_Stream" USING btree (egcs_tp_name_en) WHERE ((_deleted = false) AND (egcs_tp_active = true));

CREATE INDEX tp_idx_streamnamefr ON "Transfer_Payment_Stream" USING btree (egcs_tp_name_fr) WHERE ((_deleted = false) AND (egcs_tp_active = true));

CREATE UNIQUE INDEX tp_idx_streamtransferpaymentprofilenameennamefrstatus ON "Transfer_Payment_Stream" USING btree (egcs_tp_transferpaymentprofile, egcs_tp_name_en, egcs_tp_name_fr, egcs_tp_active) WHERE ((_deleted = false) AND (egcs_tp_active = true));

CREATE TABLE "Transfer_Payment_Stream_Area_of_Expertise" (
  "id" bigint DEFAULT nextval('"Transfer_Payment_Stream_Area_of_Expertise_id_seq"'::regclass) NOT NULL,
  "egcs_tp_name_en" character varying(255) NOT NULL,
  "egcs_tp_name_fr" character varying(255) NOT NULL,
  "egcs_tp_description_en" text NOT NULL,
  "egcs_tp_description_fr" text NOT NULL,
  "egcs_tp_transferpaymentstream" bigint NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Transfer_Payment_Stream_Area_of_Expertise_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX tp_idx_streamareaofexpertisetransferpaymentstreamnameen ON "Transfer_Payment_Stream_Area_of_Expertise" USING btree (egcs_tp_transferpaymentstream, lower(btrim((egcs_tp_name_en)::text)), lower(btrim((egcs_tp_name_fr)::text))) WHERE (_deleted = false);

CREATE INDEX tp_idx_streamareaofexpertisetransferpaymentstreamnamefr ON "Transfer_Payment_Stream_Area_of_Expertise" USING btree (egcs_tp_transferpaymentstream, lower(btrim((egcs_tp_name_fr)::text))) WHERE (_deleted = false);

CREATE TABLE "Transfer_Payment_Stream_Budget" (
  "id" bigint DEFAULT nextval('"Transfer_Payment_Stream_Budget_id_seq"'::regclass) NOT NULL,
  "egcs_tp_transferpaymentstream" bigint NOT NULL,
  "egcs_tp_totalbudget" numeric(19,2) NOT NULL,
  "egcs_tp_transferpaymentbudget" bigint NOT NULL,
  "egcs_tp_overcommitthreshold" numeric(5,2) NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "tp_uq_streambudgetidstream" UNIQUE (id, egcs_tp_transferpaymentstream),
  CONSTRAINT "Transfer_Payment_Stream_Budget_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX tp_idx_streambudgettransferpaymentstreamtransferpaymentbudget ON "Transfer_Payment_Stream_Budget" USING btree (egcs_tp_transferpaymentstream, egcs_tp_transferpaymentbudget) WHERE (_deleted = false);

CREATE TABLE "Transfer_Payment_Stream_Chart_of_Account" (
  "id" bigint DEFAULT nextval('"Transfer_Payment_Stream_Chart_of_Account_id_seq"'::regclass) NOT NULL,
  "egcs_tp_agencychartofaccount" bigint NOT NULL,
  "egcs_tp_transferpaymentstream" bigint NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "fc_unq_chartofaccountidstream" UNIQUE (id, egcs_tp_transferpaymentstream),
  CONSTRAINT "Transfer_Payment_Stream_Chart_of_Account_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX tp_idx_uniquechartofaccount ON "Transfer_Payment_Stream_Chart_of_Account" USING btree (egcs_tp_transferpaymentstream, egcs_tp_agencychartofaccount) WHERE (_deleted = false);

CREATE TABLE "Transfer_Payment_Stream_Commitment_Type" (
  "id" bigint DEFAULT nextval('"Transfer_Payment_Stream_Commitment_Type_id_seq"'::regclass) NOT NULL,
  "egcs_tp_agencycommitmenttype" bigint NOT NULL,
  "egcs_tp_transferpaymentstream" bigint NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "tp_unq_commitmenttypeidstream" UNIQUE (id, egcs_tp_transferpaymentstream),
  CONSTRAINT "Transfer_Payment_Stream_Commitment_Type_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX tp_idx_commitmenttypetransferpaymentstreamagencytype ON "Transfer_Payment_Stream_Commitment_Type" USING btree (egcs_tp_transferpaymentstream, egcs_tp_agencycommitmenttype) WHERE (_deleted = false);

CREATE TABLE "Transfer_Payment_Stream_Cost_Category_Line_Item" (
  "id" bigint DEFAULT nextval('"Transfer_Payment_Stream_Cost_Category_Line_Item_id_seq"'::regclass) NOT NULL,
  "egcs_tp_transferpaymentstream" bigint NOT NULL,
  "egcs_tp_organizationcostcategory" bigint NOT NULL,
  "egcs_tp_costsharingratio" numeric(5,2) NOT NULL,
  "egcs_tp_active" boolean DEFAULT true NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Transfer_Payment_Stream_Cost_Category_Line_Item_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX tp_idx_uniqueastreamcostcatline ON "Transfer_Payment_Stream_Cost_Category_Line_Item" USING btree (egcs_tp_transferpaymentstream, egcs_tp_organizationcostcategory) WHERE (_deleted = false);

CREATE TABLE "Transfer_Payment_Stream_Document_Template" (
  "id" bigint DEFAULT nextval('"Transfer_Payment_Stream_Document_Template_id_seq"'::regclass) NOT NULL,
  "egcs_tp_transferpaymentstream" bigint NOT NULL,
  "egcs_tp_agencydocumenttemplate" bigint NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "tp_uq_streamdocumenttemplateidstream" UNIQUE (id, egcs_tp_transferpaymentstream),
  CONSTRAINT "Transfer_Payment_Stream_Document_Template_pkey" PRIMARY KEY (id)
);

CREATE INDEX tp_idx_streamdocumenttemplate_entity ON "Transfer_Payment_Stream_Document_Template" USING btree (egcs_tp_transferpaymentstream, egcs_tp_agencydocumenttemplate, id) WHERE (_deleted = false);

CREATE UNIQUE INDEX tp_idx_streamdocumenttemplate_unique ON "Transfer_Payment_Stream_Document_Template" USING btree (egcs_tp_transferpaymentstream, egcs_tp_agencydocumenttemplate) WHERE (_deleted = false);

CREATE TABLE "Transfer_Payment_Stream_Eligible_Recipient" (
  "id" bigint DEFAULT nextval('"Transfer_Payment_Stream_Eligible_Recipient_id_seq"'::regclass) NOT NULL,
  "egcs_tp_transferpaymentstream" bigint NOT NULL,
  "egcs_tp_applicantrecipientsubtype" bigint NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Transfer_Payment_Stream_Eligible_Recipient_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX tp_idx_uniquestreameligiblerecipient ON "Transfer_Payment_Stream_Eligible_Recipient" USING btree (egcs_tp_transferpaymentstream, egcs_tp_applicantrecipientsubtype) WHERE (_deleted = false);

CREATE TABLE "Transfer_Payment_Stream_Field_Assignment" (
  "id" bigint DEFAULT nextval('"Transfer_Payment_Stream_Field_Assignment_id_seq"'::regclass) NOT NULL,
  "egcs_tp_transferpaymentstream" bigint NOT NULL,
  "egcs_tp_agencyfield" bigint NOT NULL,
  "egcs_tp_section" bigint,
  "egcs_tp_required" boolean DEFAULT false NOT NULL,
  "egcs_tp_active" boolean DEFAULT true NOT NULL,
  "egcs_tp_displayorder" integer DEFAULT 0 NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Transfer_Payment_Stream_Field_Assignment_pkey" PRIMARY KEY (id),
  CONSTRAINT "Transfer_Payment_Stream_Field_Assign_egcs_tp_displayorder_check" CHECK ((egcs_tp_displayorder >= 0))
);

CREATE UNIQUE INDEX tp_idx_unique_live_field_assignment ON "Transfer_Payment_Stream_Field_Assignment" USING btree (egcs_tp_transferpaymentstream, egcs_tp_agencyfield) WHERE (_deleted = false);

CREATE TABLE "Transfer_Payment_Stream_Field_Section" (
  "id" bigint DEFAULT nextval('"Transfer_Payment_Stream_Field_Section_id_seq"'::regclass) NOT NULL,
  "egcs_tp_transferpaymentstream" bigint NOT NULL,
  "egcs_tp_name_en" text NOT NULL,
  "egcs_tp_name_fr" text NOT NULL,
  "egcs_tp_displayorder" integer DEFAULT 0 NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Transfer_Payment_Stream_Field_id_egcs_tp_transferpaymentstr_key" UNIQUE (id, egcs_tp_transferpaymentstream),
  CONSTRAINT "Transfer_Payment_Stream_Field_Section_pkey" PRIMARY KEY (id),
  CONSTRAINT "Transfer_Payment_Stream_Field_Sectio_egcs_tp_displayorder_check" CHECK ((egcs_tp_displayorder >= 0))
);

CREATE TABLE "Transfer_Payment_Stream_Funding_Subtype" (
  "id" bigint DEFAULT nextval('"Transfer_Payment_Stream_Funding_Subtype_id_seq"'::regclass) NOT NULL,
  "egcs_tp_transferpaymentstream" bigint NOT NULL,
  "egcs_tp_fundingsubtype" bigint NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Transfer_Payment_Stream_Funding_Subtype_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX tp_uq_stream_funding_subtype_active ON "Transfer_Payment_Stream_Funding_Subtype" USING btree (egcs_tp_transferpaymentstream, egcs_tp_fundingsubtype) WHERE (_deleted = false);

CREATE TABLE "Transfer_Payment_Stream_Holdback_Basis" (
  "id" bigint DEFAULT nextval('"Transfer_Payment_Stream_Holdback_Basis_id_seq"'::regclass) NOT NULL,
  "egcs_tp_transferpaymentstream" bigint NOT NULL,
  "egcs_tp_agencyholdback" bigint NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "tp_uq_holdbackbasisidstream" UNIQUE (id, egcs_tp_transferpaymentstream),
  CONSTRAINT "Transfer_Payment_Stream_Holdback_Basis_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX tp_idx_streamholdbackbasisstreamagencybasis ON "Transfer_Payment_Stream_Holdback_Basis" USING btree (egcs_tp_transferpaymentstream, egcs_tp_agencyholdback) WHERE (_deleted = false);

CREATE TABLE "Transfer_Payment_Stream_Outcome" (
  "id" bigint DEFAULT nextval('"Transfer_Payment_Stream_Outcome_id_seq"'::regclass) NOT NULL,
  "egcs_tp_transferpaymentstream" bigint NOT NULL,
  "egcs_tp_transferpaymentoutcome" bigint NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Transfer_Payment_Stream_Outcome_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX tp_idx_streamoutcometransferpaymentstreamtransferpaymentoutcome ON "Transfer_Payment_Stream_Outcome" USING btree (egcs_tp_transferpaymentstream, egcs_tp_transferpaymentoutcome) WHERE (_deleted = false);

CREATE TABLE "Transfer_Payment_Stream_Review_Set" (
  "id" bigint DEFAULT nextval('"Transfer_Payment_Stream_Review_Set_id_seq"'::regclass) NOT NULL,
  "egcs_tp_transferpaymentstream" bigint NOT NULL,
  "egcs_tp_reviewset" bigint NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Transfer_Payment_Stream_Review_Set_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX tp_idx_streamreviewset_livepair ON "Transfer_Payment_Stream_Review_Set" USING btree (egcs_tp_transferpaymentstream, egcs_tp_reviewset) WHERE (_deleted = false);

CREATE TABLE "Transfer_Payment_Stream_Risk_Rating" (
  "id" bigint DEFAULT nextval('"Transfer_Payment_Stream_Risk_Rating_id_seq"'::regclass) NOT NULL,
  "egcs_tp_transferpaymentstream" bigint NOT NULL,
  "egcs_tp_riskscore" numeric(8,2) NOT NULL,
  "egcs_tp_name_en" character varying(255) NOT NULL,
  "egcs_tp_name_fr" character varying(255) NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Transfer_Payment_Stream_Risk_Rating_pkey" PRIMARY KEY (id),
  CONSTRAINT "tp_chk_streamriskratingriskscore" CHECK ((egcs_tp_riskscore >= (0)::numeric))
);

CREATE UNIQUE INDEX tp_idx_streamriskratingtransferpaymentstreamnameen ON "Transfer_Payment_Stream_Risk_Rating" USING btree (egcs_tp_transferpaymentstream, egcs_tp_name_en) WHERE (_deleted = false);

CREATE UNIQUE INDEX tp_idx_streamriskratingtransferpaymentstreamnamefr ON "Transfer_Payment_Stream_Risk_Rating" USING btree (egcs_tp_transferpaymentstream, egcs_tp_name_fr) WHERE (_deleted = false);

CREATE UNIQUE INDEX tp_idx_streamriskratingtransferpaymentstreamriskscore ON "Transfer_Payment_Stream_Risk_Rating" USING btree (egcs_tp_transferpaymentstream, egcs_tp_riskscore) WHERE (_deleted = false);

CREATE TABLE "Transfer_Payment_Stream_Workflow" (
  "id" bigint DEFAULT nextval('"Transfer_Payment_Stream_Workflow_id_seq"'::regclass) NOT NULL,
  "egcs_tp_transferpaymentstream" bigint NOT NULL,
  "egcs_tp_workflow" bigint NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Transfer_Payment_Stream_Workflow_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX tp_idx_streamworkflow_livepair ON "Transfer_Payment_Stream_Workflow" USING btree (egcs_tp_transferpaymentstream, egcs_tp_workflow) WHERE (_deleted = false);

ALTER SEQUENCE "Transfer_Payment_Agreement_Subtype_id_seq" OWNED BY "Transfer_Payment_Agreement_Subtype"."id";

ALTER SEQUENCE "Transfer_Payment_Amendment_Subtype_Type_id_seq" OWNED BY "Transfer_Payment_Amendment_Subtype_Type"."id";

ALTER SEQUENCE "Transfer_Payment_Amendment_Subtype_id_seq" OWNED BY "Transfer_Payment_Amendment_Subtype"."id";

ALTER SEQUENCE "Transfer_Payment_Amendment_Type_id_seq" OWNED BY "Transfer_Payment_Amendment_Type"."id";

ALTER SEQUENCE "Transfer_Payment_Financial_Limits_id_seq" OWNED BY "Transfer_Payment_Financial_Limits"."id";

ALTER SEQUENCE "Transfer_Payment_Fiscal_Year_Budget_id_seq" OWNED BY "Transfer_Payment_Fiscal_Year_Budget"."id";

ALTER SEQUENCE "Transfer_Payment_Monitor_Type_id_seq" OWNED BY "Transfer_Payment_Monitor_Type"."id";

ALTER SEQUENCE "Transfer_Payment_Objective_id_seq" OWNED BY "Transfer_Payment_Objective"."id";

ALTER SEQUENCE "Transfer_Payment_Outcome_Performance_Indicator_id_seq" OWNED BY "Transfer_Payment_Outcome_Performance_Indicator"."id";

ALTER SEQUENCE "Transfer_Payment_Outcome_id_seq" OWNED BY "Transfer_Payment_Outcome"."id";

ALTER SEQUENCE "Transfer_Payment_Profile_id_seq" OWNED BY "Transfer_Payment_Profile"."id";

ALTER SEQUENCE "Transfer_Payment_Stream_Area_of_Expertise_id_seq" OWNED BY "Transfer_Payment_Stream_Area_of_Expertise"."id";

ALTER SEQUENCE "Transfer_Payment_Stream_Budget_id_seq" OWNED BY "Transfer_Payment_Stream_Budget"."id";

ALTER SEQUENCE "Transfer_Payment_Stream_Chart_of_Account_id_seq" OWNED BY "Transfer_Payment_Stream_Chart_of_Account"."id";

ALTER SEQUENCE "Transfer_Payment_Stream_Commitment_Type_id_seq" OWNED BY "Transfer_Payment_Stream_Commitment_Type"."id";

ALTER SEQUENCE "Transfer_Payment_Stream_Cost_Category_Line_Item_id_seq" OWNED BY "Transfer_Payment_Stream_Cost_Category_Line_Item"."id";

ALTER SEQUENCE "Transfer_Payment_Stream_Document_Template_id_seq" OWNED BY "Transfer_Payment_Stream_Document_Template"."id";

ALTER SEQUENCE "Transfer_Payment_Stream_Eligible_Recipient_id_seq" OWNED BY "Transfer_Payment_Stream_Eligible_Recipient"."id";

ALTER SEQUENCE "Transfer_Payment_Stream_Field_Assignment_id_seq" OWNED BY "Transfer_Payment_Stream_Field_Assignment"."id";

ALTER SEQUENCE "Transfer_Payment_Stream_Field_Section_id_seq" OWNED BY "Transfer_Payment_Stream_Field_Section"."id";

ALTER SEQUENCE "Transfer_Payment_Stream_Funding_Subtype_id_seq" OWNED BY "Transfer_Payment_Stream_Funding_Subtype"."id";

ALTER SEQUENCE "Transfer_Payment_Stream_Holdback_Basis_id_seq" OWNED BY "Transfer_Payment_Stream_Holdback_Basis"."id";

ALTER SEQUENCE "Transfer_Payment_Stream_Outcome_id_seq" OWNED BY "Transfer_Payment_Stream_Outcome"."id";

ALTER SEQUENCE "Transfer_Payment_Stream_Review_Set_id_seq" OWNED BY "Transfer_Payment_Stream_Review_Set"."id";

ALTER SEQUENCE "Transfer_Payment_Stream_Risk_Rating_id_seq" OWNED BY "Transfer_Payment_Stream_Risk_Rating"."id";

ALTER SEQUENCE "Transfer_Payment_Stream_Workflow_id_seq" OWNED BY "Transfer_Payment_Stream_Workflow"."id";
-- Unfinished children remain readable through inactive, non-deleted configuration owners.
CREATE INDEX tp_idx_profile_agency_live ON "Transfer_Payment_Profile" USING btree (egcs_tp_agency) WHERE (_deleted = false);
CREATE INDEX tp_idx_stream_profile_live ON "Transfer_Payment_Stream" USING btree (egcs_tp_transferpaymentprofile) WHERE (_deleted = false);
-- Palette matching uses only this source's own identity fields.
CREATE INDEX tp_profile_search_name_en_trgm ON "Transfer_Payment_Profile" USING gin (lower(coalesce(egcs_tp_name_en, '')) gin_trgm_ops) WHERE (_deleted = false AND egcs_tp_active = true);
CREATE INDEX tp_profile_search_name_en_prefix ON "Transfer_Payment_Profile" USING btree (lower(coalesce(egcs_tp_name_en, '')) text_pattern_ops) WHERE (_deleted = false AND egcs_tp_active = true);
CREATE INDEX tp_profile_search_name_fr_trgm ON "Transfer_Payment_Profile" USING gin (lower(coalesce(egcs_tp_name_fr, '')) gin_trgm_ops) WHERE (_deleted = false AND egcs_tp_active = true);
CREATE INDEX tp_profile_search_name_fr_prefix ON "Transfer_Payment_Profile" USING btree (lower(coalesce(egcs_tp_name_fr, '')) text_pattern_ops) WHERE (_deleted = false AND egcs_tp_active = true);
CREATE INDEX tp_profile_search_abbreviation_en_trgm ON "Transfer_Payment_Profile" USING gin (lower(coalesce(egcs_tp_abbreviation_en, '')) gin_trgm_ops) WHERE (_deleted = false AND egcs_tp_active = true);
CREATE INDEX tp_profile_search_abbreviation_fr_trgm ON "Transfer_Payment_Profile" USING gin (lower(coalesce(egcs_tp_abbreviation_fr, '')) gin_trgm_ops) WHERE (_deleted = false AND egcs_tp_active = true);
CREATE INDEX tp_profile_search_abbreviation_en_exact ON "Transfer_Payment_Profile" USING btree (lower(coalesce(egcs_tp_abbreviation_en, '')) text_pattern_ops) WHERE (_deleted = false AND egcs_tp_active = true);
CREATE INDEX tp_profile_search_abbreviation_fr_exact ON "Transfer_Payment_Profile" USING btree (lower(coalesce(egcs_tp_abbreviation_fr, '')) text_pattern_ops) WHERE (_deleted = false AND egcs_tp_active = true);
-- Palette matching uses only this source's own identity fields.
CREATE INDEX tp_stream_search_name_en_trgm ON "Transfer_Payment_Stream" USING gin (lower(coalesce(egcs_tp_name_en, '')) gin_trgm_ops) WHERE (_deleted = false AND egcs_tp_active = true);
CREATE INDEX tp_stream_search_name_en_prefix ON "Transfer_Payment_Stream" USING btree (lower(coalesce(egcs_tp_name_en, '')) text_pattern_ops) WHERE (_deleted = false AND egcs_tp_active = true);
CREATE INDEX tp_stream_search_name_fr_trgm ON "Transfer_Payment_Stream" USING gin (lower(coalesce(egcs_tp_name_fr, '')) gin_trgm_ops) WHERE (_deleted = false AND egcs_tp_active = true);
CREATE INDEX tp_stream_search_name_fr_prefix ON "Transfer_Payment_Stream" USING btree (lower(coalesce(egcs_tp_name_fr, '')) text_pattern_ops) WHERE (_deleted = false AND egcs_tp_active = true);
CREATE INDEX tp_stream_search_abbreviation_en_trgm ON "Transfer_Payment_Stream" USING gin (lower(coalesce(egcs_tp_abbreviation_en, '')) gin_trgm_ops) WHERE (_deleted = false AND egcs_tp_active = true);
CREATE INDEX tp_stream_search_abbreviation_fr_trgm ON "Transfer_Payment_Stream" USING gin (lower(coalesce(egcs_tp_abbreviation_fr, '')) gin_trgm_ops) WHERE (_deleted = false AND egcs_tp_active = true);
CREATE INDEX tp_stream_search_abbreviation_en_exact ON "Transfer_Payment_Stream" USING btree (lower(coalesce(egcs_tp_abbreviation_en, '')) text_pattern_ops) WHERE (_deleted = false AND egcs_tp_active = true);
CREATE INDEX tp_stream_search_abbreviation_fr_exact ON "Transfer_Payment_Stream" USING btree (lower(coalesce(egcs_tp_abbreviation_fr, '')) text_pattern_ops) WHERE (_deleted = false AND egcs_tp_active = true);
END $baseline$`.execute(db)
}

/** Installs the current installFunctions definitions for this subject on a fresh database. */
export const installFunctions = async (db: Kysely<Database>): Promise<void> => {
  await sql`DO $baseline$ BEGIN
CREATE FUNCTION guard_program_financial_id_agency()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      IF NEW.egcs_tp_agency IS DISTINCT FROM OLD.egcs_tp_agency AND EXISTS (
        SELECT 1 FROM "Funding_Case_Agreement_Applicant_Recipient" relationship
        JOIN "Funding_Case_Agreement_Profile" agreement ON agreement.id = relationship.egcs_fc_fundingagreement
        JOIN "Transfer_Payment_Stream" stream ON stream.id = agreement.egcs_fc_transferpaymentstream
        JOIN "Applicant_Recipient_Agency_Financial_Id" financial_id ON financial_id.id = relationship.egcs_fc_agencyfinancialid
        WHERE stream.egcs_tp_transferpaymentprofile = OLD.id AND NOT relationship._deleted
          AND NOT agreement._deleted AND financial_id.egcs_ar_agency IS DISTINCT FROM NEW.egcs_tp_agency
      ) THEN
        RAISE EXCEPTION 'Program agency must match retained Agreement financial IDs'
          USING ERRCODE = '23514', CONSTRAINT = 'agreement_financial_id_invalid';
      END IF;
      RETURN NEW;
    END $function$;

CREATE FUNCTION enforce_stream_field_assignment_agency()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE
      owning_agency bigint;
      field_agency bigint;
    BEGIN
      IF NEW._deleted AND TG_OP = 'UPDATE' THEN RETURN NEW; END IF;
      SELECT profile.egcs_tp_agency INTO owning_agency
      FROM "Transfer_Payment_Stream" stream
      JOIN "Transfer_Payment_Profile" profile ON profile.id = stream.egcs_tp_transferpaymentprofile
      WHERE stream.id = NEW.egcs_tp_transferpaymentstream AND stream._deleted = false AND profile._deleted = false
      FOR SHARE OF stream, profile;
      SELECT field.egcs_ay_agency INTO field_agency
      FROM "Agency_Custom_Field" field
      WHERE field.id = NEW.egcs_tp_agencyfield AND field._deleted = false
      FOR SHARE;
      IF owning_agency IS NULL OR field_agency IS NULL OR owning_agency <> field_agency THEN
        RAISE EXCEPTION 'Assigned field must belong to the Stream Agency'
          USING ERRCODE = '23514', CONSTRAINT = 'tp_chk_field_assignment_agency';
      END IF;
      RETURN NEW;
    END $function$;

CREATE FUNCTION protect_chart_program_budget()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      IF (NEW._deleted AND NOT OLD._deleted)
        OR NEW.egcs_tp_fiscalyear IS DISTINCT FROM OLD.egcs_tp_fiscalyear THEN
        IF EXISTS (
          SELECT 1 FROM "Transfer_Payment_Stream_Budget" stream_budget
          JOIN "Transfer_Payment_Stream_Chart_of_Account" linked
            ON linked.egcs_tp_transferpaymentstream = stream_budget.egcs_tp_transferpaymentstream
          JOIN "Agency_Chart_of_Account" chart
            ON chart.id = linked.egcs_tp_agencychartofaccount
          WHERE stream_budget.egcs_tp_transferpaymentbudget = OLD.id
            AND stream_budget._deleted = false AND linked._deleted = false
            AND chart._deleted = false AND chart.egcs_ay_fiscalyear = OLD.egcs_tp_fiscalyear
            AND NOT EXISTS (
              SELECT 1 FROM "Transfer_Payment_Stream_Budget" other
              JOIN "Transfer_Payment_Fiscal_Year_Budget" other_fiscal
                ON other_fiscal.id = other.egcs_tp_transferpaymentbudget
              WHERE other.egcs_tp_transferpaymentstream = stream_budget.egcs_tp_transferpaymentstream
                AND other.id <> stream_budget.id AND other._deleted = false
                AND other.egcs_tp_transferpaymentbudget <> OLD.id
                AND other_fiscal._deleted = false
                AND other_fiscal.egcs_tp_fiscalyear = OLD.egcs_tp_fiscalyear
            )
        ) THEN
          RAISE EXCEPTION 'Program Budget cannot change fiscal year or retire while a live Stream Chart depends on it'
            USING ERRCODE = '23514', CONSTRAINT = 'tp_chk_chartprogrambudgetretained';
        END IF;
      END IF;
      RETURN NEW;
    END $function$;

CREATE FUNCTION protect_chart_stream_budget()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE replacement_fiscalyear bigint;
    BEGIN
      IF (NEW._deleted AND NOT OLD._deleted)
        OR NEW.egcs_tp_transferpaymentbudget IS DISTINCT FROM OLD.egcs_tp_transferpaymentbudget
        OR NEW.egcs_tp_transferpaymentstream IS DISTINCT FROM OLD.egcs_tp_transferpaymentstream THEN
        PERFORM 1 FROM "Transfer_Payment_Stream" stream
        WHERE stream.id = OLD.egcs_tp_transferpaymentstream
        FOR UPDATE OF stream;
        IF NOT NEW._deleted
          AND NEW.egcs_tp_transferpaymentstream = OLD.egcs_tp_transferpaymentstream THEN
          SELECT fiscal_budget.egcs_tp_fiscalyear INTO replacement_fiscalyear
          FROM "Transfer_Payment_Fiscal_Year_Budget" fiscal_budget
          WHERE fiscal_budget.id = NEW.egcs_tp_transferpaymentbudget
            AND fiscal_budget._deleted = false
          FOR SHARE OF fiscal_budget;
        END IF;
        IF EXISTS (
          SELECT 1 FROM "Transfer_Payment_Stream_Chart_of_Account" linked
          JOIN "Agency_Chart_of_Account" chart ON chart.id = linked.egcs_tp_agencychartofaccount
          JOIN "Transfer_Payment_Fiscal_Year_Budget" fiscal_budget
            ON fiscal_budget.egcs_tp_fiscalyear = chart.egcs_ay_fiscalyear
          WHERE linked.egcs_tp_transferpaymentstream = OLD.egcs_tp_transferpaymentstream
            AND linked._deleted = false AND chart._deleted = false
            AND fiscal_budget.id = OLD.egcs_tp_transferpaymentbudget
            AND replacement_fiscalyear IS DISTINCT FROM chart.egcs_ay_fiscalyear
            AND NOT EXISTS (
              SELECT 1 FROM "Transfer_Payment_Stream_Budget" other
              JOIN "Transfer_Payment_Fiscal_Year_Budget" other_fiscal
                ON other_fiscal.id = other.egcs_tp_transferpaymentbudget
              WHERE other.egcs_tp_transferpaymentstream = OLD.egcs_tp_transferpaymentstream
                AND other.id <> OLD.id AND other._deleted = false
                AND other_fiscal._deleted = false
                AND other_fiscal.egcs_tp_fiscalyear = chart.egcs_ay_fiscalyear
            )
        ) THEN
          RAISE EXCEPTION 'Last eligible Stream Budget cannot be removed while a Chart is linked'
            USING ERRCODE = '23514', CONSTRAINT = 'tp_chk_chartfiscalyearbudgetretained';
        END IF;
      END IF;
      RETURN NEW;
    END $function$;

CREATE FUNCTION protect_profile_stream_catalog_links()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      IF NEW.egcs_tp_agency IS DISTINCT FROM OLD.egcs_tp_agency AND EXISTS (
        SELECT 1 FROM "Transfer_Payment_Stream" stream
        WHERE stream.egcs_tp_transferpaymentprofile = OLD.id
          AND stream._deleted = false
          AND (
            EXISTS (
              SELECT 1 FROM "Transfer_Payment_Stream_Review_Set" linked
              WHERE linked.egcs_tp_transferpaymentstream = stream.id AND linked._deleted = false
            ) OR EXISTS (
              SELECT 1 FROM "Transfer_Payment_Stream_Workflow" linked
              WHERE linked.egcs_tp_transferpaymentstream = stream.id AND linked._deleted = false
            ) OR EXISTS (
              SELECT 1 FROM "Transfer_Payment_Stream_Chart_of_Account" linked
              WHERE linked.egcs_tp_transferpaymentstream = stream.id AND linked._deleted = false
            ) OR EXISTS (
              SELECT 1 FROM "Transfer_Payment_Stream_Commitment_Type" linked
              WHERE linked.egcs_tp_transferpaymentstream = stream.id AND linked._deleted = false
            ) OR EXISTS (
              SELECT 1 FROM "Transfer_Payment_Monitor_Type" linked
              WHERE linked.egcs_tp_transferpaymentstream = stream.id AND linked._deleted = false
            ) OR EXISTS (
              SELECT 1 FROM "Transfer_Payment_Stream_Holdback_Basis" linked
              WHERE linked.egcs_tp_transferpaymentstream = stream.id AND linked._deleted = false
            ) OR EXISTS (
              SELECT 1 FROM "Transfer_Payment_Stream_Document_Template" linked
              WHERE linked.egcs_tp_transferpaymentstream = stream.id AND linked._deleted = false
            )
          )
      ) THEN
        RAISE EXCEPTION 'Transfer-payment Agency cannot change while Stream catalogs are linked'
          USING ERRCODE = '23514', CONSTRAINT = 'tp_chk_profile_agency_catalog_links';
      END IF;
      RETURN NEW;
    END $function$;

CREATE FUNCTION protect_stream_chart_catalog_link()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Stream Chart selections use soft deletion' USING ERRCODE='23514'; END IF;
      IF NEW.egcs_tp_agencychartofaccount IS DISTINCT FROM OLD.egcs_tp_agencychartofaccount THEN
        RAISE EXCEPTION 'Stream Chart of Account catalog link is immutable'
          USING ERRCODE = '23514', CONSTRAINT = 'tp_chk_stream_chart_catalog_link_immutable';
      END IF;
      IF NEW.egcs_tp_transferpaymentstream IS DISTINCT FROM OLD.egcs_tp_transferpaymentstream THEN
        RAISE EXCEPTION 'Stream Chart selection cannot move between Streams' USING ERRCODE='23514';
      END IF;
      IF NEW._deleted AND NOT OLD._deleted AND (
        EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Commitment_Line" line WHERE line.egcs_fc_transferpaymentstreamchartofaccount=OLD.id AND NOT line._deleted)
        OR EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Account_Receivable_Line" line
          JOIN "Funding_Case_Agreement_Account_Receivable" debt ON debt.id=line.egcs_fc_receivable
          JOIN "Funding_Case_Agreement_Profile" agreement ON agreement.id=debt.egcs_fc_fundingagreement
          WHERE line.egcs_fc_accountreceivablechartofaccount=OLD.egcs_tp_agencychartofaccount AND agreement.egcs_fc_transferpaymentstream=OLD.egcs_tp_transferpaymentstream AND NOT line._deleted AND NOT debt._deleted)
        OR EXISTS (SELECT 1 FROM "Funding_Case_Account_Receivable_Credit_Memo_Line" line
          JOIN "Funding_Case_Account_Receivable_Credit_Memo" memo ON memo.id=line.egcs_fc_creditmemo
          JOIN "Funding_Case_Agreement_Account_Receivable" debt ON debt.id=memo.egcs_fc_receivable
          JOIN "Funding_Case_Agreement_Profile" agreement ON agreement.id=debt.egcs_fc_fundingagreement
          WHERE line.egcs_fc_creditmemochartofaccount=OLD.egcs_tp_agencychartofaccount AND agreement.egcs_fc_transferpaymentstream=OLD.egcs_tp_transferpaymentstream AND NOT memo._deleted AND NOT line._deleted)
        OR EXISTS (SELECT 1 FROM "Funding_Case_Account_Receivable_Offset_Memo" memo
          JOIN "Funding_Case_Agreement_Account_Receivable" debt ON debt.id=memo.egcs_fc_receivable
          JOIN "Funding_Case_Agreement_Profile" agreement ON agreement.id=debt.egcs_fc_fundingagreement
          WHERE memo.egcs_fc_creditmemochartofaccount=OLD.egcs_tp_agencychartofaccount AND agreement.egcs_fc_transferpaymentstream=OLD.egcs_tp_transferpaymentstream AND NOT memo._deleted)
      ) THEN RAISE EXCEPTION 'Stream Chart selection is in use' USING ERRCODE='23514'; END IF;
      RETURN NEW;
    END $function$;

CREATE FUNCTION trg_fn_enforce_amendment_subtype_type_stream_scope()
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
    $function$;

CREATE FUNCTION trg_fn_enforce_stream_budget_profile_ownership()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE
      stream_profile_id bigint;
      budget_profile_id bigint;
      budget_currency currency_codes;
      previous_budget_currency currency_codes;
    BEGIN
      SELECT stream.egcs_tp_transferpaymentprofile
      INTO stream_profile_id
      FROM "Transfer_Payment_Stream" stream
      WHERE stream.id = NEW.egcs_tp_transferpaymentstream;

      SELECT budget.egcs_tp_transferpaymentprofile, budget.egcs_tp_currency
      INTO budget_profile_id, budget_currency
      FROM "Transfer_Payment_Fiscal_Year_Budget" budget
      WHERE budget.id = NEW.egcs_tp_transferpaymentbudget;

      IF stream_profile_id IS NOT NULL
        AND budget_profile_id IS NOT NULL
        AND stream_profile_id IS DISTINCT FROM budget_profile_id THEN
        RAISE EXCEPTION 'Transfer-payment Stream Budget parents must belong to the same Transfer Payment Profile'
          USING ERRCODE = '23514', CONSTRAINT = 'tp_chk_stream_budget_profile_ownership';
      END IF;

      IF TG_OP = 'UPDATE' AND NEW.egcs_tp_transferpaymentbudget IS DISTINCT FROM OLD.egcs_tp_transferpaymentbudget THEN
        SELECT budget.egcs_tp_currency INTO previous_budget_currency
        FROM "Transfer_Payment_Fiscal_Year_Budget" budget
        WHERE budget.id = OLD.egcs_tp_transferpaymentbudget;
        IF budget_currency IS NOT NULL AND previous_budget_currency IS NOT NULL
          AND budget_currency IS DISTINCT FROM previous_budget_currency THEN
          RAISE EXCEPTION 'Stream Budget currency is immutable through its Program Budget reference'
            USING ERRCODE = '23514', CONSTRAINT = 'tp_chk_stream_budget_currency_immutable';
        END IF;
      END IF;

      RETURN NEW;
    END;
    $function$;

CREATE FUNCTION trg_fn_protect_profile_funding_subtype_links()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
    END $function$;

CREATE FUNCTION trg_fn_protect_transfer_payment_ownership()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      IF TG_TABLE_NAME = 'Transfer_Payment_Profile' THEN
        IF NEW.egcs_tp_agency IS DISTINCT FROM OLD.egcs_tp_agency AND EXISTS (
            SELECT 1 FROM "Transfer_Payment_Stream" stream
            JOIN "Transfer_Payment_Stream_Field_Assignment" assignment
              ON assignment.egcs_tp_transferpaymentstream = stream.id AND assignment._deleted = false
            WHERE stream.egcs_tp_transferpaymentprofile = NEW.id AND stream._deleted = false
          ) THEN
          RAISE EXCEPTION 'Transfer-payment Agency cannot change while Stream fields are associated'
            USING ERRCODE = '23514', CONSTRAINT = 'tp_chk_profile_agency_field_associations';
        END IF;
      ELSIF TG_TABLE_NAME = 'Transfer_Payment_Stream' THEN
        IF NEW.egcs_tp_transferpaymentprofile IS DISTINCT FROM OLD.egcs_tp_transferpaymentprofile THEN
          RAISE EXCEPTION 'Transfer-payment Stream ownership is immutable'
            USING ERRCODE = '23514', CONSTRAINT = 'tp_chk_stream_profile_immutable';
        END IF;
      ELSIF TG_TABLE_NAME = 'Transfer_Payment_Fiscal_Year_Budget' THEN
        IF NEW.egcs_tp_currency IS DISTINCT FROM OLD.egcs_tp_currency THEN
          RAISE EXCEPTION 'Transfer-payment Budget currency is immutable'
            USING ERRCODE = '23514', CONSTRAINT = 'tp_chk_budget_currency_immutable';
        END IF;
        IF NEW.egcs_tp_transferpaymentprofile IS DISTINCT FROM OLD.egcs_tp_transferpaymentprofile THEN
          RAISE EXCEPTION 'Transfer-payment fiscal-year Budget ownership is immutable'
            USING ERRCODE = '23514', CONSTRAINT = 'tp_chk_fiscal_year_budget_profile_immutable';
        END IF;
      END IF;
      RETURN NEW;
    END;
    $function$;

CREATE FUNCTION trg_fn_validate_stream_funding_subtype_agency()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
    END $function$;

CREATE FUNCTION validate_stream_catalog_link()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE stream_agency bigint; stream_profile bigint; workflow_type varchar(128); workflow_purpose varchar(32);
    BEGIN
      IF TG_OP = 'UPDATE' THEN
        IF NEW.egcs_tp_transferpaymentstream IS DISTINCT FROM OLD.egcs_tp_transferpaymentstream THEN
          RAISE EXCEPTION 'Stream catalog link identity is immutable'
            USING ERRCODE = '23514', CONSTRAINT = 'tp_chk_streamcataloglinkidentity';
        END IF;
        IF TG_TABLE_NAME = 'Transfer_Payment_Stream_Review_Set' THEN
          IF NEW.egcs_tp_reviewset IS DISTINCT FROM OLD.egcs_tp_reviewset THEN
            RAISE EXCEPTION 'Stream catalog link identity is immutable'
              USING ERRCODE = '23514', CONSTRAINT = 'tp_chk_streamcataloglinkidentity';
          END IF;
        ELSE
          IF NEW.egcs_tp_workflow IS DISTINCT FROM OLD.egcs_tp_workflow THEN
            RAISE EXCEPTION 'Stream catalog link identity is immutable'
              USING ERRCODE = '23514', CONSTRAINT = 'tp_chk_streamcataloglinkidentity';
          END IF;
        END IF;
        -- Retirement must not prevent removal of a link already in use.
        IF NEW._deleted THEN RETURN NEW; END IF;
      END IF;
      SELECT stream.egcs_tp_transferpaymentprofile INTO stream_profile
      FROM "Transfer_Payment_Stream" stream
      WHERE stream.id = NEW.egcs_tp_transferpaymentstream AND stream._deleted = false;
      IF stream_profile IS NOT NULL THEN
        -- Lock the Program before its Stream so a concurrent Agency transfer
        -- cannot commit between owner validation and link creation.
        SELECT profile.egcs_tp_agency INTO stream_agency
        FROM "Transfer_Payment_Profile" profile
        WHERE profile.id = stream_profile AND profile._deleted = false
        FOR SHARE OF profile;
        PERFORM 1 FROM "Transfer_Payment_Stream" stream
        WHERE stream.id = NEW.egcs_tp_transferpaymentstream
          AND stream.egcs_tp_transferpaymentprofile = stream_profile
          AND stream._deleted = false
        FOR UPDATE OF stream;
        IF NOT FOUND THEN stream_agency := NULL; END IF;
      END IF;
      IF stream_agency IS NULL THEN
        RAISE EXCEPTION 'Stream is unavailable for a catalog link'
          USING ERRCODE = '23514', CONSTRAINT = 'tp_chk_streamcatalogstreamavailable';
      END IF;
      IF TG_TABLE_NAME = 'Transfer_Payment_Stream_Review_Set' THEN
        IF NOT EXISTS (
          SELECT 1 FROM "Common_Review_Set_Setup" catalog
          JOIN "Common_Publication" publication ON publication.id = catalog.id
          WHERE catalog.id = NEW.egcs_tp_reviewset
            AND catalog.egcs_cn_agency = stream_agency
            AND catalog._deleted = false
            AND publication._deleted = false
            AND publication.egcs_cn_state = 'published'
        ) THEN
          RAISE EXCEPTION 'Review Set must be published and belong to the Stream Agency'
            USING ERRCODE = '23514', CONSTRAINT = 'tp_chk_streamreviewsetpublishedagency';
        END IF;
      ELSE
        SELECT version.egcs_cn_definition->>'entityType', COALESCE(version.egcs_cn_definition->>'purpose', 'standard')
        INTO workflow_type, workflow_purpose
        FROM "Common_Workflow_Setup" catalog
          JOIN "Common_Publication" publication ON publication.id = catalog.id
          JOIN "Common_Publication_Version" version ON version.id = publication.egcs_cn_currentversion
          WHERE catalog.id = NEW.egcs_tp_workflow
            AND catalog.egcs_cn_agency = stream_agency
            AND catalog._deleted = false
            AND publication._deleted = false
            AND publication.egcs_cn_state = 'published'
        FOR SHARE OF catalog;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Workflow must be published and belong to the Stream Agency'
            USING ERRCODE = '23514', CONSTRAINT = 'tp_chk_streamworkflowpublishedagency';
        END IF;
        IF workflow_purpose IN ('approval_submission', 'risk_rating') AND EXISTS (
          SELECT 1 FROM "Transfer_Payment_Stream_Workflow" linked
          JOIN "Common_Workflow_Setup" existing ON existing.id = linked.egcs_tp_workflow
          JOIN "Common_Publication" existing_publication ON existing_publication.id = existing.id
          JOIN "Common_Publication_Version" existing_version ON existing_version.id = existing_publication.egcs_cn_currentversion
          WHERE linked.egcs_tp_transferpaymentstream = NEW.egcs_tp_transferpaymentstream
            AND linked.id IS DISTINCT FROM NEW.id
            AND linked._deleted = false
            AND existing._deleted = false
            AND existing_publication._deleted = false
            AND existing_publication.egcs_cn_state = 'published'
            AND existing_version.egcs_cn_definition->>'entityType' = workflow_type
            AND COALESCE(existing_version.egcs_cn_definition->>'purpose', 'standard') = workflow_purpose
        ) THEN
          RAISE EXCEPTION 'Stream already links a Workflow for this entity type and purpose'
            USING ERRCODE = '23505', CONSTRAINT = 'tp_idx_streamworkflow_specialpurpose';
        END IF;
      END IF;
      RETURN NEW;
    END $function$;

CREATE FUNCTION validate_stream_workflow_publication()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
  DECLARE definition jsonb;
  BEGIN
    IF NEW.egcs_cn_kind <> 'workflow_setup' OR NEW.egcs_cn_state <> 'published' OR NEW._deleted THEN RETURN NEW; END IF;
    SELECT egcs_cn_definition INTO definition FROM "Common_Publication_Version" WHERE id = NEW.egcs_cn_currentversion;
    PERFORM 1 FROM "Transfer_Payment_Stream" stream
      WHERE stream.id IN (SELECT egcs_tp_transferpaymentstream FROM "Transfer_Payment_Stream_Workflow"
        WHERE egcs_tp_workflow = NEW.id AND NOT _deleted) ORDER BY stream.id FOR UPDATE OF stream;
    IF COALESCE(definition->>'purpose', 'standard') NOT IN ('approval_submission', 'risk_rating') THEN RETURN NEW; END IF;
    IF EXISTS (
      SELECT 1 FROM "Transfer_Payment_Stream_Workflow" own_link
      JOIN "Transfer_Payment_Stream_Workflow" other_link ON other_link.egcs_tp_transferpaymentstream = own_link.egcs_tp_transferpaymentstream
        AND other_link.egcs_tp_workflow <> own_link.egcs_tp_workflow AND NOT other_link._deleted
      JOIN "Common_Workflow_Setup" other_setup ON other_setup.id = other_link.egcs_tp_workflow AND NOT other_setup._deleted
      JOIN "Common_Publication" other_publication ON other_publication.id = other_setup.id
        AND other_publication.egcs_cn_state = 'published' AND NOT other_publication._deleted
      JOIN "Common_Publication_Version" other_version ON other_version.id = other_publication.egcs_cn_currentversion
      WHERE own_link.egcs_tp_workflow = NEW.id AND NOT own_link._deleted
        AND other_version.egcs_cn_definition->>'entityType' = definition->>'entityType'
        AND COALESCE(other_version.egcs_cn_definition->>'purpose', 'standard') = definition->>'purpose'
    ) THEN
      RAISE EXCEPTION 'Stream already links a published Workflow for this entity type and purpose'
        USING ERRCODE = '23505', CONSTRAINT = 'tp_idx_streamworkflow_specialpurpose';
    END IF;
    RETURN NEW;
  END $function$;

CREATE FUNCTION validate_stream_operational_catalog_link()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE
      catalog_id bigint;
      catalog_agency bigint;
      catalog_fiscalyear bigint;
      stream_profile bigint;
      stream_agency bigint;
      old_catalog_id bigint;
    BEGIN
      catalog_id := CASE TG_TABLE_NAME
        WHEN 'Transfer_Payment_Stream_Chart_of_Account' THEN (to_jsonb(NEW)->>'egcs_tp_agencychartofaccount')::bigint
        WHEN 'Transfer_Payment_Stream_Commitment_Type' THEN (to_jsonb(NEW)->>'egcs_tp_agencycommitmenttype')::bigint
        WHEN 'Transfer_Payment_Monitor_Type' THEN (to_jsonb(NEW)->>'egcs_tp_agencymonitortype')::bigint
        WHEN 'Transfer_Payment_Stream_Holdback_Basis' THEN (to_jsonb(NEW)->>'egcs_tp_agencyholdback')::bigint
        ELSE (to_jsonb(NEW)->>'egcs_tp_agencydocumenttemplate')::bigint
      END;
      IF TG_OP = 'UPDATE' THEN
        old_catalog_id := CASE TG_TABLE_NAME
          WHEN 'Transfer_Payment_Stream_Chart_of_Account' THEN (to_jsonb(OLD)->>'egcs_tp_agencychartofaccount')::bigint
          WHEN 'Transfer_Payment_Stream_Commitment_Type' THEN (to_jsonb(OLD)->>'egcs_tp_agencycommitmenttype')::bigint
          WHEN 'Transfer_Payment_Monitor_Type' THEN (to_jsonb(OLD)->>'egcs_tp_agencymonitortype')::bigint
          WHEN 'Transfer_Payment_Stream_Holdback_Basis' THEN (to_jsonb(OLD)->>'egcs_tp_agencyholdback')::bigint
          ELSE (to_jsonb(OLD)->>'egcs_tp_agencydocumenttemplate')::bigint
        END;
        IF NEW.egcs_tp_transferpaymentstream IS DISTINCT FROM OLD.egcs_tp_transferpaymentstream
          OR catalog_id IS DISTINCT FROM old_catalog_id THEN
          RAISE EXCEPTION 'Stream catalog link identity is immutable'
            USING ERRCODE = '23514', CONSTRAINT = 'tp_chk_operationalcataloglinkidentity';
        END IF;
        IF NEW._deleted THEN RETURN NEW; END IF;
      END IF;
      IF NEW._deleted THEN RETURN NEW; END IF;

      SELECT stream.egcs_tp_transferpaymentprofile INTO stream_profile
      FROM "Transfer_Payment_Stream" stream
      WHERE stream.id = NEW.egcs_tp_transferpaymentstream AND stream._deleted = false;
      IF stream_profile IS NOT NULL THEN
        SELECT profile.egcs_tp_agency INTO stream_agency
        FROM "Transfer_Payment_Profile" profile
        WHERE profile.id = stream_profile AND profile._deleted = false
        FOR SHARE OF profile;
        PERFORM 1 FROM "Transfer_Payment_Stream" stream
        WHERE stream.id = NEW.egcs_tp_transferpaymentstream
          AND stream.egcs_tp_transferpaymentprofile = stream_profile
          AND stream._deleted = false
        FOR UPDATE OF stream;
        IF NOT FOUND THEN stream_agency := NULL; END IF;
      END IF;
      IF stream_agency IS NULL THEN
        RAISE EXCEPTION 'Stream is unavailable for a catalog link'
          USING ERRCODE = '23514', CONSTRAINT = 'tp_chk_operationalcatalogstreamavailable';
      END IF;

      IF TG_TABLE_NAME = 'Transfer_Payment_Stream_Chart_of_Account' THEN
        SELECT catalog.egcs_ay_organizationagency, catalog.egcs_ay_fiscalyear
        INTO catalog_agency, catalog_fiscalyear
        FROM "Agency_Chart_of_Account" catalog
        WHERE catalog.id = catalog_id AND catalog._deleted = false
        FOR SHARE OF catalog;
        PERFORM 1 FROM "Agency_Fiscal_Year" fiscal
        WHERE fiscal.id = catalog_fiscalyear AND fiscal._deleted = false
        FOR SHARE OF fiscal;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Chart fiscal year must be live'
            USING ERRCODE = '23514', CONSTRAINT = 'tp_chk_chartfiscalyearlive';
        END IF;
        PERFORM 1 FROM "Transfer_Payment_Stream_Budget" budget
          JOIN "Transfer_Payment_Fiscal_Year_Budget" fiscal_budget
            ON fiscal_budget.id = budget.egcs_tp_transferpaymentbudget
          WHERE budget.egcs_tp_transferpaymentstream = NEW.egcs_tp_transferpaymentstream
            AND budget._deleted = false AND fiscal_budget._deleted = false
            AND fiscal_budget.egcs_tp_fiscalyear = catalog_fiscalyear
          FOR SHARE OF fiscal_budget;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Chart fiscal year has no live Stream Budget'
            USING ERRCODE = '23514', CONSTRAINT = 'tp_chk_chartfiscalyearstreambudget';
        END IF;
      ELSIF TG_TABLE_NAME = 'Transfer_Payment_Stream_Commitment_Type' THEN
        SELECT catalog.egcs_ay_organizationagency INTO catalog_agency
        FROM "Agency_Commitment_Type" catalog
        WHERE catalog.id = catalog_id AND catalog._deleted = false FOR SHARE OF catalog;
      ELSIF TG_TABLE_NAME = 'Transfer_Payment_Monitor_Type' THEN
        SELECT catalog.egcs_ay_organizationagency INTO catalog_agency
        FROM "Agency_Monitor_Type" catalog
        WHERE catalog.id = catalog_id AND catalog._deleted = false FOR SHARE OF catalog;
      ELSIF TG_TABLE_NAME = 'Transfer_Payment_Stream_Holdback_Basis' THEN
        SELECT catalog.egcs_ay_organizationagency INTO catalog_agency
        FROM "Agency_Holdback_Basis" catalog
        WHERE catalog.id = catalog_id AND catalog._deleted = false FOR SHARE OF catalog;
      ELSE
        SELECT catalog.egcs_ay_organizationagency INTO catalog_agency
        FROM "Agency_Document_Template" catalog
        WHERE catalog.id = catalog_id AND catalog._deleted = false AND catalog.egcs_ay_active = true
        FOR SHARE OF catalog;
      END IF;
      IF catalog_agency IS DISTINCT FROM stream_agency THEN
        RAISE EXCEPTION 'Catalog definition must belong to the Stream Agency'
          USING ERRCODE = '23514', CONSTRAINT = 'tp_chk_operationalcatalogsameagency';
      END IF;
      RETURN NEW;
    END $function$;
END $baseline$`.execute(db)
}

/** Installs the current installForeignKeys definitions for this subject on a fresh database. */
export const installForeignKeys = async (db: Kysely<Database>): Promise<void> => {
  await sql`DO $baseline$ BEGIN
ALTER TABLE "Transfer_Payment_Agreement_Subtype" ADD CONSTRAINT "Transfer_Payment_Agreement_Su_egcs_tp_transferpaymentstrea_fkey" FOREIGN KEY (egcs_tp_transferpaymentstream) REFERENCES "Transfer_Payment_Stream"(id) ON DELETE RESTRICT;

ALTER TABLE "Transfer_Payment_Agreement_Subtype" ADD CONSTRAINT "Transfer_Payment_Agreement_Subtype_egcs_tp_agreementtype_fkey" FOREIGN KEY (egcs_tp_agreementtype) REFERENCES "Agency_Agreement_Type"(id) ON DELETE RESTRICT;

ALTER TABLE "Transfer_Payment_Amendment_Subtype" ADD CONSTRAINT "Transfer_Payment_Amendment_Su_egcs_tp_transferpaymentstrea_fkey" FOREIGN KEY (egcs_tp_transferpaymentstream) REFERENCES "Transfer_Payment_Stream"(id) ON DELETE RESTRICT;

ALTER TABLE "Transfer_Payment_Amendment_Subtype_Type" ADD CONSTRAINT "Transfer_Payment_Amendment_Subtyp_egcs_tp_amendmentsubtype_fkey" FOREIGN KEY (egcs_tp_amendmentsubtype) REFERENCES "Transfer_Payment_Amendment_Subtype"(id) ON DELETE RESTRICT;

ALTER TABLE "Transfer_Payment_Amendment_Subtype_Type" ADD CONSTRAINT "Transfer_Payment_Amendment_Subtype_T_egcs_tp_amendmenttype_fkey" FOREIGN KEY (egcs_tp_amendmenttype) REFERENCES "Transfer_Payment_Amendment_Type"(id) ON DELETE RESTRICT;

ALTER TABLE "Transfer_Payment_Amendment_Type" ADD CONSTRAINT "Transfer_Payment_Amendment_Ty_egcs_tp_transferpaymentstrea_fkey" FOREIGN KEY (egcs_tp_transferpaymentstream) REFERENCES "Transfer_Payment_Stream"(id) ON DELETE RESTRICT;

ALTER TABLE "Transfer_Payment_Financial_Limits" ADD CONSTRAINT "Transfer_Payment_Financial_Li_egcs_tp_transferpaymentstrea_fkey" FOREIGN KEY (egcs_tp_transferpaymentstream) REFERENCES "Transfer_Payment_Stream"(id) ON DELETE RESTRICT;

ALTER TABLE "Transfer_Payment_Fiscal_Year_Budget" ADD CONSTRAINT "Transfer_Payment_Fiscal_Year__egcs_tp_transferpaymentprofi_fkey" FOREIGN KEY (egcs_tp_transferpaymentprofile) REFERENCES "Transfer_Payment_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Transfer_Payment_Fiscal_Year_Budget" ADD CONSTRAINT "Transfer_Payment_Fiscal_Year_Budget_egcs_tp_fiscalyear_fkey" FOREIGN KEY (egcs_tp_fiscalyear) REFERENCES "Agency_Fiscal_Year"(id) ON DELETE RESTRICT;

ALTER TABLE "Transfer_Payment_Monitor_Type" ADD CONSTRAINT "Transfer_Payment_Monitor_Type_egcs_tp_agencymonitortype_fkey" FOREIGN KEY (egcs_tp_agencymonitortype) REFERENCES "Agency_Monitor_Type"(id) ON DELETE RESTRICT;

ALTER TABLE "Transfer_Payment_Monitor_Type" ADD CONSTRAINT "Transfer_Payment_Monitor_Type_egcs_tp_transferpaymentstrea_fkey" FOREIGN KEY (egcs_tp_transferpaymentstream) REFERENCES "Transfer_Payment_Stream"(id) ON DELETE RESTRICT;

ALTER TABLE "Transfer_Payment_Objective" ADD CONSTRAINT "Transfer_Payment_Objective_egcs_tp_transferpaymentprofile_fkey" FOREIGN KEY (egcs_tp_transferpaymentprofile) REFERENCES "Transfer_Payment_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Transfer_Payment_Outcome" ADD CONSTRAINT "Transfer_Payment_Outcome_egcs_tp_transferpaymentprofile_fkey" FOREIGN KEY (egcs_tp_transferpaymentprofile) REFERENCES "Transfer_Payment_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Transfer_Payment_Outcome_Performance_Indicator" ADD CONSTRAINT "Transfer_Payment_Outcome_Perf_egcs_tp_transferpaymentoutco_fkey" FOREIGN KEY (egcs_tp_transferpaymentoutcome) REFERENCES "Transfer_Payment_Outcome"(id) ON DELETE RESTRICT;

ALTER TABLE "Transfer_Payment_Profile" ADD CONSTRAINT "Transfer_Payment_Profile_egcs_tp_agency_fkey" FOREIGN KEY (egcs_tp_agency) REFERENCES "Agency_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Transfer_Payment_Stream" ADD CONSTRAINT "tp_ref_streamid" FOREIGN KEY (id) REFERENCES "Common_Entity"(id) ON DELETE RESTRICT;

ALTER TABLE "Transfer_Payment_Stream" ADD CONSTRAINT "Transfer_Payment_Stream_egcs_tp_parentstream_fkey" FOREIGN KEY (egcs_tp_parentstream) REFERENCES "Transfer_Payment_Stream"(id) ON DELETE RESTRICT;

ALTER TABLE "Transfer_Payment_Stream" ADD CONSTRAINT "Transfer_Payment_Stream_egcs_tp_transferpaymentprofile_fkey" FOREIGN KEY (egcs_tp_transferpaymentprofile) REFERENCES "Transfer_Payment_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Transfer_Payment_Stream_Area_of_Expertise" ADD CONSTRAINT "Transfer_Payment_Stream_Area__egcs_tp_transferpaymentstrea_fkey" FOREIGN KEY (egcs_tp_transferpaymentstream) REFERENCES "Transfer_Payment_Stream"(id) ON DELETE RESTRICT;

ALTER TABLE "Transfer_Payment_Stream_Budget" ADD CONSTRAINT "Transfer_Payment_Stream_Budge_egcs_tp_transferpaymentbudge_fkey" FOREIGN KEY (egcs_tp_transferpaymentbudget) REFERENCES "Transfer_Payment_Fiscal_Year_Budget"(id) ON DELETE RESTRICT;

ALTER TABLE "Transfer_Payment_Stream_Budget" ADD CONSTRAINT "Transfer_Payment_Stream_Budge_egcs_tp_transferpaymentstrea_fkey" FOREIGN KEY (egcs_tp_transferpaymentstream) REFERENCES "Transfer_Payment_Stream"(id) ON DELETE RESTRICT;

ALTER TABLE "Transfer_Payment_Stream_Chart_of_Account" ADD CONSTRAINT "Transfer_Payment_Stream_Chart_egcs_tp_agencychartofaccount_fkey" FOREIGN KEY (egcs_tp_agencychartofaccount) REFERENCES "Agency_Chart_of_Account"(id) ON DELETE RESTRICT;

ALTER TABLE "Transfer_Payment_Stream_Chart_of_Account" ADD CONSTRAINT "Transfer_Payment_Stream_Chart_egcs_tp_transferpaymentstrea_fkey" FOREIGN KEY (egcs_tp_transferpaymentstream) REFERENCES "Transfer_Payment_Stream"(id) ON DELETE RESTRICT;

ALTER TABLE "Transfer_Payment_Stream_Commitment_Type" ADD CONSTRAINT "Transfer_Payment_Stream_Commi_egcs_tp_agencycommitmenttype_fkey" FOREIGN KEY (egcs_tp_agencycommitmenttype) REFERENCES "Agency_Commitment_Type"(id) ON DELETE RESTRICT;

ALTER TABLE "Transfer_Payment_Stream_Commitment_Type" ADD CONSTRAINT "Transfer_Payment_Stream_Commi_egcs_tp_transferpaymentstrea_fkey" FOREIGN KEY (egcs_tp_transferpaymentstream) REFERENCES "Transfer_Payment_Stream"(id) ON DELETE RESTRICT;

ALTER TABLE "Transfer_Payment_Stream_Cost_Category_Line_Item" ADD CONSTRAINT "Transfer_Payment_Stream_Cost__egcs_tp_organizationcostcate_fkey" FOREIGN KEY (egcs_tp_organizationcostcategory) REFERENCES "Agency_Cost_Category_Line_Item"(id) ON DELETE RESTRICT;

ALTER TABLE "Transfer_Payment_Stream_Cost_Category_Line_Item" ADD CONSTRAINT "Transfer_Payment_Stream_Cost__egcs_tp_transferpaymentstrea_fkey" FOREIGN KEY (egcs_tp_transferpaymentstream) REFERENCES "Transfer_Payment_Stream"(id) ON DELETE RESTRICT;

ALTER TABLE "Transfer_Payment_Stream_Document_Template" ADD CONSTRAINT "Transfer_Payment_Stream_Docum_egcs_tp_agencydocumenttempla_fkey" FOREIGN KEY (egcs_tp_agencydocumenttemplate) REFERENCES "Agency_Document_Template"(id) ON DELETE RESTRICT;

ALTER TABLE "Transfer_Payment_Stream_Document_Template" ADD CONSTRAINT "Transfer_Payment_Stream_Docum_egcs_tp_transferpaymentstrea_fkey" FOREIGN KEY (egcs_tp_transferpaymentstream) REFERENCES "Transfer_Payment_Stream"(id) ON DELETE RESTRICT;

ALTER TABLE "Transfer_Payment_Stream_Eligible_Recipient" ADD CONSTRAINT "Transfer_Payment_Stream_Eligi_egcs_tp_applicantrecipientsu_fkey" FOREIGN KEY (egcs_tp_applicantrecipientsubtype) REFERENCES "Agency_Applicant_Recipient_Subtype"(id) ON DELETE RESTRICT;

ALTER TABLE "Transfer_Payment_Stream_Eligible_Recipient" ADD CONSTRAINT "Transfer_Payment_Stream_Eligi_egcs_tp_transferpaymentstrea_fkey" FOREIGN KEY (egcs_tp_transferpaymentstream) REFERENCES "Transfer_Payment_Stream"(id) ON DELETE RESTRICT;

ALTER TABLE "Transfer_Payment_Stream_Field_Assignment" ADD CONSTRAINT "tp_ref_field_assignment_section_stream" FOREIGN KEY (egcs_tp_section, egcs_tp_transferpaymentstream) REFERENCES "Transfer_Payment_Stream_Field_Section"(id, egcs_tp_transferpaymentstream) ON DELETE RESTRICT;

ALTER TABLE "Transfer_Payment_Stream_Field_Assignment" ADD CONSTRAINT "Transfer_Payment_Stream_Fiel_egcs_tp_transferpaymentstrea_fkey1" FOREIGN KEY (egcs_tp_transferpaymentstream) REFERENCES "Transfer_Payment_Stream"(id) ON DELETE RESTRICT;

ALTER TABLE "Transfer_Payment_Stream_Field_Assignment" ADD CONSTRAINT "Transfer_Payment_Stream_Field_Assignme_egcs_tp_agencyfield_fkey" FOREIGN KEY (egcs_tp_agencyfield) REFERENCES "Agency_Custom_Field"(id) ON DELETE RESTRICT;

ALTER TABLE "Transfer_Payment_Stream_Field_Section" ADD CONSTRAINT "Transfer_Payment_Stream_Field_egcs_tp_transferpaymentstrea_fkey" FOREIGN KEY (egcs_tp_transferpaymentstream) REFERENCES "Transfer_Payment_Stream"(id) ON DELETE RESTRICT;

ALTER TABLE "Transfer_Payment_Stream_Funding_Subtype" ADD CONSTRAINT "Transfer_Payment_Stream_Fundi_egcs_tp_transferpaymentstrea_fkey" FOREIGN KEY (egcs_tp_transferpaymentstream) REFERENCES "Transfer_Payment_Stream"(id) ON DELETE RESTRICT;

ALTER TABLE "Transfer_Payment_Stream_Funding_Subtype" ADD CONSTRAINT "Transfer_Payment_Stream_Funding_Sub_egcs_tp_fundingsubtype_fkey" FOREIGN KEY (egcs_tp_fundingsubtype) REFERENCES "Agency_Funding_Subtype"(id) ON DELETE RESTRICT;

ALTER TABLE "Transfer_Payment_Stream_Holdback_Basis" ADD CONSTRAINT "Transfer_Payment_Stream_Holdb_egcs_tp_transferpaymentstrea_fkey" FOREIGN KEY (egcs_tp_transferpaymentstream) REFERENCES "Transfer_Payment_Stream"(id) ON DELETE RESTRICT;

ALTER TABLE "Transfer_Payment_Stream_Holdback_Basis" ADD CONSTRAINT "Transfer_Payment_Stream_Holdback_Ba_egcs_tp_agencyholdback_fkey" FOREIGN KEY (egcs_tp_agencyholdback) REFERENCES "Agency_Holdback_Basis"(id) ON DELETE RESTRICT;

ALTER TABLE "Transfer_Payment_Stream_Outcome" ADD CONSTRAINT "Transfer_Payment_Stream_Outco_egcs_tp_transferpaymentoutco_fkey" FOREIGN KEY (egcs_tp_transferpaymentoutcome) REFERENCES "Transfer_Payment_Outcome"(id) ON DELETE RESTRICT;

ALTER TABLE "Transfer_Payment_Stream_Outcome" ADD CONSTRAINT "Transfer_Payment_Stream_Outco_egcs_tp_transferpaymentstrea_fkey" FOREIGN KEY (egcs_tp_transferpaymentstream) REFERENCES "Transfer_Payment_Stream"(id) ON DELETE RESTRICT;

ALTER TABLE "Transfer_Payment_Stream_Review_Set" ADD CONSTRAINT "Transfer_Payment_Stream_Revie_egcs_tp_transferpaymentstrea_fkey" FOREIGN KEY (egcs_tp_transferpaymentstream) REFERENCES "Transfer_Payment_Stream"(id) ON DELETE RESTRICT;

ALTER TABLE "Transfer_Payment_Stream_Review_Set" ADD CONSTRAINT "Transfer_Payment_Stream_Review_Set_egcs_tp_reviewset_fkey" FOREIGN KEY (egcs_tp_reviewset) REFERENCES "Common_Review_Set_Setup"(id) ON DELETE RESTRICT;

ALTER TABLE "Transfer_Payment_Stream_Risk_Rating" ADD CONSTRAINT "Transfer_Payment_Stream_Risk__egcs_tp_transferpaymentstrea_fkey" FOREIGN KEY (egcs_tp_transferpaymentstream) REFERENCES "Transfer_Payment_Stream"(id) ON DELETE RESTRICT;

ALTER TABLE "Transfer_Payment_Stream_Workflow" ADD CONSTRAINT "Transfer_Payment_Stream_Workf_egcs_tp_transferpaymentstrea_fkey" FOREIGN KEY (egcs_tp_transferpaymentstream) REFERENCES "Transfer_Payment_Stream"(id) ON DELETE RESTRICT;

ALTER TABLE "Transfer_Payment_Stream_Workflow" ADD CONSTRAINT "Transfer_Payment_Stream_Workflow_egcs_tp_workflow_fkey" FOREIGN KEY (egcs_tp_workflow) REFERENCES "Common_Workflow_Setup"(id) ON DELETE RESTRICT;
END $baseline$`.execute(db)
}

/** Installs the current installTriggers definitions for this subject on a fresh database. */
export const installTriggers = async (db: Kysely<Database>): Promise<void> => {
  await sql`DO $baseline$ BEGIN
CREATE TRIGGER guard_program_financial_id_agency BEFORE UPDATE OF egcs_tp_agency ON "Transfer_Payment_Profile" FOR EACH ROW EXECUTE FUNCTION guard_program_financial_id_agency();

CREATE TRIGGER protect_workflow_amendment_conditions AFTER DELETE OR UPDATE OF _deleted, egcs_tp_transferpaymentstream ON "Transfer_Payment_Amendment_Subtype" FOR EACH ROW EXECUTE FUNCTION protect_workflow_amendment_conditions();

CREATE TRIGGER trg_enforce_amendment_subtype_type_stream_scope BEFORE INSERT OR UPDATE OF egcs_tp_amendmentsubtype, egcs_tp_amendmenttype ON "Transfer_Payment_Amendment_Subtype_Type" FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_amendment_subtype_type_stream_scope();

CREATE TRIGGER protect_chart_program_budget BEFORE UPDATE OF egcs_tp_fiscalyear, _deleted ON "Transfer_Payment_Fiscal_Year_Budget" FOR EACH ROW EXECUTE FUNCTION protect_chart_program_budget();

CREATE TRIGGER trg_protect_transfer_payment_fiscal_year_budget_ownership BEFORE UPDATE ON "Transfer_Payment_Fiscal_Year_Budget" FOR EACH ROW EXECUTE FUNCTION trg_fn_protect_transfer_payment_ownership();

CREATE TRIGGER validate_stream_operational_catalog_link BEFORE INSERT OR UPDATE ON "Transfer_Payment_Monitor_Type" FOR EACH ROW EXECUTE FUNCTION validate_stream_operational_catalog_link();

CREATE TRIGGER guard_program_proponent_types AFTER UPDATE OF egcs_tp_agency ON "Transfer_Payment_Profile" FOR EACH ROW EXECUTE FUNCTION guard_stream_proponent_types();

CREATE TRIGGER protect_profile_stream_catalog_links BEFORE UPDATE OF egcs_tp_agency ON "Transfer_Payment_Profile" FOR EACH ROW EXECUTE FUNCTION protect_profile_stream_catalog_links();

CREATE TRIGGER protect_workflow_amendment_conditions AFTER DELETE OR UPDATE OF _deleted, egcs_tp_agency ON "Transfer_Payment_Profile" FOR EACH ROW EXECUTE FUNCTION protect_workflow_amendment_conditions();

CREATE TRIGGER trg_protect_profile_funding_subtype_links BEFORE UPDATE OF egcs_tp_agency ON "Transfer_Payment_Profile" FOR EACH ROW EXECUTE FUNCTION trg_fn_protect_profile_funding_subtype_links();

CREATE TRIGGER trg_protect_transfer_payment_profile_ownership BEFORE UPDATE ON "Transfer_Payment_Profile" FOR EACH ROW EXECUTE FUNCTION trg_fn_protect_transfer_payment_ownership();

CREATE TRIGGER guard_stream_proponent_types AFTER UPDATE OF egcs_tp_requireconsistentproponenttype, egcs_tp_transferpaymentprofile ON "Transfer_Payment_Stream" FOR EACH ROW EXECUTE FUNCTION guard_stream_proponent_types();

CREATE TRIGGER protect_workflow_amendment_conditions AFTER DELETE OR UPDATE OF _deleted, egcs_tp_transferpaymentprofile ON "Transfer_Payment_Stream" FOR EACH ROW EXECUTE FUNCTION protect_workflow_amendment_conditions();

CREATE TRIGGER trg_protect_transfer_payment_stream_ownership BEFORE UPDATE ON "Transfer_Payment_Stream" FOR EACH ROW EXECUTE FUNCTION trg_fn_protect_transfer_payment_ownership();

CREATE TRIGGER trg_register_transferpaymentstream BEFORE INSERT ON "Transfer_Payment_Stream" FOR EACH ROW EXECUTE FUNCTION register_entity('transferpaymentstream');

CREATE TRIGGER trg_soft_delete_transferpaymentstream_assignments AFTER UPDATE OF _deleted ON "Transfer_Payment_Stream" FOR EACH ROW EXECUTE FUNCTION trg_fn_soft_delete_entity_assignments('transferpaymentstream');

CREATE CONSTRAINT TRIGGER trg_validate_opportunity_streams_stream AFTER UPDATE OF egcs_tp_transferpaymentprofile ON "Transfer_Payment_Stream" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_opportunity_stream_links();

CREATE TRIGGER protect_chart_stream_budget BEFORE UPDATE ON "Transfer_Payment_Stream_Budget" FOR EACH ROW EXECUTE FUNCTION protect_chart_stream_budget();

CREATE TRIGGER trg_enforce_stream_budget_profile_ownership BEFORE INSERT OR UPDATE ON "Transfer_Payment_Stream_Budget" FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_stream_budget_profile_ownership();

CREATE TRIGGER trg_protect_stream_chart_catalog_link BEFORE UPDATE OR DELETE ON "Transfer_Payment_Stream_Chart_of_Account" FOR EACH ROW EXECUTE FUNCTION protect_stream_chart_catalog_link();


CREATE TRIGGER validate_stream_operational_catalog_link BEFORE INSERT OR UPDATE ON "Transfer_Payment_Stream_Chart_of_Account" FOR EACH ROW EXECUTE FUNCTION validate_stream_operational_catalog_link();

CREATE TRIGGER validate_stream_operational_catalog_link BEFORE INSERT OR UPDATE ON "Transfer_Payment_Stream_Commitment_Type" FOR EACH ROW EXECUTE FUNCTION validate_stream_operational_catalog_link();

CREATE TRIGGER validate_stream_operational_catalog_link BEFORE INSERT OR UPDATE ON "Transfer_Payment_Stream_Document_Template" FOR EACH ROW EXECUTE FUNCTION validate_stream_operational_catalog_link();

CREATE TRIGGER guard_eligible_proponent_types AFTER DELETE OR UPDATE ON "Transfer_Payment_Stream_Eligible_Recipient" FOR EACH ROW EXECUTE FUNCTION guard_stream_proponent_types();

CREATE TRIGGER enforce_stream_field_assignment_agency BEFORE INSERT OR UPDATE OF egcs_tp_transferpaymentstream, egcs_tp_agencyfield, _deleted ON "Transfer_Payment_Stream_Field_Assignment" FOR EACH ROW EXECUTE FUNCTION enforce_stream_field_assignment_agency();

CREATE TRIGGER trg_validate_stream_funding_subtype_agency BEFORE INSERT OR UPDATE OF egcs_tp_transferpaymentstream, egcs_tp_fundingsubtype, _deleted ON "Transfer_Payment_Stream_Funding_Subtype" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_stream_funding_subtype_agency();

CREATE TRIGGER validate_stream_operational_catalog_link BEFORE INSERT OR UPDATE ON "Transfer_Payment_Stream_Holdback_Basis" FOR EACH ROW EXECUTE FUNCTION validate_stream_operational_catalog_link();

CREATE TRIGGER validate_stream_review_set_link BEFORE INSERT OR UPDATE OF egcs_tp_transferpaymentstream, egcs_tp_reviewset, _deleted ON "Transfer_Payment_Stream_Review_Set" FOR EACH ROW EXECUTE FUNCTION validate_stream_catalog_link();

CREATE TRIGGER validate_stream_workflow_publication AFTER UPDATE OF egcs_cn_currentversion, egcs_cn_state ON "Common_Publication" FOR EACH ROW EXECUTE FUNCTION validate_stream_workflow_publication();

CREATE TRIGGER validate_stream_workflow_link BEFORE INSERT OR UPDATE OF egcs_tp_transferpaymentstream, egcs_tp_workflow, _deleted ON "Transfer_Payment_Stream_Workflow" FOR EACH ROW EXECUTE FUNCTION validate_stream_catalog_link();
END $baseline$`.execute(db)
}
