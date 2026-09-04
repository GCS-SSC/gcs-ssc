<script setup lang="ts">
import { ref } from 'vue'
import type { Ref } from 'vue'
import type { Workflow_Target_Entity_Type } from '~~/shared/types/database'
import CommonCompletionWorkflowStartButton from '~/components/Common/Completions/WorkflowStartButton.vue'
import CommonWorkflowSection from '~/components/Common/Workflow/Section.vue'

const {
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
        :entity-type="entityType"
        :entity-id="entityId"
        :is-locked="isLocked"
        :action-label-key="actionLabelKey"
        :completed-success-key="completedSuccessKey"
        @completed="handleChanged" />
    </template>
    <template v-if="$slots.notices" #pre-action-notices>
      <slot name="notices" />
    </template>
    <template v-if="$slots.default" #pre-action>
      <slot />
    </template>
  </CommonWorkflowSection>
</template>
