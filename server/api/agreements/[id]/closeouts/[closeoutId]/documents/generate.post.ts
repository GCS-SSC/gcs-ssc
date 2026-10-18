import { cleanupStoredFileUploads, type StoredFileUpload } from '~~/server/utils/file-storage'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { badRequest, notFound, throwApiError } from '~~/server/utils/api-errors'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { loadCloseoutDocumentRenderInput, hydrateCloseoutDocumentRenderInput, renderAgreementDocumentInput, persistGeneratedDocumentWithRollback, resolveCloseoutDocumentPersistence } from '~~/server/utils/document-generation'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { requireAuthContext } from '~~/server/utils/authorize'
import { acquireDocumentRenderSlot } from '~~/server/utils/document-render-admission'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'
import { AgreementDocumentGenerateSchema } from '~~/shared/types/schemas'
import { BusinessStatusViolation, lockBusinessStatus } from '~~/server/utils/business-status-runtime'
import { hasActiveAgreementCloseoutWorkflow, hasCompetingAgreementCloseoutWorkflow } from '~~/server/utils/agreement-closeout'

export default defineEventHandler(async event => {
  const agreementId = getRouterParam(event, 'id')
  const closeoutId = getRouterParam(event, 'closeoutId')
  if (!agreementId || !closeoutId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  if (![agreementId, closeoutId].every(isPositivePostgresBigintText)) return await badRequest(event, 'INVALID_IDS', 'apiErrors.request.invalid')
  const db = event.context.$db
  const assignmentTarget = { entityType: 'fundingcaseagreementcloseout' as const, entityId: closeoutId }
  const context = await authorizeAgreementResource(event, 'create', agreementId, db, { assignmentTarget })
  if (!context) return await notFound(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  const body = await readValidatedBodyI18n(event, AgreementDocumentGenerateSchema)
  const actor = await requireAuthContext(event)
  const release = acquireDocumentRenderSlot(context.agencyId, actor.userId)
  if (!release) return await throwApiError(event, { statusCode: 429, code: 'DOCUMENT_RENDER_BUSY', key: 'apiErrors.document_generation.busy' })
  const uploads: StoredFileUpload[] = []
  const registerUpload = (upload: StoredFileUpload): void => {
    uploads.push(upload)
  }
  try {
    const snapshot = await executeFreshReadSnapshot(event, async (trx, freshAuthContext) => {
      const current = await authorizeAgreementResource(event, 'create', agreementId, trx, { assignmentTarget, freshAuth: true, freshAuthContext })
      if (!current) return await notFound(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
      const lifecycle = await resolveCloseoutDocumentPersistence(trx, agreementId, closeoutId)
      if (!lifecycle.can_persist_documents) return await throwApiError(event, {
        statusCode: lifecycle.code === 'AGREEMENT_CLOSEOUT_NOT_FOUND' ? 404 : 409, code: lifecycle.code,
        key: lifecycle.code === 'AGREEMENT_CLOSEOUT_NOT_FOUND'
          ? 'apiErrors.agreement.closeout_not_found'
          : lifecycle.code === 'AGREEMENT_CLOSEOUT_LOCKED' ? 'apiErrors.agreement.closeout_locked' : 'apiErrors.request.invalid_status'
      })
      return await loadCloseoutDocumentRenderInput(event, agreementId, closeoutId, body.templateId, body.language, body.outputFormat, trx)
    })
    const input = await hydrateCloseoutDocumentRenderInput(event, snapshot, body.language, db)
    const prepared = await renderAgreementDocumentInput(event, input, body.language, body.outputFormat)
    return await executeFreshAuthorizedAgreementWrite(event, db, agreementId, context, async trx => {
      const closeout = await trx.selectFrom('Funding_Case_Agreement_Closeout')
        .select(['id', 'egcs_fc_isopen'])
        .where('id', '=', closeoutId)
        .where('egcs_fc_fundingagreement', '=', agreementId)
        .where('_deleted', '=', false)
        .forUpdate()
        .executeTakeFirst()
      if (!closeout) {
        return await notFound(event, 'AGREEMENT_CLOSEOUT_NOT_FOUND', 'apiErrors.agreement.closeout_not_found')
      }
      if (!closeout.egcs_fc_isopen) return await throwApiError(event, {
        statusCode: 409, code: 'AGREEMENT_CLOSEOUT_CLOSED', key: 'apiErrors.request.invalid_status'
      })
      if (await hasCompetingAgreementCloseoutWorkflow(trx, agreementId, closeoutId)) {
        return await throwApiError(event, {
          statusCode: 409,
          code: 'AGREEMENT_CLOSEOUT_LOCKED',
          key: 'apiErrors.agreement.closeout_locked'
        })
      }
      if (!await hasActiveAgreementCloseoutWorkflow(trx, agreementId)) {
        try {
          await lockBusinessStatus(trx, 'fundingcaseagreementcloseout', closeoutId, 'ordinary')
        } catch (error: unknown) {
          if (!(error instanceof BusinessStatusViolation)) throw error
          return await throwApiError(event, { statusCode: 409, code: error.code, key: 'apiErrors.request.invalid_status' })
        }
      }
      const currentInput = await loadCloseoutDocumentRenderInput(event, agreementId, closeoutId, body.templateId, body.language, body.outputFormat, trx, { lockTemplate: true })
      if (currentInput.coreContextHash !== snapshot.coreContextHash || currentInput.templateHash !== snapshot.templateHash) return await throwApiError(event, {
        statusCode: 409, code: 'DOCUMENT_RENDER_INPUT_CHANGED', key: 'apiErrors.document_generation.input_changed'
      })
      return await persistGeneratedDocumentWithRollback(trx, registerUpload, agreementId, body.templateId, prepared.template, prepared.generated, body.language, body.outputFormat, closeoutId)
    }, {
      action: 'create',
      assignmentTarget,
      allowDuringCloseout: true,
      businessStatusTarget: assignmentTarget,
      businessStatusMode: 'engine'
    })
  } catch (error) {
    await cleanupStoredFileUploads(db, uploads)
    throw error
  } finally { release() }
})
