<script setup lang="ts">
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { resolveApiErrorDetails } from '~/composables/useApiErrorToast'
import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { Entity_Type } from '~~/shared/types/database'

type CompletionItem = {
  id: string
  egcs_cn_comments: string
  egcs_cn_user: string
  egcs_cn_user_name: string
  egcs_cn_completedat: string
}

type CompletionResponse = {
  item: CompletionItem | null
  can_complete: boolean
  blocker?: 'active_workflow' | 'approval_workflow_missing' | 'claim_lines_required' | 'claim_lines_unallocated' | 'lines_required' | 'payment_total_mismatch' | 'final_reconcile_approved' | 'business_status' | null
}

const {
  entityType,
  entityId,
  completePayload,
  titleKey,
  descriptionKey,
  statusCompleteKey,
  statusLockedKey,
  commentPlaceholderKey,
  completeActionKey,
  completedSuccessKey,
  confirmationMessageKey,
  refreshKey = 0,
  isLocked = false,
  hideTitle = false,
  showDivider = true
} = defineProps<{
  entityType: Entity_Type
  entityId: string
  completePayload?: unknown
  titleKey: string
  descriptionKey: string
  statusCompleteKey: string
  statusLockedKey: string
  commentPlaceholderKey: string
  completeActionKey: string
  completedSuccessKey: string
  confirmationMessageKey?: string
  refreshKey?: number
  isLocked?: boolean
  hideTitle?: boolean
  showDivider?: boolean
}>()

const emit = defineEmits<{
  completed: []
}>()

const { t } = useI18n()
const toast = useToast()
const { showError } = useApiErrorToast()
const { formatDate } = useDateHelpers({
  formatterOptions: {
    dateStyle: 'medium',
    timeStyle: 'short'
  }
})
const completionQuery = computed(() => ({
  entityType,
  entityId,
  refreshKey
}))
const completionIdentity = computed(() => `${entityType}:${entityId}`)

const completionResponse: Ref<CompletionResponse | null> = ref(null)
const completionErrorDetails: Ref<string[]> = ref([])
const status: Ref<'idle' | 'pending' | 'success' | 'error'> = ref('idle')
const state: Ref<{ comments: string }> = ref({
  comments: ''
})
const isSubmitting: Ref<boolean> = ref(false)
let completionRequestGeneration = 0
/**
 *
 */
const refreshCompletion = async () => {
  const requestGeneration = ++completionRequestGeneration
  completionResponse.value = null
  status.value = 'pending'
  try {
    const requestUrl = getClientRequestUrl('/api/completions/runtime')
    requestUrl.searchParams.set('entityType', completionQuery.value.entityType)
    requestUrl.searchParams.set('entityId', completionQuery.value.entityId)
    const response = await fetch(requestUrl)
    if (!response.ok) {
      await throwFetchResponseError(response)
    }
    const nextCompletionResponse = await response.json() as CompletionResponse
    if (requestGeneration !== completionRequestGeneration) return
    completionResponse.value = nextCompletionResponse
    status.value = 'success'
  } catch {
    if (requestGeneration !== completionRequestGeneration) return
    completionResponse.value = null
    status.value = 'error'
  }
}

watch(completionQuery, async (_nextQuery, previousQuery) => {
  completionErrorDetails.value = []
  if (previousQuery && `${previousQuery.entityType}:${previousQuery.entityId}` !== completionIdentity.value) {
    state.value.comments = ''
    isSubmitting.value = false
  }
  await refreshCompletion()
}, { immediate: true })

const item = computed(() => completionResponse.value?.item ?? null)
const canComplete = computed(() => status.value === 'success'
  && completionResponse.value?.can_complete === true
  && !isLocked)

/** Persists the completion comment and finalizes the runtime entity. */
const submitCompletion = async () => {
  if (!canComplete.value || isSubmitting.value) {
    return
  }

  if (confirmationMessageKey && !window.confirm(t(confirmationMessageKey))) {
    return
  }

  const submittedIdentity = completionIdentity.value
  const submittedGeneration = completionRequestGeneration
  try {
    isSubmitting.value = true
    completionErrorDetails.value = []
    const response = await fetch(getClientRequestUrl('/api/completions/complete'), {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        entityType: completionQuery.value.entityType,
        entityId: completionQuery.value.entityId,
        comments: state.value.comments,
        payload: completePayload
      })
    })
    if (!response.ok) {
      await throwFetchResponseError(response)
    }
    if (submittedIdentity !== completionIdentity.value || submittedGeneration !== completionRequestGeneration) return
    await refreshCompletion()
    if (submittedIdentity !== completionIdentity.value) return
    state.value.comments = ''
    emit('completed')
    toast.add({
      title: t('common.success'),
      description: t(completedSuccessKey),
      color: 'success'
    })
  } catch (error) {
    if (submittedIdentity !== completionIdentity.value) return
    completionErrorDetails.value = resolveApiErrorDetails(error)
    showError(error)
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div
    class="space-y-6"
    :class="!hideTitle && showDivider ? 'border-t border-primary-500 pt-8 dark:border-primary-600' : ''">
    <div v-if="!hideTitle" class="space-y-3">
      <AssessmentSchemaSectionTitle :title="t(titleKey)" variant="indicator" />
    </div>

    <div class="space-y-4" :class="hideTitle ? '' : 'pl-4 md:pl-6'">
      <p class="text-sm text-zinc-600 dark:text-zinc-300">
        {{ t(descriptionKey) }}
      </p>

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

      <div
        v-if="!completionResponse && status !== 'error'"
        data-testid="completion-loading"
        class="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300"
        role="status"
        aria-busy="true">
        <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" aria-hidden="true" />
        <span>{{ t('common.loading') }}</span>
      </div>

      <UAlert
        v-else-if="!completionResponse"
        color="error"
        icon="i-lucide-triangle-alert"
        :title="t('common.unavailable')">
        <template #actions>
          <UButton color="error" variant="soft" :label="t('common.retry')" @click="refreshCompletion" />
        </template>
      </UAlert>

      <div
        v-else-if="item"
        class="space-y-4">
        <p class="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {{ t(statusCompleteKey) }}
        </p>

        <div class="grid gap-4 md:grid-cols-2">
          <div class="space-y-1">
            <p class="text-xs uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
              {{ t('assessment.completion.completed_by') }}
            </p>
            <p class="text-sm text-zinc-900 dark:text-zinc-100">
              {{ item.egcs_cn_user_name || t('assessment.completion.user_unavailable', { id: item.egcs_cn_user }) }}
            </p>
          </div>

          <div class="space-y-1">
            <p class="text-xs uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
              {{ t('assessment.completion.completed_at') }}
            </p>
            <p class="text-sm text-zinc-900 dark:text-zinc-100">
              {{ formatDate(item.egcs_cn_completedat) }}
            </p>
          </div>
        </div>

        <div class="space-y-1">
          <p class="text-xs uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
            {{ t('assessment.completion.comment') }}
          </p>
          <p class="text-sm text-zinc-600 dark:text-zinc-300">
            {{ item.egcs_cn_comments || t('assessment.completion.empty_comment') }}
          </p>
        </div>
      </div>

      <div
        v-else
        class="space-y-4">
        <UAlert
          v-if="completionResponse?.blocker"
          color="warning"
          icon="i-lucide-lock-keyhole"
          :title="t(`workflow.completion_blockers.${completionResponse.blocker}`)" />
        <UAlert
          v-else-if="isLocked"
          color="warning"
          icon="i-lucide-lock-keyhole"
          :title="t(statusLockedKey)" />

        <template v-else>
          <UFormField :label="t('assessment.completion.comment')">
            <CommonTextarea
              v-model="state.comments"
              :rows="4"
              :placeholder="t(commentPlaceholderKey)"
              :disabled="status === 'pending' || isSubmitting" />
          </UFormField>

          <div class="flex justify-start">
            <UButton
              color="primary"
              icon="i-lucide-circle-check-big"
              class="cursor-default"
              :loading="isSubmitting"
              :disabled="!canComplete"
              @click="submitCompletion">
              {{ t(completeActionKey) }}
            </UButton>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
