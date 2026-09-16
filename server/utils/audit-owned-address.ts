/* eslint-disable jsdoc/require-param, jsdoc/require-returns -- Explicit creation contract preserves the caller's verified entity. */
import { sql, type Insertable, type Transaction } from 'kysely'
import type { CommonAddressTable, Database } from '../../shared/types/database'
import { withAuditCreationOwner } from './audit-context'

/** Reserves the ordinary sequence ID so the owner handoff is restricted to exactly one new row. */
export const insertOwnedAddress = async (
  db: Transaction<Database>,
  values: Insertable<CommonAddressTable>,
  owner: { entityType: 'applicantrecipient' | 'fundingcaseagreement'; entityId: string }
) => {
  const allocated = await sql<{ id: string }>`SELECT nextval(pg_get_serial_sequence('public."Common_Address"', 'id'))::text AS id`.execute(db)
  const id = allocated.rows[0]?.id
  if (!id) throw new Error('Address identity allocation failed')
  return await withAuditCreationOwner('public.Common_Address', { id }, owner, async () => await db
    .insertInto('Common_Address').values({ ...values, id }).returning('id').executeTakeFirstOrThrow())
}
