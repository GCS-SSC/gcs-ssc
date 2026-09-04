<!-- eslint-disable jsdoc/require-jsdoc, jsdoc/require-param-description, jsdoc/require-returns -->
<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { Ref } from 'vue'
import { toRaw } from 'vue'
import type { AssessmentOutcomeRow } from '~/composables/useAssessmentSchemaEditorState'
import { createAssessmentOutcomeRow } from '~/composables/useAssessmentSchemaEditorState'
import { getAssessmentLocaleLabel } from '~/utils/assessment-schema'

const outcomes = defineModel<AssessmentOutcomeRow[]>('outcomes', {
  default: () => []
})

const { t, locale } = useI18n()

const isEditorOpen: Ref<boolean> = ref(false)
const editorMode: Ref<'create' | 'edit'> = ref('create')
const editingKey: Ref<string | null> = ref(null)
const draftOutcome: Ref<AssessmentOutcomeRow | null> = ref(null)

const activeLocale = computed<'en' | 'fr'>(() => locale.value === 'fr' ? 'fr' : 'en')

type OutcomeRow = {
  id: string
  label: string
  strategyCount: number
  optionCount: number
}

const rows = computed<OutcomeRow[]>(() => outcomes.value.map(outcome => ({
  id: outcome._key,
  label: getAssessmentLocaleLabel(outcome.label, activeLocale.value, outcome.name),
  strategyCount: outcome.strategies.length,
  optionCount: outcome.strategies.reduce((total, strategy) => total + strategy.options.length, 0)
})))

const columns = computed<TableColumn<OutcomeRow>[]>(() => [
  { accessorKey: 'label', header: t('common.name') },
  { accessorKey: 'strategyCount', header: t('transfer_payment.strategies') },
  { accessorKey: 'optionCount', header: t('transfer_payment.options') },
  { id: 'actions', header: t('common.actions') }
])

const resetEditor = () => {
  isEditorOpen.value = false
  editorMode.value = 'create'
  editingKey.value = null
  draftOutcome.value = null
}

const openCreateEditor = () => {
  editorMode.value = 'create'
  editingKey.value = null
  draftOutcome.value = structuredClone(createAssessmentOutcomeRow())
  isEditorOpen.value = true
}

const openEditEditor = (index: number) => {
  const currentOutcome = outcomes.value[index]
  if (!currentOutcome) {
    return
  }

  editorMode.value = 'edit'
  editingKey.value = currentOutcome._key
  draftOutcome.value = structuredClone(toRaw(currentOutcome))
  isEditorOpen.value = true
}

const saveDraft = () => {
  if (!draftOutcome.value) {
    return
  }

  if (editorMode.value === 'edit' && editingKey.value !== null) {
    const currentIndex = outcomes.value.findIndex(outcome => outcome._key === editingKey.value)
    if (currentIndex < 0) {
      resetEditor()
      return
    }
    outcomes.value.splice(currentIndex, 1, draftOutcome.value)
  } else {
    outcomes.value.push(draftOutcome.value)
  }

  resetEditor()
}

const removeOutcome = (index: number) => {
  outcomes.value.splice(index, 1)
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
          <UButton icon="i-lucide-pencil" color="neutral" variant="ghost" size="sm" class="cursor-default" :aria-label="t('common.edit_named', { name: row.original.label || row.original.id })" @click="openEditEditor(row.index)" />
          <UButton icon="i-lucide-trash" color="error" variant="ghost" size="sm" class="cursor-default" :aria-label="t('common.delete_named', { name: row.original.label || row.original.id })" @click="removeOutcome(row.index)" />
        </div>
      </template>
    </CommonCompactTable>

    <AssessmentSchemaMitigationEditor
      v-if="draftOutcome"
      v-model:open="isEditorOpen"
      v-model:outcome="draftOutcome"
      :mode="editorMode"
      @save="saveDraft"
      @cancel="resetEditor" />
  </div>
</template>
