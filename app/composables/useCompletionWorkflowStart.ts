import type { LocalizedToastText } from '~/composables/useLocalizedToast'
import { computed, onScopeDispose, ref, toValue, watch, h } from 'vue'
import type { MaybeRefOrGetter, Ref } from 'vue'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'
import type { Entity_Type } from '~~/shared/types/database'

export type WorkflowPreActionMode = 'completion' | 'recommendation_submission'

type CompletionResponse = {
  item: { id: string } | null
  can_complete: boolean
  blockerParameters?: { name_en?: string, name_fr?: string, purpose?: string }
  blocker?: 'active_workflow' | 'approval_workflow_missing' | 'claim_lines_required' | 'claim_lines_unallocated' | 'lines_required' | 'annual_budget_exceeded' | 'funding_breakdown_required' | 'payment_total_mismatch' | 'final_reconcile_approved' | 'business_status' | 'risk_workflow_required' | 'risk_score_required' | 'risk_rating_frozen' | 'forecast_revision_required' | 'commitment_revision_required' | 'payment_recovery_control' | 'closed_target' | 'terminal_status' | 'no_published_workflow' | 'status_ineligible' | 'unsupported' | null
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
  actionRoleAllowed?: MaybeRefOrGetter<boolean | undefined>
  actionPrerequisiteWarning?: MaybeRefOrGetter<LocalizedToastText | undefined>
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
  const toast = useLocalizedToast()
  const { showError, resolveDetails } = useApiErrorToast()
  const completionResponse: Ref<CompletionResponse | null> = ref(null)
  const completionError: Ref<unknown> = ref(null)
  const completionErrorDetails = computed(() => resolveDetails(completionError.value))
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

  const roleVisibleActions = computed(() => toValue(options.actionRoleAllowed) !== undefined)
  const canShowAction = computed(() => toValue(options.actionRoleAllowed) !== false)

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
            name_en: blocker?.name_en,
            name_fr: blocker?.name_fr,
            purpose: blocker?.purpose
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
    completionError.value = null
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

  /** Captures the current blocker and bilingual content for a persistent warning.
   * @param blocker Current server-provided blocker identity.
   * @returns A renderer with captured domain context and reactive host messages.
   */
  const snapshotBlockerMessage = (blocker: NonNullable<CompletionResponse['blocker']>): LocalizedToastText => {
    const key = `workflow.${mode.value === 'recommendation_submission' ? 'start_blockers' : 'completion_blockers'}.${blocker}`
    const params = completionResponse.value?.blockerParameters
    if (blocker !== 'active_workflow' || !params) return toast.localized(key)
    const { name_en, name_fr, purpose } = params
    return () => h('span', t(key, {
      name: (locale.value === 'fr' ? name_fr : name_en) || t('workflow.unnamed_workflow'),
      purpose: t(`workflow.purposes.${purpose ?? 'standard'}`)
    }))
  }

  /** Starts the explicit Completion or Agreement Recommendation submission action. */
  const startWorkflow = async () => {
    if (!isActive.value || isLoading.value || isSubmitting.value || item.value || !canShowAction.value) return
    if (roleVisibleActions.value) {
      const blocker = completionResponse.value?.blocker
      const warning = toValue(options.actionPrerequisiteWarning)
        || (blocker ? snapshotBlockerMessage(blocker) : undefined)
        || (!canComplete.value ? toast.localized('workflow.action_prerequisite_unavailable') : undefined)
      if (warning) {
        toast.add({ title: toast.localized('common.unavailable'), description: warning, color: 'warning' })
        return
      }
    }
    if (!canComplete.value) return
    const confirmationMessageKey = toValue(options.confirmationMessageKey)
    if (confirmationMessageKey && !window.confirm(t(confirmationMessageKey))) return

    const submittedIdentity = entityIdentity.value
    const submittedGeneration = completionRequestGeneration
    try {
      isSubmitting.value = true
      completionError.value = null
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
        title: toast.localized('common.success'),
        description: toast.localized(toValue(options.completedSuccessKey)),
        color: 'success'
      })
    } catch (error) {
      if (!isActive.value || submittedIdentity !== entityIdentity.value || submittedGeneration !== completionRequestGeneration) return
      completionError.value = error
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

  return { mode, completionResponse, completionErrorDetails, isLoading, isSubmitting, loadStatus, item, canComplete, canShowAction, roleVisibleActions, refreshCompletion, startWorkflow, activate, deactivate }
}

export type CompletionWorkflowStartState = ReturnType<typeof useCompletionWorkflowStart>
