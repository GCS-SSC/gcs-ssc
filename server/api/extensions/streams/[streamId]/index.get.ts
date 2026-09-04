import type { ExtensionStreamRegistryItem } from '~~/shared/types/schemas/extensions'
import { authorizeWithFreshAuthContext, requireAuthContext, requireFreshAuthContext } from '~~/server/utils/authorize'
import { getRegisteredExtensions, resolveExtensionStreamContext, toClientExtensionManifest } from '~~/server/utils/extensions'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const db = event.context.$db
  await requireAuthContext(event)
  const streamId = getRouterParam(event, 'streamId')
  if (!streamId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }
  if (!isPositivePostgresBigintText(streamId)) {
    return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }

  const extensions = await getRegisteredExtensions()
  return await db.transaction().setIsolationLevel('repeatable read').execute(async trx => {
    const auth = await requireFreshAuthContext(event, trx)
    const streamContext = await resolveExtensionStreamContext(trx, streamId)
    if (!streamContext) {
      return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
    }

    await authorizeWithFreshAuthContext(event, auth, 'transfer_payment', 'read', async ({ context }) => {
      const canAccess = context.userAbilities.authorize(
        'transfer_payment',
        'read',
        streamContext.scope
      )
      if (canAccess) return { bypass: true }
      return { scope: streamContext.scope }
    })

    const [agencyRows, streamRows] = await Promise.all([
      trx
        .selectFrom('extensions.agency_enablement')
        .select(['extension_key', 'enabled'])
        .where('agency_id', '=', streamContext.agencyId)
        .where('_deleted', '=', false)
        .execute(),
      trx
        .selectFrom('extensions.stream_configuration')
        .select(['extension_key', 'enabled', 'config'])
        .where('stream_id', '=', streamId)
        .where('_deleted', '=', false)
        .execute()
    ])

    const agencyEnabled = new Map(agencyRows.map(row => [row.extension_key, row.enabled === true]))
    const streamConfig = new Map(streamRows.map(row => [row.extension_key, row]))
    const items: ExtensionStreamRegistryItem[] = extensions
      .filter(extension => agencyEnabled.get(extension.key) === true)
      .map(extension => {
        const row = streamConfig.get(extension.key)
        return {
          extension: toClientExtensionManifest(extension),
          agencyEnabled: true,
          streamEnabled: row?.enabled === true,
          config: (row?.config ?? {}) as Record<string, never>
        }
      })

    return {
      items,
      total: items.length,
      stats: {
        total: items.length,
        active: items.filter(item => item.streamEnabled).length
      },
      page: 1,
      limit: items.length || 10
    }
  })
})
