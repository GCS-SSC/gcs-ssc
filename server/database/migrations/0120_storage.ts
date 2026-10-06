import { sql, type Kysely } from 'kysely'
import type { Database } from '../../../shared/types/database'

// Clean-cutover baseline: storage. Edit this subject directly.

/** Installs the current up definitions for this subject on a fresh database. */
export const up = async (db: Kysely<Database>): Promise<void> => {
  await sql`DO $baseline$ BEGIN
CREATE SEQUENCE "storage_cleanup_outbox_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE TABLE "storage_cleanup_outbox" (
  "id" bigint DEFAULT nextval('storage_cleanup_outbox_id_seq'::regclass) NOT NULL,
  "provider_key" character varying(120) NOT NULL,
  "agency_id" bigint NOT NULL,
  "purpose" character varying(80) NOT NULL,
  "object_id" character varying(512) NOT NULL,
  "locator" jsonb NOT NULL,
  "operation" character varying(40) DEFAULT 'delete_object'::character varying NOT NULL,
  "payload" jsonb,
  "status" character varying(20) DEFAULT 'pending'::character varying NOT NULL,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
  "lease_owner" character varying(160),
  "lease_expires_at" timestamp with time zone,
  "last_error" character varying(1000),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  CONSTRAINT "storage_cleanup_outbox_pkey" PRIMARY KEY (id),
  CONSTRAINT "storage_cleanup_outbox_attempt_check" CHECK ((attempt_count >= 0)),
  CONSTRAINT "storage_cleanup_outbox_operation_check" CHECK (((operation)::text = ANY ((ARRAY['delete_object'::character varying, 'restore_metadata'::character varying])::text[]))),
  CONSTRAINT "storage_cleanup_outbox_status_check" CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'processing'::character varying, 'completed'::character varying, 'dead_letter'::character varying])::text[])))
);

CREATE INDEX storage_cleanup_outbox_claim_idx ON storage_cleanup_outbox USING btree (status, next_attempt_at, lease_expires_at, id);

CREATE INDEX storage_cleanup_outbox_object_idx ON storage_cleanup_outbox USING btree (provider_key, object_id);

ALTER SEQUENCE "storage_cleanup_outbox_id_seq" OWNED BY "storage_cleanup_outbox"."id";
END $baseline$`.execute(db)
}
