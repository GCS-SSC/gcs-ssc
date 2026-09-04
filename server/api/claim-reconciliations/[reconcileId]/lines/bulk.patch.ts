import { resolveAgreementScopeContext } from '~~/server/utils/agreement'
import {
  resolveAgreementClaimReconcileRuntimeContext,
  saveAgreementClaimReconcileLineItemsBulk
} from '~~/server/utils/agreement-claim'
import { notFound } from '~~/server/utils/api-errors'
import { isDecimalDatabaseId } from '~~/server/utils/database-id'
import { FundingCaseAgreementClaimReconcileLineItemBulkSaveSchema } from '~~/shared/types/schemas'

// eslint-disable-next-line local/require-authorize -- shared bulk helper freshly authorizes and locks the exact reconciliation aggregate
export default defineEventHandler(async event => {
  const reconcileId = getRouterParam(event, 'reconcileId')
  if (!isDecimalDatabaseId(reconcileId)) return await notFound(event, 'CLAIM_RECONCILIATION_NOT_FOUND', 'apiErrors.admin_common.not_found')
  const input = await readValidatedBodyI18n(event, FundingCaseAgreementClaimReconcileLineItemBulkSaveSchema)
  const runtime = await resolveAgreementClaimReconcileRuntimeContext(event.context.$db, reconcileId)
  const agreement = runtime ? await resolveAgreementScopeContext(runtime.agreementId, event.context.$db) : null
  if (!runtime || !agreement) return await notFound(event, 'CLAIM_RECONCILIATION_NOT_FOUND', 'apiErrors.admin_common.not_found')

  return await saveAgreementClaimReconcileLineItemsBulk(
    event,
    event.context.$db,
    runtime.agreementId,
    agreement,
    reconcileId,
    input
  )
})
