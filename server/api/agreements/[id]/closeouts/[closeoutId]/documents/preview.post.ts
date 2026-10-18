import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { create as contentDisposition } from 'content-disposition'
import { setResponseHeader } from 'h3'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { badRequest, notFound, throwApiError } from '~~/server/utils/api-errors'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { loadCloseoutDocumentRenderInput, hydrateCloseoutDocumentRenderInput, renderAgreementDocumentInput } from '~~/server/utils/document-generation'
import { requireAuthContext } from '~~/server/utils/authorize'
import { acquireDocumentRenderSlot } from '~~/server/utils/document-render-admission'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'
import { AgreementDocumentGenerateSchema } from '~~/shared/types/schemas'

export default defineEventHandler(async event => {
  const agreementId = getRouterParam(event, 'id')
  const closeoutId = getRouterParam(event, 'closeoutId')
  if (!agreementId || !closeoutId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  if (![agreementId, closeoutId].every(isPositivePostgresBigintText)) return await badRequest(event, 'INVALID_IDS', 'apiErrors.request.invalid')
  const db = event.context.$db
  const context = await authorizeAgreementResource(event, 'read', agreementId, db)
  if (!context) return await notFound(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  const body = await readValidatedBodyI18n(event, AgreementDocumentGenerateSchema)
  const actor = await requireAuthContext(event)
  const release = acquireDocumentRenderSlot(context.agencyId, actor.userId)
  if (!release) return await throwApiError(event, { statusCode: 429, code: 'DOCUMENT_RENDER_BUSY', key: 'apiErrors.document_generation.busy' })
  try {
    const snapshot = await executeFreshReadSnapshot(event, async (trx, freshAuthContext) => {
      const current = await authorizeAgreementResource(event, 'read', agreementId, trx, { freshAuth: true, freshAuthContext })
      if (!current) return await notFound(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
      return await loadCloseoutDocumentRenderInput(event, agreementId, closeoutId, body.templateId, body.language, body.outputFormat, trx)
    }, { authorization: 'snapshot' })
    const input = await hydrateCloseoutDocumentRenderInput(event, snapshot, body.language, db)
    const { generated } = await renderAgreementDocumentInput(event, input, body.language, body.outputFormat)
    setResponseHeader(event, 'Content-Type', generated.mimeType)
    setResponseHeader(event, 'Content-Disposition', contentDisposition(generated.filename))
    setResponseHeader(event, 'Content-Length', generated.bytes.byteLength)
    setResponseHeader(event, 'X-Content-Type-Options', 'nosniff')
    setResponseHeader(event, 'Cache-Control', 'private, no-store')
    return generated.bytes
  } finally { release() }
})
