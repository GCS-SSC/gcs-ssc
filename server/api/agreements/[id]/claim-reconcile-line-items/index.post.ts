import { sql } from 'kysely'
import { FundingCaseAgreementClaimReconcileLineItemCreateSchema } from '~~/shared/types/schemas'
import {
  executeAgreementClaimMutation,
  lockAgreementClaimReconcileEditable,
  prepareAgreementClaimRoute,
  syncAgreementClaimReconcileEditingStatus
} from '~~/server/utils/agreement-claim'
import { badRequest } from '~~/server/utils/api-errors'
import { throwIfAgreementUniqueConstraintError } from '~~/server/utils/agreement-unique-constraint-errors'
import { databaseMoneyText, databaseMoneyValue, parseDatabaseMoney } from '~~/server/utils/database-money'

export default defineEventHandler(async event => {
  const validated = await readValidatedBodyI18n(event, FundingCaseAgreementClaimReconcileLineItemCreateSchema)
  const prepared = await prepareAgreementClaimRoute(event, 'create', {
    entityType: 'fundingclaimreconcile',
    entityId: validated.egcs_fc_fundingagreementclaimreconcile
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
      [{ type: 'claimReconcile', id: validated.egcs_fc_fundingagreementclaimreconcile }],
      async trx => {
        const reconcile = await lockAgreementClaimReconcileEditable(
          event,
          trx,
          agreementId,
          validated.egcs_fc_fundingagreementclaimreconcile
        )
        if (!reconcile || typeof reconcile !== 'object' || !('id' in reconcile) || !('egcs_fc_fundingagreementclaim' in reconcile)) {
          return reconcile
        }

        const lineItem = await trx
          .selectFrom('Funding_Case_Agreement_Claim_Line_Item')
          .where('id', '=', validated.egcs_fc_lineitem)
          .where('egcs_fc_fundingagreementclaim', '=', String(reconcile.egcs_fc_fundingagreementclaim))
          .where('_deleted', '=', false)
          .select('id')
          .executeTakeFirst()

        if (!lineItem) {
          return await badRequest(event, 'AGREEMENT_CLAIM_LINE_ITEM_NOT_FOUND', 'apiErrors.agreement.claim_line_item_not_found')
        }

        const created = await trx
          .insertInto('Funding_Case_Agreement_Claim_Reconcile_Line_Item')
          .values({
            ...validated,
            egcs_fc_reconciled: databaseMoneyValue(validated.egcs_fc_reconciled),
            egcs_fc_sampled: validated.egcs_fc_sampled == null ? validated.egcs_fc_sampled : databaseMoneyValue(validated.egcs_fc_sampled)
          })
          .returning([
            'id', 'egcs_fc_fundingagreementclaimreconcile', 'egcs_fc_fundingagreementclaim',
            'egcs_fc_lineitem', 'egcs_fc_rationale', '_deleted',
            databaseMoneyText(sql.ref('egcs_fc_reconciled')).as('egcs_fc_reconciled'),
            databaseMoneyText(sql.ref('egcs_fc_sampled')).as('egcs_fc_sampled')
          ])
          .executeTakeFirstOrThrow()

        await syncAgreementClaimReconcileEditingStatus(trx, validated.egcs_fc_fundingagreementclaimreconcile)

        return {
          ...created,
          egcs_fc_reconciled: parseDatabaseMoney(created.egcs_fc_reconciled),
          egcs_fc_sampled: created.egcs_fc_sampled == null ? created.egcs_fc_sampled : parseDatabaseMoney(created.egcs_fc_sampled)
        }
      },
      { action: 'create' }
    )
  } catch (error: unknown) {
    await throwIfAgreementUniqueConstraintError(event, error)
    throw error
  }
})
