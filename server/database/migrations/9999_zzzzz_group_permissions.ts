import { sql, type Kysely } from 'kysely'
import type { Database } from '../../../shared/types/database'

/** Adds group administration to historical demo roles after the immutable seed has run. */
export const up = async (db: Kysely<Database>): Promise<void> => {
  await sql`INSERT INTO role_permission (role_id, subject, access_level, can_manage_assignments, _deleted)
    SELECT permission.role_id, 'group', permission.access_level, false, false
    FROM role_permission permission
    WHERE permission.subject = 'user' AND permission._deleted = false AND permission.access_level IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM role_permission existing
        WHERE existing.role_id = permission.role_id AND existing.subject = 'group' AND existing._deleted = false)`.execute(db)
}

export const down = async (_db: Kysely<Database>): Promise<void> => {
  // Group permissions may have changed after seeding; retain them until the core group migration is rolled back.
}
