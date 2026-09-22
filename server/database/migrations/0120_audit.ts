import { sql, type Kysely } from 'kysely'
import { AUDIT_TABLE_OWNERSHIP } from '../audit-ownership-registry'
import { installAuditOwnershipFunctions } from '../audit-ownership-functions'
import { installAuditOwnershipCapture, installAuditCaptureReconciliation } from '../audit-ownership-capture'
import { installEnvironmentAuditRetention } from '../audit-retention'
import type { Database } from '../../../shared/types/database'

export const up = async (db: Kysely<Database>): Promise<void> => {
  await sql`
    DO $migration$ BEGIN
    CREATE SCHEMA audit;
    ALTER TABLE public.security_audit_event SET SCHEMA audit;
    DROP TRIGGER security_audit_event_append_only ON audit.security_audit_event;
    DROP FUNCTION public.prevent_security_audit_event_mutation();
    CREATE TABLE audit.change_event (
      id bigserial PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      actor_user_id text, actor_kind text NOT NULL, request_id text, query_id text,
      table_name text NOT NULL, record_id text, record_keys jsonb NOT NULL,
      scope_type text NOT NULL DEFAULT coalesce(nullif(current_setting('app.audit_scope', true), ''), 'global')
        CHECK (scope_type IN ('historical', 'global', 'agency', 'unresolved')),
      agency_id text DEFAULT nullif(current_setting('app.audit_agency_id', true), ''),
      agency_ids text[] NOT NULL DEFAULT coalesce(nullif(current_setting('app.audit_agency_ids', true), '')::text[],
        CASE WHEN nullif(current_setting('app.audit_agency_id', true), '') IS NOT NULL
          THEN ARRAY[current_setting('app.audit_agency_id', true)] ELSE '{}'::text[] END),
      transaction_id text DEFAULT nullif(current_setting('app.audit_transaction_id', true), ''),
      attribution_error text,
      inputs jsonb DEFAULT nullif(current_setting('app.audit_inputs', true), '')::jsonb,
      CHECK ((scope_type = 'agency') = (agency_id IS NOT NULL)),
      CHECK (octet_length(inputs::text) <= 32768),
      operation text NOT NULL, delta jsonb NOT NULL
    );
    CREATE TABLE audit.access_event (
      id uuid PRIMARY KEY, created_at timestamptz NOT NULL,
      actor_user_id text, actor_kind text NOT NULL, request_id text,
      sql text NOT NULL, parameters jsonb NOT NULL,
      duration_ms double precision NOT NULL, outcome text NOT NULL,
      transaction_outcome text NOT NULL, row_count text,
      returned_identities jsonb NOT NULL, limitations jsonb NOT NULL,
      scope_type text NOT NULL DEFAULT coalesce(nullif(current_setting('app.audit_scope', true), ''), 'global')
        CHECK (scope_type IN ('historical', 'global', 'agency', 'unresolved')),
      agency_id text DEFAULT nullif(current_setting('app.audit_agency_id', true), ''),
      agency_ids text[] NOT NULL DEFAULT coalesce(nullif(current_setting('app.audit_agency_ids', true), '')::text[],
        CASE WHEN nullif(current_setting('app.audit_agency_id', true), '') IS NOT NULL
          THEN ARRAY[current_setting('app.audit_agency_id', true)] ELSE '{}'::text[] END),
      transaction_id text DEFAULT nullif(current_setting('app.audit_transaction_id', true), ''),
      attribution_error text,
      inputs jsonb DEFAULT nullif(current_setting('app.audit_inputs', true), '')::jsonb,
      CHECK ((scope_type = 'agency') = (agency_id IS NOT NULL)),
      CHECK (octet_length(inputs::text) <= 32768),
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
  for (const table of ['change_event', 'security_audit_event', 'access_event']) {
    await sql.raw(`CREATE INDEX ON audit.${table}(agency_id, created_at, id)`).execute(db)
    await sql.raw(`CREATE INDEX ${table}_agency_ids_idx ON audit.${table} USING gin(agency_ids) WHERE scope_type = 'agency'`).execute(db)
  }
  await sql`
    CREATE OR REPLACE FUNCTION audit.exact_json(value jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
    DECLARE result jsonb; content text;
    BEGIN
      CASE jsonb_typeof(value)
        WHEN 'number' THEN RETURN to_jsonb(value #>> '{}');
        WHEN 'string' THEN
          content := value #>> '{}';
          IF content ~ '^[[:space:]]*[{[]' THEN
            BEGIN
              RETURN audit.exact_json(content::jsonb);
            EXCEPTION WHEN invalid_text_representation THEN
              RETURN to_jsonb('[REDACTED: malformed document]'::text);
            END;
          END IF;
          IF content ~* '(Bearer|Basic)[[:space:]]+[^[:space:]]+|(authorization|password|passwd|token|secret|api[_-]?key|credential)[[:space:]]*[=:][[:space:]]*[^[:space:]]+|[a-z][a-z0-9+.-]*://[^/@[:space:]]+:[^/@[:space:]]+@' THEN
            RETURN to_jsonb('[REDACTED]'::text);
          END IF;
          RETURN value;
        WHEN 'array' THEN
          SELECT coalesce(jsonb_agg(audit.exact_json(v)), '[]') INTO result FROM jsonb_array_elements(value) v;
          RETURN result;
        WHEN 'object' THEN
          value := (SELECT coalesce(jsonb_object_agg(k, CASE WHEN k ~* 'password|passwd|token|cookie|authorization|api.?key|secret|credential|encrypted|cipher|private.?key|(^|_)salt($|_)' THEN to_jsonb('[REDACTED]'::text) ELSE v END), '{}') FROM jsonb_each(value) e(k,v));
          SELECT coalesce(jsonb_object_agg(k, audit.exact_json(v)), '{}') INTO result FROM jsonb_each(value) e(k,v);
          RETURN result;
        ELSE RETURN value;
      END CASE;
    END $$;
  `.execute(db)
  await sql`CREATE INDEX ON audit.change_event(query_id)`.execute(db)
  // Actor evidence compares canonical text IDs exactly. Keep that contract while
  // avoiding a scan of every active assignment for each authenticated statement.
  await sql`CREATE INDEX user_role_assignment_audit_actor_active
    ON public.user_role_assignment ((user_id::text)) WHERE NOT _deleted`.execute(db)
  await installEnvironmentAuditRetention(db)
  await installAuditOwnershipFunctions(db, AUDIT_TABLE_OWNERSHIP)
  await sql`CREATE FUNCTION audit.installed_extension_ownership() RETURNS jsonb
    LANGUAGE sql IMMUTABLE AS 'SELECT ''{}''::jsonb'`.execute(db)
  await installAuditOwnershipCapture(db)
  await installAuditCaptureReconciliation(db)
  await sql`DO $migration$ BEGIN
    CREATE FUNCTION audit.scope_security_event() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE target_table text; target_row jsonb; resolved jsonb; audience text[];
    BEGIN
      target_table := audit.security_target_registry()->>NEW.target_type;
      IF target_table IS NOT NULL THEN
        EXECUTE format('SELECT to_jsonb(t) FROM %I.%I t WHERE id = %L',
          split_part(target_table,'.',1),split_part(target_table,'.',2),NEW.target_id) INTO target_row;
      END IF;
      IF target_row IS NULL THEN
        resolved := jsonb_build_object('type','unresolved','reason','security_target_missing');
      ELSE
        resolved := audit.resolve_ownership(target_table,target_row,NEW.actor_user_id::text);
      END IF;
      SELECT coalesce(array_agg(value ORDER BY value),'{}') INTO audience
        FROM jsonb_array_elements_text(coalesce(resolved->'agencyIds','[]'));
      NEW.scope_type := resolved->>'type';
      NEW.agency_ids := audience;
      NEW.agency_id := audience[1];
      NEW.attribution_error := CASE WHEN NEW.scope_type = 'unresolved' THEN resolved->>'reason' END;
      RETURN NEW;
    END $$;
    CREATE TRIGGER security_event_ownership BEFORE INSERT ON audit.security_audit_event
      FOR EACH ROW EXECUTE FUNCTION audit.scope_security_event();
    CREATE FUNCTION audit.capture_security_access_scope() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      PERFORM audit.accumulate_statement_scope(audit.resolve_ownership('audit.security_audit_event',to_jsonb(NEW),
        NEW.actor_user_id::text),'insert');
      RETURN NEW;
    END $$;
    CREATE TRIGGER audit_insert_attempt BEFORE INSERT ON audit.security_audit_event
      FOR EACH ROW EXECUTE FUNCTION audit.capture_insert_attempt();
    CREATE TRIGGER audit_statement_context BEFORE INSERT OR UPDATE OR DELETE ON audit.security_audit_event
      FOR EACH STATEMENT EXECUTE FUNCTION audit.snapshot_actor_context();
    CREATE TRIGGER audit_access_scope AFTER INSERT ON audit.security_audit_event
      FOR EACH ROW EXECUTE FUNCTION audit.capture_security_access_scope();
  END $migration$`.execute(db)

  await sql`INSERT INTO audit.capture_policy(table_schema,table_name,excluded_columns,enabled)
    VALUES('audit','capture_policy','{}',true),('audit','security_audit_event','{}',true)
    ON CONFLICT(table_schema,table_name) DO NOTHING`.execute(db)
  await sql`CREATE TRIGGER audit_insert_attempt BEFORE INSERT ON audit.capture_policy
    FOR EACH ROW EXECUTE FUNCTION audit.capture_insert_attempt()`.execute(db)
  await sql`CREATE TRIGGER audit_statement_context BEFORE INSERT OR UPDATE OR DELETE ON audit.capture_policy
    FOR EACH STATEMENT EXECUTE FUNCTION audit.snapshot_actor_context()`.execute(db)
  await sql`CREATE TRIGGER audit_capture AFTER INSERT OR UPDATE OR DELETE ON audit.capture_policy
    FOR EACH ROW EXECUTE FUNCTION audit.capture_change()`.execute(db)
  await sql`DO $reconcile$ DECLARE previous text := current_setting('app.audit_maintenance',true); BEGIN
    PERFORM set_config('app.audit_maintenance','on',true);
    PERFORM audit.reconcile_capture();
    PERFORM set_config('app.audit_maintenance',coalesce(previous,''),true);
  END $reconcile$`.execute(db)


  await sql`
    CREATE OR REPLACE FUNCTION register_entity() RETURNS trigger AS $$
    DECLARE allocated_id bigint; previous_owner text;
    BEGIN
      allocated_id := nextval(pg_get_serial_sequence('public."Common_Entity"','id'));
      previous_owner := current_setting('app.audit_creation_owner',true);
      PERFORM set_config('app.audit_creation_owner',jsonb_build_object(
        'table','public.Common_Entity','match',jsonb_build_object('id',allocated_id),
        'ownerTable',TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME,'ownerRow',to_jsonb(NEW)
      )::text,true);
      INSERT INTO "Common_Entity"(id,egcs_cn_entitytype) VALUES(allocated_id,TG_ARGV[0]::varchar(128));
      PERFORM set_config('app.audit_creation_owner',coalesce(previous_owner,''),true);
      NEW.id := allocated_id;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)

  // Publication identities are inserted before the subtype exists. The invoker's NEW row
  // carries the verified owner; bind it to this exact identity and restore nested context.
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_register_publication() RETURNS trigger AS $$
    DECLARE publication_kind varchar(64) := TG_ARGV[0]; registered_kind varchar(64); previous_owner text;
    BEGIN
      previous_owner := current_setting('app.audit_creation_owner',true);
      IF NEW.id IS NULL THEN
        NEW.id := nextval(pg_get_serial_sequence('public."Common_Publication"','id'));
      END IF;
      PERFORM set_config('app.audit_creation_owner',jsonb_build_object(
        'table','public.Common_Publication',
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
    $$ LANGUAGE plpgsql
  `.execute(db)


  await sql`
    CREATE OR REPLACE FUNCTION enforce_role_permission_scope() RETURNS trigger AS $$
    DECLARE target_role_id bigint; role_agency_id bigint; has_program_scope boolean; scope_type text; invalid_count integer;
    BEGIN
      IF TG_TABLE_NAME = 'role' THEN
        target_role_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
      ELSE
        target_role_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.role_id ELSE NEW.role_id END;
      END IF;
      SELECT agency_id INTO role_agency_id FROM role WHERE id = target_role_id AND _deleted = false;
      IF NOT FOUND THEN RETURN NULL; END IF;
      SELECT EXISTS(SELECT 1 FROM role_transfer_payment_scope WHERE role_id = target_role_id AND _deleted = false) INTO has_program_scope;
      IF role_agency_id IS NULL AND has_program_scope THEN
        RAISE EXCEPTION 'global role cannot have transfer payment scopes'
          USING ERRCODE = '23514', CONSTRAINT = 'role_permission_scope_check';
      END IF;
      scope_type := CASE WHEN role_agency_id IS NULL THEN 'global' WHEN has_program_scope THEN 'program' ELSE 'agency' END;
      SELECT count(*) INTO invalid_count FROM role_permission
      WHERE role_id = target_role_id AND _deleted = false AND (
        (subject = 'system' AND scope_type <> 'global')
        OR (subject IN ('audit', 'agency', 'role', 'user', 'applicant_recipient') AND scope_type = 'program')
      );
      IF invalid_count > 0 THEN
        RAISE EXCEPTION 'role permission is incompatible with role scope'
          USING ERRCODE = '23514', CONSTRAINT = 'role_permission_scope_check';
      END IF;
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)
}

export const down = async (db: Kysely<Database>): Promise<void> => {
  await sql`DO $migration$ BEGIN
    DROP TRIGGER append_only ON audit.security_audit_event;
    DROP TRIGGER no_truncate ON audit.security_audit_event;
    ALTER TABLE audit.security_audit_event SET SCHEMA public;
    CREATE FUNCTION public.prevent_security_audit_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'security_audit_event is append-only' USING ERRCODE = '55000'; END $$;
    CREATE TRIGGER security_audit_event_append_only BEFORE UPDATE OR DELETE ON public.security_audit_event
      FOR EACH ROW EXECUTE FUNCTION public.prevent_security_audit_event_mutation();
    DROP SCHEMA audit CASCADE;
  END $migration$`.execute(db)
}
