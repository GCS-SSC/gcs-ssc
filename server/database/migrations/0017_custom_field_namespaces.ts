import { sql, type Kysely } from 'kysely'
import type { Database } from '../../../shared/types/database'

// Persisted migration contract: do not derive these names from mutable application types.
const renames = {
  'Transfer_Payment_Stream_Field_Section': {
    'name_en': 'egcs_tp_name_en',
    'name_fr': 'egcs_tp_name_fr',
    'display_order': 'egcs_tp_displayorder'
  },
  'Transfer_Payment_Stream_Field': {
    'name_en': 'egcs_tp_name_en',
    'name_fr': 'egcs_tp_name_fr',
    'section_id': 'egcs_tp_section',
    'kind': 'egcs_tp_kind',
    'multiple': 'egcs_tp_multiple',
    'presentation': 'egcs_tp_presentation',
    'required': 'egcs_tp_required',
    'discriminator': 'egcs_tp_discriminator',
    'active': 'egcs_tp_active',
    'display_order': 'egcs_tp_displayorder'
  },
  'Transfer_Payment_Stream_Field_Option': {
    'field_id': 'egcs_tp_field',
    'name_en': 'egcs_tp_name_en',
    'name_fr': 'egcs_tp_name_fr',
    'category_en': 'egcs_tp_category_en',
    'category_fr': 'egcs_tp_category_fr',
    'active': 'egcs_tp_active',
    'display_order': 'egcs_tp_displayorder'
  },
  'Common_Workflow_Member_Condition': {
    'member_id': 'egcs_cn_workflowsetupmember',
    'field_id': 'egcs_cn_field',
    'option_id': 'egcs_cn_option'
  },
  'Common_Workflow_Publication_Condition': {
    'member_id': 'egcs_cn_workflowsetupmember',
    'field_id': 'egcs_cn_field',
    'option_id': 'egcs_cn_option',
    'version_id': 'egcs_cn_publicationversion'
  }
} as const

/** Rename persisted columns without rewriting rows or immutable evidence. */
export const up = async (db: Kysely<Database>): Promise<void> => {
  for (const [table, columns] of Object.entries(renames)) {
    for (const [before, after] of Object.entries(columns)) {
      await db.schema.alterTable(table).renameColumn(before, after).execute()
    }
  }
  await sql`
    CREATE OR REPLACE FUNCTION protect_stream_field_identity() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.egcs_tp_kind IS DISTINCT FROM OLD.egcs_tp_kind OR NEW.egcs_tp_transferpaymentstream IS DISTINCT FROM OLD.egcs_tp_transferpaymentstream THEN
        RAISE EXCEPTION 'Stream field identity is immutable' USING ERRCODE = '23514';
      END IF;
      IF OLD.egcs_tp_multiple AND NOT NEW.egcs_tp_multiple THEN
        RAISE EXCEPTION 'Multiple selection cannot be changed to single selection' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END $$
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION validate_workflow_condition_scope() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM "Common_Workflow_Setup_Member" member
        JOIN "Common_Workflow_Setup" setup ON setup.id = member.egcs_cn_workflowsetup
        JOIN "Transfer_Payment_Stream_Field" field ON field.id = NEW.egcs_cn_field
        WHERE member.id = NEW.egcs_cn_workflowsetupmember AND setup.egcs_cn_scopetype = 'transferpaymentstream'
          AND setup.egcs_cn_scopeid = field.egcs_tp_transferpaymentstream AND field.egcs_tp_kind = 'relational'
      ) THEN
        RAISE EXCEPTION 'Workflow condition must reference a relational field in its stream' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END $$
  `.execute(db)
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
  const { rows } = await sql<{ registry: Record<string, { column?: string }> }>`SELECT audit.ownership_registry() AS registry`.execute(db)
  const registry = rows[0]!.registry
  registry['public.Transfer_Payment_Stream_Field_Option']!.column = 'egcs_tp_field'
  registry['public.Common_Workflow_Member_Condition']!.column = 'egcs_cn_workflowsetupmember'
  registry['public.Common_Workflow_Publication_Condition']!.column = 'egcs_cn_publicationversion'
  const literal = JSON.stringify(registry).replaceAll("'", "''")
  await sql.raw(`CREATE OR REPLACE FUNCTION audit.ownership_registry() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $registry$ SELECT '${literal}'::jsonb $registry$`).execute(db)
}

/** Restore the former column contract without dropping retained data. */
export const down = async (db: Kysely<Database>): Promise<void> => {
  for (const [table, columns] of Object.entries(renames)) {
    for (const [before, after] of Object.entries(columns)) {
      await db.schema.alterTable(table).renameColumn(after, before).execute()
    }
  }
  await sql`
    CREATE OR REPLACE FUNCTION protect_stream_field_identity() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.kind IS DISTINCT FROM OLD.kind OR NEW.egcs_tp_transferpaymentstream IS DISTINCT FROM OLD.egcs_tp_transferpaymentstream THEN
        RAISE EXCEPTION 'Stream field identity is immutable' USING ERRCODE = '23514';
      END IF;
      IF OLD.multiple AND NOT NEW.multiple THEN
        RAISE EXCEPTION 'Multiple selection cannot be changed to single selection' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END $$
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION validate_workflow_condition_scope() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM "Common_Workflow_Setup_Member" member
        JOIN "Common_Workflow_Setup" setup ON setup.id = member.egcs_cn_workflowsetup
        JOIN "Transfer_Payment_Stream_Field" field ON field.id = NEW.field_id
        WHERE member.id = NEW.member_id AND setup.egcs_cn_scopetype = 'transferpaymentstream'
          AND setup.egcs_cn_scopeid = field.egcs_tp_transferpaymentstream AND field.kind = 'relational'
      ) THEN
        RAISE EXCEPTION 'Workflow condition must reference a relational field in its stream' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END $$
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION capture_workflow_publication_conditions() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.egcs_cn_kind = 'workflow_setup' THEN
        INSERT INTO "Common_Workflow_Publication_Condition" (version_id, member_id, field_id, option_id)
        SELECT NEW.id, (member->>'memberId')::bigint, (condition->>'fieldId')::bigint, option_id::bigint
        FROM jsonb_array_elements(NEW.egcs_cn_definition->'members') member,
          jsonb_array_elements(COALESCE(member->'conditions', '[]'::jsonb)) condition,
          jsonb_array_elements_text(condition->'optionIds') option_id
        WHERE condition ? 'fieldId' AND NOT condition ? 'source';
      END IF;
      RETURN NEW;
    END $$
  `.execute(db)
  const { rows } = await sql<{ registry: Record<string, { column?: string }> }>`SELECT audit.ownership_registry() AS registry`.execute(db)
  const registry = rows[0]!.registry
  registry['public.Transfer_Payment_Stream_Field_Option']!.column = 'field_id'
  registry['public.Common_Workflow_Member_Condition']!.column = 'member_id'
  registry['public.Common_Workflow_Publication_Condition']!.column = 'version_id'
  const literal = JSON.stringify(registry).replaceAll("'", "''")
  await sql.raw(`CREATE OR REPLACE FUNCTION audit.ownership_registry() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $registry$ SELECT '${literal}'::jsonb $registry$`).execute(db)
}
