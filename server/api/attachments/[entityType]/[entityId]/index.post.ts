import { authorizeAttachmentTarget, executeFreshAuthorizedAttachmentWrite } from '~~/server/utils/attachment-target'
import { getAttachmentRouteTarget } from '~~/server/utils/attachment-route'
import { readAttachmentUpload } from '~~/server/utils/attachment-upload'
import {
  deleteProviderObject,
  namespaceProviderMetadata,
  normalizeStorageProviderMetadata,
  resolveAgencyStorageProvider,
  writeProviderObject
} from '~~/server/utils/file-storage-provider'
import { resolveAssignmentCommonUserId } from '~~/server/utils/entity-assignment'
import { enqueueStorageCleanup, storageCleanupLocator } from '~~/server/utils/storage-cleanup-outbox'

export default defineEventHandler(async event => {
  const target = await getAttachmentRouteTarget(event)
  const { resolved } = await authorizeAttachmentTarget(event, target, 'update')
  const upload = await readAttachmentUpload(event)
  const provider = await resolveAgencyStorageProvider(event.context.$db, resolved.agencyId)
  if (!provider) {
    return await throwApiError(event, {
      statusCode: 503, code: 'STORAGE_PROVIDER_UNAVAILABLE', key: 'apiErrors.attachments.provider_unavailable'
    })
  }
  let providerMetadata: Awaited<ReturnType<typeof normalizeStorageProviderMetadata>>
  try {
    providerMetadata = await normalizeStorageProviderMetadata(provider, 'create', 'attachment', target, upload.metadata.providerMetadata)
  } catch {
    return await badRequest(event, 'INVALID_PROVIDER_METADATA', 'apiErrors.attachments.invalid_provider_metadata')
  }
  let reference: Awaited<ReturnType<typeof writeProviderObject>>
  try {
    reference = await writeProviderObject({
      provider,
      bytes: upload.file.bytes,
      contentType: upload.file.contentType,
      purpose: 'attachment',
      target,
      providerMetadata
    })
  } catch {
    return await throwApiError(event, {
      statusCode: 503, code: 'STORAGE_PROVIDER_WRITE_FAILED', key: 'apiErrors.attachments.provider_unavailable'
    })
  }

  try {
    return await executeFreshAuthorizedAttachmentWrite(event, target, 'update', async (trx, auth, freshTarget) => {
      const selection = await trx.selectFrom('extensions.agency_storage_selection as selection')
        .innerJoin('extensions.agency_enablement as enablement', join => join
          .onRef('enablement.agency_id', '=', 'selection.agency_id')
          .onRef('enablement.extension_key', '=', 'selection.provider_key'))
        .select(['selection.provider_key', 'enablement.config'])
        .where('selection.agency_id', '=', freshTarget.agencyId).where('selection._deleted', '=', false)
        .where('enablement.enabled', '=', true).where('enablement._deleted', '=', false)
        .forUpdate().executeTakeFirst()
      const attachmentType = await trx.selectFrom('Common_Attachment_Types').select('id')
        .where('id', '=', upload.metadata.attachmentTypeId).where('egcs_cn_agency', '=', freshTarget.agencyId)
        .where('_deleted', '=', false).forUpdate().executeTakeFirst()
      const commonUserId = await resolveAssignmentCommonUserId(trx, auth.userId)
      if (freshTarget.agencyId !== provider.agencyId
        || selection?.provider_key !== provider.extension.key
        || JSON.stringify(selection.config) !== JSON.stringify(provider.config)) {
        return await throwApiError(event, {
          statusCode: 409, code: 'STORAGE_PROVIDER_CHANGED', key: 'apiErrors.attachments.provider_changed'
        })
      }
      if (!attachmentType) return await badRequest(event, 'ATTACHMENT_TYPE_INVALID', 'apiErrors.attachments.type_invalid')
      if (!commonUserId) return await forbidden(event)
      const metadataDeclaration = provider.extension.fileStorageProvider?.metadata
      const attachment = await trx.insertInto('Common_Attachment').values({
        egcs_cn_attachmenttype: upload.metadata.attachmentTypeId,
        egcs_cn_name_en: upload.metadata.nameEn,
        egcs_cn_name_fr: upload.metadata.nameFr,
        egcs_cn_description_en: upload.metadata.descriptionEn,
        egcs_cn_description_fr: upload.metadata.descriptionFr,
        egcs_cn_filename: upload.file.filename,
        egcs_cn_provider: provider.extension.key,
        egcs_cn_providerobjectid: reference.objectId,
        egcs_cn_providerlocator: reference.locator,
        egcs_cn_providermetadata: metadataDeclaration?.persistence === 'provider'
          ? null
          : namespaceProviderMetadata(provider.extension.key, providerMetadata),
        egcs_cn_metadatapersistence: metadataDeclaration?.persistence ?? null,
        egcs_cn_metadatacontractversion: metadataDeclaration?.contractVersion ?? null,
        egcs_cn_mimetype: upload.file.contentType,
        egcs_cn_createdat: new Date(),
        egcs_cn_filesize: upload.file.bytes.byteLength
      }).returning('id').executeTakeFirstOrThrow()
      const link = await trx.insertInto('Common_Entity_Attachment').values({
        egcs_cn_attachment: String(attachment.id),
        egcs_cn_entityid: target.entityId,
        egcs_cn_entitytype: target.entityType,
        egcs_cn_uploadedby: commonUserId
      }).returningAll().executeTakeFirstOrThrow()
      return { id: String(link.id), success: true }
    })
  } catch (error) {
    try {
      await deleteProviderObject({ provider, reference, purpose: 'attachment', target })
    } catch (cleanupError) {
      try {
        await event.context.$db.transaction().execute(async trx => await enqueueStorageCleanup(trx, {
          provider_key: provider.extension.key,
          agency_id: provider.agencyId,
          purpose: 'attachment',
          object_id: reference.objectId,
          locator: storageCleanupLocator(reference.locator)
        }))
      } catch (outboxError) {
        console.error('Failed to persist attachment orphan cleanup.', {
          providerId: provider.extension.key,
          objectId: reference.objectId,
          error: outboxError
        })
      }
      console.error('Failed to clean up attachment after metadata finalization failure.', {
        providerId: provider.extension.key,
        objectId: reference.objectId,
        error: cleanupError
      })
    }
    throw error
  }
})
