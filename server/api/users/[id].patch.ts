import { UserProfilePatchSchema } from '~~/shared/types/schemas/user'
import { sql } from 'kysely'
import { authorize, authorizeFresh, requireAuthContext, resolveUserScopes } from '~~/server/utils/authorize'
import { syncCommonUser } from '~~/server/utils/common-user-sync'
import { recordSecurityAuditEvent } from '~~/server/utils/security-audit'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

/**
 *  * Event handler for this server API route. Handles the incoming request payload, performs necessary business logic and authorization operations, and returns the expected endpoint response array or object.
 *  *
 *  * @param event - The active H3 event context encapsulating the request and response objects.
 *
 */
export default defineEventHandler(async event => {
  const db = event.context.$db
  await requireAuthContext(event)
  const id = getRouterParam(event, 'id')
  if (!id) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  if (!isPositivePostgresBigintText(id)) return await notFound(event, 'USER_NOT_FOUND', 'apiErrors.user.not_found')

  await authorize(event, 'user', 'update', resolveUserScopes(id, db, { allowSelfRead: false, requireAllScopes: true }))

  const body = await readValidatedBodyI18n(event, UserProfilePatchSchema)

  let result: 'not_found' | 'duplicate' | 'updated'
  try {
    result = await db.transaction().execute(async trx => {
      const authContext = await authorizeFresh(
        event,
        'user',
        'update',
        resolveUserScopes(id, trx, { allowSelfRead: false, requireAllScopes: true }),
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
      if (!user) return 'not_found'

      const existing = body.email === undefined
        ? undefined
        : await trx
            .selectFrom('user')
            .where('email', '=', body.email)
            .where('id', '!=', id)
            .where('_deleted', '=', false)
            .select('id')
            .executeTakeFirst()
      if (existing) return 'duplicate'

      await trx
        .updateTable('user')
        .set({
          name: body.name,
          email: body.email,
          image: body.image === null ? sql<string>`NULL` : body.image,
          updatedAt: new Date()
        })
        .where('id', '=', id)
        .where('_deleted', '=', false)
        .execute()
      await syncCommonUser(trx, {
        userId: id,
        name: body.name ?? user.name,
        email: body.email ?? user.email,
        emailVerified: user.emailVerified,
        image: body.image === undefined ? user.image : body.image
      })
      await recordSecurityAuditEvent(trx, {
        actorUserId: authContext.userId,
        eventType: 'user.profile_updated',
        targetType: 'user',
        targetId: id,
        metadata: {
          name_changed: body.name !== undefined,
          email_changed: body.email !== undefined,
          image_changed: body.image !== undefined
        }
      })
      return 'updated'
    })
  } catch (error: unknown) {
    if (
      typeof error === 'object'
      && error !== null
      && 'code' in error
      && error.code === '23505'
    ) {
      return await badRequest(event, 'EMAIL_EXISTS', 'apiErrors.user.email_exists')
    }
    throw error
  }

  if (result === 'not_found') {
    return await notFound(event, 'USER_NOT_FOUND', 'apiErrors.user.not_found')
  }
  if (result === 'duplicate') {
    return await badRequest(event, 'EMAIL_EXISTS', 'apiErrors.user.email_exists')
  }

  return { id }
})
