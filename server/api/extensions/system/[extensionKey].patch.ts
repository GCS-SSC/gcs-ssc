import { defineEventHandler, getRouterParam } from 'h3'
import { authorize, authorizeWithFreshAuthContext, requireFreshAuthContext } from '~~/server/utils/authorize'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { getRegisteredExtensions, runExtensionMigrations } from '~~/server/utils/extensions'
import { lockSystemExtension } from '~~/server/utils/system-extension-enablement'
import { ExtensionSystemToggleSchema } from '~~/shared/types/schemas/extensions'

export default defineEventHandler(async event => {
  const scope = { type: 'global' } as const
  await authorize(event, 'system', 'update', scope)
  const extensionKey = getRouterParam(event, 'extensionKey')
  const extension = (await getRegisteredExtensions()).find(item =>
    item.key === extensionKey && item.configurationScope === 'system')
  if (!extension) return await notFound(event, 'EXTENSION_NOT_FOUND', 'apiErrors.extensions.not_found')

  const { enabled } = await readValidatedBodyI18n(event, ExtensionSystemToggleSchema)
  return await event.context.$db.transaction().execute(async trx => {
    const auth = await requireFreshAuthContext(event, trx)
    await authorizeWithFreshAuthContext(event, auth, 'system', 'update', scope)
    await lockSystemExtension(trx, extension.key, 'exclusive')
    if (enabled) await runExtensionMigrations(trx, extension)
    await trx.insertInto('extensions.system_enablement')
      .values({ extension_key: extension.key, enabled })
      .onConflict(conflict => conflict.column('extension_key').doUpdateSet({ enabled }))
      .execute()
    return { enabled }
  })
})
