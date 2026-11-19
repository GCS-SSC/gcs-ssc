<script setup lang="ts">
import type { ApprovalTemplateEditorStep } from '~/types/approval-template-editor'

const step = defineModel<ApprovalTemplateEditorStep>('step', { required: true })
const { approvalTemplateId, agencyId } = defineProps<{ approvalTemplateId: string; agencyId?: string }>()
</script>

<template>
  <CommonApprovalTemplatesStepFields v-model:step="step" :approval-template-id="approvalTemplateId" :agency-id="agencyId" />
</template>
