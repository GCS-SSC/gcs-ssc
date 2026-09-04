<!-- eslint-disable jsdoc/require-jsdoc, jsdoc/require-param-description, jsdoc/require-returns -->
<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { Ref } from 'vue'
import { toRaw } from 'vue'
import type { AssessmentItemRow } from '~/composables/useAssessmentSchemaEditorState'
import {
  createAssessmentCalculationRow,
  createAssessmentQuestionRow
} from '~/composables/useAssessmentSchemaEditorState'
import {
  countAssessmentDependencies,
  formatAssessmentFixedWeightDisplay,
  getAssessmentFixedWeight,
  getAssessmentLocaleLabel,
  getAssessmentWeightMode
} from '~/utils/assessment-schema'
import type { AssessmentAnswerPathTreeNode } from '~/utils/assessment-schema'

const items = defineModel<AssessmentItemRow[]>('items', {
  default: () => []
})

const {
  answerPathTree
} = defineProps<{
  answerPathTree: AssessmentAnswerPathTreeNode[]
}>()

const { t } = useI18n()

const isEditorOpen: Ref<boolean> = ref(false)
const editorMode: Ref<'create' | 'edit'> = ref('create')
const editingKey: Ref<string | null> = ref(null)
const draftItem: Ref<AssessmentItemRow | null> = ref(null)

const weightTypeLabelMap = computed<Record<'fixed' | 'adjustable' | 'array', string>>(() => ({
  fixed: t('transfer_payment.fixed_weight'),
  adjustable: t('transfer_payment.adjustable_weight'),
  array: t('transfer_payment.adjustable_weight_array')
}))

type AssessmentItemTableRow = {
  id: string
  code: string
  labelEn: string
  labelFr: string
  weightSummary: string
  optionCount: number
  dependencyCount: number
  helpCount: number
}

const rows = computed<AssessmentItemTableRow[]>(() => items.value.map(item => {
  const weightMode = getAssessmentWeightMode(item.weight)
  const fixedWeight = getAssessmentFixedWeight(item.weight)
  const weightSummary = fixedWeight === null
    ? weightTypeLabelMap.value[weightMode]
    : `${weightTypeLabelMap.value[weightMode]} · ${formatAssessmentFixedWeightDisplay(fixedWeight)}`

  return {
    id: item._key,
    code: item.name,
    labelEn: getAssessmentLocaleLabel(item.question, 'en', item.name),
    labelFr: getAssessmentLocaleLabel(item.question, 'fr', item.name),
    weightSummary,
    optionCount: item.type === 'question' ? item.options.length : 0,
    dependencyCount: countAssessmentDependencies(item.depends),
    helpCount: item.help.length
  }
}))

const columns = computed<TableColumn<AssessmentItemTableRow>[]>(() => [
  {
    accessorKey: 'code',
    header: t('transfer_payment.language_independent_code')
  },
  {
    accessorKey: 'weightSummary',
    header: t('common.weight')
  },
  {
    accessorKey: 'optionCount',
    header: t('transfer_payment.options')
  },
  {
    accessorKey: 'dependencyCount',
    header: t('transfer_payment.dependencies')
  },
  {
    accessorKey: 'helpCount',
    header: t('transfer_payment.help_text')
  },
  {
    id: 'actions',
    header: t('common.actions')
  }
])

/**
 *
 */
const resetEditor = () => {
  isEditorOpen.value = false
  editorMode.value = 'create'
  editingKey.value = null
  draftItem.value = null
}

/**
 *
 * @param type
 */
const openCreateEditor = (type: 'question' | 'calculation') => {
  editorMode.value = 'create'
  editingKey.value = null
  draftItem.value = type === 'question'
    ? structuredClone(createAssessmentQuestionRow())
    : structuredClone(createAssessmentCalculationRow())
  isEditorOpen.value = true
}

/**
 *
 * @param index
 */
const openEditEditor = (index: number) => {
  const currentItem = items.value[index]
  if (!currentItem) {
    return
  }

  editorMode.value = 'edit'
  editingKey.value = currentItem._key
  draftItem.value = structuredClone(toRaw(currentItem))
  isEditorOpen.value = true
}

/**
 *
 */
const saveDraft = () => {
  if (!draftItem.value) {
    return
  }

  if (editorMode.value === 'edit' && editingKey.value !== null) {
    const currentIndex = items.value.findIndex(item => item._key === editingKey.value)
    if (currentIndex < 0) {
      resetEditor()
      return
    }
    items.value.splice(currentIndex, 1, draftItem.value)
  } else {
    items.value.push(draftItem.value)
  }

  resetEditor()
}

const removeItem = (index: number) => {
  items.value.splice(index, 1)
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap justify-end gap-2">
      <UButton
        icon="i-lucide-plus"
        :label="t('transfer_payment.add_question')"
        variant="outline"
        class="cursor-default"
        @click="openCreateEditor('question')" />
      <UButton
        icon="i-lucide-function-square"
        :label="t('transfer_payment.add_calculation')"
        variant="outline"
        class="cursor-default"
        @click="openCreateEditor('calculation')" />
    </div>

    <CommonCompactTable :data="rows" :columns="columns" :ui="{ td: 'align-top', th: 'whitespace-nowrap' }">
      <template #code-cell="{ row }">
        <CommonLanguageIndependentCodeCell
          :code="row.original.code"
          :name-en="row.original.labelEn"
          :name-fr="row.original.labelFr" />
      </template>

      <template #actions-cell="{ row }">
        <div class="flex items-center gap-1">
          <UButton
            icon="i-lucide-pencil"
            color="neutral"
            variant="ghost"
            size="sm"
            class="cursor-default"
            :aria-label="t('common.edit')"
            @click="openEditEditor(row.index)" />
          <UButton
            icon="i-lucide-trash"
            color="error"
            variant="ghost"
            size="sm"
            class="cursor-default"
            :aria-label="t('common.delete')"
            @click="removeItem(row.index)" />
        </div>
      </template>
    </CommonCompactTable>

    <AssessmentSchemaItemEditor
      v-if="draftItem"
      v-model:open="isEditorOpen"
      v-model:item="draftItem"
      :answer-path-tree="answerPathTree"
      :mode="editorMode"
      @save="saveDraft"
      @cancel="resetEditor" />
  </div>
</template>
