import {
  patchAgreementPaymentLine,
  prepareAgreementPaymentRoute
} from '~~/server/utils/agreement-payment'
import { badRequest } from '~~/server/utils/api-errors'
import { resolvePaymentLineAssignmentTarget } from '~~/server/utils/agreement-assignment-target'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const lineId = getRouterParam(event, 'lineId')
  if (!lineId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }
  if (!isPositivePostgresBigintText(lineId)) {
    return await badRequest(event, 'AGREEMENT_PAYMENT_LINE_NOT_FOUND', 'apiErrors.agreement.payment_line_not_found')
  }

  const assignmentTarget = await resolvePaymentLineAssignmentTarget(event.context.$db, lineId)
  if (!assignmentTarget) return await badRequest(event, 'AGREEMENT_PAYMENT_LINE_NOT_FOUND', 'apiErrors.agreement.payment_line_not_found')
  const prepared = await prepareAgreementPaymentRoute(event, 'update', assignmentTarget)
  if (!prepared || !('agreementId' in prepared)) {
    return prepared
  }

  const { agreementId, agreementContext, db } = prepared
  return await patchAgreementPaymentLine(event, db, agreementId, agreementContext, lineId)
})
