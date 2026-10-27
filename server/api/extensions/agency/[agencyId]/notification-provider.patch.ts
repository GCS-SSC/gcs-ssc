import { loadNotificationProvider } from '~~/server/utils/notification-provider'
import { defineEventHandler, getRouterParam } from 'h3'
import type { Scope } from '~~/shared/utils/scopes'
import type { GcsExtensionJsonConfig } from '@gcs-ssc/extensions'
import { AgencyNotificationProviderSelectionSchema } from '~~/shared/types/schemas'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { authorize, authorizeWithFreshAuthContext, requireFreshAuthContext } from '~~/server/utils/authorize'
import {
  getRegisteredExtensions,
  lockExtensionLifecycleScope
} from '~~/server/utils/extensions'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { ExtensionAdmissionTimeoutError, runBoundedExtensionOperation } from '~~/server/utils/extension-admission'

export default defineEventHandler(async event => {
  const agencyId = getRouterParam(event, 'agencyId') ?? ''
  const scope: Scope = { type: 'agency', agencyId }
  await authorize(event, 'agency', 'delete', scope)
  if (!agencyId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  if (!isPositivePostgresBigintText(agencyId)) {
    return await badRequest(event, 'INVALID_ID', 'apiErrors.request.invalid_id')
  }
  const existingAgency = await event.context.$db.selectFrom('Agency_Profile').select('id')
    .where('id', '=', agencyId).where('_deleted', '=', false).executeTakeFirst()
  if (!existingAgency) return await notFound(event, 'AGENCY_NOT_FOUND', 'apiErrors.agency.not_found')
  const body = await readValidatedBodyI18n(event, AgencyNotificationProviderSelectionSchema)
  const extension = (await getRegisteredExtensions()).find(item => item.key === body.providerKey)
  if (!extension?.notificationProvider) {
    return await notFound(event, 'NOTIFICATION_PROVIDER_NOT_FOUND', 'apiErrors.notifications.provider_not_found')
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
        statusCode: 409, code: 'NOTIFICATION_PROVIDER_NOT_ENABLED', key: 'apiErrors.notifications.provider_not_enabled'
      })
    }
    await authorizeWithFreshAuthContext(event, auth, 'agency', 'delete', scope)
    let provider: Awaited<ReturnType<typeof loadNotificationProvider>>
    try {
      provider = await loadNotificationProvider(body.providerKey)
    } catch (error: unknown) {
      if (error instanceof ExtensionAdmissionTimeoutError) {
        return await throwApiError(event, {
          statusCode: 503, code: 'EXTENSION_OPERATION_TIMEOUT', key: 'apiErrors.extensions.operation_timeout'
        })
      }
      return await throwApiError(event, {
        statusCode: 503,
        code: 'NOTIFICATION_PROVIDER_UNAVAILABLE',
        key: 'apiErrors.notifications.provider_unavailable'
      })
    }
    if (!provider) {
      return await throwApiError(event, {
        statusCode: 503,
        code: 'NOTIFICATION_PROVIDER_UNAVAILABLE',
        key: 'apiErrors.notifications.provider_unavailable'
      })
    }
    try {
      if (!enablement.config || typeof enablement.config !== 'object' || Array.isArray(enablement.config)) {
        throw new Error('Notification provider configuration must be a JSON object.')
      }
      const validateAgencyConfig = provider.adapter.validateAgencyConfig
      if (validateAgencyConfig) {
        const config = enablement.config as GcsExtensionJsonConfig
        await runBoundedExtensionOperation('notification:validate-agency-config', async signal => {
          if (signal.aborted) throw signal.reason
          await validateAgencyConfig(config)
        })
      }
    } catch {
      return await throwApiError(event, {
        statusCode: 409,
        code: 'NOTIFICATION_PROVIDER_NOT_CONFIGURED',
        key: 'apiErrors.notifications.provider_not_configured'
      })
    }
    const existing = await trx.selectFrom('extensions.agency_notification_selection').select('id')
      .where('agency_id', '=', agencyId).where('_deleted', '=', false).forUpdate().executeTakeFirst()
    return existing
      ? await trx.updateTable('extensions.agency_notification_selection').set({
          provider_key: body.providerKey,
          updated_at: new Date()
        }).where('id', '=', existing.id).returningAll().executeTakeFirstOrThrow()
      : await trx.insertInto('extensions.agency_notification_selection').values({
          agency_id: agencyId,
          provider_key: body.providerKey
        }).returningAll().executeTakeFirstOrThrow()
  })
})
