import { patchAgreementClaimLineItem, prepareAgreementClaimRoute } from '~~/server/utils/agreement-claim'
import { badRequest } from '~~/server/utils/api-errors'
import { resolveClaimLineAssignmentTarget } from '~~/server/utils/agreement-assignment-target'

export default defineEventHandler(async event => {
  const lineId = getRouterParam(event, 'lineId')
  if (!lineId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }

  const assignmentTarget = await resolveClaimLineAssignmentTarget(event.context.$db, lineId)
  if (!assignmentTarget) return await badRequest(event, 'AGREEMENT_CLAIM_LINE_ITEM_NOT_FOUND', 'apiErrors.agreement.claim_line_item_not_found')
  const prepared = await prepareAgreementClaimRoute(event, 'update', assignmentTarget)
  if (!prepared || !('agreementId' in prepared)) {
    return prepared
  }

  const { agreementId, agreementContext, db } = prepared
  return await patchAgreementClaimLineItem(event, db, agreementId, agreementContext, lineId)
})
