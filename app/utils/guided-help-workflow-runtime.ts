import type { BilingualText } from '@gcs-ssc/guided-help/contracts'
import type { GuideJourneyTask } from '@gcs-ssc/guided-help/journey'
import type { GuideTargetRef } from '@gcs-ssc/guided-help/runtime'
import { SYSTEM_LIFECYCLE } from '~~/shared/constants/system-lifecycle'
import type { RuntimeState } from '~~/shared/constants/system-lifecycle'

type RuntimeItem = { runtimeItemId: string, runtimeState: RuntimeState }
type ApprovalReference = { definition: { nameEn: string, nameFr: string } }
export type GuidedHelpWorkflowRuntime = {
  current: { runtimeId: string, runtimeState: RuntimeState } | null
  reviewSet: (RuntimeItem & { id: string }) | null
  sourceApprovalStage: RuntimeItem | null
  reviews: Array<RuntimeItem & {
    id: string, canUpdate: boolean, egcs_cn_reviewtype: 'assessment' | 'checklist'
    egcs_cn_name_en: string, egcs_cn_name_fr: string, workflowMemberOrder?: number | null
  }>
  recommendations: Array<RuntimeItem & { id: string, canUpdate: boolean, egcs_cn_recommendationsetup: string, workflowMemberOrder?: number | null }>
  dataCollections: Array<{ id: string, runtimeState: RuntimeState, canUpdate: boolean, workflowMemberId: string }>
  steps?: Array<{
    memberId: string, sequence: number, kind: 'review_set' | 'recommendation_set' | 'data_collection' | 'approval_template'
    eligibility?: { eligible: boolean }
    runtimeItem: RuntimeItem | null
    approvalStage: RuntimeItem | null
    reviewPlan?: { name: BilingualText, finalApproval?: ApprovalReference }
    recommendationPlan?: { nameEn: string, nameFr: string, members: Array<{ memberId: string, schemaNameEn: string, schemaNameFr: string }>, finalApproval?: ApprovalReference }
    dataCollectionPlan?: { nameEn: string, nameFr: string }
    approval?: { nameEn: string, nameFr: string }
  }>
  plan?: {
    review: { name_en: string, name_fr: string } | null
    recommendations: Array<{ setup_id: string, name_en: string, name_fr: string }>
    has_final_approval: boolean
  }
}
export type GuidedHelpWorkflowRuntimeCopy = Record<
  'assignment' | 'approval' | 'pending' | 'paused' | 'stopped'
  | 'reviews' | 'recommendations' | 'dataCollection' | 'finalApproval', BilingualText
>
type NativeTaskAction = { kind: 'review', reviewId: string, reviewType: 'assessment' | 'checklist', stepId: string }
  | { kind: 'workflow', stepId: string }

const isSuccessful = (state: RuntimeState | undefined) => state === 'succeeded' || state === 'approved'
const isTerminal = (state: RuntimeState | undefined) => SYSTEM_LIFECYCLE.runtime.terminalStates.some(item => item === state)

/**
 * Projects workflow evidence into optional guidance without changing business state.
 * @param root0 - Projection inputs.
 * @param root0.runtime - Authorized runtime evidence.
 * @param root0.copy - Bilingual task explanations.
 * @returns Business task snapshot with exact native action references.
 */
export const buildGuidedHelpWorkflowRuntime = ({ runtime, copy }: {
  runtime: GuidedHelpWorkflowRuntime | null
  copy: GuidedHelpWorkflowRuntimeCopy
}) => {
  const tasks: GuideJourneyTask[] = []
  const state = runtime?.current?.runtimeState
  /**
   *
   * @param id - Stable task identity.
   * @param title - Bilingual task label.
   * @param itemState - Business task state.
   * @param canUpdate - Exact update capability.
   * @param nativeAction - Existing native workflow action.
   * @param approval - Whether this is an approval wait.
   */
  const addTask = (id: string, title: BilingualText, itemState: RuntimeState | undefined, canUpdate: boolean, nativeAction: NativeTaskAction, approval = false) => {
    const entryTargets: GuideTargetRef[] = nativeAction.kind === 'review'
      ? [
          { kind: 'instance', key: 'agreement.risk-rating.review-open', instance: id },
          { kind: 'instance', key: 'agreement.risk-rating.step-view', instance: nativeAction.stepId }
        ]
      : [{ kind: 'instance', key: 'agreement.risk-rating.step-view', instance: nativeAction.stepId }]
    entryTargets.push({ kind: 'unique', key: 'agreement.detail.risk-navigation' })
    const base = {
      id, title,
      ...(nativeAction.kind === 'review' ? { guideId: nativeAction.reviewType } : {}),
      entryTargets
    }
    if (isSuccessful(itemState)) {
      tasks.push({ ...base, status: 'completed' })
      return
    }
    const blockingReason = state === 'paused' || itemState === 'paused'
      ? copy.paused
      : isTerminal(state) || isTerminal(itemState)
        ? copy.stopped
        : !itemState || itemState === 'pending' || !state
            ? copy.pending
            : approval || itemState === 'awaiting_action'
              ? copy.approval
              : !canUpdate ? copy.assignment : null
    tasks.push(blockingReason ? { ...base, status: 'blocked', blockingReason } : { ...base, status: 'available' })
  }
  /**
   * Adds each materialized review once.
   * @returns Number of reviews added.
   * @param stepId - Owning native workflow selection.
   * @param sequence - Published stage sequence.
   */
  const addReviews = (stepId: string, sequence?: number) => {
    const reviews = runtime?.reviews.filter(review => sequence === undefined || review.workflowMemberOrder === sequence) ?? []
    for (const review of reviews) addTask(`review:${review.id}`, { en: review.egcs_cn_name_en, fr: review.egcs_cn_name_fr }, review.runtimeState, review.canUpdate,
      { kind: 'review', reviewId: review.id, reviewType: review.egcs_cn_reviewtype, stepId })
    return reviews.length
  }
  const addApproval = (item: RuntimeItem | null | undefined, stepId: string, name?: { nameEn: string, nameFr: string }) => {
    addTask(`approval:${item?.runtimeItemId ?? stepId}`, name ? { en: name.nameEn, fr: name.nameFr } : copy.finalApproval,
      item?.runtimeState, false, { kind: 'workflow', stepId }, true)
  }
  /**
   * Adds one recommendation occurrence from its exact workflow stage.
   * @param setupId - Published nested member identity.
   * @param title - Bilingual recommendation label.
   * @param stage - Owning stage identity and runtime sequence, absent for legacy plans.
   * @param stage.memberId - Published workflow occurrence identity.
   * @param stage.sequence - Canonical runtime member order.
   */
  const addRecommendation = (setupId: string, title: BilingualText, stage?: { memberId: string, sequence: number }) => {
    const item = runtime?.recommendations.find(candidate => candidate.egcs_cn_recommendationsetup === setupId
      && (!stage || candidate.workflowMemberOrder === stage.sequence))
    addTask(`recommendation:${item?.id ?? (stage ? `${stage.memberId}:${setupId}` : setupId)}`, title, item?.runtimeState, item?.canUpdate ?? false, { kind: 'workflow', stepId: stage ? `recommendation-${stage.memberId}-${setupId}` : setupId })
  }
  for (const step of runtime?.steps ?? []) {
    if (step.eligibility?.eligible === false) continue
    switch (step.kind) {
      case 'review_set':
        if (!addReviews(`review-${step.memberId}`, step.sequence)) addTask(`review-set:${step.memberId}`, step.reviewPlan?.name ?? copy.reviews, undefined, false, { kind: 'workflow', stepId: `review-${step.memberId}` })
        if (step.reviewPlan?.finalApproval) addApproval(step.approvalStage, `review-approval-${step.memberId}`, step.reviewPlan.finalApproval.definition)
        break
      case 'recommendation_set':
        for (const member of step.recommendationPlan?.members ?? []) addRecommendation(member.memberId, { en: member.schemaNameEn, fr: member.schemaNameFr }, step)
        if (step.recommendationPlan?.finalApproval) addApproval(step.approvalStage, `recommendation-approval-${step.memberId}`, step.recommendationPlan.finalApproval.definition)
        break
      case 'data_collection': {
        const item = runtime?.dataCollections.find(candidate => candidate.workflowMemberId === step.memberId)
        addTask(`collection:${item?.id ?? step.memberId}`, step.dataCollectionPlan ? { en: step.dataCollectionPlan.nameEn, fr: step.dataCollectionPlan.nameFr } : copy.dataCollection,
          item?.runtimeState, item?.canUpdate ?? false, { kind: 'workflow', stepId: `data-collection-${step.memberId}` })
        break
      }
      case 'approval_template':
        addApproval(step.runtimeItem, `approval-${step.memberId}`, step.approval)
        break
      default: {
        const exhaustive: never = step.kind
        throw new Error(`Unsupported workflow stage: ${exhaustive}`)
      }
    }
  }
  if (!runtime?.steps) {
    if (!addReviews(`review-${runtime?.reviewSet?.id ?? 'pending'}`) && runtime?.plan?.review) addTask('review-set:pending', { en: runtime.plan.review.name_en, fr: runtime.plan.review.name_fr }, undefined, false,
      { kind: 'workflow', stepId: `review-${runtime.reviewSet?.id ?? 'pending'}` })
    for (const member of runtime?.plan?.recommendations ?? []) addRecommendation(member.setup_id, { en: member.name_en, fr: member.name_fr })
    if (runtime?.plan?.has_final_approval) addApproval(runtime.sourceApprovalStage, 'final-approval')
  }
  return { tasks, succeeded: isSuccessful(state) }
}
