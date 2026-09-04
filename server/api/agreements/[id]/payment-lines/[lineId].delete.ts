import {
  AgreementPaymentLineScopeChanged,
  lockAgreementPaymentLineForMutation,
  prepareAgreementPaymentRoute,
  syncAgreementPaymentEditingStatus
} from '~~/server/utils/agreement-payment'
import { badRequest } from '~~/server/utils/api-errors'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { runExtensionAgreementPaymentMutationGuards } from '~~/server/utils/extensions'
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
  const prepared = await prepareAgreementPaymentRoute(event, 'delete', assignmentTarget)
  if (!prepared || !('agreementId' in prepared)) {
    return prepared
  }

  const { agreementId, agreementContext, db } = prepared
  let result: unknown
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      result = await executeFreshAuthorizedAgreementWrite(event, db, agreementId, agreementContext, async trx => {
        const existingLine = await lockAgreementPaymentLineForMutation(event, trx, agreementId, lineId)
        if (!existingLine || typeof existingLine !== 'object' || !('egcs_fc_fundingagreementpayment' in existingLine)) {
          return existingLine
        }
        const paymentId = String(existingLine.egcs_fc_fundingagreementpayment)

        await runExtensionAgreementPaymentMutationGuards(event, trx, {
          operation: 'payment-line.delete',
          agreementId,
          paymentId,
          paymentLineId: lineId
        })

        await trx
          .updateTable('Funding_Case_Agreement_Payment_Line')
          .set({ _deleted: true })
          .where('id', '=', lineId)
          .where('egcs_fc_fundingagreementpayment', '=', paymentId)
          .where('_deleted', '=', false)
          .execute()

        await syncAgreementPaymentEditingStatus(trx, paymentId, {
          event,
          agreementId
        })

        return null
      }, {
        action: 'delete',
        /**
         * Resolves and locks the payment aggregate owning the requested line.
         * @param trx Active protected-write transaction.
         * @returns Exact payment target, or null when the line no longer exists.
         */
        assignmentTarget: async trx => {
          const line = await trx.selectFrom('Funding_Case_Agreement_Payment_Line')
            .select('egcs_fc_fundingagreementpayment')
            .where('id', '=', lineId)
            .where('_deleted', '=', false)
            .forUpdate()
            .executeTakeFirst()
          if (!line) return null
          return {
            entityType: 'fundingcasepayment',
            entityId: String(line.egcs_fc_fundingagreementpayment)
          }
        }
      })
      break
    } catch (error: unknown) {
      if (!(error instanceof AgreementPaymentLineScopeChanged)) {
        throw error
      }
      if (attempt === 2) {
        return await badRequest(event, 'AGREEMENT_PAYMENT_LINE_SCOPE_CHANGED', 'apiErrors.request.invalid_status')
      }
    }
  }

  if (result) {
    return result
  }

  return { success: true }
})
