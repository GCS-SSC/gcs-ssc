import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { listAgreementDocumentTemplates } from '~~/server/utils/document-generation'

export default defineEventHandler(async event => {
  const agreementId = getRouterParam(event, 'id')
  const closeoutId = getRouterParam(event, 'closeoutId')
  if (!agreementId || !closeoutId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  const db = event.context.$db
  const context = await authorizeAgreementResource(event, 'read', agreementId, db)
  if (!context) return await notFound(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  const closeout = await db.selectFrom('Funding_Case_Agreement_Closeout').select('id')
    .where('id', '=', closeoutId).where('egcs_fc_fundingagreement', '=', agreementId)
    .where('_deleted', '=', false).executeTakeFirst()
  if (!closeout) return await notFound(event, 'AGREEMENT_CLOSEOUT_NOT_FOUND', 'apiErrors.agreement.closeout_not_found')
  return { items: await listAgreementDocumentTemplates(agreementId, db, true, 'fundingcaseagreementcloseout') }
})
