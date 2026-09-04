import { resolveAgreementScopeContext } from '~~/server/utils/agreement'
import {
  patchAgreementClaimReconcile,
  resolveAgreementClaimReconcileRuntimeContext
} from '~~/server/utils/agreement-claim'
import { notFound } from '~~/server/utils/api-errors'
import { isDecimalDatabaseId } from '~~/server/utils/database-id'

// eslint-disable-next-line local/require-authorize -- exact assignment is locked and revalidated by the shared claim mutation helper
export default defineEventHandler(async event => {
  const reconcileId = getRouterParam(event, 'reconcileId')
  if (!isDecimalDatabaseId(reconcileId)) return await notFound(event, 'CLAIM_RECONCILIATION_NOT_FOUND', 'apiErrors.admin_common.not_found')

  const runtime = await resolveAgreementClaimReconcileRuntimeContext(event.context.$db, reconcileId)
  const agreement = runtime
    ? await resolveAgreementScopeContext(runtime.agreementId, event.context.$db)
    : null
  if (!runtime || !agreement) return await notFound(event, 'CLAIM_RECONCILIATION_NOT_FOUND', 'apiErrors.admin_common.not_found')

  return await patchAgreementClaimReconcile(
    event,
    event.context.$db,
    runtime.agreementId,
    agreement,
    reconcileId
  )
})
