import { sql, type Kysely } from 'kysely'
import type { Database } from '../../../shared/types/database'

/** Protects Amendment subtype references in draft and retained Workflow publications. */
export const up = async (db: Kysely<Database>): Promise<void> => {
  await sql`CREATE FUNCTION workflow_amendment_subtype_in_use(subtype_id bigint)
    RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT EXISTS (
        SELECT 1 FROM "Common_Workflow_Setup_Member" member
        JOIN "Common_Workflow_Setup" setup ON setup.id = member.egcs_cn_workflowsetup
        CROSS JOIN LATERAL jsonb_array_elements(member.egcs_cn_profileconditions) condition(value)
        WHERE member._deleted = false AND setup._deleted = false
          AND condition.value->>'source' = 'amendment_subtype'
          AND COALESCE(condition.value->'optionIds', '[]'::jsonb) ? subtype_id::text
      ) OR EXISTS (
        SELECT 1 FROM "Common_Publication_Version" version
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(version.egcs_cn_definition->'members', '[]'::jsonb)) member(value)
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(member.value->'conditions', '[]'::jsonb)) condition(value)
        WHERE version.egcs_cn_kind = 'workflow_setup'
          AND condition.value->>'source' = 'amendment_subtype'
          AND COALESCE(condition.value->'optionIds', '[]'::jsonb) ? subtype_id::text
      )
    $$`.execute(db)
  await sql`CREATE FUNCTION protect_workflow_amendment_conditions() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE referenced boolean := false;
    BEGIN
      IF TG_TABLE_NAME = 'Transfer_Payment_Amendment_Subtype' THEN
        IF TG_OP = 'UPDATE' AND NOT (
          (NOT OLD._deleted AND NEW._deleted)
          OR NEW.egcs_tp_transferpaymentstream IS DISTINCT FROM OLD.egcs_tp_transferpaymentstream
        ) THEN RETURN NULL; END IF;
        referenced := workflow_amendment_subtype_in_use(OLD.id);
      ELSIF TG_TABLE_NAME = 'Transfer_Payment_Stream' THEN
        IF TG_OP = 'UPDATE' AND NOT (
          (NOT OLD._deleted AND NEW._deleted)
          OR NEW.egcs_tp_transferpaymentprofile IS DISTINCT FROM OLD.egcs_tp_transferpaymentprofile
        ) THEN RETURN NULL; END IF;
        SELECT EXISTS (
          SELECT 1 FROM "Transfer_Payment_Amendment_Subtype" subtype
          WHERE subtype.egcs_tp_transferpaymentstream = OLD.id AND workflow_amendment_subtype_in_use(subtype.id)
        ) INTO referenced;
      ELSE
        IF TG_OP = 'UPDATE' AND NOT (
          (NOT OLD._deleted AND NEW._deleted)
          OR NEW.egcs_tp_agency IS DISTINCT FROM OLD.egcs_tp_agency
        ) THEN RETURN NULL; END IF;
        SELECT EXISTS (
          SELECT 1 FROM "Transfer_Payment_Amendment_Subtype" subtype
          JOIN "Transfer_Payment_Stream" stream ON stream.id = subtype.egcs_tp_transferpaymentstream
          WHERE stream.egcs_tp_transferpaymentprofile = OLD.id AND workflow_amendment_subtype_in_use(subtype.id)
        ) INTO referenced;
      END IF;
      IF referenced THEN
        RAISE EXCEPTION 'Workflow condition reference is in use'
          USING ERRCODE = '23514', CONSTRAINT = 'workflow_profile_condition_reference';
      END IF;
      RETURN NULL;
    END $$`.execute(db)
  await sql`CREATE TRIGGER protect_workflow_amendment_conditions
    AFTER UPDATE OF _deleted, egcs_tp_transferpaymentstream OR DELETE ON "Transfer_Payment_Amendment_Subtype"
    FOR EACH ROW EXECUTE FUNCTION protect_workflow_amendment_conditions()`.execute(db)
  await sql`CREATE TRIGGER protect_workflow_amendment_conditions
    AFTER UPDATE OF _deleted, egcs_tp_transferpaymentprofile OR DELETE ON "Transfer_Payment_Stream"
    FOR EACH ROW EXECUTE FUNCTION protect_workflow_amendment_conditions()`.execute(db)
  await sql`CREATE TRIGGER protect_workflow_amendment_conditions
    AFTER UPDATE OF _deleted, egcs_tp_agency OR DELETE ON "Transfer_Payment_Profile"
    FOR EACH ROW EXECUTE FUNCTION protect_workflow_amendment_conditions()`.execute(db)
}

/** Retains protection if authored conditions would become unsupported after rollback. */
export const down = async (db: Kysely<Database>): Promise<void> => {
  const referenced = await sql`SELECT 1 FROM "Transfer_Payment_Amendment_Subtype"
    WHERE workflow_amendment_subtype_in_use(id) LIMIT 1`.execute(db)
  if (referenced.rows.length) throw new Error('Cannot remove authored Amendment subtype Workflow conditions')
  for (const table of ['Transfer_Payment_Profile', 'Transfer_Payment_Stream', 'Transfer_Payment_Amendment_Subtype']) {
    await sql`DROP TRIGGER protect_workflow_amendment_conditions ON ${sql.table(table)}`.execute(db)
  }
  await sql`DROP FUNCTION protect_workflow_amendment_conditions()`.execute(db)
  await sql`DROP FUNCTION workflow_amendment_subtype_in_use(bigint)`.execute(db)
}
