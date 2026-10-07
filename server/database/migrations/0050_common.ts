import { sql, type Kysely } from 'kysely'
import type { Database } from '../../../shared/types/database'

// Clean-cutover baseline: common. Edit this subject directly.

/** Installs the current up definitions for this subject on a fresh database. */
export const up = async (db: Kysely<Database>): Promise<void> => {
  await sql`DO $baseline$ BEGIN
CREATE SEQUENCE "Common_Additional_Reviewers_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Common_Address_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Common_Approval_Certification_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Common_Approval_Step_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Common_Approval_Template_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Common_Approval_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Common_Assessment_Custom_Outcome_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Common_Assessment_Outcome_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Common_Assessment_Response_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Common_Assessment_Schema_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Common_Assessment_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Common_Attachment_Types_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Common_Attachment_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Common_Certification_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Common_Checklist_Response_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Common_Checklist_Schema_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Common_Checklist_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Common_Completion_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Common_Contact_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Common_Entity_Assignment_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Common_Entity_Attachment_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Common_Entity_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Common_GWCOA_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Common_Group_Member_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Common_Group_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Common_Publication_Transition_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Common_Publication_Version_Reference_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Common_Publication_Version_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Common_Publication_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Common_Recommendation_Set_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Common_Recommendation_Setup_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Common_Review_Response_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Common_Review_Set_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Common_Review_Setup_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Common_Routing_Slip_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Common_Runtime_Item_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Common_Runtime_Transition_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Common_Runtime_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Common_Status_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Common_User_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Common_Workflow_Member_Condition_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Common_Workflow_Owner_Blocker_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Common_Workflow_Publication_Condition_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Common_Workflow_Publication_Status_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Common_Workflow_Setup_Allowed_Start_Status_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Common_Workflow_Setup_Member_Owner_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Common_Workflow_Setup_Member_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Common_Workflow_Status_Transition_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE TABLE "Common_Additional_Reviewers" (
  "id" bigint DEFAULT nextval('"Common_Additional_Reviewers_id_seq"'::regclass) NOT NULL,
  "egcs_cn_entitytype" character varying(128) NOT NULL,
  "egcs_cn_entityid" bigint NOT NULL,
  "egcs_cn_comments" text,
  "egcs_cn_user" bigint,
  "egcs_cn_completedat" timestamp with time zone,
  "_deleted" boolean DEFAULT false NOT NULL,
  "egcs_cn_group" bigint,
  CONSTRAINT "Common_Additional_Reviewers_pkey" PRIMARY KEY (id),
  CONSTRAINT "cn_chk_additional_reviewer_assignee" CHECK (((egcs_cn_user IS NOT NULL) OR (egcs_cn_group IS NOT NULL))),
  CONSTRAINT "cn_chk_additionalreviewersentitytype" CHECK (((egcs_cn_entitytype)::text <> ALL ((ARRAY['fundingopportunity'::character varying, 'fundingcaseintake'::character varying, 'fundingcaseagreement'::character varying, 'applicantrecipient'::character varying, 'transferpaymentstream'::character varying])::text[])))
);

CREATE INDEX cn_idx_additionalreviewersentitytypeentityid ON "Common_Additional_Reviewers" USING btree (egcs_cn_entitytype, egcs_cn_entityid) WHERE (_deleted = false);

CREATE TABLE "Common_Address" (
  "id" bigint DEFAULT nextval('"Common_Address_id_seq"'::regclass) NOT NULL,
  "egcs_cn_federalridingid" integer NOT NULL,
  "egcs_cn_addresscity" character varying(255) NOT NULL,
  "egcs_cn_addresscountry" countries NOT NULL,
  "egcs_cn_addresssubdivision" character varying(255) NOT NULL,
  "egcs_cn_gc_addressid" bigint,
  "egcs_cn_latitude" numeric(10,7),
  "egcs_cn_longitude" numeric(10,7),
  "egcs_cn_mainphone" bigint NOT NULL,
  "egcs_cn_mainphoneextension" smallint,
  "egcs_cn_postalcodezipcode" character varying(255) NOT NULL,
  "egcs_cn_street1" character varying(255) NOT NULL,
  "egcs_cn_street2" character varying(255),
  "egcs_cn_street3" character varying(255),
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Common_Address_pkey" PRIMARY KEY (id),
  CONSTRAINT "cn_chk_addressaddresscountryaddresssubdivision" CHECK ((((egcs_cn_addresscountry = 'ca'::countries) AND ((egcs_cn_addresssubdivision)::text = ANY ((enum_range(NULL::jurisdiction))::text[]))) OR (egcs_cn_addresscountry <> 'ca'::countries)))
);

CREATE TABLE "Common_Approval" (
  "id" bigint DEFAULT nextval('"Common_Approval_id_seq"'::regclass) NOT NULL,
  "egcs_cn_runtimeitem" bigint NOT NULL,
  "egcs_cn_sequence" numeric NOT NULL,
  "egcs_cn_name_en" character varying(255) NOT NULL,
  "egcs_cn_name_fr" character varying(255) NOT NULL,
  "egcs_cn_routingslip" bigint NOT NULL,
  "egcs_cn_defaultuser" bigint,
  "egcs_cn_assigneduser" bigint,
  "egcs_cn_requiregroupdetails" boolean DEFAULT false NOT NULL,
  "egcs_cn_onbehalf" bigint,
  "egcs_cn_approvername" text,
  "egcs_cn_approvalpositiontitle" text,
  "egcs_cn_isadded" boolean NOT NULL,
  "egcs_cn_approvalvalue" boolean,
  "egcs_cn_approvaldate" timestamp with time zone,
  "egcs_cn_attachment" bigint,
  "egcs_cn_comment" text,
  "egcs_cn_defaultgroup" bigint,
  "egcs_cn_assignedgroup" bigint,
  CONSTRAINT "Common_Approval_egcs_cn_runtimeitem_key" UNIQUE (egcs_cn_runtimeitem),
  CONSTRAINT "Common_Approval_pkey" PRIMARY KEY (id),
  CONSTRAINT "cn_chk_approval_current_assignee" CHECK (((egcs_cn_assigneduser IS NOT NULL) OR (egcs_cn_assignedgroup IS NOT NULL))),
  CONSTRAINT "cn_chk_approval_default_assignee" CHECK (((((egcs_cn_defaultuser IS NOT NULL))::integer + ((egcs_cn_defaultgroup IS NOT NULL))::integer) = 1)),
  CONSTRAINT "cn_chk_approval_onbehalf" CHECK (((egcs_cn_onbehalf IS NULL) OR (egcs_cn_defaultuser IS NOT NULL) OR (egcs_cn_defaultgroup IS NOT NULL))),
  CONSTRAINT "cn_chk_approvalapprovalvalueapprovalpositiontitlenull" CHECK ((NOT ((egcs_cn_approvalpositiontitle IS NULL) AND (egcs_cn_approvalvalue IS NOT NULL))))
);

CREATE UNIQUE INDEX cn_idx_approvalroutingslipsequence ON "Common_Approval" USING btree (egcs_cn_routingslip, egcs_cn_sequence);

CREATE TABLE "Common_Approval_Certification" (
  "id" bigint DEFAULT nextval('"Common_Approval_Certification_id_seq"'::regclass) NOT NULL,
  "egcs_cn_optional" boolean NOT NULL,
  "egcs_cn_certification_en" text NOT NULL,
  "egcs_cn_certification_fr" text NOT NULL,
  "egcs_cn_value" boolean,
  "egcs_cn_approval" bigint NOT NULL,
  CONSTRAINT "Common_Approval_Certification_pkey" PRIMARY KEY (id)
);

CREATE TABLE "Common_Approval_Step" (
  "id" bigint DEFAULT nextval('"Common_Approval_Step_id_seq"'::regclass) NOT NULL,
  "egcs_cn_sequence" integer NOT NULL,
  "egcs_cn_description_en" text NOT NULL,
  "egcs_cn_description_fr" text NOT NULL,
  "egcs_cn_name_en" character varying(255) NOT NULL,
  "egcs_cn_name_fr" character varying(255) NOT NULL,
  "egcs_cn_approvaltemplate" bigint NOT NULL,
  "egcs_cn_defaultuser" bigint,
  "egcs_cn_approvertitle" character varying(255) NOT NULL,
  "egcs_cn_requiregroupdetails" boolean DEFAULT false NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  "egcs_cn_defaultgroup" bigint,
  CONSTRAINT "Common_Approval_Step_pkey" PRIMARY KEY (id),
  CONSTRAINT "cn_chk_approvalstep_assignee" CHECK (((((egcs_cn_defaultuser IS NOT NULL))::integer + ((egcs_cn_defaultgroup IS NOT NULL))::integer) = 1))
);

CREATE UNIQUE INDEX cn_idx_approvalstepapprovaltemplatenameen ON "Common_Approval_Step" USING btree (egcs_cn_approvaltemplate, egcs_cn_name_en) WHERE (_deleted = false);

CREATE UNIQUE INDEX cn_idx_approvalstepapprovaltemplatenamefr ON "Common_Approval_Step" USING btree (egcs_cn_approvaltemplate, egcs_cn_name_fr) WHERE (_deleted = false);

CREATE TABLE "Common_Approval_Template" (
  "id" bigint NOT NULL,
  "egcs_cn_description_en" text NOT NULL,
  "egcs_cn_description_fr" text NOT NULL,
  "egcs_cn_name_en" character varying(255) NOT NULL,
  "egcs_cn_name_fr" character varying(255) NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  "egcs_cn_publicationkind" character varying(64) DEFAULT 'approval_template'::character varying NOT NULL,
  "egcs_cn_agency" bigint NOT NULL,
  "egcs_cn_allowadditionalapprovals" boolean DEFAULT false NOT NULL,
  "egcs_cn_defaultaddedapprovalname_en" character varying(255),
  "egcs_cn_defaultaddedapprovalname_fr" character varying(255),
  "egcs_cn_allowaddedapprovalnamechanges" boolean DEFAULT false NOT NULL,
  "egcs_cn_allowaddedapprovalcertificationchanges" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Common_Approval_Template_pkey" PRIMARY KEY (id),
  CONSTRAINT "cn_chk_approvaltemplateadditionalapprovalnames" CHECK (((egcs_cn_allowadditionalapprovals = false) OR ((NULLIF(btrim((egcs_cn_defaultaddedapprovalname_en)::text), ''::text) IS NOT NULL) AND (NULLIF(btrim((egcs_cn_defaultaddedapprovalname_fr)::text), ''::text) IS NOT NULL)))),
  CONSTRAINT "cn_chk_approvaltemplatepublicationkind" CHECK (((egcs_cn_publicationkind)::text = 'approval_template'::text))
);

CREATE UNIQUE INDEX cn_idx_approvaltemplateagencynameen ON "Common_Approval_Template" USING btree (egcs_cn_agency, egcs_cn_name_en) WHERE (_deleted = false);

CREATE UNIQUE INDEX cn_idx_approvaltemplateagencynamefr ON "Common_Approval_Template" USING btree (egcs_cn_agency, egcs_cn_name_fr) WHERE (_deleted = false);

CREATE TABLE "Common_Assessment" (
  "id" bigint DEFAULT nextval('"Common_Assessment_id_seq"'::regclass) NOT NULL,
  "egcs_cn_review" bigint NOT NULL,
  "egcs_cn_reviewresult" numeric(10,2) NOT NULL,
  "egcs_cn_disablecustomoutcomes" boolean DEFAULT false NOT NULL,
  "egcs_cn_disablealignment" boolean DEFAULT false NOT NULL,
  "egcs_cn_reviewalignment" boolean,
  "egcs_cn_reviewalignresult" numeric(10,2),
  "egcs_cn_reviewalignmentnarrative" text,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Common_Assessment_pkey" PRIMARY KEY (id),
  CONSTRAINT "cn_chk_assessmentalignment" CHECK (((egcs_cn_reviewalignment IS DISTINCT FROM true) OR ((egcs_cn_reviewalignmentnarrative IS NOT NULL) AND (egcs_cn_reviewalignresult IS NOT NULL))))
);

CREATE UNIQUE INDEX cn_idx_assessment_active_review ON "Common_Assessment" USING btree (egcs_cn_review) WHERE (_deleted = false);

CREATE TABLE "Common_Assessment_Custom_Outcome" (
  "id" bigint DEFAULT nextval('"Common_Assessment_Custom_Outcome_id_seq"'::regclass) NOT NULL,
  "egcs_cn_name" character varying(255) NOT NULL,
  "egcs_cn_outcome" text NOT NULL,
  "egcs_cn_review" bigint NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Common_Assessment_Custom_Outcome_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX cn_idx_assessmentcustomoutcomenamereview ON "Common_Assessment_Custom_Outcome" USING btree (egcs_cn_name, egcs_cn_review) WHERE (_deleted = false);

CREATE INDEX cn_idx_assessmentcustomoutcomereview ON "Common_Assessment_Custom_Outcome" USING btree (egcs_cn_review) WHERE (_deleted = false);

CREATE TABLE "Common_Assessment_Outcome" (
  "id" bigint DEFAULT nextval('"Common_Assessment_Outcome_id_seq"'::regclass) NOT NULL,
  "egcs_cn_review" bigint NOT NULL,
  "egcs_cn_section" character varying(255) NOT NULL,
  "egcs_cn_subsection" character varying(255) NOT NULL,
  "egcs_cn_name_en" character varying(255) NOT NULL,
  "egcs_cn_name_fr" character varying(255) NOT NULL,
  "egcs_cn_recommendedstrategy" text NOT NULL,
  "egcs_cn_accepted" boolean NOT NULL,
  "egcs_cn_selectedstrategy" character varying(255) NOT NULL,
  "egcs_cn_justification" text,
  "egcs_cn_comment" text NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Common_Assessment_Outcome_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX cn_idx_assessmentoutcomereviewnameen ON "Common_Assessment_Outcome" USING btree (egcs_cn_review, egcs_cn_name_en) WHERE (_deleted = false);

CREATE UNIQUE INDEX cn_idx_assessmentoutcomereviewnamefr ON "Common_Assessment_Outcome" USING btree (egcs_cn_review, egcs_cn_name_fr) WHERE (_deleted = false);

CREATE TABLE "Common_Assessment_Response" (
  "id" bigint DEFAULT nextval('"Common_Assessment_Response_id_seq"'::regclass) NOT NULL,
  "egcs_cn_assessment" bigint NOT NULL,
  "egcs_cn_section" character varying(255) NOT NULL,
  "egcs_cn_subsection" character varying(255) NOT NULL,
  "egcs_cn_question" character varying(255) NOT NULL,
  "egcs_cn_value" numeric(10,2),
  "egcs_cn_comment" text DEFAULT ''::text NOT NULL,
  "egcs_cn_calculated" boolean DEFAULT false NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Common_Assessment_Response_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX cn_idx_assessmentresponse_active_question ON "Common_Assessment_Response" USING btree (egcs_cn_assessment, egcs_cn_section, egcs_cn_subsection, egcs_cn_question) WHERE (_deleted = false);

CREATE TABLE "Common_Assessment_Schema" (
  "id" bigint DEFAULT nextval('"Common_Assessment_Schema_id_seq"'::regclass) NOT NULL,
  "egcs_cn_reviewschema" bigint NOT NULL,
  "egcs_cn_scoringmatrix" jsonb,
  "egcs_cn_assessmentschema" jsonb,
  "egcs_cn_outcomename_en" character varying(255) NOT NULL,
  "egcs_cn_outcomename_fr" character varying(255) NOT NULL,
  "egcs_cn_disablecustomoutcomes" boolean DEFAULT false NOT NULL,
  "egcs_cn_disablealignment" boolean DEFAULT false NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Common_Assessment_Schema_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX cn_idx_assessmentschema_active_review ON "Common_Assessment_Schema" USING btree (egcs_cn_reviewschema) WHERE (_deleted = false);

CREATE TABLE "Common_Attachment" (
  "id" bigint DEFAULT nextval('"Common_Attachment_id_seq"'::regclass) NOT NULL,
  "egcs_cn_attachmenttype" bigint NOT NULL,
  "egcs_cn_name_en" character varying(255) NOT NULL,
  "egcs_cn_name_fr" character varying(255) NOT NULL,
  "egcs_cn_description_en" text NOT NULL,
  "egcs_cn_description_fr" text NOT NULL,
  "egcs_cn_filename" character varying(255) NOT NULL,
  "egcs_cn_provider" character varying(120) NOT NULL,
  "egcs_cn_providerobjectid" character varying(512) NOT NULL,
  "egcs_cn_providerlocator" jsonb NOT NULL,
  "egcs_cn_providermetadata" jsonb,
  "egcs_cn_metadatapersistence" character varying(16),
  "egcs_cn_metadatacontractversion" integer,
  "egcs_cn_mimetype" text NOT NULL,
  "egcs_cn_createdat" timestamp with time zone NOT NULL,
  "egcs_cn_filesize" bigint NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Common_Attachment_pkey" PRIMARY KEY (id),
  CONSTRAINT "cn_chk_attachmentfilesize" CHECK ((egcs_cn_filesize >= 0)),
  CONSTRAINT "cn_chk_attachmentlocatorjson" CHECK (((jsonb_typeof(egcs_cn_providerlocator) = 'object'::text) AND (pg_column_size(egcs_cn_providerlocator) <= 32768))),
  CONSTRAINT "cn_chk_attachmentmetadatacontract" CHECK ((((egcs_cn_providermetadata IS NULL) AND (egcs_cn_metadatapersistence IS NULL) AND (egcs_cn_metadatacontractversion IS NULL)) OR ((egcs_cn_providermetadata IS NOT NULL) AND ((egcs_cn_metadatapersistence)::text = 'host'::text) AND (egcs_cn_metadatacontractversion > 0)) OR ((egcs_cn_providermetadata IS NULL) AND ((egcs_cn_metadatapersistence)::text = 'provider'::text) AND (egcs_cn_metadatacontractversion > 0)))),
  CONSTRAINT "cn_chk_attachmentmetadatajson" CHECK (((egcs_cn_providermetadata IS NULL) OR ((jsonb_typeof(egcs_cn_providermetadata) = 'object'::text) AND (pg_column_size(egcs_cn_providermetadata) <= 16384))))
);

CREATE UNIQUE INDEX cn_idx_attachmentproviderobject ON "Common_Attachment" USING btree (egcs_cn_provider, egcs_cn_providerobjectid);

CREATE TABLE "Common_Attachment_Types" (
  "id" bigint DEFAULT nextval('"Common_Attachment_Types_id_seq"'::regclass) NOT NULL,
  "egcs_cn_agency" bigint NOT NULL,
  "egcs_cn_name_en" character varying(255) NOT NULL,
  "egcs_cn_name_fr" character varying(255) NOT NULL,
  "egcs_cn_description_en" text NOT NULL,
  "egcs_cn_description_fr" text NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Common_Attachment_Types_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX cn_idx_attachmenttypesagencynameen ON "Common_Attachment_Types" USING btree (egcs_cn_agency, egcs_cn_name_en) WHERE (_deleted = false);

CREATE UNIQUE INDEX cn_idx_attachmenttypesagencynamefr ON "Common_Attachment_Types" USING btree (egcs_cn_agency, egcs_cn_name_fr) WHERE (_deleted = false);

CREATE TABLE "Common_Certification" (
  "id" bigint DEFAULT nextval('"Common_Certification_id_seq"'::regclass) NOT NULL,
  "egcs_cn_order" smallint NOT NULL,
  "egcs_cn_description_en" text NOT NULL,
  "egcs_cn_description_fr" text NOT NULL,
  "egcs_cn_name_en" character varying(255) NOT NULL,
  "egcs_cn_name_fr" character varying(255) NOT NULL,
  "egcs_cn_optional" boolean,
  "egcs_cn_certification_en" text NOT NULL,
  "egcs_cn_certification_fr" text NOT NULL,
  "egcs_cn_approvalstep" bigint,
  "egcs_cn_approvaltemplate" bigint,
  "egcs_cn_routingslip" bigint,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Common_Certification_pkey" PRIMARY KEY (id),
  CONSTRAINT "cn_chk_certificationowner" CHECK ((((((egcs_cn_approvalstep IS NOT NULL))::integer + ((egcs_cn_approvaltemplate IS NOT NULL))::integer) + ((egcs_cn_routingslip IS NOT NULL))::integer) = 1))
);

CREATE UNIQUE INDEX cn_idx_certificationapprovalstepnameen ON "Common_Certification" USING btree (egcs_cn_approvalstep, egcs_cn_name_en) WHERE ((_deleted = false) AND (egcs_cn_approvalstep IS NOT NULL));

CREATE UNIQUE INDEX cn_idx_certificationapprovalstepnamefr ON "Common_Certification" USING btree (egcs_cn_approvalstep, egcs_cn_name_fr) WHERE ((_deleted = false) AND (egcs_cn_approvalstep IS NOT NULL));

CREATE UNIQUE INDEX cn_idx_certificationapprovalsteporder ON "Common_Certification" USING btree (egcs_cn_approvalstep, egcs_cn_order) WHERE ((_deleted = false) AND (egcs_cn_approvalstep IS NOT NULL));

CREATE UNIQUE INDEX cn_idx_certificationapprovaltemplatenameen ON "Common_Certification" USING btree (egcs_cn_approvaltemplate, egcs_cn_name_en) WHERE ((_deleted = false) AND (egcs_cn_approvaltemplate IS NOT NULL));

CREATE UNIQUE INDEX cn_idx_certificationapprovaltemplatenamefr ON "Common_Certification" USING btree (egcs_cn_approvaltemplate, egcs_cn_name_fr) WHERE ((_deleted = false) AND (egcs_cn_approvaltemplate IS NOT NULL));

CREATE UNIQUE INDEX cn_idx_certificationapprovaltemplateorder ON "Common_Certification" USING btree (egcs_cn_approvaltemplate, egcs_cn_order) WHERE ((_deleted = false) AND (egcs_cn_approvaltemplate IS NOT NULL));

CREATE UNIQUE INDEX cn_idx_certificationroutingslipnameen ON "Common_Certification" USING btree (egcs_cn_routingslip, egcs_cn_name_en) WHERE ((_deleted = false) AND (egcs_cn_routingslip IS NOT NULL));

CREATE UNIQUE INDEX cn_idx_certificationroutingslipnamefr ON "Common_Certification" USING btree (egcs_cn_routingslip, egcs_cn_name_fr) WHERE ((_deleted = false) AND (egcs_cn_routingslip IS NOT NULL));

CREATE UNIQUE INDEX cn_idx_certificationroutingsliporder ON "Common_Certification" USING btree (egcs_cn_routingslip, egcs_cn_order) WHERE ((_deleted = false) AND (egcs_cn_routingslip IS NOT NULL));

CREATE TABLE "Common_Checklist" (
  "id" bigint DEFAULT nextval('"Common_Checklist_id_seq"'::regclass) NOT NULL,
  "egcs_cn_review" bigint NOT NULL,
  "egcs_cn_result" "Checklist_Result",
  "egcs_cn_evaluationtrace" jsonb,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Common_Checklist_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX cn_idx_checklist_active_review ON "Common_Checklist" USING btree (egcs_cn_review) WHERE (_deleted = false);

CREATE TABLE "Common_Checklist_Response" (
  "id" bigint DEFAULT nextval('"Common_Checklist_Response_id_seq"'::regclass) NOT NULL,
  "egcs_cn_checklist" bigint NOT NULL,
  "egcs_cn_section" character varying(255) NOT NULL,
  "egcs_cn_question" character varying(255) NOT NULL,
  "egcs_cn_answer" "Checklist_Answer" NOT NULL,
  "egcs_cn_comment" text DEFAULT ''::text NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Common_Checklist_Response_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX cn_idx_checklistresponse_active_question ON "Common_Checklist_Response" USING btree (egcs_cn_checklist, egcs_cn_section, egcs_cn_question) WHERE (_deleted = false);

CREATE TABLE "Common_Checklist_Schema" (
  "id" bigint DEFAULT nextval('"Common_Checklist_Schema_id_seq"'::regclass) NOT NULL,
  "egcs_cn_reviewschema" bigint NOT NULL,
  "egcs_cn_checklistschema" jsonb,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Common_Checklist_Schema_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX cn_idx_checklistschema_active_review ON "Common_Checklist_Schema" USING btree (egcs_cn_reviewschema) WHERE (_deleted = false);

CREATE TABLE "Common_Completion" (
  "id" bigint DEFAULT nextval('"Common_Completion_id_seq"'::regclass) NOT NULL,
  "egcs_cn_entitytype" character varying(128) NOT NULL,
  "egcs_cn_entityid" bigint NOT NULL,
  "egcs_cn_comments" text,
  "egcs_cn_user" bigint NOT NULL,
  "egcs_cn_disposition" character varying(32) NOT NULL,
  "egcs_cn_completedat" timestamp with time zone DEFAULT now() NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "cn_uq_completionidentity" UNIQUE (id, egcs_cn_entitytype, egcs_cn_entityid),
  CONSTRAINT "Common_Completion_pkey" PRIMARY KEY (id),
  CONSTRAINT "cn_chk_completiondisposition" CHECK (((egcs_cn_disposition)::text = ANY ((ARRAY['not_applicable'::character varying, 'no_workflow'::character varying, 'workflow_started'::character varying])::text[]))),
  CONSTRAINT "cn_chk_completionnotdeleted" CHECK ((_deleted = false))
);

CREATE UNIQUE INDEX cn_idx_completionentitytypeentityid ON "Common_Completion" USING btree (egcs_cn_entitytype, egcs_cn_entityid);

CREATE TABLE "Common_Contact" (
  "id" bigint DEFAULT nextval('"Common_Contact_id_seq"'::regclass) NOT NULL,
  "egcs_cn_title" character varying(255),
  "egcs_cn_name" character varying(255) NOT NULL,
  "egcs_cn_businessphone" bigint,
  "egcs_cn_businessphoneextension" bigint,
  "egcs_cn_generallanguagepreference" language_preference NOT NULL,
  "egcs_cn_jobtitle_en" character varying(255) NOT NULL,
  "egcs_cn_jobtitle_fr" character varying(255) NOT NULL,
  "egcs_cn_primaryaccount" boolean NOT NULL,
  "egcs_cn_email" citext NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Common_Contact_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX cn_idx_contactemail ON "Common_Contact" USING btree (egcs_cn_email) WHERE (_deleted = false);

CREATE TABLE "Common_Entity" (
  "id" bigint DEFAULT nextval('"Common_Entity_id_seq"'::regclass) NOT NULL,
  "egcs_cn_entitytype" character varying(128) NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Common_Entity_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX cn_idx_entityidentitytype ON "Common_Entity" USING btree (id, egcs_cn_entitytype);

CREATE TABLE "Common_Entity_Assignment" (
  "id" bigint DEFAULT nextval('"Common_Entity_Assignment_id_seq"'::regclass) NOT NULL,
  "egcs_cn_entityid" bigint NOT NULL,
  "egcs_cn_entitytype" character varying(128) NOT NULL,
  "egcs_cn_user" bigint NOT NULL,
  "egcs_cn_isprimary" boolean DEFAULT false NOT NULL,
  "egcs_cn_createdby" bigint NOT NULL,
  "egcs_cn_createdat" timestamp with time zone DEFAULT now() NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Common_Entity_Assignment_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX cn_idx_entityassignment_active_primary ON "Common_Entity_Assignment" USING btree (egcs_cn_entityid, egcs_cn_entitytype) WHERE ((_deleted = false) AND (egcs_cn_isprimary = true));

CREATE UNIQUE INDEX cn_idx_entityassignment_active_user ON "Common_Entity_Assignment" USING btree (egcs_cn_entityid, egcs_cn_entitytype, egcs_cn_user) WHERE (_deleted = false);

CREATE TABLE "Common_Entity_Attachment" (
  "id" bigint DEFAULT nextval('"Common_Entity_Attachment_id_seq"'::regclass) NOT NULL,
  "egcs_cn_attachment" bigint NOT NULL,
  "egcs_cn_entityid" bigint NOT NULL,
  "egcs_cn_entitytype" character varying(128) NOT NULL,
  "egcs_cn_uploadedby" bigint NOT NULL,
  "egcs_cn_createdat" timestamp with time zone DEFAULT now() NOT NULL,
  "egcs_cn_updatedat" timestamp with time zone,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Common_Entity_Attachment_pkey" PRIMARY KEY (id)
);

CREATE INDEX cn_idx_entityattachment_activetarget ON "Common_Entity_Attachment" USING btree (egcs_cn_entitytype, egcs_cn_entityid, id) WHERE (_deleted = false);

CREATE UNIQUE INDEX cn_idx_entityattachment_attachment ON "Common_Entity_Attachment" USING btree (egcs_cn_attachment);

CREATE TABLE "Common_Entity_Type" (
  "egcs_cn_type" character varying(128) NOT NULL,
  "egcs_cn_extensionkey" character varying(128),
  "egcs_cn_localtype" character varying(64) NOT NULL,
  "egcs_cn_label_en" character varying(255) NOT NULL,
  "egcs_cn_label_fr" character varying(255) NOT NULL,
  "egcs_cn_completion" character varying(32) DEFAULT 'none'::character varying NOT NULL,
  "egcs_cn_approvalsubmission" character varying(32) DEFAULT 'none'::character varying NOT NULL,
  "egcs_cn_standardworkflow" character varying(32) DEFAULT 'none'::character varying NOT NULL,
  "egcs_cn_riskrating" character varying(32) DEFAULT 'none'::character varying NOT NULL,
  "egcs_cn_supportsdirectreviews" boolean DEFAULT false NOT NULL,
  "egcs_cn_ownerkind" character varying(32),
  "egcs_cn_assignmentmode" character varying(32),
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Common_Entity_Type_pkey" PRIMARY KEY (egcs_cn_type),
  CONSTRAINT "cn_chk_entitytypeapprovalsubmission" CHECK (((egcs_cn_approvalsubmission)::text = ANY ((ARRAY['explicit'::character varying, 'on_completion'::character varying, 'none'::character varying])::text[]))),
  CONSTRAINT "cn_chk_entitytypecompletion" CHECK (((egcs_cn_completion)::text = ANY ((ARRAY['supported'::character varying, 'none'::character varying])::text[]))),
  CONSTRAINT "cn_chk_entitytypekey" CHECK ((((egcs_cn_type)::text ~ '^[a-z][a-z0-9-]{0,62}(:[a-z][a-z0-9-]{0,62})?$'::text) AND ((egcs_cn_extensionkey IS NULL) = (POSITION((':'::text) IN (egcs_cn_type)) = 0)) AND ((egcs_cn_extensionkey IS NULL) OR ((egcs_cn_type)::text = (((egcs_cn_extensionkey)::text || ':'::text) || (egcs_cn_localtype)::text))))),
  CONSTRAINT "cn_chk_entitytypenotdeleted" CHECK ((_deleted = false)),
  CONSTRAINT "cn_chk_entitytypeowner" CHECK ((((egcs_cn_ownerkind IS NULL) OR ((egcs_cn_ownerkind)::text = ANY ((ARRAY['agency'::character varying, 'agreement'::character varying, 'proponent'::character varying, 'runtime_source'::character varying, 'funding_case'::character varying])::text[]))) AND ((egcs_cn_assignmentmode IS NULL) OR ((egcs_cn_assignmentmode)::text = ANY ((ARRAY['independent'::character varying, 'inherited'::character varying])::text[]))))),
  CONSTRAINT "cn_chk_entitytyperiskrating" CHECK (((egcs_cn_riskrating)::text = ANY ((ARRAY['explicit'::character varying, 'none'::character varying])::text[]))),
  CONSTRAINT "cn_chk_entitytypestandardworkflow" CHECK (((egcs_cn_standardworkflow)::text = ANY ((ARRAY['explicit'::character varying, 'none'::character varying])::text[]))),
  CONSTRAINT "cn_chk_entitytypeworkflow" CHECK (((((egcs_cn_approvalsubmission)::text <> 'on_completion'::text) OR ((egcs_cn_completion)::text = 'supported'::text)) AND (((egcs_cn_riskrating)::text = 'none'::text) OR ((egcs_cn_type)::text = 'fundingcaseagreement'::text))))
);

CREATE TABLE "Common_Extension_Entity_Owner" (
  "egcs_cn_entityid" bigint NOT NULL,
  "egcs_cn_entitytype" character varying(128) NOT NULL,
  "egcs_cn_ownerid" bigint NOT NULL,
  "egcs_cn_ownertype" character varying(128) NOT NULL,
  "egcs_cn_agency" bigint,
  CONSTRAINT "cn_pk_extensionentityowner" PRIMARY KEY (egcs_cn_entityid, egcs_cn_entitytype),
  CONSTRAINT "cn_chk_extensionentityownertype" CHECK (((egcs_cn_ownertype)::text = ANY ((ARRAY['fundingcaseagreement'::character varying, 'applicantrecipient'::character varying])::text[])))
);

CREATE TABLE "Common_GWCOA" (
  "id" bigint DEFAULT nextval('"Common_GWCOA_id_seq"'::regclass) NOT NULL,
  "egcs_cn_number" smallint NOT NULL,
  "egcs_cn_name_en" character varying(255) NOT NULL,
  "egcs_cn_name_fr" character varying(255) NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "cn_uq_gwcoa_number" UNIQUE (egcs_cn_number),
  CONSTRAINT "Common_GWCOA_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX cn_idx_gwcoanumbernameen ON "Common_GWCOA" USING btree (egcs_cn_number, egcs_cn_name_en) WHERE (_deleted = false);

CREATE UNIQUE INDEX cn_idx_gwcoanumbernamefr ON "Common_GWCOA" USING btree (egcs_cn_number, egcs_cn_name_fr) WHERE (_deleted = false);

CREATE TABLE "Common_Group" (
  "id" bigint DEFAULT nextval('"Common_Group_id_seq"'::regclass) NOT NULL,
  "egcs_cn_agency" bigint NOT NULL,
  "egcs_cn_name_en" text NOT NULL,
  "egcs_cn_name_fr" text NOT NULL,
  "egcs_cn_email" citext NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Common_Group_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX cn_idx_group_active_email ON "Common_Group" USING btree (egcs_cn_email) WHERE (_deleted = false);

CREATE TABLE "Common_Group_Member" (
  "id" bigint DEFAULT nextval('"Common_Group_Member_id_seq"'::regclass) NOT NULL,
  "egcs_cn_group" bigint NOT NULL,
  "egcs_cn_user" bigint NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Common_Group_Member_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX cn_idx_group_member_active ON "Common_Group_Member" USING btree (egcs_cn_group, egcs_cn_user) WHERE (_deleted = false);

CREATE TABLE "Common_Publication" (
  "id" bigint DEFAULT nextval('"Common_Publication_id_seq"'::regclass) NOT NULL,
  "egcs_cn_kind" character varying(64) NOT NULL,
  "egcs_cn_state" character varying(32) DEFAULT 'draft'::character varying NOT NULL,
  "egcs_cn_currentversion" bigint,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "cn_uq_publicationidkind" UNIQUE (id, egcs_cn_kind),
  CONSTRAINT "Common_Publication_pkey" PRIMARY KEY (id),
  CONSTRAINT "cn_chk_publicationdeleted" CHECK (((_deleted = false) OR ((egcs_cn_state)::text = 'draft'::text))),
  CONSTRAINT "cn_chk_publicationinitial" CHECK (((((egcs_cn_state)::text = 'draft'::text) AND (egcs_cn_currentversion IS NULL)) OR (((egcs_cn_state)::text = ANY ((ARRAY['published'::character varying, 'retired'::character varying])::text[])) AND (egcs_cn_currentversion IS NOT NULL)))),
  CONSTRAINT "cn_chk_publicationkind" CHECK (((egcs_cn_kind)::text = ANY ((ARRAY['approval_template'::character varying, 'review_schema'::character varying, 'review_set_setup'::character varying, 'recommendation_schema'::character varying, 'recommendation_set_setup'::character varying, 'workflow_setup'::character varying])::text[]))),
  CONSTRAINT "cn_chk_publicationstate" CHECK (((egcs_cn_state)::text = ANY ((ARRAY['draft'::character varying, 'published'::character varying, 'retired'::character varying])::text[])))
);

CREATE TABLE "Common_Publication_Transition" (
  "id" bigint DEFAULT nextval('"Common_Publication_Transition_id_seq"'::regclass) NOT NULL,
  "egcs_cn_publication" bigint NOT NULL,
  "egcs_cn_fromstate" character varying(32) NOT NULL,
  "egcs_cn_tostate" character varying(32) NOT NULL,
  "egcs_cn_publicationversion" bigint,
  "egcs_cn_actor" bigint NOT NULL,
  "egcs_cn_createdat" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "Common_Publication_Transition_pkey" PRIMARY KEY (id),
  CONSTRAINT "cn_chk_publicationtransitiongraph" CHECK (((((egcs_cn_fromstate)::text = 'draft'::text) AND ((egcs_cn_tostate)::text = 'published'::text)) OR (((egcs_cn_fromstate)::text = 'published'::text) AND ((egcs_cn_tostate)::text = ANY ((ARRAY['published'::character varying, 'retired'::character varying])::text[]))))),
  CONSTRAINT "cn_chk_publicationtransitionstates" CHECK ((((egcs_cn_fromstate)::text = ANY ((ARRAY['draft'::character varying, 'published'::character varying, 'retired'::character varying])::text[])) AND ((egcs_cn_tostate)::text = ANY ((ARRAY['draft'::character varying, 'published'::character varying, 'retired'::character varying])::text[]))))
);

CREATE TABLE "Common_Publication_Version" (
  "id" bigint DEFAULT nextval('"Common_Publication_Version_id_seq"'::regclass) NOT NULL,
  "egcs_cn_publication" bigint NOT NULL,
  "egcs_cn_kind" character varying(64) NOT NULL,
  "egcs_cn_version" integer NOT NULL,
  "egcs_cn_definition" jsonb NOT NULL,
  "egcs_cn_hash" character(64) NOT NULL,
  "egcs_cn_actor" bigint NOT NULL,
  "egcs_cn_createdat" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "cn_uq_publicationversion" UNIQUE (egcs_cn_publication, egcs_cn_version),
  CONSTRAINT "cn_uq_publicationversionidentity" UNIQUE (id, egcs_cn_publication, egcs_cn_kind, egcs_cn_version),
  CONSTRAINT "cn_uq_publicationversionpublication" UNIQUE (id, egcs_cn_publication),
  CONSTRAINT "cn_uq_publicationversionpublicationkind" UNIQUE (id, egcs_cn_publication, egcs_cn_kind),
  CONSTRAINT "Common_Publication_Version_pkey" PRIMARY KEY (id),
  CONSTRAINT "Common_Publication_Version_egcs_cn_definition_check" CHECK ((jsonb_typeof(egcs_cn_definition) = 'object'::text)),
  CONSTRAINT "Common_Publication_Version_egcs_cn_hash_check" CHECK ((egcs_cn_hash ~ '^[0-9a-f]{64}$'::text)),
  CONSTRAINT "Common_Publication_Version_egcs_cn_version_check" CHECK ((egcs_cn_version > 0))
);

CREATE TABLE "Common_Publication_Version_Reference" (
  "id" bigint DEFAULT nextval('"Common_Publication_Version_Reference_id_seq"'::regclass) NOT NULL,
  "egcs_cn_parentversion" bigint NOT NULL,
  "egcs_cn_path" character varying(128) NOT NULL,
  "egcs_cn_order" numeric,
  "egcs_cn_publication" bigint NOT NULL,
  "egcs_cn_kind" character varying(64) NOT NULL,
  "egcs_cn_publicationversion" bigint NOT NULL,
  "egcs_cn_version" integer NOT NULL,
  CONSTRAINT "cn_uq_publicationversionreference" UNIQUE NULLS NOT DISTINCT (egcs_cn_parentversion, egcs_cn_path, egcs_cn_order),
  CONSTRAINT "Common_Publication_Version_Reference_pkey" PRIMARY KEY (id),
  CONSTRAINT "Common_Publication_Version_Reference_egcs_cn_version_check" CHECK ((egcs_cn_version > 0))
);

CREATE TABLE "Common_Recommendation" (
  "id" bigint NOT NULL,
  "egcs_cn_recommendationset" bigint NOT NULL,
  "egcs_cn_recommendationsetup" bigint NOT NULL,
  "egcs_cn_entitytype" character varying(128) NOT NULL,
  "egcs_cn_entityid" bigint NOT NULL,
  "egcs_cn_recommendation" smallint,
  "egcs_cn_response" jsonb DEFAULT '{"responses": []}'::jsonb NOT NULL,
  "egcs_cn_resultoptionkey" character varying(255),
  "egcs_cn_outcome" character varying(32),
  "egcs_cn_revision" integer DEFAULT 1 NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  "egcs_cn_runtimeitem" bigint NOT NULL,
  CONSTRAINT "Common_Recommendation_egcs_cn_runtimeitem_key" UNIQUE (egcs_cn_runtimeitem),
  CONSTRAINT "Common_Recommendation_pkey" PRIMARY KEY (id),
  CONSTRAINT "cn_chk_recommendationoutcome" CHECK (((egcs_cn_outcome IS NULL) OR ((egcs_cn_outcome)::text = ANY ((ARRAY['recommended'::character varying, 'not_recommended'::character varying])::text[]))))
);

CREATE TABLE "Common_Recommendation_Schema" (
  "id" bigint NOT NULL,
  "egcs_cn_publicationkind" character varying(64) DEFAULT 'recommendation_schema'::character varying NOT NULL,
  "egcs_cn_agency" bigint NOT NULL,
  "egcs_cn_name_en" character varying(255) NOT NULL,
  "egcs_cn_name_fr" character varying(255) NOT NULL,
  "egcs_cn_result" jsonb NOT NULL,
  "egcs_cn_recommendationschema" jsonb NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Common_Recommendation_Schema_pkey" PRIMARY KEY (id),
  CONSTRAINT "Common_Recommendation_Schema_egcs_cn_publicationkind_check" CHECK (((egcs_cn_publicationkind)::text = 'recommendation_schema'::text))
);

CREATE UNIQUE INDEX cn_idx_recommendationschemaagencynameen ON "Common_Recommendation_Schema" USING btree (egcs_cn_agency, egcs_cn_name_en) WHERE (_deleted = false);

CREATE UNIQUE INDEX cn_idx_recommendationschemaagencynamefr ON "Common_Recommendation_Schema" USING btree (egcs_cn_agency, egcs_cn_name_fr) WHERE (_deleted = false);

CREATE TABLE "Common_Recommendation_Set" (
  "id" bigint DEFAULT nextval('"Common_Recommendation_Set_id_seq"'::regclass) NOT NULL,
  "egcs_cn_recommendationsetsetup" bigint NOT NULL,
  "egcs_cn_entitytype" character varying(128) NOT NULL,
  "egcs_cn_entityid" bigint NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  "egcs_cn_runtimeitem" bigint NOT NULL,
  CONSTRAINT "Common_Recommendation_Set_egcs_cn_runtimeitem_key" UNIQUE (egcs_cn_runtimeitem),
  CONSTRAINT "Common_Recommendation_Set_pkey" PRIMARY KEY (id)
);

CREATE INDEX cn_idx_recommendationset_entity ON "Common_Recommendation_Set" USING btree (egcs_cn_recommendationsetsetup, egcs_cn_entitytype, egcs_cn_entityid) WHERE (_deleted = false);

CREATE UNIQUE INDEX cn_idx_recommendationset_identity ON "Common_Recommendation_Set" USING btree (id, egcs_cn_entitytype, egcs_cn_entityid);

CREATE TABLE "Common_Recommendation_Set_Setup" (
  "id" bigint NOT NULL,
  "egcs_cn_publicationkind" character varying(64) DEFAULT 'recommendation_set_setup'::character varying NOT NULL,
  "egcs_cn_agency" bigint NOT NULL,
  "egcs_cn_name_en" character varying(255) NOT NULL,
  "egcs_cn_name_fr" character varying(255) NOT NULL,
  "egcs_cn_description_en" text NOT NULL,
  "egcs_cn_description_fr" text NOT NULL,
  "egcs_cn_approvaltemplate" bigint,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Common_Recommendation_Set_Setup_pkey" PRIMARY KEY (id),
  CONSTRAINT "Common_Recommendation_Set_Setup_egcs_cn_publicationkind_check" CHECK (((egcs_cn_publicationkind)::text = 'recommendation_set_setup'::text))
);

CREATE INDEX cn_idx_recommendationsetsetupagencynameen ON "Common_Recommendation_Set_Setup" USING btree (egcs_cn_agency, egcs_cn_name_en) WHERE (_deleted = false);

CREATE INDEX cn_idx_recommendationsetsetupagencynamefr ON "Common_Recommendation_Set_Setup" USING btree (egcs_cn_agency, egcs_cn_name_fr) WHERE (_deleted = false);

CREATE TABLE "Common_Recommendation_Setup" (
  "id" bigint DEFAULT nextval('"Common_Recommendation_Setup_id_seq"'::regclass) NOT NULL,
  "egcs_cn_order" smallint NOT NULL,
  "egcs_cn_recommendationset" bigint NOT NULL,
  "egcs_cn_approvaltemplate" bigint,
  "egcs_cn_recommendationschema" bigint NOT NULL,
  "egcs_cn_failonnotrecommended" boolean DEFAULT false NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Common_Recommendation_Setup_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX cn_idx_recommendationsetupschema ON "Common_Recommendation_Setup" USING btree (egcs_cn_recommendationset, egcs_cn_recommendationschema) WHERE (_deleted = false);

CREATE UNIQUE INDEX cn_idx_recommendationsetupsetorder ON "Common_Recommendation_Setup" USING btree (egcs_cn_recommendationset, egcs_cn_order) WHERE (_deleted = false);

CREATE TABLE "Common_Review" (
  "id" bigint NOT NULL,
  "egcs_cn_helpers" jsonb,
  "egcs_cn_reviewresult" numeric(10,2),
  "egcs_cn_reviewset" bigint NOT NULL,
  "egcs_cn_reviewschema" bigint NOT NULL,
  "egcs_cn_disablecustomoutcomes" boolean DEFAULT false NOT NULL,
  "egcs_cn_disablealignment" boolean DEFAULT false NOT NULL,
  "egcs_cn_disablereviewers" boolean DEFAULT false NOT NULL,
  "egcs_cn_failonchecklistfailure" boolean DEFAULT false NOT NULL,
  "egcs_cn_failurethreshold" numeric(10,2),
  "egcs_cn_reviewalignment" boolean,
  "egcs_cn_reviewalignresult" numeric(10,2),
  "egcs_cn_reviewalignmentnarrative" text,
  "_deleted" boolean DEFAULT false NOT NULL,
  "egcs_cn_runtimeitem" bigint NOT NULL,
  "egcs_cn_group" bigint,
  "egcs_cn_groupclaimedby" bigint,
  CONSTRAINT "Common_Review_egcs_cn_runtimeitem_key" UNIQUE (egcs_cn_runtimeitem),
  CONSTRAINT "Common_Review_pkey" PRIMARY KEY (id),
  CONSTRAINT "cn_chk_review_group_claim" CHECK (((egcs_cn_groupclaimedby IS NULL) OR (egcs_cn_group IS NOT NULL))),
  CONSTRAINT "cn_chk_reviewreviewresult" CHECK ((NOT ((egcs_cn_reviewalignment = true) AND ((egcs_cn_reviewalignmentnarrative IS NULL) OR (egcs_cn_reviewalignresult IS NULL)))))
);

CREATE INDEX cn_idx_reviewreviewset ON "Common_Review" USING btree (egcs_cn_reviewset);

CREATE TABLE "Common_Review_Response" (
  "id" bigint DEFAULT nextval('"Common_Review_Response_id_seq"'::regclass) NOT NULL,
  "egcs_cn_section" character varying(255) NOT NULL,
  "egcs_cn_subsection" character varying(255) NOT NULL,
  "egcs_cn_question" character varying(255) NOT NULL,
  "egcs_cn_value" numeric(10,2),
  "egcs_cn_comment" text NOT NULL,
  "egcs_cn_calculated" boolean DEFAULT false NOT NULL,
  "egcs_cn_assessment" bigint NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Common_Review_Response_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX cn_idx_reviewresponseassessmentsectionsubsectionquestion ON "Common_Review_Response" USING btree (egcs_cn_assessment, egcs_cn_section, egcs_cn_subsection, egcs_cn_question) WHERE (_deleted = false);

CREATE TABLE "Common_Review_Schema" (
  "id" bigint NOT NULL,
  "egcs_cn_publicationkind" character varying(64) DEFAULT 'review_schema'::character varying NOT NULL,
  "egcs_cn_reviewtype" "Review_Type" NOT NULL,
  "egcs_cn_agency" bigint NOT NULL,
  "egcs_cn_entitytype" character varying(128) DEFAULT 'applicantrecipient'::character varying NOT NULL,
  "egcs_cn_name_en" character varying(255) NOT NULL,
  "egcs_cn_name_fr" character varying(255) NOT NULL,
  "egcs_cn_outcomename_en" character varying(255) NOT NULL,
  "egcs_cn_outcomename_fr" character varying(255) NOT NULL,
  "egcs_cn_disablecustomoutcomes" boolean DEFAULT false NOT NULL,
  "egcs_cn_disablealignment" boolean DEFAULT false NOT NULL,
  "egcs_cn_disablereviewers" boolean DEFAULT false NOT NULL,
  "egcs_cn_scoringmatrix" jsonb,
  "egcs_cn_assessmentschema" jsonb,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Common_Review_Schema_pkey" PRIMARY KEY (id),
  CONSTRAINT "Common_Review_Schema_egcs_cn_publicationkind_check" CHECK (((egcs_cn_publicationkind)::text = 'review_schema'::text))
);

CREATE UNIQUE INDEX cn_idx_reviewschemaagencynametypeen ON "Common_Review_Schema" USING btree (egcs_cn_agency, egcs_cn_entitytype, egcs_cn_name_en) WHERE (_deleted = false);

CREATE UNIQUE INDEX cn_idx_reviewschemaagencynametypefr ON "Common_Review_Schema" USING btree (egcs_cn_agency, egcs_cn_entitytype, egcs_cn_name_fr) WHERE (_deleted = false);

CREATE UNIQUE INDEX cn_idx_reviewschemaidentitytype ON "Common_Review_Schema" USING btree (id, egcs_cn_entitytype);

CREATE UNIQUE INDEX cn_idx_reviewschemaidreviewtype ON "Common_Review_Schema" USING btree (id, egcs_cn_reviewtype);

CREATE TABLE "Common_Review_Set" (
  "id" bigint DEFAULT nextval('"Common_Review_Set_id_seq"'::regclass) NOT NULL,
  "egcs_cn_reviewsetsetup" bigint NOT NULL,
  "egcs_cn_entitytype" character varying(128) NOT NULL,
  "egcs_cn_entityid" bigint NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  "egcs_cn_runtimeitem" bigint NOT NULL,
  CONSTRAINT "Common_Review_Set_egcs_cn_runtimeitem_key" UNIQUE (egcs_cn_runtimeitem),
  CONSTRAINT "Common_Review_Set_pkey" PRIMARY KEY (id)
);

CREATE INDEX cn_idx_reviewset_entity ON "Common_Review_Set" USING btree (egcs_cn_reviewsetsetup, egcs_cn_entitytype, egcs_cn_entityid) WHERE (_deleted = false);

CREATE TABLE "Common_Review_Set_Setup" (
  "id" bigint NOT NULL,
  "egcs_cn_publicationkind" character varying(64) DEFAULT 'review_set_setup'::character varying NOT NULL,
  "egcs_cn_agency" bigint NOT NULL,
  "egcs_cn_entitytype" character varying(128) NOT NULL,
  "egcs_cn_name_en" character varying(255) NOT NULL,
  "egcs_cn_name_fr" character varying(255) NOT NULL,
  "egcs_cn_description_en" text DEFAULT ''::text NOT NULL,
  "egcs_cn_description_fr" text DEFAULT ''::text NOT NULL,
  "egcs_cn_order" smallint NOT NULL,
  "egcs_cn_sequential" boolean NOT NULL,
  "egcs_cn_directreview" boolean DEFAULT false NOT NULL,
  "egcs_cn_approvaltemplate" bigint,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Common_Review_Set_Setup_pkey" PRIMARY KEY (id),
  CONSTRAINT "cn_chk_reviewsetsetuppublicationkind" CHECK (((egcs_cn_publicationkind)::text = 'review_set_setup'::text))
);

CREATE INDEX cn_idx_reviewsetsetupagencytypenameen ON "Common_Review_Set_Setup" USING btree (egcs_cn_agency, egcs_cn_entitytype, egcs_cn_name_en) WHERE (_deleted = false);

CREATE INDEX cn_idx_reviewsetsetupagencytypenamefr ON "Common_Review_Set_Setup" USING btree (egcs_cn_agency, egcs_cn_entitytype, egcs_cn_name_fr) WHERE (_deleted = false);

CREATE INDEX cn_idx_reviewsetsetupagencytypeorder ON "Common_Review_Set_Setup" USING btree (egcs_cn_agency, egcs_cn_entitytype, egcs_cn_order) WHERE (_deleted = false);

CREATE UNIQUE INDEX cn_idx_reviewsetsetupidentitytype ON "Common_Review_Set_Setup" USING btree (id, egcs_cn_entitytype);

CREATE TABLE "Common_Review_Setup" (
  "id" bigint DEFAULT nextval('"Common_Review_Setup_id_seq"'::regclass) NOT NULL,
  "egcs_cn_entitytype" character varying(128) NOT NULL,
  "egcs_cn_order" smallint NOT NULL,
  "egcs_cn_reviewset" bigint NOT NULL,
  "egcs_cn_approvaltemplate" bigint,
  "egcs_cn_reviewschema" bigint NOT NULL,
  "egcs_cn_failonchecklistfailure" boolean DEFAULT false NOT NULL,
  "egcs_cn_failurethreshold" numeric(10,2),
  "_deleted" boolean DEFAULT false NOT NULL,
  "egcs_cn_defaultgroup" bigint,
  CONSTRAINT "Common_Review_Setup_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX cn_idx_reviewsetupreviewsetorder ON "Common_Review_Setup" USING btree (egcs_cn_reviewset, egcs_cn_order) WHERE (_deleted = false);

CREATE UNIQUE INDEX cn_idx_reviewsetupreviewsetschema ON "Common_Review_Setup" USING btree (egcs_cn_reviewset, egcs_cn_reviewschema) WHERE (_deleted = false);

CREATE TABLE "Common_Routing_Slip" (
  "id" bigint DEFAULT nextval('"Common_Routing_Slip_id_seq"'::regclass) NOT NULL,
  "egcs_cn_entitytype" character varying(128) NOT NULL,
  "egcs_cn_entityid" bigint NOT NULL,
  "egcs_cn_name_en" character varying(255) NOT NULL,
  "egcs_cn_name_fr" character varying(255) NOT NULL,
  "egcs_cn_approvaltemplate" bigint NOT NULL,
  "egcs_cn_allowadditionalapprovals" boolean DEFAULT false NOT NULL,
  "egcs_cn_defaultaddedapprovalname_en" character varying(255),
  "egcs_cn_defaultaddedapprovalname_fr" character varying(255),
  "egcs_cn_allowaddedapprovalnamechanges" boolean DEFAULT false NOT NULL,
  "egcs_cn_allowaddedapprovalcertificationchanges" boolean DEFAULT false NOT NULL,
  "egcs_cn_runtimeitem" bigint NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Common_Routing_Slip_egcs_cn_runtimeitem_key" UNIQUE (egcs_cn_runtimeitem),
  CONSTRAINT "Common_Routing_Slip_pkey" PRIMARY KEY (id)
);

CREATE INDEX cn_idx_routingslip_target_evidence ON "Common_Routing_Slip" USING btree (egcs_cn_entitytype, egcs_cn_entityid, id DESC) WHERE (_deleted = false);

CREATE TABLE "Common_Runtime" (
  "id" bigint DEFAULT nextval('"Common_Runtime_id_seq"'::regclass) NOT NULL,
  "egcs_cn_kind" character varying(64) NOT NULL,
  "egcs_cn_entitytype" character varying(128) NOT NULL,
  "egcs_cn_entityid" bigint NOT NULL,
  "egcs_cn_purpose" character varying(32) DEFAULT 'standard'::character varying NOT NULL,
  "egcs_cn_sourcepublication" bigint NOT NULL,
  "egcs_cn_sourcepublicationkind" character varying(64) NOT NULL,
  "egcs_cn_sourcepublicationversion" bigint NOT NULL,
  "egcs_cn_sourceversion" integer NOT NULL,
  "egcs_cn_previousruntime" bigint,
  "egcs_cn_attempt" integer DEFAULT 1 NOT NULL,
  "egcs_cn_initiatedby" bigint NOT NULL,
  "egcs_cn_state" character varying(32) DEFAULT 'pending'::character varying NOT NULL,
  "egcs_cn_createdat" timestamp with time zone DEFAULT now() NOT NULL,
  "egcs_cn_startedat" timestamp with time zone,
  "egcs_cn_updatedat" timestamp with time zone DEFAULT now() NOT NULL,
  "egcs_cn_completedat" timestamp with time zone,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "cn_uq_runtimeidentity" UNIQUE (id, egcs_cn_kind, egcs_cn_entitytype, egcs_cn_entityid),
  CONSTRAINT "Common_Runtime_pkey" PRIMARY KEY (id),
  CONSTRAINT "cn_chk_runtimekind" CHECK (((egcs_cn_kind)::text = ANY ((ARRAY['workflow'::character varying, 'review_set'::character varying])::text[]))),
  CONSTRAINT "cn_chk_runtimestate" CHECK (((egcs_cn_state)::text = ANY ((ARRAY['pending'::character varying, 'active'::character varying, 'awaiting_action'::character varying, 'paused'::character varying, 'succeeded'::character varying, 'approved'::character varying, 'unsuccessful'::character varying, 'denied'::character varying, 'cancelled'::character varying, 'failed'::character varying])::text[]))),
  CONSTRAINT "cn_chk_runtimetimestamps" CHECK (((((egcs_cn_state)::text = 'pending'::text) AND (egcs_cn_startedat IS NULL) AND (egcs_cn_completedat IS NULL)) OR (((egcs_cn_state)::text = ANY ((ARRAY['active'::character varying, 'awaiting_action'::character varying, 'paused'::character varying])::text[])) AND (egcs_cn_startedat IS NOT NULL) AND (egcs_cn_completedat IS NULL)) OR (((egcs_cn_state)::text = ANY ((ARRAY['succeeded'::character varying, 'approved'::character varying, 'unsuccessful'::character varying, 'denied'::character varying, 'cancelled'::character varying, 'failed'::character varying])::text[])) AND (egcs_cn_completedat IS NOT NULL)))),
  CONSTRAINT "Common_Runtime_egcs_cn_attempt_check" CHECK ((egcs_cn_attempt > 0)),
  CONSTRAINT "Common_Runtime_egcs_cn_sourceversion_check" CHECK ((egcs_cn_sourceversion > 0))
);

CREATE UNIQUE INDEX cn_idx_runtime_active_target ON "Common_Runtime" USING btree (egcs_cn_kind, egcs_cn_entitytype, egcs_cn_entityid, egcs_cn_purpose, egcs_cn_sourcepublication) WHERE (((egcs_cn_kind)::text <> 'workflow'::text) AND (_deleted = false) AND ((egcs_cn_state)::text = ANY ((ARRAY['pending'::character varying, 'active'::character varying, 'awaiting_action'::character varying, 'paused'::character varying])::text[])));

CREATE UNIQUE INDEX cn_idx_runtime_previous_successor ON "Common_Runtime" USING btree (egcs_cn_previousruntime) WHERE (egcs_cn_previousruntime IS NOT NULL);

CREATE UNIQUE INDEX cn_idx_workflow_runtime_active_target ON "Common_Runtime" USING btree (egcs_cn_entitytype, egcs_cn_entityid) WHERE (((egcs_cn_kind)::text = 'workflow'::text) AND (_deleted = false) AND ((egcs_cn_state)::text = ANY ((ARRAY['pending'::character varying, 'active'::character varying, 'awaiting_action'::character varying, 'paused'::character varying])::text[])));

CREATE TABLE "Common_Runtime_Item" (
  "id" bigint DEFAULT nextval('"Common_Runtime_Item_id_seq"'::regclass) NOT NULL,
  "egcs_cn_runtime" bigint NOT NULL,
  "egcs_cn_parentruntimeitem" bigint,
  "egcs_cn_kind" character varying(64) NOT NULL,
  "egcs_cn_order" numeric NOT NULL,
  "egcs_cn_publication" bigint NOT NULL,
  "egcs_cn_publicationkind" character varying(64) NOT NULL,
  "egcs_cn_publicationversion" bigint NOT NULL,
  "egcs_cn_version" integer NOT NULL,
  "egcs_cn_state" character varying(32) DEFAULT 'pending'::character varying NOT NULL,
  "egcs_cn_createdat" timestamp with time zone DEFAULT now() NOT NULL,
  "egcs_cn_startedat" timestamp with time zone,
  "egcs_cn_updatedat" timestamp with time zone DEFAULT now() NOT NULL,
  "egcs_cn_completedat" timestamp with time zone,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "cn_uq_runtimeitemidentity" UNIQUE (id, egcs_cn_runtime),
  CONSTRAINT "cn_uq_runtimeitemorder" UNIQUE NULLS NOT DISTINCT (egcs_cn_runtime, egcs_cn_parentruntimeitem, egcs_cn_order),
  CONSTRAINT "Common_Runtime_Item_pkey" PRIMARY KEY (id),
  CONSTRAINT "cn_chk_runtimeitemkind" CHECK (((egcs_cn_kind)::text = ANY ((ARRAY['review_set'::character varying, 'review'::character varying, 'recommendation_set'::character varying, 'recommendation'::character varying, 'routing_slip'::character varying, 'approval_step'::character varying])::text[]))),
  CONSTRAINT "cn_chk_runtimeitemstate" CHECK (((egcs_cn_state)::text = ANY ((ARRAY['pending'::character varying, 'active'::character varying, 'awaiting_action'::character varying, 'paused'::character varying, 'succeeded'::character varying, 'approved'::character varying, 'unsuccessful'::character varying, 'denied'::character varying, 'cancelled'::character varying, 'failed'::character varying])::text[]))),
  CONSTRAINT "cn_chk_runtimeitemtimestamps" CHECK (((((egcs_cn_state)::text = 'pending'::text) AND (egcs_cn_startedat IS NULL) AND (egcs_cn_completedat IS NULL)) OR (((egcs_cn_state)::text = ANY ((ARRAY['active'::character varying, 'awaiting_action'::character varying, 'paused'::character varying])::text[])) AND (egcs_cn_startedat IS NOT NULL) AND (egcs_cn_completedat IS NULL)) OR (((egcs_cn_state)::text = ANY ((ARRAY['succeeded'::character varying, 'approved'::character varying, 'unsuccessful'::character varying, 'denied'::character varying, 'cancelled'::character varying, 'failed'::character varying])::text[])) AND (egcs_cn_completedat IS NOT NULL)))),
  CONSTRAINT "Common_Runtime_Item_egcs_cn_order_check" CHECK ((egcs_cn_order > (0)::numeric)),
  CONSTRAINT "Common_Runtime_Item_egcs_cn_version_check" CHECK ((egcs_cn_version > 0))
);

CREATE UNIQUE INDEX cn_idx_runtimeitem_currentapprovalstep ON "Common_Runtime_Item" USING btree (egcs_cn_parentruntimeitem) WHERE (((egcs_cn_kind)::text = 'approval_step'::text) AND ((egcs_cn_state)::text = 'awaiting_action'::text) AND (_deleted = false));

CREATE TABLE "Common_Runtime_Transition" (
  "id" bigint DEFAULT nextval('"Common_Runtime_Transition_id_seq"'::regclass) NOT NULL,
  "egcs_cn_runtime" bigint NOT NULL,
  "egcs_cn_runtimeitem" bigint,
  "egcs_cn_fromstate" character varying(32) NOT NULL,
  "egcs_cn_tostate" character varying(32) NOT NULL,
  "egcs_cn_actor" bigint,
  "egcs_cn_reason" character varying(128),
  "egcs_cn_createdat" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "Common_Runtime_Transition_pkey" PRIMARY KEY (id),
  CONSTRAINT "cn_chk_runtimetransitiongraph" CHECK (((((egcs_cn_fromstate)::text = 'pending'::text) AND ((egcs_cn_tostate)::text = ANY ((ARRAY['active'::character varying, 'awaiting_action'::character varying, 'cancelled'::character varying, 'failed'::character varying])::text[]))) OR (((egcs_cn_fromstate)::text = 'active'::text) AND ((egcs_cn_tostate)::text = ANY ((ARRAY['awaiting_action'::character varying, 'paused'::character varying, 'succeeded'::character varying, 'approved'::character varying, 'unsuccessful'::character varying, 'denied'::character varying, 'cancelled'::character varying, 'failed'::character varying])::text[]))) OR (((egcs_cn_fromstate)::text = 'awaiting_action'::text) AND ((egcs_cn_tostate)::text = ANY ((ARRAY['active'::character varying, 'paused'::character varying, 'succeeded'::character varying, 'approved'::character varying, 'unsuccessful'::character varying, 'denied'::character varying, 'cancelled'::character varying, 'failed'::character varying])::text[]))) OR (((egcs_cn_fromstate)::text = 'paused'::text) AND ((egcs_cn_tostate)::text = ANY ((ARRAY['active'::character varying, 'awaiting_action'::character varying, 'cancelled'::character varying, 'failed'::character varying])::text[])))))
);

CREATE TABLE "Common_Status" (
  "id" bigint DEFAULT nextval('"Common_Status_id_seq"'::regclass) NOT NULL,
  "egcs_cn_agency" bigint NOT NULL,
  "egcs_cn_name_en" character varying(255) NOT NULL,
  "egcs_cn_name_fr" character varying(255) NOT NULL,
  "egcs_cn_color" character varying(7) NOT NULL,
  "egcs_cn_icon" character varying(100) NOT NULL,
  "egcs_cn_readonly" boolean DEFAULT false NOT NULL,
  "egcs_cn_terminal" boolean DEFAULT false NOT NULL,
  "egcs_cn_isdraft" boolean DEFAULT false NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "cn_uq_correction_status_owner" UNIQUE (id, egcs_cn_agency, _deleted),
  CONSTRAINT "cn_uq_correction_status_terminal" UNIQUE (id, egcs_cn_terminal),
  CONSTRAINT "Common_Status_pkey" PRIMARY KEY (id),
  CONSTRAINT "cn_chk_status_color" CHECK (((egcs_cn_color)::text ~ '^#[0-9A-Fa-f]{6}$'::text)),
  CONSTRAINT "cn_chk_status_draft_flags" CHECK (((NOT egcs_cn_isdraft) OR ((NOT egcs_cn_readonly) AND (NOT egcs_cn_terminal) AND (NOT _deleted)))),
  CONSTRAINT "cn_chk_status_flags" CHECK ((NOT (egcs_cn_readonly AND egcs_cn_terminal))),
  CONSTRAINT "cn_chk_status_icon" CHECK (((egcs_cn_icon)::text ~ '^i-lucide-[a-z0-9]+(?:-[a-z0-9]+)*$'::text)),
  CONSTRAINT "cn_chk_status_names" CHECK (((length(btrim((egcs_cn_name_en)::text)) > 0) AND (length(btrim((egcs_cn_name_fr)::text)) > 0)))
);

CREATE UNIQUE INDEX cn_idx_status_draft_per_agency ON "Common_Status" USING btree (egcs_cn_agency) WHERE (egcs_cn_isdraft = true);

CREATE UNIQUE INDEX cn_idx_status_name_en_per_agency ON "Common_Status" USING btree (egcs_cn_agency, lower(btrim((egcs_cn_name_en)::text))) WHERE (_deleted = false);

CREATE UNIQUE INDEX cn_idx_status_name_fr_per_agency ON "Common_Status" USING btree (egcs_cn_agency, lower(btrim((egcs_cn_name_fr)::text))) WHERE (_deleted = false);

CREATE TABLE "Common_User" (
  "id" bigint DEFAULT nextval('"Common_User_id_seq"'::regclass) NOT NULL,
  "egcs_cn_auth_user_id" bigint NOT NULL,
  "egcs_cn_name" text NOT NULL,
  "egcs_cn_position_title" text NOT NULL,
  "egcs_cn_email" citext NOT NULL,
  "egcs_cn_email_verified" boolean NOT NULL,
  "egcs_cn_image" text,
  "egcs_cn_created_at" timestamp with time zone NOT NULL,
  "egcs_cn_updated_at" timestamp with time zone NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Common_User_egcs_cn_auth_user_id_key" UNIQUE (egcs_cn_auth_user_id),
  CONSTRAINT "Common_User_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX cn_idx_useremail ON "Common_User" USING btree (egcs_cn_email) WHERE (_deleted = false);

CREATE TABLE "Common_Workflow_Member_Condition" (
  "id" bigint DEFAULT nextval('"Common_Workflow_Member_Condition_id_seq"'::regclass) NOT NULL,
  "egcs_cn_workflowsetupmember" bigint NOT NULL,
  "egcs_cn_field" bigint NOT NULL,
  "egcs_cn_option" bigint NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Common_Workflow_Member_Condition_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX workflow_condition_unique ON "Common_Workflow_Member_Condition" USING btree (egcs_cn_workflowsetupmember, egcs_cn_field, egcs_cn_option) WHERE (NOT _deleted);

CREATE TABLE "Common_Workflow_Owner_Blocker" (
  "id" bigint DEFAULT nextval('"Common_Workflow_Owner_Blocker_id_seq"'::regclass) NOT NULL,
  "egcs_cn_workflowrun" bigint NOT NULL,
  "egcs_cn_workflowsetupmember" bigint NOT NULL,
  "egcs_cn_reviewsetup" bigint,
  "egcs_cn_recommendationsetup" bigint,
  "egcs_cn_configuredowner" bigint,
  "egcs_cn_reason" character varying(64) NOT NULL,
  "egcs_cn_triggeredby" bigint,
  "egcs_cn_replacementowner" bigint,
  "egcs_cn_resolvedby" bigint,
  "egcs_cn_createdat" timestamp with time zone DEFAULT now() NOT NULL,
  "egcs_cn_resolvedat" timestamp with time zone,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Common_Workflow_Owner_Blocker_pkey" PRIMARY KEY (id),
  CONSTRAINT "cn_chk_workflowownerblockermember" CHECK (((((egcs_cn_reviewsetup IS NOT NULL))::integer + ((egcs_cn_recommendationsetup IS NOT NULL))::integer) = 1)),
  CONSTRAINT "cn_chk_workflowownerblockerresolution" CHECK ((((egcs_cn_resolvedat IS NULL) AND (egcs_cn_replacementowner IS NULL) AND (egcs_cn_resolvedby IS NULL)) OR ((egcs_cn_resolvedat IS NOT NULL) AND (egcs_cn_replacementowner IS NOT NULL) AND (egcs_cn_resolvedby IS NOT NULL))))
);

CREATE UNIQUE INDEX cn_idx_workflowownerblocker_active_recommendation ON "Common_Workflow_Owner_Blocker" USING btree (egcs_cn_workflowrun, egcs_cn_workflowsetupmember, egcs_cn_recommendationsetup) WHERE ((_deleted = false) AND (egcs_cn_resolvedat IS NULL) AND (egcs_cn_recommendationsetup IS NOT NULL));

CREATE UNIQUE INDEX cn_idx_workflowownerblocker_active_review ON "Common_Workflow_Owner_Blocker" USING btree (egcs_cn_workflowrun, egcs_cn_workflowsetupmember, egcs_cn_reviewsetup) WHERE ((_deleted = false) AND (egcs_cn_resolvedat IS NULL) AND (egcs_cn_reviewsetup IS NOT NULL));

CREATE TABLE "Common_Workflow_Publication_Condition" (
  "id" bigint DEFAULT nextval('"Common_Workflow_Publication_Condition_id_seq"'::regclass) NOT NULL,
  "egcs_cn_publicationversion" bigint NOT NULL,
  "egcs_cn_workflowsetupmember" bigint NOT NULL,
  "egcs_cn_field" bigint NOT NULL,
  "egcs_cn_option" bigint NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Common_Workflow_Publication_C_egcs_cn_publicationversion_eg_key" UNIQUE (egcs_cn_publicationversion, egcs_cn_workflowsetupmember, egcs_cn_field, egcs_cn_option),
  CONSTRAINT "Common_Workflow_Publication_Condition_pkey" PRIMARY KEY (id)
);

CREATE TABLE "Common_Workflow_Publication_Status" (
  "id" bigint DEFAULT nextval('"Common_Workflow_Publication_Status_id_seq"'::regclass) NOT NULL,
  "egcs_cn_publicationversion" bigint NOT NULL,
  "egcs_cn_status" bigint NOT NULL,
  "egcs_cn_role" character varying(32) NOT NULL,
  "egcs_cn_order" integer NOT NULL,
  CONSTRAINT "cn_uq_workflowpublicationstatus" UNIQUE (egcs_cn_publicationversion, egcs_cn_role, egcs_cn_order),
  CONSTRAINT "Common_Workflow_Publication_Status_pkey" PRIMARY KEY (id),
  CONSTRAINT "Common_Workflow_Publication_Status_egcs_cn_order_check" CHECK ((egcs_cn_order > 0)),
  CONSTRAINT "Common_Workflow_Publication_Status_egcs_cn_role_check" CHECK (((egcs_cn_role)::text = ANY ((ARRAY['allowed_start'::character varying, 'materialization'::character varying, 'success'::character varying, 'failure'::character varying, 'cancellation'::character varying, 'execution_failure'::character varying])::text[])))
);

CREATE TABLE "Common_Workflow_Run" (
  "id" bigint NOT NULL,
  "egcs_cn_completion" bigint,
  "egcs_cn_routing" jsonb,
  CONSTRAINT "Common_Workflow_Run_pkey" PRIMARY KEY (id)
);

CREATE TABLE "Common_Workflow_Setup" (
  "id" bigint NOT NULL,
  "egcs_cn_publicationkind" character varying(64) DEFAULT 'workflow_setup'::character varying NOT NULL,
  "egcs_cn_agency" bigint NOT NULL,
  "egcs_cn_entitytype" character varying(128) NOT NULL,
  "egcs_cn_name_en" character varying(255) NOT NULL,
  "egcs_cn_name_fr" character varying(255) NOT NULL,
  "egcs_cn_description_en" text NOT NULL,
  "egcs_cn_description_fr" text NOT NULL,
  "egcs_cn_purpose" character varying(32) DEFAULT 'standard'::character varying NOT NULL,
  "egcs_cn_cancellationstatus" bigint NOT NULL,
  "egcs_cn_executionfailurestatus" bigint NOT NULL,
  "egcs_cn_allowretry" boolean DEFAULT false NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "cn_unq_workflowsetuptargetpurpose" UNIQUE (id, egcs_cn_entitytype, egcs_cn_purpose),
  CONSTRAINT "Common_Workflow_Setup_pkey" PRIMARY KEY (id),
  CONSTRAINT "cn_chk_workflowsetuppurpose" CHECK (((egcs_cn_purpose)::text = ANY ((ARRAY['standard'::character varying, 'approval_submission'::character varying, 'risk_rating'::character varying])::text[]))),
  CONSTRAINT "Common_Workflow_Setup_egcs_cn_publicationkind_check" CHECK (((egcs_cn_publicationkind)::text = 'workflow_setup'::text))
);

CREATE INDEX cn_idx_workflowsetup_agency_entity ON "Common_Workflow_Setup" USING btree (egcs_cn_agency, egcs_cn_entitytype, egcs_cn_purpose) WHERE (_deleted = false);

CREATE TABLE "Common_Workflow_Setup_Allowed_Start_Status" (
  "id" bigint DEFAULT nextval('"Common_Workflow_Setup_Allowed_Start_Status_id_seq"'::regclass) NOT NULL,
  "egcs_cn_workflowsetup" bigint NOT NULL,
  "egcs_cn_status" bigint NOT NULL,
  "egcs_cn_order" smallint NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Common_Workflow_Setup_Allowed_Start_Status_pkey" PRIMARY KEY (id),
  CONSTRAINT "Common_Workflow_Setup_Allowed_Start_Status_egcs_cn_order_check" CHECK ((egcs_cn_order > 0))
);

CREATE UNIQUE INDEX cn_idx_workflowallowedstartorder ON "Common_Workflow_Setup_Allowed_Start_Status" USING btree (egcs_cn_workflowsetup, egcs_cn_order) WHERE (_deleted = false);

CREATE UNIQUE INDEX cn_idx_workflowallowedstartstatus ON "Common_Workflow_Setup_Allowed_Start_Status" USING btree (egcs_cn_workflowsetup, egcs_cn_status) WHERE (_deleted = false);

CREATE TABLE "Common_Workflow_Setup_Member" (
  "id" bigint DEFAULT nextval('"Common_Workflow_Setup_Member_id_seq"'::regclass) NOT NULL,
  "egcs_cn_workflowsetup" bigint NOT NULL,
  "egcs_cn_sequence" integer NOT NULL,
  "egcs_cn_kind" character varying(32) NOT NULL,
  "egcs_cn_reviewset" bigint,
  "egcs_cn_recommendationset" bigint,
  "egcs_cn_approvaltemplate" bigint,
  "egcs_cn_materializationstatus" bigint,
  "egcs_cn_successstatus" bigint,
  "egcs_cn_failurestatus" bigint,
  "egcs_cn_allowownerredirect" boolean DEFAULT false NOT NULL,
  "egcs_cn_profileconditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Common_Workflow_Setup_Member_pkey" PRIMARY KEY (id),
  CONSTRAINT "cn_chk_workflowsetupmemberreference" CHECK (((((((egcs_cn_reviewset IS NOT NULL))::integer + ((egcs_cn_recommendationset IS NOT NULL))::integer) + ((egcs_cn_approvaltemplate IS NOT NULL))::integer) = 1) AND (((egcs_cn_kind)::text = 'review_set'::text) = (egcs_cn_reviewset IS NOT NULL)) AND (((egcs_cn_kind)::text = 'recommendation_set'::text) = (egcs_cn_recommendationset IS NOT NULL)) AND (((egcs_cn_kind)::text = 'approval_template'::text) = (egcs_cn_approvaltemplate IS NOT NULL)))),
  CONSTRAINT "Common_Workflow_Setup_Member_egcs_cn_kind_check" CHECK (((egcs_cn_kind)::text = ANY ((ARRAY['review_set'::character varying, 'recommendation_set'::character varying, 'approval_template'::character varying])::text[]))),
  CONSTRAINT "Common_Workflow_Setup_Member_egcs_cn_profileconditions_check" CHECK ((jsonb_typeof(egcs_cn_profileconditions) = 'array'::text)),
  CONSTRAINT "Common_Workflow_Setup_Member_egcs_cn_sequence_check" CHECK ((egcs_cn_sequence > 0))
);

CREATE UNIQUE INDEX cn_idx_workflowsetupmembersequence ON "Common_Workflow_Setup_Member" USING btree (egcs_cn_workflowsetup, egcs_cn_sequence) WHERE (_deleted = false);

CREATE TABLE "Common_Workflow_Setup_Member_Owner" (
  "id" bigint DEFAULT nextval('"Common_Workflow_Setup_Member_Owner_id_seq"'::regclass) NOT NULL,
  "egcs_cn_workflowsetupmember" bigint NOT NULL,
  "egcs_cn_reviewsetup" bigint,
  "egcs_cn_recommendationsetup" bigint,
  "egcs_cn_defaultowner" bigint,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Common_Workflow_Setup_Member_Owner_pkey" PRIMARY KEY (id),
  CONSTRAINT "cn_chk_workflowmemberownerreference" CHECK (((((egcs_cn_reviewsetup IS NOT NULL))::integer + ((egcs_cn_recommendationsetup IS NOT NULL))::integer) = 1))
);

CREATE UNIQUE INDEX cn_idx_workflowmemberownerrecommendation ON "Common_Workflow_Setup_Member_Owner" USING btree (egcs_cn_workflowsetupmember, egcs_cn_recommendationsetup) WHERE ((_deleted = false) AND (egcs_cn_recommendationsetup IS NOT NULL));

CREATE UNIQUE INDEX cn_idx_workflowmemberownerreview ON "Common_Workflow_Setup_Member_Owner" USING btree (egcs_cn_workflowsetupmember, egcs_cn_reviewsetup) WHERE ((_deleted = false) AND (egcs_cn_reviewsetup IS NOT NULL));

CREATE TABLE "Common_Workflow_Status_Transition" (
  "id" bigint DEFAULT nextval('"Common_Workflow_Status_Transition_id_seq"'::regclass) NOT NULL,
  "egcs_cn_workflowrun" bigint NOT NULL,
  "egcs_cn_workflowitem" bigint,
  "egcs_cn_event" character varying(32) NOT NULL,
  "egcs_cn_previousstatus" bigint NOT NULL,
  "egcs_cn_newstatus" bigint NOT NULL,
  "egcs_cn_actor" bigint,
  "egcs_cn_createdat" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "Common_Workflow_Status_Transition_pkey" PRIMARY KEY (id),
  CONSTRAINT "Common_Workflow_Status_Transition_egcs_cn_event_check" CHECK (((egcs_cn_event)::text = ANY ((ARRAY['materialized'::character varying, 'succeeded'::character varying, 'failed'::character varying, 'cancelled'::character varying, 'execution_failed'::character varying])::text[])))
);

ALTER SEQUENCE "Common_Additional_Reviewers_id_seq" OWNED BY "Common_Additional_Reviewers"."id";

ALTER SEQUENCE "Common_Address_id_seq" OWNED BY "Common_Address"."id";

ALTER SEQUENCE "Common_Approval_Certification_id_seq" OWNED BY "Common_Approval_Certification"."id";

ALTER SEQUENCE "Common_Approval_Step_id_seq" OWNED BY "Common_Approval_Step"."id";

ALTER SEQUENCE "Common_Approval_Template_id_seq" OWNED BY "Common_Approval_Template"."id";

ALTER SEQUENCE "Common_Approval_id_seq" OWNED BY "Common_Approval"."id";

ALTER SEQUENCE "Common_Assessment_Custom_Outcome_id_seq" OWNED BY "Common_Assessment_Custom_Outcome"."id";

ALTER SEQUENCE "Common_Assessment_Outcome_id_seq" OWNED BY "Common_Assessment_Outcome"."id";

ALTER SEQUENCE "Common_Assessment_Response_id_seq" OWNED BY "Common_Assessment_Response"."id";

ALTER SEQUENCE "Common_Assessment_Schema_id_seq" OWNED BY "Common_Assessment_Schema"."id";

ALTER SEQUENCE "Common_Assessment_id_seq" OWNED BY "Common_Assessment"."id";

ALTER SEQUENCE "Common_Attachment_Types_id_seq" OWNED BY "Common_Attachment_Types"."id";

ALTER SEQUENCE "Common_Attachment_id_seq" OWNED BY "Common_Attachment"."id";

ALTER SEQUENCE "Common_Certification_id_seq" OWNED BY "Common_Certification"."id";

ALTER SEQUENCE "Common_Checklist_Response_id_seq" OWNED BY "Common_Checklist_Response"."id";

ALTER SEQUENCE "Common_Checklist_Schema_id_seq" OWNED BY "Common_Checklist_Schema"."id";

ALTER SEQUENCE "Common_Checklist_id_seq" OWNED BY "Common_Checklist"."id";

ALTER SEQUENCE "Common_Completion_id_seq" OWNED BY "Common_Completion"."id";

ALTER SEQUENCE "Common_Contact_id_seq" OWNED BY "Common_Contact"."id";

ALTER SEQUENCE "Common_Entity_Assignment_id_seq" OWNED BY "Common_Entity_Assignment"."id";

ALTER SEQUENCE "Common_Entity_Attachment_id_seq" OWNED BY "Common_Entity_Attachment"."id";

ALTER SEQUENCE "Common_Entity_id_seq" OWNED BY "Common_Entity"."id";

ALTER SEQUENCE "Common_GWCOA_id_seq" OWNED BY "Common_GWCOA"."id";

ALTER SEQUENCE "Common_Group_Member_id_seq" OWNED BY "Common_Group_Member"."id";

ALTER SEQUENCE "Common_Group_id_seq" OWNED BY "Common_Group"."id";

ALTER SEQUENCE "Common_Publication_Transition_id_seq" OWNED BY "Common_Publication_Transition"."id";

ALTER SEQUENCE "Common_Publication_Version_Reference_id_seq" OWNED BY "Common_Publication_Version_Reference"."id";

ALTER SEQUENCE "Common_Publication_Version_id_seq" OWNED BY "Common_Publication_Version"."id";

ALTER SEQUENCE "Common_Publication_id_seq" OWNED BY "Common_Publication"."id";

ALTER SEQUENCE "Common_Recommendation_Set_id_seq" OWNED BY "Common_Recommendation_Set"."id";

ALTER SEQUENCE "Common_Recommendation_Setup_id_seq" OWNED BY "Common_Recommendation_Setup"."id";

ALTER SEQUENCE "Common_Review_Response_id_seq" OWNED BY "Common_Review_Response"."id";

ALTER SEQUENCE "Common_Review_Set_id_seq" OWNED BY "Common_Review_Set"."id";

ALTER SEQUENCE "Common_Review_Setup_id_seq" OWNED BY "Common_Review_Setup"."id";

ALTER SEQUENCE "Common_Routing_Slip_id_seq" OWNED BY "Common_Routing_Slip"."id";

ALTER SEQUENCE "Common_Runtime_Item_id_seq" OWNED BY "Common_Runtime_Item"."id";

ALTER SEQUENCE "Common_Runtime_Transition_id_seq" OWNED BY "Common_Runtime_Transition"."id";

ALTER SEQUENCE "Common_Runtime_id_seq" OWNED BY "Common_Runtime"."id";

ALTER SEQUENCE "Common_Status_id_seq" OWNED BY "Common_Status"."id";

ALTER SEQUENCE "Common_User_id_seq" OWNED BY "Common_User"."id";

ALTER SEQUENCE "Common_Workflow_Member_Condition_id_seq" OWNED BY "Common_Workflow_Member_Condition"."id";

ALTER SEQUENCE "Common_Workflow_Owner_Blocker_id_seq" OWNED BY "Common_Workflow_Owner_Blocker"."id";

ALTER SEQUENCE "Common_Workflow_Publication_Condition_id_seq" OWNED BY "Common_Workflow_Publication_Condition"."id";

ALTER SEQUENCE "Common_Workflow_Publication_Status_id_seq" OWNED BY "Common_Workflow_Publication_Status"."id";

ALTER SEQUENCE "Common_Workflow_Setup_Allowed_Start_Status_id_seq" OWNED BY "Common_Workflow_Setup_Allowed_Start_Status"."id";

ALTER SEQUENCE "Common_Workflow_Setup_Member_Owner_id_seq" OWNED BY "Common_Workflow_Setup_Member_Owner"."id";

ALTER SEQUENCE "Common_Workflow_Setup_Member_id_seq" OWNED BY "Common_Workflow_Setup_Member"."id";

ALTER SEQUENCE "Common_Workflow_Status_Transition_id_seq" OWNED BY "Common_Workflow_Status_Transition"."id";

INSERT INTO "Common_Entity_Type" ("_deleted", "egcs_cn_type", "egcs_cn_label_en", "egcs_cn_label_fr", "egcs_cn_localtype", "egcs_cn_ownerkind", "egcs_cn_completion", "egcs_cn_riskrating", "egcs_cn_extensionkey", "egcs_cn_assignmentmode", "egcs_cn_standardworkflow", "egcs_cn_approvalsubmission", "egcs_cn_supportsdirectreviews") VALUES (false, 'fundingopportunity', 'Funding Opportunity', 'Possibilité de financement', 'fundingopportunity', NULL, 'none', 'none', NULL, NULL, 'none', 'none', false);

INSERT INTO "Common_Entity_Type" ("_deleted", "egcs_cn_type", "egcs_cn_label_en", "egcs_cn_label_fr", "egcs_cn_localtype", "egcs_cn_ownerkind", "egcs_cn_completion", "egcs_cn_riskrating", "egcs_cn_extensionkey", "egcs_cn_assignmentmode", "egcs_cn_standardworkflow", "egcs_cn_approvalsubmission", "egcs_cn_supportsdirectreviews") VALUES (false, 'fundingcaseagreement', 'Funding Case Agreement', 'Entente de dossier de financement', 'fundingcaseagreement', 'agreement', 'none', 'explicit', NULL, 'independent', 'explicit', 'explicit', true);

INSERT INTO "Common_Entity_Type" ("_deleted", "egcs_cn_type", "egcs_cn_label_en", "egcs_cn_label_fr", "egcs_cn_localtype", "egcs_cn_ownerkind", "egcs_cn_completion", "egcs_cn_riskrating", "egcs_cn_extensionkey", "egcs_cn_assignmentmode", "egcs_cn_standardworkflow", "egcs_cn_approvalsubmission", "egcs_cn_supportsdirectreviews") VALUES (false, 'fundingcaseagreementcloseout', 'Agreement Closeout', 'Clôture d’entente', 'fundingcaseagreementcloseout', 'agreement', 'supported', 'none', NULL, 'independent', 'explicit', 'on_completion', true);

INSERT INTO "Common_Entity_Type" ("_deleted", "egcs_cn_type", "egcs_cn_label_en", "egcs_cn_label_fr", "egcs_cn_localtype", "egcs_cn_ownerkind", "egcs_cn_completion", "egcs_cn_riskrating", "egcs_cn_extensionkey", "egcs_cn_assignmentmode", "egcs_cn_standardworkflow", "egcs_cn_approvalsubmission", "egcs_cn_supportsdirectreviews") VALUES (false, 'applicantrecipient', 'Proponent', 'Promoteur', 'applicantrecipient', 'proponent', 'none', 'none', NULL, 'independent', 'none', 'none', true);

INSERT INTO "Common_Entity_Type" ("_deleted", "egcs_cn_type", "egcs_cn_label_en", "egcs_cn_label_fr", "egcs_cn_localtype", "egcs_cn_ownerkind", "egcs_cn_completion", "egcs_cn_riskrating", "egcs_cn_extensionkey", "egcs_cn_assignmentmode", "egcs_cn_standardworkflow", "egcs_cn_approvalsubmission", "egcs_cn_supportsdirectreviews") VALUES (false, 'transferpaymentstream', 'Transfer Payment Stream', 'Volet de paiement de transfert', 'transferpaymentstream', NULL, 'none', 'none', NULL, NULL, 'none', 'none', false);

INSERT INTO "Common_Entity_Type" ("_deleted", "egcs_cn_type", "egcs_cn_label_en", "egcs_cn_label_fr", "egcs_cn_localtype", "egcs_cn_ownerkind", "egcs_cn_completion", "egcs_cn_riskrating", "egcs_cn_extensionkey", "egcs_cn_assignmentmode", "egcs_cn_standardworkflow", "egcs_cn_approvalsubmission", "egcs_cn_supportsdirectreviews") VALUES (false, 'commonreview', 'Common Review', 'Examen commun', 'commonreview', 'runtime_source', 'none', 'none', NULL, 'independent', 'none', 'none', false);

INSERT INTO "Common_Entity_Type" ("_deleted", "egcs_cn_type", "egcs_cn_label_en", "egcs_cn_label_fr", "egcs_cn_localtype", "egcs_cn_ownerkind", "egcs_cn_completion", "egcs_cn_riskrating", "egcs_cn_extensionkey", "egcs_cn_assignmentmode", "egcs_cn_standardworkflow", "egcs_cn_approvalsubmission", "egcs_cn_supportsdirectreviews") VALUES (false, 'commonrecommendation', 'Common Recommendation', 'Recommandation commune', 'commonrecommendation', 'runtime_source', 'none', 'none', NULL, 'independent', 'none', 'none', false);

INSERT INTO "Common_Entity_Type" ("_deleted", "egcs_cn_type", "egcs_cn_label_en", "egcs_cn_label_fr", "egcs_cn_localtype", "egcs_cn_ownerkind", "egcs_cn_completion", "egcs_cn_riskrating", "egcs_cn_extensionkey", "egcs_cn_assignmentmode", "egcs_cn_standardworkflow", "egcs_cn_approvalsubmission", "egcs_cn_supportsdirectreviews") VALUES (false, 'fundingcaseagreementclaim', 'Agreement Claim', 'Réclamation d’entente', 'fundingcaseagreementclaim', 'agreement', 'supported', 'none', NULL, 'independent', 'explicit', 'on_completion', true);

INSERT INTO "Common_Entity_Type" ("_deleted", "egcs_cn_type", "egcs_cn_label_en", "egcs_cn_label_fr", "egcs_cn_localtype", "egcs_cn_ownerkind", "egcs_cn_completion", "egcs_cn_riskrating", "egcs_cn_extensionkey", "egcs_cn_assignmentmode", "egcs_cn_standardworkflow", "egcs_cn_approvalsubmission", "egcs_cn_supportsdirectreviews") VALUES (false, 'fundingcaseamendment', 'Funding Case Amendment', 'Modification du dossier de financement', 'fundingcaseamendment', 'agreement', 'supported', 'none', NULL, 'independent', 'explicit', 'on_completion', true);

INSERT INTO "Common_Entity_Type" ("_deleted", "egcs_cn_type", "egcs_cn_label_en", "egcs_cn_label_fr", "egcs_cn_localtype", "egcs_cn_ownerkind", "egcs_cn_completion", "egcs_cn_riskrating", "egcs_cn_extensionkey", "egcs_cn_assignmentmode", "egcs_cn_standardworkflow", "egcs_cn_approvalsubmission", "egcs_cn_supportsdirectreviews") VALUES (false, 'fundingcasemonitor', 'Funding Case Monitor', 'Suivi du dossier de financement', 'fundingcasemonitor', 'agreement', 'supported', 'none', NULL, 'independent', 'explicit', 'on_completion', true);

INSERT INTO "Common_Entity_Type" ("_deleted", "egcs_cn_type", "egcs_cn_label_en", "egcs_cn_label_fr", "egcs_cn_localtype", "egcs_cn_ownerkind", "egcs_cn_completion", "egcs_cn_riskrating", "egcs_cn_extensionkey", "egcs_cn_assignmentmode", "egcs_cn_standardworkflow", "egcs_cn_approvalsubmission", "egcs_cn_supportsdirectreviews") VALUES (false, 'fundingclaimreconcile', 'Funding Claim Reconciliation', 'Rapprochement de réclamation de financement', 'fundingclaimreconcile', 'agreement', 'supported', 'none', NULL, 'independent', 'explicit', 'on_completion', true);

INSERT INTO "Common_Entity_Type" ("_deleted", "egcs_cn_type", "egcs_cn_label_en", "egcs_cn_label_fr", "egcs_cn_localtype", "egcs_cn_ownerkind", "egcs_cn_completion", "egcs_cn_riskrating", "egcs_cn_extensionkey", "egcs_cn_assignmentmode", "egcs_cn_standardworkflow", "egcs_cn_approvalsubmission", "egcs_cn_supportsdirectreviews") VALUES (false, 'fundingcaseforecast', 'Funding Case Forecast', 'Prévision du dossier de financement', 'fundingcaseforecast', 'agreement', 'supported', 'none', NULL, 'independent', 'explicit', 'on_completion', true);

INSERT INTO "Common_Entity_Type" ("_deleted", "egcs_cn_type", "egcs_cn_label_en", "egcs_cn_label_fr", "egcs_cn_localtype", "egcs_cn_ownerkind", "egcs_cn_completion", "egcs_cn_riskrating", "egcs_cn_extensionkey", "egcs_cn_assignmentmode", "egcs_cn_standardworkflow", "egcs_cn_approvalsubmission", "egcs_cn_supportsdirectreviews") VALUES (false, 'fundingcaseaccountreceivable', 'Accounts Receivable', 'Compte débiteur', 'fundingcaseaccountreceivable', 'agreement', 'supported', 'none', NULL, 'independent', 'explicit', 'on_completion', true);

INSERT INTO "Common_Entity_Type" ("_deleted", "egcs_cn_type", "egcs_cn_label_en", "egcs_cn_label_fr", "egcs_cn_localtype", "egcs_cn_ownerkind", "egcs_cn_completion", "egcs_cn_riskrating", "egcs_cn_extensionkey", "egcs_cn_assignmentmode", "egcs_cn_standardworkflow", "egcs_cn_approvalsubmission", "egcs_cn_supportsdirectreviews") VALUES (false, 'fundingcasecorrection', 'Correction', 'Correction', 'fundingcasecorrection', 'agreement', 'supported', 'none', NULL, 'independent', 'explicit', 'on_completion', true);

INSERT INTO "Common_Entity_Type" ("_deleted", "egcs_cn_type", "egcs_cn_label_en", "egcs_cn_label_fr", "egcs_cn_localtype", "egcs_cn_ownerkind", "egcs_cn_completion", "egcs_cn_riskrating", "egcs_cn_extensionkey", "egcs_cn_assignmentmode", "egcs_cn_standardworkflow", "egcs_cn_approvalsubmission", "egcs_cn_supportsdirectreviews") VALUES (false, 'fundingcasejournalvoucher', 'Journal Voucher', 'Pièce de journal', 'fundingcasejournalvoucher', 'agreement', 'supported', 'none', NULL, 'independent', 'explicit', 'on_completion', true);

INSERT INTO "Common_Entity_Type" ("_deleted", "egcs_cn_type", "egcs_cn_label_en", "egcs_cn_label_fr", "egcs_cn_localtype", "egcs_cn_ownerkind", "egcs_cn_completion", "egcs_cn_riskrating", "egcs_cn_extensionkey", "egcs_cn_assignmentmode", "egcs_cn_standardworkflow", "egcs_cn_approvalsubmission", "egcs_cn_supportsdirectreviews") VALUES (false, 'fundingcasepayment', 'Funding Case Payment', 'Paiement du dossier de financement', 'fundingcasepayment', 'agreement', 'supported', 'none', NULL, 'independent', 'explicit', 'on_completion', true);

INSERT INTO "Common_Entity_Type" ("_deleted", "egcs_cn_type", "egcs_cn_label_en", "egcs_cn_label_fr", "egcs_cn_localtype", "egcs_cn_ownerkind", "egcs_cn_completion", "egcs_cn_riskrating", "egcs_cn_extensionkey", "egcs_cn_assignmentmode", "egcs_cn_standardworkflow", "egcs_cn_approvalsubmission", "egcs_cn_supportsdirectreviews") VALUES (false, 'fundingcaserecommendation', 'Funding Case Recommendation', 'Recommandation du dossier de financement', 'fundingcaserecommendation', 'agreement', 'none', 'none', NULL, NULL, 'none', 'none', true);

INSERT INTO "Common_Entity_Type" ("_deleted", "egcs_cn_type", "egcs_cn_label_en", "egcs_cn_label_fr", "egcs_cn_localtype", "egcs_cn_ownerkind", "egcs_cn_completion", "egcs_cn_riskrating", "egcs_cn_extensionkey", "egcs_cn_assignmentmode", "egcs_cn_standardworkflow", "egcs_cn_approvalsubmission", "egcs_cn_supportsdirectreviews") VALUES (false, 'fundingcaseagreementcommitment', 'Funding Case Agreement Commitment', 'Engagement d’entente de dossier de financement', 'fundingcaseagreementcommitment', 'agreement', 'supported', 'none', NULL, 'independent', 'explicit', 'on_completion', true);

INSERT INTO "Common_Entity_Type" ("_deleted", "egcs_cn_type", "egcs_cn_label_en", "egcs_cn_label_fr", "egcs_cn_localtype", "egcs_cn_ownerkind", "egcs_cn_completion", "egcs_cn_riskrating", "egcs_cn_extensionkey", "egcs_cn_assignmentmode", "egcs_cn_standardworkflow", "egcs_cn_approvalsubmission", "egcs_cn_supportsdirectreviews") VALUES (false, 'fundingcaseintake', 'Intake', 'Réception', 'fundingcaseintake', 'funding_case', 'none', 'none', NULL, 'independent', 'explicit', 'explicit', true);

INSERT INTO "Common_Entity_Type" ("_deleted", "egcs_cn_type", "egcs_cn_label_en", "egcs_cn_label_fr", "egcs_cn_localtype", "egcs_cn_ownerkind", "egcs_cn_completion", "egcs_cn_riskrating", "egcs_cn_extensionkey", "egcs_cn_assignmentmode", "egcs_cn_standardworkflow", "egcs_cn_approvalsubmission", "egcs_cn_supportsdirectreviews") VALUES (false, 'fundingcaseaccountreceivablecreditmemo', 'Accounts Receivable Credit Memo', 'Note de crédit de compte débiteur', 'fundingcaseaccountreceivablecreditmemo', 'agency', 'supported', 'none', NULL, 'independent', 'explicit', 'on_completion', true);
END $baseline$`.execute(db)
}

/** Installs the current installFunctions definitions for this subject on a fresh database. */
export const installFunctions = async (db: Kysely<Database>): Promise<void> => {
  await sql`DO $baseline$ BEGIN
CREATE FUNCTION bind_extension_entity_owner()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE target_id bigint; owner_id bigint; agency_id bigint;
    BEGIN
      target_id := (to_jsonb(NEW) ->> TG_ARGV[1])::bigint;
      owner_id := (to_jsonb(NEW) ->> TG_ARGV[3])::bigint;
      IF target_id IS NULL OR owner_id IS NULL THEN
        RAISE EXCEPTION 'Extension lifecycle entity owner binding requires non-null target and owner identities'
          USING ERRCODE = '23502';
      END IF;
      IF TG_ARGV[2] = 'applicantrecipient' THEN
        IF TG_NARGS < 5 THEN
          RAISE EXCEPTION 'Proponent extension lifecycle identity requires an explicit agency column'
            USING ERRCODE = '23502';
        END IF;
        agency_id := (to_jsonb(NEW) ->> TG_ARGV[4])::bigint;
        IF agency_id IS NULL THEN
          RAISE EXCEPTION 'Proponent extension lifecycle identity requires an explicit agency'
            USING ERRCODE = '23502';
        END IF;
      END IF;
      INSERT INTO "Common_Extension_Entity_Owner" (
        egcs_cn_entityid,
        egcs_cn_entitytype,
        egcs_cn_ownerid,
        egcs_cn_ownertype,
        egcs_cn_agency
      ) VALUES (target_id, TG_ARGV[0], owner_id, TG_ARGV[2], agency_id);
      RETURN NEW;
    END;
    $function$;

CREATE FUNCTION capture_workflow_publication_conditions()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      IF NEW.egcs_cn_kind = 'workflow_setup' THEN
        INSERT INTO "Common_Workflow_Publication_Condition" (egcs_cn_publicationversion, egcs_cn_workflowsetupmember, egcs_cn_field, egcs_cn_option)
        SELECT NEW.id, (member->>'memberId')::bigint, (condition->>'fieldId')::bigint, egcs_cn_option::bigint
        FROM jsonb_array_elements(NEW.egcs_cn_definition->'members') member,
          jsonb_array_elements(COALESCE(member->'conditions', '[]'::jsonb)) condition,
          jsonb_array_elements_text(condition->'optionIds') egcs_cn_option
        WHERE condition ? 'fieldId' AND NOT condition ? 'source';
      END IF;
      RETURN NEW;
    END $function$;

CREATE FUNCTION fc_enforce_commitment_program_funding_total(target_agreement_id bigint, target_commitment_id bigint DEFAULT NULL::bigint)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
    DECLARE
      violating_commitment_id bigint;
    BEGIN
      SELECT commitment.id INTO violating_commitment_id
      FROM "Funding_Case_Agreement_Commitment" commitment
      JOIN "Funding_Case_Agreement_Commitment_Line" commitment_line
        ON commitment_line.egcs_fc_commitment = commitment.id
      WHERE commitment.egcs_fc_fundingagreement = target_agreement_id
        AND (target_commitment_id IS NULL OR commitment.id = target_commitment_id)
        AND commitment._deleted = false AND commitment_line._deleted = false
      GROUP BY commitment.id, commitment.egcs_fc_currency
      HAVING SUM(commitment_line.egcs_fc_amount) > COALESCE((
        SELECT SUM(line_item.egcs_fc_programfunding)
        FROM "Funding_Case_Agreement_Budget_Line_Item" line_item
        JOIN "Funding_Case_Agreement_Budget_Fiscal_Year" budget_year
          ON budget_year.id = line_item.egcs_fc_fundingagreementbudgetfiscalyear
        JOIN "Funding_Case_Agreement_Budget_Version" budget_version
          ON budget_version.id = budget_year.egcs_fc_budgetversion
          AND budget_version.egcs_fc_fundingagreement = budget_year.egcs_fc_fundingagreement
        WHERE budget_year.egcs_fc_fundingagreement = target_agreement_id
          AND line_item.egcs_fc_currency = commitment.egcs_fc_currency
          AND line_item._deleted = false AND budget_year._deleted = false
          AND budget_version.egcs_fc_iscurrent = true AND budget_version._deleted = false
      ), 0)
      LIMIT 1;

      IF violating_commitment_id IS NOT NULL THEN
        RAISE EXCEPTION 'Agreement commitment % exceeds program funding total for agreement %', violating_commitment_id, target_agreement_id
          USING ERRCODE = '23514', CONSTRAINT = 'fc_chk_commitmenttotalprogramfunding';
      END IF;
    END;
    $function$;

CREATE FUNCTION guard_stream_proponent_types()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE stream_id bigint;
    BEGIN
      IF TG_TABLE_NAME = 'Transfer_Payment_Stream' THEN
        PERFORM validate_stream_proponent_types(NEW.id);
      ELSIF TG_TABLE_NAME = 'Transfer_Payment_Profile' THEN
        FOR stream_id IN SELECT id FROM "Transfer_Payment_Stream" WHERE egcs_tp_transferpaymentprofile = NEW.id ORDER BY id LOOP
          PERFORM validate_stream_proponent_types(stream_id);
        END LOOP;
      ELSIF TG_TABLE_NAME = 'Funding_Case_Agreement_Profile' THEN
        PERFORM validate_stream_proponent_types(NEW.egcs_fc_transferpaymentstream);
      ELSE
        PERFORM validate_stream_proponent_types(OLD.egcs_tp_transferpaymentstream);
      END IF;
      RETURN NEW;
    END $function$;

CREATE FUNCTION lock_extension_entity_owner_binding()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      RAISE EXCEPTION 'Extension lifecycle entity owner binding is immutable'
        USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_extensionentityownerbindingimmutable';
    END;
    $function$;

CREATE FUNCTION lock_extension_entity_owner_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      IF (to_jsonb(NEW) -> TG_ARGV[0]) IS DISTINCT FROM (to_jsonb(OLD) -> TG_ARGV[0]) THEN
        RAISE EXCEPTION 'Extension lifecycle entity owner identity is immutable'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_extensionentityownercolumnimmutable';
      END IF;
      RETURN NEW;
    END;
    $function$;

CREATE FUNCTION preserve_linked_workflow_target()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      IF (NEW.egcs_cn_entitytype, NEW.egcs_cn_purpose)
        IS DISTINCT FROM (OLD.egcs_cn_entitytype, OLD.egcs_cn_purpose)
        AND EXISTS (
          SELECT 1 FROM "Transfer_Payment_Stream_Workflow" linked
          WHERE linked.egcs_tp_workflow = OLD.id AND linked._deleted = false
        ) THEN
        RAISE EXCEPTION 'A linked Workflow cannot change entity type or purpose'
          USING ERRCODE = '23514', CONSTRAINT = 'tp_chk_linkedworkflowtargetimmutable';
      END IF;
      RETURN NEW;
    END $function$;

CREATE FUNCTION prevent_catalog_agency_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      IF NEW.egcs_cn_agency IS DISTINCT FROM OLD.egcs_cn_agency THEN
        RAISE EXCEPTION 'Catalog Agency cannot change'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_catalogagencyimmutable';
      END IF;
      RETURN NEW;
    END $function$;

CREATE FUNCTION protect_agency_claim_reconciliation_status_refs()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
    $function$;

CREATE FUNCTION protect_agency_custom_field_identity()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      IF NEW.egcs_ay_agency IS DISTINCT FROM OLD.egcs_ay_agency
        OR NEW.egcs_ay_kind IS DISTINCT FROM OLD.egcs_ay_kind THEN
        RAISE EXCEPTION 'Agency custom field identity is immutable'
          USING ERRCODE = '23514', CONSTRAINT = 'ay_chk_custom_field_identity_immutable';
      END IF;
      IF OLD.egcs_ay_multiple AND NOT NEW.egcs_ay_multiple THEN
        RAISE EXCEPTION 'Multiple selection cannot be changed to single selection'
          USING ERRCODE = '23514', CONSTRAINT = 'ay_chk_custom_field_multiple_permanent';
      END IF;
      RETURN NEW;
    END $function$;

CREATE FUNCTION protect_agency_draft_status()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
    $function$;

CREATE FUNCTION protect_workflow_amendment_conditions()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE referenced boolean := false;
    BEGIN
      IF TG_TABLE_NAME = 'Transfer_Payment_Amendment_Subtype' THEN
        IF TG_OP = 'UPDATE' AND NOT (
          (NOT OLD._deleted AND NEW._deleted)
          OR NEW.egcs_tp_transferpaymentstream IS DISTINCT FROM OLD.egcs_tp_transferpaymentstream
        ) THEN RETURN NULL; END IF;
        referenced := workflow_amendment_subtype_in_use(OLD.id);
      ELSIF TG_TABLE_NAME = 'Transfer_Payment_Stream' THEN
        IF TG_OP = 'UPDATE' AND NOT (
          (NOT OLD._deleted AND NEW._deleted)
          OR NEW.egcs_tp_transferpaymentprofile IS DISTINCT FROM OLD.egcs_tp_transferpaymentprofile
        ) THEN RETURN NULL; END IF;
        SELECT EXISTS (
          SELECT 1 FROM "Transfer_Payment_Amendment_Subtype" subtype
          WHERE subtype.egcs_tp_transferpaymentstream = OLD.id AND workflow_amendment_subtype_in_use(subtype.id)
        ) INTO referenced;
      ELSE
        IF TG_OP = 'UPDATE' AND NOT (
          (NOT OLD._deleted AND NEW._deleted)
          OR NEW.egcs_tp_agency IS DISTINCT FROM OLD.egcs_tp_agency
        ) THEN RETURN NULL; END IF;
        SELECT EXISTS (
          SELECT 1 FROM "Transfer_Payment_Amendment_Subtype" subtype
          JOIN "Transfer_Payment_Stream" stream ON stream.id = subtype.egcs_tp_transferpaymentstream
          WHERE stream.egcs_tp_transferpaymentprofile = OLD.id AND workflow_amendment_subtype_in_use(subtype.id)
        ) INTO referenced;
      END IF;
      IF referenced THEN
        RAISE EXCEPTION 'Workflow condition reference is in use'
          USING ERRCODE = '23514', CONSTRAINT = 'workflow_profile_condition_reference';
      END IF;
      RETURN NULL;
    END $function$;

CREATE FUNCTION protect_workflow_routing()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      IF NEW.egcs_cn_routing IS DISTINCT FROM OLD.egcs_cn_routing THEN
        RAISE EXCEPTION 'Workflow routing is immutable' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END $function$;

CREATE FUNCTION register_entity()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE allocated_id bigint; previous_owner text;
    BEGIN
      allocated_id := nextval(pg_get_serial_sequence('"Common_Entity"','id'));
      previous_owner := current_setting('app.audit_creation_owner',true);
      PERFORM set_config('app.audit_creation_owner',jsonb_build_object(
        'table',TG_TABLE_SCHEMA || '.Common_Entity','match',jsonb_build_object('id',allocated_id),
        'ownerTable',TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME,'ownerRow',to_jsonb(NEW)
      )::text,true);
      INSERT INTO "Common_Entity"(id,egcs_cn_entitytype) VALUES(allocated_id,TG_ARGV[0]::varchar(128));
      PERFORM set_config('app.audit_creation_owner',coalesce(previous_owner,''),true);
      NEW.id := allocated_id;
      RETURN NEW;
    END;
    $function$;

CREATE FUNCTION trg_fn_apply_publication_transition()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE
      publication_row "Common_Publication"%ROWTYPE;
      version_row "Common_Publication_Version"%ROWTYPE;
    BEGIN
      SELECT * INTO publication_row FROM "Common_Publication"
      WHERE id = NEW.egcs_cn_publication FOR UPDATE;
      IF NOT FOUND OR publication_row._deleted OR publication_row.egcs_cn_state <> NEW.egcs_cn_fromstate THEN
        RAISE EXCEPTION 'Publication transition does not match the current state'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_publicationtransitioncurrent';
      END IF;
      SELECT * INTO version_row FROM "Common_Publication_Version"
      WHERE id = NEW.egcs_cn_publicationversion AND egcs_cn_publication = publication_row.id FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Publication transition version is unavailable'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_ref_publicationtransitionversion';
      END IF;
      IF NEW.egcs_cn_tostate = 'published' THEN
        IF publication_row.egcs_cn_state = 'draft' AND version_row.egcs_cn_version <> 1 THEN
          RAISE EXCEPTION 'Initial publication must use version one'
            USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_publicationinitialversion';
        END IF;
        IF publication_row.egcs_cn_state = 'published' AND publication_row.egcs_cn_currentversion = version_row.id THEN
          RAISE EXCEPTION 'Republishing requires a new version'
            USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_publicationrepublishversion';
        END IF;
        IF publication_row.egcs_cn_state = 'published' AND version_row.egcs_cn_version <= (
          SELECT current_version.egcs_cn_version
          FROM "Common_Publication_Version" current_version
          WHERE current_version.id = publication_row.egcs_cn_currentversion
        ) THEN
          RAISE EXCEPTION 'Republishing must advance the current version'
            USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_publicationversionforward';
        END IF;
      ELSIF NEW.egcs_cn_tostate = 'retired' AND publication_row.egcs_cn_currentversion <> version_row.id THEN
        RAISE EXCEPTION 'Retirement must reference the current version'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_publicationretireversion';
      END IF;
      PERFORM set_config('app.publication_transition', 'on', true);
      UPDATE "Common_Publication"
      SET egcs_cn_state = NEW.egcs_cn_tostate,
          egcs_cn_currentversion = CASE WHEN NEW.egcs_cn_tostate = 'published' THEN version_row.id ELSE egcs_cn_currentversion END
      WHERE id = publication_row.id;
      PERFORM set_config('app.publication_transition', '', true);
      RETURN NEW;
    END;
    $function$;

CREATE FUNCTION trg_fn_apply_runtime_transition()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE
      current_state varchar(32);
      transition_time timestamptz := now();
    BEGIN
      IF NEW.egcs_cn_runtimeitem IS NULL THEN
        SELECT egcs_cn_state INTO current_state FROM "Common_Runtime"
        WHERE id = NEW.egcs_cn_runtime FOR UPDATE;
      ELSE
        SELECT egcs_cn_state INTO current_state FROM "Common_Runtime_Item"
        WHERE id = NEW.egcs_cn_runtimeitem AND egcs_cn_runtime = NEW.egcs_cn_runtime FOR UPDATE;
      END IF;
      IF current_state IS NULL OR current_state <> NEW.egcs_cn_fromstate THEN
        RAISE EXCEPTION 'Runtime transition does not match the current state'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_runtimetransitioncurrent';
      END IF;
      PERFORM set_config('app.runtime_transition', 'on', true);
      IF NEW.egcs_cn_runtimeitem IS NULL THEN
        UPDATE "Common_Runtime" SET
          egcs_cn_state = NEW.egcs_cn_tostate,
          egcs_cn_startedat = CASE WHEN egcs_cn_startedat IS NULL AND NEW.egcs_cn_tostate IN ('active', 'awaiting_action', 'paused') THEN transition_time ELSE egcs_cn_startedat END,
          egcs_cn_updatedat = transition_time,
          egcs_cn_completedat = CASE WHEN NEW.egcs_cn_tostate IN ('succeeded', 'approved', 'unsuccessful', 'denied', 'cancelled', 'failed') THEN transition_time ELSE NULL END
        WHERE id = NEW.egcs_cn_runtime;
      ELSE
        UPDATE "Common_Runtime_Item" SET
          egcs_cn_state = NEW.egcs_cn_tostate,
          egcs_cn_startedat = CASE WHEN egcs_cn_startedat IS NULL AND NEW.egcs_cn_tostate IN ('active', 'awaiting_action', 'paused') THEN transition_time ELSE egcs_cn_startedat END,
          egcs_cn_updatedat = transition_time,
          egcs_cn_completedat = CASE WHEN NEW.egcs_cn_tostate IN ('succeeded', 'approved', 'unsuccessful', 'denied', 'cancelled', 'failed') THEN transition_time ELSE NULL END
        WHERE id = NEW.egcs_cn_runtimeitem;
      END IF;
      PERFORM set_config('app.runtime_transition', '', true);
      RETURN NEW;
    END;
    $function$;

CREATE FUNCTION trg_fn_ar_completion_control()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE payment record; debt record; memo record;
    BEGIN
      IF NEW.egcs_cn_entitytype IN ('fundingcaseaccountreceivable','fundingcaseaccountreceivablecreditmemo')
        OR (NEW.egcs_cn_entitytype = 'fundingcasepayment' AND EXISTS (SELECT 1 FROM "Funding_Case_Account_Receivable_Recovery" recovery
          WHERE recovery.egcs_fc_payment = NEW.egcs_cn_entityid AND recovery.egcs_fc_outcome <> 'released' AND NOT recovery._deleted AND recovery.egcs_fc_amount > 0)) THEN
        IF NEW.egcs_cn_disposition <> 'workflow_started' OR NOT EXISTS (SELECT 1 FROM "Common_Workflow_Run" run
          JOIN "Common_Runtime" runtime ON runtime.id = run.id WHERE run.egcs_cn_completion = NEW.id
            AND runtime.egcs_cn_entitytype = NEW.egcs_cn_entitytype AND runtime.egcs_cn_entityid = NEW.egcs_cn_entityid
            AND runtime.egcs_cn_kind = 'workflow' AND runtime.egcs_cn_purpose = 'approval_submission' AND NOT runtime._deleted) THEN
          RAISE EXCEPTION 'AR and automatic offsets require a Completion-linked approval submission' USING ERRCODE = '23514';
        END IF;
      END IF;
      IF NEW.egcs_cn_entitytype = 'fundingcaseaccountreceivable' THEN
        SELECT * INTO debt FROM "Funding_Case_Agreement_Account_Receivable" WHERE id = NEW.egcs_cn_entityid;
        IF debt.egcs_fc_recoverymethod IS NULL THEN RAISE EXCEPTION 'AR submission requires a recovery method' USING ERRCODE = '23514'; END IF;
        IF debt.egcs_fc_advancepaymentrelated AND debt.egcs_fc_fiscaloutstanding IS NULL THEN
          RAISE EXCEPTION 'Advance AR submission requires retained fiscal outstanding capacity' USING ERRCODE = '23514';
        END IF;
        IF debt.egcs_fc_monitorrequired <> (debt.egcs_fc_monitorfollowup IS NOT NULL) THEN
          RAISE EXCEPTION 'AR submission requires its configured Monitor follow-up' USING ERRCODE = '23514';
        END IF;
        IF EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Account_Receivable_Line" line
          LEFT JOIN "Agency_Chart_of_Account" account ON account.id = line.egcs_fc_accountreceivablechartofaccount
          WHERE line.egcs_fc_receivable = debt.id AND NOT line._deleted AND line.egcs_fc_amount <> 0
            AND (account.id IS NULL OR account.egcs_ay_kind <> 'account_receivable'
              OR NOT EXISTS (SELECT 1 FROM "Transfer_Payment_Stream_Chart_of_Account" selection
                JOIN "Funding_Case_Agreement_Profile" agreement ON agreement.egcs_fc_transferpaymentstream=selection.egcs_tp_transferpaymentstream
                WHERE agreement.id=debt.egcs_fc_fundingagreement AND selection.egcs_tp_agencychartofaccount=account.id AND NOT selection._deleted)
              OR account.egcs_ay_fiscalyear <> debt.egcs_fc_agencyfiscalyear OR account.egcs_ay_currency <> debt.egcs_fc_currency
              OR (debt.egcs_fc_linkedreceivable IS NULL AND account._deleted))) THEN
          RAISE EXCEPTION 'AR submission requires valid financial accounts for every nonzero line' USING ERRCODE = '23514';
        END IF;
      END IF;
      IF NEW.egcs_cn_entitytype = 'fundingcaseaccountreceivablecreditmemo' THEN
        SELECT * INTO memo FROM "Funding_Case_Account_Receivable_Credit_Memo" WHERE id=NEW.egcs_cn_entityid;
        PERFORM ar_validate_pool_credit_memo(to_jsonb(memo),to_jsonb(memo),'UPDATE');
      END IF;
      IF NEW.egcs_cn_entitytype = 'fundingcasepayment' THEN
        SELECT * INTO payment FROM "Funding_Case_Agreement_Payment" WHERE id = NEW.egcs_cn_entityid;
        IF ar_payment_control(payment.id,payment.egcs_fc_fundingagreement,payment.egcs_fc_applicantrecipient) <> 'allowed' THEN
          RAISE EXCEPTION 'Payment is blocked by debtor recovery control' USING ERRCODE = '23514';
        END IF;
      END IF;
      RETURN NULL;
    END $function$;

CREATE FUNCTION trg_fn_ar_payment_terminal_control()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE payment record;
    BEGIN
      IF NEW.egcs_cn_entitytype = 'fundingcasepayment' AND NEW.egcs_cn_kind = 'workflow'
        AND NEW.egcs_cn_purpose = 'approval_submission' AND NEW.egcs_cn_state IN ('succeeded','approved') AND NOT NEW._deleted THEN
        SELECT * INTO payment FROM "Funding_Case_Agreement_Payment" WHERE id = NEW.egcs_cn_entityid;
        IF ar_payment_control(payment.id,payment.egcs_fc_fundingagreement,payment.egcs_fc_applicantrecipient) <> 'allowed' THEN
          RAISE EXCEPTION 'Final Payment is blocked by debtor recovery control' USING ERRCODE = '23514';
        END IF;
        IF EXISTS (SELECT 1 FROM "Funding_Case_Account_Receivable_Recovery" recovery WHERE recovery.egcs_fc_payment = payment.id
          AND recovery.egcs_fc_outcome = 'open' AND recovery.egcs_fc_amount > 0) THEN
          RAISE EXCEPTION 'Final Payment must post its Credit Memo atomically' USING ERRCODE = '23514';
        END IF;
      END IF;
      RETURN NULL;
    END $function$;

CREATE FUNCTION trg_fn_assert_opportunity_streams(opportunity_id bigint)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
    DECLARE anchor_stream bigint; anchor_program bigint;
      opportunity_name_en text; opportunity_name_fr text; opportunity_deleted boolean;
    BEGIN
      SELECT opportunity.egcs_fo_transferpaymentstream, stream.egcs_tp_transferpaymentprofile,
          opportunity.egcs_fo_name_en, opportunity.egcs_fo_name_fr, opportunity._deleted
        INTO anchor_stream, anchor_program, opportunity_name_en, opportunity_name_fr, opportunity_deleted
      FROM "Funding_Opportunity_Profile" opportunity
      JOIN "Transfer_Payment_Stream" stream ON stream.id = opportunity.egcs_fo_transferpaymentstream
      WHERE opportunity.id = opportunity_id FOR UPDATE OF opportunity;
      IF NOT FOUND THEN RETURN; END IF;
      -- Serializes concurrent selection/name checks across this Program.
      PERFORM 1 FROM "Transfer_Payment_Profile" WHERE id = anchor_program FOR UPDATE;
      IF NOT EXISTS (SELECT 1 FROM "Funding_Opportunity_Stream" link
        WHERE link.egcs_fo_fundingopportunity = opportunity_id
          AND link.egcs_fo_transferpaymentstream = anchor_stream AND link._deleted = false) THEN
        RAISE EXCEPTION 'Opportunity must retain its anchor Stream'
          USING ERRCODE = '23514', CONSTRAINT = 'fo_chk_anchor_stream';
      END IF;
      IF EXISTS (SELECT 1 FROM "Funding_Opportunity_Stream" link
        JOIN "Transfer_Payment_Stream" stream ON stream.id = link.egcs_fo_transferpaymentstream
        WHERE link.egcs_fo_fundingopportunity = opportunity_id AND link._deleted = false
          AND stream.egcs_tp_transferpaymentprofile <> anchor_program) THEN
        RAISE EXCEPTION 'Opportunity Streams must belong to one Program'
          USING ERRCODE = '23514', CONSTRAINT = 'fo_chk_stream_program';
      END IF;
      IF NOT opportunity_deleted AND EXISTS (
        SELECT 1 FROM "Funding_Opportunity_Profile" other
        WHERE other.id <> opportunity_id AND other._deleted = false
          AND lower(btrim(other.egcs_fo_name_en)) = lower(btrim(opportunity_name_en))
          AND EXISTS (
            SELECT 1 FROM "Funding_Opportunity_Stream" selected
            JOIN "Funding_Opportunity_Stream" other_selected
              ON other_selected.egcs_fo_transferpaymentstream = selected.egcs_fo_transferpaymentstream
              AND other_selected.egcs_fo_fundingopportunity = other.id AND other_selected._deleted = false
            WHERE selected.egcs_fo_fundingopportunity = opportunity_id AND selected._deleted = false
          )
      ) THEN
        RAISE EXCEPTION 'Opportunity English name must be unique in each selected Stream'
          USING ERRCODE = '23505', CONSTRAINT = 'fo_idx_selected_stream_name_en';
      END IF;
      IF NOT opportunity_deleted AND EXISTS (
        SELECT 1 FROM "Funding_Opportunity_Profile" other
        WHERE other.id <> opportunity_id AND other._deleted = false
          AND lower(btrim(other.egcs_fo_name_fr)) = lower(btrim(opportunity_name_fr))
          AND EXISTS (
            SELECT 1 FROM "Funding_Opportunity_Stream" selected
            JOIN "Funding_Opportunity_Stream" other_selected
              ON other_selected.egcs_fo_transferpaymentstream = selected.egcs_fo_transferpaymentstream
              AND other_selected.egcs_fo_fundingopportunity = other.id AND other_selected._deleted = false
            WHERE selected.egcs_fo_fundingopportunity = opportunity_id AND selected._deleted = false
          )
      ) THEN
        RAISE EXCEPTION 'Opportunity French name must be unique in each selected Stream'
          USING ERRCODE = '23505', CONSTRAINT = 'fo_idx_selected_stream_name_fr';
      END IF;
    END;
  $function$;

CREATE FUNCTION trg_fn_autopopulate_self_approval()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE user_position_title text;
    BEGIN
      IF NEW.egcs_cn_approvalvalue IS NULL OR OLD.egcs_cn_approvalvalue IS NOT NULL THEN RETURN NEW; END IF;
      IF NEW.egcs_cn_defaultuser IS NULL OR NEW.egcs_cn_defaultuser <> NEW.egcs_cn_assigneduser THEN RETURN NEW; END IF;
      SELECT egcs_cn_position_title INTO user_position_title FROM "Common_User" WHERE id = NEW.egcs_cn_assigneduser;
      NEW.egcs_cn_approvaldate := NOW();
      NEW.egcs_cn_approvalpositiontitle := user_position_title;
      RETURN NEW;
    END;
    $function$;

CREATE FUNCTION trg_fn_correction_financial_lock()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE row_data jsonb; agreement_id bigint; version record; target_type text; target_id bigint;
    BEGIN
      IF TG_OP = 'UPDATE' AND to_jsonb(OLD) = to_jsonb(NEW) THEN RETURN NEW; END IF;
      FOR row_data IN SELECT value FROM jsonb_array_elements(
        CASE WHEN TG_OP = 'INSERT' THEN jsonb_build_array(to_jsonb(NEW))
          WHEN TG_OP = 'DELETE' THEN jsonb_build_array(to_jsonb(OLD))
          ELSE jsonb_build_array(to_jsonb(OLD),to_jsonb(NEW)) END
      ) LOOP
        agreement_id := NULL;
        CASE TG_TABLE_NAME
          WHEN 'Funding_Case_Agreement_Payment','Funding_Case_Agreement_Commitment','Funding_Case_Agreement_Journal_Voucher' THEN
            agreement_id := (row_data->>'egcs_fc_fundingagreement')::bigint;
          WHEN 'Funding_Case_Agreement_Payment_Line' THEN
            SELECT egcs_fc_fundingagreement INTO agreement_id FROM "Funding_Case_Agreement_Payment"
              WHERE id = (row_data->>'egcs_fc_fundingagreementpayment')::bigint;
          WHEN 'Funding_Case_Agreement_Commitment_Line' THEN
            SELECT egcs_fc_fundingagreement INTO agreement_id FROM "Funding_Case_Agreement_Commitment"
              WHERE id = (row_data->>'egcs_fc_commitment')::bigint;
          WHEN 'Funding_Case_Agreement_Journal_Voucher_Line' THEN
            SELECT egcs_fc_fundingagreement INTO agreement_id FROM "Funding_Case_Agreement_Journal_Voucher"
              WHERE id = (row_data->>'egcs_fc_journalvoucher')::bigint;
          WHEN 'Funding_Case_Agreement_Budget_Version' THEN
            IF (row_data->>'egcs_fc_iscurrent')::boolean = false AND row_data->>'egcs_fc_amendment' IS NOT NULL THEN CONTINUE; END IF;
            agreement_id := (row_data->>'egcs_fc_fundingagreement')::bigint;
          WHEN 'Funding_Case_Agreement_Budget_Fiscal_Year' THEN
            SELECT * INTO version FROM "Funding_Case_Agreement_Budget_Version" WHERE id = (row_data->>'egcs_fc_budgetversion')::bigint;
            IF version.egcs_fc_iscurrent = false AND version.egcs_fc_amendment IS NOT NULL THEN CONTINUE; END IF;
            agreement_id := COALESCE(version.egcs_fc_fundingagreement,(row_data->>'egcs_fc_fundingagreement')::bigint);
          WHEN 'Funding_Case_Agreement_Budget_Line_Item' THEN
            SELECT v.* INTO version FROM "Funding_Case_Agreement_Budget_Fiscal_Year" y
              JOIN "Funding_Case_Agreement_Budget_Version" v ON v.id = y.egcs_fc_budgetversion
              WHERE y.id = (row_data->>'egcs_fc_fundingagreementbudgetfiscalyear')::bigint;
            IF version.egcs_fc_iscurrent = false AND version.egcs_fc_amendment IS NOT NULL THEN CONTINUE; END IF;
            agreement_id := COALESCE(version.egcs_fc_fundingagreement,(row_data->>'egcs_fc_fundingagreement')::bigint);
          WHEN 'Funding_Case_Agreement_Budget_Line_Item_Funding' THEN
            SELECT v.* INTO version FROM "Funding_Case_Agreement_Budget_Line_Item" l
              JOIN "Funding_Case_Agreement_Budget_Version" v ON v.id = l.egcs_fc_budgetversion
              WHERE l.id = (row_data->>'egcs_fc_budgetlineitem')::bigint;
            IF version.egcs_fc_iscurrent = false AND version.egcs_fc_amendment IS NOT NULL THEN CONTINUE; END IF;
            agreement_id := version.egcs_fc_fundingagreement;
          WHEN 'Funding_Case_Agreement_Closeout' THEN
            IF NOT EXISTS (SELECT 1 FROM "Common_Status" WHERE id = (row_data->>'egcs_fc_status')::bigint AND egcs_cn_terminal) THEN CONTINUE; END IF;
            agreement_id := (row_data->>'egcs_fc_fundingagreement')::bigint;
          WHEN 'Common_Completion','Common_Runtime' THEN
            target_type := row_data->>'egcs_cn_entitytype';
            target_id := (row_data->>'egcs_cn_entityid')::bigint;
            CASE target_type
              WHEN 'fundingcasepayment' THEN SELECT egcs_fc_fundingagreement INTO agreement_id FROM "Funding_Case_Agreement_Payment" WHERE id = target_id;
              WHEN 'fundingcaseagreementcommitment' THEN SELECT egcs_fc_fundingagreement INTO agreement_id FROM "Funding_Case_Agreement_Commitment" WHERE id = target_id;
              WHEN 'fundingcasejournalvoucher' THEN SELECT egcs_fc_fundingagreement INTO agreement_id FROM "Funding_Case_Agreement_Journal_Voucher" WHERE id = target_id;
              WHEN 'fundingcaseagreementcloseout' THEN SELECT egcs_fc_fundingagreement INTO agreement_id FROM "Funding_Case_Agreement_Closeout" WHERE id = target_id;
              ELSE CONTINUE;
            END CASE;
          ELSE CONTINUE;
        END CASE;
        IF agreement_id IS NOT NULL THEN
          PERFORM id FROM "Funding_Case_Agreement_Profile" WHERE id = agreement_id FOR UPDATE;
          IF EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Correction" WHERE egcs_fc_fundingagreement = agreement_id AND egcs_fc_outcome = 'open' AND NOT _deleted) THEN
            RAISE EXCEPTION 'An open Correction locks Agreement financial activity' USING ERRCODE = '23514';
          END IF;
        END IF;
      END LOOP;
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
      RETURN NEW;
    END $function$;

CREATE FUNCTION trg_fn_enforce_approval_runtime_state()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE
      approval_state varchar(32);
      routing_state varchar(32);
    BEGIN
      IF NEW.egcs_cn_approvalvalue IS NOT DISTINCT FROM OLD.egcs_cn_approvalvalue THEN RETURN NEW; END IF;
      SELECT approval_item.egcs_cn_state, routing_item.egcs_cn_state
      INTO approval_state, routing_state
      FROM "Common_Runtime_Item" approval_item
      JOIN "Common_Routing_Slip" slip ON slip.id = NEW.egcs_cn_routingslip
      JOIN "Common_Runtime_Item" routing_item ON routing_item.id = slip.egcs_cn_runtimeitem
      WHERE approval_item.id = NEW.egcs_cn_runtimeitem
      FOR UPDATE OF approval_item, routing_item;
      IF approval_state <> 'awaiting_action' OR routing_state <> 'awaiting_action' THEN
        RAISE EXCEPTION 'Only the current awaiting approval step may be actioned'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_approvalruntimeactionstate';
      END IF;
      RETURN NEW;
    END;
    $function$;

CREATE FUNCTION trg_fn_enforce_approval_sequence()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE
      incomplete_prior integer;
    BEGIN
      IF NEW.egcs_cn_approvalvalue IS NULL OR OLD.egcs_cn_approvalvalue IS NOT NULL THEN
        RETURN NEW;
      END IF;

      SELECT COUNT(*) INTO incomplete_prior
      FROM "Common_Approval"
      WHERE egcs_cn_routingslip = NEW.egcs_cn_routingslip
        AND egcs_cn_sequence < NEW.egcs_cn_sequence
        AND egcs_cn_approvalvalue IS DISTINCT FROM true;

      IF incomplete_prior > 0 THEN
        RAISE EXCEPTION 'Cannot action approval %: % prior step(s) are incomplete or denied',
          NEW.id, incomplete_prior;
      END IF;

      RETURN NEW;
    END;
    $function$;

CREATE FUNCTION trg_fn_enforce_assignable_entity_roster()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      IF NEW._deleted = true THEN RETURN NULL; END IF;
      PERFORM trg_fn_group_aware_entity_assignment_roster(NEW.id, TG_ARGV[0]::varchar);
      RETURN NULL;
    END;
    $function$;

CREATE FUNCTION trg_fn_enforce_assigned_user_actions()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE
      session_user_id bigint;
    BEGIN
      IF NEW.egcs_cn_approvalvalue IS NOT DISTINCT FROM OLD.egcs_cn_approvalvalue THEN
        RETURN NEW;
      END IF;

      session_user_id := NULLIF(current_setting('app.current_user_id', true), '')::bigint;
      IF session_user_id IS NULL OR session_user_id <> NEW.egcs_cn_assigneduser THEN
        RAISE EXCEPTION 'Only the assigned user may action approval %', NEW.id;
      END IF;

      RETURN NEW;
    END;
    $function$;

CREATE FUNCTION trg_fn_enforce_completion_resolution()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE completion_ids bigint[]; completion_id bigint; completion_disposition varchar(32); initial_count integer;
    BEGIN
      IF TG_TABLE_NAME = 'Common_Completion' THEN
        completion_ids := ARRAY[NEW.id];
      ELSIF TG_OP = 'DELETE' THEN
        completion_ids := ARRAY[OLD.egcs_cn_completion];
      ELSIF TG_OP = 'INSERT' THEN
        completion_ids := ARRAY[NEW.egcs_cn_completion];
      ELSE
        completion_ids := ARRAY(
          SELECT DISTINCT value
          FROM unnest(ARRAY[NEW.egcs_cn_completion, OLD.egcs_cn_completion]) AS value
          WHERE value IS NOT NULL
        );
      END IF;
      FOREACH completion_id IN ARRAY completion_ids LOOP
        CONTINUE WHEN completion_id IS NULL;
        SELECT egcs_cn_disposition INTO completion_disposition
        FROM "Common_Completion" WHERE id = completion_id;
        CONTINUE WHEN NOT FOUND;
        SELECT count(*) INTO initial_count
        FROM "Common_Workflow_Run" run
        JOIN "Common_Runtime" runtime ON runtime.id = run.id
        WHERE run.egcs_cn_completion = completion_id
          AND runtime.egcs_cn_previousruntime IS NULL
          AND runtime._deleted = false;
        IF completion_disposition = 'workflow_started' AND initial_count <> 1 THEN
          RAISE EXCEPTION 'workflow_started Completion requires exactly one linked initial Workflow'
            USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_completionworkflowlink';
        ELSIF completion_disposition IN ('no_workflow', 'not_applicable') AND initial_count <> 0 THEN
          RAISE EXCEPTION 'Completion disposition rejects a linked initial Workflow'
            USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_completionworkflowlink';
        END IF;
      END LOOP;
      RETURN NULL;
    END;
    $function$;

CREATE FUNCTION trg_fn_enforce_correction_completion()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      IF NEW.egcs_cn_entitytype = 'fundingcasecorrection' THEN
        IF NEW.egcs_cn_disposition <> 'workflow_started' OR NOT EXISTS (
          SELECT 1 FROM "Common_Workflow_Run" run JOIN "Common_Runtime" runtime ON runtime.id = run.id
          WHERE run.egcs_cn_completion = NEW.id AND runtime.egcs_cn_entitytype = 'fundingcasecorrection'
            AND runtime.egcs_cn_entityid = NEW.egcs_cn_entityid AND runtime.egcs_cn_kind = 'workflow'
            AND runtime.egcs_cn_purpose = 'approval_submission' AND NOT runtime._deleted
        ) THEN RAISE EXCEPTION 'Correction Completion requires a linked approval submission' USING ERRCODE = '23514'; END IF;
      END IF;
      RETURN NULL;
    END $function$;

CREATE FUNCTION trg_fn_enforce_entity_assignment_roster()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE target_id bigint; target_type varchar(128); target_deleted boolean;
    BEGIN
      target_id := COALESCE(NEW.egcs_cn_entityid, OLD.egcs_cn_entityid);
      target_type := COALESCE(NEW.egcs_cn_entitytype, OLD.egcs_cn_entitytype);
      SELECT _deleted INTO target_deleted FROM "Common_Entity"
        WHERE id = target_id AND egcs_cn_entitytype = target_type;
      IF COALESCE(target_deleted, true) THEN RETURN NULL; END IF;
      PERFORM trg_fn_group_aware_entity_assignment_roster(target_id, target_type);
      RETURN NULL;
    END;
    $function$;

CREATE FUNCTION trg_fn_enforce_entity_attachment_identity_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      IF NEW.egcs_cn_attachment IS DISTINCT FROM OLD.egcs_cn_attachment
        OR NEW.egcs_cn_entityid IS DISTINCT FROM OLD.egcs_cn_entityid
        OR NEW.egcs_cn_entitytype IS DISTINCT FROM OLD.egcs_cn_entitytype
        OR NEW.egcs_cn_uploadedby IS DISTINCT FROM OLD.egcs_cn_uploadedby THEN
        RAISE EXCEPTION 'Attachment business context is immutable' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END;
    $function$;

CREATE FUNCTION trg_fn_enforce_review_subtype()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE
      actual_type "Review_Type";
    BEGIN
      IF TG_TABLE_NAME IN ('Common_Assessment_Schema', 'Common_Checklist_Schema') THEN
        SELECT egcs_cn_reviewtype INTO actual_type
        FROM "Common_Review_Schema"
        WHERE id = NEW.egcs_cn_reviewschema;
      ELSE
        SELECT schema_record.egcs_cn_reviewtype INTO actual_type
        FROM "Common_Review" review_record
        INNER JOIN "Common_Review_Schema" schema_record
          ON schema_record.id = review_record.egcs_cn_reviewschema
        WHERE review_record.id = NEW.egcs_cn_review;
      END IF;

      IF actual_type IS DISTINCT FROM TG_ARGV[0]::"Review_Type" THEN
        RAISE EXCEPTION 'Review subtype % does not match schema type %', TG_ARGV[0], actual_type;
      END IF;
      RETURN NEW;
    END;
    $function$;

CREATE FUNCTION trg_fn_enforce_workflow_transition_mode()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE entity_definition "Common_Entity_Type"%ROWTYPE; linked_disposition varchar(32);
    BEGIN
      IF NEW.egcs_cn_kind <> 'workflow' OR NEW.egcs_cn_previousruntime IS NOT NULL THEN RETURN NULL; END IF;
      SELECT * INTO entity_definition FROM "Common_Entity_Type"
      WHERE egcs_cn_type = NEW.egcs_cn_entitytype AND _deleted = false;
      SELECT completion.egcs_cn_disposition INTO linked_disposition
      FROM "Common_Workflow_Run" run
      JOIN "Common_Completion" completion ON completion.id = run.egcs_cn_completion
      WHERE run.id = NEW.id;
      IF entity_definition.egcs_cn_type IS NULL THEN
        RAISE EXCEPTION 'Workflow entity type is unavailable'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_workflowtransitionmode';
      ELSIF NEW.egcs_cn_purpose = 'standard'
        AND (entity_definition.egcs_cn_standardworkflow <> 'explicit' OR linked_disposition IS NOT NULL) THEN
        RAISE EXCEPTION 'Standard Workflow requires explicit support and cannot link Completion evidence'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_workflowtransitionmode';
      ELSIF NEW.egcs_cn_purpose = 'approval_submission'
        AND entity_definition.egcs_cn_approvalsubmission = 'explicit'
        AND linked_disposition IS NOT NULL THEN
        RAISE EXCEPTION 'Explicit approval submission cannot link Completion evidence'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_workflowtransitionmode';
      ELSIF NEW.egcs_cn_purpose = 'approval_submission'
        AND entity_definition.egcs_cn_approvalsubmission = 'on_completion'
        AND linked_disposition IS DISTINCT FROM 'workflow_started' THEN
        RAISE EXCEPTION 'Completion-driven approval submission requires linked Completion evidence'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_workflowtransitionmode';
      ELSIF NEW.egcs_cn_purpose = 'approval_submission'
        AND entity_definition.egcs_cn_approvalsubmission = 'none' THEN
        RAISE EXCEPTION 'Entity type does not support approval submission'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_workflowtransitionmode';
      ELSIF NEW.egcs_cn_purpose = 'risk_rating'
        AND (entity_definition.egcs_cn_riskrating <> 'explicit' OR linked_disposition IS NOT NULL) THEN
        RAISE EXCEPTION 'Risk Rating Workflow requires explicit support and cannot link Completion evidence'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_workflowtransitionmode';
      ELSIF NEW.egcs_cn_purpose NOT IN ('standard', 'approval_submission', 'risk_rating') THEN
        RAISE EXCEPTION 'Workflow purpose is unsupported'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_workflowtransitionmode';
      END IF;
      RETURN NULL;
    END;
    $function$;

CREATE FUNCTION trg_fn_group_aware_entity_assignment_roster(target_id bigint, target_type character varying)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
    DECLARE active_count integer; primary_count integer; has_pending_group boolean;
    BEGIN
      SELECT count(*), count(*) FILTER (WHERE egcs_cn_isprimary)
      INTO active_count, primary_count
      FROM "Common_Entity_Assignment"
      WHERE egcs_cn_entityid = target_id AND egcs_cn_entitytype = target_type AND _deleted = false;
      IF target_type = 'commonreview' THEN
        SELECT EXISTS (SELECT 1 FROM "Common_Review" review
          WHERE review.id = target_id AND review._deleted = false
            AND review.egcs_cn_group IS NOT NULL AND review.egcs_cn_groupclaimedby IS NULL)
        INTO has_pending_group;
      ELSIF target_type = 'fundingcaseintake' THEN
        SELECT EXISTS (SELECT 1 FROM "Funding_Case_Intake_Profile" intake
          WHERE intake.id = target_id AND intake._deleted = false
            AND intake.egcs_fi_group IS NOT NULL AND intake.egcs_fi_groupclaimedby IS NULL)
        INTO has_pending_group;
      END IF;
      IF active_count = 0 AND COALESCE(has_pending_group, false) THEN RETURN; END IF;
      IF active_count < 1 OR primary_count <> 1 THEN
        RAISE EXCEPTION 'active entity assignment roster requires at least one assignee and exactly one primary'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_entityassignmentroster';
      END IF;
    END;
    $function$;

CREATE FUNCTION trg_fn_guard_publication_authoring()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE authoring_row record; publication_id bigint; publication_state varchar(32);
    BEGIN
      IF TG_OP = 'INSERT' THEN authoring_row := NEW; ELSE authoring_row := OLD; END IF;
      IF TG_ARGV[0] = 'publication' THEN
        publication_id := authoring_row.id;
      ELSIF TG_ARGV[0] = 'approval_step' THEN
        publication_id := authoring_row.egcs_cn_approvaltemplate;
      ELSIF TG_ARGV[0] = 'certification' THEN
        IF authoring_row.egcs_cn_routingslip IS NOT NULL THEN
          IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
        END IF;
        publication_id := authoring_row.egcs_cn_approvaltemplate;
        IF publication_id IS NULL THEN
          SELECT egcs_cn_approvaltemplate INTO publication_id FROM "Common_Approval_Step" WHERE id = authoring_row.egcs_cn_approvalstep;
        END IF;
      ELSIF TG_ARGV[0] = 'review_schema_child' THEN
        publication_id := authoring_row.egcs_cn_reviewschema;
      ELSIF TG_ARGV[0] = 'review_set_child' THEN
        publication_id := authoring_row.egcs_cn_reviewset;
      ELSIF TG_ARGV[0] = 'recommendation_set_child' THEN
        publication_id := authoring_row.egcs_cn_recommendationset;
      ELSIF TG_ARGV[0] = 'workflow_child' THEN
        publication_id := authoring_row.egcs_cn_workflowsetup;
      ELSIF TG_ARGV[0] = 'workflow_owner' THEN
        SELECT egcs_cn_workflowsetup INTO publication_id FROM "Common_Workflow_Setup_Member" WHERE id = authoring_row.egcs_cn_workflowsetupmember;
      END IF;
      SELECT egcs_cn_state INTO publication_state FROM "Common_Publication" WHERE id = publication_id;
      IF publication_state = 'retired' THEN
        RAISE EXCEPTION 'Retired publication authoring data is immutable'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_retiredpublicationimmutable';
      END IF;
      IF TG_ARGV[0] = 'publication' AND TG_OP = 'UPDATE' AND OLD._deleted = true AND NEW._deleted = false THEN
        RAISE EXCEPTION 'Deleted publication authoring rows cannot be restored'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_publicationnorestore';
      END IF;
      IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END;
    $function$;

CREATE FUNCTION trg_fn_lock_actioned_approval()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      IF OLD.egcs_cn_approvalvalue IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot modify approval %: already actioned with value %',
          OLD.id, OLD.egcs_cn_approvalvalue;
      END IF;

      RETURN NEW;
    END;
    $function$;

CREATE FUNCTION trg_fn_lock_approval_certification_evidence()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE approval_value boolean;
    BEGIN
      SELECT egcs_cn_approvalvalue INTO approval_value FROM "Common_Approval" WHERE id = OLD.egcs_cn_approval;
      IF approval_value IS NOT NULL THEN
        RAISE EXCEPTION 'Actioned approval certification evidence is immutable'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_approvalcertificationimmutable';
      END IF;
      RETURN NEW;
    END;
    $function$;

CREATE FUNCTION trg_fn_lock_approval_runtime_evidence()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE
      approval_state varchar(32);
      routing_state varchar(32);
    BEGIN
      SELECT approval_item.egcs_cn_state, routing_item.egcs_cn_state
      INTO approval_state, routing_state
      FROM "Common_Runtime_Item" approval_item
      JOIN "Common_Routing_Slip" slip ON slip.id = OLD.egcs_cn_routingslip
      JOIN "Common_Runtime_Item" routing_item ON routing_item.id = slip.egcs_cn_runtimeitem
      WHERE approval_item.id = OLD.egcs_cn_runtimeitem;
      IF approval_state IN ('succeeded', 'approved', 'unsuccessful', 'denied', 'cancelled', 'failed')
        OR routing_state IN ('succeeded', 'approved', 'unsuccessful', 'denied', 'cancelled', 'failed') THEN
        RAISE EXCEPTION 'Terminal approval evidence is immutable'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_approvalterminalimmutable';
      END IF;
      RETURN NEW;
    END;
    $function$;

CREATE FUNCTION trg_fn_lock_completion()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      RAISE EXCEPTION 'Completion evidence is immutable'
        USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_completion_immutable';
    END;
    $function$;

CREATE FUNCTION trg_fn_lock_entity_type()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      RAISE EXCEPTION 'Entity type declarations are immutable'
        USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_entitytypeimmutable';
    END;
    $function$;

CREATE FUNCTION trg_fn_lock_publication_evidence()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      RAISE EXCEPTION 'Publication versions and transition history are immutable'
        USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_publicationevidenceimmutable';
    END;
    $function$;

CREATE FUNCTION trg_fn_lock_recommendation_setup_identity()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      IF NEW.egcs_cn_recommendationset IS DISTINCT FROM OLD.egcs_cn_recommendationset THEN
        RAISE EXCEPTION 'Recommendation setup set is immutable';
      END IF;
      RETURN NEW;
    END;
    $function$;

CREATE FUNCTION trg_fn_lock_runtime_transition()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      RAISE EXCEPTION 'Runtime transition history is immutable'
        USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_runtimetransitionimmutable';
    END;
    $function$;

CREATE FUNCTION trg_fn_lock_terminal_runtime_evidence()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE evidence_row record; runtime_state varchar(32);
    BEGIN
      IF TG_OP = 'INSERT' THEN evidence_row := NEW; ELSE evidence_row := OLD; END IF;
      IF TG_TABLE_NAME = 'Common_Routing_Slip' THEN
        SELECT item.egcs_cn_state INTO runtime_state FROM "Common_Runtime_Item" item WHERE item.id = evidence_row.egcs_cn_runtimeitem;
      ELSIF TG_TABLE_NAME = 'Common_Certification' THEN
        IF evidence_row.egcs_cn_routingslip IS NULL THEN
          IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
        END IF;
        SELECT item.egcs_cn_state INTO runtime_state FROM "Common_Routing_Slip" slip
          JOIN "Common_Runtime_Item" item ON item.id = slip.egcs_cn_runtimeitem WHERE slip.id = evidence_row.egcs_cn_routingslip;
      ELSIF TG_TABLE_NAME = 'Common_Review' THEN
        SELECT item.egcs_cn_state INTO runtime_state FROM "Common_Runtime_Item" item WHERE item.id = evidence_row.egcs_cn_runtimeitem;
      ELSIF TG_TABLE_NAME IN ('Common_Assessment', 'Common_Checklist', 'Common_Assessment_Outcome', 'Common_Assessment_Custom_Outcome') THEN
        SELECT item.egcs_cn_state INTO runtime_state FROM "Common_Review" review
          JOIN "Common_Runtime_Item" item ON item.id = review.egcs_cn_runtimeitem
          WHERE review.id = evidence_row.egcs_cn_review;
      ELSIF TG_TABLE_NAME = 'Common_Review_Response' THEN
        SELECT item.egcs_cn_state INTO runtime_state FROM "Common_Assessment" assessment
          JOIN "Common_Review" review ON review.id = assessment.egcs_cn_review
          JOIN "Common_Runtime_Item" item ON item.id = review.egcs_cn_runtimeitem
          WHERE assessment.id = evidence_row.egcs_cn_assessment;
      ELSIF TG_TABLE_NAME = 'Common_Checklist_Response' THEN
        SELECT item.egcs_cn_state INTO runtime_state FROM "Common_Checklist" checklist
          JOIN "Common_Review" review ON review.id = checklist.egcs_cn_review
          JOIN "Common_Runtime_Item" item ON item.id = review.egcs_cn_runtimeitem
          WHERE checklist.id = evidence_row.egcs_cn_checklist;
      ELSIF TG_TABLE_NAME = 'Common_Recommendation' THEN
        SELECT item.egcs_cn_state INTO runtime_state FROM "Common_Runtime_Item" item WHERE item.id = evidence_row.egcs_cn_runtimeitem;
      END IF;
      IF runtime_state IN ('succeeded', 'approved', 'unsuccessful', 'denied', 'cancelled', 'failed') THEN
        RAISE EXCEPTION 'Terminal runtime evidence is immutable'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_terminalruntimeevidenceimmutable';
      END IF;
      IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END;
    $function$;

CREATE FUNCTION trg_fn_lock_workflow_status_transition()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN RAISE EXCEPTION 'Workflow status transition history is immutable'; END;
    $function$;

CREATE FUNCTION trg_fn_preserve_retryable_workflow_status()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      IF NOT OLD._deleted AND NEW._deleted AND EXISTS (
        SELECT 1
        FROM "Common_Workflow_Publication_Status" pinned_status
        JOIN "Common_Publication_Version" version
          ON version.id = pinned_status.egcs_cn_publicationversion
        JOIN "Common_Runtime" runtime
          ON runtime.egcs_cn_sourcepublicationversion = version.id
         AND runtime.egcs_cn_sourcepublication = version.egcs_cn_publication
         AND runtime.egcs_cn_kind = 'workflow'
        WHERE pinned_status.egcs_cn_status = OLD.id
          AND runtime._deleted = false
          AND (
            runtime.egcs_cn_state IN ('pending', 'active', 'awaiting_action', 'paused')
            OR (
              runtime.egcs_cn_state IN ('unsuccessful', 'denied', 'cancelled', 'failed')
              AND NOT EXISTS (
                SELECT 1
                FROM "Common_Runtime" newer_runtime
                WHERE newer_runtime.egcs_cn_kind = 'workflow'
                  AND newer_runtime.egcs_cn_entitytype = runtime.egcs_cn_entitytype
                  AND newer_runtime.egcs_cn_entityid = runtime.egcs_cn_entityid
                  AND newer_runtime.egcs_cn_purpose = runtime.egcs_cn_purpose
                  AND newer_runtime.id > runtime.id
                  AND newer_runtime._deleted = false
              )
              AND COALESCE((version.egcs_cn_definition ->> 'allowRetry')::boolean, false)
            )
          )
      ) THEN
        RAISE EXCEPTION 'Statuses pinned by retryable workflow attempts cannot be deleted'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_status_retryableworkflowreference';
      END IF;
      RETURN NEW;
    END;
    $function$;

CREATE FUNCTION trg_fn_prevent_entity_assignment_identity_update()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      IF NEW.egcs_cn_entityid IS DISTINCT FROM OLD.egcs_cn_entityid
        OR NEW.egcs_cn_entitytype IS DISTINCT FROM OLD.egcs_cn_entitytype THEN
        RAISE EXCEPTION 'entity assignment identity is immutable'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_entityassignmentidentityimmutable';
      END IF;
      RETURN NEW;
    END;
    $function$;

CREATE FUNCTION trg_fn_protect_ar_roster()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE root_id bigint; target_type text; root_outcome text;
    BEGIN
      root_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.egcs_cn_entityid ELSE NEW.egcs_cn_entityid END;
      target_type := CASE WHEN TG_OP = 'DELETE' THEN OLD.egcs_cn_entitytype ELSE NEW.egcs_cn_entitytype END;
      IF target_type = 'fundingcaseaccountreceivable' THEN
        SELECT egcs_fc_outcome INTO root_outcome FROM "Funding_Case_Agreement_Account_Receivable" WHERE id = root_id FOR UPDATE;
      ELSIF target_type = 'fundingcaseaccountreceivablecreditmemo' THEN
        SELECT egcs_fc_outcome INTO root_outcome FROM "Funding_Case_Account_Receivable_Credit_Memo" WHERE id = root_id FOR UPDATE;
      ELSE IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW;
      END IF;
      IF root_outcome <> 'open' OR ar_has_lifecycle_evidence(root_id,target_type) THEN RAISE EXCEPTION 'Submitted AR roster is immutable' USING ERRCODE = '23514'; END IF;
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW;
    END $function$;

CREATE FUNCTION trg_fn_protect_correction_roster()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE root_id bigint; target_type text; root record;
    BEGIN
      root_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.egcs_cn_entityid ELSE NEW.egcs_cn_entityid END;
      target_type := CASE WHEN TG_OP = 'DELETE' THEN OLD.egcs_cn_entitytype ELSE NEW.egcs_cn_entitytype END;
      IF target_type <> 'fundingcasecorrection' THEN IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW; END IF;
      SELECT * INTO root FROM "Funding_Case_Agreement_Correction" WHERE id = root_id FOR UPDATE;
      IF root.egcs_fc_outcome <> 'open' OR correction_has_lifecycle_evidence(root_id) THEN
        RAISE EXCEPTION 'Submitted Correction roster is immutable' USING ERRCODE = '23514';
      END IF;
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
      RETURN NEW;
    END $function$;

CREATE FUNCTION trg_fn_register_publication()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE publication_kind varchar(64) := TG_ARGV[0]; registered_kind varchar(64); previous_owner text;
    BEGIN
      previous_owner := current_setting('app.audit_creation_owner',true);
      IF NEW.id IS NULL THEN
        NEW.id := nextval(pg_get_serial_sequence('"Common_Publication"','id'));
      END IF;
      PERFORM set_config('app.audit_creation_owner',jsonb_build_object(
        'table',TG_TABLE_SCHEMA || '.Common_Publication',
        'match',jsonb_build_object('id',NEW.id),
        'ownerTable',TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME,
        'ownerRow',to_jsonb(NEW)
      )::text,true);
      INSERT INTO "Common_Publication"(id,egcs_cn_kind) VALUES(NEW.id,publication_kind)
        ON CONFLICT(id) DO NOTHING;
      PERFORM set_config('app.audit_creation_owner',coalesce(previous_owner,''),true);
      SELECT egcs_cn_kind INTO registered_kind FROM "Common_Publication" WHERE id = NEW.id;
      IF registered_kind IS DISTINCT FROM publication_kind THEN
        RAISE EXCEPTION 'Publication identity is already registered with another kind'
          USING ERRCODE='23514', CONSTRAINT='cn_ref_publicationsubtypekind';
      END IF;
      RETURN NEW;
    END;
    $function$;

CREATE FUNCTION trg_fn_require_actual_delegation_detail()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE
      requires_actual boolean;
    BEGIN
      IF NEW.egcs_cn_approvalvalue IS NULL OR OLD.egcs_cn_approvalvalue IS NOT NULL THEN
        RETURN NEW;
      END IF;

      IF NEW.egcs_cn_onbehalf IS NULL THEN
        RETURN NEW;
      END IF;

      SELECT egcs_ay_require_actual INTO requires_actual
      FROM "Agency_Approval_Behalf_Type"
      WHERE id = NEW.egcs_cn_onbehalf;

      IF requires_actual = true AND (
        NULLIF(BTRIM(NEW.egcs_cn_approvername), '') IS NULL
        OR
        NEW.egcs_cn_approvalpositiontitle IS NULL
        OR NEW.egcs_cn_approvaldate IS NULL
      ) THEN
        RAISE EXCEPTION 'Approval % requires full delegation detail (approver name, position title, date)',
          NEW.id;
      END IF;

      RETURN NEW;
    END;
    $function$;

CREATE FUNCTION trg_fn_require_certifications()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE
      uncertified_count integer;
    BEGIN
      IF NEW.egcs_cn_approvalvalue IS DISTINCT FROM true THEN
        RETURN NEW;
      END IF;

      SELECT COUNT(*) INTO uncertified_count
      FROM "Common_Approval_Certification"
      WHERE egcs_cn_approval = NEW.id
        AND egcs_cn_optional = false
        AND egcs_cn_value IS DISTINCT FROM true;

      IF uncertified_count > 0 THEN
        RAISE EXCEPTION 'Cannot approve %: % non-optional certification(s) not yet attested',
          NEW.id, uncertified_count;
      END IF;

      RETURN NEW;
    END;
    $function$;

CREATE FUNCTION trg_fn_require_publication_transition()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      IF NEW.egcs_cn_state IS DISTINCT FROM OLD.egcs_cn_state OR NEW.egcs_cn_currentversion IS DISTINCT FROM OLD.egcs_cn_currentversion THEN
        IF NOT EXISTS (
          SELECT 1 FROM "Common_Publication_Transition" transition
          WHERE transition.egcs_cn_publication = NEW.id
            AND transition.egcs_cn_fromstate = OLD.egcs_cn_state
            AND transition.egcs_cn_tostate = NEW.egcs_cn_state
            AND transition.egcs_cn_publicationversion = NEW.egcs_cn_currentversion
        ) THEN
          RAISE EXCEPTION 'Publication state changes require transition history'
            USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_publicationtransitionhistory';
        END IF;
      END IF;
      RETURN NULL;
    END;
    $function$;

CREATE FUNCTION trg_fn_require_runtime_root_transition()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      IF NEW.egcs_cn_state IS DISTINCT FROM OLD.egcs_cn_state AND NOT EXISTS (
        SELECT 1 FROM "Common_Runtime_Transition" transition
        WHERE transition.egcs_cn_runtime = NEW.id
          AND transition.egcs_cn_runtimeitem IS NULL
          AND transition.egcs_cn_fromstate = OLD.egcs_cn_state
          AND transition.egcs_cn_tostate = NEW.egcs_cn_state
      ) THEN
        RAISE EXCEPTION 'Runtime state changes require transition history'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_runtimetransitionhistory';
      END IF;
      RETURN NULL;
    END;
    $function$;

CREATE FUNCTION trg_fn_require_runtime_transition()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      IF NEW.egcs_cn_state IS DISTINCT FROM OLD.egcs_cn_state AND NOT EXISTS (
        SELECT 1 FROM "Common_Runtime_Transition" transition
        WHERE transition.egcs_cn_runtime = NEW.egcs_cn_runtime
          AND transition.egcs_cn_runtimeitem = NEW.id
          AND transition.egcs_cn_fromstate = OLD.egcs_cn_state
          AND transition.egcs_cn_tostate = NEW.egcs_cn_state
      ) THEN
        RAISE EXCEPTION 'Runtime item state changes require transition history'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_runtimetransitionhistory';
      END IF;
      RETURN NULL;
    END;
    $function$;

CREATE FUNCTION trg_fn_require_unsealed_publication_version()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE parent_version bigint; locked_version bigint;
    BEGIN
      parent_version := CASE
        WHEN TG_ARGV[0] = 'reference' THEN (to_jsonb(NEW)->>'egcs_cn_parentversion')::bigint
        ELSE (to_jsonb(NEW)->>'egcs_cn_publicationversion')::bigint
      END;
      SELECT id INTO locked_version FROM "Common_Publication_Version" WHERE id = parent_version FOR UPDATE;
      IF EXISTS (
        SELECT 1 FROM "Common_Publication_Transition" transition
        WHERE transition.egcs_cn_publicationversion = parent_version
      ) THEN
        RAISE EXCEPTION 'Published version evidence is sealed'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_publicationversionsealed';
      END IF;
      RETURN NEW;
    END;
    $function$;

CREATE FUNCTION trg_fn_reset_additional_reviewer_completion()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      IF TG_OP = 'UPDATE' AND (NEW.egcs_cn_user IS DISTINCT FROM OLD.egcs_cn_user
        OR NEW.egcs_cn_group IS DISTINCT FROM OLD.egcs_cn_group) THEN
        NEW.egcs_cn_completedat := NULL;
      END IF;
      RETURN NEW;
    END;
    $function$;

CREATE FUNCTION trg_fn_resolve_budget_line_item_identity()
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
    $function$;

CREATE FUNCTION trg_fn_soft_delete_entity_assignments()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      IF OLD._deleted = false AND NEW._deleted = true THEN
        UPDATE "Common_Entity"
        SET _deleted = true
        WHERE id = NEW.id AND egcs_cn_entitytype = TG_ARGV[0]::varchar(128) AND _deleted = false;
        UPDATE "Common_Entity_Assignment"
        SET _deleted = true
        WHERE egcs_cn_entityid = NEW.id AND egcs_cn_entitytype = TG_ARGV[0]::varchar(128) AND _deleted = false;
      END IF;
      RETURN NEW;
    END;
    $function$;

CREATE FUNCTION trg_fn_validate_added_approval_runtime_step()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE routing_state varchar(32); allows_additional boolean; max_actioned decimal;
      retry_source bigint; is_exact_retry_clone boolean;
    BEGIN
      IF NEW.egcs_cn_isadded = false THEN RETURN NEW; END IF;
      SELECT item.egcs_cn_state, slip.egcs_cn_allowadditionalapprovals, runtime.egcs_cn_previousruntime
      INTO routing_state, allows_additional, retry_source
      FROM "Common_Routing_Slip" slip
      JOIN "Common_Runtime_Item" item ON item.id = slip.egcs_cn_runtimeitem
      JOIN "Common_Runtime" runtime ON runtime.id = item.egcs_cn_runtime
      WHERE slip.id = NEW.egcs_cn_routingslip AND slip._deleted = false;
      IF routing_state = 'pending' AND retry_source IS NOT NULL THEN
        SELECT EXISTS (
          SELECT 1
          FROM "Common_Runtime_Item" new_step
          JOIN "Common_Runtime_Item" new_routing ON new_routing.id = new_step.egcs_cn_parentruntimeitem
          LEFT JOIN "Common_Runtime_Item" new_parent ON new_parent.id = new_routing.egcs_cn_parentruntimeitem
          JOIN "Common_Runtime_Item" old_routing
            ON old_routing.egcs_cn_runtime = retry_source
           AND old_routing.egcs_cn_kind = 'routing_slip'
           AND old_routing.egcs_cn_order = new_routing.egcs_cn_order
           AND old_routing.egcs_cn_publicationversion = new_routing.egcs_cn_publicationversion
          LEFT JOIN "Common_Runtime_Item" old_parent ON old_parent.id = old_routing.egcs_cn_parentruntimeitem
          JOIN "Common_Routing_Slip" new_slip ON new_slip.id = NEW.egcs_cn_routingslip
          JOIN "Common_Routing_Slip" old_slip
            ON old_slip.egcs_cn_runtimeitem = old_routing.id
           AND old_slip.egcs_cn_approvaltemplate = new_slip.egcs_cn_approvaltemplate
          JOIN "Common_Approval" old_approval ON old_approval.egcs_cn_routingslip = old_slip.id
          JOIN "Common_Runtime_Item" old_step ON old_step.id = old_approval.egcs_cn_runtimeitem
          WHERE new_step.id = NEW.egcs_cn_runtimeitem
            AND (old_parent.egcs_cn_kind, old_parent.egcs_cn_order,
                 old_parent.egcs_cn_publicationversion)
              IS NOT DISTINCT FROM
                (new_parent.egcs_cn_kind, new_parent.egcs_cn_order,
                 new_parent.egcs_cn_publicationversion)
            AND old_step.egcs_cn_order = new_step.egcs_cn_order
            AND old_step.egcs_cn_publicationversion = new_step.egcs_cn_publicationversion
            AND old_approval.egcs_cn_isadded = true
            AND (old_approval.egcs_cn_sequence, old_approval.egcs_cn_name_en,
                 old_approval.egcs_cn_name_fr, old_approval.egcs_cn_defaultuser)
              IS NOT DISTINCT FROM
                (NEW.egcs_cn_sequence, NEW.egcs_cn_name_en,
                 NEW.egcs_cn_name_fr, NEW.egcs_cn_defaultuser)
        ) INTO is_exact_retry_clone;
        IF is_exact_retry_clone THEN RETURN NEW; END IF;
      END IF;
      IF routing_state <> 'awaiting_action' OR allows_additional IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Added approval steps require an awaiting routing slip that permits additions'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_addedapprovalruntime';
      END IF;
      SELECT MAX(egcs_cn_sequence) INTO max_actioned FROM "Common_Approval"
      WHERE egcs_cn_routingslip = NEW.egcs_cn_routingslip AND egcs_cn_approvalvalue IS NOT NULL;
      IF max_actioned IS NOT NULL AND NEW.egcs_cn_sequence <= max_actioned THEN
        RAISE EXCEPTION 'Added approval step must follow the last actioned step'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_addedapprovalsequence';
      END IF;
      RETURN NEW;
    END;
    $function$;

CREATE FUNCTION trg_fn_validate_approval_runtime_item()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE
      approval_item "Common_Runtime_Item"%ROWTYPE;
      routing_item "Common_Runtime_Item"%ROWTYPE;
    BEGIN
      SELECT * INTO approval_item FROM "Common_Runtime_Item" WHERE id = NEW.egcs_cn_runtimeitem FOR UPDATE;
      SELECT item.* INTO routing_item
      FROM "Common_Routing_Slip" slip
      JOIN "Common_Runtime_Item" item ON item.id = slip.egcs_cn_runtimeitem
      WHERE slip.id = NEW.egcs_cn_routingslip
      FOR UPDATE OF item;
      IF approval_item.id IS NULL OR routing_item.id IS NULL
        OR approval_item._deleted OR routing_item._deleted
        OR approval_item.egcs_cn_kind <> 'approval_step'
        OR approval_item.egcs_cn_parentruntimeitem <> routing_item.id
        OR approval_item.egcs_cn_runtime <> routing_item.egcs_cn_runtime
        OR (approval_item.egcs_cn_publication, approval_item.egcs_cn_publicationkind,
            approval_item.egcs_cn_publicationversion, approval_item.egcs_cn_version)
          IS DISTINCT FROM
           (routing_item.egcs_cn_publication, routing_item.egcs_cn_publicationkind,
            routing_item.egcs_cn_publicationversion, routing_item.egcs_cn_version) THEN
        RAISE EXCEPTION 'Approval step runtime item does not match its routing slip'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_ref_approvalruntimeitem';
      END IF;
      RETURN NEW;
    END;
    $function$;

CREATE FUNCTION trg_fn_validate_claimant_approval_evidence()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE matches_default boolean;
    BEGIN
      IF NEW.egcs_cn_approvalvalue IS NULL OR OLD.egcs_cn_approvalvalue IS NOT NULL THEN RETURN NEW; END IF;
      IF NEW.egcs_cn_assigneduser IS NULL THEN
        RAISE EXCEPTION 'Approval % requires a claimant before a decision', NEW.id;
      END IF;
      IF NEW.egcs_cn_defaultuser IS NOT NULL THEN
        matches_default := NEW.egcs_cn_assigneduser = NEW.egcs_cn_defaultuser;
      ELSIF NEW.egcs_cn_defaultgroup IS NOT NULL THEN
        SELECT EXISTS (
          SELECT 1 FROM "Common_Group_Member" member
          JOIN "Common_Group" grp ON grp.id = member.egcs_cn_group
          JOIN "Common_User" actor ON actor.id = member.egcs_cn_user
          JOIN "user" auth_user ON auth_user.id = actor.egcs_cn_auth_user_id
          WHERE member.egcs_cn_group = NEW.egcs_cn_defaultgroup
            AND member.egcs_cn_user = NEW.egcs_cn_assigneduser
            AND member._deleted = false AND grp._deleted = false
            AND actor._deleted = false AND auth_user._deleted = false
        ) INTO matches_default;
      ELSE
        matches_default := true;
      END IF;
      IF matches_default AND NEW.egcs_cn_onbehalf IS NOT NULL THEN
        RAISE EXCEPTION 'Approval % does not permit on-behalf evidence for its default claimant', NEW.id;
      END IF;
      IF NOT matches_default AND NEW.egcs_cn_onbehalf IS NULL THEN
        RAISE EXCEPTION 'Approval % requires on-behalf evidence for its claimant', NEW.id;
      END IF;
      IF NEW.egcs_cn_defaultgroup IS NOT NULL AND matches_default AND NEW.egcs_cn_requiregroupdetails
        AND (NULLIF(BTRIM(NEW.egcs_cn_approvername), '') IS NULL
          OR NULLIF(BTRIM(NEW.egcs_cn_approvalpositiontitle), '') IS NULL
          OR NEW.egcs_cn_approvaldate IS NULL) THEN
        RAISE EXCEPTION 'Approval % requires group claimant name, title and date', NEW.id;
      END IF;
      RETURN NEW;
    END;
    $function$;

CREATE FUNCTION trg_fn_validate_completion_insert()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE entity_definition "Common_Entity_Type"%ROWTYPE;
    BEGIN
      SELECT * INTO entity_definition FROM "Common_Entity_Type"
      WHERE egcs_cn_type = NEW.egcs_cn_entitytype AND _deleted = false;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Completion entity type is unavailable'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_completionentitytype';
      END IF;
      IF NEW.egcs_cn_entitytype = 'commonreview' THEN
        IF NEW.egcs_cn_disposition <> 'not_applicable' THEN
          RAISE EXCEPTION 'Review completion does not select a business Workflow'
            USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_completiondispositiontype';
        END IF;
      ELSIF entity_definition.egcs_cn_completion <> 'supported'
        OR NEW.egcs_cn_disposition = 'not_applicable' THEN
        RAISE EXCEPTION 'Entity type does not support completion-driven transitions'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_completionentitytype';
      ELSIF NEW.egcs_cn_entitytype IN ('fundingcaseamendment', 'fundingcaseagreementcloseout')
        AND NEW.egcs_cn_disposition <> 'workflow_started' THEN
        RAISE EXCEPTION 'Entity requires an approval-submission Workflow at Completion'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_completionworkflowrequired';
      END IF;
      RETURN NEW;
    END;
    $function$;

CREATE FUNCTION trg_fn_validate_direct_review_entity_type()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM "Common_Entity_Type" entity_type
        WHERE entity_type.egcs_cn_type = NEW.egcs_cn_entitytype
          AND entity_type.egcs_cn_supportsdirectreviews = true
          AND entity_type._deleted = false
      ) THEN
        RAISE EXCEPTION 'Entity type does not support direct Reviews'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_directreviewentitytype';
      END IF;
      RETURN NEW;
    END;
    $function$;

CREATE FUNCTION trg_fn_validate_domain_runtime_extension()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE valid boolean := false;
    BEGIN
      IF TG_TABLE_NAME = 'Common_Review_Set' THEN
        SELECT true INTO valid FROM "Common_Runtime_Item" item JOIN "Common_Runtime" runtime ON runtime.id = item.egcs_cn_runtime
        WHERE item.id = NEW.egcs_cn_runtimeitem AND item.egcs_cn_kind = 'review_set'
          AND item.egcs_cn_parentruntimeitem IS NULL AND item.egcs_cn_publication = NEW.egcs_cn_reviewsetsetup
          AND (runtime.egcs_cn_entitytype, runtime.egcs_cn_entityid) = (NEW.egcs_cn_entitytype, NEW.egcs_cn_entityid)
          AND runtime.egcs_cn_kind IN ('workflow', 'review_set');
      ELSIF TG_TABLE_NAME = 'Common_Review' THEN
        SELECT true INTO valid FROM "Common_Runtime_Item" item
        JOIN "Common_Review_Set" runtime_set ON runtime_set.id = NEW.egcs_cn_reviewset
        JOIN "Common_Runtime_Item" set_item ON set_item.id = runtime_set.egcs_cn_runtimeitem
        WHERE item.id = NEW.egcs_cn_runtimeitem AND item.egcs_cn_kind = 'review'
          AND item.egcs_cn_runtime = set_item.egcs_cn_runtime
          AND item.egcs_cn_parentruntimeitem = set_item.id
          AND item.egcs_cn_publication = NEW.egcs_cn_reviewschema;
      ELSIF TG_TABLE_NAME = 'Common_Recommendation_Set' THEN
        SELECT true INTO valid FROM "Common_Runtime_Item" item JOIN "Common_Runtime" runtime ON runtime.id = item.egcs_cn_runtime
        WHERE item.id = NEW.egcs_cn_runtimeitem AND item.egcs_cn_kind = 'recommendation_set'
          AND item.egcs_cn_parentruntimeitem IS NULL AND item.egcs_cn_publication = NEW.egcs_cn_recommendationsetsetup
          AND (runtime.egcs_cn_entitytype, runtime.egcs_cn_entityid) = (NEW.egcs_cn_entitytype, NEW.egcs_cn_entityid)
          AND runtime.egcs_cn_kind = 'workflow';
      ELSIF TG_TABLE_NAME = 'Common_Recommendation' THEN
        SELECT true INTO valid FROM "Common_Runtime_Item" item
        JOIN "Common_Recommendation_Set" runtime_set ON runtime_set.id = NEW.egcs_cn_recommendationset
        JOIN "Common_Runtime_Item" set_item ON set_item.id = runtime_set.egcs_cn_runtimeitem
        JOIN "Common_Recommendation_Setup" member ON member.id = NEW.egcs_cn_recommendationsetup
        WHERE item.id = NEW.egcs_cn_runtimeitem AND item.egcs_cn_kind = 'recommendation'
          AND item.egcs_cn_runtime = set_item.egcs_cn_runtime
          AND item.egcs_cn_parentruntimeitem = set_item.id
          AND item.egcs_cn_publication = member.egcs_cn_recommendationschema;
      END IF;
      IF valid IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Domain runtime extension does not match its typed runtime item'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_ref_domainruntimeitem';
      END IF;
      RETURN NEW;
    END;
    $function$;

CREATE FUNCTION trg_fn_validate_entity_assignment_type()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM "Common_Entity_Type" entity_type
        WHERE entity_type.egcs_cn_type = NEW.egcs_cn_entitytype
          AND entity_type.egcs_cn_assignmentmode IS NOT NULL
          AND entity_type._deleted = false
      ) THEN
        RAISE EXCEPTION 'Entity type does not support assignments'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_entityassignmenttype';
      END IF;
      RETURN NEW;
    END;
    $function$;

CREATE FUNCTION trg_fn_validate_opportunity_stream_links()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE opportunity_id bigint;
    BEGIN
      IF TG_TABLE_NAME = 'Funding_Opportunity_Profile' THEN
        PERFORM trg_fn_assert_opportunity_streams(NEW.id);
      ELSIF TG_TABLE_NAME = 'Funding_Opportunity_Stream' THEN
        IF TG_OP <> 'INSERT' THEN PERFORM trg_fn_assert_opportunity_streams(OLD.egcs_fo_fundingopportunity); END IF;
        IF TG_OP <> 'DELETE' THEN PERFORM trg_fn_assert_opportunity_streams(NEW.egcs_fo_fundingopportunity); END IF;
      ELSE
        FOR opportunity_id IN
          SELECT DISTINCT link.egcs_fo_fundingopportunity
          FROM "Funding_Opportunity_Stream" link
          WHERE link.egcs_fo_transferpaymentstream = NEW.id AND link._deleted = false
        LOOP
          PERFORM trg_fn_assert_opportunity_streams(opportunity_id);
        END LOOP;
      END IF;
      RETURN NULL;
    END;
  $function$;

CREATE FUNCTION trg_fn_validate_publication_insert()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      IF NEW.egcs_cn_state <> 'draft' OR NEW.egcs_cn_currentversion IS NOT NULL OR NEW._deleted THEN
        RAISE EXCEPTION 'Publications must be created as active drafts without a version'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_publicationinitialstate';
      END IF;
      RETURN NEW;
    END;
    $function$;

CREATE FUNCTION trg_fn_validate_publication_update()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      IF current_setting('app.publication_transition', true) IS DISTINCT FROM 'on'
        AND (NEW.egcs_cn_state, NEW.egcs_cn_currentversion) IS DISTINCT FROM (OLD.egcs_cn_state, OLD.egcs_cn_currentversion) THEN
        RAISE EXCEPTION 'Publication lifecycle changes require a transition'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_publicationtransitionrequired';
      END IF;
      IF OLD.egcs_cn_state = 'retired' AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
        RAISE EXCEPTION 'Retired publications are immutable'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_publicationretiredimmutable';
      END IF;
      IF OLD._deleted = true AND NEW._deleted = false THEN
        RAISE EXCEPTION 'Deleted publications cannot be restored'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_publicationnorestore';
      END IF;
      IF NEW._deleted AND (
        NEW.egcs_cn_state <> 'draft'
        OR EXISTS (SELECT 1 FROM "Common_Publication_Version" version WHERE version.egcs_cn_publication = NEW.id)
        OR EXISTS (SELECT 1 FROM "Common_Runtime" runtime WHERE runtime.egcs_cn_sourcepublication = NEW.id)
        OR EXISTS (SELECT 1 FROM "Common_Runtime_Item" item WHERE item.egcs_cn_publication = NEW.id)
      ) THEN
        RAISE EXCEPTION 'Only unreferenced drafts may be deleted'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_publicationdelete';
      END IF;
      IF NEW.egcs_cn_state = 'draft' AND NEW.egcs_cn_currentversion IS NOT NULL THEN
        RAISE EXCEPTION 'Draft publications cannot have a current version'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_publicationcurrentstate';
      END IF;
      IF NEW.egcs_cn_state IN ('published', 'retired') AND NEW.egcs_cn_currentversion IS NULL THEN
        RAISE EXCEPTION 'Published and retired publications require a current version'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_publicationcurrentstate';
      END IF;
      IF NEW.egcs_cn_state IS DISTINCT FROM OLD.egcs_cn_state OR NEW.egcs_cn_currentversion IS DISTINCT FROM OLD.egcs_cn_currentversion THEN
        IF NOT (
  (OLD.egcs_cn_state = 'draft' AND NEW.egcs_cn_state IN ('published'))
 OR 
  (OLD.egcs_cn_state = 'published' AND NEW.egcs_cn_state IN ('published', 'retired'))
)
          OR (OLD.egcs_cn_state = 'draft' AND NEW.egcs_cn_currentversion IS NULL)
          OR (OLD.egcs_cn_state = 'published' AND NEW.egcs_cn_state = 'published' AND NEW.egcs_cn_currentversion IS NOT DISTINCT FROM OLD.egcs_cn_currentversion)
          OR (NEW.egcs_cn_state = 'retired' AND NEW.egcs_cn_currentversion IS DISTINCT FROM OLD.egcs_cn_currentversion) THEN
          RAISE EXCEPTION 'Invalid publication transition'
            USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_publicationtransitiongraph';
        END IF;
      END IF;
      RETURN NEW;
    END;
    $function$;

CREATE FUNCTION trg_fn_validate_publication_version_insert()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE
      publication_row "Common_Publication"%ROWTYPE;
      expected_version integer;
      previous_hash char(64);
    BEGIN
      SELECT * INTO publication_row FROM "Common_Publication"
      WHERE id = NEW.egcs_cn_publication FOR UPDATE;
      IF NOT FOUND OR publication_row._deleted OR publication_row.egcs_cn_state = 'retired' THEN
        RAISE EXCEPTION 'Publication is unavailable for publication'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_publicationversionavailable';
      END IF;
      IF NEW.egcs_cn_kind IS DISTINCT FROM publication_row.egcs_cn_kind THEN
        RAISE EXCEPTION 'Publication version kind does not match its publication'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_ref_publicationversionpublicationkind';
      END IF;
      SELECT COALESCE(max(egcs_cn_version), 0) + 1, (array_agg(egcs_cn_hash ORDER BY egcs_cn_version DESC))[1]
      INTO expected_version, previous_hash
      FROM "Common_Publication_Version" WHERE egcs_cn_publication = NEW.egcs_cn_publication;
      IF NEW.egcs_cn_version <> expected_version THEN
        RAISE EXCEPTION 'Publication versions must be contiguous'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_publicationversionsequence';
      END IF;
      IF previous_hash IS NOT NULL AND previous_hash = NEW.egcs_cn_hash THEN
        RAISE EXCEPTION 'Publication definition has not changed'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_publicationversionchanged';
      END IF;
      RETURN NEW;
    END;
    $function$;

CREATE FUNCTION trg_fn_validate_publication_version_reference()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE parent_kind varchar(64);
    BEGIN
      SELECT egcs_cn_kind INTO parent_kind FROM "Common_Publication_Version"
      WHERE id = NEW.egcs_cn_parentversion;
      IF NEW.egcs_cn_parentversion = NEW.egcs_cn_publicationversion OR NOT (
        (parent_kind = 'review_set_setup' AND NEW.egcs_cn_kind IN ('review_schema', 'approval_template'))
        OR (parent_kind = 'recommendation_set_setup' AND NEW.egcs_cn_kind IN ('recommendation_schema', 'approval_template'))
        OR (parent_kind = 'workflow_setup' AND NEW.egcs_cn_kind IN ('review_set_setup', 'recommendation_set_setup', 'approval_template'))
      ) THEN
        RAISE EXCEPTION 'Publication version reference kind graph is invalid'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_publicationversionreferencekind';
      END IF;
      RETURN NEW;
    END;
    $function$;

CREATE FUNCTION trg_fn_validate_recommendation_runtime_member()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM "Common_Recommendation_Set" runtime_set
        JOIN "Common_Recommendation_Setup" member
          ON member.id = NEW.egcs_cn_recommendationsetup
        WHERE runtime_set.id = NEW.egcs_cn_recommendationset
          AND member.egcs_cn_recommendationset = runtime_set.egcs_cn_recommendationsetsetup
      ) THEN
        RAISE EXCEPTION 'Recommendation runtime member does not belong to its recommendation set setup';
      END IF;
      RETURN NEW;
    END;
    $function$;

CREATE FUNCTION trg_fn_validate_routing_slip_runtime()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE
      item_row "Common_Runtime_Item"%ROWTYPE;
      runtime_row "Common_Runtime"%ROWTYPE;
    BEGIN
      SELECT * INTO item_row FROM "Common_Runtime_Item" WHERE id = NEW.egcs_cn_runtimeitem FOR UPDATE;
      IF NOT FOUND
        OR item_row._deleted
        OR item_row.egcs_cn_kind <> 'routing_slip'
        OR item_row.egcs_cn_publicationkind <> 'approval_template'
        OR item_row.egcs_cn_publication <> NEW.egcs_cn_approvaltemplate THEN
        RAISE EXCEPTION 'Routing slip runtime item does not match its pinned approval template'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_ref_routingslipruntimeitem';
      END IF;
      SELECT * INTO runtime_row FROM "Common_Runtime" WHERE id = item_row.egcs_cn_runtime FOR UPDATE;
      IF NOT FOUND OR runtime_row._deleted THEN
        RAISE EXCEPTION 'Routing slip runtime is unavailable'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_ref_routingslipruntimeitem';
      END IF;
      IF EXISTS (
        SELECT 1
        FROM "Common_Routing_Slip" slip
        JOIN "Common_Runtime_Item" existing_item ON existing_item.id = slip.egcs_cn_runtimeitem
        WHERE slip.egcs_cn_entitytype = NEW.egcs_cn_entitytype
          AND slip.egcs_cn_entityid = NEW.egcs_cn_entityid
          AND slip.id <> NEW.id
          AND slip._deleted = false
          AND existing_item._deleted = false
          AND existing_item.egcs_cn_state NOT IN ('succeeded', 'approved', 'unsuccessful', 'denied', 'cancelled', 'failed')
      ) THEN
        RAISE EXCEPTION 'An active approval routing slip already exists for this entity'
          USING ERRCODE = '23505', CONSTRAINT = 'cn_ref_routingslipactiveruntime';
      END IF;
      RETURN NEW;
    END;
    $function$;

CREATE FUNCTION trg_fn_validate_runtime_insert()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE
      source_state varchar(32);
      previous_row "Common_Runtime"%ROWTYPE;
    BEGIN
      IF NEW.egcs_cn_state <> 'pending' OR NEW.egcs_cn_startedat IS NOT NULL OR NEW.egcs_cn_completedat IS NOT NULL THEN
        RAISE EXCEPTION 'Runtimes must be created pending'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_runtimeinitialstate';
      END IF;
      IF NOT (
        (NEW.egcs_cn_kind = 'workflow' AND NEW.egcs_cn_sourcepublicationkind = 'workflow_setup')
        OR (NEW.egcs_cn_kind = 'review_set' AND NEW.egcs_cn_sourcepublicationkind = 'review_set_setup')
      ) THEN
        RAISE EXCEPTION 'Runtime kind is incompatible with its source publication kind'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_runtimesourcekind';
      END IF;
      SELECT egcs_cn_state INTO source_state FROM "Common_Publication"
      WHERE id = NEW.egcs_cn_sourcepublication AND _deleted = false;
      IF NEW.egcs_cn_previousruntime IS NULL THEN
        IF NEW.egcs_cn_attempt <> 1 OR source_state <> 'published' THEN
          RAISE EXCEPTION 'New runtimes require attempt one and a published source'
            USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_runtimenewattempt';
        END IF;
      ELSE
        SELECT * INTO previous_row FROM "Common_Runtime"
        WHERE id = NEW.egcs_cn_previousruntime FOR UPDATE;
        IF NOT FOUND
          OR previous_row.egcs_cn_state NOT IN ('succeeded', 'approved', 'unsuccessful', 'denied', 'cancelled', 'failed')
          OR NEW.egcs_cn_attempt <> previous_row.egcs_cn_attempt + 1
          OR (NEW.egcs_cn_kind, NEW.egcs_cn_entitytype, NEW.egcs_cn_entityid, NEW.egcs_cn_purpose) IS DISTINCT FROM
             (previous_row.egcs_cn_kind, previous_row.egcs_cn_entitytype, previous_row.egcs_cn_entityid, previous_row.egcs_cn_purpose)
          OR (NEW.egcs_cn_sourcepublication, NEW.egcs_cn_sourcepublicationversion, NEW.egcs_cn_sourceversion) IS DISTINCT FROM
             (previous_row.egcs_cn_sourcepublication, previous_row.egcs_cn_sourcepublicationversion, previous_row.egcs_cn_sourceversion)
        THEN
          RAISE EXCEPTION 'Retry must follow a terminal attempt and retain its exact source version'
            USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_runtimeretry';
        END IF;
      END IF;
      RETURN NEW;
    END;
    $function$;

CREATE FUNCTION trg_fn_validate_runtime_item_hierarchy()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE
      runtime_row "Common_Runtime"%ROWTYPE;
      parent_row "Common_Runtime_Item"%ROWTYPE;
      grandparent_row "Common_Runtime_Item"%ROWTYPE;
      publication_state varchar(32);
      retired_at timestamptz;
      hierarchy_valid boolean := false;
      reference_valid boolean := false;
    BEGIN
      SELECT * INTO runtime_row FROM "Common_Runtime" WHERE id = NEW.egcs_cn_runtime FOR UPDATE;
      IF NOT FOUND THEN RETURN NEW; END IF;
      IF runtime_row.egcs_cn_previousruntime IS NULL THEN
        SELECT egcs_cn_state INTO publication_state FROM "Common_Publication"
        WHERE id = NEW.egcs_cn_publication AND _deleted = false;
        IF publication_state = 'retired' THEN
          SELECT transition.egcs_cn_createdat INTO retired_at
          FROM "Common_Publication_Transition" transition
          WHERE transition.egcs_cn_publication = NEW.egcs_cn_publication
            AND transition.egcs_cn_tostate = 'retired'
          ORDER BY transition.id DESC LIMIT 1;
        END IF;
        IF publication_state NOT IN ('published', 'retired')
          OR (publication_state = 'retired' AND (retired_at IS NULL OR retired_at <= runtime_row.egcs_cn_createdat)) THEN
          RAISE EXCEPTION 'New runtimes may only select published item versions'
            USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_runtimeitempublished';
        END IF;
      END IF;
      IF NEW.egcs_cn_parentruntimeitem IS NULL THEN
        hierarchy_valid :=
          (runtime_row.egcs_cn_kind = 'workflow' AND NEW.egcs_cn_kind IN ('review_set', 'recommendation_set', 'routing_slip'))
          OR (runtime_row.egcs_cn_kind = 'review_set' AND NEW.egcs_cn_kind = 'review_set');
        reference_valid := NEW.egcs_cn_publicationversion = runtime_row.egcs_cn_sourcepublicationversion
          OR EXISTS (
            SELECT 1 FROM "Common_Publication_Version_Reference" reference
            WHERE reference.egcs_cn_parentversion = runtime_row.egcs_cn_sourcepublicationversion
              AND reference.egcs_cn_publicationversion = NEW.egcs_cn_publicationversion
              AND runtime_row.egcs_cn_kind = 'workflow'
              AND reference.egcs_cn_path = CASE NEW.egcs_cn_kind
                WHEN 'review_set' THEN 'members.review_set'
                WHEN 'recommendation_set' THEN 'members.recommendation_set'
                WHEN 'routing_slip' THEN 'members.approval_template'
              END
              AND reference.egcs_cn_order = NEW.egcs_cn_order
          );
      ELSE
        SELECT * INTO parent_row FROM "Common_Runtime_Item"
        WHERE id = NEW.egcs_cn_parentruntimeitem AND egcs_cn_runtime = NEW.egcs_cn_runtime;
        IF parent_row.egcs_cn_parentruntimeitem IS NOT NULL THEN
          SELECT * INTO grandparent_row FROM "Common_Runtime_Item"
          WHERE id = parent_row.egcs_cn_parentruntimeitem
            AND egcs_cn_runtime = NEW.egcs_cn_runtime;
        END IF;
        hierarchy_valid :=
          (parent_row.egcs_cn_kind = 'review_set' AND NEW.egcs_cn_kind IN ('review', 'routing_slip'))
          OR (parent_row.egcs_cn_kind = 'review' AND NEW.egcs_cn_kind = 'routing_slip')
          OR (parent_row.egcs_cn_kind = 'recommendation_set' AND NEW.egcs_cn_kind IN ('recommendation', 'routing_slip'))
          OR (parent_row.egcs_cn_kind = 'recommendation' AND NEW.egcs_cn_kind = 'routing_slip')
          OR (parent_row.egcs_cn_kind = 'routing_slip' AND NEW.egcs_cn_kind = 'approval_step');
        reference_valid := (
          parent_row.egcs_cn_kind = 'routing_slip'
          AND NEW.egcs_cn_kind = 'approval_step'
          AND NEW.egcs_cn_publicationversion = parent_row.egcs_cn_publicationversion
        ) OR EXISTS (
          SELECT 1 FROM "Common_Publication_Version_Reference" reference
          WHERE reference.egcs_cn_parentversion = parent_row.egcs_cn_publicationversion
            AND reference.egcs_cn_publicationversion = NEW.egcs_cn_publicationversion
            AND (
              (parent_row.egcs_cn_kind = 'review_set' AND NEW.egcs_cn_kind = 'review'
                AND reference.egcs_cn_path = 'members.schema' AND reference.egcs_cn_order = NEW.egcs_cn_order)
              OR (parent_row.egcs_cn_kind = 'recommendation_set' AND NEW.egcs_cn_kind = 'recommendation'
                AND reference.egcs_cn_path = 'members.schema' AND reference.egcs_cn_order = NEW.egcs_cn_order)
              OR (parent_row.egcs_cn_kind IN ('review_set', 'recommendation_set') AND NEW.egcs_cn_kind = 'routing_slip'
                AND reference.egcs_cn_path = 'finalApproval' AND reference.egcs_cn_order IS NULL)
            )
        ) OR (
          NEW.egcs_cn_kind = 'routing_slip'
          AND parent_row.egcs_cn_kind IN ('review', 'recommendation')
          AND grandparent_row.egcs_cn_kind IN ('review_set', 'recommendation_set')
          AND EXISTS (
            SELECT 1 FROM "Common_Publication_Version_Reference" reference
            WHERE reference.egcs_cn_parentversion = grandparent_row.egcs_cn_publicationversion
              AND reference.egcs_cn_path = 'members.approval'
              AND reference.egcs_cn_order = parent_row.egcs_cn_order
              AND reference.egcs_cn_publicationversion = NEW.egcs_cn_publicationversion
          )
        );
      END IF;
      IF NOT hierarchy_valid THEN
        RAISE EXCEPTION 'Runtime item hierarchy is invalid'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_runtimeitemhierarchy';
      END IF;
      IF NOT reference_valid THEN
        RAISE EXCEPTION 'Runtime item version is not pinned by its parent publication version'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_ref_runtimeitempublicationgraph';
      END IF;
      RETURN NEW;
    END;
    $function$;

CREATE FUNCTION trg_fn_validate_runtime_item_insert()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      IF TG_OP = 'INSERT' AND (NEW.egcs_cn_state <> 'pending' OR NEW.egcs_cn_startedat IS NOT NULL OR NEW.egcs_cn_completedat IS NOT NULL) THEN
        RAISE EXCEPTION 'Runtime items must be created pending'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_runtimeiteminitialstate';
      END IF;
      IF NOT (
        (NEW.egcs_cn_kind = 'review_set' AND NEW.egcs_cn_publicationkind = 'review_set_setup')
        OR (NEW.egcs_cn_kind = 'review' AND NEW.egcs_cn_publicationkind = 'review_schema')
        OR (NEW.egcs_cn_kind = 'recommendation_set' AND NEW.egcs_cn_publicationkind = 'recommendation_set_setup')
        OR (NEW.egcs_cn_kind = 'recommendation' AND NEW.egcs_cn_publicationkind = 'recommendation_schema')
        OR (NEW.egcs_cn_kind IN ('routing_slip', 'approval_step') AND NEW.egcs_cn_publicationkind = 'approval_template')
      ) THEN
        RAISE EXCEPTION 'Runtime item kind is incompatible with its publication kind'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_runtimeitempublicationkind';
      END IF;
      RETURN NEW;
    END;
    $function$;

CREATE FUNCTION trg_fn_validate_runtime_state_update()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      IF current_setting('app.runtime_transition', true) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'Runtime lifecycle changes require a transition'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_runtimetransitionrequired';
      END IF;
      IF (to_jsonb(NEW) - ARRAY['egcs_cn_state', 'egcs_cn_startedat', 'egcs_cn_updatedat', 'egcs_cn_completedat'])
        IS DISTINCT FROM
        (to_jsonb(OLD) - ARRAY['egcs_cn_state', 'egcs_cn_startedat', 'egcs_cn_updatedat', 'egcs_cn_completedat']) THEN
        RAISE EXCEPTION 'Runtime identity, hierarchy, and publication pins are immutable'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_runtimeidentityimmutable';
      END IF;
      IF OLD.egcs_cn_state IN ('succeeded', 'approved', 'unsuccessful', 'denied', 'cancelled', 'failed')
        AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
        RAISE EXCEPTION 'Terminal runtime state is immutable'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_runtimeterminalimmutable';
      END IF;
      IF NEW.egcs_cn_state IS DISTINCT FROM OLD.egcs_cn_state AND NOT (
        
  (OLD.egcs_cn_state = 'pending' AND NEW.egcs_cn_state IN ('active', 'awaiting_action', 'cancelled', 'failed'))
 OR 
  (OLD.egcs_cn_state = 'active' AND NEW.egcs_cn_state IN ('awaiting_action', 'paused', 'succeeded', 'approved', 'unsuccessful', 'denied', 'cancelled', 'failed'))
 OR 
  (OLD.egcs_cn_state = 'awaiting_action' AND NEW.egcs_cn_state IN ('active', 'paused', 'succeeded', 'approved', 'unsuccessful', 'denied', 'cancelled', 'failed'))
 OR 
  (OLD.egcs_cn_state = 'paused' AND NEW.egcs_cn_state IN ('active', 'awaiting_action', 'cancelled', 'failed'))

      ) THEN
        RAISE EXCEPTION 'Invalid runtime transition'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_runtimetransitiongraph';
      END IF;
      RETURN NEW;
    END;
    $function$;

CREATE FUNCTION trg_fn_validate_workflow_completion_target()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE previous_completion bigint;
    BEGIN
      IF NEW.egcs_cn_completion IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM "Common_Runtime" runtime
        JOIN "Common_Completion" completion ON completion.id = NEW.egcs_cn_completion
        WHERE runtime.id = NEW.id
          AND (runtime.egcs_cn_entitytype, runtime.egcs_cn_entityid) =
              (completion.egcs_cn_entitytype, completion.egcs_cn_entityid)
      ) THEN
        RAISE EXCEPTION 'Workflow completion does not belong to its runtime target'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_ref_workflowruncompletiontarget';
      END IF;
      IF NEW.egcs_cn_completion IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM "Common_Completion" completion
        WHERE completion.id = NEW.egcs_cn_completion
          AND completion.egcs_cn_disposition = 'workflow_started'
      ) THEN
        RAISE EXCEPTION 'Workflow completion link requires workflow_started disposition'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_workflowcompletiondisposition';
      END IF;
      SELECT previous_run.egcs_cn_completion INTO previous_completion
      FROM "Common_Runtime" runtime
      JOIN "Common_Workflow_Run" previous_run ON previous_run.id = runtime.egcs_cn_previousruntime
      WHERE runtime.id = NEW.id;
      IF FOUND AND NEW.egcs_cn_completion IS DISTINCT FROM previous_completion THEN
        RAISE EXCEPTION 'Workflow retry must retain its completion evidence link'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_workflowretrycompletion';
      END IF;
      RETURN NEW;
    END;
    $function$;

CREATE FUNCTION trg_fn_validate_workflow_member_owner()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE workflow_member "Common_Workflow_Setup_Member"%ROWTYPE;
    BEGIN
      SELECT * INTO workflow_member FROM "Common_Workflow_Setup_Member"
      WHERE id = NEW.egcs_cn_workflowsetupmember AND _deleted = false;
      IF NOT FOUND THEN RAISE EXCEPTION 'Workflow member is unavailable'; END IF;
      IF NEW.egcs_cn_reviewsetup IS NOT NULL AND (
        workflow_member.egcs_cn_kind <> 'review_set' OR NOT EXISTS (
          SELECT 1 FROM "Common_Review_Setup" nested
          WHERE nested.id = NEW.egcs_cn_reviewsetup AND nested.egcs_cn_reviewset = workflow_member.egcs_cn_reviewset AND nested._deleted = false
        )
      ) THEN RAISE EXCEPTION 'Workflow review owner mapping does not belong to the configured set'; END IF;
      IF NEW.egcs_cn_recommendationsetup IS NOT NULL AND (
        workflow_member.egcs_cn_kind <> 'recommendation_set' OR NOT EXISTS (
          SELECT 1 FROM "Common_Recommendation_Setup" nested
          WHERE nested.id = NEW.egcs_cn_recommendationsetup AND nested.egcs_cn_recommendationset = workflow_member.egcs_cn_recommendationset AND nested._deleted = false
        )
      ) THEN RAISE EXCEPTION 'Workflow recommendation owner mapping does not belong to the configured set'; END IF;
      RETURN NEW;
    END;
    $function$;

CREATE FUNCTION trg_fn_validate_workflow_runtime_definition()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE
      runtime_id bigint;
      workflow_setup_id bigint;
    BEGIN
      IF TG_TABLE_NAME = 'Common_Runtime' THEN
        IF NEW.egcs_cn_kind <> 'workflow' THEN RETURN NULL; END IF;
        runtime_id := NEW.id;
      ELSE
        workflow_setup_id := OLD.id;
      END IF;

      IF EXISTS (
        SELECT 1
        FROM "Common_Runtime" runtime
        WHERE runtime.egcs_cn_kind = 'workflow'
          AND (runtime_id IS NULL OR runtime.id = runtime_id)
          AND (workflow_setup_id IS NULL OR runtime.egcs_cn_sourcepublication = workflow_setup_id)
          AND NOT EXISTS (
            SELECT 1
            FROM "Common_Workflow_Setup" workflow
            JOIN "Common_Publication_Version" version
              ON version.id = runtime.egcs_cn_sourcepublicationversion
             AND version.egcs_cn_publication = workflow.id
             AND version.egcs_cn_kind = workflow.egcs_cn_publicationkind
             AND version.egcs_cn_version = runtime.egcs_cn_sourceversion
            WHERE workflow.id = runtime.egcs_cn_sourcepublication
              AND workflow.egcs_cn_publicationkind = runtime.egcs_cn_sourcepublicationkind
              AND workflow.egcs_cn_entitytype = runtime.egcs_cn_entitytype
              AND workflow.egcs_cn_purpose = runtime.egcs_cn_purpose
          )
      ) THEN
        RAISE EXCEPTION 'Workflow runtime source definition does not match its target type and purpose'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_ref_workflowruntimedefinition';
      END IF;
      RETURN NULL;
    END;
    $function$;

CREATE FUNCTION trg_fn_validate_workflow_runtime_extension()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM "Common_Runtime" runtime WHERE runtime.id = NEW.id AND runtime.egcs_cn_kind = 'workflow') THEN
        RAISE EXCEPTION 'Workflow extension requires a workflow runtime'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_ref_workflowruntimekind';
      END IF;
      RETURN NEW;
    END;
    $function$;

CREATE FUNCTION trg_fn_validate_workflow_setup_entity_type()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM "Common_Entity_Type" entity_type
        WHERE entity_type.egcs_cn_type = NEW.egcs_cn_entitytype
          AND entity_type._deleted = false
          AND (
            (NEW.egcs_cn_purpose = 'standard' AND entity_type.egcs_cn_standardworkflow = 'explicit')
            OR (NEW.egcs_cn_purpose = 'approval_submission' AND entity_type.egcs_cn_approvalsubmission <> 'none')
            OR (NEW.egcs_cn_purpose = 'risk_rating' AND entity_type.egcs_cn_riskrating = 'explicit')
          )
      ) THEN
        RAISE EXCEPTION 'Workflow target type is unavailable or incompatible with its declared purpose'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_workflowsetupentitytype';
      END IF;
      RETURN NEW;
    END;
    $function$;

CREATE FUNCTION trg_fn_validate_workflow_setup_member()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE workflow "Common_Workflow_Setup"%ROWTYPE;
    BEGIN
      SELECT * INTO workflow FROM "Common_Workflow_Setup" WHERE id = NEW.egcs_cn_workflowsetup AND _deleted = false;
      IF NOT FOUND THEN RAISE EXCEPTION 'Workflow setup is unavailable'; END IF;
      IF NEW.egcs_cn_reviewset IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM "Common_Review_Set_Setup" candidate
        WHERE candidate.id = NEW.egcs_cn_reviewset AND candidate.egcs_cn_agency = workflow.egcs_cn_agency
          AND candidate.egcs_cn_entitytype = workflow.egcs_cn_entitytype
          AND candidate._deleted = false
          AND EXISTS (SELECT 1 FROM "Common_Publication" publication
            WHERE publication.id = candidate.id AND publication.egcs_cn_state = 'published' AND publication._deleted = false)
      ) THEN RAISE EXCEPTION 'Workflow review set scope or entity type mismatch'; END IF;
      IF NEW.egcs_cn_recommendationset IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM "Common_Recommendation_Set_Setup" candidate
        WHERE candidate.id = NEW.egcs_cn_recommendationset AND candidate.egcs_cn_agency = workflow.egcs_cn_agency
          AND candidate._deleted = false
          AND EXISTS (SELECT 1 FROM "Common_Publication" publication
            WHERE publication.id = candidate.id AND publication.egcs_cn_state = 'published' AND publication._deleted = false)
      ) THEN RAISE EXCEPTION 'Workflow recommendation set scope mismatch'; END IF;
      IF NEW.egcs_cn_approvaltemplate IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM "Common_Approval_Template" candidate
        WHERE candidate.id = NEW.egcs_cn_approvaltemplate AND candidate.egcs_cn_agency = workflow.egcs_cn_agency
          AND candidate._deleted = false
          AND EXISTS (SELECT 1 FROM "Common_Publication" publication
            WHERE publication.id = candidate.id AND publication.egcs_cn_state = 'published' AND publication._deleted = false)
      ) THEN RAISE EXCEPTION 'Workflow approval template scope mismatch'; END IF;
      RETURN NEW;
    END;
    $function$;

CREATE FUNCTION trg_fn_validate_workflow_status_agency()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE
      workflow "Common_Workflow_Setup"%ROWTYPE;
      resolved_agency bigint;
      configured_status bigint;
      configured_statuses bigint[];
    BEGIN
      IF TG_TABLE_NAME = 'Common_Workflow_Setup' THEN
        workflow := NEW;
        configured_statuses := ARRAY[NEW.egcs_cn_cancellationstatus, NEW.egcs_cn_executionfailurestatus];
      ELSIF TG_TABLE_NAME = 'Common_Workflow_Setup_Allowed_Start_Status' THEN
        SELECT * INTO workflow FROM "Common_Workflow_Setup" WHERE id = NEW.egcs_cn_workflowsetup;
        configured_statuses := ARRAY[NEW.egcs_cn_status];
      ELSE
        SELECT * INTO workflow FROM "Common_Workflow_Setup" WHERE id = NEW.egcs_cn_workflowsetup;
        configured_statuses := ARRAY[
          NEW.egcs_cn_materializationstatus,
          NEW.egcs_cn_successstatus,
          NEW.egcs_cn_failurestatus
        ];
      END IF;

      IF NOT FOUND AND TG_TABLE_NAME <> 'Common_Workflow_Setup' THEN
        RAISE EXCEPTION 'Workflow setup is unavailable'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_ref_workflowstatusagency';
      END IF;

      SELECT agency.id INTO resolved_agency
      FROM "Agency_Profile" agency
      WHERE agency.id = workflow.egcs_cn_agency
        AND agency._deleted = false;

      IF resolved_agency IS NULL THEN
        RAISE EXCEPTION 'Workflow Agency could not be resolved'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_ref_workflowstatusagency';
      END IF;

      FOREACH configured_status IN ARRAY configured_statuses LOOP
        IF configured_status IS NOT NULL THEN
          PERFORM 1
          FROM "Common_Status"
          WHERE id = configured_status
            AND egcs_cn_agency = resolved_agency
            AND _deleted = false
          FOR UPDATE;
          IF NOT FOUND THEN
            RAISE EXCEPTION 'Workflow status does not belong to the resolved Agency'
              USING ERRCODE = '23514', CONSTRAINT = 'cn_ref_workflowstatusagency';
          END IF;
        END IF;
      END LOOP;

      RETURN NULL;
    END;
    $function$;

CREATE FUNCTION trg_fn_validate_workflow_transition_status_agency()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE
      resolved_agency bigint;
      previous_status_agency bigint;
      next_status_agency bigint;
    BEGIN
      SELECT workflow.egcs_cn_agency INTO resolved_agency
      FROM "Common_Workflow_Run" run
      JOIN "Common_Runtime" runtime ON runtime.id = run.id
      JOIN "Common_Workflow_Setup" workflow ON workflow.id = runtime.egcs_cn_sourcepublication
      WHERE run.id = NEW.egcs_cn_workflowrun;

      IF resolved_agency IS NULL THEN
        RAISE EXCEPTION 'Workflow transition Agency could not be resolved'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_ref_workflowtransitionstatusagency';
      END IF;

      PERFORM 1
      FROM "Common_Status"
      WHERE id IN (NEW.egcs_cn_previousstatus, NEW.egcs_cn_newstatus)
        AND _deleted = false
      ORDER BY id
      FOR UPDATE;

      SELECT egcs_cn_agency INTO previous_status_agency
      FROM "Common_Status"
      WHERE id = NEW.egcs_cn_previousstatus
        AND _deleted = false;
      SELECT egcs_cn_agency INTO next_status_agency
      FROM "Common_Status"
      WHERE id = NEW.egcs_cn_newstatus
        AND _deleted = false;

      IF previous_status_agency IS DISTINCT FROM resolved_agency
        OR next_status_agency IS DISTINCT FROM resolved_agency THEN
        RAISE EXCEPTION 'Workflow transition status does not belong to the resolved Agency'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_ref_workflowtransitionstatusagency';
      END IF;

      RETURN NULL;
    END;
    $function$;

CREATE FUNCTION validate_catalog_nested_agency()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE owner_agency bigint;
    BEGIN
      IF TG_TABLE_NAME = 'Common_Review_Set_Setup' THEN
        owner_agency := NEW.egcs_cn_agency;
      ELSIF TG_TABLE_NAME = 'Common_Review_Setup' THEN
        SELECT egcs_cn_agency INTO owner_agency
        FROM "Common_Review_Set_Setup" WHERE id = NEW.egcs_cn_reviewset;
        IF NOT EXISTS (
          SELECT 1 FROM "Common_Review_Schema"
          WHERE id = NEW.egcs_cn_reviewschema AND egcs_cn_agency = owner_agency
        ) THEN
          RAISE EXCEPTION 'Review Schema must belong to the Review Set Agency'
            USING ERRCODE = '23514', CONSTRAINT = 'cn_ref_reviewsetupagency';
        END IF;
      ELSIF TG_TABLE_NAME = 'Common_Recommendation_Set_Setup' THEN
        owner_agency := NEW.egcs_cn_agency;
      ELSIF TG_TABLE_NAME = 'Common_Recommendation_Setup' THEN
        SELECT egcs_cn_agency INTO owner_agency
        FROM "Common_Recommendation_Set_Setup" WHERE id = NEW.egcs_cn_recommendationset;
        IF NOT EXISTS (
          SELECT 1 FROM "Common_Recommendation_Schema"
          WHERE id = NEW.egcs_cn_recommendationschema AND egcs_cn_agency = owner_agency
        ) THEN
          RAISE EXCEPTION 'Recommendation Schema must belong to the Recommendation Set Agency'
            USING ERRCODE = '23514', CONSTRAINT = 'cn_ref_recommendationsetupagency';
        END IF;
      END IF;

      IF NEW.egcs_cn_approvaltemplate IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM "Common_Approval_Template"
        WHERE id = NEW.egcs_cn_approvaltemplate AND egcs_cn_agency = owner_agency
      ) THEN
        RAISE EXCEPTION 'Approval Template must belong to the catalog Agency'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_ref_catalogapprovaltemplateagency';
      END IF;
      RETURN NEW;
    END $function$;

CREATE FUNCTION validate_proponent_type_choice(stream_id bigint, proponent_id bigint, subtype_id bigint)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
    DECLARE previous_type bigint;
    BEGIN
      PERFORM id FROM "Transfer_Payment_Stream" WHERE id = stream_id FOR UPDATE;
      IF subtype_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM "Transfer_Payment_Stream" WHERE id = stream_id AND egcs_tp_requireconsistentproponenttype
      ) THEN RETURN; END IF;
      SELECT r.egcs_fc_applicantrecipientsubtype INTO previous_type
        FROM "Funding_Case_Agreement_Applicant_Recipient" r
        JOIN "Funding_Case_Agreement_Profile" a ON a.id = r.egcs_fc_fundingagreement
        JOIN "Transfer_Payment_Stream" s ON s.id = a.egcs_fc_transferpaymentstream
        JOIN "Transfer_Payment_Profile" p ON p.id = s.egcs_tp_transferpaymentprofile
        JOIN "Agency_Applicant_Recipient_Subtype" t ON t.id = r.egcs_fc_applicantrecipientsubtype
        WHERE a.egcs_fc_transferpaymentstream = stream_id AND r.egcs_fc_applicantrecipient = proponent_id
          AND NOT a._deleted AND NOT r._deleted AND NOT t._deleted
          AND t.egcs_ay_organizationagency = p.egcs_tp_agency
          AND EXISTS (SELECT 1 FROM "Transfer_Payment_Stream_Eligible_Recipient" e
            WHERE e.egcs_tp_transferpaymentstream = stream_id AND e.egcs_tp_applicantrecipientsubtype = t.id AND NOT e._deleted)
        ORDER BY a.id DESC, r.id DESC LIMIT 1;
      IF previous_type IS NOT NULL AND previous_type <> subtype_id THEN
        RAISE EXCEPTION 'Conflicting agreement proponent type' USING ERRCODE = '23514', CONSTRAINT = 'agreement_proponent_type_consistent';
      END IF;
    END $function$;

CREATE FUNCTION validate_stream_proponent_types(stream_id bigint)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
    BEGIN
      PERFORM id FROM "Transfer_Payment_Stream" WHERE id = stream_id FOR UPDATE;
      IF EXISTS (
        SELECT 1 FROM "Funding_Case_Agreement_Applicant_Recipient" r
        JOIN "Funding_Case_Agreement_Profile" a ON a.id = r.egcs_fc_fundingagreement
        JOIN "Transfer_Payment_Stream" s ON s.id = a.egcs_fc_transferpaymentstream
        JOIN "Transfer_Payment_Profile" p ON p.id = s.egcs_tp_transferpaymentprofile
        WHERE s.id = stream_id AND NOT r._deleted AND NOT a._deleted
          AND r.egcs_fc_applicantrecipientsubtype IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM "Transfer_Payment_Stream_Eligible_Recipient" e
            JOIN "Agency_Applicant_Recipient_Subtype" t ON t.id = e.egcs_tp_applicantrecipientsubtype
            WHERE e.egcs_tp_transferpaymentstream = s.id
              AND t.id = r.egcs_fc_applicantrecipientsubtype
              AND t.egcs_ay_organizationagency = p.egcs_tp_agency AND NOT e._deleted AND NOT t._deleted
          )
      ) THEN
        RAISE EXCEPTION 'Ineligible agreement proponent type' USING ERRCODE = '23514', CONSTRAINT = 'agreement_proponent_type_eligible';
      END IF;
    END $function$;

CREATE FUNCTION validate_workflow_condition_scope()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      IF NEW._deleted THEN RETURN NEW; END IF;
      IF NOT EXISTS (
        SELECT 1 FROM "Common_Workflow_Setup_Member" member
        JOIN "Common_Workflow_Setup" setup ON setup.id = member.egcs_cn_workflowsetup
        JOIN "Agency_Custom_Field" field ON field.id = NEW.egcs_cn_field
        JOIN "Agency_Custom_Field_Option" option
          ON option.id = NEW.egcs_cn_option AND option.egcs_ay_field = field.id
        WHERE member.id = NEW.egcs_cn_workflowsetupmember
          AND member._deleted = false
          AND setup._deleted = false
          AND setup.egcs_cn_agency = field.egcs_ay_agency
          AND field.egcs_ay_kind = 'relational'
          AND field._deleted = false
          AND option.egcs_ay_active = true
          AND option._deleted = false
      ) THEN
        RAISE EXCEPTION 'Workflow condition must reference an active relational field and option in its Agency'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_ref_workflowconditionagency';
      END IF;
      RETURN NEW;
    END $function$;

CREATE FUNCTION validate_workflow_profile_references()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE condition_source text;
    BEGIN
      IF TG_OP = 'UPDATE' THEN
        IF NOT (
          (NOT OLD._deleted AND NEW._deleted)
          OR NEW.egcs_ay_organizationagency IS DISTINCT FROM OLD.egcs_ay_organizationagency
        ) THEN RETURN NULL; END IF;
      END IF;

      IF TG_TABLE_NAME = 'Agency_Agreement_Type' THEN
        condition_source := 'agreement_subtype';
      ELSE
        condition_source := 'recipient_subtype';
      END IF;

      IF EXISTS (
        SELECT 1
        FROM "Common_Workflow_Setup_Member" member
        JOIN "Common_Workflow_Setup" setup ON setup.id = member.egcs_cn_workflowsetup
        CROSS JOIN LATERAL jsonb_array_elements(member.egcs_cn_profileconditions) AS condition(value)
        CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(condition.value->'optionIds', '[]'::jsonb)) AS option_id(value)
        WHERE member._deleted = false AND setup._deleted = false
          AND condition.value->>'source' = condition_source
          AND option_id.value = OLD.id::text
      ) OR EXISTS (
        SELECT 1
        FROM "Common_Publication_Version" version
        JOIN "Common_Workflow_Setup" setup ON setup.id = version.egcs_cn_publication
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(version.egcs_cn_definition->'members', '[]'::jsonb)) AS member(value)
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(member.value->'conditions', '[]'::jsonb)) AS condition(value)
        CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(condition.value->'optionIds', '[]'::jsonb)) AS option_id(value)
        WHERE version.egcs_cn_kind = 'workflow_setup'
          AND condition.value->>'source' = condition_source
          AND option_id.value = OLD.id::text
      ) THEN
        RAISE EXCEPTION 'Workflow condition reference is in use'
          USING ERRCODE = '23514', CONSTRAINT = 'workflow_profile_condition_reference';
      END IF;
      RETURN NULL;
    END $function$;

CREATE FUNCTION workflow_amendment_subtype_in_use(subtype_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
      SELECT EXISTS (
        SELECT 1 FROM "Common_Workflow_Setup_Member" member
        JOIN "Common_Workflow_Setup" setup ON setup.id = member.egcs_cn_workflowsetup
        CROSS JOIN LATERAL jsonb_array_elements(member.egcs_cn_profileconditions) condition(value)
        WHERE member._deleted = false AND setup._deleted = false
          AND condition.value->>'source' = 'amendment_subtype'
          AND COALESCE(condition.value->'optionIds', '[]'::jsonb) ? subtype_id::text
      ) OR EXISTS (
        SELECT 1 FROM "Common_Publication_Version" version
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(version.egcs_cn_definition->'members', '[]'::jsonb)) member(value)
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(member.value->'conditions', '[]'::jsonb)) condition(value)
        WHERE version.egcs_cn_kind = 'workflow_setup'
          AND condition.value->>'source' = 'amendment_subtype'
          AND COALESCE(condition.value->'optionIds', '[]'::jsonb) ? subtype_id::text
      )
    $function$;
END $baseline$`.execute(db)
}

/** Installs the current installForeignKeys definitions for this subject on a fresh database. */
export const installForeignKeys = async (db: Kysely<Database>): Promise<void> => {
  await sql`DO $baseline$ BEGIN
ALTER TABLE "Common_Additional_Reviewers" ADD CONSTRAINT "cn_ref_additionalreviewersentityidentitytype" FOREIGN KEY (egcs_cn_entityid, egcs_cn_entitytype) REFERENCES "Common_Entity"(id, egcs_cn_entitytype);

ALTER TABLE "Common_Additional_Reviewers" ADD CONSTRAINT "Common_Additional_Reviewers_egcs_cn_group_fkey" FOREIGN KEY (egcs_cn_group) REFERENCES "Common_Group"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Additional_Reviewers" ADD CONSTRAINT "Common_Additional_Reviewers_egcs_cn_user_fkey" FOREIGN KEY (egcs_cn_user) REFERENCES "Common_User"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Approval" ADD CONSTRAINT "Common_Approval_egcs_cn_assignedgroup_fkey" FOREIGN KEY (egcs_cn_assignedgroup) REFERENCES "Common_Group"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Approval" ADD CONSTRAINT "Common_Approval_egcs_cn_assigneduser_fkey" FOREIGN KEY (egcs_cn_assigneduser) REFERENCES "Common_User"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Approval" ADD CONSTRAINT "Common_Approval_egcs_cn_attachment_fkey" FOREIGN KEY (egcs_cn_attachment) REFERENCES "Common_Attachment"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Approval" ADD CONSTRAINT "Common_Approval_egcs_cn_defaultgroup_fkey" FOREIGN KEY (egcs_cn_defaultgroup) REFERENCES "Common_Group"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Approval" ADD CONSTRAINT "Common_Approval_egcs_cn_defaultuser_fkey" FOREIGN KEY (egcs_cn_defaultuser) REFERENCES "Common_User"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Approval" ADD CONSTRAINT "Common_Approval_egcs_cn_onbehalf_fkey" FOREIGN KEY (egcs_cn_onbehalf) REFERENCES "Agency_Approval_Behalf_Type"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Approval" ADD CONSTRAINT "Common_Approval_egcs_cn_routingslip_fkey" FOREIGN KEY (egcs_cn_routingslip) REFERENCES "Common_Routing_Slip"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Approval" ADD CONSTRAINT "Common_Approval_egcs_cn_runtimeitem_fkey" FOREIGN KEY (egcs_cn_runtimeitem) REFERENCES "Common_Runtime_Item"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Approval_Certification" ADD CONSTRAINT "Common_Approval_Certification_egcs_cn_approval_fkey" FOREIGN KEY (egcs_cn_approval) REFERENCES "Common_Approval"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Approval_Step" ADD CONSTRAINT "Common_Approval_Step_egcs_cn_approvaltemplate_fkey" FOREIGN KEY (egcs_cn_approvaltemplate) REFERENCES "Common_Approval_Template"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Approval_Step" ADD CONSTRAINT "Common_Approval_Step_egcs_cn_defaultgroup_fkey" FOREIGN KEY (egcs_cn_defaultgroup) REFERENCES "Common_Group"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Approval_Step" ADD CONSTRAINT "Common_Approval_Step_egcs_cn_defaultuser_fkey" FOREIGN KEY (egcs_cn_defaultuser) REFERENCES "Common_User"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Approval_Template" ADD CONSTRAINT "cn_ref_approvaltemplatepublication" FOREIGN KEY (id, egcs_cn_publicationkind) REFERENCES "Common_Publication"(id, egcs_cn_kind);

ALTER TABLE "Common_Approval_Template" ADD CONSTRAINT "Common_Approval_Template_egcs_cn_agency_fkey" FOREIGN KEY (egcs_cn_agency) REFERENCES "Agency_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Assessment" ADD CONSTRAINT "Common_Assessment_egcs_cn_review_fkey" FOREIGN KEY (egcs_cn_review) REFERENCES "Common_Review"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Assessment_Custom_Outcome" ADD CONSTRAINT "Common_Assessment_Custom_Outcome_egcs_cn_review_fkey" FOREIGN KEY (egcs_cn_review) REFERENCES "Common_Review"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Assessment_Outcome" ADD CONSTRAINT "Common_Assessment_Outcome_egcs_cn_review_fkey" FOREIGN KEY (egcs_cn_review) REFERENCES "Common_Review"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Assessment_Response" ADD CONSTRAINT "Common_Assessment_Response_egcs_cn_assessment_fkey" FOREIGN KEY (egcs_cn_assessment) REFERENCES "Common_Assessment"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Assessment_Schema" ADD CONSTRAINT "Common_Assessment_Schema_egcs_cn_reviewschema_fkey" FOREIGN KEY (egcs_cn_reviewschema) REFERENCES "Common_Review_Schema"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Attachment" ADD CONSTRAINT "Common_Attachment_egcs_cn_attachmenttype_fkey" FOREIGN KEY (egcs_cn_attachmenttype) REFERENCES "Common_Attachment_Types"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Attachment_Types" ADD CONSTRAINT "Common_Attachment_Types_egcs_cn_agency_fkey" FOREIGN KEY (egcs_cn_agency) REFERENCES "Agency_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Certification" ADD CONSTRAINT "Common_Certification_egcs_cn_approvalstep_fkey" FOREIGN KEY (egcs_cn_approvalstep) REFERENCES "Common_Approval_Step"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Certification" ADD CONSTRAINT "Common_Certification_egcs_cn_approvaltemplate_fkey" FOREIGN KEY (egcs_cn_approvaltemplate) REFERENCES "Common_Approval_Template"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Certification" ADD CONSTRAINT "Common_Certification_egcs_cn_routingslip_fkey" FOREIGN KEY (egcs_cn_routingslip) REFERENCES "Common_Routing_Slip"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Checklist" ADD CONSTRAINT "Common_Checklist_egcs_cn_review_fkey" FOREIGN KEY (egcs_cn_review) REFERENCES "Common_Review"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Checklist_Response" ADD CONSTRAINT "Common_Checklist_Response_egcs_cn_checklist_fkey" FOREIGN KEY (egcs_cn_checklist) REFERENCES "Common_Checklist"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Checklist_Schema" ADD CONSTRAINT "Common_Checklist_Schema_egcs_cn_reviewschema_fkey" FOREIGN KEY (egcs_cn_reviewschema) REFERENCES "Common_Review_Schema"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Completion" ADD CONSTRAINT "cn_ref_completionentityidentitytype" FOREIGN KEY (egcs_cn_entityid, egcs_cn_entitytype) REFERENCES "Common_Entity"(id, egcs_cn_entitytype);

ALTER TABLE "Common_Completion" ADD CONSTRAINT "Common_Completion_egcs_cn_user_fkey" FOREIGN KEY (egcs_cn_user) REFERENCES "Common_User"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Entity" ADD CONSTRAINT "Common_Entity_egcs_cn_entitytype_fkey" FOREIGN KEY (egcs_cn_entitytype) REFERENCES "Common_Entity_Type"(egcs_cn_type) ON DELETE RESTRICT;

ALTER TABLE "Common_Entity_Assignment" ADD CONSTRAINT "cn_ref_entityassignmentidentitytype" FOREIGN KEY (egcs_cn_entityid, egcs_cn_entitytype) REFERENCES "Common_Entity"(id, egcs_cn_entitytype) ON DELETE RESTRICT;

ALTER TABLE "Common_Entity_Assignment" ADD CONSTRAINT "Common_Entity_Assignment_egcs_cn_createdby_fkey" FOREIGN KEY (egcs_cn_createdby) REFERENCES "Common_User"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Entity_Assignment" ADD CONSTRAINT "Common_Entity_Assignment_egcs_cn_user_fkey" FOREIGN KEY (egcs_cn_user) REFERENCES "Common_User"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Entity_Attachment" ADD CONSTRAINT "cn_fk_entityattachment_entity" FOREIGN KEY (egcs_cn_entityid, egcs_cn_entitytype) REFERENCES "Common_Entity"(id, egcs_cn_entitytype) ON DELETE RESTRICT;

ALTER TABLE "Common_Entity_Attachment" ADD CONSTRAINT "Common_Entity_Attachment_egcs_cn_attachment_fkey" FOREIGN KEY (egcs_cn_attachment) REFERENCES "Common_Attachment"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Entity_Attachment" ADD CONSTRAINT "Common_Entity_Attachment_egcs_cn_uploadedby_fkey" FOREIGN KEY (egcs_cn_uploadedby) REFERENCES "Common_User"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Extension_Entity_Owner" ADD CONSTRAINT "cn_ref_extensionentityowner_owner" FOREIGN KEY (egcs_cn_ownerid, egcs_cn_ownertype) REFERENCES "Common_Entity"(id, egcs_cn_entitytype) ON DELETE RESTRICT;

ALTER TABLE "Common_Extension_Entity_Owner" ADD CONSTRAINT "cn_ref_extensionentityowner_target" FOREIGN KEY (egcs_cn_entityid, egcs_cn_entitytype) REFERENCES "Common_Entity"(id, egcs_cn_entitytype) ON DELETE RESTRICT;

ALTER TABLE "Common_Extension_Entity_Owner" ADD CONSTRAINT "Common_Extension_Entity_Owner_egcs_cn_agency_fkey" FOREIGN KEY (egcs_cn_agency) REFERENCES "Agency_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Group" ADD CONSTRAINT "Common_Group_egcs_cn_agency_fkey" FOREIGN KEY (egcs_cn_agency) REFERENCES "Agency_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Group_Member" ADD CONSTRAINT "Common_Group_Member_egcs_cn_group_fkey" FOREIGN KEY (egcs_cn_group) REFERENCES "Common_Group"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Group_Member" ADD CONSTRAINT "Common_Group_Member_egcs_cn_user_fkey" FOREIGN KEY (egcs_cn_user) REFERENCES "Common_User"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Publication" ADD CONSTRAINT "cn_ref_publicationcurrentversion" FOREIGN KEY (egcs_cn_currentversion, id, egcs_cn_kind) REFERENCES "Common_Publication_Version"(id, egcs_cn_publication, egcs_cn_kind) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "Common_Publication_Transition" ADD CONSTRAINT "cn_ref_publicationtransitionversion" FOREIGN KEY (egcs_cn_publicationversion, egcs_cn_publication) REFERENCES "Common_Publication_Version"(id, egcs_cn_publication) ON DELETE RESTRICT;

ALTER TABLE "Common_Publication_Transition" ADD CONSTRAINT "Common_Publication_Transition_egcs_cn_actor_fkey" FOREIGN KEY (egcs_cn_actor) REFERENCES "Common_User"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Publication_Transition" ADD CONSTRAINT "Common_Publication_Transition_egcs_cn_publication_fkey" FOREIGN KEY (egcs_cn_publication) REFERENCES "Common_Publication"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Publication_Transition" ADD CONSTRAINT "Common_Publication_Transition_egcs_cn_publicationversion_fkey" FOREIGN KEY (egcs_cn_publicationversion) REFERENCES "Common_Publication_Version"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Publication_Version" ADD CONSTRAINT "cn_ref_publicationversionpublicationkind" FOREIGN KEY (egcs_cn_publication, egcs_cn_kind) REFERENCES "Common_Publication"(id, egcs_cn_kind) ON DELETE RESTRICT;

ALTER TABLE "Common_Publication_Version" ADD CONSTRAINT "Common_Publication_Version_egcs_cn_actor_fkey" FOREIGN KEY (egcs_cn_actor) REFERENCES "Common_User"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Publication_Version_Reference" ADD CONSTRAINT "cn_ref_publicationversionreference" FOREIGN KEY (egcs_cn_publicationversion, egcs_cn_publication, egcs_cn_kind, egcs_cn_version) REFERENCES "Common_Publication_Version"(id, egcs_cn_publication, egcs_cn_kind, egcs_cn_version) ON DELETE RESTRICT;

ALTER TABLE "Common_Publication_Version_Reference" ADD CONSTRAINT "Common_Publication_Version_Reference_egcs_cn_parentversion_fkey" FOREIGN KEY (egcs_cn_parentversion) REFERENCES "Common_Publication_Version"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Recommendation" ADD CONSTRAINT "cn_ref_recommendationentityidentitytype" FOREIGN KEY (egcs_cn_entityid, egcs_cn_entitytype) REFERENCES "Common_Entity"(id, egcs_cn_entitytype);

ALTER TABLE "Common_Recommendation" ADD CONSTRAINT "cn_ref_recommendationid" FOREIGN KEY (id) REFERENCES "Common_Entity"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Recommendation" ADD CONSTRAINT "cn_ref_recommendationrecommendationsetup" FOREIGN KEY (egcs_cn_recommendationsetup) REFERENCES "Common_Recommendation_Setup"(id);

ALTER TABLE "Common_Recommendation" ADD CONSTRAINT "cn_ref_recommendationsetruntimeidentity" FOREIGN KEY (egcs_cn_recommendationset, egcs_cn_entitytype, egcs_cn_entityid) REFERENCES "Common_Recommendation_Set"(id, egcs_cn_entitytype, egcs_cn_entityid);

ALTER TABLE "Common_Recommendation" ADD CONSTRAINT "Common_Recommendation_egcs_cn_recommendationset_fkey" FOREIGN KEY (egcs_cn_recommendationset) REFERENCES "Common_Recommendation_Set"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Recommendation" ADD CONSTRAINT "Common_Recommendation_egcs_cn_runtimeitem_fkey" FOREIGN KEY (egcs_cn_runtimeitem) REFERENCES "Common_Runtime_Item"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Recommendation_Schema" ADD CONSTRAINT "cn_ref_recommendationschemapublication" FOREIGN KEY (id, egcs_cn_publicationkind) REFERENCES "Common_Publication"(id, egcs_cn_kind);

ALTER TABLE "Common_Recommendation_Schema" ADD CONSTRAINT "Common_Recommendation_Schema_egcs_cn_agency_fkey" FOREIGN KEY (egcs_cn_agency) REFERENCES "Agency_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Recommendation_Set" ADD CONSTRAINT "cn_fk_recommendationset_setup" FOREIGN KEY (egcs_cn_recommendationsetsetup) REFERENCES "Common_Recommendation_Set_Setup"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Recommendation_Set" ADD CONSTRAINT "cn_ref_recommendationsetentityidentitytype" FOREIGN KEY (egcs_cn_entityid, egcs_cn_entitytype) REFERENCES "Common_Entity"(id, egcs_cn_entitytype);

ALTER TABLE "Common_Recommendation_Set" ADD CONSTRAINT "Common_Recommendation_Set_egcs_cn_runtimeitem_fkey" FOREIGN KEY (egcs_cn_runtimeitem) REFERENCES "Common_Runtime_Item"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Recommendation_Set_Setup" ADD CONSTRAINT "cn_ref_recommendationsetsetuppublication" FOREIGN KEY (id, egcs_cn_publicationkind) REFERENCES "Common_Publication"(id, egcs_cn_kind);

ALTER TABLE "Common_Recommendation_Set_Setup" ADD CONSTRAINT "Common_Recommendation_Set_Setup_egcs_cn_agency_fkey" FOREIGN KEY (egcs_cn_agency) REFERENCES "Agency_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Recommendation_Set_Setup" ADD CONSTRAINT "Common_Recommendation_Set_Setup_egcs_cn_approvaltemplate_fkey" FOREIGN KEY (egcs_cn_approvaltemplate) REFERENCES "Common_Approval_Template"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Recommendation_Setup" ADD CONSTRAINT "cn_ref_recommendationsetupschema" FOREIGN KEY (egcs_cn_recommendationschema) REFERENCES "Common_Recommendation_Schema"(id);

ALTER TABLE "Common_Recommendation_Setup" ADD CONSTRAINT "cn_ref_recommendationsetupset" FOREIGN KEY (egcs_cn_recommendationset) REFERENCES "Common_Recommendation_Set_Setup"(id);

ALTER TABLE "Common_Recommendation_Setup" ADD CONSTRAINT "Common_Recommendation_Setup_egcs_cn_approvaltemplate_fkey" FOREIGN KEY (egcs_cn_approvaltemplate) REFERENCES "Common_Approval_Template"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Review" ADD CONSTRAINT "cn_ref_reviewid" FOREIGN KEY (id) REFERENCES "Common_Entity"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Review" ADD CONSTRAINT "Common_Review_egcs_cn_group_fkey" FOREIGN KEY (egcs_cn_group) REFERENCES "Common_Group"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Review" ADD CONSTRAINT "Common_Review_egcs_cn_groupclaimedby_fkey" FOREIGN KEY (egcs_cn_groupclaimedby) REFERENCES "Common_User"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Review" ADD CONSTRAINT "Common_Review_egcs_cn_reviewschema_fkey" FOREIGN KEY (egcs_cn_reviewschema) REFERENCES "Common_Review_Schema"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Review" ADD CONSTRAINT "Common_Review_egcs_cn_reviewset_fkey" FOREIGN KEY (egcs_cn_reviewset) REFERENCES "Common_Review_Set"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Review" ADD CONSTRAINT "Common_Review_egcs_cn_runtimeitem_fkey" FOREIGN KEY (egcs_cn_runtimeitem) REFERENCES "Common_Runtime_Item"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Review_Response" ADD CONSTRAINT "Common_Review_Response_egcs_cn_assessment_fkey" FOREIGN KEY (egcs_cn_assessment) REFERENCES "Common_Review"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Review_Schema" ADD CONSTRAINT "cn_ref_reviewschemaentitytype" FOREIGN KEY (egcs_cn_entitytype) REFERENCES "Common_Entity_Type"(egcs_cn_type) ON DELETE RESTRICT;

ALTER TABLE "Common_Review_Schema" ADD CONSTRAINT "cn_ref_reviewschemapublication" FOREIGN KEY (id, egcs_cn_publicationkind) REFERENCES "Common_Publication"(id, egcs_cn_kind);

ALTER TABLE "Common_Review_Schema" ADD CONSTRAINT "Common_Review_Schema_egcs_cn_agency_fkey" FOREIGN KEY (egcs_cn_agency) REFERENCES "Agency_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Review_Set" ADD CONSTRAINT "cn_fk_reviewset_setup" FOREIGN KEY (egcs_cn_reviewsetsetup, egcs_cn_entitytype) REFERENCES "Common_Review_Set_Setup"(id, egcs_cn_entitytype) ON DELETE RESTRICT;

ALTER TABLE "Common_Review_Set" ADD CONSTRAINT "cn_ref_reviewsetentityidentitytype" FOREIGN KEY (egcs_cn_entityid, egcs_cn_entitytype) REFERENCES "Common_Entity"(id, egcs_cn_entitytype);

ALTER TABLE "Common_Review_Set" ADD CONSTRAINT "Common_Review_Set_egcs_cn_runtimeitem_fkey" FOREIGN KEY (egcs_cn_runtimeitem) REFERENCES "Common_Runtime_Item"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Review_Set_Setup" ADD CONSTRAINT "cn_ref_reviewsetsetupentitytype" FOREIGN KEY (egcs_cn_entitytype) REFERENCES "Common_Entity_Type"(egcs_cn_type);

ALTER TABLE "Common_Review_Set_Setup" ADD CONSTRAINT "cn_ref_reviewsetsetuppublication" FOREIGN KEY (id, egcs_cn_publicationkind) REFERENCES "Common_Publication"(id, egcs_cn_kind);

ALTER TABLE "Common_Review_Set_Setup" ADD CONSTRAINT "Common_Review_Set_Setup_egcs_cn_agency_fkey" FOREIGN KEY (egcs_cn_agency) REFERENCES "Agency_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Review_Set_Setup" ADD CONSTRAINT "Common_Review_Set_Setup_egcs_cn_approvaltemplate_fkey" FOREIGN KEY (egcs_cn_approvaltemplate) REFERENCES "Common_Approval_Template"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Review_Setup" ADD CONSTRAINT "cn_ref_reviewsetupreviewschemaentitytype" FOREIGN KEY (egcs_cn_reviewschema, egcs_cn_entitytype) REFERENCES "Common_Review_Schema"(id, egcs_cn_entitytype);

ALTER TABLE "Common_Review_Setup" ADD CONSTRAINT "cn_ref_reviewsetupreviewsetentitytype" FOREIGN KEY (egcs_cn_reviewset, egcs_cn_entitytype) REFERENCES "Common_Review_Set_Setup"(id, egcs_cn_entitytype);

ALTER TABLE "Common_Review_Setup" ADD CONSTRAINT "Common_Review_Setup_egcs_cn_approvaltemplate_fkey" FOREIGN KEY (egcs_cn_approvaltemplate) REFERENCES "Common_Approval_Template"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Review_Setup" ADD CONSTRAINT "Common_Review_Setup_egcs_cn_defaultgroup_fkey" FOREIGN KEY (egcs_cn_defaultgroup) REFERENCES "Common_Group"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Routing_Slip" ADD CONSTRAINT "cn_ref_routingslipentityidentitytype" FOREIGN KEY (egcs_cn_entityid, egcs_cn_entitytype) REFERENCES "Common_Entity"(id, egcs_cn_entitytype);

ALTER TABLE "Common_Routing_Slip" ADD CONSTRAINT "Common_Routing_Slip_egcs_cn_approvaltemplate_fkey" FOREIGN KEY (egcs_cn_approvaltemplate) REFERENCES "Common_Approval_Template"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Routing_Slip" ADD CONSTRAINT "Common_Routing_Slip_egcs_cn_runtimeitem_fkey" FOREIGN KEY (egcs_cn_runtimeitem) REFERENCES "Common_Runtime_Item"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Runtime" ADD CONSTRAINT "cn_ref_runtimeprevious" FOREIGN KEY (egcs_cn_previousruntime) REFERENCES "Common_Runtime"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Runtime" ADD CONSTRAINT "cn_ref_runtimesourceversion" FOREIGN KEY (egcs_cn_sourcepublicationversion, egcs_cn_sourcepublication, egcs_cn_sourcepublicationkind, egcs_cn_sourceversion) REFERENCES "Common_Publication_Version"(id, egcs_cn_publication, egcs_cn_kind, egcs_cn_version) ON DELETE RESTRICT;

ALTER TABLE "Common_Runtime" ADD CONSTRAINT "cn_ref_runtimetarget" FOREIGN KEY (egcs_cn_entityid, egcs_cn_entitytype) REFERENCES "Common_Entity"(id, egcs_cn_entitytype) ON DELETE RESTRICT;

ALTER TABLE "Common_Runtime" ADD CONSTRAINT "Common_Runtime_egcs_cn_initiatedby_fkey" FOREIGN KEY (egcs_cn_initiatedby) REFERENCES "Common_User"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Runtime_Item" ADD CONSTRAINT "cn_ref_runtimeitemparent" FOREIGN KEY (egcs_cn_parentruntimeitem, egcs_cn_runtime) REFERENCES "Common_Runtime_Item"(id, egcs_cn_runtime) ON DELETE RESTRICT;

ALTER TABLE "Common_Runtime_Item" ADD CONSTRAINT "cn_ref_runtimeitemversion" FOREIGN KEY (egcs_cn_publicationversion, egcs_cn_publication, egcs_cn_publicationkind, egcs_cn_version) REFERENCES "Common_Publication_Version"(id, egcs_cn_publication, egcs_cn_kind, egcs_cn_version) ON DELETE RESTRICT;

ALTER TABLE "Common_Runtime_Item" ADD CONSTRAINT "Common_Runtime_Item_egcs_cn_runtime_fkey" FOREIGN KEY (egcs_cn_runtime) REFERENCES "Common_Runtime"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Runtime_Transition" ADD CONSTRAINT "cn_ref_runtimetransitionitem" FOREIGN KEY (egcs_cn_runtimeitem, egcs_cn_runtime) REFERENCES "Common_Runtime_Item"(id, egcs_cn_runtime) ON DELETE RESTRICT;

ALTER TABLE "Common_Runtime_Transition" ADD CONSTRAINT "Common_Runtime_Transition_egcs_cn_actor_fkey" FOREIGN KEY (egcs_cn_actor) REFERENCES "Common_User"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Runtime_Transition" ADD CONSTRAINT "Common_Runtime_Transition_egcs_cn_runtime_fkey" FOREIGN KEY (egcs_cn_runtime) REFERENCES "Common_Runtime"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Status" ADD CONSTRAINT "Common_Status_egcs_cn_agency_fkey" FOREIGN KEY (egcs_cn_agency) REFERENCES "Agency_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_User" ADD CONSTRAINT "Common_User_egcs_cn_auth_user_id_fkey" FOREIGN KEY (egcs_cn_auth_user_id) REFERENCES "user"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Workflow_Member_Condition" ADD CONSTRAINT "Common_Workflow_Member_Condit_egcs_cn_option_egcs_cn_field_fkey" FOREIGN KEY (egcs_cn_option, egcs_cn_field) REFERENCES "Agency_Custom_Field_Option"(id, egcs_ay_field) ON DELETE RESTRICT;

ALTER TABLE "Common_Workflow_Member_Condition" ADD CONSTRAINT "Common_Workflow_Member_Conditi_egcs_cn_workflowsetupmember_fkey" FOREIGN KEY (egcs_cn_workflowsetupmember) REFERENCES "Common_Workflow_Setup_Member"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Workflow_Member_Condition" ADD CONSTRAINT "Common_Workflow_Member_Condition_egcs_cn_field_fkey" FOREIGN KEY (egcs_cn_field) REFERENCES "Agency_Custom_Field"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Workflow_Owner_Blocker" ADD CONSTRAINT "Common_Workflow_Owner_Blocker_egcs_cn_configuredowner_fkey" FOREIGN KEY (egcs_cn_configuredowner) REFERENCES "Common_User"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Workflow_Owner_Blocker" ADD CONSTRAINT "Common_Workflow_Owner_Blocker_egcs_cn_recommendationsetup_fkey" FOREIGN KEY (egcs_cn_recommendationsetup) REFERENCES "Common_Recommendation_Setup"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Workflow_Owner_Blocker" ADD CONSTRAINT "Common_Workflow_Owner_Blocker_egcs_cn_replacementowner_fkey" FOREIGN KEY (egcs_cn_replacementowner) REFERENCES "Common_User"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Workflow_Owner_Blocker" ADD CONSTRAINT "Common_Workflow_Owner_Blocker_egcs_cn_resolvedby_fkey" FOREIGN KEY (egcs_cn_resolvedby) REFERENCES "Common_User"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Workflow_Owner_Blocker" ADD CONSTRAINT "Common_Workflow_Owner_Blocker_egcs_cn_reviewsetup_fkey" FOREIGN KEY (egcs_cn_reviewsetup) REFERENCES "Common_Review_Setup"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Workflow_Owner_Blocker" ADD CONSTRAINT "Common_Workflow_Owner_Blocker_egcs_cn_triggeredby_fkey" FOREIGN KEY (egcs_cn_triggeredby) REFERENCES "Common_User"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Workflow_Owner_Blocker" ADD CONSTRAINT "Common_Workflow_Owner_Blocker_egcs_cn_workflowrun_fkey" FOREIGN KEY (egcs_cn_workflowrun) REFERENCES "Common_Workflow_Run"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Workflow_Owner_Blocker" ADD CONSTRAINT "Common_Workflow_Owner_Blocker_egcs_cn_workflowsetupmember_fkey" FOREIGN KEY (egcs_cn_workflowsetupmember) REFERENCES "Common_Workflow_Setup_Member"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Workflow_Publication_Condition" ADD CONSTRAINT "Common_Workflow_Publication_C_egcs_cn_option_egcs_cn_field_fkey" FOREIGN KEY (egcs_cn_option, egcs_cn_field) REFERENCES "Agency_Custom_Field_Option"(id, egcs_ay_field) ON DELETE RESTRICT;

ALTER TABLE "Common_Workflow_Publication_Condition" ADD CONSTRAINT "Common_Workflow_Publication_Co_egcs_cn_workflowsetupmember_fkey" FOREIGN KEY (egcs_cn_workflowsetupmember) REFERENCES "Common_Workflow_Setup_Member"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Workflow_Publication_Condition" ADD CONSTRAINT "Common_Workflow_Publication_Con_egcs_cn_publicationversion_fkey" FOREIGN KEY (egcs_cn_publicationversion) REFERENCES "Common_Publication_Version"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Workflow_Publication_Condition" ADD CONSTRAINT "Common_Workflow_Publication_Condition_egcs_cn_field_fkey" FOREIGN KEY (egcs_cn_field) REFERENCES "Agency_Custom_Field"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Workflow_Publication_Status" ADD CONSTRAINT "Common_Workflow_Publication_Sta_egcs_cn_publicationversion_fkey" FOREIGN KEY (egcs_cn_publicationversion) REFERENCES "Common_Publication_Version"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Workflow_Publication_Status" ADD CONSTRAINT "Common_Workflow_Publication_Status_egcs_cn_status_fkey" FOREIGN KEY (egcs_cn_status) REFERENCES "Common_Status"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Workflow_Run" ADD CONSTRAINT "cn_ref_workflowruncompletiontarget" FOREIGN KEY (egcs_cn_completion) REFERENCES "Common_Completion"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Workflow_Run" ADD CONSTRAINT "Common_Workflow_Run_id_fkey" FOREIGN KEY (id) REFERENCES "Common_Runtime"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Workflow_Setup" ADD CONSTRAINT "cn_ref_workflowsetupentitytype" FOREIGN KEY (egcs_cn_entitytype) REFERENCES "Common_Entity_Type"(egcs_cn_type) ON DELETE RESTRICT;

ALTER TABLE "Common_Workflow_Setup" ADD CONSTRAINT "cn_ref_workflowsetuppublication" FOREIGN KEY (id, egcs_cn_publicationkind) REFERENCES "Common_Publication"(id, egcs_cn_kind);

ALTER TABLE "Common_Workflow_Setup" ADD CONSTRAINT "Common_Workflow_Setup_egcs_cn_agency_fkey" FOREIGN KEY (egcs_cn_agency) REFERENCES "Agency_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Workflow_Setup" ADD CONSTRAINT "Common_Workflow_Setup_egcs_cn_cancellationstatus_fkey" FOREIGN KEY (egcs_cn_cancellationstatus) REFERENCES "Common_Status"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Workflow_Setup" ADD CONSTRAINT "Common_Workflow_Setup_egcs_cn_executionfailurestatus_fkey" FOREIGN KEY (egcs_cn_executionfailurestatus) REFERENCES "Common_Status"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Workflow_Setup_Allowed_Start_Status" ADD CONSTRAINT "Common_Workflow_Setup_Allowed_Start__egcs_cn_workflowsetup_fkey" FOREIGN KEY (egcs_cn_workflowsetup) REFERENCES "Common_Workflow_Setup"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Workflow_Setup_Allowed_Start_Status" ADD CONSTRAINT "Common_Workflow_Setup_Allowed_Start_Status_egcs_cn_status_fkey" FOREIGN KEY (egcs_cn_status) REFERENCES "Common_Status"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Workflow_Setup_Member" ADD CONSTRAINT "Common_Workflow_Setup_Member_egcs_cn_approvaltemplate_fkey" FOREIGN KEY (egcs_cn_approvaltemplate) REFERENCES "Common_Approval_Template"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Workflow_Setup_Member" ADD CONSTRAINT "Common_Workflow_Setup_Member_egcs_cn_failurestatus_fkey" FOREIGN KEY (egcs_cn_failurestatus) REFERENCES "Common_Status"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Workflow_Setup_Member" ADD CONSTRAINT "Common_Workflow_Setup_Member_egcs_cn_materializationstatus_fkey" FOREIGN KEY (egcs_cn_materializationstatus) REFERENCES "Common_Status"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Workflow_Setup_Member" ADD CONSTRAINT "Common_Workflow_Setup_Member_egcs_cn_recommendationset_fkey" FOREIGN KEY (egcs_cn_recommendationset) REFERENCES "Common_Recommendation_Set_Setup"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Workflow_Setup_Member" ADD CONSTRAINT "Common_Workflow_Setup_Member_egcs_cn_reviewset_fkey" FOREIGN KEY (egcs_cn_reviewset) REFERENCES "Common_Review_Set_Setup"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Workflow_Setup_Member" ADD CONSTRAINT "Common_Workflow_Setup_Member_egcs_cn_successstatus_fkey" FOREIGN KEY (egcs_cn_successstatus) REFERENCES "Common_Status"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Workflow_Setup_Member" ADD CONSTRAINT "Common_Workflow_Setup_Member_egcs_cn_workflowsetup_fkey" FOREIGN KEY (egcs_cn_workflowsetup) REFERENCES "Common_Workflow_Setup"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Workflow_Setup_Member_Owner" ADD CONSTRAINT "Common_Workflow_Setup_Member_O_egcs_cn_recommendationsetup_fkey" FOREIGN KEY (egcs_cn_recommendationsetup) REFERENCES "Common_Recommendation_Setup"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Workflow_Setup_Member_Owner" ADD CONSTRAINT "Common_Workflow_Setup_Member_O_egcs_cn_workflowsetupmember_fkey" FOREIGN KEY (egcs_cn_workflowsetupmember) REFERENCES "Common_Workflow_Setup_Member"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Workflow_Setup_Member_Owner" ADD CONSTRAINT "Common_Workflow_Setup_Member_Owner_egcs_cn_defaultowner_fkey" FOREIGN KEY (egcs_cn_defaultowner) REFERENCES "Common_User"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Workflow_Setup_Member_Owner" ADD CONSTRAINT "Common_Workflow_Setup_Member_Owner_egcs_cn_reviewsetup_fkey" FOREIGN KEY (egcs_cn_reviewsetup) REFERENCES "Common_Review_Setup"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Workflow_Status_Transition" ADD CONSTRAINT "cn_ref_workflowtransitionitemrun" FOREIGN KEY (egcs_cn_workflowitem, egcs_cn_workflowrun) REFERENCES "Common_Runtime_Item"(id, egcs_cn_runtime) ON DELETE RESTRICT;

ALTER TABLE "Common_Workflow_Status_Transition" ADD CONSTRAINT "Common_Workflow_Status_Transition_egcs_cn_actor_fkey" FOREIGN KEY (egcs_cn_actor) REFERENCES "Common_User"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Workflow_Status_Transition" ADD CONSTRAINT "Common_Workflow_Status_Transition_egcs_cn_newstatus_fkey" FOREIGN KEY (egcs_cn_newstatus) REFERENCES "Common_Status"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Workflow_Status_Transition" ADD CONSTRAINT "Common_Workflow_Status_Transition_egcs_cn_previousstatus_fkey" FOREIGN KEY (egcs_cn_previousstatus) REFERENCES "Common_Status"(id) ON DELETE RESTRICT;

ALTER TABLE "Common_Workflow_Status_Transition" ADD CONSTRAINT "Common_Workflow_Status_Transition_egcs_cn_workflowrun_fkey" FOREIGN KEY (egcs_cn_workflowrun) REFERENCES "Common_Workflow_Run"(id) ON DELETE RESTRICT;
END $baseline$`.execute(db)
}

/** Installs the current installTriggers definitions for this subject on a fresh database. */
export const installTriggers = async (db: Kysely<Database>): Promise<void> => {
  await sql`DO $baseline$ BEGIN
CREATE TRIGGER trg_reset_additional_reviewer_completion BEFORE INSERT OR UPDATE ON "Common_Additional_Reviewers" FOR EACH ROW EXECUTE FUNCTION trg_fn_reset_additional_reviewer_completion();

CREATE TRIGGER trg_autopopulate_self_approval BEFORE UPDATE OF egcs_cn_approvalvalue ON "Common_Approval" FOR EACH ROW EXECUTE FUNCTION trg_fn_autopopulate_self_approval();

CREATE TRIGGER trg_enforce_approval_runtime_state BEFORE UPDATE OF egcs_cn_approvalvalue ON "Common_Approval" FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_approval_runtime_state();

CREATE TRIGGER trg_enforce_approval_sequence BEFORE UPDATE OF egcs_cn_approvalvalue ON "Common_Approval" FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_approval_sequence();

CREATE TRIGGER trg_enforce_assigned_user_actions BEFORE UPDATE OF egcs_cn_approvalvalue ON "Common_Approval" FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_assigned_user_actions();

CREATE TRIGGER trg_lock_actioned_approval BEFORE UPDATE ON "Common_Approval" FOR EACH ROW EXECUTE FUNCTION trg_fn_lock_actioned_approval();

CREATE TRIGGER trg_lock_approval_runtime_evidence BEFORE DELETE OR UPDATE ON "Common_Approval" FOR EACH ROW EXECUTE FUNCTION trg_fn_lock_approval_runtime_evidence();

CREATE TRIGGER trg_require_actual_delegation_detail BEFORE UPDATE OF egcs_cn_approvalvalue ON "Common_Approval" FOR EACH ROW EXECUTE FUNCTION trg_fn_require_actual_delegation_detail();

CREATE TRIGGER trg_require_certifications BEFORE UPDATE OF egcs_cn_approvalvalue ON "Common_Approval" FOR EACH ROW EXECUTE FUNCTION trg_fn_require_certifications();

CREATE TRIGGER trg_validate_added_approval_runtime_step BEFORE INSERT ON "Common_Approval" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_added_approval_runtime_step();

CREATE TRIGGER trg_validate_approval_runtime_item BEFORE INSERT OR UPDATE ON "Common_Approval" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_approval_runtime_item();

CREATE TRIGGER trg_validate_claimant_approval_evidence BEFORE UPDATE OF egcs_cn_approvalvalue ON "Common_Approval" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_claimant_approval_evidence();

CREATE TRIGGER trg_lock_approval_certification_evidence BEFORE DELETE OR UPDATE ON "Common_Approval_Certification" FOR EACH ROW EXECUTE FUNCTION trg_fn_lock_approval_certification_evidence();

CREATE TRIGGER trg_guard_approval_step_authoring BEFORE INSERT OR DELETE OR UPDATE ON "Common_Approval_Step" FOR EACH ROW EXECUTE FUNCTION trg_fn_guard_publication_authoring('approval_step');

CREATE TRIGGER prevent_catalog_agency_change BEFORE UPDATE OF egcs_cn_agency ON "Common_Approval_Template" FOR EACH ROW EXECUTE FUNCTION prevent_catalog_agency_change();

CREATE TRIGGER trg_guard_publication_authoring BEFORE DELETE OR UPDATE ON "Common_Approval_Template" FOR EACH ROW EXECUTE FUNCTION trg_fn_guard_publication_authoring('publication');

CREATE TRIGGER trg_register_approvaltemplate_publication BEFORE INSERT ON "Common_Approval_Template" FOR EACH ROW EXECUTE FUNCTION trg_fn_register_publication('approval_template');

CREATE TRIGGER trg_enforce_assessment_subtype BEFORE INSERT OR UPDATE ON "Common_Assessment" FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_review_subtype('assessment');

CREATE TRIGGER trg_lock_terminal_assessment BEFORE INSERT OR DELETE OR UPDATE ON "Common_Assessment" FOR EACH ROW EXECUTE FUNCTION trg_fn_lock_terminal_runtime_evidence();

CREATE TRIGGER trg_lock_terminal_assessment_custom_outcome BEFORE INSERT OR DELETE OR UPDATE ON "Common_Assessment_Custom_Outcome" FOR EACH ROW EXECUTE FUNCTION trg_fn_lock_terminal_runtime_evidence();

CREATE TRIGGER trg_lock_terminal_assessment_outcome BEFORE INSERT OR DELETE OR UPDATE ON "Common_Assessment_Outcome" FOR EACH ROW EXECUTE FUNCTION trg_fn_lock_terminal_runtime_evidence();

CREATE TRIGGER trg_enforce_assessment_schema_subtype BEFORE INSERT OR UPDATE ON "Common_Assessment_Schema" FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_review_subtype('assessment');

CREATE TRIGGER trg_guard_assessment_schema_authoring BEFORE INSERT OR DELETE OR UPDATE ON "Common_Assessment_Schema" FOR EACH ROW EXECUTE FUNCTION trg_fn_guard_publication_authoring('review_schema_child');

CREATE TRIGGER trg_guard_certification_authoring BEFORE INSERT OR DELETE OR UPDATE ON "Common_Certification" FOR EACH ROW EXECUTE FUNCTION trg_fn_guard_publication_authoring('certification');

CREATE TRIGGER trg_lock_terminal_routing_certification BEFORE INSERT OR DELETE OR UPDATE ON "Common_Certification" FOR EACH ROW EXECUTE FUNCTION trg_fn_lock_terminal_runtime_evidence();

CREATE TRIGGER trg_enforce_checklist_subtype BEFORE INSERT OR UPDATE ON "Common_Checklist" FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_review_subtype('checklist');

CREATE TRIGGER trg_lock_terminal_checklist BEFORE INSERT OR DELETE OR UPDATE ON "Common_Checklist" FOR EACH ROW EXECUTE FUNCTION trg_fn_lock_terminal_runtime_evidence();

CREATE TRIGGER trg_lock_terminal_checklist_response BEFORE INSERT OR DELETE OR UPDATE ON "Common_Checklist_Response" FOR EACH ROW EXECUTE FUNCTION trg_fn_lock_terminal_runtime_evidence();

CREATE TRIGGER trg_enforce_checklist_schema_subtype BEFORE INSERT OR UPDATE ON "Common_Checklist_Schema" FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_review_subtype('checklist');

CREATE TRIGGER trg_guard_checklist_schema_authoring BEFORE INSERT OR DELETE OR UPDATE ON "Common_Checklist_Schema" FOR EACH ROW EXECUTE FUNCTION trg_fn_guard_publication_authoring('review_schema_child');

CREATE CONSTRAINT TRIGGER trg_ar_completion_control AFTER INSERT ON "Common_Completion" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_ar_completion_control();

CREATE TRIGGER trg_correction_financial_lock BEFORE INSERT OR DELETE OR UPDATE ON "Common_Completion" FOR EACH ROW EXECUTE FUNCTION trg_fn_correction_financial_lock();

CREATE CONSTRAINT TRIGGER trg_enforce_completion_resolution_from_completion AFTER INSERT ON "Common_Completion" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_completion_resolution();

CREATE CONSTRAINT TRIGGER trg_enforce_correction_completion AFTER INSERT ON "Common_Completion" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_correction_completion();

CREATE TRIGGER trg_lock_completion BEFORE DELETE OR UPDATE ON "Common_Completion" FOR EACH ROW EXECUTE FUNCTION trg_fn_lock_completion();

CREATE TRIGGER trg_validate_completion_insert BEFORE INSERT ON "Common_Completion" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_completion_insert();

CREATE CONSTRAINT TRIGGER trg_enforce_entity_assignment_roster AFTER INSERT OR DELETE OR UPDATE ON "Common_Entity_Assignment" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_entity_assignment_roster();

CREATE TRIGGER trg_prevent_entity_assignment_identity_update BEFORE UPDATE OF egcs_cn_entityid, egcs_cn_entitytype ON "Common_Entity_Assignment" FOR EACH ROW EXECUTE FUNCTION trg_fn_prevent_entity_assignment_identity_update();

CREATE TRIGGER trg_protect_ar_roster BEFORE INSERT OR DELETE OR UPDATE ON "Common_Entity_Assignment" FOR EACH ROW EXECUTE FUNCTION trg_fn_protect_ar_roster();

CREATE TRIGGER trg_protect_correction_roster BEFORE INSERT OR DELETE OR UPDATE ON "Common_Entity_Assignment" FOR EACH ROW EXECUTE FUNCTION trg_fn_protect_correction_roster();

CREATE TRIGGER trg_validate_entity_assignment_type BEFORE INSERT OR UPDATE OF egcs_cn_entitytype ON "Common_Entity_Assignment" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_entity_assignment_type();

CREATE TRIGGER trg_enforce_entity_attachment_identity_immutable BEFORE UPDATE ON "Common_Entity_Attachment" FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_entity_attachment_identity_immutable();

CREATE TRIGGER trg_lock_entity_type BEFORE DELETE OR UPDATE ON "Common_Entity_Type" FOR EACH ROW EXECUTE FUNCTION trg_fn_lock_entity_type();

CREATE TRIGGER trg_lock_extension_entity_owner_binding BEFORE DELETE OR UPDATE ON "Common_Extension_Entity_Owner" FOR EACH ROW EXECUTE FUNCTION lock_extension_entity_owner_binding();

CREATE CONSTRAINT TRIGGER trg_require_publication_transition AFTER UPDATE OF egcs_cn_state, egcs_cn_currentversion ON "Common_Publication" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_require_publication_transition();

CREATE TRIGGER trg_validate_publication_insert BEFORE INSERT ON "Common_Publication" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_publication_insert();

CREATE TRIGGER trg_validate_publication_update BEFORE UPDATE ON "Common_Publication" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_publication_update();

CREATE TRIGGER trg_apply_publication_transition BEFORE INSERT ON "Common_Publication_Transition" FOR EACH ROW EXECUTE FUNCTION trg_fn_apply_publication_transition();

CREATE TRIGGER trg_lock_publication_transition BEFORE DELETE OR UPDATE ON "Common_Publication_Transition" FOR EACH ROW EXECUTE FUNCTION trg_fn_lock_publication_evidence();

CREATE TRIGGER capture_workflow_publication_conditions AFTER INSERT ON "Common_Publication_Version" FOR EACH ROW EXECUTE FUNCTION capture_workflow_publication_conditions();

CREATE TRIGGER trg_lock_publication_version BEFORE DELETE OR UPDATE ON "Common_Publication_Version" FOR EACH ROW EXECUTE FUNCTION trg_fn_lock_publication_evidence();

CREATE TRIGGER trg_validate_publication_version_insert BEFORE INSERT ON "Common_Publication_Version" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_publication_version_insert();

CREATE TRIGGER trg_lock_publication_version_reference BEFORE DELETE OR UPDATE ON "Common_Publication_Version_Reference" FOR EACH ROW EXECUTE FUNCTION trg_fn_lock_publication_evidence();

CREATE TRIGGER trg_require_unsealed_publication_reference BEFORE INSERT ON "Common_Publication_Version_Reference" FOR EACH ROW EXECUTE FUNCTION trg_fn_require_unsealed_publication_version('reference');

CREATE TRIGGER trg_validate_publication_version_reference BEFORE INSERT ON "Common_Publication_Version_Reference" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_publication_version_reference();

CREATE CONSTRAINT TRIGGER trg_enforce_commonrecommendation_assignment_roster AFTER INSERT OR UPDATE OF _deleted ON "Common_Recommendation" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_assignable_entity_roster('commonrecommendation');

CREATE TRIGGER trg_lock_terminal_recommendation BEFORE INSERT OR DELETE OR UPDATE ON "Common_Recommendation" FOR EACH ROW EXECUTE FUNCTION trg_fn_lock_terminal_runtime_evidence();

CREATE TRIGGER trg_register_commonrecommendation BEFORE INSERT ON "Common_Recommendation" FOR EACH ROW EXECUTE FUNCTION register_entity('commonrecommendation');

CREATE TRIGGER trg_soft_delete_commonrecommendation_assignments AFTER UPDATE OF _deleted ON "Common_Recommendation" FOR EACH ROW EXECUTE FUNCTION trg_fn_soft_delete_entity_assignments('commonrecommendation');

CREATE TRIGGER trg_validate_recommendation_runtime_extension BEFORE INSERT OR UPDATE ON "Common_Recommendation" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_domain_runtime_extension();

CREATE TRIGGER trg_validate_recommendation_runtime_member BEFORE INSERT OR UPDATE OF egcs_cn_recommendationset, egcs_cn_recommendationsetup ON "Common_Recommendation" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_recommendation_runtime_member();

CREATE TRIGGER prevent_catalog_agency_change BEFORE UPDATE OF egcs_cn_agency ON "Common_Recommendation_Schema" FOR EACH ROW EXECUTE FUNCTION prevent_catalog_agency_change();

CREATE TRIGGER trg_guard_publication_authoring BEFORE DELETE OR UPDATE ON "Common_Recommendation_Schema" FOR EACH ROW EXECUTE FUNCTION trg_fn_guard_publication_authoring('publication');

CREATE TRIGGER trg_register_recommendationschema_publication BEFORE INSERT ON "Common_Recommendation_Schema" FOR EACH ROW EXECUTE FUNCTION trg_fn_register_publication('recommendation_schema');

CREATE TRIGGER trg_validate_recommendationset_runtime_extension BEFORE INSERT OR UPDATE ON "Common_Recommendation_Set" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_domain_runtime_extension();

CREATE TRIGGER prevent_catalog_agency_change BEFORE UPDATE OF egcs_cn_agency ON "Common_Recommendation_Set_Setup" FOR EACH ROW EXECUTE FUNCTION prevent_catalog_agency_change();

CREATE TRIGGER trg_guard_publication_authoring BEFORE DELETE OR UPDATE ON "Common_Recommendation_Set_Setup" FOR EACH ROW EXECUTE FUNCTION trg_fn_guard_publication_authoring('publication');

CREATE TRIGGER trg_register_recommendationsetsetup_publication BEFORE INSERT ON "Common_Recommendation_Set_Setup" FOR EACH ROW EXECUTE FUNCTION trg_fn_register_publication('recommendation_set_setup');

CREATE TRIGGER validate_catalog_nested_agency BEFORE INSERT OR UPDATE ON "Common_Recommendation_Set_Setup" FOR EACH ROW EXECUTE FUNCTION validate_catalog_nested_agency();

CREATE TRIGGER trg_guard_recommendation_setup_authoring BEFORE INSERT OR DELETE OR UPDATE ON "Common_Recommendation_Setup" FOR EACH ROW EXECUTE FUNCTION trg_fn_guard_publication_authoring('recommendation_set_child');

CREATE TRIGGER trg_lock_recommendation_setup_identity BEFORE UPDATE OF egcs_cn_recommendationset ON "Common_Recommendation_Setup" FOR EACH ROW EXECUTE FUNCTION trg_fn_lock_recommendation_setup_identity();

CREATE TRIGGER validate_catalog_nested_agency BEFORE INSERT OR UPDATE ON "Common_Recommendation_Setup" FOR EACH ROW EXECUTE FUNCTION validate_catalog_nested_agency();

CREATE CONSTRAINT TRIGGER trg_enforce_commonreview_assignment_roster AFTER INSERT OR UPDATE OF _deleted ON "Common_Review" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_assignable_entity_roster('commonreview');

CREATE CONSTRAINT TRIGGER trg_enforce_review_group_roster AFTER INSERT OR UPDATE OF egcs_cn_group, egcs_cn_groupclaimedby, _deleted ON "Common_Review" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_assignable_entity_roster('commonreview');

CREATE TRIGGER trg_lock_terminal_review BEFORE INSERT OR DELETE OR UPDATE ON "Common_Review" FOR EACH ROW EXECUTE FUNCTION trg_fn_lock_terminal_runtime_evidence();

CREATE TRIGGER trg_register_commonreview BEFORE INSERT ON "Common_Review" FOR EACH ROW EXECUTE FUNCTION register_entity('commonreview');

CREATE TRIGGER trg_soft_delete_commonreview_assignments AFTER UPDATE OF _deleted ON "Common_Review" FOR EACH ROW EXECUTE FUNCTION trg_fn_soft_delete_entity_assignments('commonreview');

CREATE TRIGGER trg_validate_review_runtime_extension BEFORE INSERT OR UPDATE ON "Common_Review" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_domain_runtime_extension();

CREATE TRIGGER trg_lock_terminal_review_response BEFORE INSERT OR DELETE OR UPDATE ON "Common_Review_Response" FOR EACH ROW EXECUTE FUNCTION trg_fn_lock_terminal_runtime_evidence();

CREATE TRIGGER prevent_catalog_agency_change BEFORE UPDATE OF egcs_cn_agency ON "Common_Review_Schema" FOR EACH ROW EXECUTE FUNCTION prevent_catalog_agency_change();

CREATE TRIGGER trg_guard_publication_authoring BEFORE DELETE OR UPDATE ON "Common_Review_Schema" FOR EACH ROW EXECUTE FUNCTION trg_fn_guard_publication_authoring('publication');

CREATE TRIGGER trg_register_reviewschema_publication BEFORE INSERT ON "Common_Review_Schema" FOR EACH ROW EXECUTE FUNCTION trg_fn_register_publication('review_schema');

CREATE TRIGGER trg_validate_review_schema_entity_type BEFORE INSERT OR UPDATE OF egcs_cn_entitytype ON "Common_Review_Schema" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_direct_review_entity_type();

CREATE TRIGGER trg_validate_reviewset_runtime_extension BEFORE INSERT OR UPDATE ON "Common_Review_Set" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_domain_runtime_extension();

CREATE TRIGGER prevent_catalog_agency_change BEFORE UPDATE OF egcs_cn_agency ON "Common_Review_Set_Setup" FOR EACH ROW EXECUTE FUNCTION prevent_catalog_agency_change();

CREATE TRIGGER trg_guard_publication_authoring BEFORE DELETE OR UPDATE ON "Common_Review_Set_Setup" FOR EACH ROW EXECUTE FUNCTION trg_fn_guard_publication_authoring('publication');

CREATE TRIGGER trg_register_reviewsetsetup_publication BEFORE INSERT ON "Common_Review_Set_Setup" FOR EACH ROW EXECUTE FUNCTION trg_fn_register_publication('review_set_setup');

CREATE TRIGGER trg_validate_review_set_setup_entity_type BEFORE INSERT OR UPDATE OF egcs_cn_entitytype ON "Common_Review_Set_Setup" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_direct_review_entity_type();

CREATE TRIGGER validate_catalog_nested_agency BEFORE INSERT OR UPDATE ON "Common_Review_Set_Setup" FOR EACH ROW EXECUTE FUNCTION validate_catalog_nested_agency();

CREATE TRIGGER trg_guard_review_setup_authoring BEFORE INSERT OR DELETE OR UPDATE ON "Common_Review_Setup" FOR EACH ROW EXECUTE FUNCTION trg_fn_guard_publication_authoring('review_set_child');

CREATE TRIGGER validate_catalog_nested_agency BEFORE INSERT OR UPDATE ON "Common_Review_Setup" FOR EACH ROW EXECUTE FUNCTION validate_catalog_nested_agency();

CREATE TRIGGER trg_lock_terminal_routing_slip BEFORE INSERT OR DELETE OR UPDATE ON "Common_Routing_Slip" FOR EACH ROW EXECUTE FUNCTION trg_fn_lock_terminal_runtime_evidence();

CREATE TRIGGER trg_validate_routing_slip_runtime BEFORE INSERT OR UPDATE ON "Common_Routing_Slip" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_routing_slip_runtime();

CREATE CONSTRAINT TRIGGER trg_ar_payment_terminal_control AFTER INSERT OR UPDATE ON "Common_Runtime" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_ar_payment_terminal_control();

CREATE TRIGGER trg_correction_financial_lock BEFORE INSERT OR DELETE OR UPDATE ON "Common_Runtime" FOR EACH ROW EXECUTE FUNCTION trg_fn_correction_financial_lock();

CREATE CONSTRAINT TRIGGER trg_enforce_workflow_transition_mode AFTER INSERT ON "Common_Runtime" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_workflow_transition_mode();

CREATE CONSTRAINT TRIGGER trg_require_runtime_root_transition AFTER UPDATE OF egcs_cn_state ON "Common_Runtime" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_require_runtime_root_transition();

CREATE TRIGGER trg_validate_runtime_insert BEFORE INSERT ON "Common_Runtime" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_runtime_insert();

CREATE TRIGGER trg_validate_runtime_update BEFORE UPDATE ON "Common_Runtime" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_runtime_state_update();

CREATE CONSTRAINT TRIGGER trg_validate_workflow_runtime_definition AFTER INSERT OR UPDATE OF egcs_cn_kind, egcs_cn_entitytype, egcs_cn_purpose, egcs_cn_sourcepublication, egcs_cn_sourcepublicationkind, egcs_cn_sourcepublicationversion, egcs_cn_sourceversion ON "Common_Runtime" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_workflow_runtime_definition();

CREATE CONSTRAINT TRIGGER trg_require_runtime_transition AFTER UPDATE OF egcs_cn_state ON "Common_Runtime_Item" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_require_runtime_transition();

CREATE CONSTRAINT TRIGGER trg_validate_runtime_item_hierarchy AFTER INSERT ON "Common_Runtime_Item" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_runtime_item_hierarchy();

CREATE TRIGGER trg_validate_runtime_item_insert BEFORE INSERT OR UPDATE OF egcs_cn_kind, egcs_cn_publicationkind ON "Common_Runtime_Item" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_runtime_item_insert();

CREATE TRIGGER trg_validate_runtime_item_update BEFORE UPDATE ON "Common_Runtime_Item" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_runtime_state_update();

CREATE TRIGGER trg_apply_runtime_transition BEFORE INSERT ON "Common_Runtime_Transition" FOR EACH ROW EXECUTE FUNCTION trg_fn_apply_runtime_transition();

CREATE TRIGGER trg_lock_runtime_transition BEFORE DELETE OR UPDATE ON "Common_Runtime_Transition" FOR EACH ROW EXECUTE FUNCTION trg_fn_lock_runtime_transition();

CREATE TRIGGER trg_preserve_retryable_workflow_status BEFORE UPDATE OF _deleted ON "Common_Status" FOR EACH ROW EXECUTE FUNCTION trg_fn_preserve_retryable_workflow_status();

CREATE TRIGGER trg_protect_agency_claim_reconciliation_status_refs BEFORE UPDATE OF _deleted, egcs_cn_agency, egcs_cn_readonly, egcs_cn_terminal ON "Common_Status" FOR EACH ROW EXECUTE FUNCTION protect_agency_claim_reconciliation_status_refs();

CREATE TRIGGER trg_protect_agency_draft_status BEFORE DELETE OR UPDATE ON "Common_Status" FOR EACH ROW EXECUTE FUNCTION protect_agency_draft_status();

CREATE TRIGGER validate_workflow_condition_scope BEFORE INSERT OR UPDATE ON "Common_Workflow_Member_Condition" FOR EACH ROW EXECUTE FUNCTION validate_workflow_condition_scope();

CREATE TRIGGER protect_workflow_publication_conditions BEFORE DELETE OR UPDATE ON "Common_Workflow_Publication_Condition" FOR EACH ROW EXECUTE FUNCTION trg_fn_lock_publication_evidence();

CREATE TRIGGER validate_workflow_publication_condition_scope BEFORE INSERT ON "Common_Workflow_Publication_Condition" FOR EACH ROW EXECUTE FUNCTION validate_workflow_condition_scope();

CREATE TRIGGER trg_lock_workflow_publication_status BEFORE DELETE OR UPDATE ON "Common_Workflow_Publication_Status" FOR EACH ROW EXECUTE FUNCTION trg_fn_lock_publication_evidence();

CREATE TRIGGER trg_require_unsealed_workflow_publication_status BEFORE INSERT ON "Common_Workflow_Publication_Status" FOR EACH ROW EXECUTE FUNCTION trg_fn_require_unsealed_publication_version('status');

CREATE TRIGGER protect_workflow_routing BEFORE UPDATE ON "Common_Workflow_Run" FOR EACH ROW EXECUTE FUNCTION protect_workflow_routing();

CREATE CONSTRAINT TRIGGER trg_enforce_completion_resolution_from_workflow AFTER INSERT OR DELETE OR UPDATE OF egcs_cn_completion ON "Common_Workflow_Run" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_completion_resolution();

CREATE TRIGGER trg_validate_workflow_completion_target BEFORE INSERT OR UPDATE OF egcs_cn_completion ON "Common_Workflow_Run" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_workflow_completion_target();

CREATE TRIGGER trg_validate_workflow_runtime_extension BEFORE INSERT OR UPDATE OF id ON "Common_Workflow_Run" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_workflow_runtime_extension();

CREATE TRIGGER preserve_linked_workflow_target BEFORE UPDATE OF egcs_cn_entitytype, egcs_cn_purpose ON "Common_Workflow_Setup" FOR EACH ROW EXECUTE FUNCTION preserve_linked_workflow_target();

CREATE TRIGGER trg_guard_publication_authoring BEFORE DELETE OR UPDATE ON "Common_Workflow_Setup" FOR EACH ROW EXECUTE FUNCTION trg_fn_guard_publication_authoring('publication');

CREATE CONSTRAINT TRIGGER trg_preserve_workflow_runtime_definition AFTER DELETE OR UPDATE ON "Common_Workflow_Setup" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_workflow_runtime_definition();

CREATE TRIGGER trg_register_workflowsetup_publication BEFORE INSERT ON "Common_Workflow_Setup" FOR EACH ROW EXECUTE FUNCTION trg_fn_register_publication('workflow_setup');

CREATE TRIGGER trg_validate_workflow_setup_entity_type BEFORE INSERT OR UPDATE OF egcs_cn_entitytype, egcs_cn_purpose ON "Common_Workflow_Setup" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_workflow_setup_entity_type();

CREATE CONSTRAINT TRIGGER trg_validate_workflow_setup_status_agency AFTER INSERT OR UPDATE ON "Common_Workflow_Setup" DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_workflow_status_agency();

CREATE TRIGGER trg_guard_workflow_status_authoring BEFORE INSERT OR DELETE OR UPDATE ON "Common_Workflow_Setup_Allowed_Start_Status" FOR EACH ROW EXECUTE FUNCTION trg_fn_guard_publication_authoring('workflow_child');

CREATE CONSTRAINT TRIGGER trg_validate_workflow_allowed_status_agency AFTER INSERT OR UPDATE ON "Common_Workflow_Setup_Allowed_Start_Status" DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_workflow_status_agency();

CREATE TRIGGER trg_guard_workflow_member_authoring BEFORE INSERT OR DELETE OR UPDATE ON "Common_Workflow_Setup_Member" FOR EACH ROW EXECUTE FUNCTION trg_fn_guard_publication_authoring('workflow_child');

CREATE CONSTRAINT TRIGGER trg_validate_workflow_member_status_agency AFTER INSERT OR UPDATE ON "Common_Workflow_Setup_Member" DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_workflow_status_agency();

CREATE TRIGGER trg_validate_workflow_setup_member BEFORE INSERT OR UPDATE ON "Common_Workflow_Setup_Member" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_workflow_setup_member();

CREATE TRIGGER trg_guard_workflow_owner_authoring BEFORE INSERT OR DELETE OR UPDATE ON "Common_Workflow_Setup_Member_Owner" FOR EACH ROW EXECUTE FUNCTION trg_fn_guard_publication_authoring('workflow_owner');

CREATE TRIGGER trg_validate_workflow_member_owner BEFORE INSERT OR UPDATE ON "Common_Workflow_Setup_Member_Owner" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_workflow_member_owner();

CREATE TRIGGER trg_lock_workflow_status_transition BEFORE DELETE OR UPDATE ON "Common_Workflow_Status_Transition" FOR EACH ROW EXECUTE FUNCTION trg_fn_lock_workflow_status_transition();

CREATE CONSTRAINT TRIGGER trg_validate_workflow_transition_status_agency AFTER INSERT ON "Common_Workflow_Status_Transition" DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_workflow_transition_status_agency();
END $baseline$`.execute(db)
}
