import { sql, type Kysely } from 'kysely'
import type { Database } from '../../../shared/types/database'

/** Installs durable host scheduling infrastructure on a fresh database. */
export const up = async (db: Kysely<Database>): Promise<void> => {
  await sql`CREATE TABLE "l1_queue" (
  "id" bigserial PRIMARY KEY,
  "handler_id" varchar(240) NOT NULL UNIQUE,
  "next_run_at" timestamptz NOT NULL DEFAULT now(),
  "attempt_count" integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  "lease_owner" varchar(160),
  "lease_expires_at" timestamptz,
  "last_error" varchar(1000),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);`.execute(db)
  await sql`CREATE INDEX l1_queue_due_idx ON l1_queue (next_run_at, lease_expires_at);`.execute(db)
}
