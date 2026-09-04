/* eslint-disable jsdoc/require-jsdoc -- Provider facade helpers use explicit typed contracts. */
import { nanoid } from 'nanoid'
import type { Kysely, Transaction } from 'kysely'
import {
  GCS_FILE_STORAGE_PROVIDER_OBJECT_ID_MAX_BYTES,
  type GcsFileStorageJsonObject,
  type GcsFileStorageObjectReference,
  type GcsFileStoragePurpose,
  type GcsFileStorageTarget
} from '@gcs-ssc/extensions/server'
import type { Database } from '~~/shared/types/database'
import { createFileStorageSecretReader, loadFileStorageProvider, type LoadedFileStorageProvider } from './extensions'

const MAX_LOCATOR_BYTES = 32 * 1024
const MAX_PROVIDER_METADATA_BYTES = 15 * 1024

const isJsonValue = (value: unknown, ancestors: Set<object> = new Set()): boolean => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'object') return false
  if (ancestors.has(value)) return false
  ancestors.add(value)
  const valid = Array.isArray(value)
    ? value.every(item => isJsonValue(item, ancestors))
    : (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
      && Object.values(value).every(item => isJsonValue(item, ancestors))
  ancestors.delete(value)
  return valid
}

export interface ResolvedAgencyStorageProvider extends LoadedFileStorageProvider {
  agencyId: string
  db: Kysely<Database> | Transaction<Database>
  config: Record<string, import('~~/shared/types/database').JsonValue>
}

const assertJsonObjectBounded = (value: unknown, maxBytes: number, label: string): GcsFileStorageJsonObject => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be a JSON object.`)
  if (!isJsonValue(value)) throw new Error(`${label} must contain only JSON values.`)
  let encoded: string
  try {
    encoded = JSON.stringify(value)
  } catch {
    throw new Error(`${label} must be JSON serializable.`)
  }
  if (Buffer.byteLength(encoded, 'utf8') > maxBytes) throw new Error(`${label} exceeds its size limit.`)
  return value as GcsFileStorageJsonObject
}

export const assertProviderObjectReference = (reference: GcsFileStorageObjectReference): GcsFileStorageObjectReference => {
  if (typeof reference.objectId !== 'string' || reference.objectId.length === 0
    || Buffer.byteLength(reference.objectId, 'utf8') > GCS_FILE_STORAGE_PROVIDER_OBJECT_ID_MAX_BYTES) {
    throw new Error('Provider object identity is invalid.')
  }
  return { objectId: reference.objectId, locator: assertJsonObjectBounded(reference.locator, MAX_LOCATOR_BYTES, 'Provider locator') }
}

export const assertProviderMetadata = (metadata: unknown): GcsFileStorageJsonObject =>
  assertJsonObjectBounded(metadata, MAX_PROVIDER_METADATA_BYTES, 'Provider metadata')

export const namespaceProviderMetadata = (
  providerId: string,
  metadata: GcsFileStorageJsonObject | undefined
): GcsFileStorageJsonObject | null => metadata ? { [providerId]: metadata } : null

export const readNamespacedProviderMetadata = (
  providerId: string,
  metadata: unknown
): GcsFileStorageJsonObject | null => {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const value = (metadata as Record<string, unknown>)[providerId]
  return value && typeof value === 'object' && !Array.isArray(value) ? value as GcsFileStorageJsonObject : null
}

export const resolveAgencyStorageProvider = async (
  db: Kysely<Database> | Transaction<Database>,
  agencyId: string,
  providerId?: string
): Promise<ResolvedAgencyStorageProvider | null> => {
  const selection = providerId
    ? { provider_key: providerId }
    : await db.selectFrom('extensions.agency_storage_selection').select('provider_key')
        .where('agency_id', '=', agencyId).where('_deleted', '=', false).executeTakeFirst()
  if (!selection) return null
  const enablement = await db.selectFrom('extensions.agency_enablement').select('config')
    .where('agency_id', '=', agencyId).where('extension_key', '=', selection.provider_key)
    .where('enabled', '=', true).where('_deleted', '=', false).executeTakeFirst()
  if (!enablement) return null
  const loaded = await loadFileStorageProvider(selection.provider_key)
  if (!loaded) return null
  return {
    ...loaded,
    agencyId,
    db,
    config: enablement.config as ResolvedAgencyStorageProvider['config']
  }
}

const secretsFor = (provider: ResolvedAgencyStorageProvider) => createFileStorageSecretReader(
  provider.db,
  provider.extension.key,
  provider.agencyId,
  process.env.GCS_EXTENSION_SECRETS_KEY ?? ''
)

export const normalizeStorageProviderMetadata = async (
  provider: ResolvedAgencyStorageProvider,
  mode: 'create' | 'update',
  purpose: GcsFileStoragePurpose,
  target: GcsFileStorageTarget | undefined,
  metadata: unknown
): Promise<GcsFileStorageJsonObject | undefined> => {
  const declaration = provider.extension.fileStorageProvider?.metadata
  if (!declaration) {
    if (metadata && Object.keys(assertProviderMetadata(metadata)).length > 0) throw new Error('Provider metadata is not supported.')
    return undefined
  }
  const input = assertProviderMetadata(metadata ?? {})
  const normalized = await provider.metadataValidator?.(input, {
    mode,
    agencyId: provider.agencyId,
    purpose,
    target,
    contractVersion: declaration.contractVersion,
    agencyConfig: provider.config
  }) ?? input
  return assertProviderMetadata(normalized)
}

export const writeProviderObject = async (input: {
  provider: ResolvedAgencyStorageProvider
  objectName?: string
  bytes: Uint8Array
  contentType: string
  purpose: GcsFileStoragePurpose
  target?: GcsFileStorageTarget
  providerMetadata?: GcsFileStorageJsonObject
}): Promise<GcsFileStorageObjectReference> => assertProviderObjectReference(await input.provider.adapter.writeObject({
  objectName: input.objectName ?? nanoid(32),
  bytes: input.bytes,
  contentType: input.contentType,
  agencyId: input.provider.agencyId,
  purpose: input.purpose,
  target: input.target,
  agencyConfig: input.provider.config,
  secrets: secretsFor(input.provider),
  providerMetadata: input.providerMetadata
}))

export const readProviderObject = async (input: {
  provider: ResolvedAgencyStorageProvider
  reference: GcsFileStorageObjectReference
  purpose: GcsFileStoragePurpose
  target?: GcsFileStorageTarget
}) => await input.provider.adapter.readObject({
  ...assertProviderObjectReference(input.reference),
  agencyId: input.provider.agencyId,
  purpose: input.purpose,
  target: input.target,
  agencyConfig: input.provider.config,
  secrets: secretsFor(input.provider)
})

export const deleteProviderObject = async (input: {
  provider: ResolvedAgencyStorageProvider
  reference: GcsFileStorageObjectReference
  purpose: GcsFileStoragePurpose
  target?: GcsFileStorageTarget
}): Promise<void> => await input.provider.adapter.deleteObject({
  ...assertProviderObjectReference(input.reference),
  agencyId: input.provider.agencyId,
  purpose: input.purpose,
  target: input.target,
  agencyConfig: input.provider.config,
  secrets: secretsFor(input.provider)
})
