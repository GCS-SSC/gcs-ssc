import { sql, type Kysely } from 'kysely'
import type { Database } from '../../../shared/types/database'

/** Installs shared background cycles and independently leased handler state. */
export const up = async (db: Kysely<Database>): Promise<void> => {
  await sql`CREATE TABLE "background_queue_schedule" (
  "id" bigserial PRIMARY KEY,
  "queue_level" integer NOT NULL UNIQUE CHECK (queue_level >= 0),
  "current_cycle_at" timestamptz,
  "next_run_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);`.execute(db)
  await sql`CREATE TABLE "background_queue_handler" (
  "id" bigserial PRIMARY KEY,
  "handler_id" varchar(240) NOT NULL UNIQUE,
  "queue_level" integer NOT NULL REFERENCES background_queue_schedule(queue_level),
  "last_cycle_at" timestamptz,
  "lease_cycle_at" timestamptz,
  "attempt_count" integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  "retry_not_before" timestamptz,
  "lease_owner" varchar(160),
  "lease_expires_at" timestamptz,
  "last_error" varchar(1000),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT background_queue_handler_lease_check CHECK (
    (lease_owner IS NULL AND lease_expires_at IS NULL AND lease_cycle_at IS NULL)
    OR (lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL AND lease_cycle_at IS NOT NULL)
  )
);`.execute(db)
  await sql`CREATE INDEX background_queue_handler_level_idx
    ON background_queue_handler (queue_level, last_cycle_at, lease_expires_at);`.execute(db)
}
