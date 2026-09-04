import {
  assertAgreementPaymentEditable,
  prepareAgreementPaymentRoute
} from '~~/server/utils/agreement-payment'
import { badRequest } from '~~/server/utils/api-errors'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { runExtensionAgreementPaymentMutationGuards } from '~~/server/utils/extensions'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const paymentId = getRouterParam(event, 'paymentId')
  if (!paymentId || !isPositivePostgresBigintText(paymentId)) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }

  const prepared = await prepareAgreementPaymentRoute(event, 'delete', {
    entityType: 'fundingcasepayment',
    entityId: paymentId
  })
  if (!prepared || !('agreementId' in prepared)) {
    return prepared
  }

  const { agreementId, agreementContext, db } = prepared
  const result = await executeFreshAuthorizedAgreementWrite(event, db, agreementId, agreementContext, async trx => {
    const editablePayment = await assertAgreementPaymentEditable(
      event,
      trx,
      agreementId,
      paymentId,
      { lockPayment: true }
    )
    if (!editablePayment || typeof editablePayment !== 'object' || !('id' in editablePayment)) {
      return editablePayment
    }

    await trx
      .selectFrom('Funding_Case_Agreement_Payment_Line')
      .select('id')
      .where('egcs_fc_fundingagreementpayment', '=', paymentId)
      .where('_deleted', '=', false)
      .orderBy('id', 'asc')
      .forUpdate()
      .execute()

    await runExtensionAgreementPaymentMutationGuards(event, trx, {
      operation: 'payment.delete',
      agreementId,
      paymentId
    })

    await trx
      .updateTable('Funding_Case_Agreement_Payment_Line')
      .set({ _deleted: true })
      .where('egcs_fc_fundingagreementpayment', '=', paymentId)
      .where('_deleted', '=', false)
      .execute()

    await trx
      .updateTable('Funding_Case_Agreement_Payment')
      .set({ _deleted: true })
      .where('id', '=', paymentId)
      .where('_deleted', '=', false)
      .execute()

    return null
  }, {
    action: 'delete',
    assignmentTarget: { entityType: 'fundingcasepayment', entityId: paymentId },
    businessStatusTarget: { entityType: 'fundingcasepayment', entityId: paymentId }
  })

  if (result) {
    return result
  }

  return { success: true }
})
