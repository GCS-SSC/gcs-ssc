import type { Kysely } from 'kysely'
import type { Database } from '~~/shared/types/database'
import type { ReviewRuntimeEntityContext } from './review-runtime-access'
import type { PublishedWorkflowConfiguration } from './workflow-setup-versioning'

export const isClosedFinancialWorkflowTarget = (context: Pick<ReviewRuntimeEntityContext, 'entityType'>) =>
  context.entityType === 'fundingcaseagreementclaim' || context.entityType === 'fundingclaimreconcile'

/**
 * Allows closed financial authoring to finish through approvals without reopening.
 * @param db Current read snapshot or protected write transaction.
 * @param context Resolved target identity and authoring flag.
 * @param setup Exact published workflow selected for this target.
 * @param setup.egcs_cn_agency Workflow owner Agency.
 * @param setup.publicationDefinition Pinned immutable workflow definition.
 * @param target Current business-status protection, locked for mutations.
 * @param target.statusId Current status identity.
 * @param target.terminal Whether the current status is terminal.
 * @returns Whether the selected workflow may pass the authoring-closure gate.
 */
export const canAdmitWorkflowForTarget = async (
  db: Kysely<Database>,
  context: Pick<ReviewRuntimeEntityContext, 'entityType' | 'isOpen'>,
  setup: { egcs_cn_agency: string, publicationDefinition: PublishedWorkflowConfiguration },
  target: { statusId: string | null, terminal: boolean }
): Promise<boolean> => {
  if (context.isOpen !== false) return true
  if (!isClosedFinancialWorkflowTarget(context) || target.terminal || !target.statusId) return false
  const definition = setup.publicationDefinition
  const member = definition.members[0]
  if (definition.entityType !== context.entityType || definition.purpose !== 'standard'
    || !definition.allowedStartStatuses.includes(target.statusId)
    || definition.cancellationStatus !== target.statusId || definition.executionFailureStatus !== target.statusId
    || definition.members.length !== 1 || !member || member.kind !== 'approval_template'
    || member.conditions?.length || !member.approval?.steps.length
    || member.failureStatus !== target.statusId || !member.successStatus) return false
  const success = await db.selectFrom('Common_Status').select('egcs_cn_terminal')
    .where('id', '=', member.successStatus).where('egcs_cn_agency', '=', setup.egcs_cn_agency)
    .where('_deleted', '=', false).executeTakeFirst()
  return success?.egcs_cn_terminal === true
}
