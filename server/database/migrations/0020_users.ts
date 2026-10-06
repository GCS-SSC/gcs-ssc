import { sql, type Kysely } from 'kysely'
import type { Database } from '../../../shared/types/database'

// Clean-cutover baseline: users. Edit this subject directly.

/** Installs the current up definitions for this subject on a fresh database. */
export const up = async (db: Kysely<Database>): Promise<void> => {
  await sql`CREATE EXTENSION IF NOT EXISTS plpgsql`.execute(db)
  await sql`CREATE EXTENSION IF NOT EXISTS citext`.execute(db)
  await sql`DO $baseline$ BEGIN
CREATE SEQUENCE "user_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE TABLE "account" (
  "id" text NOT NULL,
  "accountId" text NOT NULL,
  "providerId" text NOT NULL,
  "userId" bigint NOT NULL,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamp without time zone,
  "refreshTokenExpiresAt" timestamp without time zone,
  "scope" text,
  "password" text,
  "createdAt" timestamp without time zone NOT NULL,
  "updatedAt" timestamp without time zone NOT NULL,
  CONSTRAINT "account_pkey" PRIMARY KEY (id)
);

CREATE TABLE "session" (
  "id" text NOT NULL,
  "expiresAt" timestamp without time zone NOT NULL,
  "token" text NOT NULL,
  "createdAt" timestamp without time zone NOT NULL,
  "updatedAt" timestamp without time zone NOT NULL,
  "userId" bigint NOT NULL,
  "ipAddress" text,
  "userAgent" text,
  CONSTRAINT "session_pkey" PRIMARY KEY (id),
  CONSTRAINT "session_token_key" UNIQUE (token)
);

CREATE TABLE "user" (
  "id" bigint DEFAULT nextval('user_id_seq'::regclass) NOT NULL,
  "name" text NOT NULL,
  "email" citext NOT NULL,
  "emailVerified" boolean NOT NULL,
  "image" text,
  "createdAt" timestamp without time zone NOT NULL,
  "updatedAt" timestamp without time zone NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "user_email_key" UNIQUE (email),
  CONSTRAINT "user_pkey" PRIMARY KEY (id)
);

CREATE TABLE "verification" (
  "id" text NOT NULL,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expiresAt" timestamp without time zone NOT NULL,
  "createdAt" timestamp without time zone,
  "updatedAt" timestamp without time zone,
  CONSTRAINT "verification_pkey" PRIMARY KEY (id)
);

ALTER SEQUENCE "user_id_seq" OWNED BY "user"."id";
END $baseline$`.execute(db)
  await installFunctions(db)
  await installForeignKeys(db)
  await installTriggers(db)
}

/** Installs the current installFunctions definitions for this subject on a fresh database. */
export const installFunctions = async (db: Kysely<Database>): Promise<void> => {
  await sql`DO $baseline$ BEGIN
CREATE FUNCTION enforce_active_session_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
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
          USING ERRCODE = '23514', CONSTRAINT = 'session_user_active';
      END IF;

      RETURN NEW;
    END;
    $function$;
END $baseline$`.execute(db)
}

/** Installs the current installForeignKeys definitions for this subject on a fresh database. */
export const installForeignKeys = async (db: Kysely<Database>): Promise<void> => {
  await sql`DO $baseline$ BEGIN
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"(id) ON DELETE CASCADE;

ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"(id) ON DELETE CASCADE;
END $baseline$`.execute(db)
}

/** Installs the current installTriggers definitions for this subject on a fresh database. */
export const installTriggers = async (db: Kysely<Database>): Promise<void> => {
  await sql`DO $baseline$ BEGIN
CREATE TRIGGER trg_enforce_active_session_user BEFORE INSERT OR UPDATE OF "userId" ON session FOR EACH ROW EXECUTE FUNCTION enforce_active_session_user();
END $baseline$`.execute(db)
}
