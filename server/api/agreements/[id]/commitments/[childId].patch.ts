import { assertAgreementCurrency } from '~~/server/utils/agreement-currency'
import { FundingCaseAgreementCommitmentPatchSchema } from '~~/shared/types/schemas'
import {
  assertAgreementCommitmentEditable,
  assertAgreementCommitmentTotalWithinProgramFunding,
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
import { sql } from 'kysely'
import { allocateAgreementCommitment } from '~~/server/utils/agreement-coding-allocator'
import { databaseMoneyText, databaseMoneyValue, parseDatabaseMoney } from '~~/server/utils/database-money'
import { compareMoney, sumMoney } from '~~/shared/utils/money'

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

      await assertAgreementCurrency(event, trx, agreementId, patchValues.egcs_fc_currency ?? editableCommitment.egcs_fc_currency)

      if (patchValues.egcs_fc_type) {
        const commitmentType = await assertCommitmentTypeBelongsToAgreementStream(
          event,
          trx,
          patchValues.egcs_fc_type,
          currentContext.streamId
        )
        if (!commitmentType || !('id' in commitmentType)) return commitmentType
      }

      const nextAmount = patchValues.egcs_fc_totalamount ?? parseDatabaseMoney(editableCommitment.egcs_fc_totalamount)
      await assertAgreementCommitmentTotalWithinProgramFunding(event, trx, agreementId, childId, nextAmount, { replaceTotal: true })
      const allocated = await allocateAgreementCommitment(event, trx, { agreementId, agencyId: currentContext.agencyId, streamId: currentContext.streamId,
        commitmentId: childId, commitmentTypeId: patchValues.egcs_fc_type ?? editableCommitment.egcs_fc_type,
        amount: nextAmount, currency: patchValues.egcs_fc_currency ?? editableCommitment.egcs_fc_currency })
      if (!allocated) {
        const lines = await trx.selectFrom('Funding_Case_Agreement_Commitment_Line').select(databaseMoneyText(sql.ref('egcs_fc_amount')).as('amount'))
          .where('egcs_fc_commitment', '=', childId).where('_deleted', '=', false).execute()
        if (compareMoney(sumMoney(lines.map(line => parseDatabaseMoney(line.amount))), nextAmount) > 0) {
          return await badRequest(event, 'AGREEMENT_COMMITMENT_EXCEEDS_TOTAL', 'apiErrors.agreement.invalid_coding_allocation')
        }
      }

      const { egcs_fc_totalamount: totalAmount, ...headerValues } = patchValues
      const updated = await trx
        .updateTable('Funding_Case_Agreement_Commitment')
        .set({ ...headerValues, ...(totalAmount !== undefined ? { egcs_fc_totalamount: databaseMoneyValue(totalAmount) } : {}) })
        .where('id', '=', childId)
        .where('egcs_fc_fundingagreement', '=', agreementId)
        .where('_deleted', '=', false)
        .returningAll()
        .returning(databaseMoneyText(sql.ref('egcs_fc_totalamount')).as('egcs_fc_totalamount'))
        .executeTakeFirstOrThrow()

      await syncAgreementCommitmentEditingStatus(trx, childId)
      return { ...updated, egcs_fc_totalamount: parseDatabaseMoney(updated.egcs_fc_totalamount) }
    })
  } catch (error: unknown) {
    await throwIfAgreementUniqueConstraintError(event, error)
    throw error
  }
})
