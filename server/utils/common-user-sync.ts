import { sql, type Kysely, type Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'

type CommonUserSyncInput = {
  userId: string
  name: string
  email: string
  emailVerified: boolean
  image?: string | null
}

/**
 * Keeps the approval/runtime Common_User identity aligned with an authentication user.
 *
 * @param db Database connection or active transaction.
 * @param input Authentication identity values to synchronize.
 * @returns The synchronized Common_User identifier.
 */
export const syncCommonUser = async (
  db: Kysely<Database> | Transaction<Database>,
  input: CommonUserSyncInput
) => {
  const existing = await db
    .selectFrom('Common_User')
    .select('id')
    .where('egcs_cn_auth_user_id', '=', input.userId)
    .executeTakeFirst()
  const now = new Date()

  if (existing) {
    await db
      .updateTable('Common_User')
      .set({
        egcs_cn_auth_user_id: input.userId,
        egcs_cn_name: input.name,
        egcs_cn_email: input.email,
        egcs_cn_email_verified: input.emailVerified,
        egcs_cn_image: input.image === null ? sql<string>`NULL` : input.image,
        egcs_cn_updated_at: now,
        _deleted: false
      })
      .where('id', '=', String(existing.id))
      .execute()
    return String(existing.id)
  }

  const created = await db
    .insertInto('Common_User')
    .values({
      egcs_cn_auth_user_id: input.userId,
      egcs_cn_name: input.name,
      egcs_cn_position_title: 'Program Officer',
      egcs_cn_email: input.email,
      egcs_cn_email_verified: input.emailVerified,
      egcs_cn_image: input.image ?? undefined,
      egcs_cn_created_at: now,
      egcs_cn_updated_at: now,
      _deleted: false
    })
    .returning('id')
    .executeTakeFirstOrThrow()

  return String(created.id)
}
