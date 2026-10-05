import { setResponseHeader } from 'h3'
import { create as contentDisposition } from 'content-disposition'
import { badRequest } from '~~/server/utils/api-errors'
import { authorizeAmendmentDocumentResource } from '~~/server/utils/amendment-document-generation'
import { readAgreementGeneratedDocument } from '~~/server/utils/document-generation'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const agreementId = getRouterParam(event, 'id')
  const amendmentId = getRouterParam(event, 'amendmentId')
  const documentId = getRouterParam(event, 'documentId')
  if (!agreementId || !amendmentId || !documentId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  if (![agreementId, amendmentId, documentId].every(isPositivePostgresBigintText)) return await badRequest(event, 'INVALID_IDS', 'apiErrors.request.invalid')
  const generated = await executeFreshReadSnapshot(event, async db => {
    await authorizeAmendmentDocumentResource(event, db, agreementId, amendmentId, 'read')
    return await readAgreementGeneratedDocument(event, agreementId, documentId, db, undefined, amendmentId)
  })
  setResponseHeader(event, 'Content-Type', generated.mimeType)
  setResponseHeader(event, 'Content-Disposition', contentDisposition(generated.filename))
  setResponseHeader(event, 'Content-Length', generated.bytes.byteLength)
  setResponseHeader(event, 'X-Content-Type-Options', 'nosniff')
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  return generated.bytes
})
