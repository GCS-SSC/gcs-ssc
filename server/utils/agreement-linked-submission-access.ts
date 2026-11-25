import type { H3Event } from 'h3'
import type { Transaction } from 'kysely'
import type { Database, Entity_Type } from '~~/shared/types/database'
import { allowsLinkedSubmissionAction } from '~~/shared/utils/agreement-linked-submission-policy'
import { throwApiError } from './api-errors'

/**
 * Checks native action admission while the owning Agreement lock is held.
 * @param event - Authenticated request.
 * @param trx - Transaction holding the Agreement lock.
 * @param target - The contained financial record.
 * @param target.kind - Financial target kind.
 * @param target.id - Linked Draft identifier.
 * @param action - Native editing or an operation that could end review.
 */
export const assertLinkedSubmissionActionAllowed = async (
  event: H3Event,
  trx: Transaction<Database>,
  target: { kind: 'claim' | 'forecast', id: string },
  action: 'edit' | 'lifecycle'
) => {
  const row = await trx.selectFrom('Funding_Case_Agreement_Submission').select('egcs_fc_state')
    .where('egcs_fc_target', '=', target.kind).where('egcs_fc_result', '=', target.id)
    .where('_deleted', '=', false).executeTakeFirst()
  if (!allowsLinkedSubmissionAction(row?.egcs_fc_state ?? null, action)) {
    await throwApiError(event, action === 'edit'
      ? { statusCode: 409, code: 'SUBMISSION_REVIEW_REQUIRED', key: 'submission.errors.edit_unavailable' }
      : { statusCode: 409, code: 'SUBMISSION_ACCEPTANCE_REQUIRED', key: 'submission.errors.acceptance_required' })
  }
}

/**
 * Checks lifecycle admission for the core financial targets that can have a Submission.
 * @param event - Authenticated request.
 * @param trx - Transaction holding the Agreement and target locks.
 * @param target - Workflow target.
 * @param target.entityType - Target entity type.
 * @param target.entityId - Target record ID.
 */
export const assertLinkedSubmissionLifecycleAllowed = async (
  event: H3Event, trx: Transaction<Database>, target: { entityType: Entity_Type, entityId: string }
) => {
  if (target.entityType === 'fundingcaseagreementclaim' || target.entityType === 'fundingcaseforecast') {
    const kind = target.entityType === 'fundingcaseagreementclaim' ? 'claim' : 'forecast'
    await assertLinkedSubmissionActionAllowed(event, trx, { kind, id: target.entityId }, 'lifecycle')
  }
}
