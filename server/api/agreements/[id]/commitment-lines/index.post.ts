import { sql } from 'kysely'
import { FundingCaseAgreementCommitmentLineCreateSchema } from '~~/shared/types/schemas'
import {
  assertAgreementCommitmentTotalWithinProgramFunding,
  executeAgreementCommitmentMutation,
  lockAgreementCommitmentEditable,
  assertChartOfAccountBelongsToAgreementStream,
  prepareAgreementCommitmentRoute,
  syncAgreementCommitmentEditingStatus
} from '~~/server/utils/agreement-commitment'
import { throwIfAgreementUniqueConstraintError } from '~~/server/utils/agreement-unique-constraint-errors'
import { databaseMoneyText, databaseMoneyValue, parseDatabaseMoney } from '~~/server/utils/database-money'

export default defineEventHandler(async event => {
  const validated = await readValidatedBodyI18n(event, FundingCaseAgreementCommitmentLineCreateSchema)
  const prepared = await prepareAgreementCommitmentRoute(event, 'create', {
    entityType: 'fundingcaseagreementcommitment',
    entityId: validated.egcs_fc_commitment
  })
  if (!prepared || !('agreementId' in prepared)) {
    return prepared
  }

  const { agreementId, agreementContext, db } = prepared

  try {
    const created = await executeAgreementCommitmentMutation(
      event,
      db,
      agreementId,
      agreementContext,
      [{ type: 'commitment', id: validated.egcs_fc_commitment }],
      async (trx, currentContext) => {
        await lockAgreementCommitmentEditable(event, trx, agreementId, validated.egcs_fc_commitment)

        const chartOfAccount = await assertChartOfAccountBelongsToAgreementStream(
          event,
          trx,
          validated.egcs_fc_transferpaymentstreamchartofaccount,
          currentContext.streamId
        )
        if (!chartOfAccount || typeof chartOfAccount !== 'object' || !('id' in chartOfAccount)) {
          return chartOfAccount
        }

        const budgetCapacity = await assertAgreementCommitmentTotalWithinProgramFunding(
          event,
          trx,
          agreementId,
          validated.egcs_fc_commitment,
          validated.egcs_fc_amount
        )
        if (!budgetCapacity || typeof budgetCapacity !== 'object' || !('programFundingTotal' in budgetCapacity)) {
          return budgetCapacity
        }

        const inserted = await trx
          .insertInto('Funding_Case_Agreement_Commitment_Line')
          .values({
            ...validated,
            egcs_fc_amount: databaseMoneyValue(validated.egcs_fc_amount)
          })
          .returning([
            'id',
            'egcs_fc_commitment',
            'egcs_fc_commitmentlinenumber',
            'egcs_fc_transferpaymentstreamchartofaccount',
            databaseMoneyText(sql.ref('egcs_fc_amount')).as('egcs_fc_amount'),
            '_deleted'
          ])
          .executeTakeFirstOrThrow()

        await syncAgreementCommitmentEditingStatus(trx, validated.egcs_fc_commitment)

        return { ...inserted, egcs_fc_amount: parseDatabaseMoney(inserted.egcs_fc_amount) }
      },
      { action: 'create' }
    )

    return created
  } catch (error: unknown) {
    await throwIfAgreementUniqueConstraintError(event, error)
    throw error
  }
})
