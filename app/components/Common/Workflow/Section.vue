<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc */
import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { TableColumn } from '@nuxt/ui'
import type { RuntimeState } from '~~/shared/constants/system-lifecycle'
import type { JsonValue, Workflow_Purpose, Workflow_Target_Entity_Type } from '~~/shared/types/database'
import { validateRecommendationResponses } from '~~/shared/types/schemas/recommendation/recommendation'
import type { RecommendationDefinition, RecommendationResponse } from '~~/shared/types/schemas/recommendation/recommendation'
import AssessmentApprovalsSection from '~/components/Common/Approvals/Section.vue'
import CommonSelectableTable from '~/components/Common/SelectableTable.vue'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { AppFetchResponseError, throwFetchResponseError } from '~/utils/fetch-error'
import { appRouteLocations } from '~/utils/route-locations'

type RuntimeRecommendation = {
  id: string
  runtimeItemId: string
  runtimeState: RuntimeState
  egcs_cn_outcome?: string | null
  egcs_cn_recommendationsetup: string
  approvalRuntimeId?: string | null
  approvalRuntimeState?: RuntimeState | null
  routingSlipId?: string | null
  egcs_cn_response: { responses?: RecommendationResponse[] }
  egcs_cn_revision: number
  egcs_cn_definition: RecommendationDefinition
  canUpdate: boolean
}
type RuntimeReview = {
  id: string
  runtimeItemId: string
  runtimeState: RuntimeState
  egcs_cn_reviewtype: 'assessment' | 'checklist'
  egcs_cn_name_en: string
  egcs_cn_name_fr: string
  workflowMemberOrder?: number | null
}
type RuntimeApplicableWorkflow = {
  id: string
  egcs_cn_name_en: string
  egcs_cn_name_fr: string
  egcs_cn_description_en: string
  egcs_cn_description_fr: string
  publicationId: string
  publicationState: 'draft' | 'published' | 'retired'
  publicationVersionId: string
  publicationVersion: number
  hasUnpublishedChanges: boolean
  publicationDefinition: JsonValue
}
type AvailableStandardWorkflow = {
  workflowSetupId: string
  name_en: string
  name_fr: string
  description_en: string
  description_fr: string
  version: number
  definition: JsonValue
  eligible: boolean
  ineligibleReason: 'active_workflow' | 'closed_target' | 'terminal_status' | 'status_ineligible' | 'unsupported' | null
}
type RuntimeResponse = {
  routing?: { hash: string, fields: Array<{ fieldId: string, optionId: string, name_en: string, name_fr: string, option_en: string, option_fr: string }> } | null
  current: { runtimeId: string, runtimeState: RuntimeState, attempt: number, previousRuntimeId: string | null } | null
  reviewSet: { id: string, runtimeState: RuntimeState, runtimeItemId: string } | null
  sourceApprovalStage: { runtimeItemId: string, runtimeState: RuntimeState, order: number, routingSlipId?: string | null } | null
  recommendations: RuntimeRecommendation[]
  reviews: RuntimeReview[]
  workflowItems: Array<{ runtimeItemId: string, runtimeState: RuntimeState }>
  steps?: Array<{
    eligibility?: { eligible: boolean, unmatchedFieldIds: string[] }
    memberId: string
    sequence: number
    kind: 'review_set' | 'recommendation_set' | 'approval_template'
    materializationStatus?: string
    successStatus?: string
    failureStatus?: string
    reviewPlan?: { name: { en: string, fr: string }, finalApproval?: PublishedApprovalReference }
    recommendationPlan?: { nameEn: string, nameFr: string, members: Array<{ memberId: string, schemaNameEn: string, schemaNameFr: string, approval?: PublishedApprovalPreview }>, finalApproval?: PublishedApprovalReference }
    approval?: PublishedApprovalPreview
    runtimeItem: { runtimeItemId: string, runtimeState: RuntimeState } | null
    approvalStage: { runtimeItemId: string, runtimeState: RuntimeState, routingSlipId: string } | null
  }>
  transitions?: Array<{ id: string, egcs_cn_event: string, egcs_cn_previousstatus: string, egcs_cn_newstatus: string, egcs_cn_createdat: string }>
  ownerBlockers?: Array<{ id: string, egcs_cn_reason: string, egcs_cn_configuredowner?: string | null, egcs_cn_resolvedat?: string | null }>
  applicable: {
    workflow: RuntimeApplicableWorkflow | null
    completion: RuntimeApplicableWorkflow | null
  }
  previous?: Array<{ runtimeId: string, runtimeState: RuntimeState, attempt: number, previousRuntimeId: string | null }>
  canRetry?: boolean
  canCancel?: boolean
  canStart?: boolean
  startBlocker?: {
    reason: 'active_workflow' | 'closed_target' | 'terminal_status' | 'no_published_workflow' | 'status_ineligible' | 'unsupported'
    runtimeId?: string
    purpose?: Workflow_Purpose
    name_en?: string
    name_fr?: string
    statusId?: string | null
  } | null
  canResumeOwners?: boolean
  activeWorkflowPurpose?: Workflow_Purpose | null
  submission?: { egcs_fc_submittedat: string, egcs_fc_canonicalhash: string, egcs_fc_packet: JsonValue } | null
  plan?: {
    review: { name_en: string, name_fr: string } | null
    recommendations: Array<{ ordinal: number, setup_id: string, name_en: string, name_fr: string, has_approval: boolean }>
    has_final_approval: boolean
  }
}
type WorkflowDisplayStep = {
  id: string
  ordinal: number
  name: string
  status: RuntimeState | 'upcoming' | 'not_reached' | 'skipped'
  outcome: string | null
  hasApproval: boolean
  kind: 'review' | 'recommendation' | 'final_approval'
  routingSlipId?: string
}
const {
  entityType,
  entityId,
  purpose = 'standard',
  canEdit = true,
  refreshKey = 0,
  hideWhenUnconfigured = false,
  showPreActionWhenUnconfigured = false,
  preActionTitleKey,
  preActionDescriptionKey
} = defineProps<{
  entityType: Workflow_Target_Entity_Type
  entityId: string
  purpose?: Workflow_Purpose
  canEdit?: boolean
  refreshKey?: number
  hideWhenUnconfigured?: boolean
  showPreActionWhenUnconfigured?: boolean
  preActionTitleKey?: string
  preActionDescriptionKey?: string
}>()
const emit = defineEmits<{ changed: [] }>()
const { locale, t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const { showError } = useApiErrorToast()
const isSaving: Ref<boolean> = ref(false)
const isStarting: Ref<boolean> = ref(false)
const isCancelling: Ref<boolean> = ref(false)
const responses: Ref<RecommendationResponse[]> = ref([])
const validationIssues: Ref<Array<{ questionKey: string, message: string }>> = ref([])
const replacementOwners: Ref<Record<string, string>> = ref({})
const isResuming: Ref<boolean> = ref(false)
const selectedStepId: Ref<string | null> = ref(null)
const activeWorkflowTab: Ref<string> = ref('current')
const selectedAttemptId: Ref<string | null> = ref(null)
const isChooserOpen: Ref<boolean> = ref(false)
const selectedWorkflowSetupId: Ref<string | null> = ref(null)
const availableWorkflows: Ref<AvailableStandardWorkflow[]> = ref([])
const isLoadingAvailable: Ref<boolean> = ref(false)
const availableWorkflowsStatus: Ref<'idle' | 'pending' | 'success' | 'error'> = ref('idle')
let availableWorkflowsRequestGeneration = 0
const endpoint = computed(() => `/api/workflows/runtime?entityType=${entityType}&entityId=${entityId}&purpose=${purpose}${selectedAttemptId.value ? `&runtimeId=${selectedAttemptId.value}` : ''}`)
const { data, refresh, status, error = ref(undefined) } = await useFetch<RuntimeResponse, Error, string>(endpoint)
const runtimeIdentity = computed(() => `${entityType}:${entityId}:${purpose}`)
let runtimeIdentityGeneration = 0
watch(runtimeIdentity, () => {
  runtimeIdentityGeneration += 1
  data.value = undefined
  responses.value = []
  validationIssues.value = []
  replacementOwners.value = {}
  selectedStepId.value = null
  selectedAttemptId.value = null
  activeWorkflowTab.value = 'current'
  isChooserOpen.value = false
  selectedWorkflowSetupId.value = null
  availableWorkflows.value = []
  availableWorkflowsStatus.value = 'idle'
  isStarting.value = false
  isCancelling.value = false
  isResuming.value = false
  isSaving.value = false
})
const captureRuntimeIdentity = () => runtimeIdentityGeneration
const isCurrentRuntimeIdentity = (generation: number) => generation === runtimeIdentityGeneration
const runtimeLoadFailed = computed(() => status.value === 'error' || error.value != null)
const hasActiveWorkflow = computed(() => data.value?.current
  ? ['pending', 'active', 'awaiting_action', 'paused'].includes(data.value.current.runtimeState)
  : false)
const shouldRenderSection = computed(() => !hideWhenUnconfigured
  || status.value !== 'success'
  || Boolean(data.value?.current)
  || Boolean(data.value?.previous?.length)
  || Boolean(data.value?.applicable?.workflow)
  || Boolean(data.value?.submission))
const showWorkflowContent = computed(() => activeWorkflowTab.value !== 'previous' || Boolean(selectedAttemptId.value))
const startBlockerDescription = computed(() => {
  const blocker = data.value?.startBlocker
  if (!blocker) return ''
  if (blocker.reason === 'active_workflow') {
    const name = locale.value === 'fr' ? blocker.name_fr : blocker.name_en
    return t('workflow.start_blockers.active_workflow', {
      name: name || t('workflow.unnamed_workflow'),
      purpose: t(`workflow.purposes.${blocker.purpose ?? 'standard'}`)
    })
  }
  return t(`workflow.start_blockers.${blocker.reason}`)
})
const ownerCandidatesUrl = computed(() => data.value?.current
  ? `/api/workflows/owner-candidates?entityType=${entityType}&entityId=${entityId}&purpose=${purpose}&runtimeId=${data.value.current.runtimeId}`
  : '/api/workflows/owner-candidates')
watch(() => refreshKey, async () => {
  await refresh()
})
watch(activeWorkflowTab, async tab => {
  selectedAttemptId.value = tab === 'previous' ? data.value?.previous?.[0]?.runtimeId ?? null : null
  await refresh()
})
const retryRuntime = async () => {
  await refresh()
}
const currentRecommendation = computed(() => data.value?.recommendations?.find(
  (item: RuntimeRecommendation) => item.runtimeState === 'active' || item.runtimeState === 'awaiting_action'
) ?? null)
type PublishedWorkflowPreview = {
  members: Array<{
    eligibility?: { eligible: boolean, unmatchedFieldIds: string[] }
    memberId: string
    sequence: number
    kind: 'review_set' | 'recommendation_set' | 'approval_template'
    reviewPlan?: { name: { en: string, fr: string }, description: { en: string, fr: string } }
    recommendationPlan?: { nameEn: string, nameFr: string, descriptionEn: string, descriptionFr: string }
    approval?: PublishedApprovalPreview
  }>
}
type PublishedApprovalPreview = {
  templateId: string
  nameEn: string
  nameFr: string
  descriptionEn: string
  descriptionFr: string
}
type PublishedApprovalReference = {
  definition: PublishedApprovalPreview
}
const applicableWorkflow = computed(() => data.value?.applicable?.workflow ?? null)
const showPreActionReport = computed(() => purpose !== 'standard'
  && !data.value?.current
  && (Boolean(applicableWorkflow.value) || showPreActionWhenUnconfigured))
const preActionTitle = computed(() => applicableWorkflow.value
  ? (locale.value === 'fr' ? applicableWorkflow.value.egcs_cn_name_fr : applicableWorkflow.value.egcs_cn_name_en)
  : preActionTitleKey ? t(preActionTitleKey) : '')
const preActionDescription = computed(() => applicableWorkflow.value
  ? (locale.value === 'fr' ? applicableWorkflow.value.egcs_cn_description_fr : applicableWorkflow.value.egcs_cn_description_en)
  : preActionDescriptionKey ? t(preActionDescriptionKey) : '')
const selectedAvailableWorkflow = computed(() => availableWorkflows.value.find(item => item.workflowSetupId === selectedWorkflowSetupId.value) ?? null)
const loadAvailableWorkflows = async () => {
  if (purpose !== 'standard') return
  const requestGeneration = ++availableWorkflowsRequestGeneration
  selectedWorkflowSetupId.value = null
  availableWorkflows.value = []
  availableWorkflowsStatus.value = 'pending'
  isLoadingAvailable.value = true
  try {
    const requestUrl = getClientRequestUrl('/api/workflows/available')
    requestUrl.searchParams.set('entityType', entityType)
    requestUrl.searchParams.set('entityId', entityId)
    const response = await fetch(requestUrl)
    if (!response.ok) await throwFetchResponseError(response)
    const payload = await response.json() as { items?: AvailableStandardWorkflow[] } | AvailableStandardWorkflow[]
    if (requestGeneration !== availableWorkflowsRequestGeneration) return
    availableWorkflows.value = Array.isArray(payload) ? payload : payload.items ?? []
    availableWorkflowsStatus.value = 'success'
  } catch (error) {
    if (requestGeneration !== availableWorkflowsRequestGeneration) return
    availableWorkflows.value = []
    availableWorkflowsStatus.value = 'error'
    showError(error)
  } finally {
    if (requestGeneration === availableWorkflowsRequestGeneration) isLoadingAvailable.value = false
  }
}
const openChooser = async () => {
  selectedWorkflowSetupId.value = null
  isChooserOpen.value = true
  await loadAvailableWorkflows()
}
const workflowPreviewTitle = computed(() => purpose === 'risk_rating'
  ? t('agreement.risk_rating_steps')
  : t('workflow.preview_caption'))
const workflowStartLabel = computed(() => purpose === 'risk_rating'
  ? t('agreement.risk_rating_start')
  : t('workflow.start_recommendation'))
const workflowStartIcon = computed(() => purpose === 'risk_rating'
  ? 'i-lucide-gauge'
  : 'i-lucide-message-square-quote')
const previewConfiguration = computed(() => applicableWorkflow.value?.publicationDefinition as PublishedWorkflowPreview | undefined)
const workflowPreview = computed(() => {
  const configuration = previewConfiguration.value
  if (!Array.isArray(configuration?.members)) return []
  return configuration.members.map(member => {
    if (member.kind === 'review_set') {
      return {
        id: `preview-${member.memberId}`,
        type: t('workflow.preview_types.review_set'),
        name: locale.value === 'fr' ? member.reviewPlan?.name.fr : member.reviewPlan?.name.en,
        description: locale.value === 'fr' ? member.reviewPlan?.description.fr : member.reviewPlan?.description.en,
        ordinal: member.sequence
      }
    }
    const definition = member.recommendationPlan ?? member.approval
    return {
      id: `preview-${member.memberId}`,
      type: t(`workflow.preview_types.${member.kind === 'approval_template' ? 'approvals' : member.kind}`),
      name: locale.value === 'fr' ? definition?.nameFr : definition?.nameEn,
      description: locale.value === 'fr' ? definition?.descriptionFr : definition?.descriptionEn,
      ordinal: member.sequence
    }
  })
})
type WorkflowPreviewRow = (typeof workflowPreview.value)[number]
const workflowPreviewColumns = computed<TableColumn<WorkflowPreviewRow>[]>(() => [
  { accessorKey: 'ordinal', header: t('workflow.step') },
  { accessorKey: 'type', header: t('common.type') },
  { accessorKey: 'name', header: t('common.name') },
  { accessorKey: 'description', header: t('common.description') }
])
const finalApprovalStepId = 'final-approval'
const unmaterializedStepStatus = (runStatus: RuntimeState | undefined): 'upcoming' | 'not_reached' => {
  if (!runStatus) return 'upcoming'
  return ['succeeded', 'approved', 'unsuccessful', 'denied', 'cancelled', 'failed'].includes(runStatus)
    ? 'not_reached'
    : 'upcoming'
}
const reviewLocation = (review: RuntimeReview) => localePath({
  ...(review.egcs_cn_reviewtype === 'assessment'
    ? appRouteLocations.assessmentDetail(review.id)
    : appRouteLocations.checklistDetail(review.id)),
  query: { returnTo: route.fullPath }
})
const workflowSteps = computed<WorkflowDisplayStep[]>(() => {
  const runStatus = data.value?.current?.runtimeState
  if (data.value?.steps) {
    let ordinal = 0
    const steps: WorkflowDisplayStep[] = []
    for (const member of data.value.steps) {
      if (member.eligibility?.eligible === false) {
        steps.push({ id: `skipped-${member.memberId}`, ordinal: ++ordinal, name: t(`workflow.${member.kind}`), status: 'skipped', outcome: null, hasApproval: false, kind: 'review' })
        continue
      }
      if (member.kind === 'review_set') {
        steps.push({
          id: `review-${member.memberId}`, ordinal: ++ordinal,
          name: (locale.value === 'fr' ? member.reviewPlan?.name.fr : member.reviewPlan?.name.en) ?? t('workflow.review_set'),
          status: member.runtimeItem?.runtimeState ?? unmaterializedStepStatus(runStatus),
          outcome: null, hasApproval: false, kind: 'review' as const
        })
        if (member.reviewPlan?.finalApproval) steps.push({
          id: `review-approval-${member.memberId}`, ordinal: ++ordinal,
          name: locale.value === 'fr'
            ? member.reviewPlan.finalApproval.definition.nameFr
            : member.reviewPlan.finalApproval.definition.nameEn,
          status: member.approvalStage?.runtimeState ?? unmaterializedStepStatus(runStatus),
          outcome: null, hasApproval: false, kind: 'final_approval' as const,
          routingSlipId: member.approvalStage?.routingSlipId
        })
      } else if (member.kind === 'recommendation_set') {
        for (const nested of member.recommendationPlan?.members ?? []) {
          const recommendation = data.value?.recommendations?.find(item => String(item.egcs_cn_recommendationsetup) === nested.memberId)
          steps.push({
            id: nested.memberId, ordinal: ++ordinal,
            name: locale.value === 'fr' ? nested.schemaNameFr : nested.schemaNameEn,
            status: recommendation?.runtimeState ?? unmaterializedStepStatus(runStatus),
            outcome: recommendation?.egcs_cn_outcome ?? null,
            hasApproval: Boolean(nested.approval), kind: 'recommendation' as const
          })
        }
        if (member.recommendationPlan?.finalApproval) steps.push({
          id: `recommendation-approval-${member.memberId}`, ordinal: ++ordinal,
          name: locale.value === 'fr'
            ? member.recommendationPlan.finalApproval.definition.nameFr
            : member.recommendationPlan.finalApproval.definition.nameEn,
          status: member.approvalStage?.runtimeState ?? unmaterializedStepStatus(runStatus),
          outcome: null, hasApproval: false, kind: 'final_approval' as const,
          routingSlipId: member.approvalStage?.routingSlipId
        })
      } else {
        steps.push({
          id: `approval-${member.memberId}`, ordinal: ++ordinal,
          name: (locale.value === 'fr' ? member.approval?.nameFr : member.approval?.nameEn) ?? t('workflow.final_approval'),
          status: member.runtimeItem?.runtimeState ?? unmaterializedStepStatus(runStatus),
          outcome: null, hasApproval: false, kind: 'final_approval' as const,
          routingSlipId: data.value?.sourceApprovalStage?.routingSlipId ?? undefined
        })
      }
    }
    return steps
  }
  const reviewSteps = data.value?.plan?.review
    ? [{
        id: `review-${data.value.reviewSet?.id ?? 'pending'}`,
        ordinal: 1,
        name: locale.value === 'fr' ? data.value.plan.review.name_fr : data.value.plan.review.name_en,
        status: data.value.reviewSet?.runtimeState ?? unmaterializedStepStatus(runStatus),
        outcome: null,
        hasApproval: false,
        kind: 'review' as const
      }]
    : []
  const recommendationSteps = (data.value?.plan?.recommendations ?? []).map(member => {
    const recommendation = data.value?.recommendations?.find(item => String(item.egcs_cn_recommendationsetup) === member.setup_id)
    return {
      id: member.setup_id,
      ordinal: member.ordinal + reviewSteps.length,
      name: locale.value === 'fr' ? member.name_fr : member.name_en,
      status: recommendation?.runtimeState ?? unmaterializedStepStatus(runStatus),
      outcome: recommendation?.egcs_cn_outcome ?? null,
      hasApproval: member.has_approval,
      kind: 'recommendation' as const
    }
  })
  if (!data.value?.plan?.has_final_approval) return [...reviewSteps, ...recommendationSteps]
  return [...reviewSteps, ...recommendationSteps, {
    id: finalApprovalStepId,
    ordinal: reviewSteps.length + recommendationSteps.length + 1,
    name: t('workflow.final_approval'),
    status: data.value?.sourceApprovalStage?.runtimeState ?? unmaterializedStepStatus(runStatus),
    outcome: null,
    hasApproval: false,
    kind: 'final_approval' as const
  }]
})
const selectedRecommendation = computed(() => data.value?.recommendations?.find(
  item => String(item.egcs_cn_recommendationsetup) === selectedStepId.value
) ?? null)
const canEditSelectedRecommendation = computed(() => canEdit && selectedRecommendation.value?.canUpdate === true)
const selectedStep = computed(() => workflowSteps.value.find(step => step.id === selectedStepId.value) ?? null)
const isStepViewable = (step: WorkflowDisplayStep): boolean =>
  step.status !== 'upcoming' && step.status !== 'not_reached' && step.status !== 'skipped'
const previousAttempts = computed(() => (data.value?.previous ?? []).map(attempt => ({
  ...attempt,
  id: attempt.runtimeId
})))
const hasTerminalResult = computed(() => data.value?.current
  ? ['succeeded', 'approved', 'unsuccessful', 'denied', 'cancelled', 'failed'].includes(data.value.current.runtimeState)
  : false)
const selectedReviews = computed(() => {
  if (selectedStep.value?.kind !== 'review') return []
  const workflowMemberId = selectedStep.value.id.replace(/^review-/, '')
  const member = data.value?.steps?.find(candidate => candidate.memberId === workflowMemberId)
  return data.value?.reviews.filter(review => review.workflowMemberOrder === member?.sequence) ?? []
})
const selectStep = (step: WorkflowDisplayStep) => {
  if (isStepViewable(step)) selectedStepId.value = String(step.id)
}
const selectAttempt = async (attempt: { runtimeId: string }) => {
  selectedAttemptId.value = attempt.runtimeId
  selectedStepId.value = null
  await refresh()
}
watch([currentRecommendation, () => data.value?.current?.runtimeState], ([recommendation]) => {
  if (recommendation) {
    selectedStepId.value = String(recommendation.egcs_cn_recommendationsetup)
  } else if (data.value?.sourceApprovalStage?.runtimeState === 'awaiting_action') {
    selectedStepId.value = workflowSteps.value.find(step => step.kind === 'final_approval' && step.status === 'awaiting_action')?.id
      ?? finalApprovalStepId
  } else {
    const selected = workflowSteps.value.find(step => step.id === selectedStepId.value)
    if (!selected || !isStepViewable(selected)) {
      selectedStepId.value = workflowSteps.value.find(isStepViewable)?.id ?? null
    }
  }
}, { immediate: true })
watch(selectedRecommendation, item => {
  responses.value = item?.egcs_cn_response.responses ? structuredClone(item.egcs_cn_response.responses) : []
  validationIssues.value = []
}, { immediate: true })
const start = async () => {
  if (isStarting.value) return
  if (purpose === 'standard' && (
    availableWorkflowsStatus.value !== 'success'
    || selectedAvailableWorkflow.value?.eligible !== true
  )) return
  const generation = captureRuntimeIdentity()
  try {
    isStarting.value = true
    const response = await fetch(getClientRequestUrl('/api/workflows/start'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        entityType,
        entityId,
        purpose,
        ...(purpose === 'standard' ? { workflowSetupId: selectedWorkflowSetupId.value } : {})
      })
    })
    if (!response.ok) await throwFetchResponseError(response)
    if (!isCurrentRuntimeIdentity(generation)) return
    isChooserOpen.value = false
    await refresh()
    emit('changed')
  } catch (error) {
    if (isCurrentRuntimeIdentity(generation)) showError(error)
  } finally {
    if (isCurrentRuntimeIdentity(generation)) isStarting.value = false
  }
}
const retry = async () => {
  if (!data.value?.current) return
  const generation = captureRuntimeIdentity()
  try {
    const response = await fetch(getClientRequestUrl('/api/workflows/retry'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entityType, entityId, purpose, runtimeId: data.value.current.runtimeId })
    })
    if (!response.ok) await throwFetchResponseError(response)
    if (!isCurrentRuntimeIdentity(generation)) return
    await refresh()
    activeWorkflowTab.value = 'current'
    emit('changed')
  } catch (error) {
    if (isCurrentRuntimeIdentity(generation)) showError(error)
  }
}
const cancel = async () => {
  if (!data.value?.current || isCancelling.value || !window.confirm(t('workflow.cancel_confirmation'))) return
  const generation = captureRuntimeIdentity()
  try {
    isCancelling.value = true
    const response = await fetch(getClientRequestUrl('/api/workflows/cancel'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entityType, entityId, purpose, runtimeId: data.value.current.runtimeId })
    })
    if (!response.ok) await throwFetchResponseError(response)
    if (!isCurrentRuntimeIdentity(generation)) return
    await refresh()
    emit('changed')
  } catch (error) {
    if (isCurrentRuntimeIdentity(generation)) showError(error)
  } finally {
    if (isCurrentRuntimeIdentity(generation)) isCancelling.value = false
  }
}
const resume = async () => {
  const blockers = data.value?.ownerBlockers?.filter(blocker => !blocker.egcs_cn_resolvedat) ?? []
  if (!data.value?.current || blockers.some(blocker => !replacementOwners.value[blocker.id])) return
  const generation = captureRuntimeIdentity()
  try {
    isResuming.value = true
    const response = await fetch(getClientRequestUrl('/api/workflows/resume'), {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        entityType, entityId, purpose, runtimeId: data.value.current.runtimeId,
        replacements: blockers.map(blocker => ({ blockerId: blocker.id, ownerId: replacementOwners.value[blocker.id] }))
      })
    })
    if (!response.ok) await throwFetchResponseError(response)
    if (!isCurrentRuntimeIdentity(generation)) return
    await refresh()
    emit('changed')
  } catch (error) {
    if (isCurrentRuntimeIdentity(generation)) showError(error)
  } finally {
    if (isCurrentRuntimeIdentity(generation)) isResuming.value = false
  }
}
const persist = async (submit: boolean) => {
  if (isSaving.value || !canEditSelectedRecommendation.value || selectedRecommendation.value?.runtimeState !== 'active') return
  if (submit && selectedRecommendation.value) {
    validationIssues.value = validateRecommendationResponses(selectedRecommendation.value.egcs_cn_definition, responses.value)
    if (validationIssues.value.length > 0) return
  }
  const generation = captureRuntimeIdentity()
  try {
    isSaving.value = true
    const response = await fetch(getClientRequestUrl(`/api/workflows/recommendation${submit ? '/submit' : ''}?entityType=${entityType}&entityId=${entityId}&purpose=${purpose}`), {
      method: submit ? 'POST' : 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        revision: selectedRecommendation.value.egcs_cn_revision,
        responses: responses.value
      })
    })
    if (!response.ok) await throwFetchResponseError(response)
    if (!isCurrentRuntimeIdentity(generation)) return
    await refresh()
    emit('changed')
  } catch (error) {
    if (isCurrentRuntimeIdentity(generation)) {
      if (error instanceof AppFetchResponseError && error.response.status === 409) await refresh()
      showError(error)
    }
  } finally {
    if (isCurrentRuntimeIdentity(generation)) isSaving.value = false
  }
}
const handleApprovalChanged = async () => {
  await refresh()
  emit('changed')
}
</script>

<template>
  <section v-if="shouldRenderSection" class="min-w-0 space-y-6" :aria-label="t('workflow.title')">
    <div v-if="status === 'success' && purpose === 'standard' && !hasActiveWorkflow && activeWorkflowTab !== 'previous' && canEdit && data?.canStart" class="flex justify-end">
      <UButton
        icon="i-lucide-plus"
        :label="t('workflow.add_workflow')"
        class="cursor-default"
        @click="openChooser" />
    </div>
    <UAlert
      v-if="purpose === 'standard' && !hasActiveWorkflow && data?.activeWorkflowPurpose"
      color="warning"
      icon="i-lucide-lock-keyhole"
      :title="t('workflow.active_target_blocker')" />
    <CommonWorkflowPacket v-if="data?.routing?.fields.length" :title="t('custom_fields.routing')" :packet-id="`routing-${data.current?.runtimeId}`" :hash="data.routing.hash" :hash-label="t('workflow.packet.hash')">
      <dl class="space-y-3">
        <div v-for="field in data.routing.fields" :key="`${field.fieldId}:${field.optionId}`">
          <dt class="text-sm text-muted">
            {{ locale === 'fr' ? field.name_fr : field.name_en }}
          </dt>
          <dd>{{ locale === 'fr' ? field.option_fr : field.option_en }}</dd>
        </div>
      </dl>
    </CommonWorkflowPacket>
    <CommonWorkflowApprovalPacket v-if="data?.submission" :submission="data.submission" />
    <CommonTranslatedTabs
      v-if="data?.current || data?.previous?.length"
      v-model="activeWorkflowTab"
      :items="[{ key: 'workflow.current', value: 'current' }, { key: 'workflow.previous', value: 'previous' }]"
      orientation="horizontal" />
    <CommonSelectableTable
      v-if="activeWorkflowTab === 'previous' && previousAttempts.length"
      :items="previousAttempts"
      :selected-id="selectedAttemptId"
      :caption="t('workflow.attempts_caption')"
      :get-row-aria-label="attempt => t('workflow.view_attempt', { attempt: attempt.attempt })"
      @select="selectAttempt">
      <template #header>
        <th class="px-4 py-4">
          {{ t('workflow.attempt') }}
        </th>
        <th class="px-4 py-4">
          {{ t('common.status') }}
        </th>
        <th class="px-4 py-4">
          {{ t('workflow.result') }}
        </th>
        <th class="px-4 py-4 text-right">
          {{ t('common.actions') }}
        </th>
      </template>
      <template #row="{ item: attempt, selected, selectable, select, actionLabel }">
        <th scope="row" class="px-4 py-4 text-left font-semibold">
          {{ t('workflow.attempt_number', { attempt: attempt.attempt }) }}
        </th>
        <td class="px-4 py-4">
          <CommonLifecycleBadge engine="runtime" :state="attempt.runtimeState" />
        </td>
        <td class="px-4 py-4">
          <CommonLifecycleBadge engine="runtime" :state="attempt.runtimeState" />
        </td>
        <td class="px-4 py-4 text-right">
          <UButton
            v-if="selectable"
            color="neutral"
            variant="ghost"
            size="sm"
            class="cursor-default"
            :icon="selected ? 'i-lucide-check' : 'i-lucide-panel-top-open'"
            :aria-label="actionLabel"
            :aria-current="selected ? 'true' : undefined"
            @click="select">
            {{ selected ? t('common.selected') : t('workflow.view') }}
          </UButton>
        </td>
      </template>
    </CommonSelectableTable>
    <p v-else-if="activeWorkflowTab === 'previous'" class="text-sm text-muted">
      {{ t('workflow.no_previous') }}
    </p>
    <div v-if="showWorkflowContent && status === 'pending'" class="h-24 animate-pulse rounded-sm bg-muted" />
    <UAlert
      v-else-if="runtimeLoadFailed"
      color="error"
      variant="soft"
      icon="i-lucide-circle-alert"
      :title="t('workflow.runtime_load_failed')"
      :description="t('workflow.runtime_load_failed_description')">
      <template #actions>
        <UButton color="error" variant="soft" size="sm" icon="i-lucide-refresh-cw" :label="t('common.retry')" @click="retryRuntime" />
      </template>
    </UAlert>
    <CommonPreActionReport
      v-else-if="showWorkflowContent && showPreActionReport"
      :title="preActionTitle"
      :description="preActionDescription">
      <template v-if="$slots['pre-action-action'] || (canEdit && data?.canStart)" #action>
        <slot v-if="$slots['pre-action-action']" name="pre-action-action" />
        <UButton
          v-else
          :icon="workflowStartIcon"
          :label="workflowStartLabel"
          :loading="isStarting"
          :disabled="isStarting"
          class="cursor-default"
          @click="start" />
      </template>

      <template v-if="$slots['pre-action-notices']" #notices>
        <slot name="pre-action-notices" />
      </template>

      <slot name="pre-action" />

      <CommonNumberedSection v-if="workflowPreview.length > 0" :number="1" :title="workflowPreviewTitle">
        <CommonCompactTable
          :data="workflowPreview"
          :columns="workflowPreviewColumns"
          :aria-label="workflowPreviewTitle"
          :ui="{ th: 'whitespace-nowrap', td: 'align-top' }">
          <template #ordinal-cell="{ row }">
            <span class="font-mono text-xs font-semibold text-primary">{{ row.original.ordinal }}</span>
          </template>
          <template #type-cell="{ row }">
            <span class="font-medium text-muted">{{ row.original.type }}</span>
          </template>
          <template #name-cell="{ row }">
            <span class="font-semibold text-highlighted">{{ row.original.name }}</span>
          </template>
          <template #description-cell="{ row }">
            <span class="text-muted">{{ row.original.description || t('common.not_available') }}</span>
          </template>
        </CommonCompactTable>
      </CommonNumberedSection>
    </CommonPreActionReport>
    <div v-else-if="showWorkflowContent && data?.current && (data.plan || data.steps)" class="space-y-6">
      <div v-if="hasTerminalResult" class="flex items-center justify-end gap-2">
        <span class="text-sm font-medium text-muted">{{ t('workflow.result') }}</span>
        <CommonLifecycleBadge engine="runtime" :state="data.current.runtimeState" />
        <UButton v-if="canEdit && data.canRetry" icon="i-lucide-rotate-ccw" :label="t('workflow.retry')" class="cursor-default" @click="retry" />
      </div>
      <div v-else-if="canEdit && data.canCancel" class="flex justify-end">
        <UButton color="error" variant="outline" icon="i-lucide-ban" :label="t('workflow.cancel')" :loading="isCancelling" :disabled="isCancelling" @click="cancel" />
      </div>
      <div v-if="data.current.runtimeState === 'paused'" class="space-y-4 rounded-lg border border-warning/40 bg-warning/5 p-4">
        <UAlert color="warning" icon="i-lucide-pause-circle" :title="t('workflow.owner_pause_title')" :description="t(data.canResumeOwners ? 'workflow.owner_pause_help' : 'workflow.owner_pause_readonly_help')" />
        <template v-if="data.canResumeOwners">
          <UFormField v-for="blocker in data.ownerBlockers?.filter(item => !item.egcs_cn_resolvedat)" :key="blocker.id" :label="t('workflow.replacement_owner')">
            <CommonServerLookupSelect
              v-model="replacementOwners[blocker.id]"
              :fetch-url="ownerCandidatesUrl"
              value-key="id" label-en-key="egcs_cn_name_en" label-fr-key="egcs_cn_name_fr"
              :show-value-in-label="false" />
          </UFormField>
          <div class="flex justify-end">
            <UButton :label="t('workflow.resume')" icon="i-lucide-play" :loading="isResuming" :disabled="isResuming" @click="resume" />
          </div>
        </template>
      </div>
      <div class="border-default border-b pb-5">
        <CommonSelectableTable
          :items="workflowSteps"
          :selected-id="selectedStepId"
          :caption="t('workflow.sequence_caption')"
          :get-row-aria-label="step => t('workflow.view_step', { step: step.name })"
          :is-selectable="isStepViewable"
          @select="selectStep">
          <template #header>
            <th class="w-20 px-4 py-4">
              {{ t('workflow.step') }}
            </th>
            <th class="min-w-72 px-4 py-4">
              {{ t('common.name') }}
            </th>
            <th class="min-w-48 px-4 py-4">
              {{ t('common.status') }}
            </th>
            <th class="w-28 px-4 py-4 text-right">
              {{ t('common.actions') }}
            </th>
          </template>
          <template #row="{ item: step, selected, selectable, select, actionLabel }">
            <th scope="row" class="px-4 py-4 text-left font-mono text-xs font-semibold text-primary">
              {{ step.ordinal }}
            </th>
            <td class="px-4 py-4">
              <div class="font-semibold text-highlighted">
                {{ step.name }}
              </div>
              <div v-if="step.hasApproval" class="mt-1 text-xs text-muted">
                {{ t('workflow.followed_by_recommendation_approval') }}
              </div>
            </td>
            <td class="px-4 py-4">
              <div class="flex flex-wrap gap-2">
                <CommonLifecycleBadge
                  v-if="step.status !== 'upcoming' && step.status !== 'not_reached' && step.status !== 'skipped'"
                  engine="runtime"
                  :state="step.status" />
                <CommonStatusBadge
                  v-else
                  variant="count"
                  :label="t(step.status === 'skipped' ? 'custom_fields.skipped' : step.status === 'not_reached' ? 'workflow.not_reached' : 'workflow.upcoming')" />
                <CommonStatusBadge
                  v-if="step.outcome"
                  enum-name="recommendation_outcome"
                  :status="step.outcome" />
              </div>
            </td>
            <td class="px-4 py-4 text-right">
              <UButton
                v-if="selectable"
                color="neutral"
                variant="ghost"
                size="sm"
                class="cursor-default"
                :icon="selected ? 'i-lucide-check' : 'i-lucide-panel-top-open'"
                :aria-label="actionLabel"
                :aria-current="selected ? 'true' : undefined"
                @click="select">
                {{ selected ? t('common.selected') : t('workflow.view') }}
              </UButton>
              <span v-else class="text-muted">{{ t('common.not_available') }}</span>
            </td>
          </template>
        </CommonSelectableTable>
      </div>
      <div v-if="selectedRecommendation" class="space-y-6">
        <UAlert
          v-if="validationIssues.length > 0"
          color="error"
          icon="i-lucide-circle-alert"
          :title="t('workflow.recommendation_validation_title')"
          :description="t('workflow.recommendation_validation_description')" />
        <RecommendationForm
          v-model:responses="responses"
          :definition="selectedRecommendation.egcs_cn_definition"
          :issues="validationIssues"
          :readonly="!canEditSelectedRecommendation || selectedRecommendation.runtimeState !== 'active'" />
        <div v-if="canEditSelectedRecommendation && selectedRecommendation.runtimeState === 'active'" class="flex justify-end gap-2">
          <CommonSaveButton :label="t('common.save')" :loading="isSaving" :disabled="isSaving" variant="outline" @click="persist(false)" />
          <UButton icon="i-lucide-send" :label="t('workflow.submit_recommendation')" :loading="isSaving" class="cursor-default" @click="persist(true)" />
        </div>
        <AssessmentApprovalsSection
          v-if="selectedRecommendation.routingSlipId"
          entity-type="commonrecommendation"
          :entity-id="String(selectedRecommendation.id)"
          :routing-slip-id="selectedRecommendation.routingSlipId"
          hide-title
          @changed="handleApprovalChanged" />
      </div>
      <AssessmentApprovalsSection
        v-else-if="selectedStep?.kind === 'final_approval' && 'routingSlipId' in selectedStep && selectedStep.routingSlipId"
        :entity-type="entityType"
        :entity-id="entityId"
        :routing-slip-id="'routingSlipId' in selectedStep ? selectedStep.routingSlipId : undefined"
        hide-title
        @changed="handleApprovalChanged" />
      <div v-else-if="selectedStep?.kind === 'review' && selectedReviews.length > 0" class="space-y-3">
        <div v-for="review in selectedReviews" :key="review.id" class="flex items-center justify-between gap-4 border-default border-b py-3">
          <div>
            <p class="font-semibold text-highlighted">
              {{ locale === 'fr' ? review.egcs_cn_name_fr : review.egcs_cn_name_en }}
            </p>
            <CommonLifecycleBadge engine="runtime" :state="review.runtimeState" class="mt-1" />
          </div>
          <UButton
            :to="reviewLocation(review)"
            color="neutral" variant="outline" icon="i-lucide-panel-top-open" class="cursor-default"
            :label="t('workflow.open_review')" />
        </div>
      </div>
      <p v-else class="text-sm text-muted">
        {{ t('workflow.step_not_started') }}
      </p>
      <div v-if="data.transitions?.length" class="space-y-2 border-t border-default pt-5">
        <h3 class="font-semibold">
          {{ t('workflow.transition_history') }}
        </h3>
        <div v-for="transition in data.transitions" :key="transition.id" class="flex flex-wrap items-center gap-2 text-sm">
          <span>{{ t(`workflow.transition_events.${transition.egcs_cn_event}`) }}</span>
          <CommonStatusBadge :status-id="transition.egcs_cn_previousstatus" />
          <UIcon name="i-lucide-arrow-right" aria-hidden="true" />
          <CommonStatusBadge :status-id="transition.egcs_cn_newstatus" />
        </div>
      </div>
    </div>
    <p v-else-if="showWorkflowContent && !data?.current && purpose === 'standard' && canEdit && data?.canStart" class="text-sm text-muted">
      {{ t('workflow.standard_empty') }}
    </p>
    <UAlert
      v-else-if="showWorkflowContent && !data?.current && purpose === 'standard'"
      color="warning"
      icon="i-lucide-triangle-alert"
      :title="t('workflow.standard_unavailable')"
      :description="startBlockerDescription" />
    <p v-else-if="showWorkflowContent && !data?.current && !data?.applicable?.workflow" class="text-sm text-muted">
      {{ t(purpose === 'approval_submission' ? 'workflow.approval_not_configured' : 'workflow.not_configured') }}
    </p>

    <UModal v-model:open="isChooserOpen" :title="t('workflow.add_workflow')" :description="t('workflow.add_workflow_description')" :ui="{ content: 'sm:max-w-4xl' }">
      <template #body>
        <div class="space-y-6">
          <div v-if="isLoadingAvailable" class="h-24 animate-pulse rounded-sm bg-muted" />
          <UAlert
            v-else-if="availableWorkflowsStatus === 'error'"
            color="error"
            variant="soft"
            icon="i-lucide-circle-alert"
            :title="t('workflow.available_load_failed')"
            :description="t('workflow.available_load_failed_description')">
            <template #actions>
              <UButton color="error" variant="soft" size="sm" icon="i-lucide-refresh-cw" :label="t('common.retry')" @click="loadAvailableWorkflows" />
            </template>
          </UAlert>
          <p v-else-if="availableWorkflows.length === 0" class="text-sm text-muted">
            {{ t('workflow.no_available_workflows') }}
          </p>
          <div v-else class="grid gap-3 sm:grid-cols-2">
            <button
              v-for="workflow in availableWorkflows"
              :key="workflow.workflowSetupId"
              type="button"
              class="rounded-md border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-70"
              :class="selectedWorkflowSetupId === workflow.workflowSetupId ? 'border-primary bg-primary/5' : workflow.eligible ? 'border-default hover:border-primary/60' : 'border-default bg-muted/40'"
              :disabled="!workflow.eligible"
              :aria-describedby="workflow.ineligibleReason ? `workflow-ineligible-${workflow.workflowSetupId}` : undefined"
              @click="selectedWorkflowSetupId = workflow.workflowSetupId">
              <span class="flex items-start justify-between gap-3">
                <span class="font-semibold text-highlighted">{{ locale === 'fr' ? workflow.name_fr : workflow.name_en }}</span>
                <CommonStatusBadge
                  v-if="!workflow.eligible"
                  variant="meta"
                  size="sm"
                  icon="i-lucide-lock-keyhole"
                  :label="t('common.unavailable')" />
              </span>
              <span class="mt-1 block text-sm text-muted">{{ locale === 'fr' ? workflow.description_fr : workflow.description_en }}</span>
              <span class="mt-2 block text-xs text-muted">{{ t('workflow.version', { version: workflow.version }) }}</span>
              <span
                v-if="workflow.ineligibleReason"
                :id="`workflow-ineligible-${workflow.workflowSetupId}`"
                class="mt-3 flex items-start gap-2 text-sm text-warning">
                <UIcon name="i-lucide-info" class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>{{ t(`workflow.start_blockers.${workflow.ineligibleReason}`) }}</span>
              </span>
            </button>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="outline" :label="t('common.cancel')" @click="isChooserOpen = false" />
          <UButton icon="i-lucide-play" :label="t('workflow.start')" :loading="isStarting" :disabled="availableWorkflowsStatus !== 'success' || !selectedAvailableWorkflow?.eligible || isStarting" @click="start" />
        </div>
      </template>
    </UModal>
  </section>
</template>
