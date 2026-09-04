import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { listAgreementGeneratedDocuments } from '~~/server/utils/document-generation'

export default defineEventHandler(async event => {
  const agreementId = getRouterParam(event, 'id')
  const closeoutId = getRouterParam(event, 'closeoutId')
  if (!agreementId || !closeoutId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  const db = event.context.$db
  const context = await authorizeAgreementResource(event, 'read', agreementId, db)
  if (!context) return await notFound(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  const items = await listAgreementGeneratedDocuments(agreementId, db, closeoutId)
  return { items, total: items.length, stats: { total: items.length }, page: 1, limit: items.length || 25 }
})
