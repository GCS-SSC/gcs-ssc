import { sql } from 'kysely'
import { FundingCaseAgreementClaimLineItemCreateSchema } from '~~/shared/types/schemas'
import {
  assertAgreementClaimBudgetLineItem,
  executeAgreementClaimMutation,
  lockAgreementClaimEditable,
  prepareAgreementClaimRoute,
  syncAgreementClaimEditingStatus
} from '~~/server/utils/agreement-claim'
import { throwIfAgreementUniqueConstraintError } from '~~/server/utils/agreement-unique-constraint-errors'
import { databaseMoneyText, databaseMoneyValue, parseDatabaseMoney } from '~~/server/utils/database-money'

export default defineEventHandler(async event => {
  const validated = await readValidatedBodyI18n(event, FundingCaseAgreementClaimLineItemCreateSchema)
  const prepared = await prepareAgreementClaimRoute(event, 'create', {
    entityType: 'fundingcaseagreementclaim',
    entityId: validated.egcs_fc_fundingagreementclaim
  })
  if (!prepared || !('agreementId' in prepared)) {
    return prepared
  }

  const { agreementId, agreementContext, db } = prepared
  try {
    return await executeAgreementClaimMutation(
      event,
      db,
      agreementId,
      agreementContext,
      [{ type: 'claim', id: validated.egcs_fc_fundingagreementclaim }],
      async trx => {
        const claim = await lockAgreementClaimEditable(event, trx, agreementId, validated.egcs_fc_fundingagreementclaim)
        if (!claim || typeof claim !== 'object' || !('id' in claim) || !('egcs_fc_fiscalyear' in claim)) {
          return claim
        }

        if (validated.egcs_fc_fundingagreementbudgetlineitem !== null) {
          const budgetLineItem = await assertAgreementClaimBudgetLineItem(
            event,
            trx,
            agreementId,
            String(claim.egcs_fc_fiscalyear),
            validated.egcs_fc_fundingagreementbudgetlineitem
          )
          if (!budgetLineItem || typeof budgetLineItem !== 'object' || !('id' in budgetLineItem)) {
            return budgetLineItem
          }
        }

        const created = await trx
          .insertInto('Funding_Case_Agreement_Claim_Line_Item')
          .values({ ...validated, egcs_fc_amount: databaseMoneyValue(validated.egcs_fc_amount) })
          .returning([
            'id', 'egcs_fc_fundingagreementclaim', 'egcs_fc_fundingagreement',
            'egcs_fc_fundingagreementbudgetlineitem', 'egcs_fc_submittedcostcategory',
            'egcs_fc_submittedcostsubsection', 'egcs_fc_submittedlineitem',
            'egcs_fc_description', 'egcs_fc_currency', '_deleted',
            databaseMoneyText(sql.ref('egcs_fc_amount')).as('egcs_fc_amount')
          ])
          .executeTakeFirstOrThrow()

        await syncAgreementClaimEditingStatus(trx, validated.egcs_fc_fundingagreementclaim)

        return { ...created, egcs_fc_amount: parseDatabaseMoney(created.egcs_fc_amount) }
      },
      { action: 'create' }
    )
  } catch (error: unknown) {
    await throwIfAgreementUniqueConstraintError(event, error)
    throw error
  }
})
