import { sql, type Kysely } from 'kysely'
import type { Database } from '../../shared/types/database'

/**
 * Removes the persisted environment-variable copy while preserving bounded append-only expiry.
 * @param db Migration transaction.
 */
export const installEnvironmentAuditRetention = async (db: Kysely<Database>): Promise<void> => {
  await sql`DO $migration$ BEGIN
    CREATE OR REPLACE FUNCTION audit.protect_event() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE cutoff timestamptz;
    BEGIN
      IF TG_OP = 'DELETE' AND current_setting('app.audit_expiry',true) = 'on'
        AND current_setting('app.audit_expiry_table',true) = TG_TABLE_NAME THEN
        cutoff := nullif(current_setting('app.audit_expiry_before',true),'')::timestamptz;
        IF cutoff IS NOT NULL AND OLD.created_at < cutoff THEN RETURN OLD; END IF;
      END IF;
      RAISE EXCEPTION 'audit events are append-only' USING ERRCODE = '55000';
    END $$;
    DROP FUNCTION audit.expire_events(integer);
    CREATE FUNCTION audit.expire_events(audit_days integer, access_days integer, batch_size integer DEFAULT 1000)
      RETURNS integer LANGUAGE plpgsql AS $$
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
    END $$;
    DROP TABLE audit.retention_policy;
  END $migration$`.execute(db)
}
