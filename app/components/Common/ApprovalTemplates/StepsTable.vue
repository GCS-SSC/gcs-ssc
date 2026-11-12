<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc */
import type { TableColumn } from '@nuxt/ui'
import { useLocalRowEditor } from '~/composables/useLocalRowEditor'
import type { ActionContext } from '~/composables/useActionContext'
import { toRaw } from 'vue'
import type { ApprovalTemplateEditorStep } from '~/types/approval-template-editor'
import { createApprovalTemplateEditorStep } from '~/utils/approval-template-editor-steps'

const steps = defineModel<ApprovalTemplateEditorStep[]>('steps', {
  default: () => []
})
const { approvalTemplateId, actionContext } = defineProps<{ approvalTemplateId: string; actionContext: ActionContext }>()
const emit = defineEmits<{ save: [] }>()

const { t, locale } = useI18n()

const rowEditor = useLocalRowEditor<ApprovalTemplateEditorStep, number>()
const { isOpen: isEditorOpen, mode: editorMode, target: editingIndex, draft: draftStep, close: resetEditor } = rowEditor

type StepRow = {
  id: string
  name: string
  approverTitle: string
  certificationCount: number
  sourceIndex: number
}

const activeLocale = computed<'en' | 'fr'>(() => locale.value === 'fr' ? 'fr' : 'en')

const rows = computed<StepRow[]>(() => steps.value
  .map((step, sourceIndex) => ({ step, sourceIndex }))
  .toSorted((left, right) => left.step.egcs_cn_sequence - right.step.egcs_cn_sequence)
  .map(({ step, sourceIndex }) => ({
    id: step._key,
    name: activeLocale.value === 'fr'
      ? (step.egcs_cn_name_fr || step.egcs_cn_name_en)
      : (step.egcs_cn_name_en || step.egcs_cn_name_fr),
    approverTitle: step.egcs_cn_approvertitle || '',
    certificationCount: step.certifications.length,
    sourceIndex
  })))

const columns = computed<TableColumn<StepRow>[]>(() => [
  { accessorKey: 'name', header: t('common.name') },
  { accessorKey: 'approverTitle', header: t('admin_common.fields.egcs_cn_approvertitle') },
  { accessorKey: 'certificationCount', header: t('admin_common.resources.certifications') },
  { id: 'actions', header: t('common.actions') }
])

const openCreateEditor = () => {
  const nextSequence = steps.value.length === 0
    ? 1
    : Math.max(...steps.value.map(step => step.egcs_cn_sequence)) + 1

  rowEditor.openCreate(createApprovalTemplateEditorStep({ egcs_cn_sequence: nextSequence }))
}

const openEditEditor = (sourceIndex: number) => {
  const currentStep = steps.value[sourceIndex]
  if (!currentStep) {
    return
  }

  rowEditor.openEdit(sourceIndex, structuredClone(toRaw(currentStep)))
}

const saveDraft = async () => {
  const operation = actionContext.capture()
  if (!operation) return
  if (!draftStep.value) {
    return
  }

  if (editorMode.value === 'edit' && editingIndex.value !== null) {
    steps.value.splice(editingIndex.value, 1, draftStep.value)
  } else {
    steps.value.push(draftStep.value)
  }

  resetEditor()
  await nextTick()
  if (!operation.canDispatch()) return
  emit('save')
}

const removeStep = (sourceIndex: number) => {
  if (!actionContext.capture()?.canDispatch()) return
  steps.value.splice(sourceIndex, 1)
  emit('save')
}

defineExpose({
  openCreateEditor
})
</script>

<template>
  <div class="space-y-4">
    <CommonCompactTable :data="rows" :columns="columns">
      <template #actions-cell="{ row }">
        <div class="flex items-center gap-1">
          <CommonActionButton
            icon="i-lucide-pencil"
            color="neutral"
            variant="ghost"
            size="sm"
            class="cursor-default"
            :aria-label="t('common.edit_named', { name: row.original.name || row.original.id })"
            @click="openEditEditor(row.original.sourceIndex)" />
          <CommonActionButton
            icon="i-lucide-trash"
            color="error"
            variant="ghost"
            size="sm"
            class="cursor-default"
            :aria-label="t('common.delete_named', { name: row.original.name || row.original.id })"
            @click="removeStep(row.original.sourceIndex)" />
        </div>
      </template>
    </CommonCompactTable>

    <CommonApprovalTemplatesStepEditor
      v-if="draftStep"
      v-model:open="isEditorOpen"
      v-model:step="draftStep"
      :mode="editorMode"
      :approval-template-id="approvalTemplateId"
      :action-context="actionContext"
      @save="saveDraft"
      @cancel="resetEditor" />
  </div>
</template>
