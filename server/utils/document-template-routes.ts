/* eslint-disable jsdoc/require-jsdoc -- exported route helpers are self-descriptive */
import type { H3Event, MultiPartData } from 'h3'
import { sql, type Insertable, type Kysely, type Updateable } from 'kysely'
import type { z } from 'zod'
import { parseI18n } from './api-validate'
import { badRequest, notFound } from './api-errors'
import {
  bestEffortStorageCleanup,
  deleteStoredFile,
  writeStoredTemplateFile,
  type StoredFileRecord
} from './file-storage'
import {
  AgencyDocumentTemplateCreateSchema,
  AgencyDocumentTemplatePatchSchema
} from '~~/shared/types/schemas'
import type {
  AgencyDocumentTemplateCreate,
  AgencyDocumentTemplatePatch
} from '~~/shared/types/schemas'
import type {
  Database,
  TransferPaymentDocumentTemplateOutputFormat,
  AgencyDocumentTemplateTable
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
type TemplateMetadata = AgencyDocumentTemplateCreate | AgencyDocumentTemplatePatch
type TemplateSchema = z.ZodType<TemplateMetadata>
type TemplateUploadFile = NonNullable<MultipartTemplatePayload<AgencyDocumentTemplateCreate>['fileEn']>
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
  if (mode === 'create' && rawMetadata.egcs_ay_templatekind === 'html' && rawMetadata.egcs_ay_outputformats === undefined) {
    rawMetadata.egcs_ay_outputformats = JSON.stringify(['html'])
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
    ? AgencyDocumentTemplateCreateSchema
    : AgencyDocumentTemplatePatchSchema
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
  templateKind: AgencyDocumentTemplateCreate['egcs_ay_templatekind'] | AgencyDocumentTemplatePatch['egcs_ay_templatekind'],
  files: TemplateUploadFile[]
): Promise<void> => {
  if (templateKind === 'docx' && files.some(file => !file.filename.toLowerCase().endsWith('.docx'))) {
    return await badRequest(event, 'INVALID_TEMPLATE_FILE', 'apiErrors.document_generation.invalid_docx_file')
  }

  if (templateKind === 'html' && files.some(file => !/\.(html|htm)$/i.test(file.filename))) {
    return await badRequest(event, 'INVALID_TEMPLATE_FILE', 'apiErrors.document_generation.invalid_html_file')
  }
}

export const parseDocumentTemplateMultipart = async <T extends AgencyDocumentTemplateCreate | AgencyDocumentTemplatePatch>(
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
    await assertTemplateFilesMatchKind(event, metadata.egcs_ay_templatekind, files)
    if (!fileEn || !fileFr) {
      return await badRequest(event, 'TEMPLATE_FILE_REQUIRED', 'apiErrors.document_generation.file_required')
    }
  }

  return { metadata, fileEn, fileFr }
}

export const storeTemplateUpload = async (
  db: Kysely<Database>,
  agencyId: string,
  metadata: AgencyDocumentTemplateCreate | AgencyDocumentTemplatePatch,
  file: TemplateUploadFile
): Promise<StoredFileRecord> => await writeStoredTemplateFile(db, {
  agencyId,
  bytes: file.data,
  filename: file.filename,
  mimeType: metadata.egcs_ay_templatekind === 'html'
    ? 'text/html; charset=utf-8'
    : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  nameEn: metadata.egcs_ay_name_en || file.filename,
  nameFr: metadata.egcs_ay_name_fr || file.filename,
  descriptionEn: metadata.egcs_ay_description_en || metadata.egcs_ay_name_en || file.filename,
  descriptionFr: metadata.egcs_ay_description_fr || metadata.egcs_ay_name_fr || file.filename,
  folder: `agency-${agencyId}-document-templates`,
  target: { entityType: 'agency', entityId: agencyId }
})

export const cleanupTemplateUploads = async (
  event: H3Event, db: Kysely<Database>, agencyId: string, uploads: StoredFileRecord[]
) => {
  const requestId = event.context?.requestId
  await Promise.all(uploads.map(async stored => await bestEffortStorageCleanup(
    async () => await deleteStoredFile(db, agencyId, {
      egcs_cn_provider: stored.providerId,
      egcs_cn_providerobjectid: stored.objectId,
      egcs_cn_providerlocator: stored.locator
    }, 'document-template', { entityType: 'agency', entityId: agencyId }),
    { providerId: stored.providerId, objectId: stored.objectId, purpose: 'document-template', requestId }
  )))
}

export const buildDocumentTemplateCreateValues = (
  agencyId: string,
  metadata: AgencyDocumentTemplateCreate,
  fileEn: TemplateUploadFile,
  fileFr: TemplateUploadFile,
  attachmentEnId: string,
  attachmentFrId: string
): Insertable<AgencyDocumentTemplateTable> => ({
  egcs_ay_organizationagency: agencyId,
  egcs_ay_entitytype: metadata.egcs_ay_entitytype || 'fundingcaseagreement',
  egcs_ay_name_en: metadata.egcs_ay_name_en || fileEn.filename,
  egcs_ay_name_fr: metadata.egcs_ay_name_fr || fileFr.filename,
  egcs_ay_description_en: metadata.egcs_ay_description_en || metadata.egcs_ay_name_en || fileEn.filename,
  egcs_ay_description_fr: metadata.egcs_ay_description_fr || metadata.egcs_ay_name_fr || fileFr.filename,
  egcs_ay_templatekind: metadata.egcs_ay_templatekind || 'docx',
  egcs_ay_outputformats: metadata.egcs_ay_outputformats || [metadata.egcs_ay_templatekind || 'docx'],
  egcs_ay_active: metadata.egcs_ay_active ?? true,
  egcs_ay_templateattachment_en: attachmentEnId,
  egcs_ay_templateattachment_fr: attachmentFrId,
  _deleted: false
})

export const createAgencyDocumentTemplate = async (
  event: H3Event, db: Kysely<Database>, agencyId: string,
  registerUpload: (stored: StoredFileRecord) => void
) => {
  const { metadata, fileEn, fileFr } = await parseDocumentTemplateMultipart<AgencyDocumentTemplateCreate>(event, 'create')
  if (!fileEn || !fileFr) return await badRequest(event, 'TEMPLATE_FILE_REQUIRED', 'apiErrors.document_generation.file_required')
  const attachmentEn = await storeTemplateUpload(db, agencyId, metadata, fileEn)
  registerUpload(attachmentEn)
  const attachmentFr = await storeTemplateUpload(db, agencyId, metadata, fileFr)
  registerUpload(attachmentFr)
  const values = buildDocumentTemplateCreateValues(agencyId, metadata, fileEn, fileFr, attachmentEn.id, attachmentFr.id)
  return await db.insertInto('Agency_Document_Template').values({
    ...values,
    egcs_ay_outputformats: sql<TransferPaymentDocumentTemplateOutputFormat[]>`${JSON.stringify(values.egcs_ay_outputformats)}::jsonb`
  }).returningAll().executeTakeFirstOrThrow()
}

export const patchAgencyDocumentTemplate = async (
  event: H3Event, db: Kysely<Database>, agencyId: string, templateId: string,
  deferReplacedAttachmentCleanup: (attachmentIds: string[]) => void,
  registerUpload: (stored: StoredFileRecord) => void
) => {
  const existing = await db.selectFrom('Agency_Document_Template')
    .where('id', '=', templateId).where('egcs_ay_organizationagency', '=', agencyId)
    .where('_deleted', '=', false).selectAll().forUpdate().executeTakeFirst()
  if (!existing) return await notFound(event, 'DOCUMENT_TEMPLATE_NOT_FOUND', 'apiErrors.document_generation.template_not_found')
  const { metadata, fileEn, fileFr } = await parseDocumentTemplateMultipart<AgencyDocumentTemplatePatch>(event, 'patch')
  if (metadata.egcs_ay_templatekind && metadata.egcs_ay_templatekind !== existing.egcs_ay_templatekind) {
    return await badRequest(event, 'DOCUMENT_TEMPLATE_KIND_IMMUTABLE', 'apiErrors.document_generation.template_kind_change_not_allowed')
  }
  const files = [fileEn, fileFr].filter((file): file is TemplateUploadFile => Boolean(file))
  await assertTemplateFilesMatchKind(event, existing.egcs_ay_templatekind, files)
  const formats = metadata.egcs_ay_outputformats || existing.egcs_ay_outputformats
  if (!Array.isArray(formats) || formats.some(format => format !== existing.egcs_ay_templatekind && format !== 'pdf')) {
    return await badRequest(event, 'INVALID_TEMPLATE_OUTPUT_FORMAT', 'apiErrors.document_generation.invalid_template_output_format')
  }
  const values: Updateable<AgencyDocumentTemplateTable> = { ...metadata }
  const uploads: StoredFileRecord[] = []
  const replacedAttachmentIds: string[] = []
  if (fileEn) {
    const stored = await storeTemplateUpload(db, agencyId, { ...existing, ...metadata }, fileEn)
    values.egcs_ay_templateattachment_en = stored.id
    uploads.push(stored)
    registerUpload(stored)
    replacedAttachmentIds.push(String(existing.egcs_ay_templateattachment_en))
  }
  if (fileFr) {
    const stored = await storeTemplateUpload(db, agencyId, { ...existing, ...metadata }, fileFr)
    values.egcs_ay_templateattachment_fr = stored.id
    uploads.push(stored)
    registerUpload(stored)
    replacedAttachmentIds.push(String(existing.egcs_ay_templateattachment_fr))
  }
  if (!Object.keys(values).length) return await badRequest(event, 'NO_UPDATABLE_FIELDS', 'apiErrors.request.no_updatable_fields')
  const updated = await db.updateTable('Agency_Document_Template').set({
    ...values,
    ...(metadata.egcs_ay_outputformats
      ? { egcs_ay_outputformats: sql<TransferPaymentDocumentTemplateOutputFormat[]>`${JSON.stringify(metadata.egcs_ay_outputformats)}::jsonb` }
      : {})
  }).where('id', '=', templateId).where('egcs_ay_organizationagency', '=', agencyId)
    .where('_deleted', '=', false).returningAll().executeTakeFirstOrThrow()
  deferReplacedAttachmentCleanup([...new Set(replacedAttachmentIds)]
    .filter(attachmentId => !uploads.some(stored => stored.id === attachmentId)))
  return updated
}
