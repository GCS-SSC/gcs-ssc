import { sql } from 'kysely'
import { resolveAgreementScopeContext } from '~~/server/utils/agreement'
import {
  executeAgreementClaimMutation,
  lockAgreementClaimReconcileEditable,
  resolveAgreementClaimReconcileRuntimeContext,
  syncAgreementClaimReconcileEditingStatus
} from '~~/server/utils/agreement-claim'
import { notFound } from '~~/server/utils/api-errors'
import { throwIfAgreementUniqueConstraintError } from '~~/server/utils/agreement-unique-constraint-errors'
import { FundingCaseAgreementClaimReconcileLineItemCreateSchema } from '~~/shared/types/schemas'
import { isDecimalDatabaseId } from '~~/server/utils/database-id'
import { databaseMoneyText, databaseMoneyValue, parseDatabaseMoney } from '~~/server/utils/database-money'

// eslint-disable-next-line local/require-authorize -- exact assignment is locked and revalidated by the shared claim mutation helper
export default defineEventHandler(async event => {
  const reconcileId = getRouterParam(event, 'reconcileId')
  if (!isDecimalDatabaseId(reconcileId)) return await notFound(event, 'CLAIM_RECONCILIATION_NOT_FOUND', 'apiErrors.admin_common.not_found')
  const validated = await readValidatedBodyI18n(event, FundingCaseAgreementClaimReconcileLineItemCreateSchema)
  if (validated.egcs_fc_fundingagreementclaimreconcile !== reconcileId) {
    return await notFound(event, 'CLAIM_RECONCILIATION_NOT_FOUND', 'apiErrors.admin_common.not_found')
  }

  const runtime = await resolveAgreementClaimReconcileRuntimeContext(event.context.$db, reconcileId)
  const agreement = runtime
    ? await resolveAgreementScopeContext(runtime.agreementId, event.context.$db)
    : null
  if (!runtime || !agreement) return await notFound(event, 'CLAIM_RECONCILIATION_NOT_FOUND', 'apiErrors.admin_common.not_found')

  try {
    return await executeAgreementClaimMutation(
      event,
      event.context.$db,
      runtime.agreementId,
      agreement,
      [{ type: 'claimReconcile', id: reconcileId }],
      async trx => {
        const reconciliation = await lockAgreementClaimReconcileEditable(
          event,
          trx,
          runtime.agreementId,
          reconcileId
        )
        if (!reconciliation || typeof reconciliation !== 'object' || !('egcs_fc_fundingagreementclaim' in reconciliation)) {
          return reconciliation
        }

        const claimLine = await trx.selectFrom('Funding_Case_Agreement_Claim_Line_Item')
          .select('id')
          .where('id', '=', validated.egcs_fc_lineitem)
          .where('egcs_fc_fundingagreementclaim', '=', String(reconciliation.egcs_fc_fundingagreementclaim))
          .where('_deleted', '=', false)
          .executeTakeFirst()
        if (!claimLine) return await notFound(event, 'CLAIM_LINE_NOT_FOUND', 'apiErrors.admin_common.not_found')

        const created = await trx.insertInto('Funding_Case_Agreement_Claim_Reconcile_Line_Item')
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
        await syncAgreementClaimReconcileEditingStatus(trx, reconcileId)
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
