import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { authorizeReviewRuntimeAction } from '~~/server/utils/review-runtime-access'
import {
  resolveCompletionRuntimeEntityFromEntity,
  respondCompletionRuntimeEntityNotFound
} from '~~/server/utils/completion-runtime'
import {
  isWorkflowStartStatusAllowed,
  resolvePublishedStandardWorkflowSetups,
  resolveWorkflowTargetStatus
} from '~~/server/utils/workflow-runtime'
import { WorkflowSourceSchema } from '~~/shared/types/schemas/workflow'
import { resolveEntityTypeLifecycleDefinition } from '~~/server/utils/entity-type-registry'
import {
  authorizeExtensionLifecycleRead,
  resolveExtensionLifecycleRuntime
} from '~~/server/utils/extension-lifecycle-runtime'
import { isBusinessStatusEntityType, resolveBusinessStatusProtection } from '~~/server/utils/business-status-runtime'

export default defineEventHandler(async event => {
  const query = await getValidatedQueryI18n(event, WorkflowSourceSchema)
  const extensionRuntime = query.entityType?.includes(':')
    ? await resolveExtensionLifecycleRuntime(event, query.entityType, query.entityId)
    : null
  const context = extensionRuntime?.context
    ?? await resolveCompletionRuntimeEntityFromEntity(event.context.$db, query.entityType, query.entityId)
  if (!context) return await respondCompletionRuntimeEntityNotFound(event, query.entityType)
  if (extensionRuntime) await authorizeExtensionLifecycleRead(event, extensionRuntime)
  else await authorizeReviewRuntimeAction(event, 'read_assessment', context)

  const definition = await resolveEntityTypeLifecycleDefinition(event.context.$db, context.entityType)
  if (definition?.standardWorkflow !== 'explicit') return { items: [] }
  const [setups, coreProtection, active] = await Promise.all([
    resolvePublishedStandardWorkflowSetups(event.context.$db, context),
    isBusinessStatusEntityType(context.entityType)
      ? resolveBusinessStatusProtection(event.context.$db, context.entityType, context.entityId)
      : null,
    event.context.$db.selectFrom('Common_Runtime')
      .select('id')
      .where('egcs_cn_kind', '=', 'workflow')
      .where('egcs_cn_entitytype', '=', context.entityType)
      .where('egcs_cn_entityid', '=', context.entityId)
      .where('egcs_cn_state', 'in', ['pending', 'active', 'awaiting_action', 'paused'])
      .where('_deleted', '=', false)
      .executeTakeFirst()
  ])
  const targetStatus = extensionRuntime?.lockedEntity.status?.statusId
    ?? coreProtection?.statusId
    ?? await resolveWorkflowTargetStatus(event.context.$db, context.entityType, context.entityId)
  const targetTerminal = extensionRuntime?.lockedEntity.status?.terminal ?? coreProtection?.terminal ?? false
  const targetOpen = context.isOpen !== false
  const targetEligible = Boolean(targetStatus && !targetTerminal && !active && targetOpen)
  return {
    items: setups.map(setup => {
      const statusAllowed = Boolean(targetStatus)
        && isWorkflowStartStatusAllowed(setup.egcs_cn_allowedstartstatuses, targetStatus!)
      const eligible = targetEligible && statusAllowed
      const ineligibleReason = eligible
        ? null
        : active
          ? 'active_workflow' as const
          : !targetOpen
              ? 'closed_target' as const
              : targetTerminal
                ? 'terminal_status' as const
                : !targetStatus
                    ? 'unsupported' as const
                    : 'status_ineligible' as const

      return {
        workflowSetupId: String(setup.id),
        name_en: setup.egcs_cn_name_en,
        name_fr: setup.egcs_cn_name_fr,
        description_en: setup.egcs_cn_description_en,
        description_fr: setup.egcs_cn_description_fr,
        version: setup.publicationVersion,
        definition: setup.publicationDefinition,
        eligible,
        ineligibleReason
      }
    })
  }
})
