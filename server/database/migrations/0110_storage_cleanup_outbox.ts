import { sql, type Kysely } from 'kysely'
import type { Database } from '../../../shared/types/database'

export const up = async (db: Kysely<Database>): Promise<void> => {
  await db.schema.createTable('storage_cleanup_outbox')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('provider_key', 'varchar(120)', col => col.notNull())
    .addColumn('agency_id', 'bigint', col => col.notNull())
    .addColumn('purpose', 'varchar(80)', col => col.notNull())
    .addColumn('object_id', 'varchar(512)', col => col.notNull())
    .addColumn('locator', 'jsonb', col => col.notNull())
    .addColumn('operation', 'varchar(40)', col => col.defaultTo('delete_object').notNull())
    .addColumn('payload', 'jsonb')
    .addColumn('status', 'varchar(20)', col => col.defaultTo('pending').notNull())
    .addColumn('attempt_count', 'integer', col => col.defaultTo(0).notNull())
    .addColumn('next_attempt_at', 'timestamptz', col => col.defaultTo(sql`now()`).notNull())
    .addColumn('lease_owner', 'varchar(160)')
    .addColumn('lease_expires_at', 'timestamptz')
    .addColumn('last_error', 'varchar(1000)')
    .addColumn('created_at', 'timestamptz', col => col.defaultTo(sql`now()`).notNull())
    .addColumn('updated_at', 'timestamptz', col => col.defaultTo(sql`now()`).notNull())
    .addColumn('completed_at', 'timestamptz')
    .addCheckConstraint('storage_cleanup_outbox_status_check', sql`status in ('pending', 'processing', 'completed', 'dead_letter')`)
    .addCheckConstraint('storage_cleanup_outbox_attempt_check', sql`attempt_count >= 0`)
    .addCheckConstraint('storage_cleanup_outbox_operation_check', sql`operation in ('delete_object', 'restore_metadata')`)
    .execute()
  await db.schema.createIndex('storage_cleanup_outbox_claim_idx').on('storage_cleanup_outbox')
    .columns(['status', 'next_attempt_at', 'lease_expires_at', 'id']).execute()
  await db.schema.createIndex('storage_cleanup_outbox_object_idx').on('storage_cleanup_outbox')
    .columns(['provider_key', 'object_id']).execute()
}

export const down = async (db: Kysely<Database>): Promise<void> => {
  await db.schema.dropTable('storage_cleanup_outbox').ifExists().execute()
}
