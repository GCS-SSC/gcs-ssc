<script setup lang="ts">
import type { CompletionWorkflowStartState } from '~/composables/useCompletionWorkflowStart'

const { state } = defineProps<{ state: CompletionWorkflowStartState }>()
const { t } = useI18n()
const { mode, completionResponse, completionErrorDetails, isLoading, loadStatus, item, refreshCompletion } = state
</script>

<template>
  <div v-if="completionErrorDetails.length || (!item && completionResponse?.blocker) || loadStatus === 'error'" class="min-w-0 space-y-3">
    <CommonErrorNotice v-if="completionErrorDetails.length" :title="t('workflow.completion_error_details')">
      <template #description>
        <ul class="mt-2 list-disc space-y-1 pl-5">
          <li v-for="(detail, index) in completionErrorDetails" :key="`${index}-${detail}`">
            {{ detail }}
          </li>
        </ul>
      </template>
    </CommonErrorNotice>

    <UAlert
      v-if="!item && completionResponse?.blocker"
      role="alert"
      color="warning"
      icon="i-lucide-lock-keyhole"
      :title="t(`workflow.${mode === 'recommendation_submission' ? 'start_blockers' : 'completion_blockers'}.${completionResponse.blocker}`, completionResponse.blockerParameters ?? {})" />

    <CommonErrorNotice
      v-else-if="loadStatus === 'error'"
      :title="t('common.unavailable')">
      <template #actions>
        <UButton :label="t('common.retry')" :loading="isLoading" @click="refreshCompletion" />
      </template>
    </CommonErrorNotice>
  </div>
</template>
