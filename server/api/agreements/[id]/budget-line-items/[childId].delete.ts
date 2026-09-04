import { authorize } from '~~/server/utils/authorize'
import { badRequest } from '~~/server/utils/api-errors'
import { canAccessAgreement, resolveAgreementScopeContext } from '~~/server/utils/agreement'
import {
  AGREEMENT_CHILD_ERROR_KEYS,
  assertAgreementChildExists,
  assertAgreementExists
} from '~~/server/utils/agreement-child-resources'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { budgetLineItemStableId } from '~~/server/utils/agreement-budget-lineage'
import { sql } from 'kysely'
import { throwIfAgreementUniqueConstraintError } from '~~/server/utils/agreement-unique-constraint-errors'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const agreementId = getRouterParam(event, 'id')
  const childId = getRouterParam(event, 'childId')

  if (!agreementId || !childId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }
  if (!isPositivePostgresBigintText(childId)) {
    return await badRequest(event, 'AGREEMENT_BUDGET_LINE_ITEM_NOT_FOUND', 'apiErrors.agreement.budget_line_item_not_found')
  }

  const agreementContext = await resolveAgreementScopeContext(agreementId, db)
  if (!agreementContext) {
    return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  }

  await authorize(event, 'agreement', 'delete', async ({ context }) => {
    const canDelete = await canAccessAgreement(context, 'delete', agreementContext.scope, db)
    if (canDelete) return { bypass: true }
    return { denied: true }
  })

  try {
    return await executeFreshAuthorizedAgreementWrite(event, db, agreementId, agreementContext, async trx => {
      const agreement = await assertAgreementExists(event, agreementId, trx)
      if (!agreement || typeof agreement !== 'object' || !('id' in agreement)) {
        return agreement
      }

      const existing = await assertAgreementChildExists(
        event,
        trx
          .selectFrom('Funding_Case_Agreement_Budget_Line_Item')
          .innerJoin(
            'Funding_Case_Agreement_Budget_Fiscal_Year',
            'Funding_Case_Agreement_Budget_Fiscal_Year.id',
            'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_fundingagreementbudgetfiscalyear'
          )
          .innerJoin(
            'Funding_Case_Agreement_Budget_Version',
            'Funding_Case_Agreement_Budget_Version.id',
            'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_budgetversion'
          )
          .where(sql<string>`${budgetLineItemStableId}::text`, '=', childId)
          .where('Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fundingagreement', '=', agreementId)
          .where('Funding_Case_Agreement_Budget_Line_Item._deleted', '=', false)
          .where('Funding_Case_Agreement_Budget_Fiscal_Year._deleted', '=', false)
          .where('Funding_Case_Agreement_Budget_Version.egcs_fc_iscurrent', '=', true)
          .where('Funding_Case_Agreement_Budget_Version._deleted', '=', false)
          .select([
            'Funding_Case_Agreement_Budget_Line_Item.id as id',
            budgetLineItemStableId.as('stable_id')
          ])
          .forUpdate('Funding_Case_Agreement_Budget_Line_Item')
          .executeTakeFirst(),
        ...AGREEMENT_CHILD_ERROR_KEYS.budgetLineItemNotFound
      )
      if (!existing || typeof existing !== 'object' || !('id' in existing)) {
        return existing
      }

      const activeClaimLine = await trx
        .selectFrom('Funding_Case_Agreement_Claim_Line_Item')
        .innerJoin(
          'Funding_Case_Agreement_Claim',
          'Funding_Case_Agreement_Claim.id',
          'Funding_Case_Agreement_Claim_Line_Item.egcs_fc_fundingagreementclaim'
        )
        .where(
          'Funding_Case_Agreement_Claim_Line_Item.egcs_fc_fundingagreementbudgetlineitem',
          '=',
          existing.stable_id
        )
        .where('Funding_Case_Agreement_Claim_Line_Item._deleted', '=', false)
        .where('Funding_Case_Agreement_Claim._deleted', '=', false)
        .select('Funding_Case_Agreement_Claim_Line_Item.id')
        .executeTakeFirst()

      if (activeClaimLine) {
        return await badRequest(
          event,
          'AGREEMENT_BUDGET_LINE_ITEM_CLAIM_IN_USE',
          'apiErrors.agreement.budget_line_item_claim_in_use'
        )
      }

      await trx
        .updateTable('Funding_Case_Agreement_Budget_Line_Item')
        .set({ _deleted: true })
        .where('id', '=', String(existing.id))
        .where('_deleted', '=', false)
        .execute()

      return { success: true }
    }, { action: 'delete', blocksApprovalSubmission: true })
  } catch (error: unknown) {
    await throwIfAgreementUniqueConstraintError(event, error)
  }
})
