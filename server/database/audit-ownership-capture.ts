import { sql, type Kysely } from 'kysely'
import type { Database } from '../../shared/types/database'

/**
 * Installs row ownership capture, including SQL executed outside host route helpers.
 * @param db Migration transaction.
 */
export const installAuditOwnershipCapture = async (db: Kysely<Database>): Promise<void> => {
  await sql`
CREATE OR REPLACE FUNCTION audit.accumulate_statement_scope(incoming jsonb, evidence_kind text) RETURNS void LANGUAGE plpgsql AS $$
    DECLARE state jsonb; scope_key text; previous jsonb; merged jsonb;
    BEGIN
      IF current_setting('app.audit_capture_access_ownership',true) IS DISTINCT FROM 'on' THEN RETURN; END IF;
      state := coalesce(nullif(current_setting('app.audit_statement_audience',true),'')::jsonb,'{}'::jsonb);
      scope_key := CASE WHEN evidence_kind='attempt' THEN 'attemptedScope' ELSE 'scope' END;
      previous := state->scope_key;
      IF previous IS NULL OR incoming->>'type'='unresolved' THEN merged := incoming;
      ELSIF previous->>'type'='unresolved' THEN merged := previous;
      ELSIF previous->>'type'=incoming->>'type' AND
        (previous->>'type'='global' OR previous->'agencyIds'=incoming->'agencyIds') THEN merged := previous;
      ELSE merged := jsonb_build_object('type','global','reason','Statement spans distinct ownership audiences'); END IF;
      state := jsonb_set(state,ARRAY[scope_key],merged);
      IF evidence_kind='attempt' THEN
        state := jsonb_set(state,'{attempts}',to_jsonb(coalesce((state->>'attempts')::bigint,0)+1));
      ELSIF evidence_kind='insert' THEN
        state := jsonb_set(state,'{inserted}',to_jsonb(coalesce((state->>'inserted')::bigint,0)+1));
      END IF;
      PERFORM set_config('app.audit_statement_audience',state::text,true);
    END $$;
  `.execute(db)
  await sql`
CREATE OR REPLACE FUNCTION audit.capture_insert_attempt() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF current_setting('app.audit_bootstrap',true) IS DISTINCT FROM 'on'
        AND current_setting('app.audit_capture_access_ownership',true)='on' THEN
        PERFORM audit.accumulate_statement_scope(audit.resolve_ownership(TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME,
          to_jsonb(NEW),nullif(current_setting('app.audit_actor_user_id',true),'')),'attempt');
      END IF;
      RETURN NEW;
    END $$;
  `.execute(db)
  await sql`
CREATE OR REPLACE FUNCTION audit.snapshot_actor_context() RETURNS trigger LANGUAGE plpgsql STABLE AS $$
    DECLARE actor text := nullif(current_setting('app.audit_actor_user_id',true),'');
      query_key text := nullif(current_setting('app.audit_query_id',true),''); snapshot jsonb; agencies text[];
      table_identity text := TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME; excluded text[]; primary_key text[];
      candidate jsonb := nullif(current_setting('app.audit_input_candidate',true),'')::jsonb; filtered jsonb;
      relation_policies jsonb; policy_enabled boolean;
      write_predicate jsonb := nullif(current_setting('app.audit_write_predicate',true),'')::jsonb;
      write_scopes jsonb := '[]'::jsonb; predicate_row jsonb; patch jsonb; owner_rule jsonb; patched_row jsonb;
      first_statement boolean := nullif(current_setting('app.audit_statement_metadata',true),'') IS NULL;
    BEGIN
      IF current_setting('app.audit_bootstrap',true)='on' THEN RETURN NULL; END IF;
      -- A statement targeting a partitioned parent can write any physical leaf.
      -- Apply the union of enabled parent/leaf exclusions so the parent metadata
      -- envelope can never expose a value forbidden by a stricter leaf policy.
      WITH RECURSIVE relations(oid) AS (
        SELECT TG_RELID
        UNION ALL
        SELECT i.inhrelid FROM pg_inherits i JOIN relations r ON i.inhparent=r.oid
      ), policies AS (
        SELECT n.nspname || '.' || c.relname AS identity,p.excluded_columns,coalesce(p.enabled,false) AS enabled FROM relations r
        JOIN pg_class c ON c.oid=r.oid JOIN pg_namespace n ON n.oid=c.relnamespace
        LEFT JOIN audit.capture_policy p ON p.table_schema=n.nspname AND p.table_name=c.relname
      ) SELECT coalesce(ARRAY(SELECT DISTINCT value FROM policies p
          CROSS JOIN LATERAL unnest(p.excluded_columns) value WHERE p.enabled ORDER BY value),'{}'),
          bool_and(enabled),jsonb_object_agg(identity,jsonb_build_object('enabled',enabled,
            'excludedColumns',CASE WHEN enabled THEN to_jsonb(excluded_columns) ELSE 'null'::jsonb END))
          INTO excluded,policy_enabled,relation_policies FROM policies;
      SELECT coalesce(array_agg(a.attname::text ORDER BY a.attnum),'{}') INTO primary_key
        FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=ANY(i.indkey)
        WHERE i.indrelid=TG_RELID AND i.indisprimary;
      IF first_statement THEN
        PERFORM set_config('app.audit_statement_metadata',jsonb_build_object('queryId',query_key,'table',table_identity,
          'excludedColumns',CASE WHEN policy_enabled THEN to_jsonb(excluded) ELSE 'null'::jsonb END,
          'relationPolicies',relation_policies,'primaryKey',to_jsonb(primary_key))::text,true);
      END IF;
      IF first_statement AND candidate->>'state'='candidate' AND candidate->>'table'=table_identity THEN
        SELECT jsonb_build_object('state','captured','sql',coalesce(jsonb_agg(CASE
          WHEN NOT coalesce(policy_enabled,false)
            OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(binding->'columns') c WHERE c.value=ANY(excluded))
            THEN to_jsonb('[REDACTED]'::text) ELSE binding->'value' END ORDER BY ordinal),'[]'::jsonb),
          'http',CASE WHEN NOT coalesce(policy_enabled,false) OR coalesce((candidate->>'suppressHttp')::boolean,false)
            THEN '{"state":"unavailable","reason":"sensitive_table"}'::jsonb
            ELSE coalesce(candidate->'http','{"state":"unavailable"}'::jsonb) END,
          'truncated',coalesce(candidate->'truncated','false'::jsonb))
          INTO filtered FROM jsonb_array_elements(candidate->'sql') WITH ORDINALITY entries(binding,ordinal);
        PERFORM set_config('app.audit_inputs',filtered::text,true);
      END IF;
      -- Resolve attempted zero-row writes in this STABLE business snapshot, never
      -- from the driver's earlier ownership lookup. Matched row evidence wins.
      IF first_statement AND write_predicate->>'table'=table_identity
        AND current_setting('app.audit_capture_access_ownership',true)='on' THEN
        owner_rule := audit.ownership_registry()->table_identity;
        IF write_predicate ? 'reason' THEN
          write_scopes := jsonb_build_array(jsonb_build_object('type','unresolved','reason',write_predicate->>'reason'));
        ELSE
          FOR predicate_row IN SELECT value FROM jsonb_array_elements(write_predicate->'rows') LOOP
            write_scopes := write_scopes || jsonb_build_array(audit.resolve_read_predicate_ownership(table_identity,predicate_row,actor));
            FOR patch IN SELECT value FROM jsonb_array_elements(write_predicate->'patches') LOOP
              IF owner_rule->>'kind' IN ('agency','parent') AND patch->>'column'=owner_rule->>'column' THEN
                IF patch->>'literal'='true' AND patch->>'value' IS NOT NULL THEN
                  patched_row := predicate_row || jsonb_build_object(patch->>'column',patch->'value');
                  write_scopes := write_scopes || jsonb_build_array(audit.resolve_read_predicate_ownership(table_identity,patched_row,actor));
                ELSE
                  write_scopes := write_scopes || '[{"type":"unresolved","reason":"ownership_update_expression"}]'::jsonb;
                END IF;
              ELSIF owner_rule->>'kind' NOT IN ('agency','parent','global','actor-agencies') THEN
                -- Complex polymorphic/switch projections need a complete row.
                write_scopes := write_scopes || '[{"type":"unresolved","reason":"ownership_update_requires_rows"}]'::jsonb;
                EXIT;
              END IF;
            END LOOP;
          END LOOP;
        END IF;
        PERFORM set_config('app.audit_write_predicate_scopes',write_scopes::text,true);
      END IF;
      IF actor IS NULL THEN RETURN NULL; END IF;
      snapshot := nullif(current_setting('app.audit_actor_agencies',true),'')::jsonb;
      IF query_key IS NOT NULL AND snapshot->>'queryId'=query_key AND snapshot->>'actor'=actor THEN RETURN NULL; END IF;
      -- Minimal bootstrap databases can install capture before the authentication schema.
      IF to_regclass('public.user_role_assignment') IS NULL THEN RETURN NULL; END IF;
      SELECT coalesce(array_agg(DISTINCT r.agency_id::text ORDER BY r.agency_id::text),'{}') INTO agencies
        FROM public.user_role_assignment a
        JOIN public."user" u ON u.id=a.user_id AND NOT u._deleted
        JOIN public.role r ON r.id=a.role_id AND NOT r._deleted
        JOIN public."Agency_Profile" agency ON agency.id=r.agency_id AND NOT agency._deleted
        WHERE a.user_id::text=actor AND NOT a._deleted
          AND NOT EXISTS (SELECT 1 FROM public.role_transfer_payment_scope p WHERE p.role_id=r.id AND NOT p._deleted);
      PERFORM set_config('app.audit_actor_agencies',jsonb_build_object(
        'actor',actor,'agencyIds',to_jsonb(agencies),'queryId',query_key)::text,true);
      RETURN NULL;
    END $$;
  `.execute(db)
  await sql`
CREATE OR REPLACE FUNCTION audit.capture_change() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE before_row jsonb; after_row jsonb; evidence jsonb; keys jsonb; excluded text[]; statement_metadata jsonb;
      operation text := lower(TG_OP); key_column text;
      resolved jsonb; previous_scope jsonb; scope_name text; audience text[]; previous_audience text[];
      actor text := nullif(current_setting('app.audit_actor_user_id', true), '');
      table_identity text := TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME;
      error_reason text; inserted_event audit.change_event%ROWTYPE; capture_enabled boolean;
      capture_access boolean := coalesce(current_setting('app.audit_capture_access_ownership',true),'')='on';
    BEGIN
      IF current_setting('app.audit_bootstrap', true) = 'on' THEN RETURN coalesce(NEW, OLD); END IF;
      IF NOT capture_access AND TG_OP = 'UPDATE' AND to_jsonb(OLD) = to_jsonb(NEW) THEN RETURN NEW; END IF;
      statement_metadata := nullif(current_setting('app.audit_statement_metadata',true),'')::jsonb;
      IF statement_metadata->>'queryId'=nullif(current_setting('app.audit_query_id',true),'')
        AND statement_metadata->'relationPolicies' ? table_identity THEN
        capture_enabled := coalesce((statement_metadata->'relationPolicies'->table_identity->>'enabled')::boolean,false);
        IF capture_enabled THEN
          excluded := ARRAY(SELECT jsonb_array_elements_text(
            statement_metadata->'relationPolicies'->table_identity->'excludedColumns'));
        END IF;
      ELSE
        SELECT excluded_columns INTO excluded FROM audit.capture_policy
          WHERE table_schema = TG_TABLE_SCHEMA AND table_name = TG_TABLE_NAME AND enabled;
        capture_enabled := FOUND;
      END IF;
      IF NOT capture_enabled AND NOT capture_access THEN RETURN coalesce(NEW, OLD); END IF;
      resolved := audit.resolve_ownership(table_identity,coalesce(to_jsonb(NEW),to_jsonb(OLD)),actor);
      scope_name := resolved->>'type';
      SELECT coalesce(array_agg(value ORDER BY value), '{}') INTO audience
        FROM jsonb_array_elements_text(coalesce(resolved->'agencyIds','[]'));
      error_reason := CASE WHEN scope_name = 'unresolved' THEN resolved->>'reason' END;
      IF TG_OP = 'UPDATE' THEN
        previous_scope := audit.resolve_ownership(table_identity,to_jsonb(OLD),actor);
        SELECT coalesce(array_agg(value ORDER BY value), '{}') INTO previous_audience
          FROM jsonb_array_elements_text(coalesce(previous_scope->'agencyIds','[]'));
        IF previous_scope->>'type' <> 'unresolved' AND scope_name <> 'unresolved'
          AND previous_audience IS DISTINCT FROM audience THEN scope_name := 'global'; END IF;
      END IF;
      IF capture_access THEN
        IF previous_scope IS NOT NULL THEN PERFORM audit.accumulate_statement_scope(previous_scope,'actual'); END IF;
        PERFORM audit.accumulate_statement_scope(resolved,CASE WHEN TG_OP='INSERT' THEN 'insert' ELSE 'actual' END);
      END IF;
      IF NOT capture_enabled OR (TG_OP='UPDATE' AND to_jsonb(OLD)=to_jsonb(NEW)) THEN RETURN coalesce(NEW,OLD); END IF;
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
        table_name, record_id, record_keys, operation, delta, scope_type, agency_id, agency_ids, attribution_error)
      VALUES (nullif(current_setting('app.audit_actor_user_id', true), ''),
        coalesce(nullif(current_setting('app.audit_actor_kind', true), ''), 'database'),
        nullif(current_setting('app.audit_request_id', true), ''), nullif(current_setting('app.audit_query_id', true), ''),
        table_identity, keys->>'id', keys, operation, evidence, scope_name,
        CASE WHEN scope_name = 'agency' THEN audience[1] END,
        CASE WHEN scope_name = 'agency' THEN audience ELSE '{}' END,error_reason)
      RETURNING * INTO inserted_event;
      IF TG_OP = 'UPDATE' AND previous_scope->>'type' <> 'unresolved' AND resolved->>'type' <> 'unresolved'
        AND previous_audience IS DISTINCT FROM audience THEN
        IF cardinality(previous_audience) > 0 THEN
          INSERT INTO audit.change_event(actor_user_id,actor_kind,request_id,query_id,table_name,record_id,record_keys,
            operation,delta,scope_type,agency_id,agency_ids,transaction_id,inputs)
          VALUES(actor,inserted_event.actor_kind,inserted_event.request_id,inserted_event.query_id,table_identity,
            inserted_event.record_id,keys,'departure',before_row,'agency',previous_audience[1],previous_audience,
            inserted_event.transaction_id,'{"state":"unavailable","reason":"transfer_projection"}');
        END IF;
        IF cardinality(audience) > 0 THEN
          INSERT INTO audit.change_event(actor_user_id,actor_kind,request_id,query_id,table_name,record_id,record_keys,
            operation,delta,scope_type,agency_id,agency_ids,transaction_id,inputs)
          VALUES(actor,inserted_event.actor_kind,inserted_event.request_id,inserted_event.query_id,table_identity,
            inserted_event.record_id,keys,'arrival',after_row,'agency',audience[1],audience,
            inserted_event.transaction_id,'{"state":"unavailable","reason":"transfer_projection"}');
        END IF;
      END IF;
      RETURN coalesce(NEW, OLD);
    END $$;
  `.execute(db)
}

/**
 * Install capture for all application tables, including cleanup work and migration journals.
 * @param db Migration transaction.
 */
export const installAuditCaptureReconciliation = async (db: Kysely<Database>): Promise<void> => {
  await sql`
    CREATE OR REPLACE FUNCTION audit.reconcile_capture() RETURNS void LANGUAGE plpgsql AS $$
    DECLARE target record; expected record; excluded text[];
    BEGIN
      FOR target IN SELECT c.oid, n.nspname, c.relname, c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('audit', 'information_schema')
        AND n.nspname NOT LIKE 'pg_%'
      LOOP
        SELECT coalesce(array_agg(column_name::text), '{}') INTO excluded FROM information_schema.columns
          WHERE table_schema = target.nspname AND table_name = target.relname
          AND (column_name ~* 'password|token|secret|credential|encrypted|cipher|(^|_)salt($|_)'
            OR (target.relname IN ('account', 'session', 'verification') AND column_name NOT IN ('id', 'userId', 'createdAt', 'updatedAt', 'expiresAt'))
            OR (target.relname ~* 'secret' AND column_name NOT IN ('id', 'extension_key', 'agency_id', 'created_at', 'updated_at')));
        INSERT INTO audit.capture_policy
          SELECT target.nspname, target.relname, excluded, true
          WHERE NOT EXISTS (SELECT 1 FROM audit.capture_policy existing
            WHERE existing.table_schema=target.nspname AND existing.table_name=target.relname
              AND existing.excluded_columns @> excluded)
          ON CONFLICT (table_schema, table_name) DO UPDATE
          SET excluded_columns = ARRAY(SELECT DISTINCT unnest(audit.capture_policy.excluded_columns || EXCLUDED.excluded_columns));
        -- Replacing a correct trigger takes a table DDL lock. Online extension
        -- publication already holds agency row locks; doing that on unrelated
        -- tables can deadlock another publisher waiting for its advisory lock.
        FOR expected IN SELECT * FROM (VALUES
          ('audit_statement_context',30,'audit.snapshot_actor_context()',
            'BEFORE INSERT OR UPDATE OR DELETE','STATEMENT'),
          ('audit_insert_attempt',7,'audit.capture_insert_attempt()','BEFORE INSERT','ROW'),
          ('audit_capture',29,'audit.capture_change()','AFTER INSERT OR UPDATE OR DELETE','ROW')
        ) AS definitions(name,kind,function_name,events,level)
        LOOP
          IF target.relkind='p' AND expected.level='ROW' THEN CONTINUE; END IF;
          IF EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid=target.oid AND t.tgname=expected.name
            AND t.tgfoid=to_regprocedure(expected.function_name) AND t.tgtype=expected.kind
            AND t.tgenabled='O' AND NOT t.tgisinternal AND t.tgnargs=0 AND t.tgqual IS NULL
            AND t.tgattr=''::int2vector AND NOT t.tgdeferrable AND NOT t.tginitdeferred) THEN CONTINUE; END IF;
          EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I.%I', expected.name,target.nspname,target.relname);
          EXECUTE format('CREATE TRIGGER %I %s ON %I.%I FOR EACH %s EXECUTE FUNCTION %s',
            expected.name,expected.events,target.nspname,target.relname,expected.level,expected.function_name);
        END LOOP;
      END LOOP;
    END $$;
  `.execute(db)
}
