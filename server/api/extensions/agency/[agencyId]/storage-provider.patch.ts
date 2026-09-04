import type { Scope } from '~~/shared/utils/scopes'
import type { GcsExtensionJsonConfig } from '@gcs-ssc/extensions'
import { AgencyStorageProviderSelectionSchema } from '~~/shared/types/schemas'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { authorize, authorizeWithFreshAuthContext, requireFreshAuthContext } from '~~/server/utils/authorize'
import {
  getRegisteredExtensions,
  loadFileStorageProvider,
  lockExtensionLifecycleScope
} from '~~/server/utils/extensions'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { ExtensionAdmissionTimeoutError, runBoundedExtensionOperation } from '~~/server/utils/extension-admission'

export default defineEventHandler(async event => {
  const agencyId = getRouterParam(event, 'agencyId') ?? ''
  const scope: Scope = { type: 'agency', agencyId }
  await authorize(event, 'agency', 'update', scope)
  if (!agencyId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  if (!isPositivePostgresBigintText(agencyId)) {
    return await badRequest(event, 'INVALID_ID', 'apiErrors.request.invalid_id')
  }
  const existingAgency = await event.context.$db.selectFrom('Agency_Profile').select('id')
    .where('id', '=', agencyId).where('_deleted', '=', false).executeTakeFirst()
  if (!existingAgency) return await notFound(event, 'AGENCY_NOT_FOUND', 'apiErrors.agency.not_found')
  const body = await readValidatedBodyI18n(event, AgencyStorageProviderSelectionSchema)
  const extension = (await getRegisteredExtensions()).find(item => item.key === body.providerKey)
  if (!extension?.fileStorageProvider) {
    return await notFound(event, 'STORAGE_PROVIDER_NOT_FOUND', 'apiErrors.attachments.provider_not_found')
  }
  return await event.context.$db.transaction().execute(async trx => {
    const auth = await requireFreshAuthContext(event, trx)
    await lockExtensionLifecycleScope(trx, body.providerKey, agencyId)
    const agency = await trx.selectFrom('Agency_Profile').select('id').where('id', '=', agencyId)
      .where('_deleted', '=', false).forUpdate().executeTakeFirst()
    if (!agency) return await notFound(event, 'AGENCY_NOT_FOUND', 'apiErrors.agency.not_found')
    const enablement = await trx.selectFrom('extensions.agency_enablement').select(['id', 'config'])
      .where('agency_id', '=', agencyId).where('extension_key', '=', body.providerKey)
      .where('enabled', '=', true).where('_deleted', '=', false).forUpdate().executeTakeFirst()
    if (!enablement) {
      return await throwApiError(event, {
        statusCode: 409, code: 'STORAGE_PROVIDER_NOT_ENABLED', key: 'apiErrors.attachments.provider_not_enabled'
      })
    }
    await authorizeWithFreshAuthContext(event, auth, 'agency', 'update', scope)
    let provider: Awaited<ReturnType<typeof loadFileStorageProvider>>
    try {
      provider = await loadFileStorageProvider(body.providerKey)
    } catch (error: unknown) {
      if (error instanceof ExtensionAdmissionTimeoutError) {
        return await throwApiError(event, {
          statusCode: 503, code: 'EXTENSION_OPERATION_TIMEOUT', key: 'apiErrors.extensions.operation_timeout'
        })
      }
      return await throwApiError(event, {
        statusCode: 503,
        code: 'STORAGE_PROVIDER_UNAVAILABLE',
        key: 'apiErrors.attachments.provider_unavailable'
      })
    }
    if (!provider) {
      return await throwApiError(event, {
        statusCode: 503,
        code: 'STORAGE_PROVIDER_UNAVAILABLE',
        key: 'apiErrors.attachments.provider_unavailable'
      })
    }
    try {
      if (!enablement.config || typeof enablement.config !== 'object' || Array.isArray(enablement.config)) {
        throw new Error('Storage provider configuration must be a JSON object.')
      }
      if (provider.adapter.validateAgencyConfig) {
        await runBoundedExtensionOperation('storage:validate-agency-config', async signal => {
          if (signal.aborted) throw signal.reason
          await provider!.adapter.validateAgencyConfig!(enablement.config as GcsExtensionJsonConfig)
        })
      }
    } catch {
      return await throwApiError(event, {
        statusCode: 409,
        code: 'STORAGE_PROVIDER_NOT_CONFIGURED',
        key: 'apiErrors.attachments.provider_not_configured'
      })
    }
    const existing = await trx.selectFrom('extensions.agency_storage_selection').select('id')
      .where('agency_id', '=', agencyId).where('_deleted', '=', false).forUpdate().executeTakeFirst()
    return existing
      ? await trx.updateTable('extensions.agency_storage_selection').set({
          provider_key: body.providerKey,
          updated_at: new Date()
        }).where('id', '=', existing.id).returningAll().executeTakeFirstOrThrow()
      : await trx.insertInto('extensions.agency_storage_selection').values({
          agency_id: agencyId,
          provider_key: body.providerKey
        }).returningAll().executeTakeFirstOrThrow()
  })
})
