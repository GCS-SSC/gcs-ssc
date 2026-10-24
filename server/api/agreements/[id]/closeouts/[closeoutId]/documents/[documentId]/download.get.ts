import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { create as contentDisposition } from 'content-disposition'
import { defineEventHandler, getRouterParam, setResponseHeader } from 'h3'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { readAgreementGeneratedDocument } from '~~/server/utils/document-generation'

const readRoute = defineEventHandler(async event => {
  const agreementId = getRouterParam(event, 'id')
  const closeoutId = getRouterParam(event, 'closeoutId')
  const documentId = getRouterParam(event, 'documentId')
  if (!agreementId || !closeoutId || !documentId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  if (![agreementId, closeoutId, documentId].every(isPositivePostgresBigintText)) return await badRequest(event, 'INVALID_IDS', 'apiErrors.request.invalid')
  const db = event.context.$db
  const context = await authorizeAgreementResource(event, 'read', agreementId, db)
  if (!context) return await notFound(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  const closeout = await db.selectFrom('Funding_Case_Agreement_Closeout').select('id')
    .where('id', '=', closeoutId).where('egcs_fc_fundingagreement', '=', agreementId)
    .where('_deleted', '=', false).executeTakeFirst()
  if (!closeout) return await notFound(event, 'AGREEMENT_CLOSEOUT_NOT_FOUND', 'apiErrors.agreement.closeout_not_found')
  const generated = await readAgreementGeneratedDocument(event, agreementId, documentId, db, closeoutId)
  setResponseHeader(event, 'Content-Type', generated.mimeType)
  setResponseHeader(event, 'Content-Disposition', contentDisposition(generated.filename))
  setResponseHeader(event, 'Content-Length', generated.bytes.byteLength)
  setResponseHeader(event, 'X-Content-Type-Options', 'nosniff')
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  return generated.bytes
})

export default defineEventHandler(async event =>
  await executeFreshReadSnapshot(event, async () => await readRoute(event)))
