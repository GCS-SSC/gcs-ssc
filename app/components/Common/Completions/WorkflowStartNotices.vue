<script setup lang="ts">
import type { CompletionWorkflowStartState } from '~/composables/useCompletionWorkflowStart'

const { state } = defineProps<{ state: CompletionWorkflowStartState }>()
const { t } = useI18n()
const { mode, completionResponse, completionErrorDetails, isLoading, loadStatus, item, refreshCompletion } = state
</script>

<template>
  <div v-if="completionErrorDetails.length || (!item && completionResponse?.blocker) || loadStatus === 'error'" class="min-w-0 space-y-3">
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
      role="alert"
      color="warning"
      icon="i-lucide-lock-keyhole"
      :title="t(`workflow.${mode === 'recommendation_submission' ? 'start_blockers' : 'completion_blockers'}.${completionResponse.blocker}`, completionResponse.blockerParameters ?? {})" />

    <UAlert
      v-else-if="loadStatus === 'error'"
      role="alert"
      color="error"
      icon="i-lucide-triangle-alert"
      :title="t('common.unavailable')">
      <template #actions>
        <UButton color="error" variant="soft" :label="t('common.retry')" :loading="isLoading" @click="refreshCompletion" />
      </template>
    </UAlert>
  </div>
</template>
