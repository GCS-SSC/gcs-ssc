import { FundingCaseAgreementCommitmentPatchSchema } from '~~/shared/types/schemas'
import {
  assertAgreementCommitmentEditable,
  assertCommitmentTypeBelongsToAgreementStream,
  executeAgreementCommitmentMutation,
  prepareAgreementCommitmentRoute,
  syncAgreementCommitmentEditingStatus
} from '~~/server/utils/agreement-commitment'
import {
  AGREEMENT_CHILD_ERROR_KEYS,
  assertAgreementChildExists
} from '~~/server/utils/agreement-child-resources'
import { throwIfAgreementUniqueConstraintError } from '~~/server/utils/agreement-unique-constraint-errors'
import { badRequest } from '~~/server/utils/api-errors'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const childId = getRouterParam(event, 'childId')
  if (!childId || !isPositivePostgresBigintText(childId)) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }

  const prepared = await prepareAgreementCommitmentRoute(event, 'update', {
    entityType: 'fundingcaseagreementcommitment',
    entityId: childId
  })
  if (!prepared || !('agreementId' in prepared)) {
    return prepared
  }

  const { agreementId, agreementContext, db } = prepared
  const patchValues = await readValidatedBodyI18n(event, FundingCaseAgreementCommitmentPatchSchema)

  try {
    return await executeAgreementCommitmentMutation(event, db, agreementId, agreementContext, [{ type: 'commitment', id: childId }], async (trx, currentContext) => {
      const editableCommitment = await assertAgreementCommitmentEditable(event, trx, agreementId, childId)
      if (!editableCommitment || !('id' in editableCommitment)) {
        if (editableCommitment) return editableCommitment
        const existing = await assertAgreementChildExists(
          event,
          trx
            .selectFrom('Funding_Case_Agreement_Commitment')
            .where('id', '=', childId)
            .where('egcs_fc_fundingagreement', '=', agreementId)
            .where('_deleted', '=', false)
            .select('id')
            .executeTakeFirst(),
          ...AGREEMENT_CHILD_ERROR_KEYS.commitmentNotFound
        )
        return existing
      }

      if (patchValues.egcs_fc_type) {
        const commitmentType = await assertCommitmentTypeBelongsToAgreementStream(
          event,
          trx,
          patchValues.egcs_fc_type,
          currentContext.streamId
        )
        if (!commitmentType || !('id' in commitmentType)) return commitmentType
      }

      const updated = await trx
        .updateTable('Funding_Case_Agreement_Commitment')
        .set(patchValues)
        .where('id', '=', childId)
        .where('egcs_fc_fundingagreement', '=', agreementId)
        .where('_deleted', '=', false)
        .returningAll()
        .executeTakeFirstOrThrow()

      await syncAgreementCommitmentEditingStatus(trx, childId)
      return updated
    })
  } catch (error: unknown) {
    await throwIfAgreementUniqueConstraintError(event, error)
    throw error
  }
})
