import { patchAgreementCommitmentLine, prepareAgreementCommitmentRoute } from '~~/server/utils/agreement-commitment'
import { badRequest } from '~~/server/utils/api-errors'
import { resolveCommitmentLineAssignmentTarget } from '~~/server/utils/agreement-assignment-target'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const lineId = getRouterParam(event, 'lineId')
  if (!lineId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }
  if (!isPositivePostgresBigintText(lineId)) {
    return await badRequest(event, 'AGREEMENT_COMMITMENT_LINE_NOT_FOUND', 'apiErrors.agreement.commitment_line_not_found')
  }

  const assignmentTarget = await resolveCommitmentLineAssignmentTarget(event.context.$db, lineId)
  if (!assignmentTarget) return await badRequest(event, 'AGREEMENT_COMMITMENT_LINE_NOT_FOUND', 'apiErrors.agreement.commitment_line_not_found')
  const prepared = await prepareAgreementCommitmentRoute(event, 'update', assignmentTarget)
  if (!prepared || !('agreementId' in prepared)) {
    return prepared
  }

  const { agreementId, agreementContext, db } = prepared
  return await patchAgreementCommitmentLine(event, db, agreementId, agreementContext, lineId)
})
