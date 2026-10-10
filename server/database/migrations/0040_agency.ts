import { sql, type Kysely } from 'kysely'
import type { Database } from '../../../shared/types/database'

// Clean-cutover baseline: agency. Edit this subject directly.

/** Installs the current up definitions for this subject on a fresh database. */
export const up = async (db: Kysely<Database>): Promise<void> => {
  await sql`DO $baseline$ BEGIN
CREATE SEQUENCE "Agency_Account_Receivable_Type_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Agency_Address_Type_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Agency_Agreement_Type_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Agency_Applicant_Recipient_Subtype_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Agency_Approval_Behalf_Type_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Agency_Chart_of_Account_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Agency_Commitment_Type_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Agency_Cost_Category_Line_Item_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Agency_Cost_Category_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Agency_Custom_Field_Option_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Agency_Custom_Field_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Agency_Document_Template_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Agency_Fiscal_Year_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Agency_Funding_Subtype_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Agency_Funding_Type_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Agency_Holdback_Basis_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Agency_Monitor_Type_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Agency_Profile_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE TABLE "Agency_Account_Receivable_Type" (
  "id" bigint DEFAULT nextval('"Agency_Account_Receivable_Type_id_seq"'::regclass) NOT NULL,
  "egcs_ay_organizationagency" bigint NOT NULL,
  "egcs_ay_name_en" character varying(255) NOT NULL,
  "egcs_ay_name_fr" character varying(255) NOT NULL,
  "egcs_ay_description_en" text DEFAULT ''::text NOT NULL,
  "egcs_ay_description_fr" text DEFAULT ''::text NOT NULL,
  "egcs_ay_monitorrequired" boolean DEFAULT false NOT NULL,
  "egcs_ay_advancepaymentrelated" boolean NOT NULL,
  "egcs_ay_claimrelated" boolean NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Agency_Account_Receivable_Type_pkey" PRIMARY KEY (id),
  CONSTRAINT "ay_chk_ar_type_names" CHECK (((length(btrim((egcs_ay_name_en)::text)) > 0) AND (length(btrim((egcs_ay_name_fr)::text)) > 0))),
  CONSTRAINT "ay_chk_ar_type_source" CHECK ((egcs_ay_advancepaymentrelated <> egcs_ay_claimrelated))
);

CREATE UNIQUE INDEX ay_uq_ar_type_name_en ON "Agency_Account_Receivable_Type" USING btree (egcs_ay_organizationagency, lower(btrim((egcs_ay_name_en)::text))) WHERE (NOT _deleted);

CREATE UNIQUE INDEX ay_uq_ar_type_name_fr ON "Agency_Account_Receivable_Type" USING btree (egcs_ay_organizationagency, lower(btrim((egcs_ay_name_fr)::text))) WHERE (NOT _deleted);

CREATE TABLE "Agency_Address_Type" (
  "id" bigint DEFAULT nextval('"Agency_Address_Type_id_seq"'::regclass) NOT NULL,
  "egcs_ay_organizationagency" bigint NOT NULL,
  "egcs_ay_typename_en" character varying(255) NOT NULL,
  "egcs_ay_typename_fr" character varying(255) NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Agency_Address_Type_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX ay_idx_addresstypeorganizationagencytypenameen ON "Agency_Address_Type" USING btree (egcs_ay_organizationagency, egcs_ay_typename_en) WHERE (_deleted = false);

CREATE UNIQUE INDEX ay_idx_addresstypeorganizationagencytypenamefr ON "Agency_Address_Type" USING btree (egcs_ay_organizationagency, egcs_ay_typename_fr) WHERE (_deleted = false);

CREATE UNIQUE INDEX ay_uq_address_type_name_en_normalized ON "Agency_Address_Type" USING btree (egcs_ay_organizationagency, lower(btrim((egcs_ay_typename_en)::text))) WHERE (_deleted = false);

CREATE UNIQUE INDEX ay_uq_address_type_name_fr_normalized ON "Agency_Address_Type" USING btree (egcs_ay_organizationagency, lower(btrim((egcs_ay_typename_fr)::text))) WHERE (_deleted = false);

CREATE TABLE "Agency_Agreement_Type" (
  "id" bigint DEFAULT nextval('"Agency_Agreement_Type_id_seq"'::regclass) NOT NULL,
  "egcs_ay_organizationagency" bigint NOT NULL,
  "egcs_ay_agreementtype" agreement_type NOT NULL,
  "egcs_ay_name_en" character varying(255) NOT NULL,
  "egcs_ay_name_fr" character varying(255) NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Agency_Agreement_Type_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX ay_idx_agreementtypeorganizationagencyagreementtypenameen ON "Agency_Agreement_Type" USING btree (egcs_ay_organizationagency, egcs_ay_agreementtype, egcs_ay_name_en) WHERE (_deleted = false);

CREATE UNIQUE INDEX ay_idx_agreementtypeorganizationagencyagreementtypenamefr ON "Agency_Agreement_Type" USING btree (egcs_ay_organizationagency, egcs_ay_agreementtype, egcs_ay_name_fr) WHERE (_deleted = false);

CREATE UNIQUE INDEX ay_uq_agreement_type_name_en_normalized ON "Agency_Agreement_Type" USING btree (egcs_ay_organizationagency, egcs_ay_agreementtype, lower(btrim((egcs_ay_name_en)::text))) WHERE (_deleted = false);

CREATE UNIQUE INDEX ay_uq_agreement_type_name_fr_normalized ON "Agency_Agreement_Type" USING btree (egcs_ay_organizationagency, egcs_ay_agreementtype, lower(btrim((egcs_ay_name_fr)::text))) WHERE (_deleted = false);

CREATE TABLE "Agency_Applicant_Recipient_Subtype" (
  "id" bigint DEFAULT nextval('"Agency_Applicant_Recipient_Subtype_id_seq"'::regclass) NOT NULL,
  "egcs_ay_applicantrecipienttype" applicant_recipient_type NOT NULL,
  "egcs_ay_organizationagency" bigint NOT NULL,
  "egcs_ay_description_en" text NOT NULL,
  "egcs_ay_description_fr" text NOT NULL,
  "egcs_ay_name_en" character varying(255) NOT NULL,
  "egcs_ay_name_fr" character varying(255) NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Agency_Applicant_Recipient_Subtype_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX ay_idx_uniqueartypeen ON "Agency_Applicant_Recipient_Subtype" USING btree (egcs_ay_organizationagency, egcs_ay_applicantrecipienttype, egcs_ay_name_en) WHERE (_deleted = false);

CREATE UNIQUE INDEX ay_idx_uniqueartypefr ON "Agency_Applicant_Recipient_Subtype" USING btree (egcs_ay_organizationagency, egcs_ay_applicantrecipienttype, egcs_ay_name_fr) WHERE (_deleted = false);

CREATE UNIQUE INDEX ay_uq_recipient_subtype_name_en_normalized ON "Agency_Applicant_Recipient_Subtype" USING btree (egcs_ay_organizationagency, egcs_ay_applicantrecipienttype, lower(btrim((egcs_ay_name_en)::text))) WHERE (_deleted = false);

CREATE UNIQUE INDEX ay_uq_recipient_subtype_name_fr_normalized ON "Agency_Applicant_Recipient_Subtype" USING btree (egcs_ay_organizationagency, egcs_ay_applicantrecipienttype, lower(btrim((egcs_ay_name_fr)::text))) WHERE (_deleted = false);

CREATE TABLE "Agency_Approval_Behalf_Type" (
  "id" bigint DEFAULT nextval('"Agency_Approval_Behalf_Type_id_seq"'::regclass) NOT NULL,
  "egcs_ay_organizationagency" bigint NOT NULL,
  "egcs_ay_name_en" character varying(255) NOT NULL,
  "egcs_ay_name_fr" character varying(255) NOT NULL,
  "egcs_ay_require_actual" boolean NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Agency_Approval_Behalf_Type_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX ay_idx_approvalbehalftypeorganizationagencynameen ON "Agency_Approval_Behalf_Type" USING btree (egcs_ay_organizationagency, egcs_ay_name_en) WHERE (_deleted = false);

CREATE UNIQUE INDEX ay_idx_approvalbehalftypeorganizationagencynamefr ON "Agency_Approval_Behalf_Type" USING btree (egcs_ay_organizationagency, egcs_ay_name_fr) WHERE (_deleted = false);

CREATE UNIQUE INDEX ay_uq_approval_behalf_name_en_normalized ON "Agency_Approval_Behalf_Type" USING btree (egcs_ay_organizationagency, lower(btrim((egcs_ay_name_en)::text))) WHERE (_deleted = false);

CREATE UNIQUE INDEX ay_uq_approval_behalf_name_fr_normalized ON "Agency_Approval_Behalf_Type" USING btree (egcs_ay_organizationagency, lower(btrim((egcs_ay_name_fr)::text))) WHERE (_deleted = false);

CREATE TABLE "Agency_Chart_of_Account" (
  "egcs_ay_commitmentchartofaccount" bigint,
  "id" bigint DEFAULT nextval('"Agency_Chart_of_Account_id_seq"'::regclass) NOT NULL,
  "egcs_ay_kind" character varying(32) DEFAULT 'commitment'::character varying NOT NULL,
  "egcs_ay_organizationagency" bigint NOT NULL,
  "egcs_ay_fiscalyear" bigint NOT NULL,
  "egcs_ay_accountingdimensions" jsonb NOT NULL,
  "egcs_ay_currency" currency_codes DEFAULT 'cad'::currency_codes NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Agency_Chart_of_Account_pkey" PRIMARY KEY (id),
  CONSTRAINT "ay_chk_chart_kind" CHECK (((egcs_ay_kind)::text = ANY ((ARRAY['commitment'::character varying, 'account_receivable'::character varying, 'credit_memo'::character varying])::text[]))),
  CONSTRAINT "ay_chk_chartofaccountdimensions" CHECK (((jsonb_typeof(egcs_ay_accountingdimensions) = 'array'::text) AND (jsonb_array_length(egcs_ay_accountingdimensions) > 0)))
);

CREATE UNIQUE INDEX ay_idx_chartfiscalyeardimensions ON "Agency_Chart_of_Account" USING btree (egcs_ay_fiscalyear, egcs_ay_currency, egcs_ay_kind, egcs_ay_accountingdimensions) WHERE (_deleted = false);

CREATE TABLE "Agency_Commitment_Type" (
  "id" bigint DEFAULT nextval('"Agency_Commitment_Type_id_seq"'::regclass) NOT NULL,
  "egcs_ay_organizationagency" bigint NOT NULL,
  "egcs_ay_name_en" character varying(255) NOT NULL,
  "egcs_ay_name_fr" character varying(255) NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Agency_Commitment_Type_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX ay_idx_commitmenttypenameen ON "Agency_Commitment_Type" USING btree (egcs_ay_organizationagency, egcs_ay_name_en) WHERE (_deleted = false);

CREATE UNIQUE INDEX ay_idx_commitmenttypenamefr ON "Agency_Commitment_Type" USING btree (egcs_ay_organizationagency, egcs_ay_name_fr) WHERE (_deleted = false);

CREATE TABLE "Agency_Cost_Category" (
  "id" bigint DEFAULT nextval('"Agency_Cost_Category_id_seq"'::regclass) NOT NULL,
  "egcs_ay_organizationagency" bigint NOT NULL,
  "egcs_ay_name_en" character varying(255) NOT NULL,
  "egcs_ay_name_fr" character varying(255) NOT NULL,
  "egcs_ay_active" boolean DEFAULT true NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Agency_Cost_Category_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX ay_idx_costcategoryorganizationagencynameen ON "Agency_Cost_Category" USING btree (egcs_ay_organizationagency, egcs_ay_name_en) WHERE (_deleted = false);

CREATE UNIQUE INDEX ay_idx_costcategoryorganizationagencynamefr ON "Agency_Cost_Category" USING btree (egcs_ay_organizationagency, egcs_ay_name_fr) WHERE (_deleted = false);

CREATE UNIQUE INDEX ay_uq_cost_category_name_en_normalized ON "Agency_Cost_Category" USING btree (egcs_ay_organizationagency, lower(btrim((egcs_ay_name_en)::text))) WHERE (_deleted = false);

CREATE UNIQUE INDEX ay_uq_cost_category_name_fr_normalized ON "Agency_Cost_Category" USING btree (egcs_ay_organizationagency, lower(btrim((egcs_ay_name_fr)::text))) WHERE (_deleted = false);

CREATE TABLE "Agency_Cost_Category_Line_Item" (
  "id" bigint DEFAULT nextval('"Agency_Cost_Category_Line_Item_id_seq"'::regclass) NOT NULL,
  "egcs_ay_name_en" character varying(255) NOT NULL,
  "egcs_ay_name_fr" character varying(255) NOT NULL,
  "egcs_ay_active" boolean DEFAULT true NOT NULL,
  "egcs_ay_organizationcostcategory" bigint NOT NULL,
  "egcs_ay_calculationmode" character varying(16) DEFAULT 'manual'::character varying NOT NULL,
  "egcs_ay_sourcecategory" bigint,
  "egcs_ay_percentage" numeric(5,2),
  "egcs_ay_allowpercentageoverride" boolean DEFAULT false NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Agency_Cost_Category_Line_Item_pkey" PRIMARY KEY (id),
  CONSTRAINT "ay_chk_lineitemcalculation" CHECK (((((egcs_ay_calculationmode)::text = 'manual'::text) AND (egcs_ay_sourcecategory IS NULL) AND (egcs_ay_percentage IS NULL) AND (NOT egcs_ay_allowpercentageoverride)) OR (((egcs_ay_calculationmode)::text = ANY ((ARRAY['category'::character varying, 'all_other'::character varying])::text[])) AND (egcs_ay_percentage IS NOT NULL) AND ((egcs_ay_percentage >= (0)::numeric) AND (egcs_ay_percentage <= (100)::numeric)) AND ((((egcs_ay_calculationmode)::text = 'category'::text) AND (egcs_ay_sourcecategory IS NOT NULL)) OR (((egcs_ay_calculationmode)::text = 'all_other'::text) AND (egcs_ay_sourcecategory IS NULL))))))
);

CREATE UNIQUE INDEX ay_idx_costcategorylineitemorganizationcostcategorynameen ON "Agency_Cost_Category_Line_Item" USING btree (egcs_ay_organizationcostcategory, egcs_ay_name_en) WHERE (_deleted = false);

CREATE UNIQUE INDEX ay_idx_costcategorylineitemorganizationcostcategorynamefr ON "Agency_Cost_Category_Line_Item" USING btree (egcs_ay_organizationcostcategory, egcs_ay_name_fr) WHERE (_deleted = false);

CREATE UNIQUE INDEX ay_uq_line_item_name_en_normalized ON "Agency_Cost_Category_Line_Item" USING btree (egcs_ay_organizationcostcategory, lower(btrim((egcs_ay_name_en)::text))) WHERE (_deleted = false);

CREATE UNIQUE INDEX ay_uq_line_item_name_fr_normalized ON "Agency_Cost_Category_Line_Item" USING btree (egcs_ay_organizationcostcategory, lower(btrim((egcs_ay_name_fr)::text))) WHERE (_deleted = false);

CREATE TABLE "Agency_Custom_Field" (
  "id" bigint DEFAULT nextval('"Agency_Custom_Field_id_seq"'::regclass) NOT NULL,
  "egcs_ay_agency" bigint NOT NULL,
  "egcs_ay_name_en" text NOT NULL,
  "egcs_ay_name_fr" text NOT NULL,
  "egcs_ay_kind" text NOT NULL,
  "egcs_ay_multiple" boolean DEFAULT false NOT NULL,
  "egcs_ay_presentation" text DEFAULT 'single_line'::text NOT NULL,
  "egcs_ay_discriminator" boolean DEFAULT false NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Agency_Custom_Field_pkey" PRIMARY KEY (id),
  CONSTRAINT "Agency_Custom_Field_egcs_ay_kind_check" CHECK ((egcs_ay_kind = ANY (ARRAY['text'::text, 'number'::text, 'relational'::text]))),
  CONSTRAINT "Agency_Custom_Field_egcs_ay_presentation_check" CHECK ((egcs_ay_presentation = ANY (ARRAY['single_line'::text, 'multiline'::text]))),
  CONSTRAINT "ay_chk_custom_field_discriminator_kind" CHECK (((NOT egcs_ay_discriminator) OR (egcs_ay_kind = 'relational'::text))),
  CONSTRAINT "ay_chk_custom_field_multiple_kind" CHECK (((NOT egcs_ay_multiple) OR (egcs_ay_kind = 'relational'::text))),
  CONSTRAINT "ay_chk_custom_field_presentation_kind" CHECK (((egcs_ay_kind = 'text'::text) OR (egcs_ay_presentation = 'single_line'::text)))
);

CREATE TABLE "Agency_Custom_Field_Option" (
  "id" bigint DEFAULT nextval('"Agency_Custom_Field_Option_id_seq"'::regclass) NOT NULL,
  "egcs_ay_field" bigint NOT NULL,
  "egcs_ay_name_en" text NOT NULL,
  "egcs_ay_name_fr" text NOT NULL,
  "egcs_ay_category_en" text,
  "egcs_ay_category_fr" text,
  "egcs_ay_active" boolean DEFAULT true NOT NULL,
  "egcs_ay_displayorder" integer DEFAULT 0 NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Agency_Custom_Field_Option_id_egcs_ay_field_key" UNIQUE (id, egcs_ay_field),
  CONSTRAINT "Agency_Custom_Field_Option_pkey" PRIMARY KEY (id),
  CONSTRAINT "Agency_Custom_Field_Option_egcs_ay_displayorder_check" CHECK ((egcs_ay_displayorder >= 0)),
  CONSTRAINT "ay_chk_custom_field_option_categories" CHECK (((egcs_ay_category_en IS NULL) = (egcs_ay_category_fr IS NULL)))
);

CREATE TABLE "Agency_Document_Template" (
  "id" bigint DEFAULT nextval('"Agency_Document_Template_id_seq"'::regclass) NOT NULL,
  "egcs_ay_organizationagency" bigint NOT NULL,
  "egcs_ay_entitytype" character varying(128) NOT NULL,
  "egcs_ay_name_en" character varying(255) NOT NULL,
  "egcs_ay_name_fr" character varying(255) NOT NULL,
  "egcs_ay_description_en" text NOT NULL,
  "egcs_ay_description_fr" text NOT NULL,
  "egcs_ay_templateattachment_en" bigint NOT NULL,
  "egcs_ay_templateattachment_fr" bigint NOT NULL,
  "egcs_ay_templatekind" character varying(16) NOT NULL,
  "egcs_ay_outputformats" jsonb DEFAULT '["docx"]'::jsonb NOT NULL,
  "egcs_ay_active" boolean DEFAULT true NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Agency_Document_Template_pkey" PRIMARY KEY (id),
  CONSTRAINT "ay_chk_documenttemplate_entitytype" CHECK (((egcs_ay_entitytype)::text = ANY ((ARRAY['fundingcaseagreement'::character varying, 'fundingcaseagreementcloseout'::character varying, 'fundingcaseamendment'::character varying])::text[]))),
  CONSTRAINT "ay_chk_documenttemplate_kind" CHECK (((egcs_ay_templatekind)::text = ANY ((ARRAY['docx'::character varying, 'html'::character varying])::text[]))),
  CONSTRAINT "ay_chk_documenttemplate_kindoutput" CHECK (((((egcs_ay_templatekind)::text = 'docx'::text) AND (egcs_ay_outputformats <@ '["docx", "pdf"]'::jsonb)) OR (((egcs_ay_templatekind)::text = 'html'::text) AND (egcs_ay_outputformats <@ '["html", "pdf"]'::jsonb)))),
  CONSTRAINT "ay_chk_documenttemplate_outputs" CHECK (((jsonb_typeof(egcs_ay_outputformats) = 'array'::text) AND (jsonb_array_length(egcs_ay_outputformats) > 0) AND (egcs_ay_outputformats <@ '["docx", "html", "pdf"]'::jsonb)))
);

CREATE UNIQUE INDEX ay_idx_documenttemplateagencyentitynameen ON "Agency_Document_Template" USING btree (egcs_ay_organizationagency, egcs_ay_entitytype, egcs_ay_name_en) WHERE (_deleted = false);

CREATE UNIQUE INDEX ay_idx_documenttemplateagencyentitynamefr ON "Agency_Document_Template" USING btree (egcs_ay_organizationagency, egcs_ay_entitytype, egcs_ay_name_fr) WHERE (_deleted = false);

CREATE TABLE "Agency_Fiscal_Year" (
  "id" bigint DEFAULT nextval('"Agency_Fiscal_Year_id_seq"'::regclass) NOT NULL,
  "egcs_ay_organizationagency" bigint NOT NULL,
  "egcs_ay_fiscalyeardisplay" character varying(9) NOT NULL,
  "egcs_ay_fiscalyear" smallint NOT NULL,
  "egcs_ay_startdate" date NOT NULL,
  "egcs_ay_enddate" date NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  "egcs_ay_jvopen" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Agency_Fiscal_Year_pkey" PRIMARY KEY (id),
  CONSTRAINT "ay_chk_fiscalyear_dates" CHECK ((egcs_ay_enddate >= egcs_ay_startdate))
);

CREATE UNIQUE INDEX ay_idx_fiscalyearorganizationagencyfiscalyear ON "Agency_Fiscal_Year" USING btree (egcs_ay_organizationagency, egcs_ay_fiscalyear) WHERE (_deleted = false);

CREATE UNIQUE INDEX ay_idx_fiscalyearorganizationagencyfiscalyeardisplay ON "Agency_Fiscal_Year" USING btree (egcs_ay_organizationagency, egcs_ay_fiscalyeardisplay) WHERE (_deleted = false);

CREATE TABLE "Agency_Funding_Subtype" (
  "id" bigint DEFAULT nextval('"Agency_Funding_Subtype_id_seq"'::regclass) NOT NULL,
  "egcs_ay_fundingtype" bigint NOT NULL,
  "egcs_ay_name_en" character varying(255) NOT NULL,
  "egcs_ay_name_fr" character varying(255) NOT NULL,
  "egcs_ay_active" boolean DEFAULT true NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Agency_Funding_Subtype_pkey" PRIMARY KEY (id),
  CONSTRAINT "ay_uq_funding_subtype_id_type" UNIQUE (id, egcs_ay_fundingtype)
);

CREATE UNIQUE INDEX ay_uq_funding_subtype_name_en_active ON "Agency_Funding_Subtype" USING btree (egcs_ay_fundingtype, lower((egcs_ay_name_en)::text)) WHERE (_deleted = false);

CREATE UNIQUE INDEX ay_uq_funding_subtype_name_fr_active ON "Agency_Funding_Subtype" USING btree (egcs_ay_fundingtype, lower((egcs_ay_name_fr)::text)) WHERE (_deleted = false);

CREATE TABLE "Agency_Funding_Type" (
  "id" bigint DEFAULT nextval('"Agency_Funding_Type_id_seq"'::regclass) NOT NULL,
  "egcs_ay_organizationagency" bigint NOT NULL,
  "egcs_ay_name_en" character varying(255) NOT NULL,
  "egcs_ay_name_fr" character varying(255) NOT NULL,
  "egcs_ay_instacking" boolean DEFAULT false NOT NULL,
  "egcs_ay_incostsharing" boolean DEFAULT false NOT NULL,
  "egcs_ay_active" boolean DEFAULT true NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Agency_Funding_Type_pkey" PRIMARY KEY (id),
  CONSTRAINT "ay_uq_funding_type_id_agency" UNIQUE (id, egcs_ay_organizationagency)
);

CREATE UNIQUE INDEX ay_uq_funding_type_name_en_active ON "Agency_Funding_Type" USING btree (egcs_ay_organizationagency, lower((egcs_ay_name_en)::text)) WHERE (_deleted = false);

CREATE UNIQUE INDEX ay_uq_funding_type_name_fr_active ON "Agency_Funding_Type" USING btree (egcs_ay_organizationagency, lower((egcs_ay_name_fr)::text)) WHERE (_deleted = false);

CREATE TABLE "Agency_Holdback_Basis" (
  "id" bigint DEFAULT nextval('"Agency_Holdback_Basis_id_seq"'::regclass) NOT NULL,
  "egcs_ay_organizationagency" bigint NOT NULL,
  "egcs_ay_languageindependentcode" character varying(255) NOT NULL,
  "egcs_ay_holdbackbasis" holdback_bases DEFAULT 'fullagreement'::holdback_bases NOT NULL,
  "egcs_ay_name_en" character varying(255) NOT NULL,
  "egcs_ay_name_fr" character varying(255) NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Agency_Holdback_Basis_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX ay_idx_holdbackbasisorganizationagencycode ON "Agency_Holdback_Basis" USING btree (egcs_ay_organizationagency, egcs_ay_languageindependentcode) WHERE (_deleted = false);

CREATE UNIQUE INDEX ay_uq_holdback_code_normalized ON "Agency_Holdback_Basis" USING btree (egcs_ay_organizationagency, lower(btrim((egcs_ay_languageindependentcode)::text))) WHERE (_deleted = false);

CREATE TABLE "Agency_Monitor_Type" (
  "id" bigint DEFAULT nextval('"Agency_Monitor_Type_id_seq"'::regclass) NOT NULL,
  "egcs_ay_organizationagency" bigint NOT NULL,
  "egcs_ay_name_en" character varying(255) NOT NULL,
  "egcs_ay_name_fr" character varying(255) NOT NULL,
  "egcs_ay_receivableeligible" boolean DEFAULT false NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Agency_Monitor_Type_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX ay_idx_monitortypenameen ON "Agency_Monitor_Type" USING btree (egcs_ay_organizationagency, egcs_ay_name_en) WHERE (_deleted = false);

CREATE UNIQUE INDEX ay_idx_monitortypenamefr ON "Agency_Monitor_Type" USING btree (egcs_ay_organizationagency, egcs_ay_name_fr) WHERE (_deleted = false);

CREATE TABLE "Agency_Profile" (
  "id" bigint DEFAULT nextval('"Agency_Profile_id_seq"'::regclass) NOT NULL,
  "egcs_ay_agencyfinancialsystemid" bigint NOT NULL,
  "egcs_ay_name_en" character varying(255) NOT NULL,
  "egcs_ay_name_fr" character varying(255) NOT NULL,
  "egcs_ay_abbreviation_en" character varying(255) NOT NULL,
  "egcs_ay_abbreviation_fr" character varying(255) NOT NULL,
  "egcs_ay_active" boolean DEFAULT false NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  "egcs_ay_claimreconciliationstartstatus" bigint,
  "egcs_ay_claimreconciliationfinalstatus" bigint,
  "egcs_ay_gwcoa_number" bigint NOT NULL,
  CONSTRAINT "Agency_Profile_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX ay_idx_profileagencyfinancialsystemidnameennamefrstatus ON "Agency_Profile" USING btree (egcs_ay_agencyfinancialsystemid, egcs_ay_name_en, egcs_ay_name_fr, egcs_ay_active) WHERE (_deleted = false);

CREATE INDEX ay_idx_profilenameen ON "Agency_Profile" USING btree (egcs_ay_name_en) WHERE (_deleted = false);

CREATE INDEX ay_idx_profilenamefr ON "Agency_Profile" USING btree (egcs_ay_name_fr) WHERE (_deleted = false);

CREATE UNIQUE INDEX ay_uq_profile_normalized ON "Agency_Profile" USING btree (egcs_ay_agencyfinancialsystemid, lower(btrim((egcs_ay_name_en)::text)), lower(btrim((egcs_ay_name_fr)::text)), egcs_ay_active) WHERE (_deleted = false);

ALTER SEQUENCE "Agency_Account_Receivable_Type_id_seq" OWNED BY "Agency_Account_Receivable_Type"."id";

ALTER SEQUENCE "Agency_Address_Type_id_seq" OWNED BY "Agency_Address_Type"."id";

ALTER SEQUENCE "Agency_Agreement_Type_id_seq" OWNED BY "Agency_Agreement_Type"."id";

ALTER SEQUENCE "Agency_Applicant_Recipient_Subtype_id_seq" OWNED BY "Agency_Applicant_Recipient_Subtype"."id";

ALTER SEQUENCE "Agency_Approval_Behalf_Type_id_seq" OWNED BY "Agency_Approval_Behalf_Type"."id";

ALTER SEQUENCE "Agency_Chart_of_Account_id_seq" OWNED BY "Agency_Chart_of_Account"."id";

ALTER SEQUENCE "Agency_Commitment_Type_id_seq" OWNED BY "Agency_Commitment_Type"."id";

ALTER SEQUENCE "Agency_Cost_Category_Line_Item_id_seq" OWNED BY "Agency_Cost_Category_Line_Item"."id";

ALTER SEQUENCE "Agency_Cost_Category_id_seq" OWNED BY "Agency_Cost_Category"."id";

ALTER SEQUENCE "Agency_Custom_Field_Option_id_seq" OWNED BY "Agency_Custom_Field_Option"."id";

ALTER SEQUENCE "Agency_Custom_Field_id_seq" OWNED BY "Agency_Custom_Field"."id";

ALTER SEQUENCE "Agency_Document_Template_id_seq" OWNED BY "Agency_Document_Template"."id";

ALTER SEQUENCE "Agency_Fiscal_Year_id_seq" OWNED BY "Agency_Fiscal_Year"."id";

ALTER SEQUENCE "Agency_Funding_Subtype_id_seq" OWNED BY "Agency_Funding_Subtype"."id";

ALTER SEQUENCE "Agency_Funding_Type_id_seq" OWNED BY "Agency_Funding_Type"."id";

ALTER SEQUENCE "Agency_Holdback_Basis_id_seq" OWNED BY "Agency_Holdback_Basis"."id";

ALTER SEQUENCE "Agency_Monitor_Type_id_seq" OWNED BY "Agency_Monitor_Type"."id";

ALTER SEQUENCE "Agency_Profile_id_seq" OWNED BY "Agency_Profile"."id";
-- Palette matching uses only this source's own identity fields.
CREATE INDEX ay_profile_search_name_en_trgm ON "Agency_Profile" USING gin (lower(coalesce(egcs_ay_name_en, '')) gin_trgm_ops) WHERE (_deleted = false AND egcs_ay_active = true);
CREATE INDEX ay_profile_search_name_en_prefix ON "Agency_Profile" USING btree (lower(coalesce(egcs_ay_name_en, '')) text_pattern_ops) WHERE (_deleted = false AND egcs_ay_active = true);
CREATE INDEX ay_profile_search_name_fr_trgm ON "Agency_Profile" USING gin (lower(coalesce(egcs_ay_name_fr, '')) gin_trgm_ops) WHERE (_deleted = false AND egcs_ay_active = true);
CREATE INDEX ay_profile_search_name_fr_prefix ON "Agency_Profile" USING btree (lower(coalesce(egcs_ay_name_fr, '')) text_pattern_ops) WHERE (_deleted = false AND egcs_ay_active = true);
CREATE INDEX ay_profile_search_abbreviation_en_trgm ON "Agency_Profile" USING gin (lower(coalesce(egcs_ay_abbreviation_en, '')) gin_trgm_ops) WHERE (_deleted = false AND egcs_ay_active = true);
CREATE INDEX ay_profile_search_abbreviation_fr_trgm ON "Agency_Profile" USING gin (lower(coalesce(egcs_ay_abbreviation_fr, '')) gin_trgm_ops) WHERE (_deleted = false AND egcs_ay_active = true);
CREATE INDEX ay_profile_search_abbreviation_en_exact ON "Agency_Profile" USING btree (lower(coalesce(egcs_ay_abbreviation_en, '')) text_pattern_ops) WHERE (_deleted = false AND egcs_ay_active = true);
CREATE INDEX ay_profile_search_abbreviation_fr_exact ON "Agency_Profile" USING btree (lower(coalesce(egcs_ay_abbreviation_fr, '')) text_pattern_ops) WHERE (_deleted = false AND egcs_ay_active = true);
CREATE INDEX ay_profile_search_agencyfinancialsystemid_exact ON "Agency_Profile" USING btree (egcs_ay_agencyfinancialsystemid) WHERE (_deleted = false AND egcs_ay_active = true);
CREATE INDEX ay_profile_search_gwcoa_number_exact ON "Agency_Profile" USING btree (egcs_ay_gwcoa_number) WHERE (_deleted = false AND egcs_ay_active = true);
END $baseline$`.execute(db)
}

/** Installs the current installFunctions definitions for this subject on a fresh database. */
export const installFunctions = async (db: Kysely<Database>): Promise<void> => {
  await sql`DO $baseline$ BEGIN
CREATE FUNCTION create_default_agency_statuses()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
    $function$;

CREATE FUNCTION enforce_agency_claim_reconciliation_statuses()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
    $function$;

CREATE FUNCTION enforce_agency_custom_field_option()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      IF TG_OP = 'UPDATE' AND NEW.egcs_ay_field IS DISTINCT FROM OLD.egcs_ay_field THEN
        RAISE EXCEPTION 'Agency custom field option parent is immutable'
          USING ERRCODE = '23514', CONSTRAINT = 'ay_chk_custom_field_option_parent_immutable';
      END IF;
      IF NOT NEW._deleted AND (TG_OP = 'INSERT' OR OLD._deleted) AND NOT EXISTS (
        SELECT 1 FROM "Agency_Custom_Field" field
        WHERE field.id = NEW.egcs_ay_field AND field.egcs_ay_kind = 'relational' AND field._deleted = false
        FOR SHARE
      ) THEN
        RAISE EXCEPTION 'Option requires an active relational Agency field'
          USING ERRCODE = '23514', CONSTRAINT = 'ay_chk_custom_field_option_parent_active';
      END IF;
      RETURN NEW;
    END $function$;

CREATE FUNCTION guard_referenced_proponent_subtype()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      IF (NEW._deleted OR NEW.egcs_ay_organizationagency IS DISTINCT FROM OLD.egcs_ay_organizationagency) AND EXISTS (
        SELECT 1 FROM "Funding_Case_Agreement_Applicant_Recipient" r
        JOIN "Funding_Case_Agreement_Profile" a ON a.id = r.egcs_fc_fundingagreement
        WHERE r.egcs_fc_applicantrecipientsubtype = OLD.id AND NOT r._deleted AND NOT a._deleted
      ) THEN
        RAISE EXCEPTION 'Agreement proponent type in use' USING ERRCODE = '23514', CONSTRAINT = 'agreement_proponent_type_eligible';
      END IF;
      RETURN NEW;
    END $function$;

CREATE FUNCTION validate_credit_memo_commitment_chart_link()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      PERFORM id FROM "Agency_Profile" WHERE id = NEW.egcs_ay_organizationagency FOR UPDATE;
      IF TG_OP = 'UPDATE' AND NEW._deleted AND NOT OLD._deleted AND EXISTS (
        SELECT 1 FROM "Agency_Chart_of_Account" linked
        WHERE linked.egcs_ay_commitmentchartofaccount = OLD.id AND NOT linked._deleted
      ) THEN
        RAISE EXCEPTION 'Commitment account is linked by a Credit Memo account'
          USING ERRCODE = '23514', CONSTRAINT = 'ay_chk_creditmemo_commitmentchart_in_use';
      END IF;
      IF NEW._deleted OR NEW.egcs_ay_commitmentchartofaccount IS NULL THEN RETURN NEW; END IF;
      IF NEW.egcs_ay_kind <> 'credit_memo' OR NOT EXISTS (
        SELECT 1 FROM "Agency_Chart_of_Account" commitment
        WHERE commitment.id = NEW.egcs_ay_commitmentchartofaccount
          AND commitment.egcs_ay_kind = 'commitment' AND NOT commitment._deleted
          AND commitment.egcs_ay_organizationagency = NEW.egcs_ay_organizationagency
          AND commitment.egcs_ay_fiscalyear = NEW.egcs_ay_fiscalyear
          AND commitment.egcs_ay_currency = NEW.egcs_ay_currency
        FOR SHARE OF commitment
      ) THEN
        RAISE EXCEPTION 'Credit Memo commitment account must be active and match Agency, fiscal year and currency'
          USING ERRCODE = '23514', CONSTRAINT = 'ay_chk_creditmemo_commitmentchart';
      END IF;
      RETURN NEW;
    END $function$;

CREATE FUNCTION protect_chart_currency()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      IF NEW.egcs_ay_kind IS DISTINCT FROM OLD.egcs_ay_kind THEN
        RAISE EXCEPTION 'Chart of Account kind is immutable'
          USING ERRCODE = '23514', CONSTRAINT = 'ay_chk_chart_kind_immutable';
      END IF;
      IF NEW.egcs_ay_currency IS DISTINCT FROM OLD.egcs_ay_currency THEN
        RAISE EXCEPTION 'Chart of Account currency is immutable'
          USING ERRCODE = '23514', CONSTRAINT = 'ay_chk_chart_currency_immutable';
      END IF;
      RETURN NEW;
    END $function$;

CREATE FUNCTION protect_chart_fiscal_year_owner()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      IF NEW.egcs_ay_organizationagency IS DISTINCT FROM OLD.egcs_ay_organizationagency
        AND EXISTS (SELECT 1 FROM "Agency_Chart_of_Account" chart WHERE chart.egcs_ay_fiscalyear = OLD.id) THEN
        RAISE EXCEPTION 'Fiscal year Agency cannot change while Charts refer to it'
          USING ERRCODE = '23514', CONSTRAINT = 'ay_chk_chartfiscalyearownerimmutable';
      END IF;
      IF NEW._deleted AND NOT OLD._deleted AND EXISTS (
        SELECT 1 FROM "Agency_Chart_of_Account" chart
        JOIN "Transfer_Payment_Stream_Chart_of_Account" linked
          ON linked.egcs_tp_agencychartofaccount = chart.id
        WHERE chart.egcs_ay_fiscalyear = OLD.id
          AND chart._deleted = false AND linked._deleted = false
      ) THEN
        RAISE EXCEPTION 'Fiscal year cannot retire while a live Stream Chart is linked'
          USING ERRCODE = '23514', CONSTRAINT = 'ay_chk_chartfiscalyearlinked';
      END IF;
      RETURN NEW;
    END $function$;

CREATE FUNCTION trg_fn_agency_calculation_source()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      IF (NEW._deleted OR NEW.egcs_ay_organizationagency <> OLD.egcs_ay_organizationagency) AND EXISTS (
        SELECT 1 FROM "Agency_Cost_Category_Line_Item" WHERE NOT _deleted AND egcs_ay_sourcecategory = NEW.id
      ) THEN RAISE EXCEPTION 'Cost category is a calculation source' USING ERRCODE = '23514', CONSTRAINT = 'ay_chk_lineitemcalculation'; END IF;
      RETURN NEW;
    END $function$;

CREATE FUNCTION trg_fn_agency_line_calculation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE owner_id bigint;
    BEGIN
      SELECT egcs_ay_organizationagency INTO owner_id FROM "Agency_Cost_Category" WHERE id = NEW.egcs_ay_organizationcostcategory;
      PERFORM id FROM "Agency_Profile" WHERE id = owner_id FOR UPDATE;
      IF NEW._deleted THEN RETURN NEW; END IF;
      IF NEW.egcs_ay_calculationmode <> 'manual' AND EXISTS (
        SELECT 1 FROM "Agency_Cost_Category_Line_Item" WHERE NOT _deleted
          AND egcs_ay_sourcecategory = NEW.egcs_ay_organizationcostcategory AND id <> NEW.id
      ) THEN RAISE EXCEPTION 'Referenced category must contain only manual items' USING ERRCODE = '23514', CONSTRAINT = 'ay_chk_lineitemcalculation'; END IF;
      IF NEW.egcs_ay_calculationmode = 'category' AND (
        NEW.egcs_ay_sourcecategory = NEW.egcs_ay_organizationcostcategory
        OR NOT EXISTS (SELECT 1 FROM "Agency_Cost_Category" WHERE id = NEW.egcs_ay_sourcecategory AND NOT _deleted AND egcs_ay_organizationagency = owner_id)
        OR EXISTS (SELECT 1 FROM "Agency_Cost_Category_Line_Item" WHERE NOT _deleted AND egcs_ay_organizationcostcategory = NEW.egcs_ay_sourcecategory AND egcs_ay_calculationmode <> 'manual' AND id <> NEW.id)
      ) THEN RAISE EXCEPTION 'Invalid percentage source category' USING ERRCODE = '23514', CONSTRAINT = 'ay_chk_lineitemcalculation'; END IF;
      RETURN NEW;
    END $function$;

CREATE FUNCTION validate_agency_operational_catalog()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE fiscal_agency bigint; attachment_agency bigint;
    BEGIN
      IF TG_OP = 'UPDATE' THEN
        IF NEW.egcs_ay_organizationagency IS DISTINCT FROM OLD.egcs_ay_organizationagency THEN
          RAISE EXCEPTION 'Agency catalog ownership is immutable'
            USING ERRCODE = '23514', CONSTRAINT = 'ay_chk_operationalcatalogownerimmutable';
        END IF;
        IF TG_TABLE_NAME = 'Agency_Chart_of_Account' AND
          (to_jsonb(NEW)->>'egcs_ay_fiscalyear') IS DISTINCT FROM (to_jsonb(OLD)->>'egcs_ay_fiscalyear') THEN
          RAISE EXCEPTION 'Chart fiscal year is immutable'
            USING ERRCODE = '23514', CONSTRAINT = 'ay_chk_chartfiscalyearimmutable';
        END IF;
      END IF;
      IF TG_TABLE_NAME = 'Agency_Chart_of_Account' AND TG_OP='UPDATE' AND NEW._deleted AND NOT OLD._deleted
        AND EXISTS (SELECT 1 FROM "Transfer_Payment_Stream_Chart_of_Account" selection
          WHERE selection.egcs_tp_agencychartofaccount=OLD.id AND NOT selection._deleted) THEN
        RAISE EXCEPTION 'Agency Chart selection is in use by a Stream' USING ERRCODE='23514';
      END IF;
      IF TG_TABLE_NAME = 'Agency_Chart_of_Account' AND NOT NEW._deleted THEN
        SELECT fiscal.egcs_ay_organizationagency INTO fiscal_agency
        FROM "Agency_Fiscal_Year" fiscal
        WHERE fiscal.id = (to_jsonb(NEW)->>'egcs_ay_fiscalyear')::bigint AND fiscal._deleted = false
        FOR SHARE OF fiscal;
        IF fiscal_agency IS DISTINCT FROM NEW.egcs_ay_organizationagency THEN
          RAISE EXCEPTION 'Chart fiscal year must belong to its Agency'
            USING ERRCODE = '23514', CONSTRAINT = 'ay_chk_chartfiscalyearagency';
        END IF;
      ELSIF TG_TABLE_NAME = 'Agency_Document_Template' AND NOT NEW._deleted THEN
        SELECT type.egcs_cn_agency INTO attachment_agency
        FROM "Common_Attachment" attachment
        JOIN "Common_Attachment_Types" type ON type.id = attachment.egcs_cn_attachmenttype
        WHERE attachment.id = (to_jsonb(NEW)->>'egcs_ay_templateattachment_en')::bigint
          AND attachment._deleted = false AND type._deleted = false;
        IF attachment_agency IS DISTINCT FROM NEW.egcs_ay_organizationagency THEN
          RAISE EXCEPTION 'English template attachment must belong to its Agency'
            USING ERRCODE = '23514', CONSTRAINT = 'ay_chk_documenttemplateattachmentenagency';
        END IF;
        attachment_agency := NULL;
        SELECT type.egcs_cn_agency INTO attachment_agency
        FROM "Common_Attachment" attachment
        JOIN "Common_Attachment_Types" type ON type.id = attachment.egcs_cn_attachmenttype
        WHERE attachment.id = (to_jsonb(NEW)->>'egcs_ay_templateattachment_fr')::bigint
          AND attachment._deleted = false AND type._deleted = false;
        IF attachment_agency IS DISTINCT FROM NEW.egcs_ay_organizationagency THEN
          RAISE EXCEPTION 'French template attachment must belong to its Agency'
            USING ERRCODE = '23514', CONSTRAINT = 'ay_chk_documenttemplateattachmentfragency';
        END IF;
      END IF;
      RETURN NEW;
    END $function$;
END $baseline$`.execute(db)
}

/** Installs the current installForeignKeys definitions for this subject on a fresh database. */
export const installForeignKeys = async (db: Kysely<Database>): Promise<void> => {
  await sql`DO $baseline$ BEGIN
ALTER TABLE "Agency_Account_Receivable_Type" ADD CONSTRAINT "Agency_Account_Receivable_Type_egcs_ay_organizationagency_fkey" FOREIGN KEY (egcs_ay_organizationagency) REFERENCES "Agency_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Agency_Address_Type" ADD CONSTRAINT "Agency_Address_Type_egcs_ay_organizationagency_fkey" FOREIGN KEY (egcs_ay_organizationagency) REFERENCES "Agency_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Agency_Agreement_Type" ADD CONSTRAINT "Agency_Agreement_Type_egcs_ay_organizationagency_fkey" FOREIGN KEY (egcs_ay_organizationagency) REFERENCES "Agency_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Agency_Applicant_Recipient_Subtype" ADD CONSTRAINT "Agency_Applicant_Recipient_Subt_egcs_ay_organizationagency_fkey" FOREIGN KEY (egcs_ay_organizationagency) REFERENCES "Agency_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Agency_Approval_Behalf_Type" ADD CONSTRAINT "Agency_Approval_Behalf_Type_egcs_ay_organizationagency_fkey" FOREIGN KEY (egcs_ay_organizationagency) REFERENCES "Agency_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Agency_Chart_of_Account" ADD CONSTRAINT "ay_fk_creditmemo_commitmentchart" FOREIGN KEY (egcs_ay_commitmentchartofaccount) REFERENCES "Agency_Chart_of_Account"(id) ON DELETE RESTRICT;

ALTER TABLE "Agency_Chart_of_Account" ADD CONSTRAINT "Agency_Chart_of_Account_egcs_ay_fiscalyear_fkey" FOREIGN KEY (egcs_ay_fiscalyear) REFERENCES "Agency_Fiscal_Year"(id) ON DELETE RESTRICT;

ALTER TABLE "Agency_Chart_of_Account" ADD CONSTRAINT "Agency_Chart_of_Account_egcs_ay_organizationagency_fkey" FOREIGN KEY (egcs_ay_organizationagency) REFERENCES "Agency_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Agency_Commitment_Type" ADD CONSTRAINT "Agency_Commitment_Type_egcs_ay_organizationagency_fkey" FOREIGN KEY (egcs_ay_organizationagency) REFERENCES "Agency_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Agency_Cost_Category" ADD CONSTRAINT "Agency_Cost_Category_egcs_ay_organizationagency_fkey" FOREIGN KEY (egcs_ay_organizationagency) REFERENCES "Agency_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Agency_Cost_Category_Line_Item" ADD CONSTRAINT "Agency_Cost_Category_Line_Ite_egcs_ay_organizationcostcate_fkey" FOREIGN KEY (egcs_ay_organizationcostcategory) REFERENCES "Agency_Cost_Category"(id) ON DELETE RESTRICT;

ALTER TABLE "Agency_Cost_Category_Line_Item" ADD CONSTRAINT "Agency_Cost_Category_Line_Item_egcs_ay_sourcecategory_fkey" FOREIGN KEY (egcs_ay_sourcecategory) REFERENCES "Agency_Cost_Category"(id) ON DELETE RESTRICT;

ALTER TABLE "Agency_Custom_Field" ADD CONSTRAINT "Agency_Custom_Field_egcs_ay_agency_fkey" FOREIGN KEY (egcs_ay_agency) REFERENCES "Agency_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Agency_Custom_Field_Option" ADD CONSTRAINT "Agency_Custom_Field_Option_egcs_ay_field_fkey" FOREIGN KEY (egcs_ay_field) REFERENCES "Agency_Custom_Field"(id) ON DELETE RESTRICT;

ALTER TABLE "Agency_Document_Template" ADD CONSTRAINT "Agency_Document_Template_egcs_ay_organizationagency_fkey" FOREIGN KEY (egcs_ay_organizationagency) REFERENCES "Agency_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Agency_Document_Template" ADD CONSTRAINT "Agency_Document_Template_egcs_ay_templateattachment_en_fkey" FOREIGN KEY (egcs_ay_templateattachment_en) REFERENCES "Common_Attachment"(id) ON DELETE RESTRICT;

ALTER TABLE "Agency_Document_Template" ADD CONSTRAINT "Agency_Document_Template_egcs_ay_templateattachment_fr_fkey" FOREIGN KEY (egcs_ay_templateattachment_fr) REFERENCES "Common_Attachment"(id) ON DELETE RESTRICT;

ALTER TABLE "Agency_Fiscal_Year" ADD CONSTRAINT "Agency_Fiscal_Year_egcs_ay_organizationagency_fkey" FOREIGN KEY (egcs_ay_organizationagency) REFERENCES "Agency_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Agency_Funding_Subtype" ADD CONSTRAINT "Agency_Funding_Subtype_egcs_ay_fundingtype_fkey" FOREIGN KEY (egcs_ay_fundingtype) REFERENCES "Agency_Funding_Type"(id) ON DELETE RESTRICT;

ALTER TABLE "Agency_Funding_Type" ADD CONSTRAINT "Agency_Funding_Type_egcs_ay_organizationagency_fkey" FOREIGN KEY (egcs_ay_organizationagency) REFERENCES "Agency_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Agency_Holdback_Basis" ADD CONSTRAINT "Agency_Holdback_Basis_egcs_ay_organizationagency_fkey" FOREIGN KEY (egcs_ay_organizationagency) REFERENCES "Agency_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Agency_Monitor_Type" ADD CONSTRAINT "Agency_Monitor_Type_egcs_ay_organizationagency_fkey" FOREIGN KEY (egcs_ay_organizationagency) REFERENCES "Agency_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Agency_Profile" ADD CONSTRAINT "Agency_Profile_egcs_ay_claimreconciliationfinalstatus_fkey" FOREIGN KEY (egcs_ay_claimreconciliationfinalstatus) REFERENCES "Common_Status"(id) ON DELETE RESTRICT;

ALTER TABLE "Agency_Profile" ADD CONSTRAINT "Agency_Profile_egcs_ay_claimreconciliationstartstatus_fkey" FOREIGN KEY (egcs_ay_claimreconciliationstartstatus) REFERENCES "Common_Status"(id) ON DELETE RESTRICT;

ALTER TABLE "Agency_Profile" ADD CONSTRAINT "ay_ref_profilegwcoanumber" FOREIGN KEY (egcs_ay_gwcoa_number) REFERENCES "Common_GWCOA"(egcs_cn_number) ON DELETE RESTRICT;
END $baseline$`.execute(db)
}

/** Installs the current installTriggers definitions for this subject on a fresh database. */
export const installTriggers = async (db: Kysely<Database>): Promise<void> => {
  await sql`DO $baseline$ BEGIN
CREATE TRIGGER protect_workflow_profile_conditions AFTER DELETE OR UPDATE OF _deleted, egcs_ay_organizationagency ON "Agency_Agreement_Type" FOR EACH ROW EXECUTE FUNCTION validate_workflow_profile_references();

CREATE TRIGGER guard_referenced_proponent_subtype BEFORE UPDATE ON "Agency_Applicant_Recipient_Subtype" FOR EACH ROW EXECUTE FUNCTION guard_referenced_proponent_subtype();

CREATE TRIGGER protect_workflow_profile_conditions AFTER DELETE OR UPDATE OF _deleted, egcs_ay_organizationagency ON "Agency_Applicant_Recipient_Subtype" FOR EACH ROW EXECUTE FUNCTION validate_workflow_profile_references();

CREATE TRIGGER trg_protect_chart_currency BEFORE UPDATE OF egcs_ay_currency, egcs_ay_kind ON "Agency_Chart_of_Account" FOR EACH ROW EXECUTE FUNCTION protect_chart_currency();
CREATE TRIGGER validate_credit_memo_commitment_chart_link BEFORE INSERT OR UPDATE ON "Agency_Chart_of_Account" FOR EACH ROW EXECUTE FUNCTION validate_credit_memo_commitment_chart_link();

CREATE TRIGGER validate_agency_operational_catalog BEFORE INSERT OR UPDATE ON "Agency_Chart_of_Account" FOR EACH ROW EXECUTE FUNCTION validate_agency_operational_catalog();

CREATE TRIGGER validate_agency_operational_catalog BEFORE INSERT OR UPDATE ON "Agency_Commitment_Type" FOR EACH ROW EXECUTE FUNCTION validate_agency_operational_catalog();

CREATE TRIGGER agency_calculation_source BEFORE UPDATE ON "Agency_Cost_Category" FOR EACH ROW EXECUTE FUNCTION trg_fn_agency_calculation_source();

CREATE TRIGGER agency_line_calculation BEFORE INSERT OR UPDATE ON "Agency_Cost_Category_Line_Item" FOR EACH ROW EXECUTE FUNCTION trg_fn_agency_line_calculation();

CREATE TRIGGER protect_agency_custom_field_identity BEFORE UPDATE ON "Agency_Custom_Field" FOR EACH ROW EXECUTE FUNCTION protect_agency_custom_field_identity();

CREATE TRIGGER enforce_agency_custom_field_option BEFORE INSERT OR UPDATE OF egcs_ay_field, _deleted ON "Agency_Custom_Field_Option" FOR EACH ROW EXECUTE FUNCTION enforce_agency_custom_field_option();

CREATE TRIGGER validate_agency_operational_catalog BEFORE INSERT OR UPDATE ON "Agency_Document_Template" FOR EACH ROW EXECUTE FUNCTION validate_agency_operational_catalog();

CREATE TRIGGER protect_chart_fiscal_year_owner BEFORE UPDATE OF egcs_ay_organizationagency, _deleted ON "Agency_Fiscal_Year" FOR EACH ROW EXECUTE FUNCTION protect_chart_fiscal_year_owner();

CREATE TRIGGER validate_agency_operational_catalog BEFORE INSERT OR UPDATE ON "Agency_Holdback_Basis" FOR EACH ROW EXECUTE FUNCTION validate_agency_operational_catalog();

CREATE TRIGGER validate_agency_operational_catalog BEFORE INSERT OR UPDATE ON "Agency_Monitor_Type" FOR EACH ROW EXECUTE FUNCTION validate_agency_operational_catalog();

CREATE TRIGGER trg_create_default_agency_statuses AFTER INSERT ON "Agency_Profile" FOR EACH ROW EXECUTE FUNCTION create_default_agency_statuses();

CREATE TRIGGER trg_enforce_agency_claim_reconciliation_statuses BEFORE INSERT OR UPDATE OF egcs_ay_claimreconciliationstartstatus, egcs_ay_claimreconciliationfinalstatus ON "Agency_Profile" FOR EACH ROW EXECUTE FUNCTION enforce_agency_claim_reconciliation_statuses();
END $baseline$`.execute(db)
}
