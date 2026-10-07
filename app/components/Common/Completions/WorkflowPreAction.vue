<script setup lang="ts">
import { ref } from 'vue'
import { useCompletionWorkflowStart } from '~/composables/useCompletionWorkflowStart'
import CommonCompletionWorkflowStartNotices from '~/components/Common/Completions/WorkflowStartNotices.vue'
import type { WorkflowPreActionMode } from '~/composables/useCompletionWorkflowStart'
import type { Ref } from 'vue'
import type { Workflow_Target_Entity_Type } from '~~/shared/types/database'
import CommonCompletionWorkflowStartButton from '~/components/Common/Completions/WorkflowStartButton.vue'
import CommonWorkflowSection from '~/components/Common/Workflow/Section.vue'

const {
  mode = 'completion',
  entityType,
  entityId,
  canEdit = true,
  isLocked = false,
  actionLabelKey = 'workflow.start',
  completedSuccessKey,
  showWhenUnconfigured = false,
  titleKey,
  descriptionKey
} = defineProps<{
  mode?: WorkflowPreActionMode
  entityType: Workflow_Target_Entity_Type
  entityId: string
  canEdit?: boolean
  isLocked?: boolean
  actionLabelKey?: string
  completedSuccessKey: string
  showWhenUnconfigured?: boolean
  titleKey?: string
  descriptionKey?: string
}>()

const emit = defineEmits<{ changed: [] }>()
const refreshKey: Ref<number> = ref(0)

const handleChanged = () => {
  refreshKey.value += 1
  emit('changed')
}
const completionState = useCompletionWorkflowStart({
  mode: () => mode,
  entityType: () => entityType,
  entityId: () => entityId,
  isLocked: () => isLocked || !canEdit,
  completedSuccessKey: () => completedSuccessKey,
  immediate: false,
  onCompleted: handleChanged
})
</script>

<template>
  <CommonWorkflowSection
    :entity-type="entityType"
    :entity-id="entityId"
    purpose="approval_submission"
    :can-edit="canEdit"
    :show-pre-action-when-unconfigured="showWhenUnconfigured"
    :pre-action-title-key="titleKey"
    :pre-action-description-key="descriptionKey"
    :refresh-key="refreshKey"
    @changed="handleChanged">
    <template #pre-action-action>
      <CommonCompletionWorkflowStartButton
        :mode="mode"
        :entity-type="entityType"
        :entity-id="entityId"
        :is-locked="isLocked"
        :action-label-key="actionLabelKey"
        :completed-success-key="completedSuccessKey"
        :state="completionState"
        :show-notices="false" />
    </template>
    <template #pre-action-notices>
      <CommonCompletionWorkflowStartNotices :state="completionState" />
      <slot name="notices" />
    </template>
    <template v-if="$slots.default" #pre-action>
      <slot />
    </template>
  </CommonWorkflowSection>
</template>
