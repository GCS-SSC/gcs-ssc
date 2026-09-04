import type { Kysely } from 'kysely'
import type { Database } from '../../../shared/types/database'

const ROLE_AGENCY_FK = 'role_agency_fk'

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable('role')
    .addForeignKeyConstraint(ROLE_AGENCY_FK, ['agency_id'], 'Agency_Profile', ['id'], constraint =>
      constraint.onDelete('restrict')
    )
    .execute()
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable('role').dropConstraint(ROLE_AGENCY_FK).execute()
}
