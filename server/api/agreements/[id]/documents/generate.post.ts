import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import {
  loadAgreementDocumentRenderInput,
  hydrateAgreementDocumentRenderInput,
  buildAgreementDocumentContext,
  persistPreparedAgreementDocument,
  renderAgreementDocumentInput
} from '~~/server/utils/document-generation'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { AgreementDocumentGenerateSchema } from '~~/shared/types/schemas'
import { createHash } from 'node:crypto'
import { acquireDocumentRenderSlot } from '~~/server/utils/document-render-admission'
import { requireAuthContext } from '~~/server/utils/authorize'
import { throwApiError } from '~~/server/utils/api-errors'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const agreementId = getRouterParam(event, 'id')
  if (!agreementId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }

  const agreementContext = await authorizeAgreementResource(event, 'create', agreementId, db)
  if (!agreementContext) {
    return await notFound(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  }

  const body = await readValidatedBodyI18n(event, AgreementDocumentGenerateSchema)
  const actor = await requireAuthContext(event)
  const release = acquireDocumentRenderSlot(agreementContext.agencyId, actor.userId)
  if (!release) return await throwApiError(event, {
    statusCode: 429, code: 'DOCUMENT_RENDER_BUSY', key: 'apiErrors.document_generation.busy'
  })
  try {
    const renderSnapshot = await executeFreshReadSnapshot(event, async trx => {
      const current = await authorizeAgreementResource(event, 'create', agreementId, trx)
      if (!current) return await notFound(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
      return await loadAgreementDocumentRenderInput(
        event, agreementId, body.templateId, body.language, body.outputFormat, trx
      )
    })
    const renderInput = await hydrateAgreementDocumentRenderInput(event, renderSnapshot, body.language, db)
    const prepared = await renderAgreementDocumentInput(event, renderInput, body.language, body.outputFormat)
    return await executeFreshAuthorizedAgreementWrite(
      event,
      db,
      agreementId,
      agreementContext,
      async trx => await persistPreparedAgreementDocument(
        trx,
        agreementId,
        body.templateId,
        await (async () => {
          const currentContext = await buildAgreementDocumentContext(agreementId, trx, undefined, body.language)
          const currentHash = createHash('sha256').update(JSON.stringify(currentContext)).digest('hex')
          if (currentHash !== renderInput.coreContextHash) return await throwApiError(event, {
            statusCode: 409, code: 'DOCUMENT_RENDER_INPUT_CHANGED', key: 'apiErrors.document_generation.input_changed'
          })
          return prepared
        })(),
        body.language,
        body.outputFormat
      ),
      { action: 'create' }
    )
  } finally {
    release()
  }
})
