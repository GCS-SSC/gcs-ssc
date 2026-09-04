<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc */
import type { TableColumn } from '@nuxt/ui'
import { toRaw } from 'vue'
import type { Ref } from 'vue'
import type { ApprovalTemplateEditorStep } from '~/types/approval-template-editor'
import { createApprovalTemplateEditorStep } from '~/utils/approval-template-editor-steps'

const steps = defineModel<ApprovalTemplateEditorStep[]>('steps', {
  default: () => []
})
const { approvalTemplateId } = defineProps<{ approvalTemplateId: string }>()
const emit = defineEmits<{ save: [] }>()

const { t, locale } = useI18n()

const isEditorOpen: Ref<boolean> = ref(false)
const editorMode: Ref<'create' | 'edit'> = ref('create')
const editingIndex: Ref<number | null> = ref(null)
const draftStep: Ref<ApprovalTemplateEditorStep | null> = ref(null)

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

const resetEditor = () => {
  isEditorOpen.value = false
  editorMode.value = 'create'
  editingIndex.value = null
  draftStep.value = null
}

const openCreateEditor = () => {
  const nextSequence = steps.value.length === 0
    ? 1
    : Math.max(...steps.value.map(step => step.egcs_cn_sequence)) + 1

  editorMode.value = 'create'
  editingIndex.value = null
  draftStep.value = createApprovalTemplateEditorStep({ egcs_cn_sequence: nextSequence })
  isEditorOpen.value = true
}

const openEditEditor = (sourceIndex: number) => {
  const currentStep = steps.value[sourceIndex]
  if (!currentStep) {
    return
  }

  editorMode.value = 'edit'
  editingIndex.value = sourceIndex
  draftStep.value = structuredClone(toRaw(currentStep))
  isEditorOpen.value = true
}

const saveDraft = async () => {
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
  emit('save')
}

const removeStep = (sourceIndex: number) => {
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
          <UButton
            icon="i-lucide-pencil"
            color="neutral"
            variant="ghost"
            size="sm"
            class="cursor-default"
            :aria-label="t('common.edit_named', { name: row.original.name || row.original.id })"
            @click="openEditEditor(row.original.sourceIndex)" />
          <UButton
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
      @save="saveDraft"
      @cancel="resetEditor" />
  </div>
</template>
