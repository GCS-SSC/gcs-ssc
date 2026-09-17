import { sql, type Kysely } from 'kysely'
import type { Database } from '../../../shared/types/database'

/** Add profile predicates without rewriting published or captured evidence. */
export const up = async (db: Kysely<Database>): Promise<void> => {
  await sql`ALTER TABLE "Common_Workflow_Setup_Member" ADD COLUMN egcs_cn_profileconditions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(egcs_cn_profileconditions) = 'array')`.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION capture_workflow_publication_conditions() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.egcs_cn_kind = 'workflow_setup' THEN
        INSERT INTO "Common_Workflow_Publication_Condition" (egcs_cn_publicationversion, egcs_cn_workflowsetupmember, egcs_cn_field, egcs_cn_option)
        SELECT NEW.id, (member->>'memberId')::bigint, (condition->>'fieldId')::bigint, egcs_cn_option::bigint
        FROM jsonb_array_elements(NEW.egcs_cn_definition->'members') member,
          jsonb_array_elements(COALESCE(member->'conditions', '[]'::jsonb)) condition,
          jsonb_array_elements_text(condition->'optionIds') egcs_cn_option
        WHERE condition ? 'fieldId' AND NOT condition ? 'source';
      END IF;
      RETURN NEW;
    END $$
  `.execute(db)
  await sql`CREATE FUNCTION validate_workflow_profile_references() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE ref record; option_id text; valid boolean;
    BEGIN
      FOR ref IN
        SELECT s.egcs_cn_scopeid AS stream_id, c AS condition
        FROM "Common_Workflow_Setup_Member" m JOIN "Common_Workflow_Setup" s ON s.id = m.egcs_cn_workflowsetup,
          jsonb_array_elements(m.egcs_cn_profileconditions) c
        WHERE NOT m._deleted AND NOT s._deleted
        UNION ALL
        SELECT s.egcs_cn_scopeid, c
        FROM "Common_Publication_Version" v JOIN "Common_Workflow_Setup" s ON s.id = v.egcs_cn_publication,
          jsonb_array_elements(v.egcs_cn_definition->'members') m,
          jsonb_array_elements(COALESCE(m->'conditions', '[]'::jsonb)) c
        WHERE v.egcs_cn_kind = 'workflow_setup' AND c ? 'source'
      LOOP
        FOR option_id IN SELECT jsonb_array_elements_text(ref.condition->'optionIds') LOOP
          IF TG_OP = 'UPDATE' AND (
            (TG_TABLE_NAME = 'Transfer_Payment_Agreement_Subtype' AND ref.condition->>'source' = 'agreement_subtype'
              AND option_id = to_jsonb(OLD)->>'id' AND to_jsonb(NEW)->'egcs_tp_agreementtype' IS DISTINCT FROM to_jsonb(OLD)->'egcs_tp_agreementtype')
            OR (TG_TABLE_NAME = 'Transfer_Payment_Stream_Holdback_Basis' AND ref.condition->>'source' = 'holdback_basis'
              AND option_id = to_jsonb(OLD)->>'id' AND to_jsonb(NEW)->'egcs_tp_agencyholdback' IS DISTINCT FROM to_jsonb(OLD)->'egcs_tp_agencyholdback')
          ) THEN
            RAISE EXCEPTION 'Workflow condition reference is in use' USING ERRCODE = '23514', CONSTRAINT = 'workflow_profile_condition_reference';
          END IF;
          valid := false;
          IF ref.condition->>'source' = 'agreement_subtype' THEN
            SELECT EXISTS (
              SELECT 1 FROM "Transfer_Payment_Agreement_Subtype" b
              JOIN "Agency_Agreement_Type" t ON t.id = b.egcs_tp_agreementtype
              JOIN "Transfer_Payment_Stream" s ON s.id = b.egcs_tp_transferpaymentstream
              JOIN "Transfer_Payment_Profile" p ON p.id = s.egcs_tp_transferpaymentprofile
              WHERE b.id = option_id::bigint AND s.id = ref.stream_id AND NOT b._deleted AND NOT t._deleted
                AND t.egcs_ay_organizationagency = p.egcs_tp_agency
            ) INTO valid;
          ELSIF ref.condition->>'source' = 'holdback_basis' THEN
            SELECT EXISTS (
              SELECT 1 FROM "Transfer_Payment_Stream_Holdback_Basis" b
              JOIN "Agency_Holdback_Basis" t ON t.id = b.egcs_tp_agencyholdback
              JOIN "Transfer_Payment_Stream" s ON s.id = b.egcs_tp_transferpaymentstream
              JOIN "Transfer_Payment_Profile" p ON p.id = s.egcs_tp_transferpaymentprofile
              WHERE b.id = option_id::bigint AND s.id = ref.stream_id AND NOT b._deleted AND NOT t._deleted
                AND t.egcs_ay_organizationagency = p.egcs_tp_agency
            ) INTO valid;
          ELSIF ref.condition->>'source' = 'proponent_type' THEN
            SELECT EXISTS (
              SELECT 1 FROM "Transfer_Payment_Stream_Eligible_Recipient" b
              JOIN "Agency_Applicant_Recipient_Subtype" t ON t.id = b.egcs_tp_applicantrecipientsubtype
              JOIN "Transfer_Payment_Stream" s ON s.id = b.egcs_tp_transferpaymentstream
              JOIN "Transfer_Payment_Profile" p ON p.id = s.egcs_tp_transferpaymentprofile
              WHERE t.id = option_id::bigint AND s.id = ref.stream_id AND NOT b._deleted AND NOT t._deleted
                AND t.egcs_ay_organizationagency = p.egcs_tp_agency
            ) INTO valid;
          END IF;
          IF NOT valid THEN
            RAISE EXCEPTION 'Workflow condition reference is in use' USING ERRCODE = '23514', CONSTRAINT = 'workflow_profile_condition_reference';
          END IF;
        END LOOP;
      END LOOP;
      RETURN NULL;
    END $$`.execute(db)
  const protectedColumns = {
    Transfer_Payment_Agreement_Subtype: ['_deleted', 'egcs_tp_transferpaymentstream', 'egcs_tp_agreementtype'],
    Transfer_Payment_Stream_Holdback_Basis: ['_deleted', 'egcs_tp_transferpaymentstream', 'egcs_tp_agencyholdback'],
    Transfer_Payment_Stream_Eligible_Recipient: ['_deleted', 'egcs_tp_transferpaymentstream', 'egcs_tp_applicantrecipientsubtype'],
    Agency_Agreement_Type: ['_deleted', 'egcs_ay_organizationagency'],
    Agency_Holdback_Basis: ['_deleted', 'egcs_ay_organizationagency'],
    Agency_Applicant_Recipient_Subtype: ['_deleted', 'egcs_ay_organizationagency'],
    Transfer_Payment_Stream: ['egcs_tp_transferpaymentprofile'],
    Transfer_Payment_Profile: ['egcs_tp_agency']
  }
  for (const [table, columns] of Object.entries(protectedColumns)) {
    await sql.raw(`CREATE TRIGGER protect_workflow_profile_conditions AFTER UPDATE OF ${columns.join(', ')} OR DELETE ON "${table}" FOR EACH ROW EXECUTE FUNCTION validate_workflow_profile_references()`).execute(db)
  }

}

/** Refuse to discard authored predicates on rollback. */
export const down = async (db: Kysely<Database>): Promise<void> => {
  await sql`DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM "Common_Workflow_Setup_Member" WHERE egcs_cn_profileconditions <> '[]'::jsonb)
      OR EXISTS (SELECT 1 FROM "Common_Publication_Version" v,
        jsonb_array_elements(v.egcs_cn_definition->'members') m,
        jsonb_array_elements(COALESCE(m->'conditions', '[]'::jsonb)) c
        WHERE v.egcs_cn_kind = 'workflow_setup' AND c ? 'source') THEN
      RAISE EXCEPTION 'Remove profile conditions before rolling back';
    END IF;
  END $$`.execute(db)
  for (const table of ['Transfer_Payment_Agreement_Subtype', 'Transfer_Payment_Stream_Holdback_Basis',
    'Transfer_Payment_Stream_Eligible_Recipient', 'Agency_Agreement_Type', 'Agency_Holdback_Basis',
    'Agency_Applicant_Recipient_Subtype', 'Transfer_Payment_Stream', 'Transfer_Payment_Profile']) {
    await sql.raw(`DROP TRIGGER protect_workflow_profile_conditions ON "${table}"`).execute(db)
  }
  await sql`DROP FUNCTION validate_workflow_profile_references()`.execute(db)
  await sql`ALTER TABLE "Common_Workflow_Setup_Member" DROP COLUMN egcs_cn_profileconditions`.execute(db)
}
