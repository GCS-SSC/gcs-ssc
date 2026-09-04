<script setup lang="ts">
import type { ApprovalTemplateEditorStep } from '~/types/approval-template-editor'

const open = defineModel<boolean>('open', { default: false })
const step = defineModel<ApprovalTemplateEditorStep | null>('step', { required: true })

const { mode, approvalTemplateId } = defineProps<{
  mode: 'create' | 'edit'
  approvalTemplateId: string
}>()

const emit = defineEmits<{
  save: []
  cancel: []
}>()
</script>

<template>
  <CommonApprovalTemplatesStepEditor
    v-model:open="open"
    v-model:step="step"
    :mode="mode"
    :approval-template-id="approvalTemplateId"
    @save="emit('save')"
    @cancel="emit('cancel')" />
</template>
