/* eslint-disable jsdoc/require-jsdoc -- Storage facade helpers use explicit typed contracts. */
import type { Insertable, Kysely } from 'kysely'
import { nanoid } from 'nanoid'
import type { GcsFileStoragePurpose, GcsFileStorageTarget } from '@gcs-ssc/extensions/server'
import type { Database, CommonAttachmentTable, JsonValue } from '~~/shared/types/database'
import { deleteProviderObject, readProviderObject, resolveAgencyStorageProvider, writeProviderObject } from './file-storage-provider'

export interface StoredFileInput {
  agencyId: string
  bytes: Buffer
  filename: string
  mimeType: string
  nameEn: string
  nameFr: string
  descriptionEn: string
  descriptionFr: string
  folder: string
  purpose?: GcsFileStoragePurpose
  target?: GcsFileStorageTarget
  attachmentTypeNameEn?: string
  attachmentTypeNameFr?: string
  attachmentTypeDescriptionEn?: string
  attachmentTypeDescriptionFr?: string
}

export interface StoredFileRecord {
  id: string
  providerId: string
  objectId: string
  locator: JsonValue
}

export type StoredFileLocation = Pick<CommonAttachmentTable, 'egcs_cn_provider' | 'egcs_cn_providerobjectid' | 'egcs_cn_providerlocator'>

export interface StorageCleanupContext {
  providerId: string
  objectId: string
  purpose: GcsFileStoragePurpose
  requestId?: string
}

export const bestEffortStorageCleanup = async (
  cleanup: () => Promise<void>,
  context: StorageCleanupContext
): Promise<void> => {
  try {
    await cleanup()
  } catch {
    console.error('Storage cleanup failed.', {
      category: 'storage_cleanup_failed',
      provider: sanitizePathSegment(context.providerId || 'unknown'),
      object: sanitizePathSegment(context.objectId || 'unknown'),
      purpose: context.purpose,
      ...(context.requestId ? { requestId: sanitizePathSegment(context.requestId) } : {})
    })
  }
}

const sanitizePathSegment = (value: string): string =>
  value.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').slice(0, 160)

const ensureAttachmentType = async (
  db: Kysely<Database>, agencyId: string, nameEn: string, nameFr: string,
  descriptionEn: string, descriptionFr: string
): Promise<string> => {
  const existing = await db.selectFrom('Common_Attachment_Types')
    .where('egcs_cn_agency', '=', agencyId).where('egcs_cn_name_en', '=', nameEn)
    .where('_deleted', '=', false).select('id').executeTakeFirst()
  if (existing?.id) return String(existing.id)
  const created = await db.insertInto('Common_Attachment_Types').values({
    egcs_cn_agency: agencyId, egcs_cn_name_en: nameEn, egcs_cn_name_fr: nameFr,
    egcs_cn_description_en: descriptionEn, egcs_cn_description_fr: descriptionFr, _deleted: false
  }).onConflict(conflict => conflict
    .columns(['egcs_cn_agency', 'egcs_cn_name_en'])
    .where('_deleted', '=', false)
    .doNothing())
    .returning('id').executeTakeFirst()
  if (created) return String(created.id)
  const concurrent = await db.selectFrom('Common_Attachment_Types')
    .where('egcs_cn_agency', '=', agencyId).where('egcs_cn_name_en', '=', nameEn)
    .where('_deleted', '=', false).select('id').executeTakeFirstOrThrow()
  return String(concurrent.id)
}

const requireProvider = async (db: Kysely<Database>, agencyId: string, providerId?: string) => {
  const provider = await resolveAgencyStorageProvider(db, agencyId, providerId)
  if (!provider) throw new Error(providerId
    ? `Recorded file storage provider "${providerId}" is unavailable for agency ${agencyId}.`
    : `No file storage provider is selected for agency ${agencyId}.`)
  return provider
}

export const readStoredFile = async (
  db: Kysely<Database>, agencyId: string, attachment: StoredFileLocation,
  purpose: GcsFileStoragePurpose = 'document-template', target?: GcsFileStorageTarget
): Promise<Buffer> => {
  const provider = await requireProvider(db, agencyId, attachment.egcs_cn_provider)
  const result = await readProviderObject({
    provider,
    reference: { objectId: attachment.egcs_cn_providerobjectid, locator: attachment.egcs_cn_providerlocator as never },
    purpose,
    target
  })
  return Buffer.from(result.bytes)
}

export const deleteStoredFile = async (
  db: Kysely<Database>, agencyId: string, attachment: StoredFileLocation,
  purpose: GcsFileStoragePurpose = 'document-template', target?: GcsFileStorageTarget
): Promise<void> => {
  const provider = await requireProvider(db, agencyId, attachment.egcs_cn_provider)
  await deleteProviderObject({
    provider,
    reference: { objectId: attachment.egcs_cn_providerobjectid, locator: attachment.egcs_cn_providerlocator as never },
    purpose,
    target
  })
}

export const writeStoredFile = async (db: Kysely<Database>, input: StoredFileInput): Promise<StoredFileRecord> => {
  const attachmentTypeId = await ensureAttachmentType(
    db, input.agencyId,
    input.attachmentTypeNameEn || 'Document Template',
    input.attachmentTypeNameFr || 'Modele de document',
    input.attachmentTypeDescriptionEn || 'Template files used to generate documents.',
    input.attachmentTypeDescriptionFr || 'Fichiers modeles utilises pour generer des documents.'
  )
  const provider = await requireProvider(db, input.agencyId)
  const purpose = input.purpose ?? 'document-template'
  const objectName = [
    sanitizePathSegment(input.agencyId),
    input.folder.split('/').map(sanitizePathSegment).filter(Boolean).join('/'),
    `${Date.now()}-${nanoid(10)}-${sanitizePathSegment(input.filename)}`
  ].filter(Boolean).join('/')
  const reference = await writeProviderObject({
    provider, objectName, bytes: input.bytes, contentType: input.mimeType, purpose, target: input.target
  })
  const values: Insertable<CommonAttachmentTable> = {
    egcs_cn_attachmenttype: attachmentTypeId,
    egcs_cn_name_en: input.nameEn,
    egcs_cn_name_fr: input.nameFr,
    egcs_cn_description_en: input.descriptionEn,
    egcs_cn_description_fr: input.descriptionFr,
    egcs_cn_filename: input.filename,
    egcs_cn_provider: provider.extension.key,
    egcs_cn_providerobjectid: reference.objectId,
    egcs_cn_providerlocator: reference.locator,
    egcs_cn_mimetype: input.mimeType,
    egcs_cn_createdat: new Date(),
    egcs_cn_filesize: input.bytes.byteLength,
    _deleted: false
  }

  let attachment: { id: string | number }
  try {
    attachment = await db.insertInto('Common_Attachment').values(values).returning('id').executeTakeFirstOrThrow()
  } catch (error: unknown) {
    await bestEffortStorageCleanup(
      async () => await deleteProviderObject({ provider, reference, purpose, target: input.target }),
      { providerId: provider.extension.key, objectId: reference.objectId, purpose }
    )
    throw error
  }
  return { id: String(attachment.id), providerId: provider.extension.key, objectId: reference.objectId, locator: reference.locator }
}

export const deleteStoredAttachmentById = async (
  db: Kysely<Database>, attachmentId: string,
  purpose: GcsFileStoragePurpose = 'document-template', target?: GcsFileStorageTarget
): Promise<void> => {
  const attachment = await db.selectFrom('Common_Attachment')
    .innerJoin('Common_Attachment_Types', 'Common_Attachment_Types.id', 'Common_Attachment.egcs_cn_attachmenttype')
    .where('Common_Attachment.id', '=', attachmentId)
    .select([
      'Common_Attachment.egcs_cn_provider',
      'Common_Attachment.egcs_cn_providerobjectid',
      'Common_Attachment.egcs_cn_providerlocator',
      'Common_Attachment_Types.egcs_cn_agency as agencyId'
    ]).executeTakeFirst()
  if (!attachment) return

  await db.updateTable('Common_Attachment').set({ _deleted: true }).where('id', '=', attachmentId).execute()
  await deleteStoredFile(db, String(attachment.agencyId), attachment, purpose, target)
}

export const writeStoredTemplateFile = writeStoredFile
