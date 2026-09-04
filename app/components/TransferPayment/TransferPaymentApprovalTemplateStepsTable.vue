<script setup lang="ts">
import type { Ref } from 'vue'
import type { ApprovalTemplateEditorStep } from '~/types/approval-template-editor'

const steps = defineModel<ApprovalTemplateEditorStep[]>('steps', {
  default: () => []
})
const { approvalTemplateId } = defineProps<{ approvalTemplateId: string }>()

const tableRef: Ref<{ openCreateEditor: () => void } | null> = ref(null)

defineExpose({
  openCreateEditor: () => tableRef.value?.openCreateEditor()
})
</script>

<template>
  <CommonApprovalTemplatesStepsTable
    ref="tableRef"
    v-model:steps="steps"
    :approval-template-id="approvalTemplateId" />
</template>
