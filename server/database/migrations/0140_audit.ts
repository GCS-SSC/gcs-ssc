import { sql, type Kysely } from 'kysely'
import type { Database } from '../../../shared/types/database'

// Clean-cutover baseline: audit. Edit this subject directly.
import { installAuditOwnershipFunctions } from '../audit-ownership-functions'
import { installAuditOwnershipCapture, installAuditCaptureReconciliation } from '../audit-ownership-capture'

/** Installs the current up definitions for this subject on a fresh database. */
const createTables = async (db: Kysely<Database>): Promise<void> => {
  await sql`DO $baseline$ BEGIN
CREATE SCHEMA "audit";

CREATE SEQUENCE "audit"."change_event_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "audit"."security_audit_event_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE TABLE "audit"."access_event" (
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

CREATE INDEX access_event_actor_user_id_created_at_idx ON audit.access_event USING btree (actor_user_id, created_at);

CREATE INDEX access_event_agency_id_created_at_id_idx ON audit.access_event USING btree (agency_id, created_at, id);

CREATE INDEX access_event_agency_ids_idx ON audit.access_event USING gin (agency_ids) WHERE (scope_type = 'agency'::text);

CREATE INDEX access_event_created_at_id_idx ON audit.access_event USING btree (created_at, id);

CREATE INDEX access_event_request_id_idx ON audit.access_event USING btree (request_id);

CREATE INDEX access_event_returned_identities_idx ON audit.access_event USING gin (returned_identities);

CREATE INDEX access_event_table_name_created_at_idx ON audit.access_event USING btree (table_name, created_at);

CREATE TABLE "audit"."capture_policy" (
  "table_schema" text NOT NULL,
  "table_name" text NOT NULL,
  "excluded_columns" text[] DEFAULT '{}'::text[] NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  CONSTRAINT "capture_policy_pkey" PRIMARY KEY (table_schema, table_name)
);

CREATE TABLE "audit"."change_event" (
  "id" bigint DEFAULT nextval('audit.change_event_id_seq'::regclass) NOT NULL,
  "created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
  "actor_user_id" text,
  "actor_kind" text NOT NULL,
  "request_id" text,
  "query_id" text,
  "table_name" text NOT NULL,
  "record_id" text,
  "record_keys" jsonb NOT NULL,
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
  "operation" text NOT NULL,
  "delta" jsonb NOT NULL,
  CONSTRAINT "change_event_pkey" PRIMARY KEY (id),
  CONSTRAINT "change_event_check" CHECK (((scope_type = 'agency'::text) = (agency_id IS NOT NULL))),
  CONSTRAINT "change_event_inputs_check" CHECK ((octet_length((inputs)::text) <= 32768)),
  CONSTRAINT "change_event_scope_type_check" CHECK ((scope_type = ANY (ARRAY['historical'::text, 'global'::text, 'agency'::text, 'unresolved'::text])))
);

CREATE INDEX change_event_actor_user_id_created_at_idx ON audit.change_event USING btree (actor_user_id, created_at);

CREATE INDEX change_event_agency_id_created_at_id_idx ON audit.change_event USING btree (agency_id, created_at, id);

CREATE INDEX change_event_agency_ids_idx ON audit.change_event USING gin (agency_ids) WHERE (scope_type = 'agency'::text);

CREATE INDEX change_event_created_at_id_idx ON audit.change_event USING btree (created_at, id);

CREATE INDEX change_event_query_id_idx ON audit.change_event USING btree (query_id);

CREATE INDEX change_event_record_keys_idx ON audit.change_event USING gin (record_keys);

CREATE INDEX change_event_request_id_idx ON audit.change_event USING btree (request_id);

CREATE INDEX change_event_table_name_record_id_created_at_idx ON audit.change_event USING btree (table_name, record_id, created_at);

CREATE TABLE "audit"."security_audit_event" (
  "id" bigint DEFAULT nextval('audit.security_audit_event_id_seq'::regclass) NOT NULL,
  "actor_user_id" bigint NOT NULL,
  "event_type" character varying NOT NULL,
  "target_type" character varying NOT NULL,
  "target_id" character varying NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "request_id" text DEFAULT NULLIF(current_setting('app.audit_request_id'::text, true), ''::text),
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
  CONSTRAINT "security_audit_event_pkey" PRIMARY KEY (id),
  CONSTRAINT "security_audit_event_agency_scope" CHECK (((scope_type = 'agency'::text) = (agency_id IS NOT NULL))),
  CONSTRAINT "security_audit_event_inputs_bound" CHECK ((octet_length((inputs)::text) <= 32768)),
  CONSTRAINT "security_audit_event_scope_type" CHECK ((scope_type = ANY (ARRAY['historical'::text, 'global'::text, 'agency'::text, 'unresolved'::text]))),
  CONSTRAINT "security_audit_event_type_check" CHECK (((event_type)::text = ANY ((ARRAY['role.created'::character varying, 'role.profile_updated'::character varying, 'role.deleted'::character varying, 'role.permission_updated'::character varying, 'user.created'::character varying, 'user.profile_updated'::character varying, 'user.deleted'::character varying, 'user.activated'::character varying, 'user.role_assignment_created'::character varying, 'user.role_assignment_deleted'::character varying])::text[]))),
  CONSTRAINT "security_audit_target_type_check" CHECK (((target_type)::text = ANY ((ARRAY['role'::character varying, 'user'::character varying, 'user_role_assignment'::character varying])::text[])))
);

CREATE INDEX security_audit_event_actor_user_id_created_at_idx ON audit.security_audit_event USING btree (actor_user_id, created_at);

CREATE INDEX security_audit_event_agency_id_created_at_id_idx ON audit.security_audit_event USING btree (agency_id, created_at, id);

CREATE INDEX security_audit_event_agency_ids_idx ON audit.security_audit_event USING gin (agency_ids) WHERE (scope_type = 'agency'::text);

CREATE INDEX security_audit_event_created_at_id_idx ON audit.security_audit_event USING btree (created_at, id);

CREATE INDEX security_audit_event_request_id_idx ON audit.security_audit_event USING btree (request_id);

ALTER SEQUENCE "audit"."change_event_id_seq" OWNED BY "audit"."change_event"."id";

ALTER SEQUENCE "audit"."security_audit_event_id_seq" OWNED BY "audit"."security_audit_event"."id";
END $baseline$`.execute(db)
}

/** Installs the current installFunctions definitions for this subject on a fresh database. */
export const installFunctions = async (db: Kysely<Database>): Promise<void> => {
  await sql`DO $baseline$ BEGIN
CREATE FUNCTION audit.capture_security_access_scope()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      PERFORM audit.accumulate_statement_scope(audit.resolve_ownership('audit.security_audit_event',to_jsonb(NEW),
        NEW.actor_user_id::text),'insert');
      RETURN NEW;
    END $function$;

CREATE FUNCTION audit.exact_json(value jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
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
    END $function$;

CREATE FUNCTION audit.expire_events(audit_days integer, access_days integer, batch_size integer DEFAULT 1000)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
    DECLARE target text; days integer; cutoff timestamptz; removed integer; total integer := 0;
    BEGIN
      IF audit_days IS NULL OR access_days IS NULL OR audit_days < 1 OR access_days < 1 THEN
        RAISE EXCEPTION 'Invalid audit retention periods';
      END IF;
      IF batch_size IS NULL OR batch_size < 1 OR batch_size > 10000 THEN RAISE EXCEPTION 'Invalid audit expiry batch'; END IF;
      IF NOT pg_try_advisory_xact_lock(214735,913) THEN RETURN 0; END IF;
      PERFORM set_config('app.audit_expiry','on',true);
      FOREACH target IN ARRAY ARRAY['change_event','security_audit_event','access_event'] LOOP
        days := CASE WHEN target = 'access_event' THEN access_days ELSE audit_days END;
        cutoff := now() - make_interval(days => days);
        PERFORM set_config('app.audit_expiry_table',target,true);
        PERFORM set_config('app.audit_expiry_before',cutoff::text,true);
        EXECUTE format('DELETE FROM audit.%I WHERE id IN (SELECT id FROM audit.%I WHERE created_at < $1 ORDER BY created_at LIMIT $2)',target,target)
          USING cutoff,batch_size;
        GET DIAGNOSTICS removed = ROW_COUNT; total := total + removed;
      END LOOP;
      PERFORM set_config('app.audit_expiry','',true);
      PERFORM set_config('app.audit_expiry_table','',true);
      PERFORM set_config('app.audit_expiry_before','',true);
      RETURN total;
    END $function$;

CREATE FUNCTION audit.installed_extension_ownership()
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $function$SELECT '{}'::jsonb$function$;

CREATE FUNCTION audit.protect_event()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE cutoff timestamptz;
    BEGIN
      IF TG_OP = 'DELETE' AND current_setting('app.audit_expiry',true) = 'on'
        AND current_setting('app.audit_expiry_table',true) = TG_TABLE_NAME THEN
        cutoff := nullif(current_setting('app.audit_expiry_before',true),'')::timestamptz;
        IF cutoff IS NOT NULL AND OLD.created_at < cutoff THEN RETURN OLD; END IF;
      END IF;
      RAISE EXCEPTION 'audit events are append-only' USING ERRCODE = '55000';
    END $function$;

CREATE FUNCTION audit.scope_security_event()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
    END $function$;
END $baseline$`.execute(db)
}

/** Installs the current installForeignKeys definitions for this subject on a fresh database. */
export const installForeignKeys = async (db: Kysely<Database>): Promise<void> => {
  await sql`DO $baseline$ BEGIN
ALTER TABLE "audit"."security_audit_event" ADD CONSTRAINT "security_audit_event_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES "user"(id) ON DELETE RESTRICT;
END $baseline$`.execute(db)
}

/** Installs the current installTriggers definitions for this subject on a fresh database. */
export const installTriggers = async (db: Kysely<Database>): Promise<void> => {
  await sql`DO $baseline$ BEGIN
CREATE TRIGGER append_only BEFORE DELETE OR UPDATE ON audit.access_event FOR EACH ROW EXECUTE FUNCTION audit.protect_event();

CREATE TRIGGER no_truncate BEFORE TRUNCATE ON audit.access_event FOR EACH STATEMENT EXECUTE FUNCTION audit.protect_event();

CREATE TRIGGER audit_capture AFTER INSERT OR DELETE OR UPDATE ON audit.capture_policy FOR EACH ROW EXECUTE FUNCTION audit.capture_change();

CREATE TRIGGER audit_insert_attempt BEFORE INSERT ON audit.capture_policy FOR EACH ROW EXECUTE FUNCTION audit.capture_insert_attempt();

CREATE TRIGGER audit_statement_context BEFORE INSERT OR DELETE OR UPDATE ON audit.capture_policy FOR EACH STATEMENT EXECUTE FUNCTION audit.snapshot_actor_context();

CREATE TRIGGER append_only BEFORE DELETE OR UPDATE ON audit.change_event FOR EACH ROW EXECUTE FUNCTION audit.protect_event();

CREATE TRIGGER no_truncate BEFORE TRUNCATE ON audit.change_event FOR EACH STATEMENT EXECUTE FUNCTION audit.protect_event();

CREATE TRIGGER append_only BEFORE DELETE OR UPDATE ON audit.security_audit_event FOR EACH ROW EXECUTE FUNCTION audit.protect_event();

CREATE TRIGGER audit_access_scope AFTER INSERT ON audit.security_audit_event FOR EACH ROW EXECUTE FUNCTION audit.capture_security_access_scope();

CREATE TRIGGER audit_insert_attempt BEFORE INSERT ON audit.security_audit_event FOR EACH ROW EXECUTE FUNCTION audit.capture_insert_attempt();

CREATE TRIGGER audit_statement_context BEFORE INSERT OR DELETE OR UPDATE ON audit.security_audit_event FOR EACH STATEMENT EXECUTE FUNCTION audit.snapshot_actor_context();

CREATE TRIGGER no_truncate BEFORE TRUNCATE ON audit.security_audit_event FOR EACH STATEMENT EXECUTE FUNCTION audit.protect_event();

CREATE TRIGGER security_event_ownership BEFORE INSERT ON audit.security_audit_event FOR EACH ROW EXECUTE FUNCTION audit.scope_security_event();
END $baseline$`.execute(db)
}

/** Installs audit after every business subject and its integrity definitions exist. */
export const up = async (db: Kysely<Database>): Promise<void> => {
  await createTables(db)
  await installFunctions(db)
  await installAuditOwnershipFunctions(db)
  await installAuditOwnershipCapture(db)
  await installAuditCaptureReconciliation(db)
  await installForeignKeys(db)
  await installTriggers(db)
  await sql`INSERT INTO audit.capture_policy(table_schema, table_name, excluded_columns, enabled)
    VALUES ('audit', 'capture_policy', '{}', true), ('audit', 'security_audit_event', '{}', true)`.execute(db)
  await sql`DO $reconcile$ DECLARE previous text := current_setting('app.audit_maintenance', true); BEGIN
    PERFORM set_config('app.audit_maintenance', 'on', true);
    PERFORM audit.reconcile_capture();
    PERFORM set_config('app.audit_maintenance', coalesce(previous, ''), true);
  END $reconcile$`.execute(db)
}
