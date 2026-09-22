import type { Kysely, SqlBool } from 'kysely'
import { sql } from 'kysely'
import type { Database } from '../../../shared/types/database'

const INDEX_NAMES = {
  agencyEnablementUnique: 'ext_idx_agency_enablement_extension_agency',
  streamConfigurationUnique: 'ext_idx_stream_configuration_extension_stream',
  kvEntryUnique: 'ext_idx_kv_entry_active_key',
  secretEntryUnique: 'ext_idx_secret_entry_active_key',
  storageSelectionUnique: 'ext_idx_storage_selection_active_agency'
} as const

export const up = async (db: Kysely<Database>): Promise<void> => {
  await db.schema.createSchema('extensions').ifNotExists().execute()

  await db.schema
    .createTable('extensions.agency_enablement')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('extension_key', 'varchar(120)', col => col.notNull())
    .addColumn('agency_id', 'bigint', col => col.notNull().references('Agency_Profile.id').onDelete('restrict'))
    .addColumn('enabled', 'boolean', col => col.defaultTo(false).notNull())
    .addColumn('config', 'jsonb', col => col.defaultTo(sql`'{}'::jsonb`).notNull())
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .execute()

  await db.schema
    .createIndex(INDEX_NAMES.agencyEnablementUnique)
    .on('extensions.agency_enablement')
    .columns(['extension_key', 'agency_id'])
    .where(sql<SqlBool>`_deleted = false`)
    .unique()
    .execute()

  await db.schema
    .createTable('extensions.agency_storage_selection')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('agency_id', 'bigint', col => col.notNull().references('Agency_Profile.id').onDelete('restrict'))
    .addColumn('provider_key', 'varchar(120)', col => col.notNull())
    .addColumn('created_at', 'timestamptz', col => col.defaultTo(sql`now()`).notNull())
    .addColumn('updated_at', 'timestamptz')
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .execute()

  await db.schema
    .createIndex(INDEX_NAMES.storageSelectionUnique)
    .on('extensions.agency_storage_selection')
    .column('agency_id')
    .where(sql<SqlBool>`_deleted = false`)
    .unique()
    .execute()

  await db.schema
    .createTable('extensions.stream_configuration')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('extension_key', 'varchar(120)', col => col.notNull())
    .addColumn('stream_id', 'bigint', col => col.notNull().references('Transfer_Payment_Stream.id').onDelete('restrict'))
    .addColumn('enabled', 'boolean', col => col.defaultTo(false).notNull())
    .addColumn('config', 'jsonb', col => col.defaultTo(sql`'{}'::jsonb`).notNull())
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .execute()

  await db.schema
    .createIndex(INDEX_NAMES.streamConfigurationUnique)
    .on('extensions.stream_configuration')
    .columns(['extension_key', 'stream_id'])
    .where(sql<SqlBool>`_deleted = false`)
    .unique()
    .execute()

  await db.schema
    .createTable('extensions.kv_entry')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('extension_key', 'varchar(120)', col => col.notNull())
    .addColumn('owner_type', 'varchar(80)', col => col.notNull())
    .addColumn('owner_id', 'varchar(120)', col => col.notNull())
    .addColumn('config_key', 'varchar(160)', col => col.notNull())
    .addColumn('value', 'jsonb', col => col.defaultTo(sql`'{}'::jsonb`).notNull())
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .execute()

  await db.schema
    .createIndex(INDEX_NAMES.kvEntryUnique)
    .on('extensions.kv_entry')
    .columns(['extension_key', 'owner_type', 'owner_id', 'config_key'])
    .where(sql<SqlBool>`_deleted = false`)
    .unique()
    .execute()

  await db.schema
    .createTable('extensions.secret_entry')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('extension_key', 'varchar(120)', col => col.notNull())
    .addColumn('owner_type', 'varchar(80)', col => col.notNull())
    .addColumn('owner_id', 'varchar(120)', col => col.notNull())
    .addColumn('secret_key', 'varchar(160)', col => col.notNull())
    .addColumn('ciphertext', 'text', col => col.notNull())
    .addColumn('iv', 'text', col => col.notNull())
    .addColumn('auth_tag', 'text', col => col.notNull())
    .addColumn('algorithm', 'varchar(40)', col => col.notNull())
    .addColumn('key_version', 'integer', col => col.notNull())
    .addColumn('metadata', 'jsonb', col => col.defaultTo(sql`'{}'::jsonb`).notNull())
    .addColumn('created_at', 'timestamptz', col => col.defaultTo(sql`now()`).notNull())
    .addColumn('updated_at', 'timestamptz')
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .execute()

  await db.schema
    .createIndex(INDEX_NAMES.secretEntryUnique)
    .on('extensions.secret_entry')
    .columns(['extension_key', 'owner_type', 'owner_id', 'secret_key'])
    .where(sql<SqlBool>`_deleted = false`)
    .unique()
    .execute()
}

export const down = async (db: Kysely<Database>): Promise<void> => {
  await sql`DROP INDEX IF EXISTS extensions.${sql.raw(INDEX_NAMES.secretEntryUnique)}`.execute(db)
  await db.schema.dropTable('extensions.secret_entry').execute()
  await sql`DROP INDEX IF EXISTS extensions.${sql.raw(INDEX_NAMES.kvEntryUnique)}`.execute(db)
  await db.schema.dropTable('extensions.kv_entry').execute()
  await sql`DROP INDEX IF EXISTS extensions.${sql.raw(INDEX_NAMES.storageSelectionUnique)}`.execute(db)
  await db.schema.dropTable('extensions.agency_storage_selection').execute()
  await sql`DROP INDEX IF EXISTS extensions.${sql.raw(INDEX_NAMES.streamConfigurationUnique)}`.execute(db)
  await db.schema.dropTable('extensions.stream_configuration').execute()
  await sql`DROP INDEX IF EXISTS extensions.${sql.raw(INDEX_NAMES.agencyEnablementUnique)}`.execute(db)
  await db.schema.dropTable('extensions.agency_enablement').execute()
  await db.schema.dropSchema('extensions').ifExists().execute()
}
