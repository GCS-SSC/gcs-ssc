import { defineEventHandler, getRouterParam } from 'h3'
import { resolveAgreementScopeContext } from '~~/server/utils/agreement'
import { reconcileAllAgreementClaimAmounts, resolveAgreementClaimReconcileRuntimeContext } from '~~/server/utils/agreement-claim'
import { notFound } from '~~/server/utils/api-errors'
import { isDecimalDatabaseId } from '~~/server/utils/database-id'
import { FundingCaseAgreementClaimReconcileAllSchema } from '~~/shared/types/schemas'

// eslint-disable-next-line local/require-authorize -- the reconciliation mutation freshly authorizes the exact aggregate under lock
export default defineEventHandler(async event => {
  const reconcileId = getRouterParam(event, 'reconcileId')
  if (!isDecimalDatabaseId(reconcileId)) return await notFound(event, 'CLAIM_RECONCILIATION_NOT_FOUND', 'apiErrors.admin_common.not_found')
  const { confirmation } = await readValidatedBodyI18n(event, FundingCaseAgreementClaimReconcileAllSchema)
  const db = event.context.$db
  const runtime = await resolveAgreementClaimReconcileRuntimeContext(db, reconcileId)
  const agreement = runtime ? await resolveAgreementScopeContext(runtime.agreementId, db) : null
  if (!runtime || !agreement) return await notFound(event, 'CLAIM_RECONCILIATION_NOT_FOUND', 'apiErrors.admin_common.not_found')
  return await reconcileAllAgreementClaimAmounts(event, db, runtime.agreementId, agreement, reconcileId, confirmation)
})
