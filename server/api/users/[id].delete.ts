import { authorize, authorizeFresh, requireAuthContext, resolveUserScopes } from '~~/server/utils/authorize'
import { recordSecurityAuditEvent } from '~~/server/utils/security-audit'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const db = event.context.$db
  await requireAuthContext(event)
  const id = getRouterParam(event, 'id')
  if (!id) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  if (!isPositivePostgresBigintText(id)) return await notFound(event, 'USER_NOT_FOUND', 'apiErrors.user.not_found')

  await authorize(event, 'user', 'delete', resolveUserScopes(id, db, { allowSelfRead: false, requireAllScopes: true }))

  const deleted = await db.transaction().execute(async trx => {
    const authContext = await authorizeFresh(
      event,
      'user',
      'delete',
      resolveUserScopes(id, trx, { allowSelfRead: false, requireAllScopes: true }),
      trx,
      { lockUserIds: [id] }
    )

    const user = await trx
      .selectFrom('user')
      .where('id', '=', id)
      .where('_deleted', '=', false)
      .select('id')
      .forUpdate()
      .executeTakeFirst()
    if (!user) {
      return false
    }

    await trx
      .deleteFrom('session')
      .where('userId', '=', id)
      .execute()
    await trx
      .updateTable('user_role_assignment')
      .set({ _deleted: true })
      .where('user_id', '=', id)
      .where('_deleted', '=', false)
      .execute()
    await trx
      .updateTable('user')
      .set({ _deleted: true })
      .where('id', '=', id)
      .where('_deleted', '=', false)
      .execute()
    await recordSecurityAuditEvent(trx, {
      actorUserId: authContext.userId,
      eventType: 'user.deleted',
      targetType: 'user',
      targetId: id
    })
    return true
  })

  if (!deleted) {
    return await notFound(event, 'USER_NOT_FOUND', 'apiErrors.user.not_found')
  }

  return { id }
})
