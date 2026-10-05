import { badRequest, throwApiError } from '~~/server/utils/api-errors'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { assertDraftAgreementAmendment } from '~~/server/utils/agreement-amendment'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { authorizeAmendmentDocumentResource, buildAmendmentDocumentContext, amendmentDocumentContextHash, amendmentDocumentFilenameSuffix } from '~~/server/utils/amendment-document-generation'
import { requireAuthContext } from '~~/server/utils/authorize'
import { loadAgreementDocumentRenderInput, hydrateAgreementDocumentRenderInput, renderAgreementDocumentInput, persistGeneratedDocumentWithRollback } from '~~/server/utils/document-generation'
import { acquireDocumentRenderSlot } from '~~/server/utils/document-render-admission'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'
import { AgreementDocumentGenerateSchema } from '~~/shared/types/schemas'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const agreementId = getRouterParam(event, 'id')
  const amendmentId = getRouterParam(event, 'amendmentId')
  if (!agreementId || !amendmentId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  if (![agreementId, amendmentId].every(isPositivePostgresBigintText)) return await badRequest(event, 'INVALID_IDS', 'apiErrors.request.invalid')
  const db = event.context.$db
  const context = await authorizeAmendmentDocumentResource(event, db, agreementId, amendmentId, 'create')
  const body = await readValidatedBodyI18n(event, AgreementDocumentGenerateSchema)
  const actor = await requireAuthContext(event)
  const release = acquireDocumentRenderSlot(context.agencyId, actor.userId)
  if (!release) return await throwApiError(event, { statusCode: 429, code: 'DOCUMENT_RENDER_BUSY', key: 'apiErrors.document_generation.busy' })
  const assignmentTarget = { entityType: 'fundingcaseamendment' as const, entityId: amendmentId }
  try {
    const snapshot = await executeFreshReadSnapshot(event, async trx => {
      await authorizeAmendmentDocumentResource(event, trx, agreementId, amendmentId, 'create')
      await assertDraftAgreementAmendment(event, trx, agreementId, amendmentId)
      const coreContext = await buildAmendmentDocumentContext(event, trx, agreementId, amendmentId, body.language)
      return await loadAgreementDocumentRenderInput(event, agreementId, body.templateId, body.language, body.outputFormat, trx, {
        entityType: 'fundingcaseamendment', coreContext
      })
    })
    const input = await hydrateAgreementDocumentRenderInput(event, snapshot, body.language, db)
    const prepared = await renderAgreementDocumentInput(event, { ...input, baseFilename: `${input.baseFilename}-${amendmentDocumentFilenameSuffix(input.coreContext, amendmentId)}` }, body.language, body.outputFormat)
    return await executeFreshAuthorizedAgreementWrite(event, db, agreementId, context, async trx => {
      await authorizeAmendmentDocumentResource(event, trx, agreementId, amendmentId, 'create')
      await assertDraftAgreementAmendment(event, trx, agreementId, amendmentId)
      const currentContext = await buildAmendmentDocumentContext(event, trx, agreementId, amendmentId, body.language)
      if (amendmentDocumentContextHash(currentContext) !== input.coreContextHash) {
        return await throwApiError(event, { statusCode: 409, code: 'DOCUMENT_RENDER_INPUT_CHANGED', key: 'apiErrors.document_generation.input_changed' })
      }
      return await persistGeneratedDocumentWithRollback(trx, agreementId, body.templateId, prepared.template, prepared.generated, body.language, body.outputFormat, undefined, amendmentId)
    }, { action: 'create', assignmentTarget, businessStatusTarget: assignmentTarget })
  } finally { release() }
})
