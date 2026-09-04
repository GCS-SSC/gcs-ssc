import { setResponseHeader } from 'h3'
import { create as contentDisposition } from 'content-disposition'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { readAgreementGeneratedDocument } from '~~/server/utils/document-generation'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const agreementId = getRouterParam(event, 'id')
  const documentId = getRouterParam(event, 'documentId')
  if (!agreementId || !documentId) {
    return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  }
  if (![agreementId, documentId].every(isPositivePostgresBigintText)) {
    return await badRequest(event, 'INVALID_IDS', 'apiErrors.request.invalid')
  }

  const agreementContext = await authorizeAgreementResource(event, 'read', agreementId, db)
  if (!agreementContext) {
    return await notFound(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  }

  const generated = await readAgreementGeneratedDocument(event, agreementId, documentId, db)

  setResponseHeader(event, 'Content-Type', generated.mimeType)
  setResponseHeader(event, 'Content-Disposition', contentDisposition(generated.filename))
  setResponseHeader(event, 'Content-Length', generated.bytes.byteLength)
  setResponseHeader(event, 'X-Content-Type-Options', 'nosniff')
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  return generated.bytes
})
