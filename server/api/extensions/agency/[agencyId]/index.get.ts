import type { Scope } from '~~/shared/utils/scopes'
import type { ExtensionAgencyRegistryItem } from '~~/shared/types/schemas/extensions'
import { authorizeWithFreshAuthContext, requireAuthContext, requireFreshAuthContext } from '~~/server/utils/authorize'
import { getRegisteredExtensions, toClientExtensionManifest } from '~~/server/utils/extensions'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const agencyId = getRouterParam(event, 'agencyId') ?? ''
  const scope: Scope = { type: 'agency', agencyId }
  await requireAuthContext(event)

  if (!agencyId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }
  if (!isPositivePostgresBigintText(agencyId)) {
    return await badRequest(event, 'INVALID_ID', 'apiErrors.request.invalid_id')
  }

  const extensions = await getRegisteredExtensions()
  return await db.transaction().setIsolationLevel('repeatable read').execute(async trx => {
    const auth = await requireFreshAuthContext(event, trx)
    await authorizeWithFreshAuthContext(event, auth, 'agency', 'read', scope)
    const agency = await trx
      .selectFrom('Agency_Profile')
      .select('id')
      .where('id', '=', agencyId)
      .where('_deleted', '=', false)
      .executeTakeFirst()
    if (!agency) {
      return await notFound(event, 'AGENCY_NOT_FOUND', 'apiErrors.agency.not_found')
    }

    const rows = await trx
      .selectFrom('extensions.agency_enablement as enablement')
      .innerJoin('Agency_Profile as agency', 'agency.id', 'enablement.agency_id')
      .select([
        'enablement.extension_key',
        'enablement.enabled',
        'enablement.id',
        'enablement.config'
      ])
      .where('enablement.agency_id', '=', agencyId)
      .where('enablement._deleted', '=', false)
      .where('agency._deleted', '=', false)
      .execute()
    const enabledByKey = new Map(rows.map(row => [row.extension_key, row.enabled === true]))
    const configByKey = new Map(rows.map(row => [row.extension_key, row.config]))

    const storageSelection = await trx.selectFrom('extensions.agency_storage_selection')
      .select('provider_key').where('agency_id', '=', agencyId).where('_deleted', '=', false).executeTakeFirst()
    const items: ExtensionAgencyRegistryItem[] = extensions.map(extension => ({
      extension: toClientExtensionManifest(extension),
      hasMigrations: extension.migrations.length > 0,
      enabled: enabledByKey.get(extension.key) === true,
      config: (configByKey.get(extension.key) ?? {}) as ExtensionAgencyRegistryItem['config'],
      ...(extension.fileStorageProvider
        ? { storageProvider: { selected: storageSelection?.provider_key === extension.key } }
        : {})
    }))

    return {
      items,
      total: items.length,
      stats: {
        total: items.length,
        active: items.filter(item => item.enabled).length,
        selectedStorageProvider: storageSelection?.provider_key ?? null
      },
      page: 1,
      limit: items.length || 10
    }
  })
})
