import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { forbidden, throwApiError } from '~~/server/utils/api-errors'
import { canAccessAgreement, resolveAgreementScopeContext } from '~~/server/utils/agreement'
import { resolveCompletionRuntimeEntityFromEntity, respondCompletionRuntimeEntityNotFound } from '~~/server/utils/completion-runtime'
import { canAccessCreditMemoTargetScopes } from '~~/server/utils/credit-memo-scope-authority'
import { canAccessEntityAssignmentOwner, resolveEntityAssignmentOwner } from '~~/server/utils/entity-assignment'
import { authorizeExtensionLifecycleRead, resolveExtensionLifecycleRuntime } from '~~/server/utils/extension-lifecycle-runtime'
import { authorizeReviewRuntimeAction } from '~~/server/utils/review-runtime-access'
import { getWorkflowSupplementaryInformation, WorkflowSupplementaryInformationInvalidError } from '~~/server/utils/workflow-supplementary-information'
import { WorkflowSourceSchema } from '~~/shared/types/schemas/workflow'
import { isAssignableEntityType } from '~~/shared/utils/entity-assignments'

const SupplementaryInformationQuerySchema = WorkflowSourceSchema.pick({ entityType: true, entityId: true })

export default defineEventHandler(async event => {
  const query = await getValidatedQueryI18n(event, SupplementaryInformationQuerySchema)
  const extensionRuntime = query.entityType.includes(':')
    ? await resolveExtensionLifecycleRuntime(event, query.entityType, query.entityId)
    : null
  const context = extensionRuntime?.context
    ?? await resolveCompletionRuntimeEntityFromEntity(event.context.$db, query.entityType, query.entityId)
  if (!context) return await respondCompletionRuntimeEntityNotFound(event, query.entityType)
  const authContext = extensionRuntime
    ? await authorizeExtensionLifecycleRead(event, extensionRuntime)
    : await authorizeReviewRuntimeAction(event, 'read_assessment', context)
  const coreTarget = !extensionRuntime && isAssignableEntityType(query.entityType)
    ? { entityType: query.entityType, entityId: query.entityId }
    : null
  const assignmentOwner = coreTarget
    ? await resolveEntityAssignmentOwner(event.context.$db, coreTarget.entityType, coreTarget.entityId)
    : null
  // Runtime artifact reads may use exact assignment or approval authority. The
  // aggregate Supplementary Information projection always requires owner Viewer.
  if (!extensionRuntime && (!coreTarget || !assignmentOwner
    || !await canAccessEntityAssignmentOwner(authContext, assignmentOwner, 'read', event.context.$db)
    || !await canAccessCreditMemoTargetScopes(event.context.$db, authContext, coreTarget.entityType, coreTarget.entityId, 'read'))) {
    return await forbidden(event)
  }
  const independentAccountingSubject = assignmentOwner?.kind === 'agreement'
    && (assignmentOwner.subject === 'journal_voucher' || assignmentOwner.subject === 'correction' || assignmentOwner.subject === 'account_receivable')
  if (context.agreementId && !independentAccountingSubject) {
    const agreementContext = await resolveAgreementScopeContext(context.agreementId, event.context.$db)
    const hasViewerAccess = agreementContext
      ? await canAccessAgreement(authContext, 'read', agreementContext.scope, event.context.$db)
      : false
    if (!hasViewerAccess) return await forbidden(event)
  }
  try {
    return await getWorkflowSupplementaryInformation(event.context.$db, query.entityType, query.entityId)
  } catch (error) {
    if (!(error instanceof WorkflowSupplementaryInformationInvalidError)) throw error
    return await throwApiError(event, {
      statusCode: 409,
      code: 'WORKFLOW_SUPPLEMENTARY_INFORMATION_INVALID',
      key: 'apiErrors.request.invalid_resource'
    })
  }
})
