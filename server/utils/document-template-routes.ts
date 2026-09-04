/* eslint-disable jsdoc/require-jsdoc -- exported route helpers are self-descriptive */
import type { H3Event, MultiPartData } from 'h3'
import { sql, type Insertable, type Kysely, type Selectable, type Updateable } from 'kysely'
import type { z } from 'zod'
import { parseI18n } from './api-validate'
import { badRequest, notFound } from './api-errors'
import {
  bestEffortStorageCleanup,
  deleteStoredAttachmentById,
  writeStoredTemplateFile,
  type StoredFileRecord
} from './file-storage'
import {
  TransferPaymentStreamDocumentTemplateCreateSchema,
  TransferPaymentStreamDocumentTemplatePatchSchema
} from '~~/shared/types/schemas'
import type {
  TransferPaymentStreamDocumentTemplateCreate,
  TransferPaymentStreamDocumentTemplatePatch
} from '~~/shared/types/schemas'
import type {
  Database,
  TransferPaymentDocumentTemplateOutputFormat,
  TransferPaymentStreamDocumentTemplateTable
} from '~~/shared/types/database'
import { MultipartLimitError, MultipartParseError, readBoundedMultipartFormData } from './bounded-multipart'

interface MultipartTemplatePayload<T> {
  metadata: T
  fileEn?: {
    filename: string
    type: string
    data: Buffer
  }
  fileFr?: {
    filename: string
    type: string
    data: Buffer
  }
}

type TemplateMultipartMode = 'create' | 'patch'
type TemplateMetadata = TransferPaymentStreamDocumentTemplateCreate | TransferPaymentStreamDocumentTemplatePatch
type TemplateSchema = z.ZodType<TemplateMetadata>
type TemplateUploadFile = NonNullable<MultipartTemplatePayload<TransferPaymentStreamDocumentTemplateCreate>['fileEn']>
type MultipartTemplateFilePart = MultiPartData & {
  filename: string
}

type TemplateMultipartParts = {
  rawMetadata: Record<string, unknown>
  fileEn?: TemplateUploadFile
  fileFr?: TemplateUploadFile
}

export const MAX_DOCUMENT_TEMPLATE_FILE_BYTES = 10 * 1024 * 1024
export const MAX_DOCUMENT_TEMPLATE_MULTIPART_BYTES = (2 * MAX_DOCUMENT_TEMPLATE_FILE_BYTES) + (1024 * 1024)

const assertDocumentTemplateUploadSize = async (
  event: H3Event,
  parts?: MultiPartData[]
): Promise<void> => {
  const contentLengthHeader = event.node?.req?.headers['content-length']
  const contentLength = Array.isArray(contentLengthHeader) ? Number(contentLengthHeader[0]) : Number(contentLengthHeader)
  const partsSize = parts?.reduce((total, part) => total + part.data.byteLength, 0) ?? 0
  const oversizedFile = parts?.some(part => isTemplateUploadFilePart(part) && part.data.byteLength > MAX_DOCUMENT_TEMPLATE_FILE_BYTES)
  if (
    (Number.isFinite(contentLength) && contentLength > MAX_DOCUMENT_TEMPLATE_MULTIPART_BYTES)
    || partsSize > MAX_DOCUMENT_TEMPLATE_MULTIPART_BYTES
    || oversizedFile
  ) {
    return await badRequest(event, 'DOCUMENT_TEMPLATE_FILE_TOO_LARGE', 'apiErrors.document_generation.file_too_large')
  }
}

const isTemplateUploadFilePart = (
  part: MultiPartData
): part is MultipartTemplateFilePart => {
  return typeof part.filename === 'string'
    && part.filename.length > 0
    && (part.name === 'fileEn' || part.name === 'fileFr')
}

const toTemplateUploadFile = (
  part: MultipartTemplateFilePart
): TemplateUploadFile => ({
  filename: part.filename,
  type: part.type ? part.type : 'application/octet-stream',
  data: Buffer.from(part.data)
})

const collectTemplateMultipartParts = (
  parts: MultiPartData[]
): TemplateMultipartParts => {
  const rawMetadata: Record<string, unknown> = {}
  let fileEn: TemplateUploadFile | undefined
  let fileFr: TemplateUploadFile | undefined

  for (const part of parts) {
    if (isTemplateUploadFilePart(part)) {
      const file = toTemplateUploadFile(part)
      if (part.name === 'fileFr') {
        fileFr = file
      } else {
        fileEn = file
      }
      continue
    }

    if (part.name) {
      rawMetadata[part.name] = part.data.toString('utf-8')
    }
  }

  return { rawMetadata, fileEn, fileFr }
}

const applyTemplateMetadataDefaults = (
  rawMetadata: Record<string, unknown>,
  mode: TemplateMultipartMode
): void => {
  if (mode === 'create' && rawMetadata.egcs_tp_templatekind === 'html' && rawMetadata.egcs_tp_outputformats === undefined) {
    rawMetadata.egcs_tp_outputformats = JSON.stringify(['html'])
  }
}

const readDocumentTemplateMultipartParts = async (event: H3Event): Promise<unknown> => {
  if (!('node' in event)) {
    return await badRequest(event, 'INVALID_MULTIPART', 'apiErrors.document_generation.invalid_multipart')
  }

  await assertDocumentTemplateUploadSize(event)

  let parts: MultiPartData[] | undefined
  try {
    parts = await readBoundedMultipartFormData(event, {
      maxTotalBytes: MAX_DOCUMENT_TEMPLATE_MULTIPART_BYTES,
      maxFileBytes: MAX_DOCUMENT_TEMPLATE_FILE_BYTES,
      maxFiles: 2
    })
  } catch (error: unknown) {
    if (error instanceof MultipartLimitError) {
      return await badRequest(event, 'DOCUMENT_TEMPLATE_FILE_TOO_LARGE', 'apiErrors.document_generation.file_too_large')
    }
    if (error instanceof MultipartParseError) {
      return await badRequest(event, 'INVALID_MULTIPART', 'apiErrors.document_generation.invalid_multipart')
    }
    throw error
  }
  if (!parts) {
    return await badRequest(event, 'INVALID_MULTIPART', 'apiErrors.document_generation.invalid_multipart')
  }

  await assertDocumentTemplateUploadSize(event, parts)

  return parts
}

const getTemplateMetadataSchema = (mode: TemplateMultipartMode): TemplateSchema => {
  return mode === 'create'
    ? TransferPaymentStreamDocumentTemplateCreateSchema
    : TransferPaymentStreamDocumentTemplatePatchSchema
}

const parseTemplateMetadata = async <T extends TemplateMetadata>(
  event: H3Event,
  mode: TemplateMultipartMode,
  rawMetadata: Record<string, unknown>
): Promise<T> => {
  const metadata = await parseI18n(event, getTemplateMetadataSchema(mode), rawMetadata) as TemplateMetadata
  if (mode === 'create') {
    return metadata as T
  }

  return Object.fromEntries(
    Object.entries(metadata).filter(([key]) => Object.hasOwn(rawMetadata, key))
  ) as T
}

const getUploadedTemplateFiles = (
  fileEn: TemplateUploadFile | undefined,
  fileFr: TemplateUploadFile | undefined
): TemplateUploadFile[] => {
  const files: TemplateUploadFile[] = []

  if (fileEn) {
    files.push(fileEn)
  }

  if (fileFr) {
    files.push(fileFr)
  }

  return files
}

const assertTemplateFilesMatchKind = async (
  event: H3Event,
  templateKind: TransferPaymentStreamDocumentTemplateCreate['egcs_tp_templatekind'] | TransferPaymentStreamDocumentTemplatePatch['egcs_tp_templatekind'],
  files: TemplateUploadFile[]
): Promise<void> => {
  if (templateKind === 'docx' && files.some(file => !file.filename.toLowerCase().endsWith('.docx'))) {
    return await badRequest(event, 'INVALID_TEMPLATE_FILE', 'apiErrors.document_generation.invalid_docx_file')
  }

  if (templateKind === 'html' && files.some(file => !/\.(html|htm)$/i.test(file.filename))) {
    return await badRequest(event, 'INVALID_TEMPLATE_FILE', 'apiErrors.document_generation.invalid_html_file')
  }
}

export const parseDocumentTemplateMultipart = async <T extends TransferPaymentStreamDocumentTemplateCreate | TransferPaymentStreamDocumentTemplatePatch>(
  event: H3Event,
  mode: TemplateMultipartMode
): Promise<MultipartTemplatePayload<T>> => {
  const parts = await readDocumentTemplateMultipartParts(event)
  if (!Array.isArray(parts)) {
    return parts as MultipartTemplatePayload<T>
  }

  const { rawMetadata, fileEn, fileFr } = collectTemplateMultipartParts(parts)
  applyTemplateMetadataDefaults(rawMetadata, mode)

  const metadata = await parseTemplateMetadata<T>(event, mode, rawMetadata)
  const files = getUploadedTemplateFiles(fileEn, fileFr)

  if (mode === 'create') {
    await assertTemplateFilesMatchKind(event, metadata.egcs_tp_templatekind, files)
    if (!fileEn || !fileFr) {
      return await badRequest(event, 'TEMPLATE_FILE_REQUIRED', 'apiErrors.document_generation.file_required')
    }
  }

  return { metadata, fileEn, fileFr }
}

export const storeTemplateUpload = async (
  db: Kysely<Database>,
  agencyId: string,
  streamId: string,
  metadata: TransferPaymentStreamDocumentTemplateCreate | TransferPaymentStreamDocumentTemplatePatch,
  file: NonNullable<MultipartTemplatePayload<TransferPaymentStreamDocumentTemplateCreate>['fileEn']>
): Promise<StoredFileRecord> => {
  const mimeType = metadata.egcs_tp_templatekind === 'html'
    ? 'text/html; charset=utf-8'
    : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  const stored = await writeStoredTemplateFile(db, {
    agencyId,
    bytes: file.data,
    filename: file.filename,
    mimeType,
    nameEn: metadata.egcs_tp_name_en || file.filename,
    nameFr: metadata.egcs_tp_name_fr || file.filename,
    descriptionEn: metadata.egcs_tp_description_en || metadata.egcs_tp_name_en || file.filename,
    descriptionFr: metadata.egcs_tp_description_fr || metadata.egcs_tp_name_fr || file.filename,
    folder: `stream-${streamId}`
  })

  return stored
}

const getStorageCleanupRequestId = (event: H3Event): string | undefined => {
  const requestId = event.context?.requestId ?? event.node?.req?.headers['x-request-id']
  return Array.isArray(requestId) ? requestId[0] : typeof requestId === 'string' ? requestId : undefined
}

const cleanupTemplateUploads = async (
  event: H3Event,
  db: Kysely<Database>,
  uploads: StoredFileRecord[]
): Promise<void> => {
  await Promise.all(uploads.map(async stored => await bestEffortStorageCleanup(
    async () => await deleteStoredAttachmentById(db, stored.id),
    {
      providerId: stored.providerId,
      objectId: stored.objectId,
      purpose: 'document-template',
      requestId: getStorageCleanupRequestId(event)
    }
  )))
}

const getDocumentTemplateCreateKind = (
  metadata: TransferPaymentStreamDocumentTemplateCreate
) => metadata.egcs_tp_templatekind || 'docx'

const getDocumentTemplateCreateOutputFormats = (
  metadata: TransferPaymentStreamDocumentTemplateCreate,
  templateKind: TransferPaymentStreamDocumentTemplateTable['egcs_tp_templatekind']
) => metadata.egcs_tp_outputformats || [templateKind]

const getDocumentTemplateCreateLocalizedValues = (
  metadata: TransferPaymentStreamDocumentTemplateCreate,
  fileEn: TemplateUploadFile,
  fileFr: TemplateUploadFile
) => ({
  egcs_tp_name_en: metadata.egcs_tp_name_en || fileEn.filename,
  egcs_tp_name_fr: metadata.egcs_tp_name_fr || fileFr.filename,
  egcs_tp_description_en: metadata.egcs_tp_description_en || metadata.egcs_tp_name_en || fileEn.filename,
  egcs_tp_description_fr: metadata.egcs_tp_description_fr || metadata.egcs_tp_name_fr || fileFr.filename
})

export const buildDocumentTemplateCreateValues = (
  streamId: string,
  metadata: TransferPaymentStreamDocumentTemplateCreate,
  fileEn: TemplateUploadFile,
  fileFr: TemplateUploadFile,
  attachmentEnId: string,
  attachmentFrId: string
): Insertable<TransferPaymentStreamDocumentTemplateTable> => {
  const templateKind = getDocumentTemplateCreateKind(metadata)
  const localizedValues = getDocumentTemplateCreateLocalizedValues(metadata, fileEn, fileFr)

  return {
    egcs_tp_entitytype: metadata.egcs_tp_entitytype || 'fundingcaseagreement',
    ...localizedValues,
    egcs_tp_templatekind: templateKind,
    egcs_tp_outputformats: getDocumentTemplateCreateOutputFormats(metadata, templateKind),
    egcs_tp_active: metadata.egcs_tp_active ?? true,
    egcs_tp_transferpaymentstream: streamId,
    egcs_tp_templateattachment_en: attachmentEnId,
    egcs_tp_templateattachment_fr: attachmentFrId,
    _deleted: false
  }
}

export const createStreamDocumentTemplate = async (
  event: H3Event,
  db: Kysely<Database>,
  agencyId: string,
  streamId: string
) => {
  const { metadata, fileEn, fileFr } = await parseDocumentTemplateMultipart<TransferPaymentStreamDocumentTemplateCreate>(event, 'create')
  if (!fileEn || !fileFr) {
    return await badRequest(event, 'TEMPLATE_FILE_REQUIRED', 'apiErrors.document_generation.file_required')
  }

  const createdAttachments: StoredFileRecord[] = []
  try {
    const attachmentEn = await storeTemplateUpload(db, agencyId, streamId, metadata, fileEn)
    createdAttachments.push(attachmentEn)
    const attachmentFr = await storeTemplateUpload(db, agencyId, streamId, metadata, fileFr)
    createdAttachments.push(attachmentFr)

    const values = buildDocumentTemplateCreateValues(streamId, metadata, fileEn, fileFr, attachmentEn.id, attachmentFr.id)
    return await db
      .insertInto('Transfer_Payment_Stream_Document_Template')
      .values({
        ...values,
        egcs_tp_outputformats: sql<TransferPaymentDocumentTemplateOutputFormat[]>`${JSON.stringify(values.egcs_tp_outputformats)}::jsonb`
      })
      .returningAll()
      .executeTakeFirstOrThrow()
  } catch (error: unknown) {
    await cleanupTemplateUploads(event, db, createdAttachments)
    throw error
  }
}

const buildDocumentTemplatePatchValues = (
  metadata: TransferPaymentStreamDocumentTemplatePatch
): Updateable<TransferPaymentStreamDocumentTemplateTable> => {
  const values: Updateable<TransferPaymentStreamDocumentTemplateTable> = { ...metadata }
  return values
}

const assertDocumentTemplateOutputFormats = async (
  event: H3Event,
  metadata: TransferPaymentStreamDocumentTemplatePatch,
  existing: Selectable<TransferPaymentStreamDocumentTemplateTable>
) => {
  const effectiveTemplateKind = metadata.egcs_tp_templatekind || existing.egcs_tp_templatekind
  const effectiveOutputFormats = metadata.egcs_tp_outputformats || existing.egcs_tp_outputformats

  if (
    !Array.isArray(effectiveOutputFormats)
    || effectiveOutputFormats.some(format => format !== effectiveTemplateKind && format !== 'pdf')
  ) {
    return await badRequest(event, 'INVALID_TEMPLATE_OUTPUT_FORMAT', 'apiErrors.document_generation.invalid_template_output_format')
  }

  return null
}

const assertDocumentTemplateKindImmutable = async (
  event: H3Event,
  metadata: TransferPaymentStreamDocumentTemplatePatch,
  existing: Selectable<TransferPaymentStreamDocumentTemplateTable>
) => {
  if (
    metadata.egcs_tp_templatekind
    && metadata.egcs_tp_templatekind !== existing.egcs_tp_templatekind
  ) {
    return await badRequest(
      event,
      'DOCUMENT_TEMPLATE_KIND_IMMUTABLE',
      'apiErrors.document_generation.template_kind_change_not_allowed'
    )
  }

  return null
}
export const patchStreamDocumentTemplate = async (
  event: H3Event,
  db: Kysely<Database>,
  agencyId: string,
  streamId: string,
  templateId: string,
  deferReplacedAttachmentCleanup?: (attachmentIds: string[]) => void
) => {
  const existing = await db
    .selectFrom('Transfer_Payment_Stream_Document_Template')
    .where('id', '=', templateId)
    .where('egcs_tp_transferpaymentstream', '=', streamId)
    .where('_deleted', '=', false)
    .selectAll()
    .executeTakeFirst()

  if (!existing) {
    return await notFound(event, 'DOCUMENT_TEMPLATE_NOT_FOUND', 'apiErrors.document_generation.template_not_found')
  }

  const payload = await parseDocumentTemplateMultipart(event, 'patch') || { metadata: {} }
  const metadata = payload.metadata || {}
  const templateKindError = await assertDocumentTemplateKindImmutable(event, metadata, existing)
  if (templateKindError) {
    return templateKindError
  }

  await assertTemplateFilesMatchKind(
    event,
    existing.egcs_tp_templatekind,
    getUploadedTemplateFiles(payload.fileEn, payload.fileFr)
  )

  const outputFormatError = await assertDocumentTemplateOutputFormats(event, metadata, existing)
  if (outputFormatError) {
    return outputFormatError
  }

  const values = buildDocumentTemplatePatchValues(metadata)
  const createdAttachments: StoredFileRecord[] = []
  const replacedAttachmentIds: string[] = []
  let didUpdateTemplate = false

  try {
    if (payload.fileEn) {
      const stored = await storeTemplateUpload(db, agencyId, streamId, { ...existing, ...metadata }, payload.fileEn)
      values.egcs_tp_templateattachment_en = stored.id
      createdAttachments.push(stored)
      replacedAttachmentIds.push(String(existing.egcs_tp_templateattachment_en))
    }
    if (payload.fileFr) {
      const stored = await storeTemplateUpload(db, agencyId, streamId, { ...existing, ...metadata }, payload.fileFr)
      values.egcs_tp_templateattachment_fr = stored.id
      createdAttachments.push(stored)
      replacedAttachmentIds.push(String(existing.egcs_tp_templateattachment_fr))
    }

    if (Object.keys(values).length === 0) {
      return await badRequest(event, 'NO_UPDATABLE_FIELDS', 'apiErrors.request.no_updatable_fields')
    }

    const updated = await db
      .updateTable('Transfer_Payment_Stream_Document_Template')
      .set({
        ...values,
        ...(metadata.egcs_tp_outputformats
          ? {
              egcs_tp_outputformats: sql<TransferPaymentDocumentTemplateOutputFormat[]>`${JSON.stringify(metadata.egcs_tp_outputformats)}::jsonb`
            }
          : {})
      })
      .where('id', '=', templateId)
      .where('egcs_tp_transferpaymentstream', '=', streamId)
      .where('_deleted', '=', false)
      .returningAll()
      .executeTakeFirstOrThrow()
    didUpdateTemplate = true

    const cleanupAttachmentIds = [...new Set(replacedAttachmentIds)]
      .filter(attachmentId => !createdAttachments.some(stored => stored.id === attachmentId))
    if (deferReplacedAttachmentCleanup) {
      deferReplacedAttachmentCleanup(cleanupAttachmentIds)
      return updated
    }
    const cleanupResults = await Promise.allSettled(
      cleanupAttachmentIds.map(attachmentId => deleteStoredAttachmentById(db, attachmentId))
    )
    cleanupResults.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error('Failed to clean up replaced document-template attachment.', {
          attachmentId: cleanupAttachmentIds[index],
          category: 'storage_cleanup_failed'
        })
      }
    })

    return updated
  } catch (error: unknown) {
    if (!didUpdateTemplate) {
      await cleanupTemplateUploads(event, db, createdAttachments)
    }
    throw error
  }
}
