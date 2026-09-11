import { sql, type Kysely } from 'kysely'
import type { Database } from '../../../shared/types/database'

export const up = async (db: Kysely<Database>): Promise<void> => {
  await sql`
    DO $migration$ BEGIN
    CREATE SCHEMA audit;
    ALTER TABLE public.security_audit_event SET SCHEMA audit;
    ALTER TABLE audit.security_audit_event ADD COLUMN request_id text
      DEFAULT nullif(current_setting('app.audit_request_id', true), '');
    DROP TRIGGER security_audit_event_append_only ON audit.security_audit_event;
    DROP FUNCTION public.prevent_security_audit_event_mutation();
    CREATE TABLE audit.change_event (
      id bigserial PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      actor_user_id text, actor_kind text NOT NULL, request_id text, query_id text,
      table_name text NOT NULL, record_id text, record_keys jsonb NOT NULL,
      operation text NOT NULL, delta jsonb NOT NULL
    );
    CREATE TABLE audit.access_event (
      id uuid PRIMARY KEY, created_at timestamptz NOT NULL,
      actor_user_id text, actor_kind text NOT NULL, request_id text,
      sql text NOT NULL, parameters jsonb NOT NULL,
      duration_ms double precision NOT NULL, outcome text NOT NULL,
      transaction_outcome text NOT NULL, row_count text,
      returned_identities jsonb NOT NULL, limitations jsonb NOT NULL,
      table_name text, error_code text
    );
    CREATE TABLE audit.capture_policy (
      table_schema text NOT NULL, table_name text NOT NULL,
      excluded_columns text[] NOT NULL DEFAULT '{}', enabled boolean NOT NULL DEFAULT true,
      PRIMARY KEY (table_schema, table_name)
    );
    CREATE TABLE audit.retention_policy (
      singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
      audit_days integer NOT NULL CHECK(audit_days > 0), access_days integer NOT NULL CHECK(access_days > 0)
    );
    INSERT INTO audit.retention_policy VALUES (true, 365, 30);
    CREATE INDEX ON audit.change_event(created_at, id);
    CREATE INDEX ON audit.change_event(actor_user_id, created_at);
    CREATE INDEX ON audit.change_event(table_name, record_id, created_at);
    CREATE INDEX ON audit.change_event(request_id);
    CREATE INDEX ON audit.change_event USING gin(record_keys);
    CREATE INDEX ON audit.access_event(created_at, id);
    CREATE INDEX ON audit.access_event(actor_user_id, created_at);
    CREATE INDEX ON audit.access_event(request_id);
    CREATE INDEX ON audit.access_event(table_name, created_at);
    CREATE INDEX ON audit.access_event USING gin(returned_identities);
    CREATE INDEX ON audit.security_audit_event(created_at, id);
    CREATE INDEX ON audit.security_audit_event(request_id);
    CREATE INDEX ON audit.security_audit_event(actor_user_id, created_at);

    CREATE FUNCTION audit.protect_event() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE days integer;
    BEGIN
      IF TG_OP = 'DELETE' AND current_setting('app.audit_expiry', true) = 'on' THEN
        SELECT CASE WHEN TG_TABLE_NAME = 'access_event' THEN access_days ELSE audit_days END
          INTO days FROM audit.retention_policy WHERE singleton;
        IF OLD.created_at < now() - make_interval(days => days) THEN RETURN OLD; END IF;
      END IF;
      RAISE EXCEPTION 'audit events are append-only' USING ERRCODE = '55000';
    END $$;

    CREATE FUNCTION audit.exact_json(value jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
    DECLARE result jsonb;
    BEGIN
      CASE jsonb_typeof(value)
        WHEN 'number' THEN RETURN to_jsonb(value #>> '{}');
        WHEN 'array' THEN
          SELECT coalesce(jsonb_agg(audit.exact_json(v)), '[]') INTO result FROM jsonb_array_elements(value) v;
          RETURN result;
        WHEN 'object' THEN
          value := (SELECT coalesce(jsonb_object_agg(k, CASE WHEN k ~* 'password|token|secret|credential|encrypted|cipher' THEN to_jsonb('[REDACTED]'::text) ELSE v END), '{}') FROM jsonb_each(value) e(k,v));
          SELECT coalesce(jsonb_object_agg(k, audit.exact_json(v)), '{}') INTO result FROM jsonb_each(value) e(k,v);
          RETURN result;
        ELSE RETURN value;
      END CASE;
    END $$;

    CREATE FUNCTION audit.capture_change() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE before_row jsonb; after_row jsonb; evidence jsonb; keys jsonb; excluded text[];
      operation text := lower(TG_OP); key_column text;
    BEGIN
      IF current_setting('app.audit_bootstrap', true) = 'on' THEN RETURN coalesce(NEW, OLD); END IF;
      IF TG_OP = 'UPDATE' AND to_jsonb(OLD) = to_jsonb(NEW) THEN RETURN NEW; END IF;
      SELECT excluded_columns INTO excluded FROM audit.capture_policy
        WHERE table_schema = TG_TABLE_SCHEMA AND table_name = TG_TABLE_NAME AND enabled;
      IF NOT FOUND THEN RETURN coalesce(NEW, OLD); END IF;
      before_row := audit.exact_json(to_jsonb(OLD)) - excluded;
      after_row := audit.exact_json(to_jsonb(NEW)) - excluded;
      keys := '{}';
      FOR key_column IN SELECT a.attname FROM pg_index i
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        WHERE i.indrelid = TG_RELID AND i.indisprimary ORDER BY a.attnum
      LOOP
        keys := keys || jsonb_build_object(key_column, coalesce(after_row, before_row)->key_column);
      END LOOP;
      IF TG_OP = 'UPDATE' THEN
        SELECT coalesce(jsonb_object_agg(k, jsonb_build_object('old', before_row->k, 'new', v)), '{}')
          INTO evidence FROM jsonb_each(after_row) e(k,v) WHERE (to_jsonb(OLD)->k) IS DISTINCT FROM (to_jsonb(NEW)->k);
        IF OLD IS DISTINCT FROM NEW AND evidence = '{}' THEN evidence := '{"redacted_change":true}'; END IF;
        IF before_row->>'_deleted' = 'false' AND after_row->>'_deleted' = 'true' THEN operation := 'soft_delete'; evidence := after_row; END IF;
        IF before_row->>'_deleted' = 'true' AND after_row->>'_deleted' = 'false' THEN operation := 'restore'; END IF;
      ELSE evidence := coalesce(after_row, before_row); END IF;
      INSERT INTO audit.change_event(actor_user_id, actor_kind, request_id, query_id,
        table_name, record_id, record_keys, operation, delta)
      VALUES (nullif(current_setting('app.audit_actor_user_id', true), ''),
        coalesce(nullif(current_setting('app.audit_actor_kind', true), ''), 'database'),
        nullif(current_setting('app.audit_request_id', true), ''), nullif(current_setting('app.audit_query_id', true), ''),
        TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME, keys->>'id', keys, operation, evidence);
      RETURN coalesce(NEW, OLD);
    END $$;

    CREATE FUNCTION audit.reconcile_capture() RETURNS void LANGUAGE plpgsql AS $$
    DECLARE target record; excluded text[];
    BEGIN
      FOR target IN SELECT n.nspname, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'r' AND n.nspname NOT IN ('audit', 'information_schema')
        AND n.nspname NOT LIKE 'pg_%'
        AND c.relname NOT LIKE '%migration%' AND c.relname NOT LIKE '%cleanup%'
      LOOP
        SELECT coalesce(array_agg(column_name::text), '{}') INTO excluded FROM information_schema.columns
          WHERE table_schema = target.nspname AND table_name = target.relname
          AND (column_name ~* 'password|token|secret|credential|encrypted|cipher|(^|_)salt($|_)'
            OR (target.relname IN ('account', 'session', 'verification') AND column_name NOT IN ('id', 'userId', 'createdAt', 'updatedAt', 'expiresAt'))
            OR (target.relname ~* 'secret' AND column_name NOT IN ('id', 'extension_key', 'agency_id', 'created_at', 'updated_at')));
        INSERT INTO audit.capture_policy VALUES(target.nspname, target.relname, excluded, true)
          ON CONFLICT (table_schema, table_name) DO UPDATE
          SET excluded_columns = ARRAY(SELECT DISTINCT unnest(audit.capture_policy.excluded_columns || EXCLUDED.excluded_columns));
        EXECUTE format('DROP TRIGGER IF EXISTS audit_capture ON %I.%I', target.nspname, target.relname);
        EXECUTE format('CREATE TRIGGER audit_capture AFTER INSERT OR UPDATE OR DELETE ON %I.%I FOR EACH ROW EXECUTE FUNCTION audit.capture_change()', target.nspname, target.relname);
      END LOOP;
    END $$;

    CREATE FUNCTION audit.expire_events(batch_size integer DEFAULT 1000) RETURNS integer LANGUAGE plpgsql AS $$
    DECLARE target text; days integer; removed integer; total integer := 0;
    BEGIN
      IF batch_size < 1 OR batch_size > 10000 THEN RAISE EXCEPTION 'Invalid audit expiry batch'; END IF;
      IF NOT pg_try_advisory_xact_lock(214735, 913) THEN RETURN 0; END IF;
      PERFORM set_config('app.audit_expiry', 'on', true);
      FOREACH target IN ARRAY ARRAY['change_event', 'security_audit_event', 'access_event'] LOOP
        SELECT CASE WHEN target = 'access_event' THEN access_days ELSE audit_days END INTO days
          FROM audit.retention_policy WHERE singleton;
        EXECUTE format('DELETE FROM audit.%I WHERE id IN (SELECT id FROM audit.%I WHERE created_at < now() - make_interval(days => $1) ORDER BY created_at LIMIT $2)', target, target)
          USING days, batch_size;
        GET DIAGNOSTICS removed = ROW_COUNT; total := total + removed;
      END LOOP;
      PERFORM set_config('app.audit_expiry', '', true);
      RETURN total;
    END $$;
    END $migration$;
  `.execute(db)
  for (const table of ['change_event', 'access_event', 'security_audit_event']) {
    await sql.raw(`DO $migration$ BEGIN CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON audit.${table} FOR EACH ROW EXECUTE FUNCTION audit.protect_event();
      CREATE TRIGGER no_truncate BEFORE TRUNCATE ON audit.${table} FOR EACH STATEMENT EXECUTE FUNCTION audit.protect_event(); END $migration$`).execute(db)
  }
}

export const down = async (db: Kysely<Database>): Promise<void> => {
  await sql`DO $migration$ BEGIN
    DROP TRIGGER append_only ON audit.security_audit_event;
    DROP TRIGGER no_truncate ON audit.security_audit_event;
    ALTER TABLE audit.security_audit_event DROP COLUMN request_id;
    ALTER TABLE audit.security_audit_event SET SCHEMA public;
    CREATE FUNCTION public.prevent_security_audit_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'security_audit_event is append-only' USING ERRCODE = '55000'; END $$;
    CREATE TRIGGER security_audit_event_append_only BEFORE UPDATE OR DELETE ON public.security_audit_event
      FOR EACH ROW EXECUTE FUNCTION public.prevent_security_audit_event_mutation();
    DROP SCHEMA audit CASCADE;
  END $migration$`.execute(db)
}
