/* eslint-disable jsdoc/require-jsdoc -- Notification provider boundary uses explicit public SDK contracts. */
import type { Kysely, Transaction } from 'kysely'
import { getEncryptedExtensionSecret, type GcsNotificationProviderAdapter } from '@gcs-ssc/extensions/server'
import type { GcsExtensionJsonConfig } from '@gcs-ssc/extensions'
import type { GcsRegisteredExtension } from '~~/shared/utils/extensions'
import type { Database } from '~~/shared/types/database'
import { getGcsExtensionByKey, loadGcsExtensionModule } from '#gcs-extensions/server-registry'

export interface LoadedNotificationProvider {
  extension: GcsRegisteredExtension
  adapter: GcsNotificationProviderAdapter
}

export const loadNotificationProvider = async (extensionKey: string): Promise<LoadedNotificationProvider | null> => {
  const extension = getGcsExtensionByKey(extensionKey)
  if (!extension?.notificationProvider) return null
  const loaded = await loadGcsExtensionModule(extension.notificationProvider.adapter.id) as { default?: GcsNotificationProviderAdapter }
  const adapter = loaded.default
  if (!adapter || typeof adapter !== 'object') throw new Error('Notification provider adapter unavailable')
  for (const method of ['resolveMapping', 'prepareDelivery', 'listTemplates', 'getTemplate', 'send'] as const) {
    if (typeof adapter[method] !== 'function') throw new Error(`Notification provider requires ${method}()`)
  }
  if (adapter.recover !== undefined && typeof adapter.recover !== 'function') throw new Error('Invalid notification recovery adapter')
  return { extension, adapter }
}

export const createNotificationSecretReader = (
  db: Kysely<Database> | Transaction<Database>, extensionKey: string, agencyId: string
) => ({
  get: async (secretKey: string) => await getEncryptedExtensionSecret(db, {
    extensionKey, ownerType: 'agency', ownerId: agencyId, secretKey,
    rootKey: process.env.GCS_EXTENSION_SECRETS_KEY ?? ''
  })
})

type NotificationProviderScope = { agencyId: string; streamId: string; providerKey?: string }

export const readStreamNotificationSelection = async (
  db: Kysely<Database> | Transaction<Database>, scope: NotificationProviderScope
) => {
  const { agencyId, streamId, providerKey } = scope
  const selection = await db.selectFrom('extensions.agency_notification_selection').select('provider_key')
    .where('agency_id', '=', agencyId).where('_deleted', '=', false).executeTakeFirst()
  if (!selection || (providerKey !== undefined && selection.provider_key !== providerKey)) return null
  const configuration = await db.selectFrom('Transfer_Payment_Stream as Stream')
    .innerJoin('Transfer_Payment_Profile as Program', 'Program.id', 'Stream.egcs_tp_transferpaymentprofile')
    .innerJoin('Agency_Profile as Agency', 'Agency.id', 'Program.egcs_tp_agency')
    .innerJoin('extensions.agency_enablement as Agency_Config', join => join
      .onRef('Agency_Config.agency_id', '=', 'Agency.id')
      .on('Agency_Config.extension_key', '=', selection.provider_key))
    .innerJoin('extensions.stream_configuration as Stream_Config', join => join
      .onRef('Stream_Config.stream_id', '=', 'Stream.id')
      .on('Stream_Config.extension_key', '=', selection.provider_key))
    .select(['Agency_Config.config as agencyConfig', 'Stream_Config.config as streamConfig'])
    .where('Stream.id', '=', streamId).where('Agency.id', '=', agencyId)
    .where('Stream._deleted', '=', false).where('Program._deleted', '=', false).where('Agency._deleted', '=', false)
    .where('Agency_Config.enabled', '=', true).where('Agency_Config._deleted', '=', false)
    .where('Stream_Config.enabled', '=', true).where('Stream_Config._deleted', '=', false).executeTakeFirst()
  return configuration
    ? {
        providerKey: selection.provider_key,
        agencyConfig: configuration.agencyConfig as GcsExtensionJsonConfig,
        streamConfig: configuration.streamConfig as GcsExtensionJsonConfig
      }
    : null
}

export const resolveStreamNotificationProvider = async (
  db: Kysely<Database> | Transaction<Database>, scope: NotificationProviderScope
) => {
  const selection = await readStreamNotificationSelection(db, scope)
  if (!selection) return null
  const loaded = await loadNotificationProvider(selection.providerKey)
  return loaded
    ? {
        ...loaded, agencyId: scope.agencyId, streamId: scope.streamId,
        agencyConfig: selection.agencyConfig, streamConfig: selection.streamConfig,
        secrets: createNotificationSecretReader(db, loaded.extension.key, scope.agencyId)
      }
    : null
}
