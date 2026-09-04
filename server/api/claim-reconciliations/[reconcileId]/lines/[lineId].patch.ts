import { resolveAgreementScopeContext } from '~~/server/utils/agreement'
import {
  patchAgreementClaimReconcileLineItem,
  resolveAgreementClaimReconcileRuntimeContext
} from '~~/server/utils/agreement-claim'
import { notFound } from '~~/server/utils/api-errors'
import { isDecimalDatabaseId } from '~~/server/utils/database-id'

// eslint-disable-next-line local/require-authorize -- exact assignment is locked and revalidated by the shared claim mutation helper
export default defineEventHandler(async event => {
  const reconcileId = getRouterParam(event, 'reconcileId')
  const lineId = getRouterParam(event, 'lineId')
  if (!isDecimalDatabaseId(reconcileId) || !isDecimalDatabaseId(lineId)) return await notFound(event, 'CLAIM_RECONCILIATION_LINE_NOT_FOUND', 'apiErrors.admin_common.not_found')

  const runtime = await resolveAgreementClaimReconcileRuntimeContext(event.context.$db, reconcileId)
  const agreement = runtime
    ? await resolveAgreementScopeContext(runtime.agreementId, event.context.$db)
    : null
  if (!runtime || !agreement) return await notFound(event, 'CLAIM_RECONCILIATION_NOT_FOUND', 'apiErrors.admin_common.not_found')

  const line = await event.context.$db
    .selectFrom('Funding_Case_Agreement_Claim_Reconcile_Line_Item')
    .select('id')
    .where('id', '=', lineId)
    .where('egcs_fc_fundingagreementclaimreconcile', '=', reconcileId)
    .where('_deleted', '=', false)
    .executeTakeFirst()
  if (!line) return await notFound(event, 'CLAIM_RECONCILIATION_LINE_NOT_FOUND', 'apiErrors.admin_common.not_found')

  return await patchAgreementClaimReconcileLineItem(
    event,
    event.context.$db,
    runtime.agreementId,
    agreement,
    lineId,
    reconcileId
  )
})
