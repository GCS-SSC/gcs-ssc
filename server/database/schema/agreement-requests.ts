import { sql, type Kysely } from 'kysely'
import type { Database } from '../../../shared/types/database'

/**
 * Installs correspondence tables as part of the Agreement baseline.
 * @param db - Database executing the Agreement baseline.
 */
export const installAgreementRequests = async (db: Kysely<Database>): Promise<void> => {
  await sql`DO $requests$ BEGIN
    CREATE TABLE "Funding_Case_Agreement_Request_Thread" (
      id bigserial CONSTRAINT fc_pk_request_thread PRIMARY KEY,
      egcs_fc_entityid bigint NOT NULL,
      egcs_fc_entitytype varchar(128) NOT NULL CONSTRAINT fc_chk_request_thread_type CHECK (egcs_fc_entitytype IN ('fundingcaseagreementclaim', 'fundingcaseforecast')),
      egcs_fc_subject varchar(255) NOT NULL CONSTRAINT fc_chk_request_thread_subject CHECK (length(btrim(egcs_fc_subject)) > 0),
      egcs_fc_internal boolean NOT NULL DEFAULT true,
      egcs_fc_status varchar(8) NOT NULL DEFAULT 'open' CONSTRAINT fc_chk_request_thread_status CHECK (egcs_fc_status IN ('open', 'resolved')),
      _deleted boolean NOT NULL DEFAULT false,
      CONSTRAINT fc_fk_request_thread_target FOREIGN KEY (egcs_fc_entityid, egcs_fc_entitytype) REFERENCES "Common_Entity" (id, egcs_cn_entitytype) ON DELETE RESTRICT
    );
    CREATE INDEX fc_idx_request_thread_target ON "Funding_Case_Agreement_Request_Thread" (egcs_fc_entityid, egcs_fc_entitytype) WHERE NOT _deleted;

    CREATE TABLE "Funding_Case_Agreement_Request_Entry" (
      id bigserial CONSTRAINT fc_pk_request_entry PRIMARY KEY,
      egcs_fc_thread bigint NOT NULL CONSTRAINT fc_fk_request_entry_thread REFERENCES "Funding_Case_Agreement_Request_Thread" (id) ON DELETE RESTRICT,
      egcs_fc_kind varchar(8) NOT NULL CONSTRAINT fc_chk_request_entry_kind CHECK (egcs_fc_kind IN ('question', 'reply', 'note')),
      egcs_fc_opening boolean NOT NULL DEFAULT false CONSTRAINT fc_chk_request_entry_opening CHECK (NOT egcs_fc_opening OR egcs_fc_kind = 'question'),
      egcs_fc_question bigint,
      egcs_fc_questionkind varchar(8) GENERATED ALWAYS AS (CASE WHEN egcs_fc_question IS NOT NULL THEN 'question' END) STORED,
      egcs_fc_body text NOT NULL CONSTRAINT fc_chk_request_entry_body CHECK (length(egcs_fc_body) <= 20000),
      egcs_fc_correspondenceat timestamptz NOT NULL,
      egcs_fc_loggedat timestamptz NOT NULL DEFAULT clock_timestamp(),
      egcs_fc_loggedby bigint NOT NULL CONSTRAINT fc_fk_request_entry_actor REFERENCES "Common_User" (id) ON DELETE RESTRICT,
      egcs_fc_contactname varchar(255),
      egcs_fc_contactemail varchar(255),
      egcs_fc_requestkey uuid NOT NULL,
      egcs_fc_requesthash varchar(64) NOT NULL,
      _deleted boolean NOT NULL DEFAULT false,
      CONSTRAINT fc_uq_request_entry_question_target UNIQUE (id, egcs_fc_thread, egcs_fc_kind),
      CONSTRAINT fc_uq_request_entry_command UNIQUE (egcs_fc_thread, egcs_fc_requestkey),
      CONSTRAINT fc_fk_request_entry_question FOREIGN KEY (egcs_fc_question, egcs_fc_thread, egcs_fc_questionkind) REFERENCES "Funding_Case_Agreement_Request_Entry" (id, egcs_fc_thread, egcs_fc_kind) ON DELETE RESTRICT,
      CONSTRAINT fc_chk_request_entry_details CHECK (
        (egcs_fc_kind IN ('question', 'note') AND egcs_fc_question IS NULL AND length(btrim(egcs_fc_body)) > 0 AND egcs_fc_contactname IS NULL AND egcs_fc_contactemail IS NULL)
        OR (egcs_fc_kind = 'reply' AND egcs_fc_question IS NOT NULL AND egcs_fc_contactname IS NOT NULL AND length(btrim(egcs_fc_contactname)) > 0)
      )
    );
    CREATE UNIQUE INDEX fc_uq_request_opening ON "Funding_Case_Agreement_Request_Entry" (egcs_fc_thread) WHERE egcs_fc_opening AND NOT _deleted;
    CREATE INDEX fc_idx_request_entry_key ON "Funding_Case_Agreement_Request_Entry" (egcs_fc_requestkey) WHERE NOT _deleted;

    CREATE TABLE "Funding_Case_Agreement_Request_Attachment" (
      id bigserial CONSTRAINT fc_pk_request_attachment PRIMARY KEY,
      egcs_fc_entry bigint NOT NULL CONSTRAINT fc_fk_request_attachment_entry REFERENCES "Funding_Case_Agreement_Request_Entry" (id) ON DELETE RESTRICT,
      egcs_fc_attachment bigint NOT NULL CONSTRAINT fc_uq_request_attachment_file UNIQUE CONSTRAINT fc_fk_request_attachment_file REFERENCES "Common_Attachment" (id) ON DELETE RESTRICT,
      _deleted boolean NOT NULL DEFAULT false
    );
    CREATE INDEX fc_idx_request_attachment_entry ON "Funding_Case_Agreement_Request_Attachment" (egcs_fc_entry) WHERE NOT _deleted;
  END $requests$`.execute(db)
}
