import { FundingCaseAgreementPaymentPatchSchema } from '~~/shared/types/schemas'
import {
  assertAgreementPaymentEditable,
  buildAgreementPaymentPatchUpdateValues,
  normalizeAgreementPaymentEditingResponse,
  prepareAgreementPaymentRoute,
  resolveAgreementPaymentPatchCommitmentId,
  syncAgreementPaymentEditingStatus,
  validateAgreementPaymentPatchContext
} from '~~/server/utils/agreement-payment'
import { badRequest } from '~~/server/utils/api-errors'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { runExtensionAgreementPaymentMutationGuards } from '~~/server/utils/extensions'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { validateMergedFinancialPeriodPatch } from '~~/server/utils/agreement-financial-patch-validation'
import { sql } from 'kysely'
import { databaseMoneyText, parseDatabaseMoney } from '~~/server/utils/database-money'

export default defineEventHandler(async event => {
  const paymentId = getRouterParam(event, 'paymentId')
  if (!paymentId || !isPositivePostgresBigintText(paymentId)) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }

  const prepared = await prepareAgreementPaymentRoute(event, 'update', {
    entityType: 'fundingcasepayment',
    entityId: paymentId
  })
  if (!prepared || !('agreementId' in prepared)) {
    return prepared
  }

  const { agreementId, agreementContext, db } = prepared
  const patchValues = await readValidatedBodyI18n(event, FundingCaseAgreementPaymentPatchSchema)

  const updated = await executeFreshAuthorizedAgreementWrite(event, db, agreementId, agreementContext, async trx => {
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

    await validateMergedFinancialPeriodPatch(event, editablePayment, patchValues)

    const { response, nextCommitmentId } = await resolveAgreementPaymentPatchCommitmentId(event, trx, agreementId, patchValues)
    if (response) {
      return response
    }

    const updateValues = buildAgreementPaymentPatchUpdateValues(patchValues, nextCommitmentId)
    const contextGuard = await validateAgreementPaymentPatchContext(
      event,
      trx,
      agreementId,
      paymentId,
      editablePayment,
      patchValues,
      updateValues,
      nextCommitmentId,
      { lockPaymentLines: true }
    )
    if (contextGuard) {
      return contextGuard
    }

    if (Object.keys(updateValues).length === 0) {
      return editablePayment
    }

    await runExtensionAgreementPaymentMutationGuards(event, trx, {
      operation: 'payment.update',
      agreementId,
      paymentId,
      changes: {
        ...patchValues,
        ...(nextCommitmentId === undefined ? {} : { egcs_fc_fundingagreementcommitment: nextCommitmentId })
      }
    })

    const row = await trx
      .updateTable('Funding_Case_Agreement_Payment')
      .set(updateValues)
      .where('id', '=', paymentId)
      .where('_deleted', '=', false)
      .returning([
        'id',
        'egcs_fc_fundingagreementcommitment',
        'egcs_fc_fiscalyear',
        'egcs_fc_paymenttype',
        'egcs_fc_periodstart',
        'egcs_fc_periodend',
        databaseMoneyText(sql.ref('egcs_fc_paymentamount')).as('egcs_fc_paymentamount'),
        'egcs_fc_currency',
        'egcs_fc_comment',
        'egcs_fc_status',
        '_deleted'
      ])
      .executeTakeFirstOrThrow()

    await syncAgreementPaymentEditingStatus(trx, paymentId, { event, agreementId })
    return { ...row, egcs_fc_paymentamount: parseDatabaseMoney(row.egcs_fc_paymentamount) }
  }, {
    assignmentTarget: { entityType: 'fundingcasepayment', entityId: paymentId },
    businessStatusTarget: { entityType: 'fundingcasepayment', entityId: paymentId }
  })

  if (!updated || typeof updated !== 'object' || !('egcs_fc_status' in updated)) {
    return updated
  }

  return normalizeAgreementPaymentEditingResponse(updated as Parameters<typeof normalizeAgreementPaymentEditingResponse>[0])
})
