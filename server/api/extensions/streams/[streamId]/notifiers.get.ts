import { defineEventHandler, getRouterParam } from 'h3'
import { authorizeWithFreshAuthContext, requireAuthContext, requireFreshAuthContext } from '~~/server/utils/authorize'
import { resolveExtensionStreamContext } from '~~/server/utils/extensions'
import { NOTIFICATION_NOTIFIERS } from '~~/shared/utils/notification-notifiers'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const streamId = getRouterParam(event, 'streamId') ?? ''
  if (!streamId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  if (!isPositivePostgresBigintText(streamId)) {
    return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }
  return await event.context.$db.transaction().setIsolationLevel('repeatable read').execute(async trx => {
    const auth = await requireFreshAuthContext(event, trx)
    const stream = await resolveExtensionStreamContext(trx, streamId)
    if (!stream) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
    await authorizeWithFreshAuthContext(event, auth, 'transfer_payment', 'read', stream.scope)
    return { notifiers: NOTIFICATION_NOTIFIERS }
  })
})
