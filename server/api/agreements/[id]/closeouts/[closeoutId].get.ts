import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { withBusinessRecordState } from '~~/server/utils/business-record-state'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'

export default defineEventHandler(async event => {
  const agreementId = getRouterParam(event, 'id')
  const closeoutId = getRouterParam(event, 'closeoutId')
  if (!agreementId || !closeoutId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  return await executeFreshReadSnapshot(event, async db => {
    const context = await authorizeAgreementResource(event, 'read', agreementId, db, { freshAuth: true })
    if (!context) return await notFound(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
    const closeout = await db.selectFrom('Funding_Case_Agreement_Closeout').selectAll()
      .where('id', '=', closeoutId).where('egcs_fc_fundingagreement', '=', agreementId).where('_deleted', '=', false).executeTakeFirst()
    if (!closeout) return await notFound(event, 'AGREEMENT_CLOSEOUT_NOT_FOUND', 'apiErrors.agreement.closeout_not_found')
    const snapshots = await db.selectFrom('Funding_Case_Agreement_Closeout_Snapshot').selectAll()
      .where('egcs_fc_closeout', '=', closeoutId).orderBy('egcs_fc_capturedat', 'desc').execute()
    const [closeoutWithState] = await withBusinessRecordState(db, 'fundingcaseagreementcloseout', [closeout])
    return { ...closeoutWithState, snapshots }
  })
})
