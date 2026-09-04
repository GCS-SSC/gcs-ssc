/* eslint-disable jsdoc/require-jsdoc */
import type { MigrationResult } from 'kysely'
import type { Scope } from '~~/shared/utils/scopes'
import { ExtensionMigrationRunSchema } from '~~/shared/types/schemas/extensions'
import {
  authorize,
  authorizeWithFreshAuthContext,
  requireFreshAuthContext
} from '~~/server/utils/authorize'
import {
  isExtensionEnabledForAgency,
  lockExtensionLifecycleScope,
  requireRegisteredExtension,
  runExtensionMigrations
} from '~~/server/utils/extensions'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

const serializeMigrationResult = (result: MigrationResult) => ({
  migrationName: result.migrationName,
  direction: result.direction,
  status: result.status
})

/** Marks extension migration execution failures for stable API translation after rollback. */
class ExtensionMigrationFailed extends Error {}

export default defineEventHandler(async event => {
  const db = event.context.$db
  const agencyId = getRouterParam(event, 'agencyId')
  if (!agencyId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }

  const scope: Scope = { type: 'agency', agencyId }
  await authorize(event, 'agency', 'update', scope)

  // Keep authentication/authorization first so malformed IDs do not disclose which
  // agencies exist, then reject non-canonical and out-of-range PostgreSQL bigint IDs.
  if (!isPositivePostgresBigintText(agencyId)) {
    return await badRequest(event, 'INVALID_ID', 'apiErrors.request.invalid_id')
  }

  const agency = await db
    .selectFrom('Agency_Profile')
    .select('id')
    .where('id', '=', agencyId)
    .where('_deleted', '=', false)
    .executeTakeFirst()
  if (!agency) {
    return await notFound(event, 'AGENCY_NOT_FOUND', 'apiErrors.agency.not_found')
  }

  const body = await readValidatedBodyI18n(event, ExtensionMigrationRunSchema)
  const extension = await requireRegisteredExtension(body.extensionKey).catch(async () =>
    await notFound(event, 'EXTENSION_NOT_FOUND', 'apiErrors.extensions.not_found')
  )
  if (!extension || !('key' in extension)) {
    return extension
  }
  try {
    return await db.transaction().execute(async trx => {
      const authContext = await requireFreshAuthContext(event, trx)
      await lockExtensionLifecycleScope(trx, body.extensionKey, agencyId)
      const currentAgency = await trx
        .selectFrom('Agency_Profile')
        .select('id')
        .where('id', '=', agencyId)
        .where('_deleted', '=', false)
        .forUpdate()
        .executeTakeFirst()
      if (!currentAgency) {
        return await notFound(event, 'AGENCY_NOT_FOUND', 'apiErrors.agency.not_found')
      }
      const enabled = await isExtensionEnabledForAgency(trx, body.extensionKey, agencyId)
      if (!enabled) {
        return await badRequest(event, 'EXTENSION_AGENCY_DISABLED', 'apiErrors.extensions.agency_disabled')
      }
      await authorizeWithFreshAuthContext(event, authContext, 'agency', 'update', scope)

      try {
        const results = await runExtensionMigrations(trx, extension)
        return {
          extensionKey: body.extensionKey,
          results: results.map(serializeMigrationResult)
        }
      } catch {
        throw new ExtensionMigrationFailed('Extension migration execution failed.')
      }
    })
  } catch (error: unknown) {
    if (error instanceof ExtensionMigrationFailed) {
      return await badRequest(event, 'EXTENSION_MIGRATION_FAILED', 'apiErrors.extensions.migration_failed')
    }
    throw error
  }
})
