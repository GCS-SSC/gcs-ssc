<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { resolveApiErrorDetails } from '~/composables/useApiErrorToast'
import type { Entity_Type } from '~~/shared/types/database'

type CompletionResponse = {
  item: { id: string } | null
  can_complete: boolean
  blocker?: 'active_workflow' | 'approval_workflow_missing' | 'claim_lines_required' | 'claim_lines_unallocated' | 'lines_required' | 'payment_total_mismatch' | 'final_reconcile_approved' | 'business_status' | null
}

const {
  entityType,
  entityId,
  completePayload,
  completedSuccessKey,
  actionLabelKey = 'workflow.start',
  confirmationMessageKey,
  isLocked = false
} = defineProps<{
  entityType: Entity_Type
  entityId: string
  completePayload?: unknown
  completedSuccessKey: string
  actionLabelKey?: string
  confirmationMessageKey?: string
  isLocked?: boolean
}>()

const emit = defineEmits<{
  completed: []
}>()

const { t } = useI18n()
const toast = useToast()
const { showError } = useApiErrorToast()
const completionResponse: Ref<CompletionResponse | null> = ref(null)
const completionErrorDetails: Ref<string[]> = ref([])
const isLoading: Ref<boolean> = ref(false)
const isSubmitting: Ref<boolean> = ref(false)
const loadStatus: Ref<'idle' | 'pending' | 'success' | 'error'> = ref('idle')
let completionRequestGeneration = 0
const entityIdentity = computed(() => `${entityType}:${entityId}`)
const item = computed(() => completionResponse.value?.item ?? null)
const canComplete = computed(() => loadStatus.value === 'success'
  && completionResponse.value?.can_complete === true
  && !isLocked)

/** Refreshes whether the target can be completed and whether completion already exists. */
const refreshCompletion = async () => {
  const requestGeneration = ++completionRequestGeneration
  completionResponse.value = null
  loadStatus.value = 'pending'
  isLoading.value = true
  try {
    const requestUrl = getClientRequestUrl('/api/completions/runtime')
    requestUrl.searchParams.set('entityType', entityType)
    requestUrl.searchParams.set('entityId', entityId)
    const response = await fetch(requestUrl)
    if (!response.ok) await throwFetchResponseError(response)
    const nextCompletionResponse = await response.json() as CompletionResponse
    if (requestGeneration !== completionRequestGeneration) return
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

watch(entityIdentity, async () => {
  completionErrorDetails.value = []
  isSubmitting.value = false
  await refreshCompletion()
}, { immediate: true })

/** Completes the target without a comment so its required workflow starts atomically. */
const startWorkflow = async () => {
  if (!canComplete.value || isSubmitting.value) return
  if (confirmationMessageKey && !window.confirm(t(confirmationMessageKey))) return

  const submittedIdentity = entityIdentity.value
  const submittedGeneration = completionRequestGeneration
  try {
    isSubmitting.value = true
    completionErrorDetails.value = []
    const response = await fetch(getClientRequestUrl('/api/completions/complete'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        entityType,
        entityId,
        comments: null,
        payload: completePayload
      })
    })
    if (!response.ok) await throwFetchResponseError(response)
    if (submittedIdentity !== entityIdentity.value || submittedGeneration !== completionRequestGeneration) return
    await refreshCompletion()
    if (submittedIdentity !== entityIdentity.value) return
    emit('completed')
    toast.add({
      title: t('common.success'),
      description: t(completedSuccessKey),
      color: 'success'
    })
  } catch (error) {
    if (submittedIdentity !== entityIdentity.value) return
    completionErrorDetails.value = resolveApiErrorDetails(error)
    showError(error)
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="space-y-3">
    <div
      v-if="completionErrorDetails.length"
      class="rounded-md border border-error-300 bg-error-50 px-4 py-3 text-sm text-error-900 dark:border-error-700 dark:bg-error-950 dark:text-error-100"
      role="alert">
      <p class="font-medium">
        {{ t('workflow.completion_error_details') }}
      </p>
      <ul class="mt-2 list-disc space-y-1 pl-5">
        <li v-for="(detail, index) in completionErrorDetails" :key="`${index}-${detail}`">
          {{ detail }}
        </li>
      </ul>
    </div>

    <UAlert
      v-if="!item && completionResponse?.blocker"
      color="warning"
      icon="i-lucide-lock-keyhole"
      :title="t(`workflow.completion_blockers.${completionResponse.blocker}`)" />

    <UAlert
      v-else-if="loadStatus === 'error'"
      color="error"
      icon="i-lucide-triangle-alert"
      :title="t('common.unavailable')">
      <template #actions>
        <UButton color="error" variant="soft" :label="t('common.retry')" :loading="isLoading" @click="refreshCompletion" />
      </template>
    </UAlert>

    <UButton
      v-if="!item"
      color="primary"
      icon="i-lucide-message-square-quote"
      :label="t(actionLabelKey)"
      :loading="isLoading || isSubmitting"
      :disabled="!canComplete || isSubmitting"
      class="cursor-default"
      @click="startWorkflow" />
  </div>
</template>
