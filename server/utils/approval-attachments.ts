/* eslint-disable jsdoc/require-jsdoc -- Approval attachment operations have explicit request contracts. */
import { create as contentDisposition } from 'content-disposition'
import { getRouterParam, setResponseHeader, type H3Event } from 'h3'
import type { Kysely, Transaction } from 'kysely'
import { RUNTIME_TERMINAL_STATES } from '~~/shared/constants/system-lifecycle'
import type { Database } from '~~/shared/types/database'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { resolveCurrentCommonUser } from './additional-reviewer-runtime'
import { badRequest, forbidden, notFound, throwApiError } from './api-errors'
import { resolveApprovalRuntimeAgencyProjection } from './approval-runtime'
import { readApprovalAttachmentUpload } from './attachment-upload'
import { withAuditCreationOwner } from './audit-context'
import { fetchCanonicalRoutingSlips } from './canonical-approval-runtime'
import { setAppUserDbSession } from './db-session'
import {
  deleteProviderObject,
  namespaceProviderMetadata,
  normalizeStorageProviderMetadata,
  readProviderObject,
  resolveAgencyStorageProvider,
  writeProviderObject
} from './file-storage-provider'
import { executeFreshReadSnapshot } from './fresh-read-snapshot'
import { resolveApprovalActionContext } from './review-approval-runtime'
import {
  authorizeReviewRuntimeAction,
  canAuthorizeWorkflowOwnerRead,
  executeFreshAuthorizedApprovalActorWrite,
  getReviewRuntimeOwnerAgencyId,
  resolveReviewRuntimeEntityFromRecommendation
} from './review-runtime-access'
import { enqueueStorageCleanup, storageCleanupLocator } from './storage-cleanup-outbox'

export const requireApprovalAttachmentId = async (event: H3Event, param: 'approvalId' | 'attachmentId') => {
  const id = getRouterParam(event, param) ?? ''
  if (isPositivePostgresBigintText(id)) return id
  return param === 'approvalId' ? await approvalNotFound(event) : await attachmentNotFound(event)
}

const approvalNotFound = async (event: H3Event) => await notFound(event, 'APPROVAL_NOT_FOUND', 'apiErrors.admin_common.not_found')
const attachmentNotFound = async (event: H3Event) => await notFound(event, 'ATTACHMENT_NOT_FOUND', 'apiErrors.attachments.not_found')
const invalidType = async (event: H3Event) => await badRequest(event, 'ATTACHMENT_TYPE_INVALID', 'apiErrors.attachments.type_invalid')
const invalidStatus = async (event: H3Event) => await badRequest(event, 'REVIEW_APPROVAL_INVALID_STATUS', 'apiErrors.request.invalid_status')
const storageUnavailable = async (
  event: H3Event,
  code: 'STORAGE_PROVIDER_UNAVAILABLE' | 'STORAGE_PROVIDER_WRITE_FAILED' | 'STORAGE_PROVIDER_READ_FAILED'
) => await throwApiError(event, { statusCode: 503, code, key: 'apiErrors.attachments.provider_unavailable' })

const loadApproval = async (db: Kysely<Database>, approvalId: string, lock = false) => await db
  .selectFrom('Common_Approval')
  .innerJoin('Common_Runtime_Item as Approval_Item', 'Approval_Item.id', 'Common_Approval.egcs_cn_runtimeitem')
  .innerJoin('Common_Routing_Slip', 'Common_Routing_Slip.id', 'Common_Approval.egcs_cn_routingslip')
  .innerJoin('Common_Runtime_Item as Routing_Item', 'Routing_Item.id', 'Common_Routing_Slip.egcs_cn_runtimeitem')
  .innerJoin('Common_Runtime', 'Common_Runtime.id', 'Routing_Item.egcs_cn_runtime')
  .select([
    'Common_Approval.egcs_cn_assigneduser as assignedUserId',
    'Common_Approval.egcs_cn_assignedgroup as assignedGroupId',
    'Common_Approval.egcs_cn_defaultuser as defaultUserId',
    'Common_Approval.egcs_cn_approvalvalue as decision',
    'Common_Approval.egcs_cn_allowattachments as allowAttachments',
    'Common_Approval.egcs_cn_attachmenttypeids as attachmentTypeIds',
    'Common_Approval.egcs_cn_attachmentrevision as revision',
    'Common_Routing_Slip.id as slipId',
    'Common_Routing_Slip.egcs_cn_entitytype as entityType',
    'Common_Routing_Slip.egcs_cn_entityid as entityId',
    'Approval_Item.egcs_cn_state as stepState',
    'Routing_Item.egcs_cn_state as slipState',
    'Common_Runtime.egcs_cn_state as runtimeState'
  ])
  .where('Common_Approval.id', '=', approvalId)
  .where('Common_Routing_Slip._deleted', '=', false)
  .where('Approval_Item._deleted', '=', false)
  .where('Routing_Item._deleted', '=', false)
  .where('Common_Runtime._deleted', '=', false)
  .$if(lock, query => query.forUpdate(['Common_Runtime', 'Routing_Item', 'Approval_Item', 'Common_Approval']))
  .executeTakeFirst()

type Approval = NonNullable<Awaited<ReturnType<typeof loadApproval>>>

const isAssigned = (approval: Approval, actorId: string | undefined) => actorId !== undefined
  && (String(approval.assignedUserId) === actorId
    || (approval.assignedUserId == null && approval.assignedGroupId == null && String(approval.defaultUserId) === actorId))

const isDraftWritable = (approval: Approval) => approval.allowAttachments
  && approval.decision == null
  && approval.stepState === 'awaiting_action'
  && approval.slipState === 'awaiting_action'
  && !RUNTIME_TERMINAL_STATES.has(approval.runtimeState)

const resolveContext = async (event: H3Event, approvalId: string) => {
  const found = await resolveApprovalActionContext(event.context.$db, approvalId)
  if (!found) return await approvalNotFound(event)
  const runtimeEntity = found.runtimeEntity.entityType === 'applicantrecipient' && found.recommendationId
    ? await resolveReviewRuntimeEntityFromRecommendation(event.context.$db, found.recommendationId)
    : found.runtimeEntity
  if (!runtimeEntity) return await approvalNotFound(event)
  const context = await resolveApprovalRuntimeAgencyProjection(event, runtimeEntity)
  const agencyId = context && getReviewRuntimeOwnerAgencyId(context)
  if (!agencyId || !context) return await forbidden(event)
  return { context, agencyId }
}

export const authorizeApprovalAttachmentRead = async (event: H3Event, approvalId: string) => {
  const db = event.context.$db
  const { context, agencyId } = await resolveContext(event, approvalId)
  const approval = await loadApproval(db, approvalId)
  if (!approval) return await approvalNotFound(event)
  const actorId = (await resolveCurrentCommonUser(event))?.id
  const canUpload = isAssigned(approval, actorId) && isDraftWritable(approval)
  if (canUpload) {
    await authorizeReviewRuntimeAction(event, 'action_review_approval', context)
  } else {
    await authorizeReviewRuntimeAction(event, 'read_review_approval', context)
    if (!await canAuthorizeWorkflowOwnerRead(event, context)) {
      const visibleSlips = await fetchCanonicalRoutingSlips(db, approval.entityType, String(approval.entityId), {
        assignedCommonUserId: actorId ?? null
      })
      if (!visibleSlips.some(slip => String(slip.id) === String(approval.slipId))) return await forbidden(event)
    }
  }
  return { approval, actorId, agencyId, canUpload }
}

const attachmentQuery = (db: Kysely<Database>, approvalId: string, agencyId: string) => db
  .selectFrom('Common_Approval_Attachment as link')
  .innerJoin('Common_Attachment as file', 'file.id', 'link.egcs_cn_attachment')
  .innerJoin('Common_Attachment_Types as type', 'type.id', 'file.egcs_cn_attachmenttype')
  .where('link.egcs_cn_approval', '=', approvalId)
  .where('link._deleted', '=', false)
  .where('file._deleted', '=', false)
  .where('type.egcs_cn_agency', '=', agencyId)

const attachmentTypeQuery = (db: Kysely<Database>, agencyId: string) => db.selectFrom('Common_Attachment_Types')
  .select(['id', 'egcs_cn_name_en as nameEn', 'egcs_cn_name_fr as nameFr'])
  .where('egcs_cn_agency', '=', agencyId)
  .where('_deleted', '=', false)

export const listApprovalAttachments = async (event: H3Event, approvalId: string) => await executeFreshReadSnapshot(
  event,
  async trx => {
    const { approval, actorId, agencyId, canUpload } = await authorizeApprovalAttachmentRead(event, approvalId)
    const query = attachmentQuery(trx, approvalId, agencyId).select([
      'link.id', 'file.egcs_cn_filename as filename', 'file.egcs_cn_attachmenttype as attachmentTypeId',
      'link.egcs_cn_typename_en as typeNameEn', 'link.egcs_cn_typename_fr as typeNameFr', 'file.egcs_cn_filesize as size'
    ]).orderBy('link.id')
    const items = approval.decision != null
      ? await query.where('link.egcs_cn_submitted', '=', true).execute()
      : canUpload && actorId
        ? await query.where('link.egcs_cn_submitted', '=', false).where('link.egcs_cn_uploadedby', '=', actorId).execute()
        : []
    const types = canUpload && approval.attachmentTypeIds.length
      ? await attachmentTypeQuery(trx, agencyId).where('id', 'in', approval.attachmentTypeIds).orderBy('id').execute()
      : []
    return {
      items: items.map(item => ({ ...item, id: String(item.id), attachmentTypeId: String(item.attachmentTypeId), size: String(item.size) })),
      types: types.map(type => ({ ...type, id: String(type.id) })),
      canUpload
    }
  },
  { authorization: 'snapshot' }
)

const requireWritableApproval = async (event: H3Event, db: Kysely<Database>, approvalId: string, lock = false) => {
  const approval = await loadApproval(db, approvalId, lock)
  if (!approval) return await approvalNotFound(event)
  const actorId = (await resolveCurrentCommonUser(event, db))?.id
  if (!actorId || !isAssigned(approval, actorId)) return await forbidden(event)
  if (!isDraftWritable(approval)) return await invalidStatus(event)
  return { approval, actorId }
}

const providerTarget = (approval: Approval) => ({ entityType: approval.entityType, entityId: String(approval.entityId) })

const loadProviderSelection = async (trx: Transaction<Database>, agencyId: string) => await trx
  .selectFrom('extensions.agency_storage_selection as selection')
  .innerJoin('extensions.agency_enablement as enablement', join => join
    .onRef('enablement.agency_id', '=', 'selection.agency_id')
    .onRef('enablement.extension_key', '=', 'selection.provider_key'))
  .select(['selection.provider_key', 'enablement.config'])
  .where('selection.agency_id', '=', agencyId)
  .where('selection._deleted', '=', false)
  .where('enablement.enabled', '=', true)
  .where('enablement._deleted', '=', false)
  .forUpdate().executeTakeFirst()

export const addApprovalAttachment = async (event: H3Event, approvalId: string) => {
  const db = event.context.$db
  const { context, agencyId } = await resolveContext(event, approvalId)
  await authorizeReviewRuntimeAction(event, 'action_review_approval', context)
  const initial = await requireWritableApproval(event, db, approvalId)
  const upload = await readApprovalAttachmentUpload(event)
  const typeQuery = (repository: Kysely<Database>) => attachmentTypeQuery(repository, agencyId)
    .where('id', '=', upload.attachmentTypeId)
  if (!initial.approval.attachmentTypeIds.includes(upload.attachmentTypeId)
    || !await typeQuery(db).executeTakeFirst()) return await invalidType(event)

  const provider = await resolveAgencyStorageProvider(db, agencyId)
  if (!provider) return await storageUnavailable(event, 'STORAGE_PROVIDER_UNAVAILABLE')
  const target = providerTarget(initial.approval)
  let metadata: Awaited<ReturnType<typeof normalizeStorageProviderMetadata>>
  try {
    metadata = await normalizeStorageProviderMetadata(provider, 'create', 'attachment', target, undefined)
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
      providerMetadata: metadata
    })
  } catch {
    return await storageUnavailable(event, 'STORAGE_PROVIDER_WRITE_FAILED')
  }

  try {
    return await executeFreshAuthorizedApprovalActorWrite(event, context, async (trx, current) => {
      const fresh = await requireWritableApproval(event, trx, approvalId, true)
      if (getReviewRuntimeOwnerAgencyId(current) !== agencyId || fresh.actorId !== initial.actorId
        || fresh.approval.revision !== initial.approval.revision) return await invalidStatus(event)
      const selection = await loadProviderSelection(trx, agencyId)
      if (selection?.provider_key !== provider.extension.key || JSON.stringify(selection.config) !== JSON.stringify(provider.config)) {
        return await throwApiError(event, { statusCode: 409, code: 'STORAGE_PROVIDER_CHANGED', key: 'apiErrors.attachments.provider_changed' })
      }
      const attachmentType = await typeQuery(trx).forUpdate().executeTakeFirst()
      if (!attachmentType || !fresh.approval.attachmentTypeIds.includes(upload.attachmentTypeId)) return await invalidType(event)
      const declaration = provider.extension.fileStorageProvider?.metadata
      await setAppUserDbSession(trx, fresh.actorId)
      const file = await withAuditCreationOwner('public.Common_Attachment',
        { egcs_cn_provider: provider.extension.key, egcs_cn_providerobjectid: reference.objectId }, target, async () =>
          await trx.insertInto('Common_Attachment').values({
            egcs_cn_attachmenttype: upload.attachmentTypeId,
            egcs_cn_name_en: upload.file.filename,
            egcs_cn_name_fr: upload.file.filename,
            egcs_cn_description_en: '',
            egcs_cn_description_fr: '',
            egcs_cn_filename: upload.file.filename,
            egcs_cn_provider: provider.extension.key,
            egcs_cn_providerobjectid: reference.objectId,
            egcs_cn_providerlocator: reference.locator,
            egcs_cn_providermetadata: declaration?.persistence === 'provider'
              ? null
              : namespaceProviderMetadata(provider.extension.key, metadata),
            egcs_cn_metadatapersistence: declaration?.persistence ?? null,
            egcs_cn_metadatacontractversion: declaration?.contractVersion ?? null,
            egcs_cn_mimetype: upload.file.contentType,
            egcs_cn_createdat: new Date(),
            egcs_cn_filesize: upload.file.bytes.byteLength
          }).returning('id').executeTakeFirstOrThrow())
      const link = await trx.insertInto('Common_Approval_Attachment').values({
        egcs_cn_approval: approvalId,
        egcs_cn_attachment: String(file.id),
        egcs_cn_uploadedby: fresh.actorId,
        egcs_cn_typename_en: attachmentType.nameEn,
        egcs_cn_typename_fr: attachmentType.nameFr
      }).returning('id').executeTakeFirstOrThrow()
      return { id: String(link.id), success: true }
    })
  } catch (error) {
    try {
      await deleteProviderObject({ provider, reference, purpose: 'attachment', target })
    } catch {
      try {
        await db.transaction().execute(async trx => await enqueueStorageCleanup(trx, {
          provider_key: provider.extension.key,
          agency_id: agencyId,
          purpose: 'attachment',
          object_id: reference.objectId,
          locator: storageCleanupLocator(reference.locator)
        }))
      } catch (cleanupError) {
        console.error('Failed to enqueue orphaned approval attachment cleanup.', {
          providerId: provider.extension.key, objectId: reference.objectId, error: cleanupError
        })
      }
    }
    throw error
  }
}

export const deleteApprovalAttachment = async (event: H3Event, approvalId: string, attachmentId: string) => {
  const { context, agencyId } = await resolveContext(event, approvalId)
  await authorizeReviewRuntimeAction(event, 'action_review_approval', context)
  return await executeFreshAuthorizedApprovalActorWrite(event, context, async (trx, current) => {
    const { actorId } = await requireWritableApproval(event, trx, approvalId, true)
    if (getReviewRuntimeOwnerAgencyId(current) !== agencyId) return await invalidStatus(event)
    const file = await attachmentQuery(trx, approvalId, agencyId).where('link.id', '=', attachmentId)
      .where('link.egcs_cn_submitted', '=', false).where('link.egcs_cn_uploadedby', '=', actorId)
      .select([
        'file.id', 'file.egcs_cn_provider as providerId', 'file.egcs_cn_providerobjectid as objectId',
        'file.egcs_cn_providerlocator as locator'
      ]).forUpdate(['link', 'file']).executeTakeFirst()
    if (!file) return await attachmentNotFound(event)
    await setAppUserDbSession(trx, actorId)
    await trx.updateTable('Common_Approval_Attachment').set({ _deleted: true }).where('id', '=', attachmentId).execute()
    await trx.updateTable('Common_Attachment').set({ _deleted: true }).where('id', '=', String(file.id)).execute()
    await enqueueStorageCleanup(trx, {
      provider_key: file.providerId, agency_id: agencyId, purpose: 'attachment', object_id: file.objectId,
      locator: storageCleanupLocator(file.locator)
    })
    return { success: true }
  })
}

export const downloadApprovalAttachment = async (event: H3Event, approvalId: string, attachmentId: string) => {
  const read = async () => await executeFreshReadSnapshot(event, async trx => {
    const { approval, actorId, agencyId, canUpload } = await authorizeApprovalAttachmentRead(event, approvalId)
    const base = attachmentQuery(trx, approvalId, agencyId).where('link.id', '=', attachmentId)
      .select([
        'file.egcs_cn_filename as filename', 'file.egcs_cn_mimetype as mimeType',
        'file.egcs_cn_provider as providerId', 'file.egcs_cn_providerobjectid as objectId', 'file.egcs_cn_providerlocator as locator'
      ])
    const file = approval.decision != null
      ? await base.where('link.egcs_cn_submitted', '=', true).executeTakeFirst()
      : canUpload && actorId
        ? await base.where('link.egcs_cn_submitted', '=', false).where('link.egcs_cn_uploadedby', '=', actorId).executeTakeFirst()
        : undefined
    if (!file) return await attachmentNotFound(event)
    return { file, target: providerTarget(approval), agencyId }
  }, { authorization: 'snapshot' })
  const initial = await read()
  const { file } = initial
  const provider = await resolveAgencyStorageProvider(event.context.$db, initial.agencyId, file.providerId)
  if (!provider) return await storageUnavailable(event, 'STORAGE_PROVIDER_UNAVAILABLE')
  let object: Awaited<ReturnType<typeof readProviderObject>>
  try {
    if (!file.locator || typeof file.locator !== 'object' || Array.isArray(file.locator)) throw new Error('Provider locator must be an object.')
    object = await readProviderObject({
      provider,
      reference: { objectId: file.objectId, locator: file.locator },
      purpose: 'attachment',
      target: initial.target
    })
  } catch {
    return await storageUnavailable(event, 'STORAGE_PROVIDER_READ_FAILED')
  }
  const fresh = await read()
  if (fresh.agencyId !== initial.agencyId || fresh.file.providerId !== file.providerId
    || fresh.file.objectId !== file.objectId || JSON.stringify(fresh.file.locator) !== JSON.stringify(file.locator)) {
    return await attachmentNotFound(event)
  }
  setResponseHeader(event, 'Content-Type', file.mimeType)
  setResponseHeader(event, 'Content-Disposition', contentDisposition(file.filename))
  setResponseHeader(event, 'X-Content-Type-Options', 'nosniff')
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  return Buffer.from(object.bytes)
}
