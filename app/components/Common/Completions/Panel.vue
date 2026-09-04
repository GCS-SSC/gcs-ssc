<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { Entity_Type, Workflow_Target_Entity_Type } from '~~/shared/types/database'
import CommonCompletionSection from './Section.vue'

const {
  entityType,
  entityId,
  canComplete,
  canWorkWorkflow,
  titleKey,
  descriptionKey,
  statusCompleteKey,
  statusLockedKey,
  commentPlaceholderKey,
  completeActionKey,
  completedSuccessKey,
  confirmationMessageKey,
  refreshKey = 0,
  hideTitle = true,
  showDivider = false
} = defineProps<{
  entityType: Entity_Type & Workflow_Target_Entity_Type
  entityId: string
  canComplete: boolean
  canWorkWorkflow: boolean
  titleKey: string
  descriptionKey: string
  statusCompleteKey: string
  statusLockedKey: string
  commentPlaceholderKey: string
  completeActionKey: string
  completedSuccessKey: string
  confirmationMessageKey?: string
  refreshKey?: number
  hideTitle?: boolean
  showDivider?: boolean
}>()

const emit = defineEmits<{ changed: [] }>()
const lifecycleRefreshKey: Ref<number> = ref(refreshKey)

watch(() => refreshKey, value => {
  lifecycleRefreshKey.value = value
})

const refreshLifecycle = () => {
  lifecycleRefreshKey.value += 1
  emit('changed')
}
</script>

<template>
  <div class="w-full min-w-0 space-y-8" data-testid="completion-workflow-panel">
    <CommonCompletionSection
      :entity-type="entityType"
      :entity-id="entityId"
      :is-locked="!canComplete"
      :hide-title="hideTitle"
      :show-divider="showDivider"
      :title-key="titleKey"
      :description-key="descriptionKey"
      :status-complete-key="statusCompleteKey"
      :status-locked-key="statusLockedKey"
      :comment-placeholder-key="commentPlaceholderKey"
      :complete-action-key="completeActionKey"
      :completed-success-key="completedSuccessKey"
      :confirmation-message-key="confirmationMessageKey"
      :refresh-key="lifecycleRefreshKey"
      @completed="refreshLifecycle" />
    <CommonWorkflowSection
      :entity-type="entityType"
      :entity-id="entityId"
      purpose="approval_submission"
      hide-when-unconfigured
      :can-edit="canWorkWorkflow"
      :refresh-key="lifecycleRefreshKey"
      @changed="refreshLifecycle" />
  </div>
</template>
