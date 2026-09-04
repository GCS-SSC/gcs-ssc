import { hashPassword } from 'better-auth/crypto'
import { nanoid } from 'nanoid'
import { UserActivationSchema } from '~~/shared/types/schemas/user'
import { authorize, authorizeFresh, requireAuthContext } from '~~/server/utils/authorize'
import { syncCommonUser } from '~~/server/utils/common-user-sync'
import { recordSecurityAuditEvent } from '~~/server/utils/security-audit'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

/** Activates an unverified user under global user-management authority. */
export default defineEventHandler(async event => {
  const db = event.context.$db
  await requireAuthContext(event)
  const id = getRouterParam(event, 'id')
  if (!id) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  if (!isPositivePostgresBigintText(id)) return await notFound(event, 'USER_NOT_FOUND', 'apiErrors.user.not_found')

  await authorize(event, 'user', 'update', { type: 'global' })
  const body = await readValidatedBodyI18n(event, UserActivationSchema)
  const passwordHash = await hashPassword(body.password)

  const result = await db.transaction().execute(async trx => {
    const authContext = await authorizeFresh(
      event,
      'user',
      'update',
      { type: 'global' },
      trx,
      { lockUserIds: [id] }
    )

    const user = await trx
      .selectFrom('user')
      .where('id', '=', id)
      .where('_deleted', '=', false)
      .select(['id', 'name', 'email', 'emailVerified', 'image'])
      .forUpdate()
      .executeTakeFirst()

    if (!user) return null

    if (user.emailVerified) return 'already_active'

    const existingAccount = await trx
      .selectFrom('account')
      .where('userId', '=', id)
      .select('id')
      .executeTakeFirst()
    if (existingAccount) return 'externally_managed'

    const now = new Date()
    await trx
      .insertInto('account')
      .values({
        id: `manual_${nanoid()}`,
        accountId: id,
        providerId: 'credential',
        userId: id,
        password: passwordHash,
        createdAt: now,
        updatedAt: now
      })
      .execute()

    await syncCommonUser(trx, {
      userId: id,
      name: user.name,
      email: user.email,
      emailVerified: true,
      image: user.image
    })

    await trx
      .updateTable('user')
      .set({ emailVerified: true, updatedAt: now })
      .where('id', '=', id)
      .where('_deleted', '=', false)
      .execute()

    await recordSecurityAuditEvent(trx, {
      actorUserId: authContext.userId,
      eventType: 'user.activated',
      targetType: 'user',
      targetId: id
    })

    return { id: String(user.id), emailVerified: true }
  })

  if (!result) return await notFound(event, 'USER_NOT_FOUND', 'apiErrors.user.not_found')
  if (result === 'already_active') {
    return await badRequest(event, 'USER_ALREADY_ACTIVE', 'apiErrors.user.already_active')
  }
  if (result === 'externally_managed') {
    return await badRequest(event, 'USER_ACCOUNT_EXTERNALLY_MANAGED', 'apiErrors.user.externally_managed')
  }
  return result
})
