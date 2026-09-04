import { getRouterParam } from 'h3'
import { nanoid } from 'nanoid'
import type {
  GcsFileStorageJsonObject,
  GcsFileStorageProviderManagedMetadataAdapter,
  GcsFileStorageProviderMetadataContext
} from '@gcs-ssc/extensions/server'
import { AttachmentPatchSchema } from '~~/shared/types/schemas'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { executeFreshAuthorizedAttachmentWrite } from '~~/server/utils/attachment-target'
import { getAttachmentRouteTarget } from '~~/server/utils/attachment-route'
import { loadTargetAttachment } from '~~/server/utils/attachment-record'
import { namespaceProviderMetadata, normalizeStorageProviderMetadata, resolveAgencyStorageProvider } from '~~/server/utils/file-storage-provider'
import { createFileStorageSecretReader } from '~~/server/utils/extensions'
import { runBoundedExtensionOperation } from '~~/server/utils/extension-admission'
import {
  completeReservedStorageCleanup,
  releaseReservedStorageCleanup,
  reserveStorageMetadataRestoration,
  storageCleanupLocator
} from '~~/server/utils/storage-cleanup-outbox'

export default defineEventHandler(async event => {
  const target = await getAttachmentRouteTarget(event)
  const linkId = getRouterParam(event, 'attachmentId')
  if (!linkId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  const body = await readValidatedBodyI18n(event, AttachmentPatchSchema)
  const sagaWorkerId = `request:${nanoid()}`
  let restorationId: string | null = null
  try {
    const result = await executeFreshAuthorizedAttachmentWrite(event, target, 'update', async (trx, _auth, resolved) => {
      const attachment = await loadTargetAttachment(trx, target, linkId, true)
      if (!attachment) return await notFound(event, 'ATTACHMENT_NOT_FOUND', 'apiErrors.attachments.not_found')
      const effectiveAttachmentTypeId = body.attachmentTypeId ?? String(attachment.attachment_type_id)
      {
        const type = await trx.selectFrom('Common_Attachment_Types').select('id')
          .where('id', '=', effectiveAttachmentTypeId).where('egcs_cn_agency', '=', resolved.agencyId)
          .where('_deleted', '=', false).forUpdate().executeTakeFirst()
        if (!type) return await badRequest(event, 'ATTACHMENT_TYPE_INVALID', 'apiErrors.attachments.type_invalid')
      }
      let metadata: GcsFileStorageJsonObject | null = null
      let providerUpdate: null | {
        provider: Awaited<ReturnType<typeof resolveAgencyStorageProvider>> & {}
        contractVersion: number
      } = null
      if (body.providerMetadata !== undefined) {
        const provider = await resolveAgencyStorageProvider(trx, resolved.agencyId, attachment.provider_id)
        if (!provider) return await throwApiError(event, {
          statusCode: 503, code: 'STORAGE_PROVIDER_UNAVAILABLE', key: 'apiErrors.attachments.provider_unavailable'
        })
        const declaration = provider.extension.fileStorageProvider?.metadata
        if (!declaration || declaration.mutability !== 'editable'
          || declaration.contractVersion !== attachment.metadata_contract_version) {
          return await badRequest(event, 'PROVIDER_METADATA_NOT_EDITABLE', 'apiErrors.attachments.provider_metadata_not_editable')
        }
        try {
          metadata = await normalizeStorageProviderMetadata(provider, 'update', 'attachment', target, body.providerMetadata) ?? null
        } catch {
          return await badRequest(event, 'INVALID_PROVIDER_METADATA', 'apiErrors.attachments.invalid_provider_metadata')
        }
        if (declaration.persistence === 'provider') {
          providerUpdate = { provider, contractVersion: declaration.contractVersion }
        }
      }
      const hasHostFieldUpdate = body.attachmentTypeId !== undefined
        || body.nameEn !== undefined
        || body.nameFr !== undefined
        || body.descriptionEn !== undefined
        || body.descriptionFr !== undefined
      if (providerUpdate && hasHostFieldUpdate) {
        return await badRequest(
          event,
          'MIXED_PROVIDER_METADATA_UPDATE_NOT_ALLOWED',
          'apiErrors.attachments.mixed_provider_metadata_update_not_allowed'
        )
      }
      const hostValues = {
        ...(body.attachmentTypeId !== undefined ? { egcs_cn_attachmenttype: body.attachmentTypeId } : {}),
        ...(body.nameEn !== undefined ? { egcs_cn_name_en: body.nameEn } : {}),
        ...(body.nameFr !== undefined ? { egcs_cn_name_fr: body.nameFr } : {}),
        ...(body.descriptionEn !== undefined ? { egcs_cn_description_en: body.descriptionEn } : {}),
        ...(body.descriptionFr !== undefined ? { egcs_cn_description_fr: body.descriptionFr } : {}),
        ...(body.providerMetadata !== undefined && !providerUpdate
          ? { egcs_cn_providermetadata: namespaceProviderMetadata(attachment.provider_id, metadata ?? undefined) }
          : {})
      }
      const updatedId = Object.keys(hostValues).length > 0
        ? String((await trx.updateTable('Common_Attachment').set(hostValues)
            .where('id', '=', attachment.attachment_id).returning('id').executeTakeFirstOrThrow()).id)
        : String(attachment.attachment_id)
      if (!providerUpdate) {
        await trx.updateTable('Common_Entity_Attachment').set({ egcs_cn_updatedat: new Date() }).where('id', '=', linkId).execute()
      } else {
        try {
          const adapter = providerUpdate.provider.adapter as GcsFileStorageProviderManagedMetadataAdapter
          const operationContext: GcsFileStorageProviderMetadataContext = {
            objectId: attachment.provider_object_id,
            locator: attachment.provider_locator as Record<string, never>,
            agencyId: resolved.agencyId,
            purpose: 'attachment',
            target,
            agencyConfig: providerUpdate.provider.config,
            secrets: createFileStorageSecretReader(
              trx, providerUpdate.provider.extension.key, resolved.agencyId, process.env.GCS_EXTENSION_SECRETS_KEY ?? ''
            ),
            contractVersion: providerUpdate.contractVersion
          }
          const previousMetadata = await runBoundedExtensionOperation(
            'storage:read-provider-metadata', async signal => {
              if (signal.aborted) throw signal.reason
              return await adapter.readProviderMetadata(operationContext)
            })
          restorationId = await reserveStorageMetadataRestoration(
            event.context.$db, sagaWorkerId,
            {
              provider_key: providerUpdate.provider.extension.key,
              agency_id: resolved.agencyId,
              purpose: 'attachment', object_id: attachment.provider_object_id,
              locator: storageCleanupLocator(attachment.provider_locator)
            },
            storageCleanupLocator({ metadata: previousMetadata, target, contractVersion: providerUpdate.contractVersion })
          )
          await runBoundedExtensionOperation('storage:update-provider-metadata', async signal => {
            if (signal.aborted) throw signal.reason
            await adapter.updateProviderMetadata({ ...operationContext, metadata: metadata ?? {} })
          })
          await completeReservedStorageCleanup(trx, restorationId, sagaWorkerId)
        } catch {
          return await throwApiError(event, {
            statusCode: 503,
            code: 'STORAGE_PROVIDER_METADATA_UPDATE_FAILED',
            key: 'apiErrors.attachments.provider_unavailable'
          })
        }
      }
      return { id: updatedId, success: true }
    })
    return result
  } catch (error: unknown) {
    if (restorationId) await releaseReservedStorageCleanup(event.context.$db, restorationId, sagaWorkerId)
    throw error
  }
})
