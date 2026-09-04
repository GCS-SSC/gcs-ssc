import { create as contentDisposition } from 'content-disposition'
import { setResponseHeader } from 'h3'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { readAgreementGeneratedDocument } from '~~/server/utils/document-generation'

export default defineEventHandler(async event => {
  const agreementId = getRouterParam(event, 'id')
  const closeoutId = getRouterParam(event, 'closeoutId')
  const documentId = getRouterParam(event, 'documentId')
  if (!agreementId || !closeoutId || !documentId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  const db = event.context.$db
  const context = await authorizeAgreementResource(event, 'read', agreementId, db)
  if (!context) return await notFound(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  const generated = await readAgreementGeneratedDocument(event, agreementId, documentId, db, closeoutId)
  setResponseHeader(event, 'Content-Type', generated.mimeType)
  setResponseHeader(event, 'Content-Disposition', contentDisposition(generated.filename))
  setResponseHeader(event, 'Content-Length', generated.bytes.byteLength)
  setResponseHeader(event, 'X-Content-Type-Options', 'nosniff')
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  return generated.bytes
})
