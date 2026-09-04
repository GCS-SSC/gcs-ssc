import {
  assertAgreementCommitmentEditable,
  executeAgreementCommitmentMutation,
  prepareAgreementCommitmentRoute
} from '~~/server/utils/agreement-commitment'
import { badRequest } from '~~/server/utils/api-errors'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const childId = getRouterParam(event, 'childId')
  if (!childId || !isPositivePostgresBigintText(childId)) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }

  const prepared = await prepareAgreementCommitmentRoute(event, 'delete', {
    entityType: 'fundingcaseagreementcommitment',
    entityId: childId
  })
  if (!prepared || !('agreementId' in prepared)) {
    return prepared
  }

  const { agreementId, agreementContext, db } = prepared

  await executeAgreementCommitmentMutation(event, db, agreementId, agreementContext, [{ type: 'commitment', id: childId }], async trx => {
    await assertAgreementCommitmentEditable(event, trx, agreementId, childId)

    const payments = await trx.selectFrom('Funding_Case_Agreement_Payment')
      .select('id')
      .where('egcs_fc_fundingagreementcommitment', '=', childId)
      .where('_deleted', '=', false)
      .forUpdate()
      .execute()
    if (payments.length > 0) return await badRequest(event, 'AGREEMENT_COMMITMENT_IN_USE', 'apiErrors.request.invalid_status')

    const deleted = await trx
      .updateTable('Funding_Case_Agreement_Commitment')
      .set({ _deleted: true })
      .where('id', '=', childId)
      .where('egcs_fc_fundingagreement', '=', agreementId)
      .where('_deleted', '=', false)
      .returning('id')
      .executeTakeFirst()
    if (!deleted) {
      return await badRequest(event, 'AGREEMENT_COMMITMENT_NOT_FOUND', 'apiErrors.agreement.commitment_not_found')
    }

    await trx
      .updateTable('Funding_Case_Agreement_Commitment_Line')
      .set({ _deleted: true })
      .where('egcs_fc_commitment', '=', childId)
      .where('_deleted', '=', false)
      .execute()
  }, { action: 'delete' })

  return { success: true }
})
