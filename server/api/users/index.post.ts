import { UserProfileSchema } from '~~/shared/types/schemas'
import { authorize, authorizeWithFreshAuthContext, requireFreshAuthContext } from '~~/server/utils/authorize'
import { syncCommonUser } from '~~/server/utils/common-user-sync'
import { recordSecurityAuditEvent } from '~~/server/utils/security-audit'

/**
 *  * Event handler for this server API route. Handles the incoming request payload, performs necessary business logic and authorization operations, and returns the expected endpoint response array or object.
 *  *
 *  * @param event - The active H3 event context encapsulating the request and response objects.
 *
 */
export default defineEventHandler(async event => {
  const db = event.context.$db

  await authorize(event, 'user', 'create', { type: 'global' })

  const body = await readValidatedBodyI18n(event, UserProfileSchema)

  let created: { id: unknown } | 'duplicate'
  try {
    created = await db.transaction().execute(async trx => {
      const authContext = await requireFreshAuthContext(event, trx)
      await authorizeWithFreshAuthContext(event, authContext, 'user', 'create', { type: 'global' })
      const existing = await trx.selectFrom('user').where('email', '=', body.email).where('_deleted', '=', false).select('id').executeTakeFirst()
      if (existing) return 'duplicate'
      const user = await trx.insertInto('user').values({
        name: body.name,
        email: body.email,
        emailVerified: false,
        image: body.image ?? undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
        _deleted: false
      }).returning('id').executeTakeFirstOrThrow()
      await syncCommonUser(trx, {
        userId: String(user.id),
        name: body.name,
        email: body.email,
        emailVerified: false,
        image: body.image
      })
      await recordSecurityAuditEvent(trx, {
        actorUserId: authContext.userId,
        eventType: 'user.created',
        targetType: 'user',
        targetId: String(user.id)
      })
      return user
    })
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      return await badRequest(event, 'EMAIL_EXISTS', 'apiErrors.user.email_exists')
    }
    throw error
  }

  if (created === 'duplicate') return await badRequest(event, 'EMAIL_EXISTS', 'apiErrors.user.email_exists')

  return { id: String(created.id) }
})
