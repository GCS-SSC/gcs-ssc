import { sql, type Kysely } from 'kysely'
import type { Database } from '../../../shared/types/database'

const USER_ROLE_ASSIGNMENT_UNIQUE_ACTIVE = 'user_role_assignment_unique_active'
const ROLE_PERMISSION_LEVEL_CHECK = 'role_permission_access_level_check'
const ROLE_PERMISSION_SUBJECT_CHECK = 'role_permission_subject_check'
const ROLE_PERMISSION_EFFECTIVE_CHECK = 'role_permission_effective_check'
const SECURITY_AUDIT_EVENT_TYPE_CHECK = 'security_audit_event_type_check'
const SECURITY_AUDIT_TARGET_TYPE_CHECK = 'security_audit_target_type_check'

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable('role')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('agency_id', 'bigint')
    .addColumn('name_en', 'varchar', col => col.notNull())
    .addColumn('name_fr', 'varchar', col => col.notNull())
    .addColumn('description_en', 'text')
    .addColumn('description_fr', 'text')
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .execute()

  await db.schema
    .createTable('role_permission')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('role_id', 'bigint', col => col.notNull().references('role.id').onDelete('cascade'))
    .addColumn('subject', 'varchar', col => col.notNull())
    .addColumn('access_level', 'varchar')
    .addColumn('can_manage_assignments', 'boolean', col => col.defaultTo(false).notNull())
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .execute()

  await sql`
    ALTER TABLE role_permission
    ADD CONSTRAINT ${sql.raw(ROLE_PERMISSION_LEVEL_CHECK)}
    CHECK (access_level IS NULL OR access_level IN ('viewer', 'contributor', 'manager')),
    ADD CONSTRAINT ${sql.raw(ROLE_PERMISSION_SUBJECT_CHECK)}
    CHECK (subject IN ('audit', 'system', 'agency', 'transfer_payment', 'role', 'user', 'agreement', 'applicant_recipient')),
    ADD CONSTRAINT ${sql.raw(ROLE_PERMISSION_EFFECTIVE_CHECK)}
    CHECK (access_level IS NOT NULL OR can_manage_assignments = true),
    ADD CONSTRAINT role_permission_assignment_subject_check
    CHECK (can_manage_assignments = false OR subject IN ('agreement', 'applicant_recipient'))
  `.execute(db)

  await sql`
    CREATE UNIQUE INDEX role_permission_unique_active
    ON role_permission (role_id, subject)
    WHERE _deleted = false
  `.execute(db)

  await db.schema
    .createTable('user_role_assignment')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('user_id', 'bigint', col => col.notNull().references('user.id').onDelete('cascade'))
    .addColumn('role_id', 'bigint', col => col.notNull().references('role.id').onDelete('cascade'))
    .addColumn('createdAt', 'timestamp', col => col.notNull())
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .execute()

  await sql`
    CREATE UNIQUE INDEX user_role_assignment_unique_active
    ON user_role_assignment (user_id, role_id)
    WHERE _deleted = false
  `.execute(db)

  await db.schema
    .createTable('security_audit_event')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('actor_user_id', 'bigint', col => col.notNull().references('user.id').onDelete('restrict'))
    .addColumn('event_type', 'varchar', col => col.notNull())
    .addColumn('target_type', 'varchar', col => col.notNull())
    .addColumn('target_id', 'varchar', col => col.notNull())
    .addColumn('metadata', 'jsonb', col => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('request_id', 'text', col => col.defaultTo(sql`nullif(current_setting('app.audit_request_id', true), '')`))
    .addColumn('scope_type', 'text', col => col.notNull().defaultTo(sql`coalesce(nullif(current_setting('app.audit_scope', true), ''), 'global')`))
    .addColumn('agency_id', 'text', col => col.defaultTo(sql`nullif(current_setting('app.audit_agency_id', true), '')`))
    .addColumn('agency_ids', sql`text[]`, col => col.notNull().defaultTo(sql`coalesce(nullif(current_setting('app.audit_agency_ids', true), '')::text[], CASE WHEN nullif(current_setting('app.audit_agency_id', true), '') IS NOT NULL THEN ARRAY[current_setting('app.audit_agency_id', true)] ELSE '{}'::text[] END)`))
    .addColumn('transaction_id', 'text', col => col.defaultTo(sql`nullif(current_setting('app.audit_transaction_id', true), '')`))
    .addColumn('attribution_error', 'text')
    .addColumn('inputs', 'jsonb', col => col.defaultTo(sql`nullif(current_setting('app.audit_inputs', true), '')::jsonb`))
    .addCheckConstraint('security_audit_event_scope_type', sql`scope_type IN ('historical', 'global', 'agency', 'unresolved')`)
    .addCheckConstraint('security_audit_event_agency_scope', sql`(scope_type = 'agency') = (agency_id IS NOT NULL)`)
    .addCheckConstraint('security_audit_event_inputs_bound', sql`octet_length(inputs::text) <= 32768`)
    .execute()

  await sql`
    ALTER TABLE security_audit_event
    ADD CONSTRAINT ${sql.raw(SECURITY_AUDIT_EVENT_TYPE_CHECK)}
    CHECK (event_type IN (
      'role.created', 'role.profile_updated', 'role.deleted', 'role.permission_updated',
      'user.created', 'user.profile_updated', 'user.deleted', 'user.activated',
      'user.role_assignment_created',
      'user.role_assignment_deleted'
    )),
    ADD CONSTRAINT ${sql.raw(SECURITY_AUDIT_TARGET_TYPE_CHECK)}
    CHECK (target_type IN ('role', 'user', 'user_role_assignment'))
  `.execute(db)

  await sql`
    CREATE FUNCTION prevent_security_audit_event_mutation()
    RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'security_audit_event is append-only' USING ERRCODE = '55000';
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)
  await sql`
    CREATE TRIGGER security_audit_event_append_only
    BEFORE UPDATE OR DELETE ON security_audit_event
    FOR EACH ROW EXECUTE FUNCTION prevent_security_audit_event_mutation()
  `.execute(db)
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable('security_audit_event').execute()
  await sql`DROP FUNCTION IF EXISTS prevent_security_audit_event_mutation()`.execute(db)
  await sql`DROP INDEX IF EXISTS user_role_assignment_unique_active`.execute(db)
  await db.schema.dropTable('user_role_assignment').execute()
  await db.schema.dropTable('role_permission').execute()
  await db.schema.dropTable('role').execute()
}
