import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { badRequest, notFound, throwApiError } from '~~/server/utils/api-errors'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { generateCloseoutDocument } from '~~/server/utils/document-generation'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { AgreementDocumentGenerateSchema } from '~~/shared/types/schemas'
import { hasCompetingAgreementCloseoutWorkflow } from '~~/server/utils/agreement-closeout'

export default defineEventHandler(async event => {
  const agreementId = getRouterParam(event, 'id')
  const closeoutId = getRouterParam(event, 'closeoutId')
  if (!agreementId || !closeoutId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  const db = event.context.$db
  const assignmentTarget = { entityType: 'fundingcaseagreementcloseout' as const, entityId: closeoutId }
  const context = await authorizeAgreementResource(event, 'create', agreementId, db, { assignmentTarget })
  if (!context) return await notFound(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  const body = await readValidatedBodyI18n(event, AgreementDocumentGenerateSchema)
  return await executeFreshAuthorizedAgreementWrite(event, db, agreementId, context, async trx => {
    const closeout = await trx.selectFrom('Funding_Case_Agreement_Closeout')
      .select('id')
      .where('id', '=', closeoutId)
      .where('egcs_fc_fundingagreement', '=', agreementId)
      .where('_deleted', '=', false)
      .forUpdate()
      .executeTakeFirst()
    if (!closeout) {
      return await notFound(event, 'AGREEMENT_CLOSEOUT_NOT_FOUND', 'apiErrors.agreement.closeout_not_found')
    }
    if (await hasCompetingAgreementCloseoutWorkflow(trx, agreementId, closeoutId)) {
      return await throwApiError(event, {
        statusCode: 409,
        code: 'AGREEMENT_CLOSEOUT_LOCKED',
        key: 'apiErrors.agreement.closeout_locked'
      })
    }
    return await generateCloseoutDocument(event, agreementId, closeoutId, body.templateId, body.language, body.outputFormat, trx)
  }, {
    action: 'create',
    assignmentTarget,
    allowDuringCloseout: true,
    businessStatusTarget: assignmentTarget,
    businessStatusMode: 'engine'
  })
})
