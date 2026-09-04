<script setup lang="ts">
import type { ApprovalTemplateEditorStep } from '~/types/approval-template-editor'

const step = defineModel<ApprovalTemplateEditorStep>('step', { required: true })
const { approvalTemplateId } = defineProps<{ approvalTemplateId: string }>()
</script>

<template>
  <CommonApprovalTemplatesStepFields v-model:step="step" :approval-template-id="approvalTemplateId" />
</template>
