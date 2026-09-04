import type { Scope } from '~~/shared/utils/scopes'
import { authorizeWithFreshAuthContext, requireAuthContext, requireFreshAuthContext } from '~~/server/utils/authorize'
import { getRegisteredExtensions, toClientExtensionManifest } from '~~/server/utils/extensions'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const agencyId = getRouterParam(event, 'agencyId') ?? ''
  const scope: Scope = { type: 'agency', agencyId }
  await requireAuthContext(event)
  if (!agencyId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  if (!isPositivePostgresBigintText(agencyId)) {
    return await badRequest(event, 'INVALID_ID', 'apiErrors.request.invalid_id')
  }
  const registeredExtensions = await getRegisteredExtensions()
  return await event.context.$db.transaction().setIsolationLevel('repeatable read').execute(async trx => {
    const auth = await requireFreshAuthContext(event, trx)
    await authorizeWithFreshAuthContext(event, auth, 'agency', 'read', scope)
    const agency = await trx.selectFrom('Agency_Profile').select('id')
      .where('id', '=', agencyId).where('_deleted', '=', false).executeTakeFirst()
    if (!agency) return await notFound(event, 'AGENCY_NOT_FOUND', 'apiErrors.agency.not_found')
    const [selection, enablements] = await Promise.all([
      trx.selectFrom('extensions.agency_storage_selection').selectAll()
        .where('agency_id', '=', agencyId).where('_deleted', '=', false).executeTakeFirst(),
      trx.selectFrom('extensions.agency_enablement').select(['extension_key', 'enabled'])
        .where('agency_id', '=', agencyId).where('_deleted', '=', false).execute()
    ])
    const enabled = new Map(enablements.map(item => [item.extension_key, item.enabled]))
    return {
      selectedProvider: selection?.provider_key ?? null,
      providers: registeredExtensions.filter(item => item.fileStorageProvider).map(item => ({
        extension: toClientExtensionManifest(item),
        enabled: enabled.get(item.key) === true,
        selected: selection?.provider_key === item.key
      }))
    }
  })
})
