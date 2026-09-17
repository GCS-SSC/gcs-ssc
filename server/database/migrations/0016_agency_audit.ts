import { sql, type Kysely } from 'kysely'
import { AUDIT_TABLE_OWNERSHIP } from '../audit-ownership-registry'
import { installAuditOwnershipFunctions } from '../audit-ownership-functions'
import { installAuditOwnershipCapture, installAuditCaptureReconciliation } from '../audit-ownership-capture'
import { installEnvironmentAuditRetention } from '../audit-retention'
import type { Database } from '../../../shared/types/database'

/** Incremental evidence upgrade. Historical rows deliberately remain global-only. */
export const up = async (db: Kysely<Database>): Promise<void> => {
  for (const table of ['change_event', 'security_audit_event', 'access_event']) {
    await sql.raw(`DO $migration$ BEGIN ALTER TABLE audit.${table}
      ADD COLUMN scope_type text NOT NULL DEFAULT 'historical' CHECK (scope_type IN ('historical', 'global', 'agency', 'unresolved')),
      ADD COLUMN agency_id text,
      ADD COLUMN agency_ids text[] NOT NULL DEFAULT '{}',
      ADD COLUMN transaction_id text,
      ADD COLUMN attribution_error text,
      ADD COLUMN inputs jsonb,
      ADD CONSTRAINT ${table}_agency_scope CHECK ((scope_type = 'agency') = (agency_id IS NOT NULL)),
      ADD CONSTRAINT ${table}_inputs_bound CHECK (octet_length(inputs::text) <= 32768);
      CREATE INDEX ON audit.${table}(agency_id, created_at, id);
      CREATE INDEX ${table}_agency_ids_idx ON audit.${table} USING gin(agency_ids)
        WHERE scope_type = 'agency'; END $migration$;`).execute(db)
    // Defaults are changed only after existing evidence has received historical classification.
    await sql.raw(`ALTER TABLE audit.${table}
      ALTER COLUMN scope_type SET DEFAULT coalesce(nullif(current_setting('app.audit_scope', true), ''), 'global'),
      ALTER COLUMN agency_id SET DEFAULT nullif(current_setting('app.audit_agency_id', true), ''),
      ALTER COLUMN agency_ids SET DEFAULT coalesce(nullif(current_setting('app.audit_agency_ids', true), '')::text[],
        CASE WHEN nullif(current_setting('app.audit_agency_id', true), '') IS NOT NULL
          THEN ARRAY[current_setting('app.audit_agency_id', true)] ELSE '{}'::text[] END),
      ALTER COLUMN transaction_id SET DEFAULT nullif(current_setting('app.audit_transaction_id', true), ''),
      ALTER COLUMN inputs SET DEFAULT nullif(current_setting('app.audit_inputs', true), '')::jsonb;`).execute(db)
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
  await installAuditOwnershipFunctions(db, {
    ...AUDIT_TABLE_OWNERSHIP,
    // These columns are renamed only by 0017; stopped/older schemas retain their original ownership paths.
    'public.Transfer_Payment_Stream_Field_Option': { kind: 'parent', column: 'field_id', table: 'public.Transfer_Payment_Stream_Field', targetColumn: 'id' },
    'public.Common_Workflow_Member_Condition': { kind: 'parent', column: 'member_id', table: 'public.Common_Workflow_Setup_Member', targetColumn: 'id' },
    'public.Common_Workflow_Publication_Condition': { kind: 'parent', column: 'version_id', table: 'public.Common_Publication_Version', targetColumn: 'id' }
  })
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

/** Never erase retained evidence as part of an application rollback. */
export const down = async (): Promise<never> => {
  throw new Error('0016_agency_audit preserves evidence; roll back application code without dropping audit columns')
}
