import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { badRequest, notFound, throwApiError } from '~~/server/utils/api-errors'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { resolveBusinessStatusProtection } from '~~/server/utils/business-status-runtime'

export default defineEventHandler(async event => {
  const agreementId = getRouterParam(event, 'id')
  const closeoutId = getRouterParam(event, 'closeoutId')
  if (!agreementId || !closeoutId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  const db = event.context.$db
  const assignmentTarget = { entityType: 'fundingcaseagreementcloseout' as const, entityId: closeoutId }
  const context = await authorizeAgreementResource(event, 'delete', agreementId, db, { assignmentTarget })
  if (!context) return await notFound(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  return await executeFreshAuthorizedAgreementWrite(event, db, agreementId, context, async trx => {
    const closeout = await trx.selectFrom('Funding_Case_Agreement_Closeout').selectAll()
      .where('id', '=', closeoutId).where('egcs_fc_fundingagreement', '=', agreementId)
      .where('_deleted', '=', false).forUpdate().executeTakeFirst()
    if (!closeout) return await notFound(event, 'AGREEMENT_CLOSEOUT_NOT_FOUND', 'apiErrors.agreement.closeout_not_found')
    const protection = await resolveBusinessStatusProtection(trx, 'fundingcaseagreementcloseout', closeoutId)
    if (!protection?.isDraft) return await throwApiError(event, { statusCode: 409, code: 'AGREEMENT_CLOSEOUT_DELETE_NOT_ALLOWED', key: 'apiErrors.request.invalid_status' })
    return await trx.updateTable('Funding_Case_Agreement_Closeout').set({ _deleted: true, egcs_fc_isopen: false })
      .where('id', '=', closeoutId).returningAll().executeTakeFirstOrThrow()
  }, { action: 'delete', assignmentTarget })
})
