import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { withBusinessRecordState } from '~~/server/utils/business-record-state'

export default defineEventHandler(async event => {
  const agreementId = getRouterParam(event, 'id')
  if (!agreementId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  const db = event.context.$db
  const context = await authorizeAgreementResource(event, 'read', agreementId, db)
  if (!context) return await notFound(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  const closeouts = await db.selectFrom('Funding_Case_Agreement_Closeout').selectAll()
    .where('egcs_fc_fundingagreement', '=', agreementId).where('_deleted', '=', false)
    .orderBy('egcs_fc_closeoutnumber', 'desc').execute()
  return await withBusinessRecordState(db, 'fundingcaseagreementcloseout', closeouts)
})
