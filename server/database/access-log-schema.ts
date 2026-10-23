import { sql, type Kysely } from 'kysely'
import type { Database } from '../../shared/types/database'

/** Shared baseline: local test capture and the independent destination retain one evidence schema. */
export const ACCESS_EVENT_TABLE_SQL = `CREATE TABLE "audit"."access_event" (
  "id" uuid NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "actor_user_id" text,
  "actor_kind" text NOT NULL,
  "request_id" text,
  "sql" text NOT NULL,
  "parameters" jsonb NOT NULL,
  "duration_ms" double precision NOT NULL,
  "outcome" text NOT NULL,
  "transaction_outcome" text NOT NULL,
  "row_count" text,
  "returned_identities" jsonb NOT NULL,
  "limitations" jsonb NOT NULL,
  "scope_type" text DEFAULT COALESCE(NULLIF(current_setting('app.audit_scope'::text, true), ''::text), 'global'::text) NOT NULL,
  "agency_id" text DEFAULT NULLIF(current_setting('app.audit_agency_id'::text, true), ''::text),
  "agency_ids" text[] DEFAULT COALESCE((NULLIF(current_setting('app.audit_agency_ids'::text, true), ''::text))::text[],
CASE
    WHEN (NULLIF(current_setting('app.audit_agency_id'::text, true), ''::text) IS NOT NULL) THEN ARRAY[current_setting('app.audit_agency_id'::text, true)]
    ELSE '{}'::text[]
END) NOT NULL,
  "transaction_id" text DEFAULT NULLIF(current_setting('app.audit_transaction_id'::text, true), ''::text),
  "attribution_error" text,
  "inputs" jsonb DEFAULT (NULLIF(current_setting('app.audit_inputs'::text, true), ''::text))::jsonb,
  "table_name" text,
  "error_code" text,
  CONSTRAINT "access_event_pkey" PRIMARY KEY (id),
  CONSTRAINT "access_event_check" CHECK (((scope_type = 'agency'::text) = (agency_id IS NOT NULL))),
  CONSTRAINT "access_event_inputs_check" CHECK ((octet_length((inputs)::text) <= 32768)),
  CONSTRAINT "access_event_scope_type_check" CHECK ((scope_type = ANY (ARRAY['historical'::text, 'global'::text, 'agency'::text, 'unresolved'::text])))
);

CREATE INDEX access_event_actor_user_id_created_at_idx ON audit.access_event USING btree (actor_user_id, created_at DESC, id DESC);

CREATE INDEX access_event_agency_id_created_at_id_idx ON audit.access_event USING btree (agency_id, created_at DESC, id DESC);

CREATE INDEX access_event_agency_ids_idx ON audit.access_event USING gin (agency_ids) WHERE (scope_type = 'agency'::text);

CREATE INDEX access_event_created_at_id_idx ON audit.access_event USING btree (created_at DESC, id DESC);

CREATE INDEX access_event_request_id_idx ON audit.access_event USING btree (request_id, created_at DESC, id DESC);

CREATE INDEX access_event_returned_identities_idx ON audit.access_event USING gin (returned_identities);

CREATE INDEX access_event_table_name_created_at_idx ON audit.access_event USING btree (table_name, created_at DESC, id DESC);`

/**
 * Installs the independent access-history schema without any business-database dependencies.
 * @param db Unaudited independent access-history database.
 */
export const initializeAccessLogStore = async (db: Kysely<Database>): Promise<void> => {
  await sql`DO $access_store$ BEGIN
    PERFORM pg_advisory_xact_lock(214735, 914);
    IF to_regclass('audit.access_event') IS NOT NULL THEN
      IF to_regclass('audit.access_store_schema') IS NULL THEN
        RAISE EXCEPTION 'Independent access-history schema is not ready' USING ERRCODE = '55000';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM audit.access_store_schema WHERE version = 1)
        OR to_regprocedure('audit.expire_access_events(integer,integer)') IS NULL
        OR to_regprocedure('audit.protect_access_event()') IS NULL
        OR (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'audit.access_event'::regclass
          AND tgname IN ('append_only', 'no_truncate') AND tgenabled <> 'D') <> 2 THEN
        RAISE EXCEPTION 'Independent access-history schema is not ready' USING ERRCODE = '55000';
      END IF;
      RETURN;
    END IF;
    CREATE SCHEMA IF NOT EXISTS audit;
    ${sql.raw(ACCESS_EVENT_TABLE_SQL)}

    CREATE FUNCTION audit.protect_access_event() RETURNS trigger LANGUAGE plpgsql AS $protect$
    DECLARE cutoff timestamptz;
    BEGIN
      IF TG_OP = 'DELETE' AND current_setting('app.access_expiry', true) = 'on' THEN
        cutoff := nullif(current_setting('app.access_expiry_before', true), '')::timestamptz;
        IF cutoff IS NOT NULL AND OLD.created_at < cutoff THEN RETURN OLD; END IF;
      END IF;
      RAISE EXCEPTION 'access events are append-only' USING ERRCODE = '55000';
    END $protect$;
    CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON audit.access_event
      FOR EACH ROW EXECUTE FUNCTION audit.protect_access_event();
    CREATE TRIGGER no_truncate BEFORE TRUNCATE ON audit.access_event
      FOR EACH STATEMENT EXECUTE FUNCTION audit.protect_access_event();

    CREATE FUNCTION audit.expire_access_events(access_days integer, batch_size integer DEFAULT 1000)
    RETURNS integer LANGUAGE plpgsql AS $expiry$
    DECLARE cutoff timestamptz; removed integer;
    BEGIN
      IF access_days IS NULL OR access_days < 1 THEN
        RAISE EXCEPTION 'Invalid access retention period';
      END IF;
      IF batch_size IS NULL OR batch_size < 1 OR batch_size > 10000 THEN
        RAISE EXCEPTION 'Invalid access expiry batch';
      END IF;
      IF NOT pg_try_advisory_xact_lock(214735, 915) THEN RETURN 0; END IF;
      cutoff := now() - make_interval(days => access_days);
      PERFORM set_config('app.access_expiry', 'on', true);
      PERFORM set_config('app.access_expiry_before', cutoff::text, true);
      DELETE FROM audit.access_event WHERE id IN (
        SELECT id FROM audit.access_event WHERE created_at < cutoff ORDER BY created_at, id LIMIT batch_size
      );
      GET DIAGNOSTICS removed = ROW_COUNT;
      PERFORM set_config('app.access_expiry', '', true);
      PERFORM set_config('app.access_expiry_before', '', true);
      RETURN removed;
    END $expiry$;
    CREATE TABLE audit.access_store_schema(version integer PRIMARY KEY CHECK (version = 1));
    INSERT INTO audit.access_store_schema(version) VALUES (1);
  END $access_store$`.execute(db)
}
