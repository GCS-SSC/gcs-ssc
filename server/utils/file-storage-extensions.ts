import type { Kysely, Transaction } from 'kysely'
import {
  getEncryptedExtensionSecret,
  type GcsFileStorageMetadataValidator,
  type GcsFileStorageProviderAdapter,
  type GcsFileStorageProviderManagedMetadataAdapter,
  type GcsFileStorageSecretReader
} from '@gcs-ssc/extensions/server'
import type { GcsRegisteredExtension } from '~~/shared/utils/extensions'
import type { Database } from '~~/shared/types/database'
import { getGcsExtensionByKey, loadGcsExtensionModule } from '#gcs-extensions/server-registry'

type FileStorageAdapterModule = { default?: GcsFileStorageProviderAdapter }
type FileStorageMetadataValidatorModule = { default?: GcsFileStorageMetadataValidator }

export interface LoadedFileStorageProvider {
  extension: GcsRegisteredExtension
  adapter: GcsFileStorageProviderAdapter
  metadataValidator?: GcsFileStorageMetadataValidator
}

const FILE_STORAGE_ADAPTER_METHODS = ['writeObject', 'readObject', 'deleteObject'] as const

/**
 * Loads and validates a registered provider's server-only modules.
 * @param extensionKey - Registered provider extension key.
 * @returns Loaded provider, or null when the extension has no storage contribution.
 */
export const loadFileStorageProvider = async (
  extensionKey: string
): Promise<LoadedFileStorageProvider | null> => {
  const extension = getGcsExtensionByKey(extensionKey)
  const contribution = extension?.fileStorageProvider
  if (!extension || !contribution) return null
  const loaded = await loadGcsExtensionModule(contribution.adapter.id) as FileStorageAdapterModule
  const adapter = loaded.default
  if (!adapter || typeof adapter !== 'object') {
    throw new Error(`File storage adapter for "${extensionKey}" is unavailable`)
  }
  for (const method of FILE_STORAGE_ADAPTER_METHODS) {
    if (typeof adapter[method] !== 'function') {
      throw new Error(`File storage adapter for "${extensionKey}" must export ${method}()`)
    }
  }
  const metadata = contribution.metadata
  if (metadata?.persistence === 'provider' && metadata.mutability === 'editable') {
    const editableAdapter = adapter as Partial<GcsFileStorageProviderManagedMetadataAdapter>
    if (typeof editableAdapter.readProviderMetadata !== 'function' || typeof editableAdapter.updateProviderMetadata !== 'function') {
      throw new Error(
        `File storage adapter for "${extensionKey}" requires readProviderMetadata() and updateProviderMetadata()`
      )
    }
  }
  let metadataValidator: GcsFileStorageMetadataValidator | undefined
  if (metadata) {
    const validatorModule = await loadGcsExtensionModule(metadata.validator.id) as FileStorageMetadataValidatorModule
    if (typeof validatorModule.default !== 'function') {
      throw new Error(`File storage metadata validator for "${extensionKey}" is unavailable`)
    }
    metadataValidator = validatorModule.default
  }
  return { extension, adapter, metadataValidator }
}

/**
 * Creates a server-only encrypted secret reader scoped to one provider and agency.
 * @param db - Existing business database or transaction.
 * @param extensionKey - Registered provider extension key.
 * @param agencyId - Verified owning agency.
 * @param rootKey - Runtime encryption key.
 * @returns Reader limited to the provider's agency secrets.
 */
export const createFileStorageSecretReader = (
  db: Kysely<Database> | Transaction<Database>,
  extensionKey: string,
  agencyId: string,
  rootKey: string
): GcsFileStorageSecretReader => ({
  /**
   * @param key - Provider-owned secret key.
   * @returns Decrypted provider secret when configured.
   */
  get: async key => await getEncryptedExtensionSecret(db, {
    extensionKey,
    ownerType: 'agency',
    ownerId: agencyId,
    secretKey: key,
    rootKey
  })
})
