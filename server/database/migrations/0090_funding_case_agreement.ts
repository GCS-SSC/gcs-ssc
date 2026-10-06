import { sql, type Kysely } from 'kysely'
import type { Database } from '../../../shared/types/database'

// Clean-cutover baseline: funding case agreement. Edit this subject directly.

/** Installs the current up definitions for this subject on a fresh database. */
export const up = async (db: Kysely<Database>): Promise<void> => {
  await sql`DO $baseline$ BEGIN
CREATE SEQUENCE "Funding_Case_Account_Receivable_Allocation_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Funding_Case_Account_Receivable_Offset_Memo_Application_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Funding_Case_Account_Receivable_Offset_Memo_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Funding_Case_Account_Receivable_Pool_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Funding_Case_Account_Receivable_Posting_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Funding_Case_Account_Receivable_Recovery_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Funding_Case_Agreement_Account_Receivable_Coding_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Funding_Case_Agreement_Account_Receivable_Line_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Funding_Case_Agreement_Activity_Version_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Funding_Case_Agreement_Activity_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Funding_Case_Agreement_Address_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Funding_Case_Agreement_Amendment_Subtype_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Funding_Case_Agreement_Amendment_Type_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Funding_Case_Agreement_Applicant_Recipient_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Funding_Case_Agreement_Approval_Submission_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Funding_Case_Agreement_Budget_Fiscal_Year_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Funding_Case_Agreement_Budget_Line_Item_Funding_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Funding_Case_Agreement_Budget_Line_Item_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Funding_Case_Agreement_Budget_Version_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Funding_Case_Agreement_Claim_Line_Item_Funding_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Funding_Case_Agreement_Claim_Line_Item_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Funding_Case_Agreement_Claim_Reconcile_Line_Item_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Funding_Case_Agreement_Closeout_Snapshot_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Funding_Case_Agreement_Commitment_Line_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Funding_Case_Agreement_Correction_Adjustment_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Funding_Case_Agreement_Correction_Line_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Funding_Case_Agreement_Correction_Notification_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Funding_Case_Agreement_Correction_Source_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Funding_Case_Agreement_Forecast_Line_Item_Funding_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Funding_Case_Agreement_Forecast_Line_Item_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Funding_Case_Agreement_Generated_Document_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Funding_Case_Agreement_Journal_Voucher_Line_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Funding_Case_Agreement_Monitor_Finding_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Funding_Case_Agreement_Monitor_Followup_Update_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Funding_Case_Agreement_Monitor_Followup_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Funding_Case_Agreement_Monitor_Items_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Funding_Case_Agreement_Monitor_Planning_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Funding_Case_Agreement_Monitor_Promising_Practice_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Funding_Case_Agreement_Note_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Funding_Case_Agreement_Outcome_Activity_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Funding_Case_Agreement_Payment_Line_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Funding_Case_Agreement_Responsible_Party_Activity_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "Funding_Case_Agreement_Revision_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE TABLE "Funding_Case_Account_Receivable_Allocation" (
  "id" bigint DEFAULT nextval('"Funding_Case_Account_Receivable_Allocation_id_seq"'::regclass) NOT NULL,
  "egcs_fc_recovery" bigint NOT NULL,
  "egcs_fc_receivable" bigint NOT NULL,
  "egcs_fc_receivableline" bigint NOT NULL,
  "egcs_fc_fundingagreement" bigint NOT NULL,
  "egcs_fc_amount" numeric(19,2) NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "fc_uq_ar_allocation_identity" UNIQUE (id, egcs_fc_recovery),
  CONSTRAINT "fc_uq_ar_allocation_source" UNIQUE (egcs_fc_recovery, egcs_fc_receivableline),
  CONSTRAINT "Funding_Case_Account_Receivable_Allocation_pkey" PRIMARY KEY (id),
  CONSTRAINT "Funding_Case_Account_Receivable_Allocation_egcs_fc_amount_check" CHECK ((egcs_fc_amount > (0)::numeric))
);

CREATE TABLE "Funding_Case_Account_Receivable_Credit_Memo" (
  "id" bigint NOT NULL,
  "egcs_fc_fundingagreement" bigint,
  "egcs_fc_agency" bigint NOT NULL,
  "egcs_fc_pool" bigint NOT NULL,
  "egcs_fc_applicantrecipient" bigint NOT NULL,
  "egcs_fc_currency" currency_codes NOT NULL,
  "egcs_fc_number" integer NOT NULL,
  "egcs_fc_agreementnumber" text,
  "egcs_fc_receiveddate" date NOT NULL,
  "egcs_fc_amount" numeric(19,2) NOT NULL,
  "egcs_fc_receiptreference" text,
  "egcs_fc_narrative_en" text DEFAULT ''::text NOT NULL,
  "egcs_fc_narrative_fr" text DEFAULT ''::text NOT NULL,
  "egcs_fc_createdby" bigint NOT NULL,
  "egcs_fc_createdat" timestamp with time zone DEFAULT now() NOT NULL,
  "egcs_fc_status" bigint NOT NULL,
  "egcs_fc_statusagency" bigint NOT NULL,
  "egcs_fc_outcome" character varying(16) DEFAULT 'open'::character varying NOT NULL,
  "egcs_fc_postedat" timestamp with time zone,
  "egcs_fc_postingruntime" bigint,
  "egcs_fc_terminalby" bigint,
  "egcs_fc_terminalat" timestamp with time zone,
  "egcs_fc_terminalreason" text,
  "_deleted" boolean DEFAULT false NOT NULL,
  "egcs_fc_statusterminal" boolean GENERATED ALWAYS AS (
CASE
    WHEN _deleted THEN NULL::boolean
    ELSE ((egcs_fc_outcome)::text <> 'open'::text)
END) STORED,
  "egcs_fc_statusdeleted" boolean GENERATED ALWAYS AS (
CASE
    WHEN _deleted THEN NULL::boolean
    ELSE false
END) STORED,
  "egcs_fc_ledgerkind" character varying(16) DEFAULT 'pool'::character varying NOT NULL,
  CONSTRAINT "fc_uq_ar_creditmemo_number" UNIQUE (egcs_fc_fundingagreement, egcs_fc_number),
  CONSTRAINT "Funding_Case_Account_Receivable_Credit_Memo_pkey" PRIMARY KEY (id),
  CONSTRAINT "fc_chk_ar_creditmemo_posting" CHECK ((((egcs_fc_outcome)::text = 'posted'::text) = ((egcs_fc_postedat IS NOT NULL) AND (egcs_fc_postingruntime IS NOT NULL)))),
  CONSTRAINT "fc_chk_ar_creditmemo_terminal" CHECK ((((egcs_fc_outcome)::text = 'open'::text) = (egcs_fc_terminalat IS NULL))),
  CONSTRAINT "Funding_Case_Account_Receivable_Credit_egcs_fc_ledgerkind_check" CHECK (((egcs_fc_ledgerkind)::text = ANY ((ARRAY['legacy'::character varying, 'pool'::character varying])::text[]))),
  CONSTRAINT "Funding_Case_Account_Receivable_Credit_Me_egcs_fc_outcome_check" CHECK (((egcs_fc_outcome)::text = ANY ((ARRAY['open'::character varying, 'posted'::character varying, 'denied'::character varying, 'failed'::character varying, 'cancelled'::character varying])::text[]))),
  CONSTRAINT "Funding_Case_Account_Receivable_Credit_Mem_egcs_fc_amount_check" CHECK ((egcs_fc_amount > (0)::numeric)),
  CONSTRAINT "Funding_Case_Account_Receivable_Credit_Mem_egcs_fc_number_check" CHECK ((egcs_fc_number > 0))
);

CREATE TABLE "Funding_Case_Account_Receivable_Offset_Memo" (
  "id" bigint DEFAULT nextval('"Funding_Case_Account_Receivable_Offset_Memo_id_seq"'::regclass) NOT NULL,
  "egcs_fc_legacyreceivable" bigint,
  "egcs_fc_pool" bigint NOT NULL,
  "egcs_fc_amount" numeric(19,2) NOT NULL,
  "egcs_fc_createdat" timestamp with time zone DEFAULT now() NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Funding_Case_Account_Receivable_Offset_M_egcs_fc_receivable_key" UNIQUE (egcs_fc_legacyreceivable),
  CONSTRAINT "Funding_Case_Account_Receivable_Offset_Memo_pkey" PRIMARY KEY (id),
  CONSTRAINT "Funding_Case_Account_Receivable_Offset_Mem_egcs_fc_amount_check" CHECK ((egcs_fc_amount > (0)::numeric)),
  CONSTRAINT "Funding_Case_Account_Receivable_Offset_Memo__deleted_check" CHECK ((_deleted = false))
);

CREATE UNIQUE INDEX fc_uq_pool_offset_memo ON "Funding_Case_Account_Receivable_Offset_Memo" USING btree (egcs_fc_pool) WHERE (egcs_fc_legacyreceivable IS NULL);

CREATE TABLE "Funding_Case_Account_Receivable_Offset_Memo_Application" (
  "id" bigint DEFAULT nextval('"Funding_Case_Account_Receivable_Offset_Memo_Application_id_seq"'::regclass) NOT NULL,
  "egcs_fc_offsetmemo" bigint NOT NULL,
  "egcs_fc_allocation" bigint,
  "_deleted" boolean DEFAULT false NOT NULL,
  "egcs_fc_recovery" bigint,
  "egcs_fc_amount" numeric(19,2),
  CONSTRAINT "Funding_Case_Account_Receivable_Offset_M_egcs_fc_allocation_key" UNIQUE (egcs_fc_allocation),
  CONSTRAINT "Funding_Case_Account_Receivable_Offset_Memo_Application_pkey" PRIMARY KEY (id),
  CONSTRAINT "fc_chk_offset_application_basis" CHECK (((num_nonnulls(egcs_fc_allocation, egcs_fc_recovery) = 1) AND ((egcs_fc_recovery IS NULL) = (egcs_fc_amount IS NULL)))),
  CONSTRAINT "Funding_Case_Account_Receivable_Offset_Me_egcs_fc_amount_check1" CHECK ((egcs_fc_amount > (0)::numeric)),
  CONSTRAINT "Funding_Case_Account_Receivable_Offset_Memo_Appl__deleted_check" CHECK ((_deleted = false))
);

CREATE UNIQUE INDEX fc_uq_pool_memo_application ON "Funding_Case_Account_Receivable_Offset_Memo_Application" USING btree (egcs_fc_recovery) WHERE (egcs_fc_recovery IS NOT NULL);

CREATE TABLE "Funding_Case_Account_Receivable_Pool" (
  "id" bigint DEFAULT nextval('"Funding_Case_Account_Receivable_Pool_id_seq"'::regclass) NOT NULL,
  "egcs_fc_agency" bigint NOT NULL,
  "egcs_fc_applicantrecipient" bigint NOT NULL,
  "egcs_fc_currency" currency_codes NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "fc_uq_ar_pool" UNIQUE (egcs_fc_agency, egcs_fc_applicantrecipient, egcs_fc_currency),
  CONSTRAINT "fc_uq_ar_pool_identity" UNIQUE (id, egcs_fc_applicantrecipient, egcs_fc_currency),
  CONSTRAINT "Funding_Case_Account_Receivable_Pool_pkey" PRIMARY KEY (id)
);

CREATE TABLE "Funding_Case_Account_Receivable_Posting" (
  "egcs_fc_accountreceivablechartofaccount" bigint NOT NULL,
  "egcs_fc_accountreceivableaccountingdimensions" jsonb NOT NULL,
  "id" bigint DEFAULT nextval('"Funding_Case_Account_Receivable_Posting_id_seq"'::regclass) NOT NULL,
  "egcs_fc_recovery" bigint NOT NULL,
  "egcs_fc_allocation" bigint NOT NULL,
  "egcs_fc_coding" bigint NOT NULL,
  "egcs_fc_receivable" bigint NOT NULL,
  "egcs_fc_fundingagreement" bigint NOT NULL,
  "egcs_fc_commitmentline" bigint NOT NULL,
  "egcs_fc_chartofaccount" bigint NOT NULL,
  "egcs_fc_agencychartofaccount" bigint NOT NULL,
  "egcs_fc_agencyfiscalyear" bigint NOT NULL,
  "egcs_fc_periodstart" integer NOT NULL,
  "egcs_fc_periodend" integer NOT NULL,
  "egcs_fc_amount" numeric(19,2) NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "fc_uq_ar_posting_coding" UNIQUE (egcs_fc_allocation, egcs_fc_coding),
  CONSTRAINT "Funding_Case_Account_Receivable_Posting_pkey" PRIMARY KEY (id),
  CONSTRAINT "fc_chk_ar_posting_retained" CHECK ((_deleted = false)),
  CONSTRAINT "Funding_Case_Account_Receivable_Posti_egcs_fc_periodstart_check" CHECK (((egcs_fc_periodstart >= 0) AND (egcs_fc_periodstart <= 11))),
  CONSTRAINT "Funding_Case_Account_Receivable_Posting_check" CHECK ((((egcs_fc_periodend >= 0) AND (egcs_fc_periodend <= 11)) AND (egcs_fc_periodend >= egcs_fc_periodstart))),
  CONSTRAINT "Funding_Case_Account_Receivable_Posting_egcs_fc_amount_check" CHECK ((egcs_fc_amount > (0)::numeric))
);

CREATE TABLE "Funding_Case_Account_Receivable_Recovery" (
  "id" bigint DEFAULT nextval('"Funding_Case_Account_Receivable_Recovery_id_seq"'::regclass) NOT NULL,
  "egcs_fc_pool" bigint NOT NULL,
  "egcs_fc_payment" bigint,
  "egcs_fc_creditmemo" bigint,
  "egcs_fc_amount" numeric(19,2) NOT NULL,
  "egcs_fc_outcome" character varying(16) DEFAULT 'open'::character varying NOT NULL,
  "egcs_fc_createdat" timestamp with time zone DEFAULT now() NOT NULL,
  "egcs_fc_postedat" timestamp with time zone,
  "egcs_fc_postingruntime" bigint,
  "egcs_fc_releasedat" timestamp with time zone,
  "_deleted" boolean DEFAULT false NOT NULL,
  "egcs_fc_ledgerkind" character varying(16) DEFAULT 'legacy'::character varying NOT NULL,
  CONSTRAINT "Funding_Case_Account_Receivable_Recovery_pkey" PRIMARY KEY (id),
  CONSTRAINT "fc_chk_ar_recovery_author" CHECK ((num_nonnulls(egcs_fc_payment, egcs_fc_creditmemo) = 1)),
  CONSTRAINT "fc_chk_ar_recovery_posting" CHECK ((((egcs_fc_outcome)::text = 'posted'::text) = ((egcs_fc_postedat IS NOT NULL) AND (egcs_fc_postingruntime IS NOT NULL)))),
  CONSTRAINT "fc_chk_ar_recovery_release" CHECK ((((egcs_fc_outcome)::text = 'released'::text) = (egcs_fc_releasedat IS NOT NULL))),
  CONSTRAINT "fc_chk_ar_recovery_retained" CHECK ((_deleted = false)),
  CONSTRAINT "Funding_Case_Account_Receivable_Recove_egcs_fc_ledgerkind_check" CHECK (((egcs_fc_ledgerkind)::text = ANY ((ARRAY['legacy'::character varying, 'pool'::character varying])::text[]))),
  CONSTRAINT "Funding_Case_Account_Receivable_Recovery_egcs_fc_amount_check" CHECK ((egcs_fc_amount >= (0)::numeric)),
  CONSTRAINT "Funding_Case_Account_Receivable_Recovery_egcs_fc_outcome_check" CHECK (((egcs_fc_outcome)::text = ANY ((ARRAY['open'::character varying, 'posted'::character varying, 'released'::character varying])::text[])))
);

CREATE UNIQUE INDEX fc_uq_ar_creditmemo_recovery ON "Funding_Case_Account_Receivable_Recovery" USING btree (egcs_fc_creditmemo) WHERE ((egcs_fc_creditmemo IS NOT NULL) AND ((egcs_fc_outcome)::text <> 'released'::text) AND (NOT _deleted));

CREATE UNIQUE INDEX fc_uq_ar_open_pool ON "Funding_Case_Account_Receivable_Recovery" USING btree (egcs_fc_pool) WHERE (((egcs_fc_outcome)::text = 'open'::text) AND (NOT _deleted));

CREATE UNIQUE INDEX fc_uq_ar_payment_recovery ON "Funding_Case_Account_Receivable_Recovery" USING btree (egcs_fc_payment) WHERE ((egcs_fc_payment IS NOT NULL) AND ((egcs_fc_outcome)::text <> 'released'::text) AND (NOT _deleted));

CREATE TABLE "Funding_Case_Agreement_Account_Receivable" (
  "id" bigint NOT NULL,
  "egcs_fc_fundingagreement" bigint NOT NULL,
  "egcs_fc_pool" bigint NOT NULL,
  "egcs_fc_applicantrecipient" bigint NOT NULL,
  "egcs_fc_agencyfiscalyear" bigint NOT NULL,
  "egcs_fc_type" bigint NOT NULL,
  "egcs_fc_typename_en" character varying(255) NOT NULL,
  "egcs_fc_typename_fr" character varying(255) NOT NULL,
  "egcs_fc_typedescription_en" text NOT NULL,
  "egcs_fc_typedescription_fr" text NOT NULL,
  "egcs_fc_monitorrequired" boolean NOT NULL,
  "egcs_fc_advancepaymentrelated" boolean NOT NULL,
  "egcs_fc_claimrelated" boolean NOT NULL,
  "egcs_fc_fiscaloutstanding" numeric(19,2),
  "egcs_fc_recoverymethod" character varying(32),
  "egcs_fc_recipientpreference" character varying(32),
  "egcs_fc_preferenceoverride_en" text DEFAULT ''::text NOT NULL,
  "egcs_fc_preferenceoverride_fr" text DEFAULT ''::text NOT NULL,
  "egcs_fc_currency" currency_codes NOT NULL,
  "egcs_fc_number" integer NOT NULL,
  "egcs_fc_agreementnumber" text NOT NULL,
  "egcs_fc_requesteddate" date NOT NULL,
  "egcs_fc_narrative_en" text DEFAULT ''::text NOT NULL,
  "egcs_fc_narrative_fr" text DEFAULT ''::text NOT NULL,
  "egcs_fc_linkedreceivable" bigint,
  "egcs_fc_monitorfollowup" bigint,
  "egcs_fc_createdby" bigint NOT NULL,
  "egcs_fc_createdat" timestamp with time zone DEFAULT now() NOT NULL,
  "egcs_fc_status" bigint NOT NULL,
  "egcs_fc_statusagency" bigint NOT NULL,
  "egcs_fc_outcome" character varying(16) DEFAULT 'open'::character varying NOT NULL,
  "egcs_fc_postedat" timestamp with time zone,
  "egcs_fc_postingruntime" bigint,
  "egcs_fc_terminalby" bigint,
  "egcs_fc_terminalat" timestamp with time zone,
  "egcs_fc_terminalreason" text,
  "_deleted" boolean DEFAULT false NOT NULL,
  "egcs_fc_statusterminal" boolean GENERATED ALWAYS AS (
CASE
    WHEN _deleted THEN NULL::boolean
    ELSE ((egcs_fc_outcome)::text <> 'open'::text)
END) STORED,
  "egcs_fc_statusdeleted" boolean GENERATED ALWAYS AS (
CASE
    WHEN _deleted THEN NULL::boolean
    ELSE false
END) STORED,
  CONSTRAINT "fc_uq_ar_agreement" UNIQUE (id, egcs_fc_fundingagreement),
  CONSTRAINT "fc_uq_ar_number" UNIQUE (egcs_fc_fundingagreement, egcs_fc_number),
  CONSTRAINT "fc_uq_ar_pool_root" UNIQUE (id, egcs_fc_pool),
  CONSTRAINT "Funding_Case_Agreement_Account_Receivable_pkey" PRIMARY KEY (id),
  CONSTRAINT "fc_chk_ar_fiscal_context" CHECK ((egcs_fc_advancepaymentrelated OR (egcs_fc_fiscaloutstanding IS NULL))),
  CONSTRAINT "fc_chk_ar_posting" CHECK ((((egcs_fc_outcome)::text = 'posted'::text) = ((egcs_fc_postedat IS NOT NULL) AND (egcs_fc_postingruntime IS NOT NULL)))),
  CONSTRAINT "fc_chk_ar_self" CHECK ((id IS DISTINCT FROM egcs_fc_linkedreceivable)),
  CONSTRAINT "fc_chk_ar_terminal" CHECK ((((egcs_fc_outcome)::text = 'open'::text) = (egcs_fc_terminalat IS NULL))),
  CONSTRAINT "fc_chk_ar_type_source" CHECK ((egcs_fc_advancepaymentrelated <> egcs_fc_claimrelated)),
  CONSTRAINT "Funding_Case_Agreement_Accoun_egcs_fc_recipientpreference_check" CHECK (((egcs_fc_recipientpreference)::text = ANY ((ARRAY['offset'::character varying, 'direct_repayment'::character varying])::text[]))),
  CONSTRAINT "Funding_Case_Agreement_Account__egcs_fc_fiscaloutstanding_check" CHECK ((egcs_fc_fiscaloutstanding >= (0)::numeric)),
  CONSTRAINT "Funding_Case_Agreement_Account_Rec_egcs_fc_recoverymethod_check" CHECK (((egcs_fc_recoverymethod)::text = ANY ((ARRAY['offset'::character varying, 'direct_repayment'::character varying])::text[]))),
  CONSTRAINT "Funding_Case_Agreement_Account_Receivable_egcs_fc_number_check" CHECK ((egcs_fc_number > 0)),
  CONSTRAINT "Funding_Case_Agreement_Account_Receivable_egcs_fc_outcome_check" CHECK (((egcs_fc_outcome)::text = ANY ((ARRAY['open'::character varying, 'posted'::character varying, 'denied'::character varying, 'failed'::character varying, 'cancelled'::character varying])::text[])))
);

CREATE TABLE "Funding_Case_Agreement_Account_Receivable_Coding" (
  "id" bigint DEFAULT nextval('"Funding_Case_Agreement_Account_Receivable_Coding_id_seq"'::regclass) NOT NULL,
  "egcs_fc_receivableline" bigint NOT NULL,
  "egcs_fc_receivable" bigint NOT NULL,
  "egcs_fc_fundingagreement" bigint NOT NULL,
  "egcs_fc_commitmentline" bigint NOT NULL,
  "egcs_fc_chartofaccount" bigint NOT NULL,
  "egcs_fc_agencychartofaccount" bigint NOT NULL,
  "egcs_fc_agencyfiscalyear" bigint NOT NULL,
  "egcs_fc_periodstart" integer NOT NULL,
  "egcs_fc_periodend" integer NOT NULL,
  "egcs_fc_paidbasis" numeric(19,2) NOT NULL,
  "egcs_fc_sharedpaidbasis" numeric(19,2) NOT NULL,
  "egcs_fc_amount" numeric(19,2) DEFAULT 0 NOT NULL,
  "egcs_fc_accountingdimensions" jsonb NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "fc_uq_ar_coding_basis" UNIQUE (egcs_fc_receivableline, egcs_fc_commitmentline, egcs_fc_chartofaccount, egcs_fc_periodstart, egcs_fc_periodend),
  CONSTRAINT "fc_uq_ar_coding_line" UNIQUE (id, egcs_fc_receivableline),
  CONSTRAINT "Funding_Case_Agreement_Account_Receivable_Coding_pkey" PRIMARY KEY (id),
  CONSTRAINT "Funding_Case_Agreement_Account_Re_egcs_fc_sharedpaidbasis_check" CHECK ((egcs_fc_sharedpaidbasis >= (0)::numeric)),
  CONSTRAINT "Funding_Case_Agreement_Account_Recei_egcs_fc_periodstart_check1" CHECK (((egcs_fc_periodstart >= 0) AND (egcs_fc_periodstart <= 11))),
  CONSTRAINT "Funding_Case_Agreement_Account_Receivab_egcs_fc_paidbasis_check" CHECK ((egcs_fc_paidbasis > (0)::numeric)),
  CONSTRAINT "Funding_Case_Agreement_Account_Receivable_Coding_check" CHECK ((((egcs_fc_periodend >= 0) AND (egcs_fc_periodend <= 11)) AND (egcs_fc_periodend >= egcs_fc_periodstart)))
);

CREATE TABLE "Funding_Case_Agreement_Account_Receivable_Line" (
  "id" bigint DEFAULT nextval('"Funding_Case_Agreement_Account_Receivable_Line_id_seq"'::regclass) NOT NULL,
  "egcs_fc_receivable" bigint NOT NULL,
  "egcs_fc_fundingagreement" bigint NOT NULL,
  "egcs_fc_originalline" bigint,
  "egcs_fc_accountreceivablechartofaccount" bigint,
  "egcs_fc_accountreceivableaccountingdimensions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "egcs_fc_sourcekey" text NOT NULL,
  "egcs_fc_claim" bigint,
  "egcs_fc_claimline" bigint,
  "egcs_fc_reconcileline" bigint,
  "egcs_fc_payment" bigint,
  "egcs_fc_periodstart" integer NOT NULL,
  "egcs_fc_periodend" integer NOT NULL,
  "egcs_fc_sourceamount" numeric(19,2) NOT NULL,
  "egcs_fc_amount" numeric(19,2) DEFAULT 0 NOT NULL,
  "egcs_fc_evidence" jsonb NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "fc_uq_ar_line_identity" UNIQUE (id, egcs_fc_receivable, egcs_fc_fundingagreement),
  CONSTRAINT "fc_uq_ar_line_source" UNIQUE (egcs_fc_receivable, egcs_fc_sourcekey),
  CONSTRAINT "Funding_Case_Agreement_Account_Receivable_Line_pkey" PRIMARY KEY (id),
  CONSTRAINT "Funding_Case_Agreement_Account_Recei_egcs_fc_sourceamount_check" CHECK ((egcs_fc_sourceamount > (0)::numeric)),
  CONSTRAINT "Funding_Case_Agreement_Account_Receiv_egcs_fc_periodstart_check" CHECK (((egcs_fc_periodstart >= 0) AND (egcs_fc_periodstart <= 11))),
  CONSTRAINT "Funding_Case_Agreement_Account_Receivable_Line_check" CHECK ((((egcs_fc_periodend >= 0) AND (egcs_fc_periodend <= 11)) AND (egcs_fc_periodend >= egcs_fc_periodstart)))
);

CREATE TABLE "Funding_Case_Agreement_Activity" (
  "id" bigint DEFAULT nextval('"Funding_Case_Agreement_Activity_id_seq"'::regclass) NOT NULL,
  "egcs_fc_fundingagreement" bigint NOT NULL,
  "egcs_fc_activityversion" bigint NOT NULL,
  "egcs_fc_description_en" text NOT NULL,
  "egcs_fc_description_fr" text NOT NULL,
  "egcs_fc_startdate" date NOT NULL,
  "egcs_fc_enddate" date NOT NULL,
  "egcs_fc_expectedresults_en" text NOT NULL,
  "egcs_fc_expectedresults_fr" text NOT NULL,
  "egcs_fc_name_en" character varying(255) NOT NULL,
  "egcs_fc_name_fr" character varying(255) NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Funding_Case_Agreement_Activity_pkey" PRIMARY KEY (id),
  CONSTRAINT "fc_chk_activitydaterange" CHECK ((egcs_fc_enddate >= egcs_fc_startdate))
);

CREATE INDEX fc_idx_activityfundingagreement ON "Funding_Case_Agreement_Activity" USING btree (egcs_fc_activityversion, egcs_fc_fundingagreement) WHERE (_deleted = false);

CREATE TABLE "Funding_Case_Agreement_Activity_Version" (
  "id" bigint DEFAULT nextval('"Funding_Case_Agreement_Activity_Version_id_seq"'::regclass) NOT NULL,
  "egcs_fc_fundingagreement" bigint NOT NULL,
  "egcs_fc_amendment" bigint,
  "egcs_fc_sourceversion" bigint,
  "egcs_fc_iscurrent" boolean DEFAULT false NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "fc_unq_activityversionidfundingagreement" UNIQUE (id, egcs_fc_fundingagreement),
  CONSTRAINT "Funding_Case_Agreement_Activity_Version_pkey" PRIMARY KEY (id),
  CONSTRAINT "fc_chk_activityversionownership" CHECK (((egcs_fc_iscurrent AND (egcs_fc_amendment IS NULL)) OR (NOT egcs_fc_iscurrent)))
);

CREATE UNIQUE INDEX fc_idx_amendmentactivityversion ON "Funding_Case_Agreement_Activity_Version" USING btree (egcs_fc_amendment) WHERE ((_deleted = false) AND (egcs_fc_amendment IS NOT NULL));

CREATE UNIQUE INDEX fc_idx_currentactivityversion ON "Funding_Case_Agreement_Activity_Version" USING btree (egcs_fc_fundingagreement) WHERE ((_deleted = false) AND (egcs_fc_iscurrent = true));

CREATE TABLE "Funding_Case_Agreement_Address" (
  "id" bigint DEFAULT nextval('"Funding_Case_Agreement_Address_id_seq"'::regclass) NOT NULL,
  "egcs_fc_fundingagreement" bigint NOT NULL,
  "egcs_fc_addresstype" bigint NOT NULL,
  "egcs_fc_address" bigint NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Funding_Case_Agreement_Address_pkey" PRIMARY KEY (id)
);

CREATE INDEX fc_idx_addressfundingagreementaddress ON "Funding_Case_Agreement_Address" USING btree (egcs_fc_fundingagreement, egcs_fc_address) WHERE (_deleted = false);

CREATE TABLE "Funding_Case_Agreement_Amendment" (
  "id" bigint NOT NULL,
  "egcs_fc_fundingagreement" bigint NOT NULL,
  "egcs_fc_amendmentnumber" integer NOT NULL,
  "egcs_fc_name_en" character varying(255),
  "egcs_fc_name_fr" character varying(255),
  "egcs_fc_status" bigint NOT NULL,
  "egcs_fc_isopen" boolean DEFAULT true NOT NULL,
  "egcs_fc_proposedauthorizedassistancestartdate" date,
  "egcs_fc_proposedauthorizedassistanceenddate" date,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "fc_unq_amendmentidfundingagreement" UNIQUE (id, egcs_fc_fundingagreement),
  CONSTRAINT "Funding_Case_Agreement_Amendment_pkey" PRIMARY KEY (id),
  CONSTRAINT "fc_chk_amendmentauthorizedassistancedates" CHECK ((((egcs_fc_proposedauthorizedassistancestartdate IS NULL) AND (egcs_fc_proposedauthorizedassistanceenddate IS NULL)) OR ((egcs_fc_proposedauthorizedassistancestartdate IS NOT NULL) AND (egcs_fc_proposedauthorizedassistanceenddate IS NOT NULL) AND (egcs_fc_proposedauthorizedassistanceenddate >= egcs_fc_proposedauthorizedassistancestartdate)))),
  CONSTRAINT "fc_chk_amendmentname" CHECK (((NULLIF(btrim((egcs_fc_name_en)::text), ''::text) IS NOT NULL) OR (NULLIF(btrim((egcs_fc_name_fr)::text), ''::text) IS NOT NULL))),
  CONSTRAINT "fc_chk_amendmentnumberpositive" CHECK ((egcs_fc_amendmentnumber >= 1))
);

CREATE UNIQUE INDEX fc_idx_amendmentnumber ON "Funding_Case_Agreement_Amendment" USING btree (egcs_fc_fundingagreement, egcs_fc_amendmentnumber);

CREATE UNIQUE INDEX fc_idx_openamendment ON "Funding_Case_Agreement_Amendment" USING btree (egcs_fc_fundingagreement) WHERE ((_deleted = false) AND (egcs_fc_isopen = true));

CREATE TABLE "Funding_Case_Agreement_Amendment_Subtype" (
  "id" bigint DEFAULT nextval('"Funding_Case_Agreement_Amendment_Subtype_id_seq"'::regclass) NOT NULL,
  "egcs_fc_amendment" bigint NOT NULL,
  "egcs_fc_amendmentsubtype" bigint NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Funding_Case_Agreement_Amendment_Subtype_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX fc_idx_amendmentsubtype ON "Funding_Case_Agreement_Amendment_Subtype" USING btree (egcs_fc_amendment, egcs_fc_amendmentsubtype) WHERE (_deleted = false);

CREATE TABLE "Funding_Case_Agreement_Amendment_Type" (
  "id" bigint DEFAULT nextval('"Funding_Case_Agreement_Amendment_Type_id_seq"'::regclass) NOT NULL,
  "egcs_fc_amendment" bigint NOT NULL,
  "egcs_fc_amendmenttype" bigint NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Funding_Case_Agreement_Amendment_Type_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX fc_idx_amendmenttype ON "Funding_Case_Agreement_Amendment_Type" USING btree (egcs_fc_amendment, egcs_fc_amendmenttype) WHERE (_deleted = false);

CREATE TABLE "Funding_Case_Agreement_Applicant_Recipient" (
  "id" bigint DEFAULT nextval('"Funding_Case_Agreement_Applicant_Recipient_id_seq"'::regclass) NOT NULL,
  "egcs_fc_fundingagreement" bigint NOT NULL,
  "egcs_fc_applicantrecipient" bigint NOT NULL,
  "egcs_fc_applicantrecipientsubtype" bigint,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Funding_Case_Agreement_Applicant_Recipient_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX fc_idx_applicantrecipientapplicantrecipientfundingagreement ON "Funding_Case_Agreement_Applicant_Recipient" USING btree (egcs_fc_applicantrecipient, egcs_fc_fundingagreement) WHERE (_deleted = false);

CREATE TABLE "Funding_Case_Agreement_Approval_Submission" (
  "id" bigint DEFAULT nextval('"Funding_Case_Agreement_Approval_Submission_id_seq"'::regclass) NOT NULL,
  "egcs_fc_fundingagreement" bigint NOT NULL,
  "egcs_fc_amendment" bigint,
  "egcs_fc_workflowrun" bigint NOT NULL,
  "egcs_fc_snapshotschemaversion" integer NOT NULL,
  "egcs_fc_packet" jsonb NOT NULL,
  "egcs_fc_canonicalhash" character varying(64) NOT NULL,
  "egcs_fc_submittedat" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "Funding_Case_Agreement_Approval_Submiss_egcs_fc_workflowrun_key" UNIQUE (egcs_fc_workflowrun),
  CONSTRAINT "Funding_Case_Agreement_Approval_Submission_pkey" PRIMARY KEY (id),
  CONSTRAINT "fc_chk_approvalsubmissionhash" CHECK (((egcs_fc_canonicalhash)::text ~ '^[0-9a-f]{64}$'::text)),
  CONSTRAINT "fc_chk_approvalsubmissionversion" CHECK ((egcs_fc_snapshotschemaversion = 1))
);

CREATE TABLE "Funding_Case_Agreement_Budget_Fiscal_Year" (
  "id" bigint DEFAULT nextval('"Funding_Case_Agreement_Budget_Fiscal_Year_id_seq"'::regclass) NOT NULL,
  "egcs_fc_fundingagreement" bigint NOT NULL,
  "egcs_fc_budgetversion" bigint NOT NULL,
  "egcs_fc_originalbudgetfiscalyear" bigint,
  "egcs_fc_fiscalyear" bigint NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "fc_unq_budgetfiscalyearidfundingagreement" UNIQUE (id, egcs_fc_fundingagreement),
  CONSTRAINT "Funding_Case_Agreement_Budget_Fiscal_Year_pkey" PRIMARY KEY (id),
  CONSTRAINT "fc_chk_budgetfiscalyearoriginalnotself" CHECK (((egcs_fc_originalbudgetfiscalyear IS NULL) OR (egcs_fc_originalbudgetfiscalyear <> id)))
);

CREATE UNIQUE INDEX fc_idx_budgetfiscalyearfundingagreementfiscalyear ON "Funding_Case_Agreement_Budget_Fiscal_Year" USING btree (egcs_fc_budgetversion, egcs_fc_fiscalyear) WHERE (_deleted = false);

CREATE UNIQUE INDEX fc_idx_budgetfiscalyearversionidentity ON "Funding_Case_Agreement_Budget_Fiscal_Year" USING btree (egcs_fc_budgetversion, COALESCE(egcs_fc_originalbudgetfiscalyear, id)) WHERE (_deleted = false);

CREATE TABLE "Funding_Case_Agreement_Budget_Line_Item" (
  "id" bigint DEFAULT nextval('"Funding_Case_Agreement_Budget_Line_Item_id_seq"'::regclass) NOT NULL,
  "egcs_fc_fundingagreement" bigint NOT NULL,
  "egcs_fc_budgetversion" bigint NOT NULL,
  "egcs_fc_originalbudgetlineitem" bigint,
  "egcs_fc_fundingagreementbudgetfiscalyear" bigint NOT NULL,
  "egcs_fc_organizationcostcategory" bigint NOT NULL,
  "egcs_fc_costsubsection" character varying(255) NOT NULL,
  "egcs_fc_description" text NOT NULL,
  "egcs_fc_totalamount" numeric(19,2) NOT NULL,
  "egcs_fc_programfunding" numeric(19,2) NOT NULL,
  "egcs_fc_currency" currency_codes NOT NULL,
  "egcs_fc_calculationmode" character varying(16) DEFAULT 'manual'::character varying NOT NULL,
  "egcs_fc_sourcecategory" bigint,
  "egcs_fc_percentage" numeric(5,2),
  "egcs_fc_allowpercentageoverride" boolean DEFAULT false NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "fc_unq_budgetlineitemidfundingagreement" UNIQUE (id, egcs_fc_fundingagreement),
  CONSTRAINT "Funding_Case_Agreement_Budget_Line_Item_pkey" PRIMARY KEY (id),
  CONSTRAINT "fc_chk_budgetlineitemoriginalnotself" CHECK (((egcs_fc_originalbudgetlineitem IS NULL) OR (egcs_fc_originalbudgetlineitem <> id))),
  CONSTRAINT "fc_chk_lineitemcalculation" CHECK (((((egcs_fc_calculationmode)::text = 'manual'::text) AND (egcs_fc_sourcecategory IS NULL) AND (egcs_fc_percentage IS NULL) AND (NOT egcs_fc_allowpercentageoverride)) OR (((egcs_fc_calculationmode)::text = ANY ((ARRAY['category'::character varying, 'all_other'::character varying])::text[])) AND (egcs_fc_percentage IS NOT NULL) AND ((egcs_fc_percentage >= (0)::numeric) AND (egcs_fc_percentage <= (100)::numeric)) AND ((((egcs_fc_calculationmode)::text = 'category'::text) AND (egcs_fc_sourcecategory IS NOT NULL)) OR (((egcs_fc_calculationmode)::text = 'all_other'::text) AND (egcs_fc_sourcecategory IS NULL))))))
);

CREATE UNIQUE INDEX fc_idx_budgetlineitemversionidentity ON "Funding_Case_Agreement_Budget_Line_Item" USING btree (egcs_fc_budgetversion, COALESCE(egcs_fc_originalbudgetlineitem, id)) WHERE (_deleted = false);

CREATE INDEX fc_idx_uniquebudgetline ON "Funding_Case_Agreement_Budget_Line_Item" USING btree (egcs_fc_fundingagreementbudgetfiscalyear, egcs_fc_organizationcostcategory) WHERE (_deleted = false);

CREATE UNIQUE INDEX fc_unq_budget_all_other ON "Funding_Case_Agreement_Budget_Line_Item" USING btree (egcs_fc_budgetversion, egcs_fc_fundingagreementbudgetfiscalyear, egcs_fc_currency) WHERE ((NOT _deleted) AND ((egcs_fc_calculationmode)::text = 'all_other'::text));

CREATE TABLE "Funding_Case_Agreement_Budget_Line_Item_Funding" (
  "id" bigint DEFAULT nextval('"Funding_Case_Agreement_Budget_Line_Item_Funding_id_seq"'::regclass) NOT NULL,
  "egcs_fc_budgetlineitem" bigint NOT NULL,
  "egcs_fc_fundingsubtype" bigint NOT NULL,
  "egcs_fc_amount" numeric(19,2) NOT NULL,
  "egcs_fc_description_en" character varying(255),
  "egcs_fc_description_fr" character varying(255),
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Funding_Case_Agreement_Budget_Line_Item_Funding_pkey" PRIMARY KEY (id),
  CONSTRAINT "Funding_Case_Agreement_Budget_Line_Item_Fu_egcs_fc_amount_check" CHECK ((egcs_fc_amount >= (0)::numeric))
);

CREATE UNIQUE INDEX fc_uq_budget_line_funding_active ON "Funding_Case_Agreement_Budget_Line_Item_Funding" USING btree (egcs_fc_budgetlineitem, egcs_fc_fundingsubtype) WHERE (_deleted = false);

CREATE TABLE "Funding_Case_Agreement_Budget_Version" (
  "id" bigint DEFAULT nextval('"Funding_Case_Agreement_Budget_Version_id_seq"'::regclass) NOT NULL,
  "egcs_fc_fundingagreement" bigint NOT NULL,
  "egcs_fc_amendment" bigint,
  "egcs_fc_sourceversion" bigint,
  "egcs_fc_iscurrent" boolean DEFAULT false NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "fc_unq_budgetversionidfundingagreement" UNIQUE (id, egcs_fc_fundingagreement),
  CONSTRAINT "Funding_Case_Agreement_Budget_Version_pkey" PRIMARY KEY (id),
  CONSTRAINT "fc_chk_budgetversionownership" CHECK (((egcs_fc_iscurrent AND (egcs_fc_amendment IS NULL)) OR (NOT egcs_fc_iscurrent)))
);

CREATE UNIQUE INDEX fc_idx_amendmentbudgetversion ON "Funding_Case_Agreement_Budget_Version" USING btree (egcs_fc_amendment) WHERE ((_deleted = false) AND (egcs_fc_amendment IS NOT NULL));

CREATE UNIQUE INDEX fc_idx_currentbudgetversion ON "Funding_Case_Agreement_Budget_Version" USING btree (egcs_fc_fundingagreement) WHERE ((_deleted = false) AND (egcs_fc_iscurrent = true));

CREATE TABLE "Funding_Case_Agreement_Claim" (
  "id" bigint NOT NULL,
  "egcs_fc_applicantrecipient" bigint,
  "egcs_fc_fundingagreement" bigint NOT NULL,
  "egcs_fc_fiscalyear" bigint NOT NULL,
  "egcs_fc_isfinalforyear" boolean NOT NULL,
  "egcs_fc_periodend" smallint NOT NULL,
  "egcs_fc_periodstart" smallint NOT NULL,
  "egcs_fc_receiveddate" timestamp with time zone NOT NULL,
  "egcs_fc_gcformssubmissionuuid" character varying(80),
  "egcs_fc_status" bigint NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "fc_unq_claimidfundingagreement" UNIQUE (id, egcs_fc_fundingagreement),
  CONSTRAINT "Funding_Case_Agreement_Claim_pkey" PRIMARY KEY (id),
  CONSTRAINT "fc_chk_claimperiodend" CHECK (((egcs_fc_periodend >= 0) AND (egcs_fc_periodend <= 11))),
  CONSTRAINT "fc_chk_claimperiodrange" CHECK ((egcs_fc_periodend >= egcs_fc_periodstart)),
  CONSTRAINT "fc_chk_claimperiodstart" CHECK (((egcs_fc_periodstart >= 0) AND (egcs_fc_periodstart <= 11)))
);

CREATE UNIQUE INDEX fc_idx_claim_gcforms_submission_uuid ON "Funding_Case_Agreement_Claim" USING btree (egcs_fc_gcformssubmissionuuid) WHERE ((_deleted = false) AND (egcs_fc_gcformssubmissionuuid IS NOT NULL));

CREATE INDEX fc_idx_claimfundingagreementfiscalyear ON "Funding_Case_Agreement_Claim" USING btree (egcs_fc_fundingagreement, egcs_fc_fiscalyear) WHERE (_deleted = false);

CREATE TABLE "Funding_Case_Agreement_Claim_Line_Item" (
  "id" bigint DEFAULT nextval('"Funding_Case_Agreement_Claim_Line_Item_id_seq"'::regclass) NOT NULL,
  "egcs_fc_fundingagreementclaim" bigint NOT NULL,
  "egcs_fc_fundingagreement" bigint NOT NULL,
  "egcs_fc_fundingagreementbudgetlineitem" bigint,
  "egcs_fc_submittedcostcategory" text,
  "egcs_fc_submittedcostsubsection" text,
  "egcs_fc_submittedlineitem" text,
  "egcs_fc_description" text NOT NULL,
  "egcs_fc_amount" numeric(19,2) NOT NULL,
  "egcs_fc_currency" currency_codes NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  "egcs_fc_totalamount" numeric(19,2) NOT NULL,
  CONSTRAINT "fc_unq_claimlineidclaim" UNIQUE (id, egcs_fc_fundingagreementclaim),
  CONSTRAINT "Funding_Case_Agreement_Claim_Line_Item_pkey" PRIMARY KEY (id)
);

CREATE INDEX fc_idx_claimlineitem ON "Funding_Case_Agreement_Claim_Line_Item" USING btree (egcs_fc_fundingagreementclaim, egcs_fc_fundingagreementbudgetlineitem) WHERE ((_deleted = false) AND (egcs_fc_fundingagreementbudgetlineitem IS NOT NULL));

CREATE TABLE "Funding_Case_Agreement_Claim_Line_Item_Funding" (
  "id" bigint DEFAULT nextval('"Funding_Case_Agreement_Claim_Line_Item_Funding_id_seq"'::regclass) NOT NULL,
  "egcs_fc_claimlineitem" bigint NOT NULL,
  "egcs_fc_fundingsubtype" bigint NOT NULL,
  "egcs_fc_amount" numeric(19,2) NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Funding_Case_Agreement_Claim_Line_Item_Funding_pkey" PRIMARY KEY (id),
  CONSTRAINT "Funding_Case_Agreement_Claim_Line_Item_Fun_egcs_fc_amount_check" CHECK ((egcs_fc_amount >= (0)::numeric))
);

CREATE UNIQUE INDEX fc_uq_claim_line_funding_active ON "Funding_Case_Agreement_Claim_Line_Item_Funding" USING btree (egcs_fc_claimlineitem, egcs_fc_fundingsubtype) WHERE (_deleted = false);

CREATE TABLE "Funding_Case_Agreement_Claim_Reconcile" (
  "id" bigint NOT NULL,
  "egcs_fc_fundingagreementclaim" bigint NOT NULL,
  "egcs_fc_user" bigint NOT NULL,
  "egcs_fc_status" bigint NOT NULL,
  "egcs_fc_isfinal" boolean NOT NULL,
  "egcs_fc_isopen" boolean DEFAULT true NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "fc_unq_claimreconcileidclaim" UNIQUE (id, egcs_fc_fundingagreementclaim),
  CONSTRAINT "Funding_Case_Agreement_Claim_Reconcile_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX fc_idx_uniquefinalclaimreconcile ON "Funding_Case_Agreement_Claim_Reconcile" USING btree (egcs_fc_fundingagreementclaim) WHERE ((_deleted = false) AND (egcs_fc_isfinal = true) AND (egcs_fc_isopen = true));

CREATE TABLE "Funding_Case_Agreement_Claim_Reconcile_Line_Item" (
  "id" bigint DEFAULT nextval('"Funding_Case_Agreement_Claim_Reconcile_Line_Item_id_seq"'::regclass) NOT NULL,
  "egcs_fc_fundingagreementclaimreconcile" bigint NOT NULL,
  "egcs_fc_fundingagreementclaim" bigint NOT NULL,
  "egcs_fc_lineitem" bigint NOT NULL,
  "egcs_fc_reconciled" numeric(19,2) NOT NULL,
  "egcs_fc_sampled" numeric(19,2),
  "egcs_fc_rationale" text,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Funding_Case_Agreement_Claim_Reconcile_Line_Item_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX fc_idx_uniquereconcilelineitem ON "Funding_Case_Agreement_Claim_Reconcile_Line_Item" USING btree (egcs_fc_fundingagreementclaimreconcile, egcs_fc_lineitem) WHERE (_deleted = false);

CREATE TABLE "Funding_Case_Agreement_Closeout" (
  "id" bigint NOT NULL,
  "egcs_fc_fundingagreement" bigint NOT NULL,
  "egcs_fc_closeoutnumber" integer NOT NULL,
  "egcs_fc_status" bigint NOT NULL,
  "egcs_fc_isopen" boolean DEFAULT true NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "fc_unq_closeoutidagreement" UNIQUE (id, egcs_fc_fundingagreement),
  CONSTRAINT "Funding_Case_Agreement_Closeout_pkey" PRIMARY KEY (id),
  CONSTRAINT "fc_chk_closeoutnumberpositive" CHECK ((egcs_fc_closeoutnumber >= 1))
);

CREATE UNIQUE INDEX fc_idx_closeoutnumber ON "Funding_Case_Agreement_Closeout" USING btree (egcs_fc_fundingagreement, egcs_fc_closeoutnumber);

CREATE UNIQUE INDEX fc_idx_opencloseout ON "Funding_Case_Agreement_Closeout" USING btree (egcs_fc_fundingagreement) WHERE ((_deleted = false) AND (egcs_fc_isopen = true));

CREATE TABLE "Funding_Case_Agreement_Closeout_Snapshot" (
  "id" bigint DEFAULT nextval('"Funding_Case_Agreement_Closeout_Snapshot_id_seq"'::regclass) NOT NULL,
  "egcs_fc_fundingagreement" bigint NOT NULL,
  "egcs_fc_closeout" bigint NOT NULL,
  "egcs_fc_workflowrun" bigint NOT NULL,
  "egcs_fc_snapshotschemaversion" integer NOT NULL,
  "egcs_fc_packet" jsonb NOT NULL,
  "egcs_fc_canonicalhash" character varying(64) NOT NULL,
  "egcs_fc_capturedat" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "Funding_Case_Agreement_Closeout_Snapsho_egcs_fc_workflowrun_key" UNIQUE (egcs_fc_workflowrun),
  CONSTRAINT "Funding_Case_Agreement_Closeout_Snapshot_pkey" PRIMARY KEY (id),
  CONSTRAINT "fc_chk_closeoutsnapshothash" CHECK (((egcs_fc_canonicalhash)::text ~ '^[0-9a-f]{64}$'::text)),
  CONSTRAINT "fc_chk_closeoutsnapshotversion" CHECK ((egcs_fc_snapshotschemaversion = 1))
);

CREATE TABLE "Funding_Case_Agreement_Commitment" (
  "id" bigint NOT NULL,
  "egcs_fc_fundingagreement" bigint NOT NULL,
  "egcs_fc_transferpaymentstream" bigint NOT NULL,
  "egcs_fc_type" bigint NOT NULL,
  "egcs_fc_currency" currency_codes DEFAULT 'cad'::currency_codes NOT NULL,
  "egcs_fc_status" bigint NOT NULL,
  "egcs_fc_financialsystemnumber" bigint,
  "egcs_fc_active" boolean DEFAULT false NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "fc_unq_commitmentidfundingagreement" UNIQUE (id, egcs_fc_fundingagreement),
  CONSTRAINT "Funding_Case_Agreement_Commitment_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX fc_idx_activecommitmentfundingagreement ON "Funding_Case_Agreement_Commitment" USING btree (egcs_fc_fundingagreement, egcs_fc_type, egcs_fc_currency) WHERE ((_deleted = false) AND (egcs_fc_active = true));

CREATE INDEX fc_idx_commitmentfundingagreement ON "Funding_Case_Agreement_Commitment" USING btree (egcs_fc_fundingagreement) WHERE (_deleted = false);

CREATE TABLE "Funding_Case_Agreement_Commitment_Line" (
  "id" bigint DEFAULT nextval('"Funding_Case_Agreement_Commitment_Line_id_seq"'::regclass) NOT NULL,
  "egcs_fc_commitment" bigint NOT NULL,
  "egcs_fc_fundingagreement" bigint NOT NULL,
  "egcs_fc_transferpaymentstream" bigint NOT NULL,
  "egcs_fc_commitmentlinenumber" smallint NOT NULL,
  "egcs_fc_transferpaymentstreamchartofaccount" bigint NOT NULL,
  "egcs_fc_amount" numeric(19,2) NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "fc_unq_commitmentlineidcommitment" UNIQUE (id, egcs_fc_commitment),
  CONSTRAINT "Funding_Case_Agreement_Commitment_Line_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX fc_idx_uniquecommitmentline ON "Funding_Case_Agreement_Commitment_Line" USING btree (egcs_fc_commitment, egcs_fc_commitmentlinenumber, egcs_fc_transferpaymentstreamchartofaccount) WHERE (_deleted = false);

CREATE TABLE "Funding_Case_Agreement_Correction" (
  "id" bigint NOT NULL,
  "egcs_fc_fundingagreement" bigint NOT NULL,
  "egcs_fc_commitment" bigint NOT NULL,
  "egcs_fc_number" integer NOT NULL,
  "egcs_fc_agreementnumber" text NOT NULL,
  "egcs_fc_currency" currency_codes NOT NULL,
  "egcs_fc_requesteddate" date NOT NULL,
  "egcs_fc_narrative_en" text DEFAULT ''::text NOT NULL,
  "egcs_fc_narrative_fr" text DEFAULT ''::text NOT NULL,
  "egcs_fc_linkedcorrection" bigint,
  "egcs_fc_createdby" bigint NOT NULL,
  "egcs_fc_createdat" timestamp with time zone DEFAULT now() NOT NULL,
  "egcs_fc_status" bigint NOT NULL,
  "egcs_fc_statusagency" bigint NOT NULL,
  "egcs_fc_outcome" character varying(16) DEFAULT 'open'::character varying NOT NULL,
  "egcs_fc_postedat" timestamp with time zone,
  "egcs_fc_postingruntime" bigint,
  "egcs_fc_terminalby" bigint,
  "egcs_fc_terminalat" timestamp with time zone,
  "egcs_fc_terminalreason" text,
  "_deleted" boolean DEFAULT false NOT NULL,
  "egcs_fc_statusterminal" boolean GENERATED ALWAYS AS (
CASE
    WHEN _deleted THEN NULL::boolean
    ELSE ((egcs_fc_outcome)::text <> 'open'::text)
END) STORED,
  "egcs_fc_statusdeleted" boolean GENERATED ALWAYS AS (
CASE
    WHEN _deleted THEN NULL::boolean
    ELSE false
END) STORED,
  CONSTRAINT "fc_uq_correction_agreement" UNIQUE (id, egcs_fc_fundingagreement),
  CONSTRAINT "fc_uq_correction_number" UNIQUE (egcs_fc_fundingagreement, egcs_fc_number),
  CONSTRAINT "Funding_Case_Agreement_Correction_pkey" PRIMARY KEY (id),
  CONSTRAINT "fc_chk_correction_posting" CHECK ((((egcs_fc_outcome)::text = 'posted'::text) = ((egcs_fc_postedat IS NOT NULL) AND (egcs_fc_postingruntime IS NOT NULL)))),
  CONSTRAINT "fc_chk_correction_self" CHECK ((id IS DISTINCT FROM egcs_fc_linkedcorrection)),
  CONSTRAINT "fc_chk_correction_terminal" CHECK ((((egcs_fc_outcome)::text = 'open'::text) = (egcs_fc_terminalat IS NULL))),
  CONSTRAINT "Funding_Case_Agreement_Correction_egcs_fc_number_check" CHECK ((egcs_fc_number > 0)),
  CONSTRAINT "Funding_Case_Agreement_Correction_egcs_fc_outcome_check" CHECK (((egcs_fc_outcome)::text = ANY ((ARRAY['open'::character varying, 'posted'::character varying, 'denied'::character varying, 'failed'::character varying, 'cancelled'::character varying])::text[])))
);

CREATE UNIQUE INDEX fc_uq_correction_open ON "Funding_Case_Agreement_Correction" USING btree (egcs_fc_fundingagreement) WHERE ((_deleted = false) AND ((egcs_fc_outcome)::text = 'open'::text));

CREATE TABLE "Funding_Case_Agreement_Correction_Adjustment" (
  "id" bigint DEFAULT nextval('"Funding_Case_Agreement_Correction_Adjustment_id_seq"'::regclass) NOT NULL,
  "egcs_fc_correction" bigint NOT NULL,
  "egcs_fc_fundingagreement" bigint NOT NULL,
  "egcs_fc_correctionline" bigint NOT NULL,
  "egcs_fc_commitmentline" bigint NOT NULL,
  "egcs_fc_chartofaccount" bigint NOT NULL,
  "egcs_fc_agencyfiscalyear" bigint NOT NULL,
  "egcs_fc_amount" numeric(19,2) NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Funding_Case_Agreement_Correction_Adjustment_pkey" PRIMARY KEY (id),
  CONSTRAINT "Funding_Case_Agreement_Correction_Adjustme_egcs_fc_amount_check" CHECK ((egcs_fc_amount <> (0)::numeric))
);

CREATE INDEX fc_idx_correction_adjustment_agreement ON "Funding_Case_Agreement_Correction_Adjustment" USING btree (egcs_fc_fundingagreement, egcs_fc_agencyfiscalyear) WHERE (_deleted = false);

CREATE UNIQUE INDEX fc_uq_correction_adjustment_active ON "Funding_Case_Agreement_Correction_Adjustment" USING btree (egcs_fc_correctionline) WHERE (_deleted = false);

CREATE TABLE "Funding_Case_Agreement_Correction_Line" (
  "id" bigint DEFAULT nextval('"Funding_Case_Agreement_Correction_Line_id_seq"'::regclass) NOT NULL,
  "egcs_fc_correction" bigint NOT NULL,
  "egcs_fc_fundingagreement" bigint NOT NULL,
  "egcs_fc_commitmentline" bigint NOT NULL,
  "egcs_fc_commitmentlinenumber" integer NOT NULL,
  "egcs_fc_chartofaccount" bigint NOT NULL,
  "egcs_fc_agencyfiscalyear" bigint NOT NULL,
  "egcs_fc_fiscalyeardisplay" text NOT NULL,
  "egcs_fc_accountingdimensions" jsonb NOT NULL,
  "egcs_fc_commitmentamount" numeric(19,2) NOT NULL,
  "egcs_fc_originalpaid" numeric(19,2) NOT NULL,
  "egcs_fc_jveffect" numeric(19,2) NOT NULL,
  "egcs_fc_priorcorrections" numeric(19,2) NOT NULL,
  "egcs_fc_adjustment" numeric(19,2) DEFAULT 0 NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  "egcs_fc_arrecoveries" numeric(19,2) DEFAULT 0 NOT NULL,
  CONSTRAINT "fc_uq_correction_line_root" UNIQUE (id, egcs_fc_correction, egcs_fc_fundingagreement),
  CONSTRAINT "Funding_Case_Agreement_Correction_Line_pkey" PRIMARY KEY (id),
  CONSTRAINT "Funding_Case_Agreement_Corre_egcs_fc_accountingdimensions_check" CHECK ((jsonb_typeof(egcs_fc_accountingdimensions) = 'array'::text)),
  CONSTRAINT "Funding_Case_Agreement_Correctio_egcs_fc_commitmentamount_check" CHECK ((egcs_fc_commitmentamount >= (0)::numeric)),
  CONSTRAINT "Funding_Case_Agreement_Correction_Li_egcs_fc_arrecoveries_check" CHECK ((egcs_fc_arrecoveries <= (0)::numeric)),
  CONSTRAINT "Funding_Case_Agreement_Correction_Li_egcs_fc_originalpaid_check" CHECK ((egcs_fc_originalpaid >= (0)::numeric))
);

CREATE UNIQUE INDEX fc_uq_correction_line_active ON "Funding_Case_Agreement_Correction_Line" USING btree (egcs_fc_correction, egcs_fc_commitmentline) WHERE (_deleted = false);

CREATE TABLE "Funding_Case_Agreement_Correction_Notification" (
  "id" bigint DEFAULT nextval('"Funding_Case_Agreement_Correction_Notification_id_seq"'::regclass) NOT NULL,
  "egcs_fc_correction" bigint NOT NULL,
  "egcs_fc_user" bigint NOT NULL,
  "egcs_fc_outcome" character varying(16) NOT NULL,
  "egcs_fc_recordedat" timestamp with time zone DEFAULT now() NOT NULL,
  "egcs_fc_runtime" bigint,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "fc_uq_correction_notification" UNIQUE (egcs_fc_correction, egcs_fc_user),
  CONSTRAINT "Funding_Case_Agreement_Correction_Notification_pkey" PRIMARY KEY (id),
  CONSTRAINT "Funding_Case_Agreement_Correction_Notific_egcs_fc_outcome_check" CHECK (((egcs_fc_outcome)::text = ANY ((ARRAY['posted'::character varying, 'denied'::character varying, 'failed'::character varying, 'cancelled'::character varying])::text[])))
);

CREATE TABLE "Funding_Case_Agreement_Correction_Source" (
  "id" bigint DEFAULT nextval('"Funding_Case_Agreement_Correction_Source_id_seq"'::regclass) NOT NULL,
  "egcs_fc_correction" bigint NOT NULL,
  "egcs_fc_fundingagreement" bigint NOT NULL,
  "egcs_fc_payment" bigint NOT NULL,
  "egcs_fc_evidence" jsonb NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Funding_Case_Agreement_Correction_Source_pkey" PRIMARY KEY (id),
  CONSTRAINT "Funding_Case_Agreement_Correction_Source_egcs_fc_evidence_check" CHECK (((jsonb_typeof(egcs_fc_evidence) = 'object'::text) AND (egcs_fc_evidence ? 'header'::text) AND (jsonb_typeof((egcs_fc_evidence -> 'allocations'::text)) = 'array'::text)))
);

CREATE UNIQUE INDEX fc_uq_correction_source_active ON "Funding_Case_Agreement_Correction_Source" USING btree (egcs_fc_correction, egcs_fc_payment) WHERE (_deleted = false);

CREATE TABLE "Funding_Case_Agreement_Forecast" (
  "id" bigint NOT NULL,
  "egcs_fc_fundingagreement" bigint NOT NULL,
  "egcs_fc_fiscalyear" bigint NOT NULL,
  "egcs_fc_status" bigint NOT NULL,
  "egcs_fc_active" boolean DEFAULT false NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "fc_unq_forecastidfundingagreement" UNIQUE (id, egcs_fc_fundingagreement),
  CONSTRAINT "Funding_Case_Agreement_Forecast_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX fc_idx_activeforecastfiscalyearfundingagreement ON "Funding_Case_Agreement_Forecast" USING btree (egcs_fc_fiscalyear, egcs_fc_fundingagreement) WHERE ((_deleted = false) AND (egcs_fc_active = true));

CREATE INDEX fc_idx_forecastfiscalyearfundingagreement ON "Funding_Case_Agreement_Forecast" USING btree (egcs_fc_fiscalyear, egcs_fc_fundingagreement) WHERE (_deleted = false);

CREATE TABLE "Funding_Case_Agreement_Forecast_Line_Item" (
  "id" bigint DEFAULT nextval('"Funding_Case_Agreement_Forecast_Line_Item_id_seq"'::regclass) NOT NULL,
  "egcs_fc_agreementforecast" bigint NOT NULL,
  "egcs_fc_fundingagreement" bigint NOT NULL,
  "egcs_fc_fundingagreementbudgetlineitem" bigint NOT NULL,
  "egcs_fc_month" smallint NOT NULL,
  "egcs_fc_amount" numeric(19,2) NOT NULL,
  "egcs_fc_currency" currency_codes NOT NULL,
  "egcs_fc_version" bigint NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  "egcs_fc_totalamount" numeric(19,2) NOT NULL,
  CONSTRAINT "Funding_Case_Agreement_Forecast_Line_Item_pkey" PRIMARY KEY (id),
  CONSTRAINT "fc_chk_forecastlineitemmonth" CHECK (((egcs_fc_month >= 0) AND (egcs_fc_month <= 11))),
  CONSTRAINT "fc_chk_forecastlineitemversion" CHECK ((egcs_fc_version >= 0))
);

CREATE INDEX fc_idx_forecastlineitem ON "Funding_Case_Agreement_Forecast_Line_Item" USING btree (egcs_fc_agreementforecast, egcs_fc_fundingagreementbudgetlineitem) WHERE (_deleted = false);

CREATE TABLE "Funding_Case_Agreement_Forecast_Line_Item_Funding" (
  "id" bigint DEFAULT nextval('"Funding_Case_Agreement_Forecast_Line_Item_Funding_id_seq"'::regclass) NOT NULL,
  "egcs_fc_forecastlineitem" bigint NOT NULL,
  "egcs_fc_fundingsubtype" bigint NOT NULL,
  "egcs_fc_amount" numeric(19,2) NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Funding_Case_Agreement_Forecast_Line_Item_Funding_pkey" PRIMARY KEY (id),
  CONSTRAINT "Funding_Case_Agreement_Forecast_Line_Item__egcs_fc_amount_check" CHECK ((egcs_fc_amount >= (0)::numeric))
);

CREATE UNIQUE INDEX fc_uq_forecast_line_funding_active ON "Funding_Case_Agreement_Forecast_Line_Item_Funding" USING btree (egcs_fc_forecastlineitem, egcs_fc_fundingsubtype) WHERE (_deleted = false);

CREATE TABLE "Funding_Case_Agreement_Generated_Document" (
  "id" bigint DEFAULT nextval('"Funding_Case_Agreement_Generated_Document_id_seq"'::regclass) NOT NULL,
  "egcs_fc_fundingagreement" bigint NOT NULL,
  "egcs_fc_transferpaymentstream" bigint NOT NULL,
  "egcs_fc_closeout" bigint,
  "egcs_fc_documenttemplate" bigint NOT NULL,
  "egcs_fc_generatedattachment" bigint NOT NULL,
  "egcs_fc_language" "Language_Preference" NOT NULL,
  "egcs_fc_name_en" character varying(255) NOT NULL,
  "egcs_fc_name_fr" character varying(255) NOT NULL,
  "egcs_fc_outputformat" character varying(16) NOT NULL,
  "egcs_fc_generatedat" timestamp with time zone NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  "egcs_fc_amendment" bigint,
  CONSTRAINT "Funding_Case_Agreement_Generated_Document_pkey" PRIMARY KEY (id),
  CONSTRAINT "fc_chk_generateddocument_output" CHECK (((egcs_fc_outputformat)::text = ANY ((ARRAY['docx'::character varying, 'html'::character varying, 'pdf'::character varying])::text[]))),
  CONSTRAINT "fc_chk_generateddocumentscope" CHECK ((num_nonnulls(egcs_fc_closeout, egcs_fc_amendment) <= 1))
);

CREATE INDEX fc_idx_generateddocumentagreement ON "Funding_Case_Agreement_Generated_Document" USING btree (egcs_fc_fundingagreement, egcs_fc_generatedat DESC, id) WHERE (_deleted = false);

CREATE INDEX fc_idx_generateddocumentamendment ON "Funding_Case_Agreement_Generated_Document" USING btree (egcs_fc_amendment, egcs_fc_generatedat DESC, id) WHERE ((NOT _deleted) AND (egcs_fc_amendment IS NOT NULL));

CREATE TABLE "Funding_Case_Agreement_Journal_Voucher" (
  "id" bigint NOT NULL,
  "egcs_fc_fundingagreement" bigint NOT NULL,
  "egcs_fc_payment" bigint NOT NULL,
  "egcs_fc_fiscalyear" bigint NOT NULL,
  "egcs_fc_agencyfiscalyear" bigint NOT NULL,
  "egcs_fc_currency" currency_codes NOT NULL,
  "egcs_fc_number" integer NOT NULL,
  "egcs_fc_agreementnumber" text NOT NULL,
  "egcs_fc_fiscalyeardisplay" text NOT NULL,
  "egcs_fc_requesteddate" date NOT NULL,
  "egcs_fc_narrative_en" text DEFAULT ''::text NOT NULL,
  "egcs_fc_narrative_fr" text DEFAULT ''::text NOT NULL,
  "egcs_fc_status" bigint NOT NULL,
  "egcs_fc_reversalof" bigint,
  "egcs_fc_replacementof" bigint,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "fc_uq_jv_number" UNIQUE (egcs_fc_fundingagreement, egcs_fc_number),
  CONSTRAINT "fc_uq_jv_payment" UNIQUE (id, egcs_fc_payment),
  CONSTRAINT "Funding_Case_Agreement_Journal_Voucher_pkey" PRIMARY KEY (id),
  CONSTRAINT "fc_chk_jv_links" CHECK (((egcs_fc_reversalof IS NULL) OR (egcs_fc_replacementof IS NULL))),
  CONSTRAINT "fc_chk_jv_self" CHECK (((id IS DISTINCT FROM egcs_fc_reversalof) AND (id IS DISTINCT FROM egcs_fc_replacementof))),
  CONSTRAINT "Funding_Case_Agreement_Journal_Voucher_egcs_fc_number_check" CHECK ((egcs_fc_number > 0))
);

CREATE INDEX fc_idx_jv_payment ON "Funding_Case_Agreement_Journal_Voucher" USING btree (egcs_fc_payment);

CREATE UNIQUE INDEX fc_uq_jv_replacement_active ON "Funding_Case_Agreement_Journal_Voucher" USING btree (egcs_fc_replacementof) WHERE ((_deleted = false) AND (egcs_fc_replacementof IS NOT NULL));

CREATE UNIQUE INDEX fc_uq_jv_reversal_active ON "Funding_Case_Agreement_Journal_Voucher" USING btree (egcs_fc_reversalof) WHERE ((_deleted = false) AND (egcs_fc_reversalof IS NOT NULL));

CREATE TABLE "Funding_Case_Agreement_Journal_Voucher_Line" (
  "id" bigint DEFAULT nextval('"Funding_Case_Agreement_Journal_Voucher_Line_id_seq"'::regclass) NOT NULL,
  "egcs_fc_journalvoucher" bigint NOT NULL,
  "egcs_fc_payment" bigint NOT NULL,
  "egcs_fc_commitmentline" bigint NOT NULL,
  "egcs_fc_commitmentlinenumber" integer NOT NULL,
  "egcs_fc_kind" character varying(16) NOT NULL,
  "egcs_fc_chartofaccount" bigint NOT NULL,
  "egcs_fc_accountingdimensions" jsonb NOT NULL,
  "egcs_fc_amount" numeric(19,2) NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Funding_Case_Agreement_Journal_Voucher_Line_pkey" PRIMARY KEY (id),
  CONSTRAINT "fc_chk_jv_line_amount" CHECK ((((egcs_fc_kind)::text = 'adjustment'::text) OR (egcs_fc_amount >= (0)::numeric))),
  CONSTRAINT "Funding_Case_Agreement_Journ_egcs_fc_accountingdimensions_check" CHECK ((jsonb_typeof(egcs_fc_accountingdimensions) = 'array'::text)),
  CONSTRAINT "Funding_Case_Agreement_Journal_Voucher_Line_egcs_fc_kind_check" CHECK (((egcs_fc_kind)::text = ANY ((ARRAY['original'::character varying, 'corrected'::character varying, 'adjustment'::character varying])::text[])))
);

CREATE INDEX fc_idx_jv_lines_root ON "Funding_Case_Agreement_Journal_Voucher_Line" USING btree (egcs_fc_journalvoucher);

CREATE TABLE "Funding_Case_Agreement_Monitor" (
  "id" bigint NOT NULL,
  "egcs_fc_fundingagreement" bigint NOT NULL,
  "egcs_fc_transferpaymentstream" bigint NOT NULL,
  "egcs_fc_type" bigint NOT NULL,
  "egcs_fc_onsite" boolean NOT NULL,
  "egcs_fc_tentativefiscalyear" bigint NOT NULL,
  "egcs_fc_tentativequarter" smallint NOT NULL,
  "egcs_fc_status" bigint NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Funding_Case_Agreement_Monitor_pkey" PRIMARY KEY (id),
  CONSTRAINT "fc_chk_monitorquarter" CHECK (((egcs_fc_tentativequarter >= 1) AND (egcs_fc_tentativequarter <= 4)))
);

CREATE INDEX fc_idx_monitorfundingagreement ON "Funding_Case_Agreement_Monitor" USING btree (egcs_fc_fundingagreement) WHERE (_deleted = false);

CREATE TABLE "Funding_Case_Agreement_Monitor_Finding" (
  "id" bigint DEFAULT nextval('"Funding_Case_Agreement_Monitor_Finding_id_seq"'::regclass) NOT NULL,
  "egcs_fc_fundingagreementmonitor" bigint NOT NULL,
  "egcs_fc_findingname" character varying(255) NOT NULL,
  "egcs_fc_recommendationtype" "Monitor_Action_Type" NOT NULL,
  "egcs_fc_responsibleparty" "Monitor_Responsible_Party" NOT NULL,
  "egcs_fc_detail" text NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  "egcs_fc_monitoritem" bigint,
  CONSTRAINT "fc_uq_funding_case_agreement_monitor_finding_monitor" UNIQUE (id, egcs_fc_fundingagreementmonitor),
  CONSTRAINT "Funding_Case_Agreement_Monitor_Finding_pkey" PRIMARY KEY (id)
);

CREATE INDEX fc_idx_egcs_fc_monitoritem ON "Funding_Case_Agreement_Monitor_Finding" USING btree (egcs_fc_monitoritem) WHERE ((egcs_fc_monitoritem IS NOT NULL) AND (_deleted = false));

CREATE INDEX fc_idx_monitorfindingfundingagreementmonitor ON "Funding_Case_Agreement_Monitor_Finding" USING btree (egcs_fc_fundingagreementmonitor) WHERE (_deleted = false);

CREATE TABLE "Funding_Case_Agreement_Monitor_Followup" (
  "id" bigint DEFAULT nextval('"Funding_Case_Agreement_Monitor_Followup_id_seq"'::regclass) NOT NULL,
  "egcs_fc_fundingagreementmonitor" bigint NOT NULL,
  "egcs_fc_followupname" character varying(255) NOT NULL,
  "egcs_fc_responsibleparty" "Monitor_Responsible_Party" NOT NULL,
  "egcs_fc_status" follow_up_status NOT NULL,
  "egcs_fc_duedate" date NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  "egcs_fc_monitorfinding" bigint,
  "egcs_fc_requiresreceivable" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Funding_Case_Agreement_Monitor_Followup_pkey" PRIMARY KEY (id)
);

CREATE INDEX fc_idx_egcs_fc_monitorfinding ON "Funding_Case_Agreement_Monitor_Followup" USING btree (egcs_fc_monitorfinding) WHERE ((egcs_fc_monitorfinding IS NOT NULL) AND (_deleted = false));

CREATE INDEX fc_idx_monitorfollowupfundingagreementmonitor ON "Funding_Case_Agreement_Monitor_Followup" USING btree (egcs_fc_fundingagreementmonitor) WHERE (_deleted = false);

CREATE TABLE "Funding_Case_Agreement_Monitor_Followup_Update" (
  "id" bigint DEFAULT nextval('"Funding_Case_Agreement_Monitor_Followup_Update_id_seq"'::regclass) NOT NULL,
  "egcs_fc_fundingagreementmonitorfollowup" bigint NOT NULL,
  "egcs_fc_update" text NOT NULL,
  "egcs_fc_status" follow_up_status NOT NULL,
  "egcs_fc_updatedate" date NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Funding_Case_Agreement_Monitor_Followup_Update_pkey" PRIMARY KEY (id)
);

CREATE INDEX fc_idx_monitorfollowupupdatefundingagreementmonitorfollowup ON "Funding_Case_Agreement_Monitor_Followup_Update" USING btree (egcs_fc_fundingagreementmonitorfollowup) WHERE (_deleted = false);

CREATE TABLE "Funding_Case_Agreement_Monitor_Items" (
  "id" bigint DEFAULT nextval('"Funding_Case_Agreement_Monitor_Items_id_seq"'::regclass) NOT NULL,
  "egcs_fc_fundingagreementmonitor" bigint NOT NULL,
  "egcs_fc_item" character varying(255) NOT NULL,
  "egcs_fc_plannedstart" date NOT NULL,
  "egcs_fc_plannedend" date NOT NULL,
  "egcs_fc_detail" text NOT NULL,
  "egcs_fc_monitored" boolean NOT NULL,
  "egcs_fc_actualstart" date,
  "egcs_fc_actualend" date,
  "_deleted" boolean DEFAULT false NOT NULL,
  "egcs_fc_monitorplanning" bigint,
  CONSTRAINT "fc_uq_funding_case_agreement_monitor_items_monitor" UNIQUE (id, egcs_fc_fundingagreementmonitor),
  CONSTRAINT "Funding_Case_Agreement_Monitor_Items_pkey" PRIMARY KEY (id),
  CONSTRAINT "fc_chk_monitoritemactualrange" CHECK (((egcs_fc_actualstart IS NULL) OR (egcs_fc_actualend IS NULL) OR (egcs_fc_actualend >= egcs_fc_actualstart))),
  CONSTRAINT "fc_chk_monitoritemplannedrange" CHECK ((egcs_fc_plannedend >= egcs_fc_plannedstart))
);

CREATE INDEX fc_idx_egcs_fc_monitorplanning ON "Funding_Case_Agreement_Monitor_Items" USING btree (egcs_fc_monitorplanning) WHERE ((egcs_fc_monitorplanning IS NOT NULL) AND (_deleted = false));

CREATE INDEX fc_idx_monitoritemsfundingagreementmonitor ON "Funding_Case_Agreement_Monitor_Items" USING btree (egcs_fc_fundingagreementmonitor) WHERE (_deleted = false);

CREATE TABLE "Funding_Case_Agreement_Monitor_Planning" (
  "id" bigint DEFAULT nextval('"Funding_Case_Agreement_Monitor_Planning_id_seq"'::regclass) NOT NULL,
  "egcs_fc_fundingagreementmonitor" bigint NOT NULL,
  "egcs_fc_objective" text NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "fc_uq_funding_case_agreement_monitor_planning_monitor" UNIQUE (id, egcs_fc_fundingagreementmonitor),
  CONSTRAINT "Funding_Case_Agreement_Monitor_Planning_pkey" PRIMARY KEY (id)
);

CREATE INDEX fc_idx_monitorplanningfundingagreementmonitor ON "Funding_Case_Agreement_Monitor_Planning" USING btree (egcs_fc_fundingagreementmonitor) WHERE (_deleted = false);

CREATE TABLE "Funding_Case_Agreement_Monitor_Promising_Practice" (
  "id" bigint DEFAULT nextval('"Funding_Case_Agreement_Monitor_Promising_Practice_id_seq"'::regclass) NOT NULL,
  "egcs_fc_fundingagreementmonitor" bigint NOT NULL,
  "egcs_fc_practice" text NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Funding_Case_Agreement_Monitor_Promising_Practice_pkey" PRIMARY KEY (id)
);

CREATE INDEX fc_idx_monitorpromisingpracticefundingagreementmonitor ON "Funding_Case_Agreement_Monitor_Promising_Practice" USING btree (egcs_fc_fundingagreementmonitor) WHERE (_deleted = false);

CREATE TABLE "Funding_Case_Agreement_Note" (
  "id" bigint DEFAULT nextval('"Funding_Case_Agreement_Note_id_seq"'::regclass) NOT NULL,
  "egcs_fc_fundingagreement" bigint NOT NULL,
  "egcs_fc_subject_en" character varying(255),
  "egcs_fc_subject_fr" character varying(255),
  "egcs_fc_body_en" text,
  "egcs_fc_body_fr" text,
  "egcs_fc_createdby" bigint NOT NULL,
  "egcs_fc_updatedby" bigint NOT NULL,
  "egcs_fc_createdat" timestamp with time zone DEFAULT now() NOT NULL,
  "egcs_fc_updatedat" timestamp with time zone DEFAULT now() NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Funding_Case_Agreement_Note_pkey" PRIMARY KEY (id),
  CONSTRAINT "fc_chk_note_body_language" CHECK (((NULLIF(btrim(egcs_fc_body_en), ''::text) IS NOT NULL) OR (NULLIF(btrim(egcs_fc_body_fr), ''::text) IS NOT NULL))),
  CONSTRAINT "fc_chk_note_subject_language" CHECK (((NULLIF(btrim((egcs_fc_subject_en)::text), ''::text) IS NOT NULL) OR (NULLIF(btrim((egcs_fc_subject_fr)::text), ''::text) IS NOT NULL)))
);

CREATE INDEX fc_idx_note_parent ON "Funding_Case_Agreement_Note" USING btree (egcs_fc_fundingagreement);

CREATE TABLE "Funding_Case_Agreement_Outcome_Activity" (
  "id" bigint DEFAULT nextval('"Funding_Case_Agreement_Outcome_Activity_id_seq"'::regclass) NOT NULL,
  "egcs_fc_outcomes" bigint NOT NULL,
  "egcs_fc_activity" bigint NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Funding_Case_Agreement_Outcome_Activity_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX fc_idx_outcomeactivityoutcomesactivity ON "Funding_Case_Agreement_Outcome_Activity" USING btree (egcs_fc_outcomes, egcs_fc_activity) WHERE (_deleted = false);

CREATE TABLE "Funding_Case_Agreement_Payment" (
  "id" bigint NOT NULL,
  "egcs_fc_fundingagreementcommitment" bigint NOT NULL,
  "egcs_fc_fundingagreement" bigint NOT NULL,
  "egcs_fc_fiscalyear" bigint NOT NULL,
  "egcs_fc_paymenttype" payment_type NOT NULL,
  "egcs_fc_periodstart" smallint NOT NULL,
  "egcs_fc_periodend" smallint NOT NULL,
  "egcs_fc_paymentamount" numeric(19,2) NOT NULL,
  "egcs_fc_currency" currency_codes DEFAULT 'cad'::currency_codes NOT NULL,
  "egcs_fc_comment" text,
  "egcs_fc_status" bigint NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  "egcs_fc_applicantrecipient" bigint,
  CONSTRAINT "fc_unq_paymentidcommitment" UNIQUE (id, egcs_fc_fundingagreementcommitment),
  CONSTRAINT "fc_uq_payment_agreement" UNIQUE (id, egcs_fc_fundingagreement),
  CONSTRAINT "Funding_Case_Agreement_Payment_pkey" PRIMARY KEY (id),
  CONSTRAINT "fc_chk_paymentamountpositive" CHECK ((egcs_fc_paymentamount > (0)::numeric)),
  CONSTRAINT "fc_chk_paymentperiodend" CHECK (((egcs_fc_periodend >= 0) AND (egcs_fc_periodend <= 11))),
  CONSTRAINT "fc_chk_paymentperiodrange" CHECK ((egcs_fc_periodend >= egcs_fc_periodstart)),
  CONSTRAINT "fc_chk_paymentperiodstart" CHECK (((egcs_fc_periodstart >= 0) AND (egcs_fc_periodstart <= 11)))
);

CREATE INDEX fc_idx_paymentcommitmentfiscalyear ON "Funding_Case_Agreement_Payment" USING btree (egcs_fc_fundingagreementcommitment, egcs_fc_fiscalyear) WHERE (_deleted = false);

CREATE TABLE "Funding_Case_Agreement_Payment_Line" (
  "id" bigint DEFAULT nextval('"Funding_Case_Agreement_Payment_Line_id_seq"'::regclass) NOT NULL,
  "egcs_fc_fundingagreementpayment" bigint NOT NULL,
  "egcs_fc_fundingagreementcommitment" bigint NOT NULL,
  "egcs_fc_fundingagreementcommitmentline" bigint NOT NULL,
  "egcs_fc_amount" numeric(19,2) NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Funding_Case_Agreement_Payment_Line_pkey" PRIMARY KEY (id),
  CONSTRAINT "fc_chk_paymentlineamountpositive" CHECK ((egcs_fc_amount > (0)::numeric))
);

CREATE INDEX fc_idx_paymentlinefundingagreementcommitmentline ON "Funding_Case_Agreement_Payment_Line" USING btree (egcs_fc_fundingagreementcommitmentline) WHERE (_deleted = false);

CREATE UNIQUE INDEX fc_idx_paymentlinepaymentcommitmentline ON "Funding_Case_Agreement_Payment_Line" USING btree (egcs_fc_fundingagreementpayment, egcs_fc_fundingagreementcommitmentline) WHERE (_deleted = false);

CREATE TABLE "Funding_Case_Agreement_Profile" (
  "id" bigint NOT NULL,
  "egcs_fc_agreementnumber" character varying(15) NOT NULL,
  "egcs_fc_currency" currency_codes NOT NULL,
  "egcs_fc_transferpaymentstream" bigint NOT NULL,
  "egcs_fc_customfields" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "egcs_fc_financialsystemnumber" bigint NOT NULL,
  "egcs_fc_title_en" character varying(255) NOT NULL,
  "egcs_fc_title_fr" character varying(255) NOT NULL,
  "egcs_fc_description_en" text NOT NULL,
  "egcs_fc_description_fr" text NOT NULL,
  "egcs_fc_agreementtype" agreement_type NOT NULL,
  "egcs_fc_agreementsubtype" bigint NOT NULL,
  "egcs_fc_furtherdistribution" boolean NOT NULL,
  "egcs_fc_holdback" numeric(5,2) DEFAULT 10 NOT NULL,
  "egcs_fc_holdbackbasis" bigint NOT NULL,
  "egcs_fc_riskscore" numeric(8,2),
  "egcs_fc_status" bigint NOT NULL,
  "egcs_fc_authorizedassistancestartdate" date NOT NULL,
  "egcs_fc_authorizedassistanceenddate" date NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "fc_unq_profileidtransferpaymentstream" UNIQUE (id, egcs_fc_transferpaymentstream),
  CONSTRAINT "Funding_Case_Agreement_Profile_pkey" PRIMARY KEY (id),
  CONSTRAINT "fc_chk_customfields_object" CHECK ((jsonb_typeof(egcs_fc_customfields) = 'object'::text)),
  CONSTRAINT "fc_chk_profileauthorizedassistance" CHECK ((egcs_fc_authorizedassistanceenddate >= egcs_fc_authorizedassistancestartdate)),
  CONSTRAINT "fc_chk_profileholdback" CHECK (((egcs_fc_holdback >= (0)::numeric) AND (egcs_fc_holdback <= (100)::numeric))),
  CONSTRAINT "fc_chk_profileriskscore" CHECK (((egcs_fc_riskscore IS NULL) OR (egcs_fc_riskscore >= (0)::numeric)))
);

CREATE UNIQUE INDEX fc_idx_profiletransferpaymentstreamagreementnumber ON "Funding_Case_Agreement_Profile" USING btree (egcs_fc_transferpaymentstream, egcs_fc_agreementnumber) WHERE (_deleted = false);

CREATE TABLE "Funding_Case_Agreement_Responsible_Party_Activity" (
  "id" bigint DEFAULT nextval('"Funding_Case_Agreement_Responsible_Party_Activity_id_seq"'::regclass) NOT NULL,
  "egcs_fc_responsibleparty" bigint NOT NULL,
  "egcs_fc_activity" bigint NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Funding_Case_Agreement_Responsible_Party_Activity_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX fc_idx_responsiblepartyactivityactivityresponsibleparty ON "Funding_Case_Agreement_Responsible_Party_Activity" USING btree (egcs_fc_activity, egcs_fc_responsibleparty) WHERE (_deleted = false);

CREATE TABLE "Funding_Case_Agreement_Revision" (
  "id" bigint DEFAULT nextval('"Funding_Case_Agreement_Revision_id_seq"'::regclass) NOT NULL,
  "egcs_fc_fundingagreement" bigint NOT NULL,
  "egcs_fc_amendment" bigint,
  "egcs_fc_approvalsubmission" bigint NOT NULL,
  "egcs_fc_revisionnumber" integer NOT NULL,
  "egcs_fc_approvedat" timestamp with time zone DEFAULT now() NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Funding_Case_Agreement_Revision_pkey" PRIMARY KEY (id),
  CONSTRAINT "fc_chk_revisionamendment" CHECK ((((egcs_fc_revisionnumber = 0) AND (egcs_fc_amendment IS NULL)) OR ((egcs_fc_revisionnumber > 0) AND (egcs_fc_amendment IS NOT NULL)))),
  CONSTRAINT "fc_chk_revisionnumber" CHECK ((egcs_fc_revisionnumber >= 0))
);

CREATE UNIQUE INDEX fc_idx_revisionagreementnumber ON "Funding_Case_Agreement_Revision" USING btree (egcs_fc_fundingagreement, egcs_fc_revisionnumber) WHERE (_deleted = false);

CREATE UNIQUE INDEX fc_idx_revisionamendment ON "Funding_Case_Agreement_Revision" USING btree (egcs_fc_amendment) WHERE ((_deleted = false) AND (egcs_fc_amendment IS NOT NULL));

CREATE UNIQUE INDEX fc_idx_revisionapprovalsubmission ON "Funding_Case_Agreement_Revision" USING btree (egcs_fc_approvalsubmission) WHERE (_deleted = false);

ALTER SEQUENCE "Funding_Case_Account_Receivable_Allocation_id_seq" OWNED BY "Funding_Case_Account_Receivable_Allocation"."id";

ALTER SEQUENCE "Funding_Case_Account_Receivable_Offset_Memo_Application_id_seq" OWNED BY "Funding_Case_Account_Receivable_Offset_Memo_Application"."id";

ALTER SEQUENCE "Funding_Case_Account_Receivable_Offset_Memo_id_seq" OWNED BY "Funding_Case_Account_Receivable_Offset_Memo"."id";

ALTER SEQUENCE "Funding_Case_Account_Receivable_Pool_id_seq" OWNED BY "Funding_Case_Account_Receivable_Pool"."id";

ALTER SEQUENCE "Funding_Case_Account_Receivable_Posting_id_seq" OWNED BY "Funding_Case_Account_Receivable_Posting"."id";

ALTER SEQUENCE "Funding_Case_Account_Receivable_Recovery_id_seq" OWNED BY "Funding_Case_Account_Receivable_Recovery"."id";

ALTER SEQUENCE "Funding_Case_Agreement_Account_Receivable_Coding_id_seq" OWNED BY "Funding_Case_Agreement_Account_Receivable_Coding"."id";

ALTER SEQUENCE "Funding_Case_Agreement_Account_Receivable_Line_id_seq" OWNED BY "Funding_Case_Agreement_Account_Receivable_Line"."id";

ALTER SEQUENCE "Funding_Case_Agreement_Activity_Version_id_seq" OWNED BY "Funding_Case_Agreement_Activity_Version"."id";

ALTER SEQUENCE "Funding_Case_Agreement_Activity_id_seq" OWNED BY "Funding_Case_Agreement_Activity"."id";

ALTER SEQUENCE "Funding_Case_Agreement_Address_id_seq" OWNED BY "Funding_Case_Agreement_Address"."id";

ALTER SEQUENCE "Funding_Case_Agreement_Amendment_Subtype_id_seq" OWNED BY "Funding_Case_Agreement_Amendment_Subtype"."id";

ALTER SEQUENCE "Funding_Case_Agreement_Amendment_Type_id_seq" OWNED BY "Funding_Case_Agreement_Amendment_Type"."id";

ALTER SEQUENCE "Funding_Case_Agreement_Applicant_Recipient_id_seq" OWNED BY "Funding_Case_Agreement_Applicant_Recipient"."id";

ALTER SEQUENCE "Funding_Case_Agreement_Approval_Submission_id_seq" OWNED BY "Funding_Case_Agreement_Approval_Submission"."id";

ALTER SEQUENCE "Funding_Case_Agreement_Budget_Fiscal_Year_id_seq" OWNED BY "Funding_Case_Agreement_Budget_Fiscal_Year"."id";

ALTER SEQUENCE "Funding_Case_Agreement_Budget_Line_Item_Funding_id_seq" OWNED BY "Funding_Case_Agreement_Budget_Line_Item_Funding"."id";

ALTER SEQUENCE "Funding_Case_Agreement_Budget_Line_Item_id_seq" OWNED BY "Funding_Case_Agreement_Budget_Line_Item"."id";

ALTER SEQUENCE "Funding_Case_Agreement_Budget_Version_id_seq" OWNED BY "Funding_Case_Agreement_Budget_Version"."id";

ALTER SEQUENCE "Funding_Case_Agreement_Claim_Line_Item_Funding_id_seq" OWNED BY "Funding_Case_Agreement_Claim_Line_Item_Funding"."id";

ALTER SEQUENCE "Funding_Case_Agreement_Claim_Line_Item_id_seq" OWNED BY "Funding_Case_Agreement_Claim_Line_Item"."id";

ALTER SEQUENCE "Funding_Case_Agreement_Claim_Reconcile_Line_Item_id_seq" OWNED BY "Funding_Case_Agreement_Claim_Reconcile_Line_Item"."id";

ALTER SEQUENCE "Funding_Case_Agreement_Closeout_Snapshot_id_seq" OWNED BY "Funding_Case_Agreement_Closeout_Snapshot"."id";

ALTER SEQUENCE "Funding_Case_Agreement_Commitment_Line_id_seq" OWNED BY "Funding_Case_Agreement_Commitment_Line"."id";

ALTER SEQUENCE "Funding_Case_Agreement_Correction_Adjustment_id_seq" OWNED BY "Funding_Case_Agreement_Correction_Adjustment"."id";

ALTER SEQUENCE "Funding_Case_Agreement_Correction_Line_id_seq" OWNED BY "Funding_Case_Agreement_Correction_Line"."id";

ALTER SEQUENCE "Funding_Case_Agreement_Correction_Notification_id_seq" OWNED BY "Funding_Case_Agreement_Correction_Notification"."id";

ALTER SEQUENCE "Funding_Case_Agreement_Correction_Source_id_seq" OWNED BY "Funding_Case_Agreement_Correction_Source"."id";

ALTER SEQUENCE "Funding_Case_Agreement_Forecast_Line_Item_Funding_id_seq" OWNED BY "Funding_Case_Agreement_Forecast_Line_Item_Funding"."id";

ALTER SEQUENCE "Funding_Case_Agreement_Forecast_Line_Item_id_seq" OWNED BY "Funding_Case_Agreement_Forecast_Line_Item"."id";

ALTER SEQUENCE "Funding_Case_Agreement_Generated_Document_id_seq" OWNED BY "Funding_Case_Agreement_Generated_Document"."id";

ALTER SEQUENCE "Funding_Case_Agreement_Journal_Voucher_Line_id_seq" OWNED BY "Funding_Case_Agreement_Journal_Voucher_Line"."id";

ALTER SEQUENCE "Funding_Case_Agreement_Monitor_Finding_id_seq" OWNED BY "Funding_Case_Agreement_Monitor_Finding"."id";

ALTER SEQUENCE "Funding_Case_Agreement_Monitor_Followup_Update_id_seq" OWNED BY "Funding_Case_Agreement_Monitor_Followup_Update"."id";

ALTER SEQUENCE "Funding_Case_Agreement_Monitor_Followup_id_seq" OWNED BY "Funding_Case_Agreement_Monitor_Followup"."id";

ALTER SEQUENCE "Funding_Case_Agreement_Monitor_Items_id_seq" OWNED BY "Funding_Case_Agreement_Monitor_Items"."id";

ALTER SEQUENCE "Funding_Case_Agreement_Monitor_Planning_id_seq" OWNED BY "Funding_Case_Agreement_Monitor_Planning"."id";

ALTER SEQUENCE "Funding_Case_Agreement_Monitor_Promising_Practice_id_seq" OWNED BY "Funding_Case_Agreement_Monitor_Promising_Practice"."id";

ALTER SEQUENCE "Funding_Case_Agreement_Note_id_seq" OWNED BY "Funding_Case_Agreement_Note"."id";

ALTER SEQUENCE "Funding_Case_Agreement_Outcome_Activity_id_seq" OWNED BY "Funding_Case_Agreement_Outcome_Activity"."id";

ALTER SEQUENCE "Funding_Case_Agreement_Payment_Line_id_seq" OWNED BY "Funding_Case_Agreement_Payment_Line"."id";

ALTER SEQUENCE "Funding_Case_Agreement_Responsible_Party_Activity_id_seq" OWNED BY "Funding_Case_Agreement_Responsible_Party_Activity"."id";

ALTER SEQUENCE "Funding_Case_Agreement_Revision_id_seq" OWNED BY "Funding_Case_Agreement_Revision"."id";
END $baseline$`.execute(db)
}

/** Installs the current installFunctions definitions for this subject on a fresh database. */
export const installFunctions = async (db: Kysely<Database>): Promise<void> => {
  await sql`DO $baseline$ BEGIN
CREATE FUNCTION ar_has_lifecycle_evidence(root_id bigint, target_type text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
    SELECT EXISTS (SELECT 1 FROM "Common_Completion" WHERE egcs_cn_entityid = root_id AND egcs_cn_entitytype = target_type)
      OR EXISTS (SELECT 1 FROM "Common_Runtime" WHERE egcs_cn_entityid = root_id AND egcs_cn_entitytype = target_type)
      OR EXISTS (SELECT 1 FROM "Common_Routing_Slip" WHERE egcs_cn_entityid = root_id AND egcs_cn_entitytype = target_type)
  $function$;

CREATE FUNCTION ar_line_principal(source_id bigint)
 RETURNS numeric
 LANGUAGE sql
 STABLE
AS $function$
    SELECT COALESCE(sum(line.egcs_fc_amount),0) FROM "Funding_Case_Agreement_Account_Receivable_Line" line
      JOIN "Funding_Case_Agreement_Account_Receivable" root ON root.id = line.egcs_fc_receivable
      WHERE (line.id = source_id OR line.egcs_fc_originalline = source_id) AND root.egcs_fc_outcome = 'posted'
        AND NOT line._deleted AND NOT root._deleted
  $function$;

CREATE FUNCTION ar_outstanding(root_id bigint)
 RETURNS numeric
 LANGUAGE sql
 STABLE
AS $function$
    SELECT COALESCE((SELECT sum(line.egcs_fc_amount) FROM "Funding_Case_Agreement_Account_Receivable_Line" line
      JOIN "Funding_Case_Agreement_Account_Receivable" root ON root.id = line.egcs_fc_receivable
      WHERE (root.id = root_id OR root.egcs_fc_linkedreceivable = root_id) AND root.egcs_fc_outcome = 'posted'
        AND NOT root._deleted AND NOT line._deleted),0)
      - COALESCE((SELECT sum(allocation.egcs_fc_amount) FROM "Funding_Case_Account_Receivable_Allocation" allocation
        JOIN "Funding_Case_Account_Receivable_Recovery" recovery ON recovery.id = allocation.egcs_fc_recovery
        WHERE allocation.egcs_fc_receivable = root_id AND recovery.egcs_fc_outcome = 'posted'
          AND NOT allocation._deleted AND NOT recovery._deleted),0)
  $function$;

CREATE FUNCTION ar_payment_control(payment_id bigint, agreement_id bigint, debtor_id bigint)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
    DECLARE owner_agency bigint;
    BEGIN
      SELECT program.egcs_tp_agency INTO owner_agency FROM "Funding_Case_Agreement_Profile" agreement
        JOIN "Transfer_Payment_Stream" stream ON stream.id=agreement.egcs_fc_transferpaymentstream
        JOIN "Transfer_Payment_Profile" program ON program.id=stream.egcs_tp_transferpaymentprofile WHERE agreement.id=agreement_id;
      IF debtor_id IS NULL THEN RETURN 'payee_required'; END IF;
      PERFORM id FROM "Funding_Case_Account_Receivable_Pool" WHERE egcs_fc_agency=owner_agency AND egcs_fc_applicantrecipient=debtor_id ORDER BY id FOR UPDATE;
      IF EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Account_Receivable" debt
        JOIN "Funding_Case_Account_Receivable_Pool" pool ON pool.id=debt.egcs_fc_pool
        WHERE pool.egcs_fc_agency=owner_agency AND pool.egcs_fc_applicantrecipient=debtor_id AND ar_pool_net(pool.id)>0
          AND debt.egcs_fc_linkedreceivable IS NULL AND debt.egcs_fc_outcome='posted' AND NOT debt._deleted
          AND coalesce((SELECT latest.egcs_fc_recoverymethod FROM "Funding_Case_Agreement_Account_Receivable" latest
            WHERE (latest.id=debt.id OR latest.egcs_fc_linkedreceivable=debt.id) AND latest.egcs_fc_outcome='posted' AND NOT latest._deleted
            ORDER BY latest.egcs_fc_postedat DESC,latest.id DESC LIMIT 1),debt.egcs_fc_recoverymethod)='direct_repayment') THEN
        RETURN 'direct_repayment_hold';
      END IF;
      RETURN 'allowed';
    END $function$;

CREATE FUNCTION ar_pool_net(pool_id bigint)
 RETURNS numeric
 LANGUAGE sql
 STABLE
AS $function$
    SELECT coalesce((SELECT sum(line.egcs_fc_amount) FROM "Funding_Case_Agreement_Account_Receivable" debt
      JOIN "Funding_Case_Agreement_Account_Receivable_Line" line ON line.egcs_fc_receivable=debt.id
      WHERE debt.egcs_fc_pool=pool_id AND debt.egcs_fc_outcome='posted' AND NOT debt._deleted AND NOT line._deleted),0)
      - coalesce((SELECT sum(memo.egcs_fc_amount) FROM "Funding_Case_Account_Receivable_Credit_Memo" memo
        WHERE memo.egcs_fc_pool=pool_id AND memo.egcs_fc_outcome='posted' AND NOT memo._deleted),0)
      - coalesce((SELECT sum(recovery.egcs_fc_amount) FROM "Funding_Case_Account_Receivable_Recovery" recovery
        WHERE recovery.egcs_fc_pool=pool_id AND recovery.egcs_fc_payment IS NOT NULL AND recovery.egcs_fc_outcome='posted' AND NOT recovery._deleted),0)
  $function$;

CREATE FUNCTION ar_successful_submission(root_id bigint, target_type text, runtime_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
    SELECT EXISTS (SELECT 1 FROM "Common_Runtime" runtime
      JOIN "Common_Workflow_Run" run ON run.id = runtime.id
      JOIN "Common_Completion" completion ON completion.id = run.egcs_cn_completion
      WHERE runtime.id = runtime_id AND runtime.egcs_cn_kind = 'workflow'
        AND runtime.egcs_cn_entitytype = target_type AND runtime.egcs_cn_entityid = root_id
        AND runtime.egcs_cn_purpose = 'approval_submission' AND runtime.egcs_cn_state IN ('succeeded','approved')
        AND completion.egcs_cn_entitytype = target_type AND completion.egcs_cn_entityid = root_id
        AND completion.egcs_cn_disposition = 'workflow_started' AND NOT runtime._deleted AND NOT completion._deleted
        AND NOT EXISTS (SELECT 1 FROM "Common_Completion" newer WHERE newer.egcs_cn_entityid = root_id
          AND newer.egcs_cn_entitytype = target_type AND NOT newer._deleted AND newer.id > completion.id))
  $function$;

CREATE FUNCTION ar_validate_pool_credit_memo(previous jsonb, current_row jsonb, operation text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
    DECLARE pool record; status record;
    BEGIN
      IF operation='DELETE' THEN RAISE EXCEPTION 'Credit memo evidence uses soft deletion' USING ERRCODE='23514'; END IF;
      SELECT * INTO pool FROM "Funding_Case_Account_Receivable_Pool" WHERE id=(current_row->>'egcs_fc_pool')::bigint FOR UPDATE;
      SELECT * INTO status FROM "Common_Status" WHERE id=(current_row->>'egcs_fc_status')::bigint;
      IF pool.id IS NULL OR pool._deleted OR pool.egcs_fc_agency<>(current_row->>'egcs_fc_agency')::bigint
        OR pool.egcs_fc_applicantrecipient<>(current_row->>'egcs_fc_applicantrecipient')::bigint
        OR pool.egcs_fc_currency::text<>current_row->>'egcs_fc_currency' OR status.egcs_cn_agency<>pool.egcs_fc_agency OR status._deleted
        OR NOT EXISTS (SELECT 1 FROM "Agency_Profile" agency JOIN "Applicant_Recipient_Profile" proponent ON proponent.id=pool.egcs_fc_applicantrecipient
          WHERE agency.id=pool.egcs_fc_agency AND NOT agency._deleted AND NOT proponent._deleted)
        OR current_row->>'egcs_fc_fundingagreement' IS NOT NULL THEN
        RAISE EXCEPTION 'Credit memo requires its independent Agency Proponent currency pool' USING ERRCODE='23514';
      END IF;
      IF operation='INSERT' THEN
        IF NOT status.egcs_cn_isdraft OR status.egcs_cn_terminal OR current_row->>'egcs_fc_outcome'<>'open' OR (current_row->>'_deleted')::boolean THEN
          RAISE EXCEPTION 'Credit memo creation requires active Agency Draft status' USING ERRCODE='23514';
        END IF;
      ELSE
        IF previous->>'egcs_fc_ledgerkind'<>'pool' OR previous->>'egcs_fc_outcome'<>'open' AND previous IS DISTINCT FROM current_row THEN
          RAISE EXCEPTION 'Completed credit memo evidence is immutable' USING ERRCODE='23514';
        END IF;
        IF (previous - ARRAY['egcs_fc_amount','egcs_fc_receiveddate','egcs_fc_receiptreference','egcs_fc_narrative_en','egcs_fc_narrative_fr','_deleted','egcs_fc_status','egcs_fc_statusagency','egcs_fc_outcome','egcs_fc_postedat','egcs_fc_postingruntime','egcs_fc_terminalby','egcs_fc_terminalat','egcs_fc_terminalreason','egcs_fc_statusterminal','egcs_fc_statusdeleted'])
          IS DISTINCT FROM (current_row - ARRAY['egcs_fc_amount','egcs_fc_receiveddate','egcs_fc_receiptreference','egcs_fc_narrative_en','egcs_fc_narrative_fr','_deleted','egcs_fc_status','egcs_fc_statusagency','egcs_fc_outcome','egcs_fc_postedat','egcs_fc_postingruntime','egcs_fc_terminalby','egcs_fc_terminalat','egcs_fc_terminalreason','egcs_fc_statusterminal','egcs_fc_statusdeleted']) THEN
          RAISE EXCEPTION 'Credit memo owner identity is immutable' USING ERRCODE='23514';
        END IF;
        IF ar_has_lifecycle_evidence((current_row->>'id')::bigint,'fundingcaseaccountreceivablecreditmemo') AND
          (previous - ARRAY['egcs_fc_status','egcs_fc_statusagency','egcs_fc_outcome','egcs_fc_postedat','egcs_fc_postingruntime','egcs_fc_terminalby','egcs_fc_terminalat','egcs_fc_terminalreason','egcs_fc_statusterminal','egcs_fc_statusdeleted'])
          IS DISTINCT FROM (current_row - ARRAY['egcs_fc_status','egcs_fc_statusagency','egcs_fc_outcome','egcs_fc_postedat','egcs_fc_postingruntime','egcs_fc_terminalby','egcs_fc_terminalat','egcs_fc_terminalreason','egcs_fc_statusterminal','egcs_fc_statusdeleted']) THEN
          RAISE EXCEPTION 'Submitted credit memo content is immutable' USING ERRCODE='23514';
        END IF;
        IF NOT (previous->>'_deleted')::boolean AND (current_row->>'_deleted')::boolean
          AND (NOT status.egcs_cn_isdraft OR ar_has_lifecycle_evidence((current_row->>'id')::bigint,'fundingcaseaccountreceivablecreditmemo')) THEN
          RAISE EXCEPTION 'Only unsubmitted credit memo Drafts may be deleted' USING ERRCODE='23514';
        END IF;
      END IF;
    END $function$;

CREATE FUNCTION correction_has_lifecycle_evidence(root_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
    SELECT EXISTS (SELECT 1 FROM "Common_Completion" WHERE egcs_cn_entitytype = 'fundingcasecorrection' AND egcs_cn_entityid = root_id)
      OR EXISTS (SELECT 1 FROM "Common_Runtime" WHERE egcs_cn_entitytype = 'fundingcasecorrection' AND egcs_cn_entityid = root_id)
      OR EXISTS (SELECT 1 FROM "Common_Routing_Slip" WHERE egcs_cn_entitytype = 'fundingcasecorrection' AND egcs_cn_entityid = root_id)
    $function$;

CREATE FUNCTION guard_agreement_currency_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      IF NEW.egcs_fc_currency IS DISTINCT FROM OLD.egcs_fc_currency THEN
        RAISE EXCEPTION 'Agreement currency is immutable'
          USING ERRCODE = '23514', CONSTRAINT = 'fc_chk_agreement_currency_immutable';
      END IF;
      RETURN NEW;
    END $function$;

CREATE FUNCTION guard_agreement_financial_currency()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE agreement_currency currency_codes;
    BEGIN
      SELECT egcs_fc_currency INTO agreement_currency FROM "Funding_Case_Agreement_Profile"
        WHERE id = NEW.egcs_fc_fundingagreement;
      -- Missing owners are rejected by the owning FK, without hiding its error.
      IF FOUND AND NEW.egcs_fc_currency IS DISTINCT FROM agreement_currency THEN
        RAISE EXCEPTION 'Financial currency must match its Agreement'
          USING ERRCODE = '23514', CONSTRAINT = 'fc_chk_agreement_financial_currency';
      END IF;
      RETURN NEW;
    END $function$;

CREATE FUNCTION guard_agreement_proponent_type()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE stream_id bigint;
    BEGIN
      IF TG_OP = 'UPDATE' AND OLD.egcs_fc_applicantrecipientsubtype IS NOT NULL AND NEW.egcs_fc_applicantrecipientsubtype IS NULL THEN
        RAISE EXCEPTION 'Cannot clear agreement proponent type' USING ERRCODE = '23514', CONSTRAINT = 'agreement_proponent_type_required';
      END IF;
      IF NEW.egcs_fc_applicantrecipientsubtype IS NULL AND (TG_OP = 'INSERT' OR NOT NEW._deleted) THEN
        RAISE EXCEPTION 'Agreement proponent type required' USING ERRCODE = '23514', CONSTRAINT = 'agreement_proponent_type_required';
      END IF;
      SELECT egcs_fc_transferpaymentstream INTO stream_id FROM "Funding_Case_Agreement_Profile" WHERE id = NEW.egcs_fc_fundingagreement;
      PERFORM id FROM "Transfer_Payment_Stream" WHERE id = stream_id FOR UPDATE;
      -- A foreign-key KEY SHARE lock alone does not serialize soft retirement.
      PERFORM id FROM "Agency_Applicant_Recipient_Subtype"
        WHERE id = NEW.egcs_fc_applicantrecipientsubtype FOR SHARE;
      PERFORM validate_stream_proponent_types(stream_id);
      RETURN NEW;
    END $function$;

CREATE FUNCTION guard_future_proponent_type()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE stream_id bigint; relationship record;
    BEGIN
      IF NEW._deleted THEN RETURN NEW; END IF;
      IF TG_TABLE_NAME = 'Funding_Case_Agreement_Profile' THEN
        IF NEW.egcs_fc_transferpaymentstream IS NOT DISTINCT FROM OLD.egcs_fc_transferpaymentstream AND NOT OLD._deleted THEN RETURN NEW; END IF;
        FOR relationship IN SELECT egcs_fc_applicantrecipient, egcs_fc_applicantrecipientsubtype
          FROM "Funding_Case_Agreement_Applicant_Recipient" WHERE egcs_fc_fundingagreement = NEW.id AND NOT _deleted ORDER BY id LOOP
          PERFORM validate_proponent_type_choice(NEW.egcs_fc_transferpaymentstream, relationship.egcs_fc_applicantrecipient, relationship.egcs_fc_applicantrecipientsubtype);
        END LOOP;
      ELSE
        IF TG_OP = 'UPDATE' AND NOT OLD._deleted
          AND NEW.egcs_fc_applicantrecipientsubtype IS NOT DISTINCT FROM OLD.egcs_fc_applicantrecipientsubtype
          AND NEW.egcs_fc_applicantrecipient = OLD.egcs_fc_applicantrecipient
          AND NEW.egcs_fc_fundingagreement = OLD.egcs_fc_fundingagreement THEN RETURN NEW; END IF;
        SELECT egcs_fc_transferpaymentstream INTO stream_id FROM "Funding_Case_Agreement_Profile" WHERE id = NEW.egcs_fc_fundingagreement;
        PERFORM validate_proponent_type_choice(stream_id, NEW.egcs_fc_applicantrecipient, NEW.egcs_fc_applicantrecipientsubtype);
      END IF;
      RETURN NEW;
    END $function$;

CREATE FUNCTION protect_agreement_stream()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      IF NEW.egcs_fc_transferpaymentstream IS DISTINCT FROM OLD.egcs_fc_transferpaymentstream THEN
        RAISE EXCEPTION 'Agreement stream is immutable' USING ERRCODE = '23514', CONSTRAINT = 'fc_agreement_stream_immutable';
      END IF;
      RETURN NEW;
    END $function$;

CREATE FUNCTION trg_fn_ar_monitor_followup()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      IF NEW.egcs_fc_requiresreceivable AND NEW.egcs_fc_status = 'completed' AND NOT NEW._deleted AND NOT EXISTS (
        SELECT 1 FROM "Funding_Case_Agreement_Account_Receivable" root WHERE root.egcs_fc_monitorfollowup = NEW.id
          AND root.egcs_fc_linkedreceivable IS NULL AND root.egcs_fc_outcome = 'posted' AND NOT root._deleted) THEN
        RAISE EXCEPTION 'Recovery follow-up requires actual AR establishment evidence' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END $function$;

CREATE FUNCTION trg_fn_ar_payment_control()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE control text;
    BEGIN
      IF TG_OP = 'INSERT' OR (OLD.egcs_fc_applicantrecipient,OLD.egcs_fc_fundingagreementcommitment,OLD.egcs_fc_paymentamount,OLD.egcs_fc_periodstart,OLD.egcs_fc_periodend,OLD.egcs_fc_fiscalyear)
        IS DISTINCT FROM (NEW.egcs_fc_applicantrecipient,NEW.egcs_fc_fundingagreementcommitment,NEW.egcs_fc_paymentamount,NEW.egcs_fc_periodstart,NEW.egcs_fc_periodend,NEW.egcs_fc_fiscalyear) THEN
        IF NOT NEW._deleted THEN
          control := ar_payment_control(NEW.id,NEW.egcs_fc_fundingagreement,NEW.egcs_fc_applicantrecipient);
          IF control <> 'allowed' THEN RAISE EXCEPTION 'Payment recovery control: %',control USING ERRCODE = '23514'; END IF;
          IF NOT EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Applicant_Recipient" relation
            WHERE relation.egcs_fc_fundingagreement = NEW.egcs_fc_fundingagreement AND relation.egcs_fc_applicantrecipient = NEW.egcs_fc_applicantrecipient AND NOT relation._deleted) THEN
            RAISE EXCEPTION 'Payment payee must be one of its Agreement Proponents' USING ERRCODE = '23514';
          END IF;
        END IF;
      END IF;
      IF TG_OP = 'UPDATE' AND NEW.egcs_fc_applicantrecipient IS DISTINCT FROM OLD.egcs_fc_applicantrecipient
        AND ar_has_lifecycle_evidence(OLD.id,'fundingcasepayment') THEN RAISE EXCEPTION 'Submitted Payment payee attribution is immutable' USING ERRCODE = '23514'; END IF;
      RETURN NEW;
    END $function$;

CREATE FUNCTION trg_fn_ar_payment_line_control()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE payment record; payment_id bigint;
    BEGIN
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
      IF NEW._deleted THEN RETURN NEW; END IF;
      payment_id := NEW.egcs_fc_fundingagreementpayment;
      SELECT * INTO payment FROM "Funding_Case_Agreement_Payment" WHERE id = payment_id;
      IF ar_payment_control(payment.id,payment.egcs_fc_fundingagreement,payment.egcs_fc_applicantrecipient) <> 'allowed' THEN
        RAISE EXCEPTION 'Payment line calculation is blocked by debtor recovery control' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END $function$;

CREATE FUNCTION trg_fn_create_agreement_working_versions()
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
    $function$;

CREATE FUNCTION trg_fn_enforce_agreement_amendment_subtype_scope()
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
    $function$;

CREATE FUNCTION trg_fn_enforce_amendment_type_stream_scope()
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
    $function$;

CREATE FUNCTION trg_fn_enforce_budget_fiscal_year_root()
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
    $function$;

CREATE FUNCTION trg_fn_enforce_budget_line_commitment_program_funding_total()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
    $function$;

CREATE FUNCTION trg_fn_enforce_budget_line_item_root()
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
    $function$;

CREATE FUNCTION trg_fn_enforce_budget_version_commitment_program_funding_total()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      PERFORM fc_enforce_commitment_program_funding_total(NEW."egcs_fc_fundingagreement", NULL);
      RETURN NEW;
    END;
    $function$;

CREATE FUNCTION trg_fn_enforce_commitment_line_program_funding_total()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
    $function$;

CREATE FUNCTION trg_fn_immutable_agreement_approval_submission()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ BEGIN RAISE EXCEPTION 'Agreement approval submissions are immutable'; END; $function$;

CREATE FUNCTION trg_fn_immutable_agreement_closeout_snapshot()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ BEGIN RAISE EXCEPTION 'Agreement closeout snapshots are immutable'; END; $function$;

CREATE FUNCTION trg_fn_protect_ar_pool()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      IF TG_OP = 'DELETE' OR to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW) THEN
        RAISE EXCEPTION 'AR Agency debtor currency pool identity is immutable' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END $function$;

CREATE FUNCTION trg_fn_protect_correction_content()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE root_id bigint; root record; owner_agency bigint;
    BEGIN
      root_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.egcs_fc_correction ELSE NEW.egcs_fc_correction END;
      SELECT * INTO root FROM "Funding_Case_Agreement_Correction" WHERE id = root_id FOR UPDATE;
      IF root.egcs_fc_outcome <> 'open' OR correction_has_lifecycle_evidence(root_id) THEN
        RAISE EXCEPTION 'Submitted Correction evidence is immutable' USING ERRCODE = '23514';
      END IF;
      IF TG_OP = 'UPDATE' AND (OLD.egcs_fc_correction,OLD.egcs_fc_fundingagreement) IS DISTINCT FROM (NEW.egcs_fc_correction,NEW.egcs_fc_fundingagreement) THEN
        RAISE EXCEPTION 'Correction evidence cannot move between roots' USING ERRCODE = '23514';
      END IF;
      IF TG_OP <> 'DELETE' AND TG_TABLE_NAME = 'Funding_Case_Agreement_Correction_Line' THEN
        SELECT p.egcs_tp_agency INTO owner_agency FROM "Funding_Case_Agreement_Profile" a
          JOIN "Transfer_Payment_Stream" s ON s.id = a.egcs_fc_transferpaymentstream
          JOIN "Transfer_Payment_Profile" p ON p.id = s.egcs_tp_transferpaymentprofile WHERE a.id = root.egcs_fc_fundingagreement;
        IF NOT EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Commitment_Line" l
          JOIN "Transfer_Payment_Stream_Chart_of_Account" original ON original.id = l.egcs_fc_transferpaymentstreamchartofaccount
          JOIN "Transfer_Payment_Stream_Chart_of_Account" retained ON retained.id = NEW.egcs_fc_chartofaccount
          JOIN "Transfer_Payment_Stream" retained_stream ON retained_stream.id = retained.egcs_tp_transferpaymentstream
          JOIN "Transfer_Payment_Profile" retained_program ON retained_program.id = retained_stream.egcs_tp_transferpaymentprofile
          JOIN "Agency_Chart_of_Account" account ON account.id = retained.egcs_tp_agencychartofaccount
          JOIN "Agency_Fiscal_Year" fiscal ON fiscal.id = NEW.egcs_fc_agencyfiscalyear
          WHERE l.id = NEW.egcs_fc_commitmentline AND l.egcs_fc_commitment = root.egcs_fc_commitment
            AND l.egcs_fc_fundingagreement = NEW.egcs_fc_fundingagreement
            AND original.egcs_tp_agencychartofaccount = retained.egcs_tp_agencychartofaccount
            AND retained_program.egcs_tp_agency = owner_agency AND account.egcs_ay_organizationagency = owner_agency
            AND account.egcs_ay_fiscalyear = fiscal.id AND fiscal.egcs_ay_organizationagency = owner_agency
            AND account.egcs_ay_currency = root.egcs_fc_currency) THEN
          RAISE EXCEPTION 'Correction line must retain owning Commitment and Agency coding lineage' USING ERRCODE = '23514';
        END IF;
      END IF;
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
      RETURN NEW;
    END $function$;

CREATE FUNCTION trg_fn_protect_correction_posting()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Posted Correction evidence is immutable' USING ERRCODE = '23514'; END IF;
      RETURN NEW;
    END $function$;

CREATE FUNCTION trg_fn_protect_jv_line()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE root_id bigint; source_id bigint;
    BEGIN
      root_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.egcs_fc_journalvoucher ELSE NEW.egcs_fc_journalvoucher END;
      SELECT egcs_fc_payment INTO source_id FROM "Funding_Case_Agreement_Journal_Voucher" WHERE id = root_id FOR UPDATE;
      IF EXISTS (SELECT 1 FROM "Common_Completion" WHERE egcs_cn_entitytype = 'fundingcasejournalvoucher' AND egcs_cn_entityid = root_id) THEN
        RAISE EXCEPTION 'Completed JV lines are locked' USING ERRCODE = '23514';
      END IF;
      IF TG_OP <> 'DELETE' AND NOT EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Payment_Line"
        WHERE egcs_fc_fundingagreementpayment = source_id AND egcs_fc_fundingagreementcommitmentline = NEW.egcs_fc_commitmentline) THEN
        RAISE EXCEPTION 'JV commitment line must belong to source Payment' USING ERRCODE = '23514';
      END IF;
      IF TG_OP <> 'DELETE' AND NOT EXISTS (
        SELECT 1 FROM "Funding_Case_Agreement_Journal_Voucher" voucher
        JOIN "Transfer_Payment_Stream_Chart_of_Account" coding ON coding.id = NEW.egcs_fc_chartofaccount
        JOIN "Agency_Chart_of_Account" account ON account.id = coding.egcs_tp_agencychartofaccount
        WHERE voucher.id = root_id AND account.egcs_ay_currency = voucher.egcs_fc_currency
      ) THEN
        RAISE EXCEPTION 'JV Chart of Account currency must match its Payment' USING ERRCODE = '23514';
      END IF;
      IF TG_OP = 'UPDATE' AND OLD.egcs_fc_journalvoucher IS DISTINCT FROM NEW.egcs_fc_journalvoucher THEN
        RAISE EXCEPTION 'JV lines cannot move between roots' USING ERRCODE = '23514';
      END IF;
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
      RETURN NEW;
    END $function$;

CREATE FUNCTION trg_fn_require_ar_offset_memo_application()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN RETURN NEW; END $function$;

CREATE FUNCTION trg_fn_resolve_claim_line_agreement()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      SELECT "egcs_fc_fundingagreement" INTO NEW."egcs_fc_fundingagreement"
      FROM "Funding_Case_Agreement_Claim"
      WHERE "id" = NEW."egcs_fc_fundingagreementclaim";
      RETURN NEW;
    END;
    $function$;

CREATE FUNCTION trg_fn_resolve_commitment_line_scope()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE commitment_currency currency_codes; chart_currency currency_codes; chart_kind varchar(32);
    BEGIN
      SELECT commitment."egcs_fc_fundingagreement", agreement."egcs_fc_transferpaymentstream"
      INTO NEW."egcs_fc_fundingagreement", NEW."egcs_fc_transferpaymentstream"
      FROM "Funding_Case_Agreement_Commitment" commitment
      JOIN "Funding_Case_Agreement_Profile" agreement
        ON agreement."id" = commitment."egcs_fc_fundingagreement"
      WHERE commitment."id" = NEW."egcs_fc_commitment";
      SELECT egcs_fc_currency INTO commitment_currency FROM "Funding_Case_Agreement_Commitment"
        WHERE id = NEW.egcs_fc_commitment;
      SELECT account.egcs_ay_currency,account.egcs_ay_kind INTO chart_currency,chart_kind
        FROM "Transfer_Payment_Stream_Chart_of_Account" coding
        JOIN "Agency_Chart_of_Account" account ON account.id = coding.egcs_tp_agencychartofaccount
        WHERE coding.id = NEW.egcs_fc_transferpaymentstreamchartofaccount;
      IF commitment_currency IS DISTINCT FROM chart_currency THEN
        RAISE EXCEPTION 'Commitment and Chart of Account currencies must match'
          USING ERRCODE = '23514', CONSTRAINT = 'fc_chk_commitment_line_currency';
      END IF;
      IF chart_kind IS DISTINCT FROM 'commitment' THEN
        RAISE EXCEPTION 'Commitment lines require a Commitment Chart of Account'
          USING ERRCODE = '23514', CONSTRAINT = 'fc_chk_commitment_line_chart_kind';
      END IF;
      RETURN NEW;
    END;
    $function$;

CREATE FUNCTION trg_fn_resolve_commitment_stream()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      IF TG_OP = 'UPDATE' AND NEW.egcs_fc_currency IS DISTINCT FROM OLD.egcs_fc_currency THEN
        RAISE EXCEPTION 'Commitment currency is immutable'
          USING ERRCODE = '23514', CONSTRAINT = 'fc_chk_commitment_currency_immutable';
      END IF;
      SELECT agreement."egcs_fc_transferpaymentstream"
      INTO NEW."egcs_fc_transferpaymentstream"
      FROM "Funding_Case_Agreement_Profile" agreement
      WHERE agreement."id" = NEW."egcs_fc_fundingagreement";
      RETURN NEW;
    END;
    $function$;

CREATE FUNCTION trg_fn_resolve_current_activity_version()
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
    $function$;

CREATE FUNCTION trg_fn_resolve_current_budget_version()
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
    $function$;

CREATE FUNCTION trg_fn_resolve_forecast_line_agreement()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      SELECT "egcs_fc_fundingagreement" INTO NEW."egcs_fc_fundingagreement"
      FROM "Funding_Case_Agreement_Forecast"
      WHERE "id" = NEW."egcs_fc_agreementforecast";
      RETURN NEW;
    END;
    $function$;

CREATE FUNCTION trg_fn_resolve_generated_document_stream()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      SELECT agreement.egcs_fc_transferpaymentstream INTO NEW.egcs_fc_transferpaymentstream
      FROM "Funding_Case_Agreement_Profile" agreement
      WHERE agreement.id = NEW.egcs_fc_fundingagreement;
      RETURN NEW;
    END $function$;

CREATE FUNCTION trg_fn_resolve_monitor_stream()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      SELECT agreement.egcs_fc_transferpaymentstream INTO NEW.egcs_fc_transferpaymentstream
      FROM "Funding_Case_Agreement_Profile" agreement
      WHERE agreement.id = NEW.egcs_fc_fundingagreement;
      RETURN NEW;
    END $function$;

CREATE FUNCTION trg_fn_resolve_payment_agreement()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE commitment_currency currency_codes;
    BEGIN
      SELECT "egcs_fc_fundingagreement" INTO NEW."egcs_fc_fundingagreement"
      FROM "Funding_Case_Agreement_Commitment"
      WHERE "id" = NEW."egcs_fc_fundingagreementcommitment";
      SELECT egcs_fc_currency INTO commitment_currency FROM "Funding_Case_Agreement_Commitment"
        WHERE id = NEW.egcs_fc_fundingagreementcommitment;
      IF NEW.egcs_fc_currency IS DISTINCT FROM commitment_currency THEN
        RAISE EXCEPTION 'Payment and Commitment currencies must match'
          USING ERRCODE = '23514', CONSTRAINT = 'fc_chk_payment_commitment_currency';
      END IF;
      RETURN NEW;
    END;
    $function$;

CREATE FUNCTION trg_fn_resolve_payment_line_commitment()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      SELECT "egcs_fc_fundingagreementcommitment"
      INTO NEW."egcs_fc_fundingagreementcommitment"
      FROM "Funding_Case_Agreement_Payment"
      WHERE "id" = NEW."egcs_fc_fundingagreementpayment";
      RETURN NEW;
    END;
    $function$;

CREATE FUNCTION trg_fn_resolve_reconcile_line_claim()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      SELECT "egcs_fc_fundingagreementclaim" INTO NEW."egcs_fc_fundingagreementclaim"
      FROM "Funding_Case_Agreement_Claim_Reconcile"
      WHERE "id" = NEW."egcs_fc_fundingagreementclaimreconcile";
      RETURN NEW;
    END;
    $function$;

CREATE FUNCTION trg_fn_validate_agreement_approval_submission()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
    END; $function$;

CREATE FUNCTION trg_fn_validate_agreement_closeout_snapshot()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
    END; $function$;

CREATE FUNCTION trg_fn_validate_agreement_line_funding_agency()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
    END $function$;

CREATE FUNCTION trg_fn_validate_agreement_revision()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM "Funding_Case_Agreement_Approval_Submission" submission
        WHERE submission.id = NEW.egcs_fc_approvalsubmission
          AND submission.egcs_fc_fundingagreement = NEW.egcs_fc_fundingagreement
          AND submission.egcs_fc_amendment IS NOT DISTINCT FROM NEW.egcs_fc_amendment
      ) THEN RAISE EXCEPTION 'Agreement revision submission target mismatch'; END IF;
      RETURN NEW;
    END; $function$;

CREATE FUNCTION trg_fn_validate_ar_content()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE root record; source record; original record; ar_account record; owner_agency bigint; root_id bigint;
    BEGIN
      root_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.egcs_fc_receivable ELSE NEW.egcs_fc_receivable END;
      SELECT * INTO root FROM "Funding_Case_Agreement_Account_Receivable" WHERE id = root_id FOR UPDATE;
      IF root.egcs_fc_outcome <> 'open' OR ar_has_lifecycle_evidence(root_id,'fundingcaseaccountreceivable') THEN
        RAISE EXCEPTION 'Submitted AR source evidence is immutable' USING ERRCODE = '23514';
      END IF;
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
      IF TG_OP = 'UPDATE' AND (OLD.egcs_fc_receivable,OLD.egcs_fc_fundingagreement)
        IS DISTINCT FROM (NEW.egcs_fc_receivable,NEW.egcs_fc_fundingagreement) THEN
        RAISE EXCEPTION 'AR evidence cannot move between roots' USING ERRCODE = '23514';
      END IF;
      IF TG_TABLE_NAME = 'Funding_Case_Agreement_Account_Receivable_Line' THEN
        SELECT egcs_fc_agency INTO owner_agency FROM "Funding_Case_Account_Receivable_Pool" WHERE id = root.egcs_fc_pool;
        IF root.egcs_fc_linkedreceivable IS NOT NULL THEN
          SELECT * INTO original FROM "Funding_Case_Agreement_Account_Receivable_Line" WHERE id = NEW.egcs_fc_originalline;
          IF NEW.egcs_fc_accountreceivablechartofaccount IS DISTINCT FROM original.egcs_fc_accountreceivablechartofaccount THEN
            RAISE EXCEPTION 'AR adjustment must preserve its original AR financial account' USING ERRCODE = '23514';
          END IF;
        END IF;
        IF NEW.egcs_fc_accountreceivablechartofaccount IS NOT NULL THEN
          SELECT * INTO ar_account FROM "Agency_Chart_of_Account" WHERE id = NEW.egcs_fc_accountreceivablechartofaccount;
          IF ar_account.id IS NULL OR ar_account.egcs_ay_organizationagency <> owner_agency
            OR ar_account.egcs_ay_fiscalyear <> root.egcs_fc_agencyfiscalyear OR ar_account.egcs_ay_currency <> root.egcs_fc_currency
            OR ar_account.egcs_ay_kind <> 'account_receivable'
            OR (root.egcs_fc_linkedreceivable IS NULL AND ar_account._deleted) THEN
            RAISE EXCEPTION 'AR financial line requires its Agency fiscal year currency Accounts Receivable Chart' USING ERRCODE = '23514';
          END IF;
          IF TG_OP = 'UPDATE' AND OLD.egcs_fc_accountreceivablechartofaccount IS NOT DISTINCT FROM NEW.egcs_fc_accountreceivablechartofaccount THEN
            NEW.egcs_fc_accountreceivableaccountingdimensions := OLD.egcs_fc_accountreceivableaccountingdimensions;
          ELSIF root.egcs_fc_linkedreceivable IS NOT NULL THEN
            NEW.egcs_fc_accountreceivableaccountingdimensions := original.egcs_fc_accountreceivableaccountingdimensions;
          ELSE
            NEW.egcs_fc_accountreceivableaccountingdimensions := ar_account.egcs_ay_accountingdimensions;
          END IF;
        ELSE
          NEW.egcs_fc_accountreceivableaccountingdimensions := '[]'::jsonb;
          IF NEW.egcs_fc_amount <> 0 THEN
            RAISE EXCEPTION 'A nonzero AR financial line requires an Accounts Receivable Chart' USING ERRCODE = '23514';
          END IF;
        END IF;
        IF root.egcs_fc_linkedreceivable IS NULL AND (NEW.egcs_fc_originalline IS NOT NULL OR NEW.egcs_fc_amount < 0 OR NEW.egcs_fc_amount > NEW.egcs_fc_sourceamount) THEN
          RAISE EXCEPTION 'Initial AR amounts must remain within their source basis' USING ERRCODE = '23514';
        END IF;
        IF root.egcs_fc_linkedreceivable IS NOT NULL THEN
          SELECT * INTO original FROM "Funding_Case_Agreement_Account_Receivable_Line" WHERE id = NEW.egcs_fc_originalline;
          IF original.id IS NULL OR original.egcs_fc_originalline IS NOT NULL OR original.egcs_fc_receivable <> root.egcs_fc_linkedreceivable
            OR (original.egcs_fc_sourcekey,original.egcs_fc_claim,original.egcs_fc_claimline,original.egcs_fc_reconcileline,original.egcs_fc_payment,original.egcs_fc_periodstart,original.egcs_fc_periodend,original.egcs_fc_sourceamount,original.egcs_fc_evidence)
              IS DISTINCT FROM (NEW.egcs_fc_sourcekey,NEW.egcs_fc_claim,NEW.egcs_fc_claimline,NEW.egcs_fc_reconcileline,NEW.egcs_fc_payment,NEW.egcs_fc_periodstart,NEW.egcs_fc_periodend,NEW.egcs_fc_sourceamount,NEW.egcs_fc_evidence) THEN
            RAISE EXCEPTION 'AR adjustment must preserve its original source lineage' USING ERRCODE = '23514';
          END IF;
        END IF;
        IF root.egcs_fc_claimrelated THEN
          IF NEW.egcs_fc_claim IS NULL OR NEW.egcs_fc_claimline IS NULL OR NEW.egcs_fc_reconcileline IS NULL THEN
            RAISE EXCEPTION 'Ineligible expense AR requires Claim reconciliation lineage' USING ERRCODE = '23514';
          END IF;
          IF NOT EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Claim_Reconcile_Line_Item" reconciled
            JOIN "Funding_Case_Agreement_Claim_Reconcile" reconciliation ON reconciliation.id = reconciled.egcs_fc_fundingagreementclaimreconcile
            JOIN "Funding_Case_Agreement_Claim" claim ON claim.id = reconciliation.egcs_fc_fundingagreementclaim
            JOIN "Funding_Case_Agreement_Claim_Line_Item" claimline ON claimline.id = reconciled.egcs_fc_lineitem
            JOIN "Funding_Case_Agreement_Budget_Fiscal_Year" fiscal ON fiscal.id = claim.egcs_fc_fiscalyear
            WHERE reconciled.id = NEW.egcs_fc_reconcileline AND reconciled.egcs_fc_lineitem = NEW.egcs_fc_claimline
              AND claim.id = NEW.egcs_fc_claim AND claimline.egcs_fc_fundingagreementclaim = claim.id
              AND claim.egcs_fc_fundingagreement = root.egcs_fc_fundingagreement AND fiscal.egcs_fc_fiscalyear = root.egcs_fc_agencyfiscalyear
              AND claim.egcs_fc_applicantrecipient = root.egcs_fc_applicantrecipient
              AND NEW.egcs_fc_periodstart = claim.egcs_fc_periodstart AND NEW.egcs_fc_periodend = claim.egcs_fc_periodend
              AND (root.egcs_fc_linkedreceivable IS NOT NULL OR (reconciliation.egcs_fc_isfinal AND reconciled.egcs_fc_reconciled >= NEW.egcs_fc_sourceamount))) THEN
            RAISE EXCEPTION 'AR Claim source must preserve Agreement fiscal and period lineage' USING ERRCODE = '23514';
          END IF;
        ELSE
          IF num_nonnulls(NEW.egcs_fc_claim,NEW.egcs_fc_claimline,NEW.egcs_fc_reconcileline) <> 0 OR NEW.egcs_fc_payment IS NULL THEN
            RAISE EXCEPTION 'Advance AR requires paid evidence without invented Claim lineage' USING ERRCODE = '23514';
          END IF;
          IF NOT EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Payment" payment
            JOIN "Funding_Case_Agreement_Budget_Fiscal_Year" fiscal ON fiscal.id = payment.egcs_fc_fiscalyear
            WHERE payment.id = NEW.egcs_fc_payment AND payment.egcs_fc_fundingagreement = root.egcs_fc_fundingagreement
              AND payment.egcs_fc_applicantrecipient = root.egcs_fc_applicantrecipient AND payment.egcs_fc_currency = root.egcs_fc_currency
              AND payment.egcs_fc_paymenttype = 'advance' AND NEW.egcs_fc_sourcekey = 'advance:' || payment.id::text
              AND fiscal.egcs_fc_fiscalyear = root.egcs_fc_agencyfiscalyear) THEN
            RAISE EXCEPTION 'Advance AR source requires explicit payee and retained fiscal lineage' USING ERRCODE = '23514';
          END IF;
        END IF;
      ELSE
        SELECT egcs_fc_agency INTO owner_agency FROM "Funding_Case_Account_Receivable_Pool" WHERE id = root.egcs_fc_pool;
        SELECT * INTO source FROM "Funding_Case_Agreement_Account_Receivable_Line" WHERE id = NEW.egcs_fc_receivableline;
        IF root.egcs_fc_linkedreceivable IS NOT NULL THEN
          SELECT * INTO original FROM "Funding_Case_Agreement_Account_Receivable_Coding" retained
            WHERE retained.egcs_fc_receivableline = source.egcs_fc_originalline
              AND (retained.egcs_fc_commitmentline,retained.egcs_fc_chartofaccount,retained.egcs_fc_agencychartofaccount,retained.egcs_fc_agencyfiscalyear,retained.egcs_fc_periodstart,retained.egcs_fc_periodend)
                = (NEW.egcs_fc_commitmentline,NEW.egcs_fc_chartofaccount,NEW.egcs_fc_agencychartofaccount,NEW.egcs_fc_agencyfiscalyear,NEW.egcs_fc_periodstart,NEW.egcs_fc_periodend);
          IF original.id IS NULL OR (NEW.egcs_fc_paidbasis,NEW.egcs_fc_accountingdimensions)
            IS DISTINCT FROM (original.egcs_fc_paidbasis,original.egcs_fc_accountingdimensions) THEN
            RAISE EXCEPTION 'AR adjustment must preserve original paid source coding and weights' USING ERRCODE = '23514';
          END IF;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Commitment_Line" line
          JOIN "Transfer_Payment_Stream_Chart_of_Account" retained_chart ON retained_chart.id = NEW.egcs_fc_chartofaccount
          JOIN "Agency_Chart_of_Account" account ON account.id = NEW.egcs_fc_agencychartofaccount
          JOIN "Transfer_Payment_Stream" stream ON stream.id = retained_chart.egcs_tp_transferpaymentstream
          JOIN "Transfer_Payment_Profile" program ON program.id = stream.egcs_tp_transferpaymentprofile
          WHERE line.id = NEW.egcs_fc_commitmentline AND line.egcs_fc_fundingagreement = root.egcs_fc_fundingagreement
            AND retained_chart.egcs_tp_agencychartofaccount = account.id
            AND account.egcs_ay_organizationagency = owner_agency AND program.egcs_tp_agency = owner_agency
            AND account.egcs_ay_fiscalyear = NEW.egcs_fc_agencyfiscalyear AND account.egcs_ay_currency = root.egcs_fc_currency
            AND account.egcs_ay_kind = 'commitment') THEN
          RAISE EXCEPTION 'AR coding must preserve Commitment and Agency Chart currency lineage' USING ERRCODE = '23514';
        END IF;
        IF root.egcs_fc_linkedreceivable IS NULL AND (NEW.egcs_fc_amount < 0 OR NEW.egcs_fc_amount > NEW.egcs_fc_paidbasis) THEN
          RAISE EXCEPTION 'AR coding principal exceeds its retained paid basis' USING ERRCODE = '23514';
        END IF;
        IF root.egcs_fc_linkedreceivable IS NULL AND NEW.egcs_fc_sharedpaidbasis < NEW.egcs_fc_paidbasis THEN
          RAISE EXCEPTION 'Initial AR shared coding capacity cannot be less than its source paid basis' USING ERRCODE = '23514';
        END IF;
      END IF;
      RETURN NEW;
    END $function$;

CREATE FUNCTION trg_fn_validate_ar_establishment()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE root record; root_id bigint; source record; coding record; principal numeric; consumed numeric; fiscal_capacity numeric; target_type text;
    BEGIN
      target_type := TG_ARGV[0];
      root_id := CASE WHEN TG_TABLE_NAME IN ('Funding_Case_Agreement_Account_Receivable_Line','Funding_Case_Agreement_Account_Receivable_Coding') THEN (to_jsonb(NEW)->>'egcs_fc_receivable')::bigint ELSE NEW.id END;
      IF target_type = 'fundingcaseaccountreceivable' THEN
        SELECT * INTO root FROM "Funding_Case_Agreement_Account_Receivable" WHERE id = root_id;
      ELSE
        SELECT * INTO root FROM "Funding_Case_Account_Receivable_Credit_Memo" WHERE id = root_id;
      END IF;
      IF target_type='fundingcaseaccountreceivablecreditmemo' AND to_jsonb(root)->>'egcs_fc_ledgerkind'='pool' THEN
        IF root.egcs_fc_outcome='posted' AND NOT ar_successful_submission(root_id,target_type,root.egcs_fc_postingruntime) THEN
          RAISE EXCEPTION 'Credit memo requires latest successful Completion approval' USING ERRCODE='23514';
        END IF; RETURN NULL;
      END IF;
      IF root.egcs_fc_outcome = 'posted' THEN
        IF NOT ar_successful_submission(root_id,target_type,root.egcs_fc_postingruntime) THEN
          RAISE EXCEPTION 'AR posting requires its latest successful Completion-linked approval submission' USING ERRCODE = '23514';
        END IF;
        IF target_type = 'fundingcaseaccountreceivable' THEN
          IF EXISTS (SELECT 1 FROM "Funding_Case_Account_Receivable_Recovery" pending
            WHERE pending.egcs_fc_pool = root.egcs_fc_pool AND pending.egcs_fc_outcome = 'open' AND NOT pending._deleted) THEN
            RAISE EXCEPTION 'Unresolved recovery blocks AR establishment' USING ERRCODE = '23514';
          END IF;
          IF btrim(root.egcs_fc_narrative_en) = '' AND btrim(root.egcs_fc_narrative_fr) = '' THEN RAISE EXCEPTION 'AR establishment requires a bilingual-group rationale' USING ERRCODE = '23514'; END IF;
          IF root.egcs_fc_recoverymethod IS NULL THEN RAISE EXCEPTION 'AR submission requires a recovery method' USING ERRCODE = '23514'; END IF;
          IF root.egcs_fc_monitorrequired <> (root.egcs_fc_monitorfollowup IS NOT NULL) THEN
            RAISE EXCEPTION 'AR submission requires its configured Monitor follow-up' USING ERRCODE = '23514';
          END IF;
          IF root.egcs_fc_recipientpreference IS NOT NULL AND root.egcs_fc_recipientpreference <> root.egcs_fc_recoverymethod
            AND btrim(root.egcs_fc_preferenceoverride_en) = '' AND btrim(root.egcs_fc_preferenceoverride_fr) = '' THEN
            RAISE EXCEPTION 'AR preference override requires a rationale' USING ERRCODE = '23514';
          END IF;
          SELECT COALESCE(sum(egcs_fc_amount),0) INTO principal FROM "Funding_Case_Agreement_Account_Receivable_Line" WHERE egcs_fc_receivable = root_id AND NOT _deleted;
          IF root.egcs_fc_linkedreceivable IS NULL AND principal <= 0 THEN RAISE EXCEPTION 'AR establishment requires positive principal' USING ERRCODE = '23514'; END IF;
          FOR source IN SELECT * FROM "Funding_Case_Agreement_Account_Receivable_Line" WHERE egcs_fc_receivable = root_id AND NOT _deleted LOOP
            IF source.egcs_fc_amount <> 0 AND source.egcs_fc_accountreceivablechartofaccount IS NULL THEN
              RAISE EXCEPTION 'AR submission requires financial accounts for every nonzero line' USING ERRCODE = '23514';
            END IF;
            IF COALESCE((SELECT sum(egcs_fc_amount) FROM "Funding_Case_Agreement_Account_Receivable_Coding" WHERE egcs_fc_receivableline = source.id AND NOT _deleted),0) <> source.egcs_fc_amount THEN
              RAISE EXCEPTION 'AR coding must partition source principal exactly once' USING ERRCODE = '23514';
            END IF;
            SELECT COALESCE(sum(CASE WHEN other.egcs_fc_outcome = 'posted' THEN line.egcs_fc_amount ELSE greatest(line.egcs_fc_amount,0) END),0) INTO consumed FROM "Funding_Case_Agreement_Account_Receivable_Line" line
              JOIN "Funding_Case_Agreement_Account_Receivable" other ON other.id = line.egcs_fc_receivable
              WHERE line.egcs_fc_fundingagreement = root.egcs_fc_fundingagreement AND line.egcs_fc_sourcekey = source.egcs_fc_sourcekey
                AND other.egcs_fc_applicantrecipient = root.egcs_fc_applicantrecipient
                AND NOT line._deleted AND NOT other._deleted
                AND (other.egcs_fc_outcome = 'posted' OR (other.egcs_fc_outcome = 'open' AND ar_has_lifecycle_evidence(other.id,'fundingcaseaccountreceivable')));
            IF root.egcs_fc_advancepaymentrelated THEN
              consumed := consumed - COALESCE((SELECT sum(allocation.egcs_fc_amount)
                FROM "Funding_Case_Account_Receivable_Allocation" allocation
                JOIN "Funding_Case_Account_Receivable_Recovery" recovery ON recovery.id = allocation.egcs_fc_recovery
                JOIN "Funding_Case_Agreement_Account_Receivable_Line" original ON original.id = allocation.egcs_fc_receivableline
                JOIN "Funding_Case_Agreement_Account_Receivable" originaldebt ON originaldebt.id = original.egcs_fc_receivable
                WHERE original.egcs_fc_fundingagreement = root.egcs_fc_fundingagreement AND original.egcs_fc_sourcekey = source.egcs_fc_sourcekey
                  AND originaldebt.egcs_fc_applicantrecipient = root.egcs_fc_applicantrecipient
                  AND recovery.egcs_fc_outcome = 'posted' AND NOT allocation._deleted AND NOT recovery._deleted),0);
              fiscal_capacity := root.egcs_fc_fiscaloutstanding;
              IF fiscal_capacity IS NULL THEN
                RAISE EXCEPTION 'Advance AR requires retained fiscal outstanding capacity' USING ERRCODE = '23514';
              END IF;
              SELECT COALESCE(sum(CASE WHEN other.egcs_fc_outcome = 'posted' THEN line.egcs_fc_amount ELSE greatest(line.egcs_fc_amount,0) END),0)
                - COALESCE((SELECT sum(allocation.egcs_fc_amount)
                  FROM "Funding_Case_Account_Receivable_Allocation" allocation
                  JOIN "Funding_Case_Account_Receivable_Recovery" recovery ON recovery.id = allocation.egcs_fc_recovery
                  JOIN "Funding_Case_Agreement_Account_Receivable" originaldebt ON originaldebt.id = allocation.egcs_fc_receivable
                  WHERE originaldebt.egcs_fc_fundingagreement = root.egcs_fc_fundingagreement
                    AND originaldebt.egcs_fc_applicantrecipient = root.egcs_fc_applicantrecipient
                    AND originaldebt.egcs_fc_agencyfiscalyear = root.egcs_fc_agencyfiscalyear AND originaldebt.egcs_fc_advancepaymentrelated
                    AND recovery.egcs_fc_outcome = 'posted' AND NOT allocation._deleted AND NOT recovery._deleted),0)
                INTO principal
                FROM "Funding_Case_Agreement_Account_Receivable_Line" line
                JOIN "Funding_Case_Agreement_Account_Receivable" other ON other.id = line.egcs_fc_receivable
                WHERE other.egcs_fc_fundingagreement = root.egcs_fc_fundingagreement
                  AND other.egcs_fc_applicantrecipient = root.egcs_fc_applicantrecipient
                  AND other.egcs_fc_agencyfiscalyear = root.egcs_fc_agencyfiscalyear AND other.egcs_fc_advancepaymentrelated
                  AND NOT line._deleted AND NOT other._deleted
                  AND (other.egcs_fc_outcome = 'posted' OR (other.egcs_fc_outcome = 'open' AND ar_has_lifecycle_evidence(other.id,'fundingcaseaccountreceivable')));
              principal := greatest(principal,0); IF principal > fiscal_capacity THEN
                RAISE EXCEPTION 'Advance AR fiscal principal is already reserved or established' USING ERRCODE = '23514';
              END IF;
            END IF;
            consumed := greatest(consumed,0); IF consumed > source.egcs_fc_sourceamount THEN RAISE EXCEPTION 'AR source principal is already reserved or established' USING ERRCODE = '23514'; END IF;
            IF root.egcs_fc_linkedreceivable IS NOT NULL AND ar_line_principal(source.egcs_fc_originalline) < 0 THEN
              RAISE EXCEPTION 'AR adjustment cannot reduce approved principal below zero' USING ERRCODE = '23514';
            END IF;
          END LOOP;
          -- Different Claim source lines can retain the same paid coding basis.
          -- Reserve its outstanding principal once across every established or
          -- submitted AR, including approved signed adjustments and collections.
          FOR coding IN SELECT egcs_fc_commitmentline,egcs_fc_chartofaccount,egcs_fc_agencyfiscalyear,
              egcs_fc_periodstart,egcs_fc_periodend,min(egcs_fc_sharedpaidbasis) paid_basis
            FROM "Funding_Case_Agreement_Account_Receivable_Coding"
            WHERE egcs_fc_receivable = root_id AND NOT _deleted
            GROUP BY egcs_fc_commitmentline,egcs_fc_chartofaccount,egcs_fc_agencyfiscalyear,egcs_fc_periodstart,egcs_fc_periodend LOOP
            SELECT COALESCE(sum(CASE WHEN other.egcs_fc_outcome = 'posted' THEN retained.egcs_fc_amount
              ELSE greatest(retained.egcs_fc_amount,0) END),0) INTO consumed
              FROM "Funding_Case_Agreement_Account_Receivable_Coding" retained
              JOIN "Funding_Case_Agreement_Account_Receivable" other ON other.id = retained.egcs_fc_receivable
              WHERE retained.egcs_fc_fundingagreement = root.egcs_fc_fundingagreement AND other.egcs_fc_pool = root.egcs_fc_pool
                AND (retained.egcs_fc_commitmentline,retained.egcs_fc_chartofaccount,retained.egcs_fc_agencyfiscalyear,retained.egcs_fc_periodstart,retained.egcs_fc_periodend)
                  = (coding.egcs_fc_commitmentline,coding.egcs_fc_chartofaccount,coding.egcs_fc_agencyfiscalyear,coding.egcs_fc_periodstart,coding.egcs_fc_periodend)
                AND NOT retained._deleted AND NOT other._deleted
                AND (other.egcs_fc_outcome = 'posted' OR (other.egcs_fc_outcome = 'open' AND ar_has_lifecycle_evidence(other.id,'fundingcaseaccountreceivable')));
            consumed := consumed - COALESCE((SELECT sum(posting.egcs_fc_amount)
              FROM "Funding_Case_Account_Receivable_Posting" posting
              JOIN "Funding_Case_Account_Receivable_Recovery" recovery ON recovery.id = posting.egcs_fc_recovery
              WHERE posting.egcs_fc_fundingagreement = root.egcs_fc_fundingagreement AND recovery.egcs_fc_pool = root.egcs_fc_pool
                AND (posting.egcs_fc_commitmentline,posting.egcs_fc_chartofaccount,posting.egcs_fc_agencyfiscalyear,posting.egcs_fc_periodstart,posting.egcs_fc_periodend)
                  = (coding.egcs_fc_commitmentline,coding.egcs_fc_chartofaccount,coding.egcs_fc_agencyfiscalyear,coding.egcs_fc_periodstart,coding.egcs_fc_periodend)
                AND recovery.egcs_fc_outcome = 'posted' AND NOT posting._deleted AND NOT recovery._deleted),0);
            consumed := greatest(consumed,0); IF consumed > coding.paid_basis THEN
              RAISE EXCEPTION 'AR coding principal is already reserved or established against its shared paid basis' USING ERRCODE = '23514';
            END IF;
          END LOOP;
        ELSE
          IF NOT EXISTS (SELECT 1 FROM "Funding_Case_Account_Receivable_Recovery" recovery WHERE recovery.egcs_fc_creditmemo = root_id
            AND recovery.egcs_fc_outcome = 'posted' AND recovery.egcs_fc_amount = root.egcs_fc_amount AND NOT recovery._deleted) THEN
            RAISE EXCEPTION 'Approved Credit Memo must post its received amount exactly once' USING ERRCODE = '23514';
          END IF;
        END IF;
      END IF;
      RETURN NULL;
    END $function$;

CREATE FUNCTION trg_fn_validate_ar_offset_memo()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE memo record; recovery record;
    BEGIN
      IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Offset credit evidence is immutable' USING ERRCODE='23514'; END IF;
      IF TG_TABLE_NAME='Funding_Case_Account_Receivable_Offset_Memo' THEN
        IF NEW.egcs_fc_legacyreceivable IS NOT NULL OR NEW.egcs_fc_amount<>greatest(ar_pool_net(NEW.egcs_fc_pool),0) THEN
          RAISE EXCEPTION 'Offset credit memo belongs only to its current aggregate pool' USING ERRCODE='23514'; END IF;
      ELSE
        SELECT * INTO memo FROM "Funding_Case_Account_Receivable_Offset_Memo" WHERE id=NEW.egcs_fc_offsetmemo FOR UPDATE;
        SELECT * INTO recovery FROM "Funding_Case_Account_Receivable_Recovery" WHERE id=NEW.egcs_fc_recovery;
        IF NEW.egcs_fc_allocation IS NOT NULL OR memo.egcs_fc_legacyreceivable IS NOT NULL OR recovery.egcs_fc_ledgerkind<>'pool'
          OR recovery.egcs_fc_pool<>memo.egcs_fc_pool OR recovery.egcs_fc_outcome<>'open' OR recovery.egcs_fc_amount<>NEW.egcs_fc_amount THEN
          RAISE EXCEPTION 'Offset application must preserve its standalone pool deduction' USING ERRCODE='23514'; END IF;
      END IF; RETURN NEW;
    END $function$;

CREATE FUNCTION trg_fn_validate_ar_recovery()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE recovery record; pool record; root record; source record; allocation record; coding record; operation record; principal numeric; consumed numeric; recovery_id bigint;
    BEGIN
      IF TG_OP='INSERT' AND (TG_TABLE_NAME='Funding_Case_Account_Receivable_Allocation' OR TG_TABLE_NAME='Funding_Case_Account_Receivable_Recovery' AND to_jsonb(NEW)->>'egcs_fc_ledgerkind'<>'pool') THEN
        RAISE EXCEPTION 'New credits are never matched to individual ARs' USING ERRCODE='23514';
      END IF;
      IF TG_TABLE_NAME='Funding_Case_Account_Receivable_Recovery' AND to_jsonb(NEW)->>'egcs_fc_ledgerkind'='pool' THEN
        IF TG_OP='DELETE' OR TG_OP='UPDATE' AND (OLD.egcs_fc_outcome<>'open' AND to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW)
          OR (to_jsonb(OLD)-ARRAY['egcs_fc_outcome','egcs_fc_postedat','egcs_fc_postingruntime','egcs_fc_releasedat']) IS DISTINCT FROM
            (to_jsonb(NEW)-ARRAY['egcs_fc_outcome','egcs_fc_postedat','egcs_fc_postingruntime','egcs_fc_releasedat'])) THEN
          RAISE EXCEPTION 'Pool deduction evidence is immutable' USING ERRCODE='23514';
        END IF;
        SELECT * INTO pool FROM "Funding_Case_Account_Receivable_Pool" WHERE id=NEW.egcs_fc_pool FOR UPDATE;
        IF NEW.egcs_fc_creditmemo IS NOT NULL OR NOT EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Payment" payment
          JOIN "Funding_Case_Agreement_Profile" agreement ON agreement.id=payment.egcs_fc_fundingagreement
          JOIN "Transfer_Payment_Stream" stream ON stream.id=agreement.egcs_fc_transferpaymentstream
          JOIN "Transfer_Payment_Profile" program ON program.id=stream.egcs_tp_transferpaymentprofile
          WHERE payment.id=NEW.egcs_fc_payment AND payment.egcs_fc_applicantrecipient=pool.egcs_fc_applicantrecipient
            AND payment.egcs_fc_currency=pool.egcs_fc_currency AND program.egcs_tp_agency=pool.egcs_fc_agency
            AND payment.egcs_fc_paymentamount>=NEW.egcs_fc_amount AND NOT payment._deleted) THEN
          RAISE EXCEPTION 'Pool deduction requires matching Payment payee Agency currency and gross' USING ERRCODE='23514';
        END IF;
        IF TG_OP='INSERT' AND (NEW.egcs_fc_outcome<>'open' OR NEW.egcs_fc_amount<=0 OR NEW.egcs_fc_amount>greatest(ar_pool_net(pool.id)-coalesce((
          SELECT sum(prior.egcs_fc_amount) FROM "Funding_Case_Account_Receivable_Recovery" prior
          WHERE prior.egcs_fc_pool=pool.id AND prior.egcs_fc_payment IS NOT NULL AND prior.egcs_fc_outcome='open' AND NOT prior._deleted),0),0)) THEN
          RAISE EXCEPTION 'Pool deduction exceeds aggregate receivable balance' USING ERRCODE='23514';
        END IF; RETURN NEW;
      END IF;
      IF TG_TABLE_NAME IN ('Funding_Case_Account_Receivable_Allocation','Funding_Case_Account_Receivable_Posting') AND EXISTS (
        SELECT 1 FROM "Funding_Case_Account_Receivable_Recovery" WHERE id=(to_jsonb(NEW)->>'egcs_fc_recovery')::bigint AND egcs_fc_ledgerkind='pool') THEN
        RAISE EXCEPTION 'Pool credits are never matched to individual AR sources' USING ERRCODE='23514';
      END IF;
      IF TG_TABLE_NAME = 'Funding_Case_Account_Receivable_Recovery' THEN
        IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Recovery reservations retain evidence' USING ERRCODE = '23514'; END IF;
        SELECT * INTO pool FROM "Funding_Case_Account_Receivable_Pool" WHERE id = NEW.egcs_fc_pool FOR UPDATE;
        IF TG_OP = 'UPDATE' THEN
          IF (OLD.egcs_fc_pool,OLD.egcs_fc_payment,OLD.egcs_fc_creditmemo) IS DISTINCT FROM (NEW.egcs_fc_pool,NEW.egcs_fc_payment,NEW.egcs_fc_creditmemo) THEN
            RAISE EXCEPTION 'Recovery owner identity is immutable' USING ERRCODE = '23514';
          END IF;
          IF OLD.egcs_fc_outcome <> 'open' AND to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW) THEN RAISE EXCEPTION 'Completed recovery is immutable' USING ERRCODE = '23514'; END IF;
          IF NEW.egcs_fc_payment IS NOT NULL AND ar_has_lifecycle_evidence(NEW.egcs_fc_payment,'fundingcasepayment') AND NEW.egcs_fc_amount <> OLD.egcs_fc_amount THEN
            RAISE EXCEPTION 'Submitted offset allocation is immutable' USING ERRCODE = '23514';
          END IF;
          IF NEW.egcs_fc_creditmemo IS NOT NULL AND ar_has_lifecycle_evidence(NEW.egcs_fc_creditmemo,'fundingcaseaccountreceivablecreditmemo') AND NEW.egcs_fc_amount <> OLD.egcs_fc_amount THEN
            RAISE EXCEPTION 'Submitted repayment allocation is immutable' USING ERRCODE = '23514';
          END IF;
        END IF;
        IF NEW.egcs_fc_outcome = 'open' AND NOT NEW._deleted AND EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Account_Receivable" adjustment
          WHERE adjustment.egcs_fc_pool = NEW.egcs_fc_pool AND adjustment.egcs_fc_linkedreceivable IS NOT NULL
            AND adjustment.egcs_fc_outcome = 'open' AND NOT adjustment._deleted) THEN
          RAISE EXCEPTION 'Pending AR adjustment blocks recovery processing' USING ERRCODE = '23514';
        END IF;
        IF NEW.egcs_fc_payment IS NOT NULL THEN
          IF NOT EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Payment" payment
            JOIN "Funding_Case_Agreement_Profile" agreement ON agreement.id = payment.egcs_fc_fundingagreement
            JOIN "Transfer_Payment_Stream" stream ON stream.id = agreement.egcs_fc_transferpaymentstream
            JOIN "Transfer_Payment_Profile" program ON program.id = stream.egcs_tp_transferpaymentprofile
            WHERE payment.id = NEW.egcs_fc_payment AND payment.egcs_fc_applicantrecipient = pool.egcs_fc_applicantrecipient
              AND program.egcs_tp_agency = pool.egcs_fc_agency AND payment.egcs_fc_currency = pool.egcs_fc_currency
              AND payment.egcs_fc_paymentamount >= NEW.egcs_fc_amount AND NOT payment._deleted) THEN
            RAISE EXCEPTION 'Offset must match actual Payment payee Agency currency and gross amount' USING ERRCODE = '23514';
          END IF;
        ELSE
          IF NOT EXISTS (SELECT 1 FROM "Funding_Case_Account_Receivable_Credit_Memo" repayment WHERE repayment.id = NEW.egcs_fc_creditmemo
            AND repayment.egcs_fc_pool = NEW.egcs_fc_pool AND repayment.egcs_fc_amount = NEW.egcs_fc_amount AND NOT repayment._deleted) THEN
            RAISE EXCEPTION 'Recovery must match received repayment amount and Agency pool' USING ERRCODE = '23514';
          END IF;
        END IF;
        RETURN NEW;
      END IF;
      recovery_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.egcs_fc_recovery ELSE NEW.egcs_fc_recovery END;
      SELECT * INTO recovery FROM "Funding_Case_Account_Receivable_Recovery" WHERE id = recovery_id FOR UPDATE;
      SELECT * INTO pool FROM "Funding_Case_Account_Receivable_Pool" WHERE id = recovery.egcs_fc_pool FOR UPDATE;
      IF recovery.egcs_fc_outcome <> 'open' THEN RAISE EXCEPTION 'Completed recovery evidence is immutable' USING ERRCODE = '23514'; END IF;
      IF TG_TABLE_NAME = 'Funding_Case_Account_Receivable_Allocation' THEN
        IF (recovery.egcs_fc_payment IS NOT NULL AND ar_has_lifecycle_evidence(recovery.egcs_fc_payment,'fundingcasepayment'))
          OR (recovery.egcs_fc_creditmemo IS NOT NULL AND ar_has_lifecycle_evidence(recovery.egcs_fc_creditmemo,'fundingcaseaccountreceivablecreditmemo')) THEN
          RAISE EXCEPTION 'Submitted recovery allocations are immutable' USING ERRCODE = '23514';
        END IF;
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        SELECT * INTO root FROM "Funding_Case_Agreement_Account_Receivable" WHERE id = NEW.egcs_fc_receivable FOR UPDATE;
        IF root.egcs_fc_pool <> recovery.egcs_fc_pool OR root.egcs_fc_outcome <> 'posted' OR root.egcs_fc_linkedreceivable IS NOT NULL OR root._deleted THEN
          RAISE EXCEPTION 'Recovery allocation requires original established debt in its pool' USING ERRCODE = '23514';
        END IF;
        IF recovery.egcs_fc_payment IS NOT NULL AND COALESCE((SELECT latest.egcs_fc_recoverymethod FROM "Funding_Case_Agreement_Account_Receivable" latest
          WHERE (latest.id = root.id OR latest.egcs_fc_linkedreceivable = root.id) AND latest.egcs_fc_outcome = 'posted' AND NOT latest._deleted
          ORDER BY latest.egcs_fc_postedat DESC,latest.id DESC LIMIT 1),root.egcs_fc_recoverymethod) <> 'offset' THEN
          RAISE EXCEPTION 'Automatic recovery must apply approved AR offset policy' USING ERRCODE = '23514';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Account_Receivable_Line" line WHERE line.id = NEW.egcs_fc_receivableline
          AND line.egcs_fc_originalline IS NULL AND line.egcs_fc_receivable = root.id AND NOT line._deleted) THEN
          RAISE EXCEPTION 'Recovery must allocate original source lines' USING ERRCODE = '23514';
        END IF;
        principal := ar_line_principal(NEW.egcs_fc_receivableline);
        SELECT COALESCE(sum(existing.egcs_fc_amount),0) INTO consumed FROM "Funding_Case_Account_Receivable_Allocation" existing
          JOIN "Funding_Case_Account_Receivable_Recovery" prior ON prior.id = existing.egcs_fc_recovery
          WHERE existing.egcs_fc_receivableline = NEW.egcs_fc_receivableline AND existing.id <> COALESCE(NEW.id,-1)
            AND prior.egcs_fc_outcome IN ('open','posted') AND NOT existing._deleted AND NOT prior._deleted;
        IF NOT NEW._deleted AND consumed + NEW.egcs_fc_amount > principal THEN RAISE EXCEPTION 'Recovery exceeds available source principal' USING ERRCODE = '23514'; END IF;
        IF EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Correction" correction WHERE correction.egcs_fc_fundingagreement = root.egcs_fc_fundingagreement AND correction.egcs_fc_outcome = 'open' AND NOT correction._deleted) THEN
          RAISE EXCEPTION 'An open Correction locks recovery source accounting' USING ERRCODE = '23514';
        END IF;
      ELSE
        IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Recovery postings are immutable' USING ERRCODE = '23514'; END IF;
        SELECT * INTO allocation FROM "Funding_Case_Account_Receivable_Allocation" WHERE id = NEW.egcs_fc_allocation;
        SELECT * INTO coding FROM "Funding_Case_Agreement_Account_Receivable_Coding" WHERE id = NEW.egcs_fc_coding;
        SELECT * INTO source FROM "Funding_Case_Agreement_Account_Receivable_Line" WHERE id = allocation.egcs_fc_receivableline;
        IF (NEW.egcs_fc_accountreceivablechartofaccount,NEW.egcs_fc_accountreceivableaccountingdimensions)
          IS DISTINCT FROM (source.egcs_fc_accountreceivablechartofaccount,source.egcs_fc_accountreceivableaccountingdimensions) THEN
          RAISE EXCEPTION 'Recovery posting must preserve its retained AR account and dimensions' USING ERRCODE = '23514';
        END IF;
        IF coding.egcs_fc_receivableline <> allocation.egcs_fc_receivableline
          OR (NEW.egcs_fc_receivable,NEW.egcs_fc_fundingagreement,NEW.egcs_fc_commitmentline,NEW.egcs_fc_chartofaccount,NEW.egcs_fc_agencychartofaccount,NEW.egcs_fc_agencyfiscalyear,NEW.egcs_fc_periodstart,NEW.egcs_fc_periodend)
          IS DISTINCT FROM (coding.egcs_fc_receivable,coding.egcs_fc_fundingagreement,coding.egcs_fc_commitmentline,coding.egcs_fc_chartofaccount,coding.egcs_fc_agencychartofaccount,coding.egcs_fc_agencyfiscalyear,coding.egcs_fc_periodstart,coding.egcs_fc_periodend) THEN
          RAISE EXCEPTION 'Recovery posting must preserve exact source coding and period' USING ERRCODE = '23514';
        END IF;
        SELECT COALESCE(sum(posting.egcs_fc_amount),0) INTO consumed FROM "Funding_Case_Account_Receivable_Posting" posting
          JOIN "Funding_Case_Account_Receivable_Recovery" prior ON prior.id = posting.egcs_fc_recovery
          WHERE posting.egcs_fc_coding = coding.id AND prior.egcs_fc_outcome IN ('open','posted') AND NOT posting._deleted AND NOT prior._deleted;
        SELECT COALESCE(sum(adjusted.egcs_fc_amount),0) INTO principal FROM "Funding_Case_Agreement_Account_Receivable_Coding" adjusted
          JOIN "Funding_Case_Agreement_Account_Receivable_Line" adjusted_line ON adjusted_line.id = adjusted.egcs_fc_receivableline
          JOIN "Funding_Case_Agreement_Account_Receivable" adjusted_root ON adjusted_root.id = adjusted.egcs_fc_receivable
          WHERE adjusted_line.egcs_fc_originalline = coding.egcs_fc_receivableline
            AND adjusted.egcs_fc_commitmentline = coding.egcs_fc_commitmentline AND adjusted.egcs_fc_chartofaccount = coding.egcs_fc_chartofaccount
            AND adjusted.egcs_fc_periodstart = coding.egcs_fc_periodstart AND adjusted.egcs_fc_periodend = coding.egcs_fc_periodend
            AND adjusted_root.egcs_fc_outcome = 'posted' AND NOT adjusted._deleted AND NOT adjusted_root._deleted;
        IF consumed + NEW.egcs_fc_amount > coding.egcs_fc_amount + principal THEN
          RAISE EXCEPTION 'Recovery posting exceeds retained coding principal' USING ERRCODE = '23514';
        END IF;
      END IF;
      RETURN NEW;
    END $function$;

CREATE FUNCTION trg_fn_validate_ar_recovery_posting()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE recovery_id bigint; recovery record; operation record; target_id bigint; target_type text;
    BEGIN
      recovery_id := CASE WHEN TG_TABLE_NAME = 'Funding_Case_Account_Receivable_Recovery' THEN NEW.id ELSE (to_jsonb(NEW)->>'egcs_fc_recovery')::bigint END;
      SELECT * INTO recovery FROM "Funding_Case_Account_Receivable_Recovery" WHERE id = recovery_id;
      IF recovery.egcs_fc_ledgerkind='pool' THEN
        IF NOT EXISTS (SELECT 1 FROM "Funding_Case_Account_Receivable_Offset_Memo_Application" application
          JOIN "Funding_Case_Account_Receivable_Offset_Memo" memo ON memo.id=application.egcs_fc_offsetmemo
          WHERE application.egcs_fc_recovery=recovery.id AND application.egcs_fc_amount=recovery.egcs_fc_amount
            AND memo.egcs_fc_pool=recovery.egcs_fc_pool AND memo.egcs_fc_legacyreceivable IS NULL) THEN
          RAISE EXCEPTION 'Pool deduction requires exact standalone offset memo application' USING ERRCODE='23514';
        END IF;
        IF recovery.egcs_fc_outcome='posted' AND (NOT ar_successful_submission(recovery.egcs_fc_payment,'fundingcasepayment',recovery.egcs_fc_postingruntime)
          OR ar_pool_net(recovery.egcs_fc_pool)<0) THEN RAISE EXCEPTION 'Pool deduction requires latest approval and available aggregate debt' USING ERRCODE='23514'; END IF;
        RETURN NULL;
      END IF;
      IF recovery.egcs_fc_outcome='posted' AND recovery.egcs_fc_payment IS NOT NULL AND ar_pool_net(recovery.egcs_fc_pool)<0 THEN
        RAISE EXCEPTION 'Retained Payment deduction cannot exceed the current aggregate receivable balance' USING ERRCODE='23514';
      END IF;
      IF NOT recovery._deleted AND recovery.egcs_fc_outcome IN ('open','posted') AND COALESCE((SELECT sum(egcs_fc_amount)
        FROM "Funding_Case_Account_Receivable_Allocation" WHERE egcs_fc_recovery = recovery_id AND NOT _deleted),0) <> recovery.egcs_fc_amount THEN
        RAISE EXCEPTION 'Recovery allocations must sum exactly to received or offset principal' USING ERRCODE = '23514';
      END IF;
      IF recovery.egcs_fc_outcome = 'posted' THEN
        target_id := COALESCE(recovery.egcs_fc_payment,recovery.egcs_fc_creditmemo);
        target_type := CASE WHEN recovery.egcs_fc_payment IS NOT NULL THEN 'fundingcasepayment' ELSE 'fundingcaseaccountreceivablecreditmemo' END;
        IF NOT ar_successful_submission(target_id,target_type,recovery.egcs_fc_postingruntime) THEN
          RAISE EXCEPTION 'Recovery posting requires its latest successful approval submission' USING ERRCODE = '23514';
        END IF;
        IF recovery.egcs_fc_creditmemo IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Funding_Case_Account_Receivable_Credit_Memo" repayment WHERE repayment.id = recovery.egcs_fc_creditmemo
          AND repayment.egcs_fc_outcome = 'posted' AND repayment.egcs_fc_postingruntime = recovery.egcs_fc_postingruntime) THEN
          RAISE EXCEPTION 'Recovery and repayment must post atomically' USING ERRCODE = '23514';
        END IF;
        IF EXISTS (SELECT 1 FROM "Funding_Case_Account_Receivable_Allocation" allocation WHERE allocation.egcs_fc_recovery = recovery_id AND NOT allocation._deleted
          AND allocation.egcs_fc_amount <> COALESCE((SELECT sum(posting.egcs_fc_amount) FROM "Funding_Case_Account_Receivable_Posting" posting WHERE posting.egcs_fc_allocation = allocation.id AND NOT posting._deleted),0)) THEN
          RAISE EXCEPTION 'Recovery coding must post every allocated source amount once' USING ERRCODE = '23514';
        END IF;
      ELSIF EXISTS (SELECT 1 FROM "Funding_Case_Account_Receivable_Posting" posting WHERE posting.egcs_fc_recovery = recovery_id) THEN
        RAISE EXCEPTION 'Only successful recoveries may retain accounting postings' USING ERRCODE = '23514';
      END IF;
      RETURN NULL;
    END $function$;

CREATE FUNCTION trg_fn_validate_ar_root()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE owner_agency bigint; owner_currency currency_codes; pool record; definition record; linked record; target_type text;
    BEGIN
      IF TG_OP='INSERT' AND TG_ARGV[0]='fundingcaseaccountreceivablecreditmemo' AND to_jsonb(NEW)->>'egcs_fc_ledgerkind'<>'pool' THEN
        RAISE EXCEPTION 'Legacy credit matching is retained evidence only' USING ERRCODE='23514';
      END IF;
      IF TG_ARGV[0]='fundingcaseaccountreceivablecreditmemo' AND to_jsonb(NEW)->>'egcs_fc_ledgerkind'='pool' THEN
        PERFORM ar_validate_pool_credit_memo(to_jsonb(OLD),to_jsonb(NEW),TG_OP);
        NEW.egcs_fc_statusagency:=NEW.egcs_fc_agency; RETURN NEW;
      END IF;
      IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'AR evidence uses soft deletion' USING ERRCODE = '23514'; END IF;
      target_type := TG_ARGV[0];
      SELECT program.egcs_tp_agency,agreement.egcs_fc_currency INTO owner_agency,owner_currency
        FROM "Funding_Case_Agreement_Profile" agreement
        JOIN "Transfer_Payment_Stream" stream ON stream.id = agreement.egcs_fc_transferpaymentstream
        JOIN "Transfer_Payment_Profile" program ON program.id = stream.egcs_tp_transferpaymentprofile
        WHERE agreement.id = NEW.egcs_fc_fundingagreement;
      SELECT * INTO pool FROM "Funding_Case_Account_Receivable_Pool" WHERE id = NEW.egcs_fc_pool FOR UPDATE;
      IF owner_agency IS NULL OR owner_agency IS DISTINCT FROM pool.egcs_fc_agency
        OR NEW.egcs_fc_currency IS DISTINCT FROM owner_currency OR pool._deleted THEN
        RAISE EXCEPTION 'AR Agency and currencies must match Agreement and pool' USING ERRCODE = '23514';
      END IF;
      SELECT * INTO definition FROM "Common_Status" WHERE id = NEW.egcs_fc_status;
      IF TG_OP = 'INSERT' THEN
        IF NOT definition.egcs_cn_isdraft OR definition.egcs_cn_terminal OR definition._deleted OR definition.egcs_cn_agency <> owner_agency OR NEW.egcs_fc_outcome <> 'open' OR NEW._deleted THEN
          RAISE EXCEPTION 'AR creation requires the owning Agency Draft status' USING ERRCODE = '23514';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Applicant_Recipient" relation
          WHERE relation.egcs_fc_fundingagreement = NEW.egcs_fc_fundingagreement
            AND relation.egcs_fc_applicantrecipient = NEW.egcs_fc_applicantrecipient AND NOT relation._deleted) THEN
          RAISE EXCEPTION 'AR debtor must be an Agreement Proponent' USING ERRCODE = '23514';
        END IF;
      ELSE
        IF (OLD.id,OLD.egcs_fc_fundingagreement,OLD.egcs_fc_pool,OLD.egcs_fc_applicantrecipient,OLD.egcs_fc_currency,OLD.egcs_fc_number,OLD.egcs_fc_agreementnumber,OLD.egcs_fc_createdby,OLD.egcs_fc_createdat)
          IS DISTINCT FROM (NEW.id,NEW.egcs_fc_fundingagreement,NEW.egcs_fc_pool,NEW.egcs_fc_applicantrecipient,NEW.egcs_fc_currency,NEW.egcs_fc_number,NEW.egcs_fc_agreementnumber,NEW.egcs_fc_createdby,NEW.egcs_fc_createdat) THEN
          RAISE EXCEPTION 'AR identity is immutable' USING ERRCODE = '23514';
        END IF;
        IF OLD.egcs_fc_outcome <> 'open' AND to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW) THEN
          RAISE EXCEPTION 'Established AR evidence is immutable' USING ERRCODE = '23514';
        END IF;
        IF ar_has_lifecycle_evidence(OLD.id,target_type)
          AND (to_jsonb(OLD) - ARRAY['egcs_fc_status','egcs_fc_statusagency','egcs_fc_outcome','egcs_fc_postedat','egcs_fc_postingruntime','egcs_fc_terminalby','egcs_fc_terminalat','egcs_fc_terminalreason','egcs_fc_statusterminal','egcs_fc_statusdeleted'])
          IS DISTINCT FROM (to_jsonb(NEW) - ARRAY['egcs_fc_status','egcs_fc_statusagency','egcs_fc_outcome','egcs_fc_postedat','egcs_fc_postingruntime','egcs_fc_terminalby','egcs_fc_terminalat','egcs_fc_terminalreason','egcs_fc_statusterminal','egcs_fc_statusdeleted']) THEN
          RAISE EXCEPTION 'Submitted AR content is immutable' USING ERRCODE = '23514';
        END IF;
        IF NEW._deleted AND NOT OLD._deleted AND (ar_has_lifecycle_evidence(OLD.id,target_type) OR NOT definition.egcs_cn_isdraft) THEN
          RAISE EXCEPTION 'Only unsubmitted AR Drafts may be deleted' USING ERRCODE = '23514';
        END IF;
      END IF;
      NEW.egcs_fc_statusagency := owner_agency;
      IF target_type = 'fundingcaseaccountreceivable' THEN
        IF TG_OP = 'INSERT' THEN
          IF NEW.egcs_fc_linkedreceivable IS NULL THEN
            SELECT * INTO linked FROM "Agency_Account_Receivable_Type" configuration
              WHERE configuration.id = NEW.egcs_fc_type AND configuration.egcs_ay_organizationagency = owner_agency AND NOT configuration._deleted;
            IF linked.id IS NULL THEN RAISE EXCEPTION 'AR type must belong to its owning Agency' USING ERRCODE = '23514'; END IF;
            NEW.egcs_fc_typename_en := linked.egcs_ay_name_en; NEW.egcs_fc_typename_fr := linked.egcs_ay_name_fr;
            NEW.egcs_fc_typedescription_en := linked.egcs_ay_description_en; NEW.egcs_fc_typedescription_fr := linked.egcs_ay_description_fr;
            NEW.egcs_fc_monitorrequired := linked.egcs_ay_monitorrequired;
            NEW.egcs_fc_advancepaymentrelated := linked.egcs_ay_advancepaymentrelated; NEW.egcs_fc_claimrelated := linked.egcs_ay_claimrelated;
          ELSE
            SELECT * INTO linked FROM "Funding_Case_Agreement_Account_Receivable" WHERE id = NEW.egcs_fc_linkedreceivable;
            NEW.egcs_fc_typename_en := linked.egcs_fc_typename_en; NEW.egcs_fc_typename_fr := linked.egcs_fc_typename_fr;
            NEW.egcs_fc_typedescription_en := linked.egcs_fc_typedescription_en; NEW.egcs_fc_typedescription_fr := linked.egcs_fc_typedescription_fr;
            NEW.egcs_fc_monitorrequired := linked.egcs_fc_monitorrequired;
            NEW.egcs_fc_advancepaymentrelated := linked.egcs_fc_advancepaymentrelated; NEW.egcs_fc_claimrelated := linked.egcs_fc_claimrelated;
          END IF;
        ELSIF (OLD.egcs_fc_typename_en,OLD.egcs_fc_typename_fr,OLD.egcs_fc_typedescription_en,OLD.egcs_fc_typedescription_fr,
          OLD.egcs_fc_monitorrequired,OLD.egcs_fc_advancepaymentrelated,OLD.egcs_fc_claimrelated)
          IS DISTINCT FROM (NEW.egcs_fc_typename_en,NEW.egcs_fc_typename_fr,NEW.egcs_fc_typedescription_en,NEW.egcs_fc_typedescription_fr,
          NEW.egcs_fc_monitorrequired,NEW.egcs_fc_advancepaymentrelated,NEW.egcs_fc_claimrelated) THEN
          RAISE EXCEPTION 'AR type definition evidence is immutable' USING ERRCODE = '23514';
        END IF;
        IF NEW.egcs_fc_monitorrequired <> (NEW.egcs_fc_monitorfollowup IS NOT NULL) THEN
          RAISE EXCEPTION 'AR Monitor follow-up must match its retained type requirement' USING ERRCODE = '23514';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM "Agency_Fiscal_Year" fiscal WHERE fiscal.id = NEW.egcs_fc_agencyfiscalyear AND fiscal.egcs_ay_organizationagency = owner_agency) THEN
          RAISE EXCEPTION 'AR fiscal year must belong to owning Agency' USING ERRCODE = '23514';
        END IF;
        IF TG_OP = 'UPDATE' AND (OLD.egcs_fc_type,OLD.egcs_fc_agencyfiscalyear,OLD.egcs_fc_linkedreceivable) IS DISTINCT FROM (NEW.egcs_fc_type,NEW.egcs_fc_agencyfiscalyear,NEW.egcs_fc_linkedreceivable) THEN
          RAISE EXCEPTION 'AR source identity is immutable' USING ERRCODE = '23514';
        END IF;
        IF NEW.egcs_fc_linkedreceivable IS NOT NULL THEN
          SELECT * INTO linked FROM "Funding_Case_Agreement_Account_Receivable" WHERE id = NEW.egcs_fc_linkedreceivable;
          IF linked.egcs_fc_outcome <> 'posted' OR linked.egcs_fc_linkedreceivable IS NOT NULL OR linked._deleted
            OR (linked.egcs_fc_pool,linked.egcs_fc_type,linked.egcs_fc_agencyfiscalyear)
              IS DISTINCT FROM (NEW.egcs_fc_pool,NEW.egcs_fc_type,NEW.egcs_fc_agencyfiscalyear) THEN
            RAISE EXCEPTION 'AR adjustment must link its established original debt' USING ERRCODE = '23514';
          END IF;
          IF TG_OP = 'INSERT' AND ar_outstanding(linked.id) <= 0 THEN
            RAISE EXCEPTION 'A cleared AR cannot be reopened by adjustment' USING ERRCODE = '23514';
          END IF;
          IF EXISTS (SELECT 1 FROM "Funding_Case_Account_Receivable_Recovery" recovery WHERE recovery.egcs_fc_pool = NEW.egcs_fc_pool AND recovery.egcs_fc_outcome = 'open' AND NOT recovery._deleted) THEN
            RAISE EXCEPTION 'Unresolved recovery blocks AR adjustments' USING ERRCODE = '23514';
          END IF;
        END IF;
        IF NEW.egcs_fc_monitorfollowup IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Monitor_Followup" followup
          JOIN "Funding_Case_Agreement_Monitor" monitor ON monitor.id = followup.egcs_fc_fundingagreementmonitor
          WHERE followup.id = NEW.egcs_fc_monitorfollowup AND monitor.egcs_fc_fundingagreement = NEW.egcs_fc_fundingagreement) THEN
          RAISE EXCEPTION 'AR Monitor follow-up must belong to its Agreement' USING ERRCODE = '23514';
        END IF;
      ELSE
        IF NEW.egcs_fc_agency <> owner_agency THEN RAISE EXCEPTION 'Credit Memo Agency must match its pool and anchor Agreement' USING ERRCODE = '23514'; END IF;
      END IF;
      IF EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Correction" correction WHERE correction.egcs_fc_fundingagreement = NEW.egcs_fc_fundingagreement AND correction.egcs_fc_outcome = 'open' AND NOT correction._deleted) THEN
        RAISE EXCEPTION 'An open Correction locks AR source financial activity' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END $function$;

CREATE FUNCTION trg_fn_validate_claim_submitting_proponent()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      IF TG_OP = 'UPDATE' AND (OLD.egcs_fc_fundingagreement,OLD.egcs_fc_applicantrecipient)
        IS NOT DISTINCT FROM (NEW.egcs_fc_fundingagreement,NEW.egcs_fc_applicantrecipient) THEN RETURN NEW; END IF;
      IF NEW.egcs_fc_applicantrecipient IS NULL OR NOT EXISTS (
        SELECT 1 FROM "Funding_Case_Agreement_Applicant_Recipient" relation
        JOIN "Applicant_Recipient_Profile" proponent ON proponent.id = relation.egcs_fc_applicantrecipient AND NOT proponent._deleted AND proponent.egcs_ar_active
        WHERE relation.egcs_fc_fundingagreement = NEW.egcs_fc_fundingagreement
          AND relation.egcs_fc_applicantrecipient = NEW.egcs_fc_applicantrecipient AND NOT relation._deleted
      ) THEN RAISE EXCEPTION 'Claim requires an active submitting Proponent on its Agreement'
        USING ERRCODE = '23514', CONSTRAINT = 'fc_chk_claim_submitting_proponent'; END IF;
      RETURN NEW;
    END $function$;

CREATE FUNCTION trg_fn_validate_correction()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE owner_agency bigint; definition record;
    BEGIN
      IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Correction evidence must be retained' USING ERRCODE = '23514'; END IF;
      PERFORM id FROM "Funding_Case_Agreement_Profile" WHERE id = NEW.egcs_fc_fundingagreement FOR UPDATE;
      IF NOT EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Commitment" commitment
        WHERE commitment.id = NEW.egcs_fc_commitment
          AND commitment.egcs_fc_fundingagreement = NEW.egcs_fc_fundingagreement
          AND commitment.egcs_fc_currency = NEW.egcs_fc_currency) THEN
        RAISE EXCEPTION 'Correction and Commitment currencies must match' USING ERRCODE = '23514';
      END IF;
      SELECT p.egcs_tp_agency INTO owner_agency FROM "Funding_Case_Agreement_Profile" a
        JOIN "Transfer_Payment_Stream" s ON s.id = a.egcs_fc_transferpaymentstream
        JOIN "Transfer_Payment_Profile" p ON p.id = s.egcs_tp_transferpaymentprofile WHERE a.id = NEW.egcs_fc_fundingagreement;
      SELECT * INTO definition FROM "Common_Status" WHERE id = NEW.egcs_fc_status AND _deleted = false FOR KEY SHARE;
      IF owner_agency IS NULL OR definition.egcs_cn_agency IS DISTINCT FROM owner_agency
        OR (TG_OP = 'INSERT' AND (NOT definition.egcs_cn_isdraft OR NEW.egcs_fc_outcome <> 'open')) THEN
        RAISE EXCEPTION 'Correction must have an Agency-owned status and start Draft' USING ERRCODE = '23514';
      END IF;
      IF TG_OP = 'UPDATE' THEN
        IF NEW.egcs_fc_statusagency IS DISTINCT FROM OLD.egcs_fc_statusagency THEN
          RAISE EXCEPTION 'Correction status owner is protected' USING ERRCODE = '23514';
        END IF;
        -- Stored generated columns are unavailable in NEW during BEFORE triggers.
        IF OLD.egcs_fc_outcome <> 'open' AND
          (to_jsonb(NEW) - ARRAY['egcs_fc_statusterminal','egcs_fc_statusdeleted'])
          IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['egcs_fc_statusterminal','egcs_fc_statusdeleted']) THEN
          RAISE EXCEPTION 'Terminal Corrections are immutable' USING ERRCODE = '23514';
        END IF;
        IF (OLD.id,OLD.egcs_fc_fundingagreement,OLD.egcs_fc_commitment,OLD.egcs_fc_number,OLD.egcs_fc_agreementnumber,OLD.egcs_fc_currency,OLD.egcs_fc_createdby,OLD.egcs_fc_createdat)
          IS DISTINCT FROM (NEW.id,NEW.egcs_fc_fundingagreement,NEW.egcs_fc_commitment,NEW.egcs_fc_number,NEW.egcs_fc_agreementnumber,NEW.egcs_fc_currency,NEW.egcs_fc_createdby,NEW.egcs_fc_createdat) THEN
          RAISE EXCEPTION 'Correction identity and attribution are immutable' USING ERRCODE = '23514';
        END IF;
        IF correction_has_lifecycle_evidence(OLD.id) AND
          (to_jsonb(OLD) - ARRAY['egcs_fc_status','egcs_fc_outcome','egcs_fc_postedat','egcs_fc_postingruntime','egcs_fc_terminalby','egcs_fc_terminalat','egcs_fc_terminalreason','egcs_fc_statusterminal','egcs_fc_statusdeleted'])
          IS DISTINCT FROM
          (to_jsonb(NEW) - ARRAY['egcs_fc_status','egcs_fc_outcome','egcs_fc_postedat','egcs_fc_postingruntime','egcs_fc_terminalby','egcs_fc_terminalat','egcs_fc_terminalreason','egcs_fc_statusterminal','egcs_fc_statusdeleted']) THEN
          RAISE EXCEPTION 'Submitted Correction content is immutable' USING ERRCODE = '23514';
        END IF;
        IF NEW._deleted AND NOT OLD._deleted AND (NOT definition.egcs_cn_isdraft OR correction_has_lifecycle_evidence(OLD.id)) THEN
          RAISE EXCEPTION 'Only unsubmitted Correction Drafts may be deleted' USING ERRCODE = '23514';
        END IF;
      END IF;
      NEW.egcs_fc_statusagency := owner_agency;
      RETURN NEW;
    END $function$;

CREATE FUNCTION trg_fn_validate_correction_posting()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE root_id bigint; root record;
    BEGIN
      IF TG_TABLE_NAME = 'Funding_Case_Agreement_Correction' THEN root_id := NEW.id; ELSE root_id := NEW.egcs_fc_correction; END IF;
      SELECT * INTO root FROM "Funding_Case_Agreement_Correction" WHERE id = root_id;
      IF NOT root._deleted AND root.egcs_fc_outcome = 'open' AND EXISTS (SELECT 1 FROM "Common_Status" WHERE id = root.egcs_fc_status AND egcs_cn_terminal) THEN
        RAISE EXCEPTION 'Open Corrections require a nonterminal Agency status' USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_correction_status_outcome';
      END IF;
      IF NOT root._deleted AND root.egcs_fc_outcome <> 'open' AND NOT EXISTS (SELECT 1 FROM "Common_Status" WHERE id = root.egcs_fc_status AND egcs_cn_terminal) THEN
        RAISE EXCEPTION 'Terminal Correction outcomes require a terminal Agency status' USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_correction_status_outcome';
      END IF;
      IF root.egcs_fc_outcome = 'posted' THEN
        IF NOT EXISTS (SELECT 1 FROM "Common_Runtime" runtime
          JOIN "Common_Workflow_Run" run ON run.id = runtime.id
          JOIN "Common_Completion" completion ON completion.id = run.egcs_cn_completion
          WHERE runtime.id = root.egcs_fc_postingruntime AND runtime.egcs_cn_kind = 'workflow'
            AND runtime.egcs_cn_entitytype = 'fundingcasecorrection' AND runtime.egcs_cn_entityid = root_id
            AND runtime.egcs_cn_purpose = 'approval_submission' AND runtime.egcs_cn_state IN ('succeeded','approved')
            AND completion.egcs_cn_entitytype = 'fundingcasecorrection' AND completion.egcs_cn_entityid = root_id
            AND completion.egcs_cn_disposition = 'workflow_started'
            AND NOT runtime._deleted AND NOT completion._deleted) THEN
          RAISE EXCEPTION 'Correction posting requires its successful Completion-linked approval submission' USING ERRCODE = '23514';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Correction_Line" WHERE egcs_fc_correction = root_id AND NOT _deleted AND egcs_fc_adjustment <> 0)
          OR EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Correction_Line" line
            LEFT JOIN "Funding_Case_Agreement_Correction_Adjustment" adjustment ON adjustment.egcs_fc_correctionline = line.id AND NOT adjustment._deleted
            WHERE line.egcs_fc_correction = root_id AND NOT line._deleted AND
              ((line.egcs_fc_adjustment <> 0 AND (adjustment.id IS NULL OR adjustment.egcs_fc_amount <> line.egcs_fc_adjustment))
               OR (line.egcs_fc_adjustment = 0 AND adjustment.id IS NOT NULL))) THEN
          RAISE EXCEPTION 'Correction posting must contain every nonzero signed adjustment exactly once' USING ERRCODE = '23514';
        END IF;
      ELSIF EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Correction_Adjustment" WHERE egcs_fc_correction = root_id) THEN
        RAISE EXCEPTION 'Only posted Corrections may have adjustment entries' USING ERRCODE = '23514';
      END IF;
      IF EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Correction_Adjustment" adjustment
        JOIN "Funding_Case_Agreement_Correction_Line" line ON line.id = adjustment.egcs_fc_correctionline
        WHERE adjustment.egcs_fc_correction = root_id AND
          (adjustment._deleted OR line._deleted OR adjustment.egcs_fc_commitmentline <> line.egcs_fc_commitmentline
            OR adjustment.egcs_fc_chartofaccount <> line.egcs_fc_chartofaccount
            OR adjustment.egcs_fc_agencyfiscalyear <> line.egcs_fc_agencyfiscalyear)) THEN
        RAISE EXCEPTION 'Correction posting must preserve captured line lineage' USING ERRCODE = '23514';
      END IF;
      IF EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Correction_Notification" notification
        WHERE notification.egcs_fc_correction = root_id AND (root.egcs_fc_outcome = 'open' OR notification.egcs_fc_outcome <> root.egcs_fc_outcome)) THEN
        RAISE EXCEPTION 'Correction outcome notifications must match retained outcome' USING ERRCODE = '23514';
      END IF;
      RETURN NULL;
    END $function$;

CREATE FUNCTION trg_fn_validate_funding_status_agency()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
    $function$;

CREATE FUNCTION trg_fn_validate_jv()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE owner_agency bigint; definition record; source record;
    BEGIN
      SELECT p.egcs_tp_agency INTO owner_agency FROM "Funding_Case_Agreement_Profile" a
        JOIN "Transfer_Payment_Stream" s ON s.id = a.egcs_fc_transferpaymentstream
        JOIN "Transfer_Payment_Profile" p ON p.id = s.egcs_tp_transferpaymentprofile
        WHERE a.id = NEW.egcs_fc_fundingagreement;
      SELECT * INTO definition FROM "Common_Status" WHERE id = NEW.egcs_fc_status AND _deleted = false;
      IF definition.egcs_cn_agency IS DISTINCT FROM owner_agency OR owner_agency IS NULL
        OR (TG_OP = 'INSERT' AND NOT definition.egcs_cn_isdraft) THEN
        RAISE EXCEPTION 'JV status must belong to its Agency and start Draft' USING ERRCODE = '23514';
      END IF;
      SELECT * INTO source FROM "Funding_Case_Agreement_Payment" WHERE id = NEW.egcs_fc_payment;
      IF source.egcs_fc_fiscalyear IS DISTINCT FROM NEW.egcs_fc_fiscalyear
        OR source.egcs_fc_currency IS DISTINCT FROM NEW.egcs_fc_currency
        OR NOT EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Budget_Fiscal_Year" y
          WHERE y.id = NEW.egcs_fc_fiscalyear AND y.egcs_fc_fiscalyear = NEW.egcs_fc_agencyfiscalyear)
        OR NOT EXISTS (SELECT 1 FROM "Agency_Fiscal_Year" y WHERE y.id = NEW.egcs_fc_agencyfiscalyear AND y.egcs_ay_organizationagency = owner_agency) THEN
        RAISE EXCEPTION 'JV source fiscal year and currency must match Payment' USING ERRCODE = '23514';
      END IF;
      IF TG_OP = 'UPDATE' AND (to_jsonb(OLD) - 'egcs_fc_status') IS DISTINCT FROM (to_jsonb(NEW) - 'egcs_fc_status')
        AND EXISTS (SELECT 1 FROM "Common_Completion" WHERE egcs_cn_entitytype = 'fundingcasejournalvoucher' AND egcs_cn_entityid = OLD.id) THEN
        RAISE EXCEPTION 'Completed JV accounting data is locked' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END $function$;
END $baseline$`.execute(db)
}

/** Installs the current installForeignKeys definitions for this subject on a fresh database. */
export const installForeignKeys = async (db: Kysely<Database>): Promise<void> => {
  await sql`DO $baseline$ BEGIN
ALTER TABLE "Funding_Case_Account_Receivable_Allocation" ADD CONSTRAINT "fc_fk_ar_allocation_line" FOREIGN KEY (egcs_fc_receivableline, egcs_fc_receivable, egcs_fc_fundingagreement) REFERENCES "Funding_Case_Agreement_Account_Receivable_Line"(id, egcs_fc_receivable, egcs_fc_fundingagreement) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Account_Receivable_Allocation" ADD CONSTRAINT "Funding_Case_Account_Receivable_Allocatio_egcs_fc_recovery_fkey" FOREIGN KEY (egcs_fc_recovery) REFERENCES "Funding_Case_Account_Receivable_Recovery"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Account_Receivable_Credit_Memo" ADD CONSTRAINT "cn_chk_ar_creditmemo_status_in_use" FOREIGN KEY (egcs_fc_status, egcs_fc_statusagency, egcs_fc_statusdeleted) REFERENCES "Common_Status"(id, egcs_cn_agency, _deleted) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "Funding_Case_Account_Receivable_Credit_Memo" ADD CONSTRAINT "cn_chk_ar_creditmemo_status_outcome" FOREIGN KEY (egcs_fc_status, egcs_fc_statusterminal) REFERENCES "Common_Status"(id, egcs_cn_terminal) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "Funding_Case_Account_Receivable_Credit_Memo" ADD CONSTRAINT "fc_fk_ar_creditmemo_pool" FOREIGN KEY (egcs_fc_pool, egcs_fc_applicantrecipient, egcs_fc_currency) REFERENCES "Funding_Case_Account_Receivable_Pool"(id, egcs_fc_applicantrecipient, egcs_fc_currency) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Account_Receivable_Credit_Memo" ADD CONSTRAINT "Funding_Case_Account_Receivable_C_egcs_fc_fundingagreement_fkey" FOREIGN KEY (egcs_fc_fundingagreement) REFERENCES "Funding_Case_Agreement_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Account_Receivable_Credit_Memo" ADD CONSTRAINT "Funding_Case_Account_Receivable_Cre_egcs_fc_postingruntime_fkey" FOREIGN KEY (egcs_fc_postingruntime) REFERENCES "Common_Runtime"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Account_Receivable_Credit_Memo" ADD CONSTRAINT "Funding_Case_Account_Receivable_Credit__egcs_fc_terminalby_fkey" FOREIGN KEY (egcs_fc_terminalby) REFERENCES "Common_User"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Account_Receivable_Credit_Memo" ADD CONSTRAINT "Funding_Case_Account_Receivable_Credit_M_egcs_fc_createdby_fkey" FOREIGN KEY (egcs_fc_createdby) REFERENCES "Common_User"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Account_Receivable_Credit_Memo" ADD CONSTRAINT "Funding_Case_Account_Receivable_Credit_Memo_egcs_fc_agency_fkey" FOREIGN KEY (egcs_fc_agency) REFERENCES "Agency_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Account_Receivable_Credit_Memo" ADD CONSTRAINT "Funding_Case_Account_Receivable_Credit_Memo_egcs_fc_status_fkey" FOREIGN KEY (egcs_fc_status) REFERENCES "Common_Status"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Account_Receivable_Credit_Memo" ADD CONSTRAINT "Funding_Case_Account_Receivable_Credit_Memo_id_fkey" FOREIGN KEY (id) REFERENCES "Common_Entity"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Account_Receivable_Offset_Memo" ADD CONSTRAINT "Funding_Case_Account_Receivable_Offset__egcs_fc_receivable_fkey" FOREIGN KEY (egcs_fc_legacyreceivable) REFERENCES "Funding_Case_Agreement_Account_Receivable"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Account_Receivable_Offset_Memo" ADD CONSTRAINT "Funding_Case_Account_Receivable_Offset_Memo_egcs_fc_pool_fkey" FOREIGN KEY (egcs_fc_pool) REFERENCES "Funding_Case_Account_Receivable_Pool"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Account_Receivable_Offset_Memo_Application" ADD CONSTRAINT "Funding_Case_Account_Receivable_Offset__egcs_fc_allocation_fkey" FOREIGN KEY (egcs_fc_allocation) REFERENCES "Funding_Case_Account_Receivable_Allocation"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Account_Receivable_Offset_Memo_Application" ADD CONSTRAINT "Funding_Case_Account_Receivable_Offset__egcs_fc_offsetmemo_fkey" FOREIGN KEY (egcs_fc_offsetmemo) REFERENCES "Funding_Case_Account_Receivable_Offset_Memo"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Account_Receivable_Offset_Memo_Application" ADD CONSTRAINT "Funding_Case_Account_Receivable_Offset_Me_egcs_fc_recovery_fkey" FOREIGN KEY (egcs_fc_recovery) REFERENCES "Funding_Case_Account_Receivable_Recovery"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Account_Receivable_Pool" ADD CONSTRAINT "Funding_Case_Account_Receivable_egcs_fc_applicantrecipient_fkey" FOREIGN KEY (egcs_fc_applicantrecipient) REFERENCES "Applicant_Recipient_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Account_Receivable_Pool" ADD CONSTRAINT "Funding_Case_Account_Receivable_Pool_egcs_fc_agency_fkey" FOREIGN KEY (egcs_fc_agency) REFERENCES "Agency_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Account_Receivable_Posting" ADD CONSTRAINT "fc_fk_ar_posting_allocation" FOREIGN KEY (egcs_fc_allocation, egcs_fc_recovery) REFERENCES "Funding_Case_Account_Receivable_Allocation"(id, egcs_fc_recovery) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Account_Receivable_Posting" ADD CONSTRAINT "Funding_Case_Account_Receivab_egcs_fc_accountreceivablecha_fkey" FOREIGN KEY (egcs_fc_accountreceivablechartofaccount) REFERENCES "Agency_Chart_of_Account"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Account_Receivable_Posting" ADD CONSTRAINT "Funding_Case_Account_Receivab_egcs_fc_agencychartofaccount_fkey" FOREIGN KEY (egcs_fc_agencychartofaccount) REFERENCES "Agency_Chart_of_Account"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Account_Receivable_Posting" ADD CONSTRAINT "Funding_Case_Account_Receivable_P_egcs_fc_agencyfiscalyear_fkey" FOREIGN KEY (egcs_fc_agencyfiscalyear) REFERENCES "Agency_Fiscal_Year"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Account_Receivable_Posting" ADD CONSTRAINT "Funding_Case_Account_Receivable_P_egcs_fc_fundingagreement_fkey" FOREIGN KEY (egcs_fc_fundingagreement) REFERENCES "Funding_Case_Agreement_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Account_Receivable_Posting" ADD CONSTRAINT "Funding_Case_Account_Receivable_Pos_egcs_fc_chartofaccount_fkey" FOREIGN KEY (egcs_fc_chartofaccount) REFERENCES "Transfer_Payment_Stream_Chart_of_Account"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Account_Receivable_Posting" ADD CONSTRAINT "Funding_Case_Account_Receivable_Pos_egcs_fc_commitmentline_fkey" FOREIGN KEY (egcs_fc_commitmentline) REFERENCES "Funding_Case_Agreement_Commitment_Line"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Account_Receivable_Posting" ADD CONSTRAINT "Funding_Case_Account_Receivable_Posting_egcs_fc_coding_fkey" FOREIGN KEY (egcs_fc_coding) REFERENCES "Funding_Case_Agreement_Account_Receivable_Coding"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Account_Receivable_Posting" ADD CONSTRAINT "Funding_Case_Account_Receivable_Posting_egcs_fc_receivable_fkey" FOREIGN KEY (egcs_fc_receivable) REFERENCES "Funding_Case_Agreement_Account_Receivable"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Account_Receivable_Recovery" ADD CONSTRAINT "Funding_Case_Account_Receivable_Rec_egcs_fc_postingruntime_fkey" FOREIGN KEY (egcs_fc_postingruntime) REFERENCES "Common_Runtime"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Account_Receivable_Recovery" ADD CONSTRAINT "Funding_Case_Account_Receivable_Recover_egcs_fc_creditmemo_fkey" FOREIGN KEY (egcs_fc_creditmemo) REFERENCES "Funding_Case_Account_Receivable_Credit_Memo"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Account_Receivable_Recovery" ADD CONSTRAINT "Funding_Case_Account_Receivable_Recovery_egcs_fc_payment_fkey" FOREIGN KEY (egcs_fc_payment) REFERENCES "Funding_Case_Agreement_Payment"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Account_Receivable_Recovery" ADD CONSTRAINT "Funding_Case_Account_Receivable_Recovery_egcs_fc_pool_fkey" FOREIGN KEY (egcs_fc_pool) REFERENCES "Funding_Case_Account_Receivable_Pool"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Account_Receivable" ADD CONSTRAINT "cn_chk_ar_status_in_use" FOREIGN KEY (egcs_fc_status, egcs_fc_statusagency, egcs_fc_statusdeleted) REFERENCES "Common_Status"(id, egcs_cn_agency, _deleted) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "Funding_Case_Agreement_Account_Receivable" ADD CONSTRAINT "cn_chk_ar_status_outcome" FOREIGN KEY (egcs_fc_status, egcs_fc_statusterminal) REFERENCES "Common_Status"(id, egcs_cn_terminal) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "Funding_Case_Agreement_Account_Receivable" ADD CONSTRAINT "fc_fk_ar_link" FOREIGN KEY (egcs_fc_linkedreceivable, egcs_fc_fundingagreement) REFERENCES "Funding_Case_Agreement_Account_Receivable"(id, egcs_fc_fundingagreement) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Account_Receivable" ADD CONSTRAINT "fc_fk_ar_pool" FOREIGN KEY (egcs_fc_pool, egcs_fc_applicantrecipient, egcs_fc_currency) REFERENCES "Funding_Case_Account_Receivable_Pool"(id, egcs_fc_applicantrecipient, egcs_fc_currency) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Account_Receivable" ADD CONSTRAINT "Funding_Case_Agreement_Account__egcs_fc_applicantrecipient_fkey" FOREIGN KEY (egcs_fc_applicantrecipient) REFERENCES "Applicant_Recipient_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Account_Receivable" ADD CONSTRAINT "Funding_Case_Agreement_Account_Re_egcs_fc_agencyfiscalyear_fkey" FOREIGN KEY (egcs_fc_agencyfiscalyear) REFERENCES "Agency_Fiscal_Year"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Account_Receivable" ADD CONSTRAINT "Funding_Case_Agreement_Account_Re_egcs_fc_fundingagreement_fkey" FOREIGN KEY (egcs_fc_fundingagreement) REFERENCES "Funding_Case_Agreement_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Account_Receivable" ADD CONSTRAINT "Funding_Case_Agreement_Account_Rec_egcs_fc_monitorfollowup_fkey" FOREIGN KEY (egcs_fc_monitorfollowup) REFERENCES "Funding_Case_Agreement_Monitor_Followup"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Account_Receivable" ADD CONSTRAINT "Funding_Case_Agreement_Account_Rece_egcs_fc_postingruntime_fkey" FOREIGN KEY (egcs_fc_postingruntime) REFERENCES "Common_Runtime"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Account_Receivable" ADD CONSTRAINT "Funding_Case_Agreement_Account_Receivab_egcs_fc_terminalby_fkey" FOREIGN KEY (egcs_fc_terminalby) REFERENCES "Common_User"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Account_Receivable" ADD CONSTRAINT "Funding_Case_Agreement_Account_Receivabl_egcs_fc_createdby_fkey" FOREIGN KEY (egcs_fc_createdby) REFERENCES "Common_User"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Account_Receivable" ADD CONSTRAINT "Funding_Case_Agreement_Account_Receivable_egcs_fc_status_fkey" FOREIGN KEY (egcs_fc_status) REFERENCES "Common_Status"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Account_Receivable" ADD CONSTRAINT "Funding_Case_Agreement_Account_Receivable_egcs_fc_type_fkey" FOREIGN KEY (egcs_fc_type) REFERENCES "Agency_Account_Receivable_Type"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Account_Receivable" ADD CONSTRAINT "Funding_Case_Agreement_Account_Receivable_id_fkey" FOREIGN KEY (id) REFERENCES "Common_Entity"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Account_Receivable_Coding" ADD CONSTRAINT "fc_fk_ar_coding_line" FOREIGN KEY (egcs_fc_receivableline, egcs_fc_receivable, egcs_fc_fundingagreement) REFERENCES "Funding_Case_Agreement_Account_Receivable_Line"(id, egcs_fc_receivable, egcs_fc_fundingagreement) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Account_Receivable_Coding" ADD CONSTRAINT "Funding_Case_Agreement_Accoun_egcs_fc_agencychartofaccount_fkey" FOREIGN KEY (egcs_fc_agencychartofaccount) REFERENCES "Agency_Chart_of_Account"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Account_Receivable_Coding" ADD CONSTRAINT "Funding_Case_Agreement_Account_R_egcs_fc_agencyfiscalyear_fkey1" FOREIGN KEY (egcs_fc_agencyfiscalyear) REFERENCES "Agency_Fiscal_Year"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Account_Receivable_Coding" ADD CONSTRAINT "Funding_Case_Agreement_Account_Rece_egcs_fc_chartofaccount_fkey" FOREIGN KEY (egcs_fc_chartofaccount) REFERENCES "Transfer_Payment_Stream_Chart_of_Account"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Account_Receivable_Coding" ADD CONSTRAINT "Funding_Case_Agreement_Account_Rece_egcs_fc_commitmentline_fkey" FOREIGN KEY (egcs_fc_commitmentline) REFERENCES "Funding_Case_Agreement_Commitment_Line"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Account_Receivable_Line" ADD CONSTRAINT "fc_fk_ar_line_original" FOREIGN KEY (egcs_fc_originalline) REFERENCES "Funding_Case_Agreement_Account_Receivable_Line"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Account_Receivable_Line" ADD CONSTRAINT "fc_fk_ar_line_root" FOREIGN KEY (egcs_fc_receivable, egcs_fc_fundingagreement) REFERENCES "Funding_Case_Agreement_Account_Receivable"(id, egcs_fc_fundingagreement) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Account_Receivable_Line" ADD CONSTRAINT "Funding_Case_Agreement_Accoun_egcs_fc_accountreceivablecha_fkey" FOREIGN KEY (egcs_fc_accountreceivablechartofaccount) REFERENCES "Agency_Chart_of_Account"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Account_Receivable_Line" ADD CONSTRAINT "Funding_Case_Agreement_Account_Recei_egcs_fc_reconcileline_fkey" FOREIGN KEY (egcs_fc_reconcileline) REFERENCES "Funding_Case_Agreement_Claim_Reconcile_Line_Item"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Account_Receivable_Line" ADD CONSTRAINT "Funding_Case_Agreement_Account_Receivabl_egcs_fc_claimline_fkey" FOREIGN KEY (egcs_fc_claimline) REFERENCES "Funding_Case_Agreement_Claim_Line_Item"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Account_Receivable_Line" ADD CONSTRAINT "Funding_Case_Agreement_Account_Receivable__egcs_fc_payment_fkey" FOREIGN KEY (egcs_fc_payment) REFERENCES "Funding_Case_Agreement_Payment"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Account_Receivable_Line" ADD CONSTRAINT "Funding_Case_Agreement_Account_Receivable_Li_egcs_fc_claim_fkey" FOREIGN KEY (egcs_fc_claim) REFERENCES "Funding_Case_Agreement_Claim"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Activity" ADD CONSTRAINT "fc_ref_activityversionagreement" FOREIGN KEY (egcs_fc_activityversion, egcs_fc_fundingagreement) REFERENCES "Funding_Case_Agreement_Activity_Version"(id, egcs_fc_fundingagreement) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Activity" ADD CONSTRAINT "Funding_Case_Agreement_Activity_egcs_fc_fundingagreement_fkey" FOREIGN KEY (egcs_fc_fundingagreement) REFERENCES "Funding_Case_Agreement_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Activity_Version" ADD CONSTRAINT "fc_ref_activityversionamendmentagreement" FOREIGN KEY (egcs_fc_amendment, egcs_fc_fundingagreement) REFERENCES "Funding_Case_Agreement_Amendment"(id, egcs_fc_fundingagreement) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Activity_Version" ADD CONSTRAINT "fc_ref_activityversionsourceagreement" FOREIGN KEY (egcs_fc_sourceversion, egcs_fc_fundingagreement) REFERENCES "Funding_Case_Agreement_Activity_Version"(id, egcs_fc_fundingagreement) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Activity_Version" ADD CONSTRAINT "Funding_Case_Agreement_Activity_V_egcs_fc_fundingagreement_fkey" FOREIGN KEY (egcs_fc_fundingagreement) REFERENCES "Funding_Case_Agreement_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Address" ADD CONSTRAINT "Funding_Case_Agreement_Address_egcs_fc_address_fkey" FOREIGN KEY (egcs_fc_address) REFERENCES "Common_Address"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Address" ADD CONSTRAINT "Funding_Case_Agreement_Address_egcs_fc_addresstype_fkey" FOREIGN KEY (egcs_fc_addresstype) REFERENCES "Agency_Address_Type"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Address" ADD CONSTRAINT "Funding_Case_Agreement_Address_egcs_fc_fundingagreement_fkey" FOREIGN KEY (egcs_fc_fundingagreement) REFERENCES "Funding_Case_Agreement_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Amendment" ADD CONSTRAINT "Funding_Case_Agreement_Amendment_egcs_fc_fundingagreement_fkey" FOREIGN KEY (egcs_fc_fundingagreement) REFERENCES "Funding_Case_Agreement_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Amendment" ADD CONSTRAINT "Funding_Case_Agreement_Amendment_egcs_fc_status_fkey" FOREIGN KEY (egcs_fc_status) REFERENCES "Common_Status"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Amendment" ADD CONSTRAINT "Funding_Case_Agreement_Amendment_id_fkey" FOREIGN KEY (id) REFERENCES "Common_Entity"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Amendment_Subtype" ADD CONSTRAINT "Funding_Case_Agreement_Amendment__egcs_fc_amendmentsubtype_fkey" FOREIGN KEY (egcs_fc_amendmentsubtype) REFERENCES "Transfer_Payment_Amendment_Subtype"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Amendment_Subtype" ADD CONSTRAINT "Funding_Case_Agreement_Amendment_Subtype_egcs_fc_amendment_fkey" FOREIGN KEY (egcs_fc_amendment) REFERENCES "Funding_Case_Agreement_Amendment"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Amendment_Type" ADD CONSTRAINT "Funding_Case_Agreement_Amendment_Typ_egcs_fc_amendmenttype_fkey" FOREIGN KEY (egcs_fc_amendmenttype) REFERENCES "Transfer_Payment_Amendment_Type"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Amendment_Type" ADD CONSTRAINT "Funding_Case_Agreement_Amendment_Type_egcs_fc_amendment_fkey" FOREIGN KEY (egcs_fc_amendment) REFERENCES "Funding_Case_Agreement_Amendment"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Applicant_Recipient" ADD CONSTRAINT "Funding_Case_Agreement_Applic_egcs_fc_applicantrecipientsu_fkey" FOREIGN KEY (egcs_fc_applicantrecipientsubtype) REFERENCES "Agency_Applicant_Recipient_Subtype"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Applicant_Recipient" ADD CONSTRAINT "Funding_Case_Agreement_Applican_egcs_fc_applicantrecipient_fkey" FOREIGN KEY (egcs_fc_applicantrecipient) REFERENCES "Applicant_Recipient_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Applicant_Recipient" ADD CONSTRAINT "Funding_Case_Agreement_Applicant__egcs_fc_fundingagreement_fkey" FOREIGN KEY (egcs_fc_fundingagreement) REFERENCES "Funding_Case_Agreement_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Approval_Submission" ADD CONSTRAINT "fc_ref_approvalsubmissionamendmentagreement" FOREIGN KEY (egcs_fc_amendment, egcs_fc_fundingagreement) REFERENCES "Funding_Case_Agreement_Amendment"(id, egcs_fc_fundingagreement) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Approval_Submission" ADD CONSTRAINT "Funding_Case_Agreement_Approval_S_egcs_fc_fundingagreement_fkey" FOREIGN KEY (egcs_fc_fundingagreement) REFERENCES "Funding_Case_Agreement_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Approval_Submission" ADD CONSTRAINT "Funding_Case_Agreement_Approval_Submis_egcs_fc_workflowrun_fkey" FOREIGN KEY (egcs_fc_workflowrun) REFERENCES "Common_Workflow_Run"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Budget_Fiscal_Year" ADD CONSTRAINT "fc_ref_budgetfiscalyearoriginalagreement" FOREIGN KEY (egcs_fc_originalbudgetfiscalyear, egcs_fc_fundingagreement) REFERENCES "Funding_Case_Agreement_Budget_Fiscal_Year"(id, egcs_fc_fundingagreement) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Budget_Fiscal_Year" ADD CONSTRAINT "fc_ref_budgetfiscalyearversionagreement" FOREIGN KEY (egcs_fc_budgetversion, egcs_fc_fundingagreement) REFERENCES "Funding_Case_Agreement_Budget_Version"(id, egcs_fc_fundingagreement) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Budget_Fiscal_Year" ADD CONSTRAINT "Funding_Case_Agreement_Budget_Fis_egcs_fc_fundingagreement_fkey" FOREIGN KEY (egcs_fc_fundingagreement) REFERENCES "Funding_Case_Agreement_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Budget_Fiscal_Year" ADD CONSTRAINT "Funding_Case_Agreement_Budget_Fiscal_Ye_egcs_fc_fiscalyear_fkey" FOREIGN KEY (egcs_fc_fiscalyear) REFERENCES "Agency_Fiscal_Year"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Budget_Line_Item" ADD CONSTRAINT "fc_ref_budgetlineitemfiscalyearagreement" FOREIGN KEY (egcs_fc_fundingagreementbudgetfiscalyear, egcs_fc_fundingagreement) REFERENCES "Funding_Case_Agreement_Budget_Fiscal_Year"(id, egcs_fc_fundingagreement) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Budget_Line_Item" ADD CONSTRAINT "fc_ref_budgetlineitemoriginalagreement" FOREIGN KEY (egcs_fc_originalbudgetlineitem, egcs_fc_fundingagreement) REFERENCES "Funding_Case_Agreement_Budget_Line_Item"(id, egcs_fc_fundingagreement) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Budget_Line_Item" ADD CONSTRAINT "Funding_Case_Agreement_Budget_egcs_fc_organizationcostcate_fkey" FOREIGN KEY (egcs_fc_organizationcostcategory) REFERENCES "Transfer_Payment_Stream_Cost_Category_Line_Item"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Budget_Line_Item" ADD CONSTRAINT "Funding_Case_Agreement_Budget_Line__egcs_fc_sourcecategory_fkey" FOREIGN KEY (egcs_fc_sourcecategory) REFERENCES "Agency_Cost_Category"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Budget_Line_Item_Funding" ADD CONSTRAINT "Funding_Case_Agreement_Budget_Line__egcs_fc_budgetlineitem_fkey" FOREIGN KEY (egcs_fc_budgetlineitem) REFERENCES "Funding_Case_Agreement_Budget_Line_Item"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Budget_Line_Item_Funding" ADD CONSTRAINT "Funding_Case_Agreement_Budget_Line__egcs_fc_fundingsubtype_fkey" FOREIGN KEY (egcs_fc_fundingsubtype) REFERENCES "Agency_Funding_Subtype"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Budget_Version" ADD CONSTRAINT "fc_ref_budgetversionamendmentagreement" FOREIGN KEY (egcs_fc_amendment, egcs_fc_fundingagreement) REFERENCES "Funding_Case_Agreement_Amendment"(id, egcs_fc_fundingagreement) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Budget_Version" ADD CONSTRAINT "fc_ref_budgetversionsourceagreement" FOREIGN KEY (egcs_fc_sourceversion, egcs_fc_fundingagreement) REFERENCES "Funding_Case_Agreement_Budget_Version"(id, egcs_fc_fundingagreement) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Budget_Version" ADD CONSTRAINT "Funding_Case_Agreement_Budget_Ver_egcs_fc_fundingagreement_fkey" FOREIGN KEY (egcs_fc_fundingagreement) REFERENCES "Funding_Case_Agreement_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Claim" ADD CONSTRAINT "fc_ref_claimfiscalyearagreement" FOREIGN KEY (egcs_fc_fiscalyear, egcs_fc_fundingagreement) REFERENCES "Funding_Case_Agreement_Budget_Fiscal_Year"(id, egcs_fc_fundingagreement) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Claim" ADD CONSTRAINT "Funding_Case_Agreement_Claim_egcs_fc_applicantrecipient_fkey" FOREIGN KEY (egcs_fc_applicantrecipient) REFERENCES "Applicant_Recipient_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Claim" ADD CONSTRAINT "Funding_Case_Agreement_Claim_egcs_fc_fiscalyear_fkey" FOREIGN KEY (egcs_fc_fiscalyear) REFERENCES "Funding_Case_Agreement_Budget_Fiscal_Year"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Claim" ADD CONSTRAINT "Funding_Case_Agreement_Claim_egcs_fc_fundingagreement_fkey" FOREIGN KEY (egcs_fc_fundingagreement) REFERENCES "Funding_Case_Agreement_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Claim" ADD CONSTRAINT "Funding_Case_Agreement_Claim_egcs_fc_status_fkey" FOREIGN KEY (egcs_fc_status) REFERENCES "Common_Status"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Claim" ADD CONSTRAINT "Funding_Case_Agreement_Claim_id_fkey" FOREIGN KEY (id) REFERENCES "Common_Entity"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Claim_Line_Item" ADD CONSTRAINT "fc_ref_claimlinebudgetlineagreement" FOREIGN KEY (egcs_fc_fundingagreementbudgetlineitem, egcs_fc_fundingagreement) REFERENCES "Funding_Case_Agreement_Budget_Line_Item"(id, egcs_fc_fundingagreement) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Claim_Line_Item" ADD CONSTRAINT "fc_ref_claimlineclaimagreement" FOREIGN KEY (egcs_fc_fundingagreementclaim, egcs_fc_fundingagreement) REFERENCES "Funding_Case_Agreement_Claim"(id, egcs_fc_fundingagreement) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Claim_Line_Item" ADD CONSTRAINT "Funding_Case_Agreement_Claim__egcs_fc_fundingagreementbudg_fkey" FOREIGN KEY (egcs_fc_fundingagreementbudgetlineitem) REFERENCES "Funding_Case_Agreement_Budget_Line_Item"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Claim_Line_Item" ADD CONSTRAINT "Funding_Case_Agreement_Claim__egcs_fc_fundingagreementclai_fkey" FOREIGN KEY (egcs_fc_fundingagreementclaim) REFERENCES "Funding_Case_Agreement_Claim"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Claim_Line_Item_Funding" ADD CONSTRAINT "Funding_Case_Agreement_Claim_Line_I_egcs_fc_fundingsubtype_fkey" FOREIGN KEY (egcs_fc_fundingsubtype) REFERENCES "Agency_Funding_Subtype"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Claim_Line_Item_Funding" ADD CONSTRAINT "Funding_Case_Agreement_Claim_Line_It_egcs_fc_claimlineitem_fkey" FOREIGN KEY (egcs_fc_claimlineitem) REFERENCES "Funding_Case_Agreement_Claim_Line_Item"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Claim_Reconcile" ADD CONSTRAINT "Funding_Case_Agreement_Claim_egcs_fc_fundingagreementclai_fkey1" FOREIGN KEY (egcs_fc_fundingagreementclaim) REFERENCES "Funding_Case_Agreement_Claim"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Claim_Reconcile" ADD CONSTRAINT "Funding_Case_Agreement_Claim_Reconcile_egcs_fc_status_fkey" FOREIGN KEY (egcs_fc_status) REFERENCES "Common_Status"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Claim_Reconcile" ADD CONSTRAINT "Funding_Case_Agreement_Claim_Reconcile_egcs_fc_user_fkey" FOREIGN KEY (egcs_fc_user) REFERENCES "Common_User"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Claim_Reconcile" ADD CONSTRAINT "Funding_Case_Agreement_Claim_Reconcile_id_fkey" FOREIGN KEY (id) REFERENCES "Common_Entity"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Claim_Reconcile_Line_Item" ADD CONSTRAINT "fc_ref_reconcilelineclaim" FOREIGN KEY (egcs_fc_fundingagreementclaimreconcile, egcs_fc_fundingagreementclaim) REFERENCES "Funding_Case_Agreement_Claim_Reconcile"(id, egcs_fc_fundingagreementclaim) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Claim_Reconcile_Line_Item" ADD CONSTRAINT "fc_ref_reconcilelineclaimline" FOREIGN KEY (egcs_fc_lineitem, egcs_fc_fundingagreementclaim) REFERENCES "Funding_Case_Agreement_Claim_Line_Item"(id, egcs_fc_fundingagreementclaim) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Claim_Reconcile_Line_Item" ADD CONSTRAINT "Funding_Case_Agreement_Claim_egcs_fc_fundingagreementclai_fkey2" FOREIGN KEY (egcs_fc_fundingagreementclaimreconcile) REFERENCES "Funding_Case_Agreement_Claim_Reconcile"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Claim_Reconcile_Line_Item" ADD CONSTRAINT "Funding_Case_Agreement_Claim_Reconcile_Li_egcs_fc_lineitem_fkey" FOREIGN KEY (egcs_fc_lineitem) REFERENCES "Funding_Case_Agreement_Claim_Line_Item"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Closeout" ADD CONSTRAINT "Funding_Case_Agreement_Closeout_egcs_fc_fundingagreement_fkey" FOREIGN KEY (egcs_fc_fundingagreement) REFERENCES "Funding_Case_Agreement_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Closeout" ADD CONSTRAINT "Funding_Case_Agreement_Closeout_egcs_fc_status_fkey" FOREIGN KEY (egcs_fc_status) REFERENCES "Common_Status"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Closeout" ADD CONSTRAINT "Funding_Case_Agreement_Closeout_id_fkey" FOREIGN KEY (id) REFERENCES "Common_Entity"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Closeout_Snapshot" ADD CONSTRAINT "fc_ref_closeoutsnapshotcloseoutagreement" FOREIGN KEY (egcs_fc_closeout, egcs_fc_fundingagreement) REFERENCES "Funding_Case_Agreement_Closeout"(id, egcs_fc_fundingagreement) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Closeout_Snapshot" ADD CONSTRAINT "Funding_Case_Agreement_Closeout_S_egcs_fc_fundingagreement_fkey" FOREIGN KEY (egcs_fc_fundingagreement) REFERENCES "Funding_Case_Agreement_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Closeout_Snapshot" ADD CONSTRAINT "Funding_Case_Agreement_Closeout_Snapsh_egcs_fc_workflowrun_fkey" FOREIGN KEY (egcs_fc_workflowrun) REFERENCES "Common_Workflow_Run"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Commitment" ADD CONSTRAINT "fc_ref_commitmenttypestream" FOREIGN KEY (egcs_fc_type, egcs_fc_transferpaymentstream) REFERENCES "Transfer_Payment_Stream_Commitment_Type"(id, egcs_tp_transferpaymentstream) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Commitment" ADD CONSTRAINT "Funding_Case_Agreement_Commitment_egcs_fc_fundingagreement_fkey" FOREIGN KEY (egcs_fc_fundingagreement) REFERENCES "Funding_Case_Agreement_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Commitment" ADD CONSTRAINT "Funding_Case_Agreement_Commitment_egcs_fc_status_fkey" FOREIGN KEY (egcs_fc_status) REFERENCES "Common_Status"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Commitment" ADD CONSTRAINT "Funding_Case_Agreement_Commitment_id_fkey" FOREIGN KEY (id) REFERENCES "Common_Entity"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Commitment_Line" ADD CONSTRAINT "fc_ref_commitmentlineagreementstream" FOREIGN KEY (egcs_fc_fundingagreement, egcs_fc_transferpaymentstream) REFERENCES "Funding_Case_Agreement_Profile"(id, egcs_fc_transferpaymentstream) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Commitment_Line" ADD CONSTRAINT "fc_ref_commitmentlinecommitmentagreement" FOREIGN KEY (egcs_fc_commitment, egcs_fc_fundingagreement) REFERENCES "Funding_Case_Agreement_Commitment"(id, egcs_fc_fundingagreement) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Commitment_Line" ADD CONSTRAINT "fc_ref_commitmentlinestreamconfig" FOREIGN KEY (egcs_fc_transferpaymentstreamchartofaccount, egcs_fc_transferpaymentstream) REFERENCES "Transfer_Payment_Stream_Chart_of_Account"(id, egcs_tp_transferpaymentstream) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Commitment_Line" ADD CONSTRAINT "Funding_Case_Agreement_Commit_egcs_fc_transferpaymentstrea_fkey" FOREIGN KEY (egcs_fc_transferpaymentstreamchartofaccount) REFERENCES "Transfer_Payment_Stream_Chart_of_Account"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Commitment_Line" ADD CONSTRAINT "Funding_Case_Agreement_Commitment_Line_egcs_fc_commitment_fkey" FOREIGN KEY (egcs_fc_commitment) REFERENCES "Funding_Case_Agreement_Commitment"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Correction" ADD CONSTRAINT "cn_chk_correction_status_in_use" FOREIGN KEY (egcs_fc_status, egcs_fc_statusagency, egcs_fc_statusdeleted) REFERENCES "Common_Status"(id, egcs_cn_agency, _deleted) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "Funding_Case_Agreement_Correction" ADD CONSTRAINT "cn_chk_correction_status_outcome" FOREIGN KEY (egcs_fc_status, egcs_fc_statusterminal) REFERENCES "Common_Status"(id, egcs_cn_terminal) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "Funding_Case_Agreement_Correction" ADD CONSTRAINT "fc_fk_correction_commitment" FOREIGN KEY (egcs_fc_commitment, egcs_fc_fundingagreement) REFERENCES "Funding_Case_Agreement_Commitment"(id, egcs_fc_fundingagreement) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Correction" ADD CONSTRAINT "fc_fk_correction_link" FOREIGN KEY (egcs_fc_linkedcorrection, egcs_fc_fundingagreement) REFERENCES "Funding_Case_Agreement_Correction"(id, egcs_fc_fundingagreement) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Correction" ADD CONSTRAINT "Funding_Case_Agreement_Correction_egcs_fc_createdby_fkey" FOREIGN KEY (egcs_fc_createdby) REFERENCES "Common_User"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Correction" ADD CONSTRAINT "Funding_Case_Agreement_Correction_egcs_fc_fundingagreement_fkey" FOREIGN KEY (egcs_fc_fundingagreement) REFERENCES "Funding_Case_Agreement_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Correction" ADD CONSTRAINT "Funding_Case_Agreement_Correction_egcs_fc_postingruntime_fkey" FOREIGN KEY (egcs_fc_postingruntime) REFERENCES "Common_Runtime"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Correction" ADD CONSTRAINT "Funding_Case_Agreement_Correction_egcs_fc_status_fkey" FOREIGN KEY (egcs_fc_status) REFERENCES "Common_Status"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Correction" ADD CONSTRAINT "Funding_Case_Agreement_Correction_egcs_fc_terminalby_fkey" FOREIGN KEY (egcs_fc_terminalby) REFERENCES "Common_User"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Correction" ADD CONSTRAINT "Funding_Case_Agreement_Correction_id_fkey" FOREIGN KEY (id) REFERENCES "Common_Entity"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Correction_Adjustment" ADD CONSTRAINT "fc_fk_correction_adjustment_line" FOREIGN KEY (egcs_fc_correctionline, egcs_fc_correction, egcs_fc_fundingagreement) REFERENCES "Funding_Case_Agreement_Correction_Line"(id, egcs_fc_correction, egcs_fc_fundingagreement) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Correction_Adjustment" ADD CONSTRAINT "fc_fk_correction_adjustment_root" FOREIGN KEY (egcs_fc_correction, egcs_fc_fundingagreement) REFERENCES "Funding_Case_Agreement_Correction"(id, egcs_fc_fundingagreement) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Correction_Adjustment" ADD CONSTRAINT "Funding_Case_Agreement_Correctio_egcs_fc_agencyfiscalyear_fkey1" FOREIGN KEY (egcs_fc_agencyfiscalyear) REFERENCES "Agency_Fiscal_Year"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Correction_Adjustment" ADD CONSTRAINT "Funding_Case_Agreement_Correction_A_egcs_fc_chartofaccount_fkey" FOREIGN KEY (egcs_fc_chartofaccount) REFERENCES "Transfer_Payment_Stream_Chart_of_Account"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Correction_Adjustment" ADD CONSTRAINT "Funding_Case_Agreement_Correction_A_egcs_fc_commitmentline_fkey" FOREIGN KEY (egcs_fc_commitmentline) REFERENCES "Funding_Case_Agreement_Commitment_Line"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Correction_Line" ADD CONSTRAINT "fc_fk_correction_line_root" FOREIGN KEY (egcs_fc_correction, egcs_fc_fundingagreement) REFERENCES "Funding_Case_Agreement_Correction"(id, egcs_fc_fundingagreement) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Correction_Line" ADD CONSTRAINT "Funding_Case_Agreement_Correction_egcs_fc_agencyfiscalyear_fkey" FOREIGN KEY (egcs_fc_agencyfiscalyear) REFERENCES "Agency_Fiscal_Year"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Correction_Line" ADD CONSTRAINT "Funding_Case_Agreement_Correction_L_egcs_fc_chartofaccount_fkey" FOREIGN KEY (egcs_fc_chartofaccount) REFERENCES "Transfer_Payment_Stream_Chart_of_Account"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Correction_Line" ADD CONSTRAINT "Funding_Case_Agreement_Correction_L_egcs_fc_commitmentline_fkey" FOREIGN KEY (egcs_fc_commitmentline) REFERENCES "Funding_Case_Agreement_Commitment_Line"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Correction_Notification" ADD CONSTRAINT "Funding_Case_Agreement_Correction_Notif_egcs_fc_correction_fkey" FOREIGN KEY (egcs_fc_correction) REFERENCES "Funding_Case_Agreement_Correction"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Correction_Notification" ADD CONSTRAINT "Funding_Case_Agreement_Correction_Notifica_egcs_fc_runtime_fkey" FOREIGN KEY (egcs_fc_runtime) REFERENCES "Common_Runtime"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Correction_Notification" ADD CONSTRAINT "Funding_Case_Agreement_Correction_Notificatio_egcs_fc_user_fkey" FOREIGN KEY (egcs_fc_user) REFERENCES "Common_User"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Correction_Source" ADD CONSTRAINT "fc_fk_correction_source_payment" FOREIGN KEY (egcs_fc_payment, egcs_fc_fundingagreement) REFERENCES "Funding_Case_Agreement_Payment"(id, egcs_fc_fundingagreement) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Correction_Source" ADD CONSTRAINT "fc_fk_correction_source_root" FOREIGN KEY (egcs_fc_correction, egcs_fc_fundingagreement) REFERENCES "Funding_Case_Agreement_Correction"(id, egcs_fc_fundingagreement) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Forecast" ADD CONSTRAINT "fc_ref_forecastfiscalyearagreement" FOREIGN KEY (egcs_fc_fiscalyear, egcs_fc_fundingagreement) REFERENCES "Funding_Case_Agreement_Budget_Fiscal_Year"(id, egcs_fc_fundingagreement) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Forecast" ADD CONSTRAINT "Funding_Case_Agreement_Forecast_egcs_fc_fiscalyear_fkey" FOREIGN KEY (egcs_fc_fiscalyear) REFERENCES "Funding_Case_Agreement_Budget_Fiscal_Year"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Forecast" ADD CONSTRAINT "Funding_Case_Agreement_Forecast_egcs_fc_fundingagreement_fkey" FOREIGN KEY (egcs_fc_fundingagreement) REFERENCES "Funding_Case_Agreement_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Forecast" ADD CONSTRAINT "Funding_Case_Agreement_Forecast_egcs_fc_status_fkey" FOREIGN KEY (egcs_fc_status) REFERENCES "Common_Status"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Forecast" ADD CONSTRAINT "Funding_Case_Agreement_Forecast_id_fkey" FOREIGN KEY (id) REFERENCES "Common_Entity"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Forecast_Line_Item" ADD CONSTRAINT "fc_ref_forecastlinebudgetlineagreement" FOREIGN KEY (egcs_fc_fundingagreementbudgetlineitem, egcs_fc_fundingagreement) REFERENCES "Funding_Case_Agreement_Budget_Line_Item"(id, egcs_fc_fundingagreement) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Forecast_Line_Item" ADD CONSTRAINT "fc_ref_forecastlineforecastagreement" FOREIGN KEY (egcs_fc_agreementforecast, egcs_fc_fundingagreement) REFERENCES "Funding_Case_Agreement_Forecast"(id, egcs_fc_fundingagreement) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Forecast_Line_Item" ADD CONSTRAINT "Funding_Case_Agreement_Foreca_egcs_fc_fundingagreementbudg_fkey" FOREIGN KEY (egcs_fc_fundingagreementbudgetlineitem) REFERENCES "Funding_Case_Agreement_Budget_Line_Item"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Forecast_Line_Item" ADD CONSTRAINT "Funding_Case_Agreement_Forecast__egcs_fc_agreementforecast_fkey" FOREIGN KEY (egcs_fc_agreementforecast) REFERENCES "Funding_Case_Agreement_Forecast"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Forecast_Line_Item_Funding" ADD CONSTRAINT "Funding_Case_Agreement_Forecast_L_egcs_fc_forecastlineitem_fkey" FOREIGN KEY (egcs_fc_forecastlineitem) REFERENCES "Funding_Case_Agreement_Forecast_Line_Item"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Forecast_Line_Item_Funding" ADD CONSTRAINT "Funding_Case_Agreement_Forecast_Lin_egcs_fc_fundingsubtype_fkey" FOREIGN KEY (egcs_fc_fundingsubtype) REFERENCES "Agency_Funding_Subtype"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Generated_Document" ADD CONSTRAINT "fc_ref_generateddocumentagreementstream" FOREIGN KEY (egcs_fc_fundingagreement, egcs_fc_transferpaymentstream) REFERENCES "Funding_Case_Agreement_Profile"(id, egcs_fc_transferpaymentstream) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Generated_Document" ADD CONSTRAINT "fc_ref_generateddocumentamendmentagreement" FOREIGN KEY (egcs_fc_amendment, egcs_fc_fundingagreement) REFERENCES "Funding_Case_Agreement_Amendment"(id, egcs_fc_fundingagreement) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Generated_Document" ADD CONSTRAINT "fc_ref_generateddocumentcloseoutagreement" FOREIGN KEY (egcs_fc_closeout, egcs_fc_fundingagreement) REFERENCES "Funding_Case_Agreement_Closeout"(id, egcs_fc_fundingagreement) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Generated_Document" ADD CONSTRAINT "fc_ref_generateddocumenttemplatestream" FOREIGN KEY (egcs_fc_documenttemplate, egcs_fc_transferpaymentstream) REFERENCES "Transfer_Payment_Stream_Document_Template"(id, egcs_tp_transferpaymentstream) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Generated_Document" ADD CONSTRAINT "Funding_Case_Agreement_Generat_egcs_fc_generatedattachment_fkey" FOREIGN KEY (egcs_fc_generatedattachment) REFERENCES "Common_Attachment"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Generated_Document" ADD CONSTRAINT "Funding_Case_Agreement_Generated__egcs_fc_documenttemplate_fkey" FOREIGN KEY (egcs_fc_documenttemplate) REFERENCES "Transfer_Payment_Stream_Document_Template"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Generated_Document" ADD CONSTRAINT "Funding_Case_Agreement_Generated__egcs_fc_fundingagreement_fkey" FOREIGN KEY (egcs_fc_fundingagreement) REFERENCES "Funding_Case_Agreement_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Journal_Voucher" ADD CONSTRAINT "fc_fk_jv_payment_agreement" FOREIGN KEY (egcs_fc_payment, egcs_fc_fundingagreement) REFERENCES "Funding_Case_Agreement_Payment"(id, egcs_fc_fundingagreement) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Journal_Voucher" ADD CONSTRAINT "fc_fk_jv_replacement" FOREIGN KEY (egcs_fc_replacementof, egcs_fc_payment) REFERENCES "Funding_Case_Agreement_Journal_Voucher"(id, egcs_fc_payment) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Journal_Voucher" ADD CONSTRAINT "fc_fk_jv_reversal" FOREIGN KEY (egcs_fc_reversalof, egcs_fc_payment) REFERENCES "Funding_Case_Agreement_Journal_Voucher"(id, egcs_fc_payment) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Journal_Voucher" ADD CONSTRAINT "Funding_Case_Agreement_Journal_Vo_egcs_fc_agencyfiscalyear_fkey" FOREIGN KEY (egcs_fc_agencyfiscalyear) REFERENCES "Agency_Fiscal_Year"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Journal_Voucher" ADD CONSTRAINT "Funding_Case_Agreement_Journal_Vo_egcs_fc_fundingagreement_fkey" FOREIGN KEY (egcs_fc_fundingagreement) REFERENCES "Funding_Case_Agreement_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Journal_Voucher" ADD CONSTRAINT "Funding_Case_Agreement_Journal_Voucher_egcs_fc_fiscalyear_fkey" FOREIGN KEY (egcs_fc_fiscalyear) REFERENCES "Funding_Case_Agreement_Budget_Fiscal_Year"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Journal_Voucher" ADD CONSTRAINT "Funding_Case_Agreement_Journal_Voucher_egcs_fc_status_fkey" FOREIGN KEY (egcs_fc_status) REFERENCES "Common_Status"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Journal_Voucher" ADD CONSTRAINT "Funding_Case_Agreement_Journal_Voucher_id_fkey" FOREIGN KEY (id) REFERENCES "Common_Entity"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Journal_Voucher_Line" ADD CONSTRAINT "fc_fk_jv_line_root" FOREIGN KEY (egcs_fc_journalvoucher, egcs_fc_payment) REFERENCES "Funding_Case_Agreement_Journal_Voucher"(id, egcs_fc_payment) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Journal_Voucher_Line" ADD CONSTRAINT "Funding_Case_Agreement_Journal_Vouc_egcs_fc_chartofaccount_fkey" FOREIGN KEY (egcs_fc_chartofaccount) REFERENCES "Transfer_Payment_Stream_Chart_of_Account"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Journal_Voucher_Line" ADD CONSTRAINT "Funding_Case_Agreement_Journal_Vouc_egcs_fc_commitmentline_fkey" FOREIGN KEY (egcs_fc_commitmentline) REFERENCES "Funding_Case_Agreement_Commitment_Line"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Monitor" ADD CONSTRAINT "fc_ref_monitoragreementstream" FOREIGN KEY (egcs_fc_fundingagreement, egcs_fc_transferpaymentstream) REFERENCES "Funding_Case_Agreement_Profile"(id, egcs_fc_transferpaymentstream) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Monitor" ADD CONSTRAINT "fc_ref_monitortypestream" FOREIGN KEY (egcs_fc_type, egcs_fc_transferpaymentstream) REFERENCES "Transfer_Payment_Monitor_Type"(id, egcs_tp_transferpaymentstream) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Monitor" ADD CONSTRAINT "Funding_Case_Agreement_Monitor_egcs_fc_fundingagreement_fkey" FOREIGN KEY (egcs_fc_fundingagreement) REFERENCES "Funding_Case_Agreement_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Monitor" ADD CONSTRAINT "Funding_Case_Agreement_Monitor_egcs_fc_status_fkey" FOREIGN KEY (egcs_fc_status) REFERENCES "Common_Status"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Monitor" ADD CONSTRAINT "Funding_Case_Agreement_Monitor_egcs_fc_tentativefiscalyear_fkey" FOREIGN KEY (egcs_fc_tentativefiscalyear) REFERENCES "Agency_Fiscal_Year"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Monitor" ADD CONSTRAINT "Funding_Case_Agreement_Monitor_egcs_fc_type_fkey" FOREIGN KEY (egcs_fc_type) REFERENCES "Transfer_Payment_Monitor_Type"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Monitor" ADD CONSTRAINT "Funding_Case_Agreement_Monitor_id_fkey" FOREIGN KEY (id) REFERENCES "Common_Entity"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Monitor_Finding" ADD CONSTRAINT "fc_fk_monitor_finding_item" FOREIGN KEY (egcs_fc_monitoritem, egcs_fc_fundingagreementmonitor) REFERENCES "Funding_Case_Agreement_Monitor_Items"(id, egcs_fc_fundingagreementmonitor) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Monitor_Finding" ADD CONSTRAINT "Funding_Case_Agreement_Monit_egcs_fc_fundingagreementmoni_fkey2" FOREIGN KEY (egcs_fc_fundingagreementmonitor) REFERENCES "Funding_Case_Agreement_Monitor"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Monitor_Followup" ADD CONSTRAINT "fc_fk_monitor_followup_finding" FOREIGN KEY (egcs_fc_monitorfinding, egcs_fc_fundingagreementmonitor) REFERENCES "Funding_Case_Agreement_Monitor_Finding"(id, egcs_fc_fundingagreementmonitor) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Monitor_Followup" ADD CONSTRAINT "Funding_Case_Agreement_Monit_egcs_fc_fundingagreementmoni_fkey3" FOREIGN KEY (egcs_fc_fundingagreementmonitor) REFERENCES "Funding_Case_Agreement_Monitor"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Monitor_Followup_Update" ADD CONSTRAINT "Funding_Case_Agreement_Monit_egcs_fc_fundingagreementmoni_fkey4" FOREIGN KEY (egcs_fc_fundingagreementmonitorfollowup) REFERENCES "Funding_Case_Agreement_Monitor_Followup"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Monitor_Items" ADD CONSTRAINT "fc_fk_monitor_item_planning" FOREIGN KEY (egcs_fc_monitorplanning, egcs_fc_fundingagreementmonitor) REFERENCES "Funding_Case_Agreement_Monitor_Planning"(id, egcs_fc_fundingagreementmonitor) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Monitor_Items" ADD CONSTRAINT "Funding_Case_Agreement_Monit_egcs_fc_fundingagreementmoni_fkey1" FOREIGN KEY (egcs_fc_fundingagreementmonitor) REFERENCES "Funding_Case_Agreement_Monitor"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Monitor_Planning" ADD CONSTRAINT "Funding_Case_Agreement_Monito_egcs_fc_fundingagreementmoni_fkey" FOREIGN KEY (egcs_fc_fundingagreementmonitor) REFERENCES "Funding_Case_Agreement_Monitor"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Monitor_Promising_Practice" ADD CONSTRAINT "Funding_Case_Agreement_Monit_egcs_fc_fundingagreementmoni_fkey5" FOREIGN KEY (egcs_fc_fundingagreementmonitor) REFERENCES "Funding_Case_Agreement_Monitor"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Note" ADD CONSTRAINT "Funding_Case_Agreement_Note_egcs_fc_createdby_fkey" FOREIGN KEY (egcs_fc_createdby) REFERENCES "Common_User"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Note" ADD CONSTRAINT "Funding_Case_Agreement_Note_egcs_fc_fundingagreement_fkey" FOREIGN KEY (egcs_fc_fundingagreement) REFERENCES "Funding_Case_Agreement_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Note" ADD CONSTRAINT "Funding_Case_Agreement_Note_egcs_fc_updatedby_fkey" FOREIGN KEY (egcs_fc_updatedby) REFERENCES "Common_User"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Outcome_Activity" ADD CONSTRAINT "Funding_Case_Agreement_Outcome_Activity_egcs_fc_activity_fkey" FOREIGN KEY (egcs_fc_activity) REFERENCES "Funding_Case_Agreement_Activity"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Outcome_Activity" ADD CONSTRAINT "Funding_Case_Agreement_Outcome_Activity_egcs_fc_outcomes_fkey" FOREIGN KEY (egcs_fc_outcomes) REFERENCES "Transfer_Payment_Outcome"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Payment" ADD CONSTRAINT "fc_ref_paymentcommitmentagreement" FOREIGN KEY (egcs_fc_fundingagreementcommitment, egcs_fc_fundingagreement) REFERENCES "Funding_Case_Agreement_Commitment"(id, egcs_fc_fundingagreement) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Payment" ADD CONSTRAINT "fc_ref_paymentfiscalyearagreement" FOREIGN KEY (egcs_fc_fiscalyear, egcs_fc_fundingagreement) REFERENCES "Funding_Case_Agreement_Budget_Fiscal_Year"(id, egcs_fc_fundingagreement) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Payment" ADD CONSTRAINT "Funding_Case_Agreement_Paymen_egcs_fc_fundingagreementcomm_fkey" FOREIGN KEY (egcs_fc_fundingagreementcommitment) REFERENCES "Funding_Case_Agreement_Commitment"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Payment" ADD CONSTRAINT "Funding_Case_Agreement_Payment_egcs_fc_applicantrecipient_fkey" FOREIGN KEY (egcs_fc_applicantrecipient) REFERENCES "Applicant_Recipient_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Payment" ADD CONSTRAINT "Funding_Case_Agreement_Payment_egcs_fc_fiscalyear_fkey" FOREIGN KEY (egcs_fc_fiscalyear) REFERENCES "Funding_Case_Agreement_Budget_Fiscal_Year"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Payment" ADD CONSTRAINT "Funding_Case_Agreement_Payment_egcs_fc_status_fkey" FOREIGN KEY (egcs_fc_status) REFERENCES "Common_Status"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Payment" ADD CONSTRAINT "Funding_Case_Agreement_Payment_id_fkey" FOREIGN KEY (id) REFERENCES "Common_Entity"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Payment_Line" ADD CONSTRAINT "fc_ref_paymentlinecommitmentline" FOREIGN KEY (egcs_fc_fundingagreementcommitmentline, egcs_fc_fundingagreementcommitment) REFERENCES "Funding_Case_Agreement_Commitment_Line"(id, egcs_fc_commitment) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Payment_Line" ADD CONSTRAINT "fc_ref_paymentlinepaymentcommitment" FOREIGN KEY (egcs_fc_fundingagreementpayment, egcs_fc_fundingagreementcommitment) REFERENCES "Funding_Case_Agreement_Payment"(id, egcs_fc_fundingagreementcommitment) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Payment_Line" ADD CONSTRAINT "Funding_Case_Agreement_Payme_egcs_fc_fundingagreementcomm_fkey1" FOREIGN KEY (egcs_fc_fundingagreementcommitmentline) REFERENCES "Funding_Case_Agreement_Commitment_Line"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Payment_Line" ADD CONSTRAINT "Funding_Case_Agreement_Paymen_egcs_fc_fundingagreementpaym_fkey" FOREIGN KEY (egcs_fc_fundingagreementpayment) REFERENCES "Funding_Case_Agreement_Payment"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Profile" ADD CONSTRAINT "fc_ref_holdbackbasisstream" FOREIGN KEY (egcs_fc_holdbackbasis, egcs_fc_transferpaymentstream) REFERENCES "Transfer_Payment_Stream_Holdback_Basis"(id, egcs_tp_transferpaymentstream) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Profile" ADD CONSTRAINT "fc_ref_profileagreementsubtypetransferpaymentstream" FOREIGN KEY (egcs_fc_agreementsubtype, egcs_fc_transferpaymentstream) REFERENCES "Transfer_Payment_Agreement_Subtype"(id, egcs_tp_transferpaymentstream) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Profile" ADD CONSTRAINT "Funding_Case_Agreement_Profil_egcs_fc_transferpaymentstrea_fkey" FOREIGN KEY (egcs_fc_transferpaymentstream) REFERENCES "Transfer_Payment_Stream"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Profile" ADD CONSTRAINT "Funding_Case_Agreement_Profile_egcs_fc_holdbackbasis_fkey" FOREIGN KEY (egcs_fc_holdbackbasis) REFERENCES "Transfer_Payment_Stream_Holdback_Basis"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Profile" ADD CONSTRAINT "Funding_Case_Agreement_Profile_egcs_fc_status_fkey" FOREIGN KEY (egcs_fc_status) REFERENCES "Common_Status"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Profile" ADD CONSTRAINT "Funding_Case_Agreement_Profile_id_fkey" FOREIGN KEY (id) REFERENCES "Common_Entity"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Responsible_Party_Activity" ADD CONSTRAINT "Funding_Case_Agreement_Responsibl_egcs_fc_responsibleparty_fkey" FOREIGN KEY (egcs_fc_responsibleparty) REFERENCES "Funding_Case_Agreement_Applicant_Recipient"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Responsible_Party_Activity" ADD CONSTRAINT "Funding_Case_Agreement_Responsible_Party__egcs_fc_activity_fkey" FOREIGN KEY (egcs_fc_activity) REFERENCES "Funding_Case_Agreement_Activity"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Revision" ADD CONSTRAINT "fc_ref_revisionamendmentagreement" FOREIGN KEY (egcs_fc_amendment, egcs_fc_fundingagreement) REFERENCES "Funding_Case_Agreement_Amendment"(id, egcs_fc_fundingagreement) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Revision" ADD CONSTRAINT "Funding_Case_Agreement_Revision_egcs_fc_approvalsubmission_fkey" FOREIGN KEY (egcs_fc_approvalsubmission) REFERENCES "Funding_Case_Agreement_Approval_Submission"(id) ON DELETE RESTRICT;

ALTER TABLE "Funding_Case_Agreement_Revision" ADD CONSTRAINT "Funding_Case_Agreement_Revision_egcs_fc_fundingagreement_fkey" FOREIGN KEY (egcs_fc_fundingagreement) REFERENCES "Funding_Case_Agreement_Profile"(id) ON DELETE RESTRICT;
END $baseline$`.execute(db)
}

/** Installs the current installTriggers definitions for this subject on a fresh database. */
export const installTriggers = async (db: Kysely<Database>): Promise<void> => {
  await sql`DO $baseline$ BEGIN
CREATE CONSTRAINT TRIGGER trg_require_ar_offset_memo_application AFTER INSERT OR UPDATE ON "Funding_Case_Account_Receivable_Allocation" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_require_ar_offset_memo_application();

CREATE TRIGGER trg_validate_ar_recovery BEFORE INSERT OR DELETE OR UPDATE ON "Funding_Case_Account_Receivable_Allocation" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_ar_recovery();

CREATE CONSTRAINT TRIGGER trg_validate_ar_recovery_posting AFTER INSERT OR UPDATE ON "Funding_Case_Account_Receivable_Allocation" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_ar_recovery_posting();

CREATE CONSTRAINT TRIGGER trg_enforce_ar_creditmemo_roster AFTER INSERT OR UPDATE OF _deleted ON "Funding_Case_Account_Receivable_Credit_Memo" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_assignable_entity_roster('fundingcaseaccountreceivablecreditmemo');

CREATE TRIGGER trg_register_ar_creditmemo BEFORE INSERT ON "Funding_Case_Account_Receivable_Credit_Memo" FOR EACH ROW EXECUTE FUNCTION register_entity('fundingcaseaccountreceivablecreditmemo');

CREATE TRIGGER trg_soft_delete_ar_creditmemo_assignments AFTER UPDATE OF _deleted ON "Funding_Case_Account_Receivable_Credit_Memo" FOR EACH ROW EXECUTE FUNCTION trg_fn_soft_delete_entity_assignments('fundingcaseaccountreceivablecreditmemo');

CREATE TRIGGER trg_validate_ar_creditmemo_root BEFORE INSERT OR DELETE OR UPDATE ON "Funding_Case_Account_Receivable_Credit_Memo" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_ar_root('fundingcaseaccountreceivablecreditmemo');

CREATE CONSTRAINT TRIGGER trg_validate_ar_establishment AFTER INSERT OR UPDATE ON "Funding_Case_Account_Receivable_Credit_Memo" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_ar_establishment('fundingcaseaccountreceivablecreditmemo');

CREATE TRIGGER trg_validate_ar_offset_memo BEFORE INSERT OR DELETE OR UPDATE ON "Funding_Case_Account_Receivable_Offset_Memo" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_ar_offset_memo();

CREATE TRIGGER trg_validate_ar_offset_memo BEFORE INSERT OR DELETE OR UPDATE ON "Funding_Case_Account_Receivable_Offset_Memo_Application" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_ar_offset_memo();

CREATE TRIGGER trg_protect_ar_pool BEFORE DELETE OR UPDATE ON "Funding_Case_Account_Receivable_Pool" FOR EACH ROW EXECUTE FUNCTION trg_fn_protect_ar_pool();

CREATE TRIGGER trg_validate_ar_recovery BEFORE INSERT OR DELETE OR UPDATE ON "Funding_Case_Account_Receivable_Posting" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_ar_recovery();

CREATE CONSTRAINT TRIGGER trg_validate_ar_recovery_posting AFTER INSERT OR UPDATE ON "Funding_Case_Account_Receivable_Posting" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_ar_recovery_posting();

CREATE CONSTRAINT TRIGGER trg_require_ar_offset_memo_application AFTER INSERT OR UPDATE ON "Funding_Case_Account_Receivable_Recovery" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_require_ar_offset_memo_application();

CREATE TRIGGER trg_validate_ar_recovery BEFORE INSERT OR DELETE OR UPDATE ON "Funding_Case_Account_Receivable_Recovery" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_ar_recovery();

CREATE CONSTRAINT TRIGGER trg_validate_ar_recovery_posting AFTER INSERT OR UPDATE ON "Funding_Case_Account_Receivable_Recovery" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_ar_recovery_posting();

CREATE CONSTRAINT TRIGGER trg_enforce_ar_roster AFTER INSERT OR UPDATE OF _deleted ON "Funding_Case_Agreement_Account_Receivable" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_assignable_entity_roster('fundingcaseaccountreceivable');

CREATE TRIGGER trg_register_ar BEFORE INSERT ON "Funding_Case_Agreement_Account_Receivable" FOR EACH ROW EXECUTE FUNCTION register_entity('fundingcaseaccountreceivable');

CREATE TRIGGER trg_soft_delete_ar_assignments AFTER UPDATE OF _deleted ON "Funding_Case_Agreement_Account_Receivable" FOR EACH ROW EXECUTE FUNCTION trg_fn_soft_delete_entity_assignments('fundingcaseaccountreceivable');

CREATE CONSTRAINT TRIGGER trg_validate_ar_establishment AFTER INSERT OR UPDATE ON "Funding_Case_Agreement_Account_Receivable" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_ar_establishment('fundingcaseaccountreceivable');

CREATE TRIGGER trg_validate_ar_root BEFORE INSERT OR DELETE OR UPDATE ON "Funding_Case_Agreement_Account_Receivable" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_ar_root('fundingcaseaccountreceivable');

CREATE TRIGGER trg_validate_ar_content BEFORE INSERT OR DELETE OR UPDATE ON "Funding_Case_Agreement_Account_Receivable_Coding" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_ar_content();

CREATE CONSTRAINT TRIGGER trg_validate_ar_establishment AFTER INSERT OR UPDATE ON "Funding_Case_Agreement_Account_Receivable_Coding" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_ar_establishment('fundingcaseaccountreceivable');

CREATE TRIGGER trg_validate_ar_content BEFORE INSERT OR DELETE OR UPDATE ON "Funding_Case_Agreement_Account_Receivable_Line" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_ar_content();

CREATE CONSTRAINT TRIGGER trg_validate_ar_establishment AFTER INSERT OR UPDATE ON "Funding_Case_Agreement_Account_Receivable_Line" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_ar_establishment('fundingcaseaccountreceivable');

CREATE TRIGGER trg_resolve_current_activity_version BEFORE INSERT ON "Funding_Case_Agreement_Activity" FOR EACH ROW EXECUTE FUNCTION trg_fn_resolve_current_activity_version();

CREATE CONSTRAINT TRIGGER trg_enforce_fundingcaseamendment_assignment_roster AFTER INSERT OR UPDATE OF _deleted ON "Funding_Case_Agreement_Amendment" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_assignable_entity_roster('fundingcaseamendment');

CREATE TRIGGER trg_register_fundingcaseamendment BEFORE INSERT ON "Funding_Case_Agreement_Amendment" FOR EACH ROW EXECUTE FUNCTION register_entity('fundingcaseamendment');

CREATE TRIGGER trg_soft_delete_fundingcaseamendment_assignments AFTER UPDATE OF _deleted ON "Funding_Case_Agreement_Amendment" FOR EACH ROW EXECUTE FUNCTION trg_fn_soft_delete_entity_assignments('fundingcaseamendment');

CREATE CONSTRAINT TRIGGER trg_validate_fundingcaseamendment_status_agency AFTER INSERT OR UPDATE ON "Funding_Case_Agreement_Amendment" DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_funding_status_agency();

CREATE TRIGGER trg_enforce_agreement_amendment_subtype_scope BEFORE INSERT OR UPDATE OF egcs_fc_amendment, egcs_fc_amendmentsubtype ON "Funding_Case_Agreement_Amendment_Subtype" FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_agreement_amendment_subtype_scope();

CREATE TRIGGER trg_enforce_amendment_type_stream_scope BEFORE INSERT OR UPDATE OF egcs_fc_amendment, egcs_fc_amendmenttype ON "Funding_Case_Agreement_Amendment_Type" FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_amendment_type_stream_scope();

CREATE TRIGGER guard_agreement_proponent_type AFTER INSERT OR UPDATE ON "Funding_Case_Agreement_Applicant_Recipient" FOR EACH ROW EXECUTE FUNCTION guard_agreement_proponent_type();

CREATE TRIGGER guard_future_proponent_type BEFORE INSERT OR UPDATE ON "Funding_Case_Agreement_Applicant_Recipient" FOR EACH ROW EXECUTE FUNCTION guard_future_proponent_type();

CREATE TRIGGER trg_immutable_agreement_approval_submission BEFORE DELETE OR UPDATE ON "Funding_Case_Agreement_Approval_Submission" FOR EACH ROW EXECUTE FUNCTION trg_fn_immutable_agreement_approval_submission();

CREATE TRIGGER trg_validate_agreement_approval_submission BEFORE INSERT ON "Funding_Case_Agreement_Approval_Submission" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_agreement_approval_submission();

CREATE TRIGGER trg_correction_financial_lock BEFORE INSERT OR DELETE OR UPDATE ON "Funding_Case_Agreement_Budget_Fiscal_Year" FOR EACH ROW EXECUTE FUNCTION trg_fn_correction_financial_lock();

CREATE TRIGGER trg_enforce_budget_fiscal_year_root BEFORE INSERT OR UPDATE OF egcs_fc_originalbudgetfiscalyear ON "Funding_Case_Agreement_Budget_Fiscal_Year" FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_budget_fiscal_year_root();

CREATE TRIGGER trg_resolve_current_budget_version BEFORE INSERT ON "Funding_Case_Agreement_Budget_Fiscal_Year" FOR EACH ROW EXECUTE FUNCTION trg_fn_resolve_current_budget_version();

CREATE TRIGGER trg_correction_financial_lock BEFORE INSERT OR DELETE OR UPDATE ON "Funding_Case_Agreement_Budget_Line_Item" FOR EACH ROW EXECUTE FUNCTION trg_fn_correction_financial_lock();

CREATE CONSTRAINT TRIGGER trg_enforce_budget_line_commitment_program_funding_total AFTER INSERT OR UPDATE ON "Funding_Case_Agreement_Budget_Line_Item" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_budget_line_commitment_program_funding_total();

CREATE TRIGGER trg_enforce_budget_line_item_root BEFORE INSERT OR UPDATE OF egcs_fc_originalbudgetlineitem ON "Funding_Case_Agreement_Budget_Line_Item" FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_budget_line_item_root();

CREATE TRIGGER trg_resolve_budget_line_item_identity BEFORE INSERT OR UPDATE OF egcs_fc_fundingagreement, egcs_fc_fundingagreementbudgetfiscalyear, egcs_fc_originalbudgetlineitem, _deleted ON "Funding_Case_Agreement_Budget_Line_Item" FOR EACH ROW EXECUTE FUNCTION trg_fn_resolve_budget_line_item_identity();

CREATE TRIGGER zz_guard_agreement_financial_currency BEFORE INSERT OR UPDATE ON "Funding_Case_Agreement_Budget_Line_Item" FOR EACH ROW EXECUTE FUNCTION guard_agreement_financial_currency();

CREATE TRIGGER trg_correction_financial_lock BEFORE INSERT OR DELETE OR UPDATE ON "Funding_Case_Agreement_Budget_Line_Item_Funding" FOR EACH ROW EXECUTE FUNCTION trg_fn_correction_financial_lock();

CREATE TRIGGER trg_validate_agreement_line_funding_agency BEFORE INSERT OR UPDATE ON "Funding_Case_Agreement_Budget_Line_Item_Funding" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_agreement_line_funding_agency();

CREATE TRIGGER trg_correction_financial_lock BEFORE INSERT OR DELETE OR UPDATE ON "Funding_Case_Agreement_Budget_Version" FOR EACH ROW EXECUTE FUNCTION trg_fn_correction_financial_lock();

CREATE CONSTRAINT TRIGGER trg_enforce_budget_version_commitment_program_funding_total AFTER UPDATE ON "Funding_Case_Agreement_Budget_Version" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (COALESCE(new.egcs_fc_iscurrent, false) OR COALESCE(old.egcs_fc_iscurrent, false)) EXECUTE FUNCTION trg_fn_enforce_budget_version_commitment_program_funding_total();

CREATE CONSTRAINT TRIGGER trg_enforce_fundingcaseagreementclaim_assignment_roster AFTER INSERT OR UPDATE OF _deleted ON "Funding_Case_Agreement_Claim" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_assignable_entity_roster('fundingcaseagreementclaim');

CREATE TRIGGER trg_register_fundingcaseagreementclaim BEFORE INSERT ON "Funding_Case_Agreement_Claim" FOR EACH ROW EXECUTE FUNCTION register_entity('fundingcaseagreementclaim');

CREATE TRIGGER trg_soft_delete_fundingcaseagreementclaim_assignments AFTER UPDATE OF _deleted ON "Funding_Case_Agreement_Claim" FOR EACH ROW EXECUTE FUNCTION trg_fn_soft_delete_entity_assignments('fundingcaseagreementclaim');

CREATE TRIGGER trg_validate_claim_submitting_proponent BEFORE INSERT OR UPDATE OF egcs_fc_applicantrecipient, egcs_fc_fundingagreement ON "Funding_Case_Agreement_Claim" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_claim_submitting_proponent();

CREATE CONSTRAINT TRIGGER trg_validate_fundingcaseagreementclaim_status_agency AFTER INSERT OR UPDATE ON "Funding_Case_Agreement_Claim" DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_funding_status_agency();

CREATE TRIGGER trg_resolve_claim_line_agreement BEFORE INSERT OR UPDATE OF egcs_fc_fundingagreementclaim, egcs_fc_fundingagreement ON "Funding_Case_Agreement_Claim_Line_Item" FOR EACH ROW EXECUTE FUNCTION trg_fn_resolve_claim_line_agreement();

CREATE TRIGGER zz_guard_agreement_financial_currency BEFORE INSERT OR UPDATE ON "Funding_Case_Agreement_Claim_Line_Item" FOR EACH ROW EXECUTE FUNCTION guard_agreement_financial_currency();

CREATE TRIGGER trg_validate_agreement_line_funding_agency BEFORE INSERT OR UPDATE ON "Funding_Case_Agreement_Claim_Line_Item_Funding" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_agreement_line_funding_agency();

CREATE CONSTRAINT TRIGGER trg_enforce_fundingclaimreconcile_assignment_roster AFTER INSERT OR UPDATE OF _deleted ON "Funding_Case_Agreement_Claim_Reconcile" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_assignable_entity_roster('fundingclaimreconcile');

CREATE TRIGGER trg_register_fundingclaimreconcile BEFORE INSERT ON "Funding_Case_Agreement_Claim_Reconcile" FOR EACH ROW EXECUTE FUNCTION register_entity('fundingclaimreconcile');

CREATE TRIGGER trg_soft_delete_fundingclaimreconcile_assignments AFTER UPDATE OF _deleted ON "Funding_Case_Agreement_Claim_Reconcile" FOR EACH ROW EXECUTE FUNCTION trg_fn_soft_delete_entity_assignments('fundingclaimreconcile');

CREATE CONSTRAINT TRIGGER trg_validate_fundingclaimreconcile_status_agency AFTER INSERT OR UPDATE ON "Funding_Case_Agreement_Claim_Reconcile" DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_funding_status_agency();

CREATE TRIGGER trg_resolve_reconcile_line_claim BEFORE INSERT OR UPDATE OF egcs_fc_fundingagreementclaimreconcile, egcs_fc_fundingagreementclaim ON "Funding_Case_Agreement_Claim_Reconcile_Line_Item" FOR EACH ROW EXECUTE FUNCTION trg_fn_resolve_reconcile_line_claim();

CREATE TRIGGER trg_correction_financial_lock BEFORE INSERT OR DELETE OR UPDATE ON "Funding_Case_Agreement_Closeout" FOR EACH ROW EXECUTE FUNCTION trg_fn_correction_financial_lock();

CREATE CONSTRAINT TRIGGER trg_enforce_fundingcaseagreementcloseout_assignment_roster AFTER INSERT OR UPDATE OF _deleted ON "Funding_Case_Agreement_Closeout" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_assignable_entity_roster('fundingcaseagreementcloseout');

CREATE TRIGGER trg_register_fundingcaseagreementcloseout BEFORE INSERT ON "Funding_Case_Agreement_Closeout" FOR EACH ROW EXECUTE FUNCTION register_entity('fundingcaseagreementcloseout');

CREATE TRIGGER trg_soft_delete_fundingcaseagreementcloseout_assignments AFTER UPDATE OF _deleted ON "Funding_Case_Agreement_Closeout" FOR EACH ROW EXECUTE FUNCTION trg_fn_soft_delete_entity_assignments('fundingcaseagreementcloseout');

CREATE CONSTRAINT TRIGGER trg_validate_fundingcaseagreementcloseout_status_agency AFTER INSERT OR UPDATE ON "Funding_Case_Agreement_Closeout" DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_funding_status_agency();

CREATE TRIGGER trg_immutable_agreement_closeout_snapshot BEFORE DELETE OR UPDATE ON "Funding_Case_Agreement_Closeout_Snapshot" FOR EACH ROW EXECUTE FUNCTION trg_fn_immutable_agreement_closeout_snapshot();

CREATE TRIGGER trg_validate_agreement_closeout_snapshot BEFORE INSERT ON "Funding_Case_Agreement_Closeout_Snapshot" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_agreement_closeout_snapshot();

CREATE TRIGGER trg_correction_financial_lock BEFORE INSERT OR DELETE OR UPDATE ON "Funding_Case_Agreement_Commitment" FOR EACH ROW EXECUTE FUNCTION trg_fn_correction_financial_lock();

CREATE CONSTRAINT TRIGGER trg_enforce_fundingcaseagreementcommitment_assignment_roster AFTER INSERT OR UPDATE OF _deleted ON "Funding_Case_Agreement_Commitment" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_assignable_entity_roster('fundingcaseagreementcommitment');

CREATE TRIGGER trg_register_fundingcaseagreementcommitment BEFORE INSERT ON "Funding_Case_Agreement_Commitment" FOR EACH ROW EXECUTE FUNCTION register_entity('fundingcaseagreementcommitment');

CREATE TRIGGER trg_resolve_commitment_stream BEFORE INSERT OR UPDATE OF egcs_fc_fundingagreement, egcs_fc_transferpaymentstream, egcs_fc_currency ON "Funding_Case_Agreement_Commitment" FOR EACH ROW EXECUTE FUNCTION trg_fn_resolve_commitment_stream();

CREATE TRIGGER trg_soft_delete_fundingcaseagreementcommitment_assignments AFTER UPDATE OF _deleted ON "Funding_Case_Agreement_Commitment" FOR EACH ROW EXECUTE FUNCTION trg_fn_soft_delete_entity_assignments('fundingcaseagreementcommitment');

CREATE CONSTRAINT TRIGGER trg_validate_fundingcaseagreementcommitment_status_agency AFTER INSERT OR UPDATE ON "Funding_Case_Agreement_Commitment" DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_funding_status_agency();

CREATE TRIGGER zz_guard_agreement_financial_currency BEFORE INSERT OR UPDATE ON "Funding_Case_Agreement_Commitment" FOR EACH ROW EXECUTE FUNCTION guard_agreement_financial_currency();

CREATE TRIGGER trg_correction_financial_lock BEFORE INSERT OR DELETE OR UPDATE ON "Funding_Case_Agreement_Commitment_Line" FOR EACH ROW EXECUTE FUNCTION trg_fn_correction_financial_lock();

CREATE CONSTRAINT TRIGGER trg_enforce_commitment_line_program_funding_total AFTER INSERT OR UPDATE ON "Funding_Case_Agreement_Commitment_Line" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_commitment_line_program_funding_total();

CREATE TRIGGER trg_resolve_commitment_line_scope BEFORE INSERT OR UPDATE OF egcs_fc_commitment, egcs_fc_fundingagreement, egcs_fc_transferpaymentstream, egcs_fc_transferpaymentstreamchartofaccount ON "Funding_Case_Agreement_Commitment_Line" FOR EACH ROW EXECUTE FUNCTION trg_fn_resolve_commitment_line_scope();

CREATE CONSTRAINT TRIGGER trg_enforce_correction_roster AFTER INSERT OR UPDATE OF _deleted ON "Funding_Case_Agreement_Correction" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_assignable_entity_roster('fundingcasecorrection');

CREATE TRIGGER trg_register_fundingcasecorrection BEFORE INSERT ON "Funding_Case_Agreement_Correction" FOR EACH ROW EXECUTE FUNCTION register_entity('fundingcasecorrection');

CREATE TRIGGER trg_soft_delete_correction_assignments AFTER UPDATE OF _deleted ON "Funding_Case_Agreement_Correction" FOR EACH ROW EXECUTE FUNCTION trg_fn_soft_delete_entity_assignments('fundingcasecorrection');

CREATE TRIGGER trg_validate_correction BEFORE INSERT OR DELETE OR UPDATE ON "Funding_Case_Agreement_Correction" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_correction();

CREATE CONSTRAINT TRIGGER trg_validate_correction_posting AFTER INSERT OR UPDATE ON "Funding_Case_Agreement_Correction" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_correction_posting();

CREATE TRIGGER zz_guard_agreement_financial_currency BEFORE INSERT OR UPDATE ON "Funding_Case_Agreement_Correction" FOR EACH ROW EXECUTE FUNCTION guard_agreement_financial_currency();

CREATE TRIGGER trg_protect_correction_posting BEFORE DELETE OR UPDATE ON "Funding_Case_Agreement_Correction_Adjustment" FOR EACH ROW EXECUTE FUNCTION trg_fn_protect_correction_posting();

CREATE CONSTRAINT TRIGGER trg_validate_correction_posting AFTER INSERT OR UPDATE ON "Funding_Case_Agreement_Correction_Adjustment" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_correction_posting();

CREATE TRIGGER trg_protect_correction_content BEFORE INSERT OR DELETE OR UPDATE ON "Funding_Case_Agreement_Correction_Line" FOR EACH ROW EXECUTE FUNCTION trg_fn_protect_correction_content();

CREATE TRIGGER trg_protect_correction_posting BEFORE DELETE OR UPDATE ON "Funding_Case_Agreement_Correction_Notification" FOR EACH ROW EXECUTE FUNCTION trg_fn_protect_correction_posting();

CREATE CONSTRAINT TRIGGER trg_validate_correction_posting AFTER INSERT OR UPDATE ON "Funding_Case_Agreement_Correction_Notification" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_correction_posting();

CREATE TRIGGER trg_protect_correction_content BEFORE INSERT OR DELETE OR UPDATE ON "Funding_Case_Agreement_Correction_Source" FOR EACH ROW EXECUTE FUNCTION trg_fn_protect_correction_content();

CREATE CONSTRAINT TRIGGER trg_enforce_fundingcaseforecast_assignment_roster AFTER INSERT OR UPDATE OF _deleted ON "Funding_Case_Agreement_Forecast" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_assignable_entity_roster('fundingcaseforecast');

CREATE TRIGGER trg_register_fundingcaseforecast BEFORE INSERT ON "Funding_Case_Agreement_Forecast" FOR EACH ROW EXECUTE FUNCTION register_entity('fundingcaseforecast');

CREATE TRIGGER trg_soft_delete_fundingcaseforecast_assignments AFTER UPDATE OF _deleted ON "Funding_Case_Agreement_Forecast" FOR EACH ROW EXECUTE FUNCTION trg_fn_soft_delete_entity_assignments('fundingcaseforecast');

CREATE CONSTRAINT TRIGGER trg_validate_fundingcaseforecast_status_agency AFTER INSERT OR UPDATE ON "Funding_Case_Agreement_Forecast" DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_funding_status_agency();

CREATE TRIGGER trg_resolve_forecast_line_agreement BEFORE INSERT OR UPDATE OF egcs_fc_agreementforecast, egcs_fc_fundingagreement ON "Funding_Case_Agreement_Forecast_Line_Item" FOR EACH ROW EXECUTE FUNCTION trg_fn_resolve_forecast_line_agreement();

CREATE TRIGGER zz_guard_agreement_financial_currency BEFORE INSERT OR UPDATE ON "Funding_Case_Agreement_Forecast_Line_Item" FOR EACH ROW EXECUTE FUNCTION guard_agreement_financial_currency();

CREATE TRIGGER trg_validate_agreement_line_funding_agency BEFORE INSERT OR UPDATE ON "Funding_Case_Agreement_Forecast_Line_Item_Funding" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_agreement_line_funding_agency();

CREATE TRIGGER trg_resolve_generated_document_stream BEFORE INSERT OR UPDATE OF egcs_fc_fundingagreement, egcs_fc_transferpaymentstream ON "Funding_Case_Agreement_Generated_Document" FOR EACH ROW EXECUTE FUNCTION trg_fn_resolve_generated_document_stream();

CREATE TRIGGER trg_correction_financial_lock BEFORE INSERT OR DELETE OR UPDATE ON "Funding_Case_Agreement_Journal_Voucher" FOR EACH ROW EXECUTE FUNCTION trg_fn_correction_financial_lock();

CREATE CONSTRAINT TRIGGER trg_enforce_jv_roster AFTER INSERT OR UPDATE OF _deleted ON "Funding_Case_Agreement_Journal_Voucher" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_assignable_entity_roster('fundingcasejournalvoucher');

CREATE TRIGGER trg_register_fundingcasejournalvoucher BEFORE INSERT ON "Funding_Case_Agreement_Journal_Voucher" FOR EACH ROW EXECUTE FUNCTION register_entity('fundingcasejournalvoucher');

CREATE TRIGGER trg_soft_delete_jv_assignments AFTER UPDATE OF _deleted ON "Funding_Case_Agreement_Journal_Voucher" FOR EACH ROW EXECUTE FUNCTION trg_fn_soft_delete_entity_assignments('fundingcasejournalvoucher');

CREATE TRIGGER trg_validate_jv BEFORE INSERT OR UPDATE ON "Funding_Case_Agreement_Journal_Voucher" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_jv();

CREATE TRIGGER zz_guard_agreement_financial_currency BEFORE INSERT OR UPDATE ON "Funding_Case_Agreement_Journal_Voucher" FOR EACH ROW EXECUTE FUNCTION guard_agreement_financial_currency();

CREATE TRIGGER trg_correction_financial_lock BEFORE INSERT OR DELETE OR UPDATE ON "Funding_Case_Agreement_Journal_Voucher_Line" FOR EACH ROW EXECUTE FUNCTION trg_fn_correction_financial_lock();

CREATE TRIGGER trg_protect_jv_line BEFORE INSERT OR DELETE OR UPDATE ON "Funding_Case_Agreement_Journal_Voucher_Line" FOR EACH ROW EXECUTE FUNCTION trg_fn_protect_jv_line();

CREATE CONSTRAINT TRIGGER trg_enforce_fundingcasemonitor_assignment_roster AFTER INSERT OR UPDATE OF _deleted ON "Funding_Case_Agreement_Monitor" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_assignable_entity_roster('fundingcasemonitor');

CREATE TRIGGER trg_register_fundingcasemonitor BEFORE INSERT ON "Funding_Case_Agreement_Monitor" FOR EACH ROW EXECUTE FUNCTION register_entity('fundingcasemonitor');

CREATE TRIGGER trg_resolve_monitor_stream BEFORE INSERT OR UPDATE OF egcs_fc_fundingagreement, egcs_fc_transferpaymentstream ON "Funding_Case_Agreement_Monitor" FOR EACH ROW EXECUTE FUNCTION trg_fn_resolve_monitor_stream();

CREATE TRIGGER trg_soft_delete_fundingcasemonitor_assignments AFTER UPDATE OF _deleted ON "Funding_Case_Agreement_Monitor" FOR EACH ROW EXECUTE FUNCTION trg_fn_soft_delete_entity_assignments('fundingcasemonitor');

CREATE CONSTRAINT TRIGGER trg_validate_fundingcasemonitor_status_agency AFTER INSERT OR UPDATE ON "Funding_Case_Agreement_Monitor" DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_funding_status_agency();

CREATE TRIGGER trg_ar_monitor_followup BEFORE INSERT OR UPDATE ON "Funding_Case_Agreement_Monitor_Followup" FOR EACH ROW EXECUTE FUNCTION trg_fn_ar_monitor_followup();

CREATE TRIGGER trg_correction_financial_lock BEFORE INSERT OR DELETE OR UPDATE ON "Funding_Case_Agreement_Payment" FOR EACH ROW EXECUTE FUNCTION trg_fn_correction_financial_lock();

CREATE CONSTRAINT TRIGGER trg_enforce_fundingcasepayment_assignment_roster AFTER INSERT OR UPDATE OF _deleted ON "Funding_Case_Agreement_Payment" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_assignable_entity_roster('fundingcasepayment');

CREATE TRIGGER trg_register_fundingcasepayment BEFORE INSERT ON "Funding_Case_Agreement_Payment" FOR EACH ROW EXECUTE FUNCTION register_entity('fundingcasepayment');

CREATE TRIGGER trg_resolve_payment_agreement BEFORE INSERT OR UPDATE OF egcs_fc_fundingagreementcommitment, egcs_fc_fundingagreement, egcs_fc_currency ON "Funding_Case_Agreement_Payment" FOR EACH ROW EXECUTE FUNCTION trg_fn_resolve_payment_agreement();

CREATE TRIGGER trg_soft_delete_fundingcasepayment_assignments AFTER UPDATE OF _deleted ON "Funding_Case_Agreement_Payment" FOR EACH ROW EXECUTE FUNCTION trg_fn_soft_delete_entity_assignments('fundingcasepayment');

CREATE CONSTRAINT TRIGGER trg_validate_fundingcasepayment_status_agency AFTER INSERT OR UPDATE ON "Funding_Case_Agreement_Payment" DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_funding_status_agency();

CREATE TRIGGER zz_ar_payment_control BEFORE INSERT OR UPDATE ON "Funding_Case_Agreement_Payment" FOR EACH ROW EXECUTE FUNCTION trg_fn_ar_payment_control();

CREATE TRIGGER zz_guard_agreement_financial_currency BEFORE INSERT OR UPDATE ON "Funding_Case_Agreement_Payment" FOR EACH ROW EXECUTE FUNCTION guard_agreement_financial_currency();

CREATE TRIGGER trg_correction_financial_lock BEFORE INSERT OR DELETE OR UPDATE ON "Funding_Case_Agreement_Payment_Line" FOR EACH ROW EXECUTE FUNCTION trg_fn_correction_financial_lock();

CREATE TRIGGER trg_resolve_payment_line_commitment BEFORE INSERT OR UPDATE OF egcs_fc_fundingagreementpayment, egcs_fc_fundingagreementcommitment ON "Funding_Case_Agreement_Payment_Line" FOR EACH ROW EXECUTE FUNCTION trg_fn_resolve_payment_line_commitment();

CREATE TRIGGER zz_ar_payment_line_control BEFORE INSERT OR UPDATE ON "Funding_Case_Agreement_Payment_Line" FOR EACH ROW EXECUTE FUNCTION trg_fn_ar_payment_line_control();

CREATE TRIGGER guard_agreement_currency_immutable BEFORE UPDATE OF egcs_fc_currency ON "Funding_Case_Agreement_Profile" FOR EACH ROW EXECUTE FUNCTION guard_agreement_currency_immutable();

CREATE TRIGGER guard_agreement_stream_proponent_types AFTER UPDATE OF egcs_fc_transferpaymentstream, _deleted ON "Funding_Case_Agreement_Profile" FOR EACH ROW EXECUTE FUNCTION guard_stream_proponent_types();

CREATE TRIGGER guard_future_agreement_proponent_types BEFORE UPDATE OF egcs_fc_transferpaymentstream, _deleted ON "Funding_Case_Agreement_Profile" FOR EACH ROW EXECUTE FUNCTION guard_future_proponent_type();

CREATE TRIGGER protect_agreement_stream BEFORE UPDATE ON "Funding_Case_Agreement_Profile" FOR EACH ROW EXECUTE FUNCTION protect_agreement_stream();

CREATE TRIGGER trg_create_agreement_working_versions AFTER INSERT ON "Funding_Case_Agreement_Profile" FOR EACH ROW EXECUTE FUNCTION trg_fn_create_agreement_working_versions();

CREATE CONSTRAINT TRIGGER trg_enforce_agreement_assignment_roster AFTER INSERT OR UPDATE OF _deleted ON "Funding_Case_Agreement_Profile" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_assignable_entity_roster('fundingcaseagreement');

CREATE TRIGGER trg_register_fundingcaseagreement BEFORE INSERT ON "Funding_Case_Agreement_Profile" FOR EACH ROW EXECUTE FUNCTION register_entity('fundingcaseagreement');

CREATE TRIGGER trg_soft_delete_agreement_assignments AFTER UPDATE OF _deleted ON "Funding_Case_Agreement_Profile" FOR EACH ROW EXECUTE FUNCTION trg_fn_soft_delete_entity_assignments('fundingcaseagreement');

CREATE CONSTRAINT TRIGGER trg_validate_fundingcaseagreement_status_agency AFTER INSERT OR UPDATE ON "Funding_Case_Agreement_Profile" DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_funding_status_agency();

CREATE TRIGGER trg_validate_agreement_revision BEFORE INSERT OR UPDATE ON "Funding_Case_Agreement_Revision" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_agreement_revision();
END $baseline$`.execute(db)
}
