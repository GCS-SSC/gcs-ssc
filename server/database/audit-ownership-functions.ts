/* eslint-disable jsdoc/require-param -- Installs a database interpreter for the single TypeScript registry. */
import { sql, type Kysely } from 'kysely'
import type { Database } from '../../shared/types/database'
import { AUDIT_ENTITY_TABLES, AUDIT_SECURITY_TARGET_TABLES, AUDIT_TABLE_OWNERSHIP, type AuditOwnershipRule } from './audit-ownership-registry'

/** No second hand-maintained SQL ownership inventory: constants are compiled from the registry. */
export const installAuditOwnershipFunctions = async (db: Kysely<Database>, registry: Readonly<Record<string, AuditOwnershipRule>> = AUDIT_TABLE_OWNERSHIP): Promise<void> => {
  const quote = (value: string) => `'${value.replaceAll('\'', '\'\'')}'`
  for (const [name, value] of Object.entries({ ownership_registry: registry,
    security_target_registry: AUDIT_SECURITY_TARGET_TABLES, entity_ownership_registry: AUDIT_ENTITY_TABLES })) {
    const body = `SELECT ${quote(JSON.stringify(value))}::jsonb`
    await sql.raw(`CREATE OR REPLACE FUNCTION audit.${name}() RETURNS jsonb
      LANGUAGE sql IMMUTABLE AS ${quote(body)}`).execute(db)
  }
  await sql.raw(`DO $installation$ BEGIN
    -- Extension migrations publish their replacement registry only after success.
    -- During a rename/drop, the installed chain may temporarily reference an
    -- absent relation/key. Record that precise gap rather than aborting its DML.
    CREATE OR REPLACE FUNCTION audit.ownership_relation_issue(table_name text, column_name text)
      RETURNS text LANGUAGE sql STABLE AS $relation$
      WITH target AS (
        SELECT to_regclass(format('%I.%I',split_part(table_name,'.',1),split_part(table_name,'.',2))) AS relation
      ) SELECT CASE
        WHEN relation IS NULL THEN 'ownership_table_unavailable'
        WHEN NOT EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=relation
          AND a.attname=column_name AND a.attnum>0 AND NOT a.attisdropped)
          THEN 'ownership_column_unavailable'
        ELSE NULL END FROM target
    $relation$;
    CREATE OR REPLACE FUNCTION audit.resolve_ownership_rule(rule jsonb, row_value jsonb, actor text, path text[] DEFAULT '{}')
      RETURNS jsonb LANGUAGE plpgsql VOLATILE AS $resolver$
    DECLARE kind text := rule->>'kind'; owner_table text; owner_key text; owner_id text;
      owner_row jsonb; owner_rows jsonb; actor_snapshot jsonb; selected jsonb; candidate jsonb; result jsonb; identity_key text;
      agencies text[] := '{}'; global_reason text; schema_issue text; hits integer; item jsonb; type_name text; key_parts text[];
    BEGIN
      IF kind = 'stored-audience' THEN
        IF row_value->>'scope_type' IN ('historical','global') THEN RETURN jsonb_build_object('type','global','reason','Persisted event audience'); END IF;
        IF row_value->>'scope_type' = 'agency' AND jsonb_typeof(row_value->'agency_ids') = 'array'
          AND jsonb_array_length(row_value->'agency_ids') > 0 THEN
          RETURN jsonb_build_object('type','agency','agencyIds',row_value->'agency_ids');
        END IF;
        RETURN jsonb_build_object('type','unresolved','reason','stored_event_audience_unavailable');
      END IF;
      IF kind = 'encoded-entity' THEN
        key_parts := string_to_array(row_value->>(rule->>'column'), ':');
        IF key_parts IS NULL OR cardinality(key_parts) IS DISTINCT FROM (rule->'segments'->>(row_value->>(rule->>'dimensionColumn')))::integer
          OR '' = ANY(key_parts) THEN RETURN jsonb_build_object('type','unresolved','reason','ownership_key_invalid'); END IF;
        RETURN audit.resolve_ownership_rule(jsonb_build_object('kind','entity','idColumn','id','typeColumn','type'),
          jsonb_build_object('id',key_parts[2],'type',key_parts[1]),actor,path);
      END IF;
      IF cardinality(path) >= 32 THEN RETURN jsonb_build_object('type','unresolved','reason','ownership_cycle'); END IF;
      IF kind = 'global' THEN RETURN jsonb_build_object('type','global','reason',rule->>'reason');
      ELSIF kind = 'agency' THEN
        owner_id := nullif(row_value->>(rule->>'column'), '');
        IF owner_id IS NULL THEN RETURN jsonb_build_object('type','unresolved','reason','agency_missing'); END IF;
        RETURN jsonb_build_object('type','agency','agencyIds',jsonb_build_array(owner_id));
      ELSIF kind = 'actor-agencies' THEN
        IF actor IS NULL OR actor = '' THEN
          IF rule->>'whenActorMissing' = 'maintenance-global' AND current_setting('app.audit_maintenance',true) = 'on' THEN
            RETURN jsonb_build_object('type','global','reason','Actorless audit configuration maintenance');
          END IF;
          IF rule->>'whenActorMissing' = 'global' THEN RETURN jsonb_build_object('type','global','reason','Actorless authentication verification'); END IF;
          RETURN jsonb_build_object('type','unresolved','reason','role_audience_actor_missing');
        END IF;
        actor_snapshot := nullif(current_setting('app.audit_actor_agencies', true), '')::jsonb;
        IF actor_snapshot->>'actor' = actor AND jsonb_typeof(actor_snapshot->'agencyIds') = 'array' THEN
          SELECT coalesce(array_agg(value ORDER BY value), '{}') INTO agencies
            FROM jsonb_array_elements_text(actor_snapshot->'agencyIds');
        ELSE
        SELECT coalesce(array_agg(DISTINCT r.agency_id::text ORDER BY r.agency_id::text), '{}') INTO agencies
          FROM public.user_role_assignment a
          JOIN public."user" u ON u.id = a.user_id AND NOT u._deleted
          JOIN public.role r ON r.id = a.role_id AND NOT r._deleted
          JOIN public."Agency_Profile" agency ON agency.id = r.agency_id AND NOT agency._deleted
          WHERE a.user_id::text = actor AND NOT a._deleted
            AND NOT EXISTS (SELECT 1 FROM public.role_transfer_payment_scope p WHERE p.role_id = r.id AND NOT p._deleted);
        END IF;
        IF cardinality(agencies) = 0 THEN RETURN jsonb_build_object('type','global','reason','Actor has no active agency-scoped roles'); END IF;
        RETURN jsonb_build_object('type','agency','agencyIds',to_jsonb(agencies));
      ELSIF kind = 'switch' THEN
        selected := rule->'cases'->(row_value->>(rule->>'column'));
        IF selected IS NULL THEN RETURN jsonb_build_object('type','unresolved','reason','ownership_variant_missing'); END IF;
        RETURN audit.resolve_ownership_rule(selected, row_value, actor, path);
      ELSIF kind = 'first' THEN
        FOR candidate IN SELECT value FROM jsonb_array_elements(rule->'rules') LOOP
          IF candidate->>'kind' = 'parent' AND nullif(row_value->>(candidate->>'column'), '') IS NULL THEN CONTINUE; END IF;
          RETURN audit.resolve_ownership_rule(candidate, row_value, actor, path);
        END LOOP;
        RETURN jsonb_build_object('type','unresolved','reason','parent_key_missing');
      ELSIF kind = 'references' THEN
        owner_id := nullif(row_value->>'id','');
        IF owner_id IS NULL THEN RETURN jsonb_build_object('type','unresolved','reason','shared_record_key_missing'); END IF;
        FOR candidate IN SELECT value FROM jsonb_array_elements(rule->'links') LOOP
          owner_table := candidate->>'table'; owner_key := candidate->>'column';
          identity_key := owner_table || ':' || owner_key || ':' || owner_id;
          IF identity_key = ANY(path) THEN RETURN jsonb_build_object('type','unresolved','reason','ownership_cycle'); END IF;
          hits := 0;
          BEGIN
          FOR owner_row IN EXECUTE format('SELECT to_jsonb(t) FROM %I.%I t WHERE %I = %L LIMIT 1001',
            split_part(owner_table,'.',1),split_part(owner_table,'.',2),owner_key,owner_id) LOOP
            hits := hits + 1;
            IF hits > 1000 THEN RETURN jsonb_build_object('type','unresolved','reason','ownership_fanout_limit'); END IF;
            selected := audit.ownership_registry()->owner_table;
            IF selected IS NULL THEN RETURN jsonb_build_object('type','unresolved','reason','unregistered_table'); END IF;
            result := audit.resolve_ownership_rule(selected,owner_row,actor,array_append(path,identity_key));
            IF result->>'type' = 'unresolved' THEN RETURN result;
            ELSIF result->>'type' = 'global' THEN global_reason := result->>'reason';
            ELSE FOR item IN SELECT value FROM jsonb_array_elements(result->'agencyIds') LOOP
              agencies := array_append(agencies,item #>> '{}');
            END LOOP; END IF;
          END LOOP;
          EXCEPTION WHEN undefined_table OR undefined_column THEN
            -- Confirm this exact relation/key is unavailable; errors raised by
            -- unrelated expressions or functions must still propagate.
            schema_issue := audit.ownership_relation_issue(owner_table,owner_key);
            IF schema_issue IS NOT NULL THEN RETURN jsonb_build_object('type','unresolved','reason',schema_issue); END IF;
            RAISE;
          END;
        END LOOP;
        IF global_reason IS NOT NULL THEN RETURN jsonb_build_object('type','global','reason',global_reason); END IF;
        IF cardinality(agencies) = 0 THEN RETURN jsonb_build_object('type','unresolved','reason','shared_record_owner_not_linked'); END IF;
        SELECT array_agg(DISTINCT a ORDER BY a) INTO agencies FROM unnest(agencies) a;
        RETURN jsonb_build_object('type','agency','agencyIds',to_jsonb(agencies));
      ELSIF kind = 'entity' THEN
        owner_id := nullif(row_value->>(rule->>'idColumn'),''); type_name := row_value->>(rule->>'typeColumn');
        IF owner_id IS NULL OR type_name IS NULL THEN RETURN jsonb_build_object('type','unresolved','reason','entity_key_missing'); END IF;
        owner_table := audit.entity_ownership_registry()->>type_name;
        IF owner_table IS NULL THEN
          SELECT jsonb_agg(to_jsonb(o)) INTO owner_rows FROM (
            SELECT * FROM public."Common_Extension_Entity_Owner"
            WHERE egcs_cn_entityid::text = owner_id AND egcs_cn_entitytype::text = type_name LIMIT 2
          ) o;
          IF coalesce(jsonb_array_length(owner_rows),0) <> 1 THEN RETURN jsonb_build_object('type','unresolved','reason','owner_missing_or_ambiguous'); END IF;
          owner_row := owner_rows->0;
          RETURN audit.resolve_ownership_rule(audit.ownership_registry()->'public.Common_Extension_Entity_Owner',owner_row,actor,
            array_append(path,'extension:' || type_name || ':' || owner_id));
        END IF;
        owner_key := 'id';
      ELSIF kind = 'parent' THEN
        owner_table := rule->>'table'; owner_key := rule->>'targetColumn'; owner_id := nullif(row_value->>(rule->>'column'),'');
        IF owner_id IS NULL THEN RETURN jsonb_build_object('type','unresolved','reason','parent_key_missing'); END IF;
      ELSE RETURN jsonb_build_object('type','unresolved','reason','unregistered_table'); END IF;
      identity_key := owner_table || ':' || owner_key || ':' || owner_id;
      IF identity_key = ANY(path) THEN RETURN jsonb_build_object('type','unresolved','reason','ownership_cycle'); END IF;
      selected := audit.ownership_registry()->owner_table;
      IF selected IS NULL THEN RETURN jsonb_build_object('type','unresolved','reason','unregistered_table'); END IF;
      BEGIN
        EXECUTE format('SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT * FROM %I.%I WHERE %I = %L LIMIT 2) t',
          split_part(owner_table,'.',1),split_part(owner_table,'.',2),owner_key,owner_id) INTO owner_rows;
      EXCEPTION WHEN undefined_table OR undefined_column THEN
        schema_issue := audit.ownership_relation_issue(owner_table,owner_key);
        IF schema_issue IS NOT NULL THEN RETURN jsonb_build_object('type','unresolved','reason',schema_issue); END IF;
        RAISE;
      END;
      IF coalesce(jsonb_array_length(owner_rows),0) <> 1 THEN RETURN jsonb_build_object('type','unresolved','reason','owner_missing_or_ambiguous'); END IF;
      owner_row := owner_rows->0;
      RETURN audit.resolve_ownership_rule(selected,owner_row,actor,array_append(path,identity_key));
    END $resolver$;
    CREATE OR REPLACE FUNCTION audit.resolve_ownership(table_name text, row_value jsonb, actor text DEFAULT NULL)
      RETURNS jsonb LANGUAGE plpgsql VOLATILE AS $resolver$
    DECLARE result jsonb; caller jsonb; inherited_table text;
    BEGIN
      IF NOT audit.ownership_registry() ? table_name THEN
        WITH RECURSIVE ancestors(relation, depth) AS (
          SELECT i.inhparent, 1 FROM pg_inherits i JOIN pg_class leaf ON leaf.oid=i.inhrelid
            WHERE i.inhrelid=to_regclass(format('%I.%I',split_part(table_name,'.',1),split_part(table_name,'.',2)))
              AND leaf.relispartition
          UNION ALL
          SELECT i.inhparent, ancestors.depth+1 FROM pg_inherits i JOIN ancestors ON ancestors.relation=i.inhrelid
            WHERE ancestors.depth < 32
        )
        SELECT n.nspname || '.' || c.relname INTO inherited_table
          FROM ancestors JOIN pg_class c ON c.oid=ancestors.relation JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE audit.ownership_registry() ? (n.nspname || '.' || c.relname)
          ORDER BY ancestors.depth LIMIT 1;
        IF inherited_table IS NOT NULL THEN RETURN audit.resolve_ownership(inherited_table,row_value,actor); END IF;
      END IF;
      IF NOT audit.ownership_registry() ? table_name AND table_name LIKE 'extensions.%' THEN
        RETURN jsonb_build_object('type','global','reason','Extension has not declared agency ownership');
      END IF;
      result := audit.resolve_ownership_rule(audit.ownership_registry()->table_name,row_value,actor);
      IF result->>'type' <> 'unresolved' THEN RETURN result; END IF;
      caller := nullif(current_setting('app.audit_creation_owner',true),'')::jsonb;
      IF caller->>'table' = table_name AND jsonb_typeof(caller->'match') = 'object'
        AND caller->'match' <> '{}'::jsonb
        AND NOT EXISTS (SELECT 1 FROM jsonb_each_text(caller->'match') m WHERE row_value->>m.key IS DISTINCT FROM m.value) THEN
        RETURN audit.resolve_ownership_rule(audit.ownership_registry()->(caller->>'ownerTable'),caller->'ownerRow',actor);
      END IF;
      RETURN result;
    END $resolver$;
    END $installation$;
  `).execute(db)
  // Read evidence must share the business statement's snapshot. Trigger capture
  // retains VOLATILE visibility for rows created/changed inside that statement.
  const definitions = await sql<{ definition: string }>`SELECT pg_get_functiondef(oid) AS definition
    FROM pg_proc WHERE oid IN (
      'audit.resolve_ownership_rule(jsonb,jsonb,text,text[])'::regprocedure,
      'audit.resolve_ownership(text,jsonb,text)'::regprocedure
    ) ORDER BY proname DESC`.execute(db)
  for (const { definition } of definitions.rows) {
    const readDefinition = definition
      .replaceAll('audit.resolve_ownership_rule', 'audit.resolve_read_ownership_rule')
      .replaceAll('audit.resolve_ownership(', 'audit.resolve_read_ownership(')
      .replace('LANGUAGE plpgsql', 'LANGUAGE plpgsql STABLE')
      .replace(/actor_snapshot :=[^;]+;/, 'actor_snapshot := NULL;')
    await sql.raw(readDefinition).execute(db)
  }
  await sql.raw(`CREATE OR REPLACE FUNCTION audit.resolve_read_predicate_ownership(table_name text, row_value jsonb, actor text)
    RETURNS jsonb LANGUAGE plpgsql STABLE AS $predicate$
    DECLARE rule jsonb := audit.ownership_registry()->table_name; owner_column text; column_type oid;
      base_type oid; normalized jsonb; identity_lookup boolean := false;
    BEGIN
      IF rule->>'kind' IN ('global','actor-agencies') THEN
        RETURN audit.resolve_read_ownership(table_name,'{}'::jsonb,actor);
      END IF;
      IF rule->>'kind' IN ('agency','parent') AND row_value->>(rule->>'column') IS NOT NULL THEN
        owner_column := rule->>'column';
      ELSIF rule IS NOT NULL AND row_value->>'id' IS NOT NULL THEN
        owner_column := 'id';
        identity_lookup := true;
      ELSE
        RETURN jsonb_build_object('type','unresolved','reason','predicate_owner_unproven');
      END IF;
      SELECT a.atttypid INTO column_type FROM pg_attribute a
        WHERE a.attrelid=to_regclass(format('%I.%I',split_part(table_name,'.',1),split_part(table_name,'.',2)))
          AND a.attname=owner_column AND a.attnum>0 AND NOT a.attisdropped;
      IF column_type IS NULL THEN RETURN jsonb_build_object('type','unresolved','reason','ownership_column_missing'); END IF;
      -- Comparisons use the scalar base type, without domain constraints or typmod
      -- rounding/truncation. Never reconstruct unrelated (possibly constrained) fields.
      LOOP
        SELECT typbasetype INTO base_type FROM pg_type WHERE oid=column_type;
        EXIT WHEN base_type=0 OR base_type IS NULL;
        column_type := base_type;
      END LOOP;
      IF identity_lookup THEN
        EXECUTE format('SELECT jsonb_agg(to_jsonb(candidate)) FROM
          (SELECT * FROM %I.%I WHERE id=$1::%s LIMIT 2) candidate',
          split_part(table_name,'.',1),split_part(table_name,'.',2),format_type(column_type,NULL))
          INTO normalized USING row_value->>'id';
        IF coalesce(jsonb_array_length(normalized),0) <> 1 THEN
          RETURN jsonb_build_object('type','unresolved','reason','predicate_identity_missing_or_ambiguous');
        END IF;
        normalized := normalized->0;
      ELSE
        EXECUTE format('SELECT jsonb_build_object($1::text,$2::%s)',format_type(column_type,NULL))
          INTO normalized USING owner_column,row_value->>owner_column;
      END IF;
      RETURN audit.resolve_read_ownership(table_name,normalized,actor);
    EXCEPTION WHEN data_exception THEN
      RETURN jsonb_build_object('type','unresolved','reason','predicate_owner_invalid');
    END $predicate$`).execute(db)
}
