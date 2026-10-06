import { sql, type Kysely } from 'kysely'
import type { Database } from '../../../shared/types/database'

// Clean-cutover baseline: extensions. Edit this subject directly.

/** Installs the current up definitions for this subject on a fresh database. */
export const up = async (db: Kysely<Database>): Promise<void> => {
  await sql`DO $baseline$ BEGIN
CREATE SCHEMA "extensions";

CREATE SEQUENCE "extensions"."agency_enablement_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "extensions"."agency_storage_selection_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "extensions"."kv_entry_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "extensions"."secret_entry_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "extensions"."stream_configuration_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE TABLE "extensions"."agency_enablement" (
  "id" bigint DEFAULT nextval('extensions.agency_enablement_id_seq'::regclass) NOT NULL,
  "extension_key" character varying(120) NOT NULL,
  "agency_id" bigint NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "agency_enablement_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX ext_idx_agency_enablement_extension_agency ON extensions.agency_enablement USING btree (extension_key, agency_id) WHERE (_deleted = false);

CREATE TABLE "extensions"."agency_storage_selection" (
  "id" bigint DEFAULT nextval('extensions.agency_storage_selection_id_seq'::regclass) NOT NULL,
  "agency_id" bigint NOT NULL,
  "provider_key" character varying(120) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "agency_storage_selection_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX ext_idx_storage_selection_active_agency ON extensions.agency_storage_selection USING btree (agency_id) WHERE (_deleted = false);

CREATE TABLE "extensions"."kv_entry" (
  "id" bigint DEFAULT nextval('extensions.kv_entry_id_seq'::regclass) NOT NULL,
  "extension_key" character varying(120) NOT NULL,
  "owner_type" character varying(80) NOT NULL,
  "owner_id" character varying(120) NOT NULL,
  "config_key" character varying(160) NOT NULL,
  "value" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "kv_entry_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX ext_idx_kv_entry_active_key ON extensions.kv_entry USING btree (extension_key, owner_type, owner_id, config_key) WHERE (_deleted = false);

CREATE TABLE "extensions"."secret_entry" (
  "id" bigint DEFAULT nextval('extensions.secret_entry_id_seq'::regclass) NOT NULL,
  "extension_key" character varying(120) NOT NULL,
  "owner_type" character varying(80) NOT NULL,
  "owner_id" character varying(120) NOT NULL,
  "secret_key" character varying(160) NOT NULL,
  "ciphertext" text NOT NULL,
  "iv" text NOT NULL,
  "auth_tag" text NOT NULL,
  "algorithm" character varying(40) NOT NULL,
  "key_version" integer NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "secret_entry_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX ext_idx_secret_entry_active_key ON extensions.secret_entry USING btree (extension_key, owner_type, owner_id, secret_key) WHERE (_deleted = false);

CREATE TABLE "extensions"."stream_configuration" (
  "id" bigint DEFAULT nextval('extensions.stream_configuration_id_seq'::regclass) NOT NULL,
  "extension_key" character varying(120) NOT NULL,
  "stream_id" bigint NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "stream_configuration_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX ext_idx_stream_configuration_extension_stream ON extensions.stream_configuration USING btree (extension_key, stream_id) WHERE (_deleted = false);

ALTER SEQUENCE "extensions"."agency_enablement_id_seq" OWNED BY "extensions"."agency_enablement"."id";

ALTER SEQUENCE "extensions"."agency_storage_selection_id_seq" OWNED BY "extensions"."agency_storage_selection"."id";

ALTER SEQUENCE "extensions"."kv_entry_id_seq" OWNED BY "extensions"."kv_entry"."id";

ALTER SEQUENCE "extensions"."secret_entry_id_seq" OWNED BY "extensions"."secret_entry"."id";

ALTER SEQUENCE "extensions"."stream_configuration_id_seq" OWNED BY "extensions"."stream_configuration"."id";
END $baseline$`.execute(db)
}

/** Installs the current installForeignKeys definitions for this subject on a fresh database. */
export const installForeignKeys = async (db: Kysely<Database>): Promise<void> => {
  await sql`DO $baseline$ BEGIN
ALTER TABLE "extensions"."agency_enablement" ADD CONSTRAINT "agency_enablement_agency_id_fkey" FOREIGN KEY (agency_id) REFERENCES "Agency_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "extensions"."agency_storage_selection" ADD CONSTRAINT "agency_storage_selection_agency_id_fkey" FOREIGN KEY (agency_id) REFERENCES "Agency_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "extensions"."stream_configuration" ADD CONSTRAINT "stream_configuration_stream_id_fkey" FOREIGN KEY (stream_id) REFERENCES "Transfer_Payment_Stream"(id) ON DELETE RESTRICT;
END $baseline$`.execute(db)
}
