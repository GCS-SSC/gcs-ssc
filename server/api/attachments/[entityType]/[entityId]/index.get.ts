import { sql } from 'kysely'
import { AttachmentListQuerySchema } from '~~/shared/types/schemas'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { authorizeAttachmentTarget } from '~~/server/utils/attachment-target'
import { getAttachmentRouteTarget } from '~~/server/utils/attachment-route'
import { resolveAssignedItemTargetGrant } from '~~/server/utils/rbac'
import { isEntityAssignmentRosterWorkable } from '~~/server/utils/entity-assignment'
import { createFileStorageSecretReader, getRegisteredExtensions } from '~~/server/utils/extensions'
import { readNamespacedProviderMetadata, resolveAgencyStorageProvider } from '~~/server/utils/file-storage-provider'
import type { GcsFileStorageProviderManagedMetadataAdapter } from '@gcs-ssc/extensions/server'
import { escapeLikePattern } from '~~/server/utils/sql-like'

export default defineEventHandler(async event => {
  const target = await getAttachmentRouteTarget(event)
  const query = await getValidatedQueryI18n(event, AttachmentListQuerySchema)
  const { auth, resolved } = await authorizeAttachmentTarget(event, target, 'read')
  const db = event.context.$db
  const offset = (query.page - 1) * query.limit
  let base = db.selectFrom('Common_Entity_Attachment')
    .innerJoin('Common_Attachment', 'Common_Attachment.id', 'Common_Entity_Attachment.egcs_cn_attachment')
    .innerJoin('Common_Attachment_Types', 'Common_Attachment_Types.id', 'Common_Attachment.egcs_cn_attachmenttype')
    .innerJoin('Common_User', 'Common_User.id', 'Common_Entity_Attachment.egcs_cn_uploadedby')
    .innerJoin('user', 'user.id', 'Common_User.egcs_cn_auth_user_id')
    .where('Common_Entity_Attachment.egcs_cn_entitytype', '=', target.entityType)
    .where('Common_Entity_Attachment.egcs_cn_entityid', '=', target.entityId)
    .where('Common_Entity_Attachment._deleted', '=', false)
    .where('Common_Attachment._deleted', '=', false)
  if (query.attachmentTypeId) base = base.where('Common_Attachment.egcs_cn_attachmenttype', '=', query.attachmentTypeId)
  if (query.search) {
    const search = `%${escapeLikePattern(query.search)}%`
    base = base.where(eb => eb.or([
      eb('Common_Attachment.egcs_cn_name_en', 'ilike', search),
      eb('Common_Attachment.egcs_cn_name_fr', 'ilike', search),
      eb('Common_Attachment.egcs_cn_description_en', 'ilike', search),
      eb('Common_Attachment.egcs_cn_description_fr', 'ilike', search)
    ]))
  }
  const [items, count] = await Promise.all([
    base.select([
      'Common_Entity_Attachment.id',
      'Common_Entity_Attachment.egcs_cn_attachment as attachment_id',
      'Common_Entity_Attachment.egcs_cn_createdat as uploaded_at',
      'Common_Entity_Attachment.egcs_cn_updatedat as updated_at',
      'Common_Attachment.egcs_cn_attachmenttype as attachment_type_id',
      'Common_Attachment.egcs_cn_name_en as name_en',
      'Common_Attachment.egcs_cn_name_fr as name_fr',
      'Common_Attachment.egcs_cn_description_en as description_en',
      'Common_Attachment.egcs_cn_description_fr as description_fr',
      'Common_Attachment.egcs_cn_filename as filename',
      'Common_Attachment.egcs_cn_mimetype as mime_type',
      'Common_Attachment.egcs_cn_filesize as file_size',
      'Common_Attachment.egcs_cn_provider as provider_id',
      'Common_Attachment.egcs_cn_providerobjectid as provider_object_id',
      'Common_Attachment.egcs_cn_providerlocator as provider_locator',
      'Common_Attachment.egcs_cn_providermetadata as provider_metadata',
      'Common_Attachment.egcs_cn_metadatapersistence as metadata_persistence',
      'Common_Attachment.egcs_cn_metadatacontractversion as metadata_contract_version',
      'Common_Attachment_Types.egcs_cn_name_en as attachment_type_name_en',
      'Common_Attachment_Types.egcs_cn_name_fr as attachment_type_name_fr',
      'user.name as uploaded_by_name'
    ])
      .orderBy('Common_Entity_Attachment.egcs_cn_createdat', 'desc')
      .orderBy('Common_Entity_Attachment.id', 'desc')
      .limit(query.limit).offset(offset).execute(),
    base.clearSelect().select(sql<number>`count(*)::int`.as('count')).executeTakeFirstOrThrow()
  ])

  const scope = resolved.agreementContext?.scope ?? { type: 'agency' as const, agencyId: resolved.agencyId }
  const subject = target.entityType === 'applicantrecipient' ? 'applicant_recipient' : 'agreement'
  const [grant, targetWorkable] = await Promise.all([
    resolveAssignedItemTargetGrant(auth.userId, target, db),
    isEntityAssignmentRosterWorkable(db, target.entityType, target.entityId)
  ])
  const canUpdate = targetWorkable && auth.userAbilities.authorize(subject, 'update', scope)
    && grant?.actions.has('update') === true
  const canDelete = targetWorkable && auth.userAbilities.authorize(subject, 'delete', scope)
    && grant?.actions.has('delete') === true
  const registered = await getRegisteredExtensions()
  const providers = new Map(registered.filter(item => item.fileStorageProvider).map(item => [item.key, item]))
  const uploadProvider = await resolveAgencyStorageProvider(db, resolved.agencyId)
  const recordedProviderResolutions = new Map<string, ReturnType<typeof resolveAgencyStorageProvider>>()
  /**
   * Reuses one provider/config resolution for every attachment recorded under the same provider.
   *
   * @param providerId - Permanent extension key recorded on the attachment.
   * @returns The shared asynchronous provider resolution.
   */
  const resolveRecordedProvider = (providerId: string): ReturnType<typeof resolveAgencyStorageProvider> => {
    const existingResolution = recordedProviderResolutions.get(providerId)
    if (existingResolution) return existingResolution
    const resolution = resolveAgencyStorageProvider(db, resolved.agencyId, providerId)
    recordedProviderResolutions.set(providerId, resolution)
    return resolution
  }
  const decoratedItems = await Promise.all(items.map(async item => {
    const declaration = providers.get(item.provider_id)?.fileStorageProvider?.metadata
    const compatibleDeclaration = declaration?.contractVersion === item.metadata_contract_version ? declaration : null
    let providerMetadata = readNamespacedProviderMetadata(item.provider_id, item.provider_metadata)
    if (item.metadata_persistence === 'provider' && compatibleDeclaration?.persistence === 'provider') {
      const provider = await resolveRecordedProvider(item.provider_id)
      if (!provider) return await throwApiError(event, {
        statusCode: 503,
        code: 'STORAGE_PROVIDER_UNAVAILABLE',
        key: 'apiErrors.attachments.provider_unavailable'
      })
      try {
        providerMetadata = await (provider.adapter as GcsFileStorageProviderManagedMetadataAdapter).readProviderMetadata({
          objectId: item.provider_object_id,
          locator: item.provider_locator as Record<string, never>,
          agencyId: resolved.agencyId,
          purpose: 'attachment',
          target,
          agencyConfig: provider.config,
          secrets: createFileStorageSecretReader(db, item.provider_id, resolved.agencyId, process.env.GCS_EXTENSION_SECRETS_KEY ?? ''),
          contractVersion: compatibleDeclaration.contractVersion
        })
      } catch {
        return await throwApiError(event, {
          statusCode: 503,
          code: 'STORAGE_PROVIDER_METADATA_READ_FAILED',
          key: 'apiErrors.attachments.provider_unavailable'
        })
      }
    }
    const { provider_object_id: _objectId, provider_locator: _locator, ...publicItem } = item
    return {
      ...publicItem,
      provider_metadata: providerMetadata,
      provider_metadata_component_name: compatibleDeclaration?.component.componentName ?? null,
      provider_metadata_mutability: compatibleDeclaration?.mutability ?? null,
      can_update: canUpdate,
      can_delete: canDelete
    }
  }))
  return {
    items: decoratedItems,
    total: Number(count.count),
    stats: { total: Number(count.count), page: query.page, limit: query.limit },
    can_upload: canUpdate && uploadProvider !== null,
    agency_id: resolved.agencyId,
    provider_metadata: uploadProvider?.extension.fileStorageProvider?.metadata
      ? {
          componentName: uploadProvider.extension.fileStorageProvider.metadata.component.componentName,
          mutability: uploadProvider.extension.fileStorageProvider.metadata.mutability,
          value: {}
        }
      : null
  }
})
