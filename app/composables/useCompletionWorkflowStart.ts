import { computed, onScopeDispose, ref, toValue, watch } from 'vue'
import type { MaybeRefOrGetter, Ref } from 'vue'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { resolveApiErrorDetails } from '~/composables/useApiErrorToast'
import type { Entity_Type } from '~~/shared/types/database'

export type WorkflowPreActionMode = 'completion' | 'recommendation_submission'

type CompletionResponse = {
  item: { id: string } | null
  can_complete: boolean
  blockerParameters?: { name: string, purpose: string }
  blocker?: 'active_workflow' | 'approval_workflow_missing' | 'claim_lines_required' | 'claim_lines_unallocated' | 'lines_required' | 'funding_breakdown_required' | 'payment_total_mismatch' | 'final_reconcile_approved' | 'business_status' | 'risk_workflow_required' | 'risk_score_required' | 'risk_rating_frozen' | 'payment_recovery_control' | 'closed_target' | 'terminal_status' | 'no_published_workflow' | 'status_ineligible' | 'unsupported' | null
}

type RecommendationSubmissionResponse = {
  current: { runtimeId: string } | null
  submission?: { egcs_fc_canonicalhash: string } | null
  canStart?: boolean
  startBlocker?: { reason: NonNullable<CompletionResponse['blocker']>, name_en?: string, name_fr?: string, purpose?: string } | null
}

type CompletionWorkflowStartOptions = {
  mode?: MaybeRefOrGetter<WorkflowPreActionMode>
  entityType: MaybeRefOrGetter<Entity_Type>
  entityId: MaybeRefOrGetter<string>
  isLocked?: MaybeRefOrGetter<boolean>
  completePayload?: MaybeRefOrGetter<unknown>
  completedSuccessKey: MaybeRefOrGetter<string>
  confirmationMessageKey?: MaybeRefOrGetter<string | undefined>
  immediate?: boolean
  onCompleted: () => void
}

/**
 * Shares completion readiness and submission state between report actions and notices.
 * @param options - Reactive target, completion options, and success callback.
 * @returns Shared readiness, notices, action, and activation controls.
 */
export const useCompletionWorkflowStart = (options: CompletionWorkflowStartOptions) => {
  const { t, locale } = useI18n()
  const toast = useToast()
  const { showError } = useApiErrorToast()
  const completionResponse: Ref<CompletionResponse | null> = ref(null)
  const completionErrorDetails: Ref<string[]> = ref([])
  const isLoading: Ref<boolean> = ref(false)
  const isSubmitting: Ref<boolean> = ref(false)
  const loadStatus: Ref<'idle' | 'pending' | 'success' | 'error'> = ref('idle')
  const isActive: Ref<boolean> = ref(options.immediate !== false)
  let completionRequestGeneration = 0
  onScopeDispose(() => {
    isActive.value = false
    completionRequestGeneration += 1
  })
  const mode = computed(() => toValue(options.mode) ?? 'completion')
  const entityIdentity = computed(() => `${mode.value}:${toValue(options.entityType)}:${toValue(options.entityId)}`)
  const item = computed(() => completionResponse.value?.item ?? null)
  const canComplete = computed(() => loadStatus.value === 'success'
    && completionResponse.value?.can_complete === true
    && !toValue(options.isLocked))

  /** Refreshes whether the target can be completed and whether completion already exists. */
  const refreshCompletion = async () => {
    const requestGeneration = ++completionRequestGeneration
    const requestMode = mode.value
    completionResponse.value = null
    loadStatus.value = 'pending'
    isLoading.value = true
    try {
      const requestUrl = getClientRequestUrl(requestMode === 'recommendation_submission'
        ? '/api/workflows/runtime'
        : '/api/completions/runtime')
      if (requestMode === 'recommendation_submission') requestUrl.searchParams.set('purpose', 'approval_submission')
      requestUrl.searchParams.set('entityType', toValue(options.entityType))
      requestUrl.searchParams.set('entityId', toValue(options.entityId))
      const response = await fetch(requestUrl)
      if (!response.ok) await throwFetchResponseError(response)
      const responsePayload = await response.json() as CompletionResponse | RecommendationSubmissionResponse
      if (requestGeneration !== completionRequestGeneration) return
      let nextCompletionResponse: CompletionResponse
      if (requestMode === 'recommendation_submission') {
        const submissionResponse = responsePayload as RecommendationSubmissionResponse
        const existingItemId = submissionResponse.current?.runtimeId ?? submissionResponse.submission?.egcs_fc_canonicalhash
        const blocker = submissionResponse.startBlocker
        nextCompletionResponse = {
          item: existingItemId ? { id: existingItemId } : null,
          can_complete: submissionResponse.canStart === true,
          blocker: blocker?.reason ?? null,
          blockerParameters: {
            name: (locale.value === 'fr' ? blocker?.name_fr : blocker?.name_en) || t('workflow.unnamed_workflow'),
            purpose: t(`workflow.purposes.${blocker?.purpose ?? 'standard'}`)
          }
        }
      } else {
        nextCompletionResponse = responsePayload as CompletionResponse
      }
      completionResponse.value = nextCompletionResponse
      loadStatus.value = 'success'
    } catch (error) {
      if (requestGeneration !== completionRequestGeneration) return
      completionResponse.value = null
      loadStatus.value = 'error'
      showError(error)
    } finally {
      if (requestGeneration === completionRequestGeneration) isLoading.value = false
    }
  }

  watch([entityIdentity, isActive], async () => {
    completionErrorDetails.value = []
    isSubmitting.value = false
    if (isActive.value) {
      await refreshCompletion()
    } else {
      completionRequestGeneration += 1
      completionResponse.value = null
      loadStatus.value = 'idle'
      isLoading.value = false
    }
  }, { immediate: true })

  /** Starts the explicit Completion or Agreement Recommendation submission action. */
  const startWorkflow = async () => {
    if (!isActive.value || !canComplete.value || isSubmitting.value) return
    const confirmationMessageKey = toValue(options.confirmationMessageKey)
    if (confirmationMessageKey && !window.confirm(t(confirmationMessageKey))) return

    const submittedIdentity = entityIdentity.value
    const submittedGeneration = completionRequestGeneration
    try {
      isSubmitting.value = true
      completionErrorDetails.value = []
      const response = await fetch(getClientRequestUrl(mode.value === 'recommendation_submission'
        ? '/api/workflows/start'
        : '/api/completions/complete'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(mode.value === 'recommendation_submission'
          ? {
              entityType: toValue(options.entityType),
              entityId: toValue(options.entityId),
              purpose: 'approval_submission'
            }
          : {
              entityType: toValue(options.entityType),
              entityId: toValue(options.entityId),
              comments: null,
              payload: toValue(options.completePayload)
            })
      })
      if (!response.ok) await throwFetchResponseError(response)
      if (!isActive.value || submittedIdentity !== entityIdentity.value || submittedGeneration !== completionRequestGeneration) return
      const refreshGeneration = completionRequestGeneration + 1
      await refreshCompletion()
      if (!isActive.value || submittedIdentity !== entityIdentity.value || refreshGeneration !== completionRequestGeneration) return
      options.onCompleted()
      toast.add({
        title: t('common.success'),
        description: t(toValue(options.completedSuccessKey)),
        color: 'success'
      })
    } catch (error) {
      if (!isActive.value || submittedIdentity !== entityIdentity.value || submittedGeneration !== completionRequestGeneration) return
      completionErrorDetails.value = resolveApiErrorDetails(error)
      showError(error)
    } finally {
      if (isActive.value && submittedIdentity === entityIdentity.value
        && (submittedGeneration === completionRequestGeneration || submittedGeneration + 1 === completionRequestGeneration)) {
        isSubmitting.value = false
      }
    }
  }
  const activate = () => {
    isActive.value = true
  }
  const deactivate = () => {
    isActive.value = false
  }

  return { mode, completionResponse, completionErrorDetails, isLoading, isSubmitting, loadStatus, item, canComplete, refreshCompletion, startWorkflow, activate, deactivate }
}

export type CompletionWorkflowStartState = ReturnType<typeof useCompletionWorkflowStart>
