import {
  assertAgreementCommitmentEditable,
  executeAgreementCommitmentMutation,
  prepareAgreementCommitmentRoute,
  syncAgreementCommitmentEditingStatus
} from '~~/server/utils/agreement-commitment'
import {
  AGREEMENT_CHILD_ERROR_KEYS,
  assertAgreementChildExists
} from '~~/server/utils/agreement-child-resources'
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
  const prepared = await prepareAgreementCommitmentRoute(event, 'delete', assignmentTarget)
  if (!prepared || !('agreementId' in prepared)) {
    return prepared
  }

  const { agreementId, agreementContext, db } = prepared
  await executeAgreementCommitmentMutation(event, db, agreementId, agreementContext, async trx => {
    const child = await trx.selectFrom('Funding_Case_Agreement_Commitment_Line').select('egcs_fc_commitment').where('id', '=', lineId).where('_deleted', '=', false).executeTakeFirst()
    return child ? [{ type: 'commitment', id: String(child.egcs_fc_commitment) }] : []
  }, async trx => {
    const existingLine = await assertAgreementChildExists(
      event,
      trx
        .selectFrom('Funding_Case_Agreement_Commitment_Line')
        .innerJoin(
          'Funding_Case_Agreement_Commitment',
          'Funding_Case_Agreement_Commitment.id',
          'Funding_Case_Agreement_Commitment_Line.egcs_fc_commitment'
        )
        .where('Funding_Case_Agreement_Commitment_Line.id', '=', lineId)
        .where('Funding_Case_Agreement_Commitment.egcs_fc_fundingagreement', '=', agreementId)
        .where('Funding_Case_Agreement_Commitment_Line._deleted', '=', false)
        .where('Funding_Case_Agreement_Commitment._deleted', '=', false)
        .select([
          'Funding_Case_Agreement_Commitment_Line.id as id',
          'Funding_Case_Agreement_Commitment_Line.egcs_fc_commitment as egcs_fc_commitment'
        ])
        .executeTakeFirst(),
      ...AGREEMENT_CHILD_ERROR_KEYS.commitmentLineNotFound
    )
    if (!existingLine || typeof existingLine !== 'object' || !('id' in existingLine) || !('egcs_fc_commitment' in existingLine)) {
      return existingLine
    }

    await assertAgreementCommitmentEditable(event, trx, agreementId, String(existingLine.egcs_fc_commitment))
    const paymentLines = await trx.selectFrom('Funding_Case_Agreement_Payment_Line')
      .select('id')
      .where('egcs_fc_fundingagreementcommitmentline', '=', lineId)
      .where('_deleted', '=', false)
      .forUpdate()
      .execute()
    if (paymentLines.length > 0) return await badRequest(event, 'AGREEMENT_COMMITMENT_LINE_IN_USE', 'apiErrors.request.invalid_status')
    await trx.updateTable('Funding_Case_Agreement_Commitment_Line').set({ _deleted: true }).where('id', '=', lineId).where('egcs_fc_commitment', '=', String(existingLine.egcs_fc_commitment)).where('_deleted', '=', false).execute()
    await syncAgreementCommitmentEditingStatus(trx, String(existingLine.egcs_fc_commitment))
  }, { action: 'delete' })

  return { success: true }
})
