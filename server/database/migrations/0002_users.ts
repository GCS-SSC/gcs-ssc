import { sql, type Kysely } from 'kysely'
import type { Database } from '../../../shared/types/database'

export async function up(db: Kysely<Database>): Promise<void> {
  await sql`CREATE EXTENSION IF NOT EXISTS plpgsql`.execute(db)

  await db.schema
    .createTable('user')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('name', 'text', col => col.notNull())
    .addColumn('email', 'text', col => col.notNull().unique())
    .addColumn('emailVerified', 'boolean', col => col.notNull())
    .addColumn('image', 'text')
    .addColumn('createdAt', 'timestamp', col => col.notNull())
    .addColumn('updatedAt', 'timestamp', col => col.notNull())
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .execute()

  await db.schema
    .createTable('session')
    .addColumn('id', 'text', col => col.primaryKey())
    .addColumn('expiresAt', 'timestamp', col => col.notNull())
    .addColumn('token', 'text', col => col.notNull().unique())
    .addColumn('createdAt', 'timestamp', col => col.notNull())
    .addColumn('updatedAt', 'timestamp', col => col.notNull())
    .addColumn('userId', 'bigint', col => col.notNull().references('user.id').onDelete('cascade'))
    .addColumn('ipAddress', 'text')
    .addColumn('userAgent', 'text')
    .execute()

  await sql`
    CREATE FUNCTION enforce_active_session_user()
    RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = pg_catalog
    AS $$
    DECLARE
      active_user boolean;
    BEGIN
      EXECUTE format(
        'SELECT true FROM %I."user" WHERE id = $1 AND _deleted = false FOR SHARE',
        TG_TABLE_SCHEMA
      )
      INTO active_user
      USING NEW."userId";

      IF active_user IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'session user must be active'
          USING ERRCODE = '23514';
      END IF;

      RETURN NEW;
    END;
    $$
  `.execute(db)

  await sql`
    CREATE TRIGGER trg_enforce_active_session_user
    BEFORE INSERT OR UPDATE OF "userId" ON "session"
    FOR EACH ROW
    EXECUTE FUNCTION enforce_active_session_user()
  `.execute(db)

  await db.schema
    .createTable('account')
    .addColumn('id', 'text', col => col.primaryKey())
    .addColumn('accountId', 'text', col => col.notNull())
    .addColumn('providerId', 'text', col => col.notNull())
    .addColumn('userId', 'bigint', col => col.notNull().references('user.id').onDelete('cascade'))
    .addColumn('accessToken', 'text')
    .addColumn('refreshToken', 'text')
    .addColumn('idToken', 'text')
    .addColumn('accessTokenExpiresAt', 'timestamp')
    .addColumn('refreshTokenExpiresAt', 'timestamp')
    .addColumn('scope', 'text')
    .addColumn('password', 'text')
    .addColumn('createdAt', 'timestamp', col => col.notNull())
    .addColumn('updatedAt', 'timestamp', col => col.notNull())
    .execute()

  await db.schema
    .createTable('verification')
    .addColumn('id', 'text', col => col.primaryKey())
    .addColumn('identifier', 'text', col => col.notNull())
    .addColumn('value', 'text', col => col.notNull())
    .addColumn('expiresAt', 'timestamp', col => col.notNull())
    .addColumn('createdAt', 'timestamp')
    .addColumn('updatedAt', 'timestamp')
    .execute()
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable('verification').execute()
  await db.schema.dropTable('account').execute()
  await db.schema.dropTable('session').execute()
  await sql`DROP FUNCTION enforce_active_session_user()`.execute(db)
  await db.schema.dropTable('user').execute()
}
