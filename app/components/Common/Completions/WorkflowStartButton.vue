<script setup lang="ts">
import type { LocalizedToastText } from '~/composables/useLocalizedToast'
import { onMounted, onUnmounted } from 'vue'
import { useCompletionWorkflowStart } from '~/composables/useCompletionWorkflowStart'
import type { CompletionWorkflowStartState, WorkflowPreActionMode } from '~/composables/useCompletionWorkflowStart'
import type { Entity_Type } from '~~/shared/types/database'
import CommonCompletionWorkflowStartNotices from '~/components/Common/Completions/WorkflowStartNotices.vue'

const {
  mode = 'completion',
  entityType,
  entityId,
  actionRoleAllowed = undefined,
  actionPrerequisiteWarning,
  completePayload,
  completedSuccessKey,
  actionLabelKey = 'workflow.start',
  confirmationMessageKey,
  isLocked = false,
  state,
  showNotices = true
} = defineProps<{
  mode?: WorkflowPreActionMode
  entityType: Entity_Type
  entityId: string
  /** Optional role-only visibility; omission preserves legacy readiness-based presentation. */
  actionRoleAllowed?: boolean
  /** Localized owning-page prerequisite, separate from role permission. */
  actionPrerequisiteWarning?: LocalizedToastText
  completePayload?: unknown
  completedSuccessKey: string
  actionLabelKey?: string
  confirmationMessageKey?: string
  isLocked?: boolean
  state?: CompletionWorkflowStartState
  showNotices?: boolean
}>()

const emit = defineEmits<{ completed: [] }>()
const { t } = useI18n()
const completionState = state ?? useCompletionWorkflowStart({
  mode: () => mode,
  entityType: () => entityType,
  entityId: () => entityId,
  completePayload: () => completePayload,
  completedSuccessKey: () => completedSuccessKey,
  confirmationMessageKey: () => confirmationMessageKey,
  isLocked: () => isLocked,
  actionRoleAllowed: () => actionRoleAllowed,
  actionPrerequisiteWarning: () => actionPrerequisiteWarning,
  onCompleted: () => emit('completed')
})
if (state) {
  onMounted(state.activate)
  onUnmounted(state.deactivate)
}
const { item, isLoading, isSubmitting, canComplete, canShowAction, roleVisibleActions, startWorkflow } = completionState
</script>

<template>
  <div class="space-y-3">
    <CommonCompletionWorkflowStartNotices v-if="showNotices" :state="completionState" />
    <UButton
      v-if="!item && canShowAction"
      color="primary"
      icon="i-lucide-message-square-quote"
      :label="t(actionLabelKey)"
      :loading="isLoading || isSubmitting"
      :disabled="isLoading || isSubmitting || (!roleVisibleActions && !canComplete)"
      class="cursor-default"
      @click="startWorkflow" />
  </div>
</template>
