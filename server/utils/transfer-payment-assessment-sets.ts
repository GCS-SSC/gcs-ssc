/* eslint-disable jsdoc/require-jsdoc -- Shared assessment-schema scope helpers. */
import type { H3Event } from 'h3'
import type { Kysely } from 'kysely'
import type { Database } from '~~/shared/types/database'
import type { TransferPaymentAmendmentTypeScopeContext } from './transfer-payment-amendment-types'
import { authorize } from './authorize'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export const authorizeTransferPaymentStreamAction = async (
  event: H3Event,
  action: 'create' | 'read' | 'update' | 'delete',
  streamContext: TransferPaymentAmendmentTypeScopeContext,
  _db: Kysely<Database>
) => {
  await authorize(event, 'transfer_payment', action, async ({ context }) => {
    const canAccess = context.userAbilities.authorize('transfer_payment', action, streamContext.scope)
    return canAccess ? { bypass: true } : { scope: streamContext.scope }
  })
}

export const fetchAssessmentReviewSchemaForAgency = async (
  db: Kysely<Database>,
  agencyId: string,
  schemaId: string,
  forUpdate = false
) => {
  if (!isPositivePostgresBigintText(schemaId)) return undefined
  const query = db.selectFrom('Common_Review_Schema')
    .selectAll()
    .where('id', '=', schemaId)
    .where('egcs_cn_agency', '=', agencyId)
    .where('egcs_cn_reviewtype', '=', 'assessment')
    .where('_deleted', '=', false)
  return await (forUpdate ? query.forUpdate() : query).executeTakeFirst()
}
