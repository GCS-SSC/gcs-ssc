<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- local table editor actions are self-describing */
import type { TableColumn } from '@nuxt/ui'
import { nanoid } from 'nanoid'
import { computed, ref, toRaw } from 'vue'
import type { Ref } from 'vue'
import type { ChecklistEditorQuestion } from '~/types/checklist-schema-editor'
import { DEFAULT_CHECKLIST_OPTIONS } from '~~/shared/types/schemas/checklist/checklist'

const questions = defineModel<ChecklistEditorQuestion[]>('questions', { default: () => [] })
const { t } = useI18n()
const isEditorOpen: Ref<boolean> = ref(false)
const editorMode: Ref<'create' | 'edit'> = ref('create')
const editingKey: Ref<string | null> = ref(null)
const draftQuestion: Ref<ChecklistEditorQuestion | null> = ref(null)

type ChecklistQuestionTableRow = {
  id: string
  code: string
  nameEn: string
  nameFr: string
  optionCount: number
  commentPolicy: string
  helpCount: number
}

const rows = computed<ChecklistQuestionTableRow[]>(() => questions.value.map(question => ({
  id: question._key,
  code: question.key,
  nameEn: question.question.en,
  nameFr: question.question.fr,
  optionCount: question.options.length,
  commentPolicy: t(`checklist_schema.comment_policies.${question.commentPolicy}`),
  helpCount: question.help.length
})))
const columns = computed<TableColumn<ChecklistQuestionTableRow>[]>(() => [
  { accessorKey: 'code', header: t('checklist_schema.language_independent_code') },
  { accessorKey: 'optionCount', header: t('transfer_payment.options') },
  { accessorKey: 'commentPolicy', header: t('checklist_schema.comment_policy') },
  { accessorKey: 'helpCount', header: t('transfer_payment.help_text') },
  { id: 'actions', header: t('common.actions') }
])
const resetEditor = () => {
  isEditorOpen.value = false
  editorMode.value = 'create'
  editingKey.value = null
  draftQuestion.value = null
}
const openCreateEditor = () => {
  const number = questions.value.length + 1
  editorMode.value = 'create'
  editingKey.value = null
  draftQuestion.value = {
    _key: nanoid(),
    key: `question-${number}-${nanoid(6)}`,
    question: { en: '', fr: '' },
    help: [],
    options: DEFAULT_CHECKLIST_OPTIONS.map(option => ({ value: option.value, description: { ...option.description } })),
    required: true,
    commentPolicy: 'optional'
  }
  isEditorOpen.value = true
}
const openEditEditor = (index: number) => {
  const currentQuestion = questions.value[index]
  if (!currentQuestion) return
  editorMode.value = 'edit'
  editingKey.value = currentQuestion._key
  draftQuestion.value = structuredClone(toRaw(currentQuestion))
  isEditorOpen.value = true
}
const saveDraft = () => {
  if (!draftQuestion.value) return
  if (editorMode.value === 'edit' && editingKey.value !== null) {
    const currentIndex = questions.value.findIndex(question => question._key === editingKey.value)
    if (currentIndex < 0) {
      resetEditor()
      return
    }
    questions.value.splice(currentIndex, 1, draftQuestion.value)
  } else {
    questions.value.push(draftQuestion.value)
  }
  resetEditor()
}
const removeQuestion = (index: number) => questions.value.splice(index, 1)
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap justify-end gap-2">
      <UButton icon="i-lucide-plus" :label="t('checklist_schema.add_question')" variant="outline" class="cursor-default" @click="openCreateEditor" />
    </div>

    <CommonCompactTable :data="rows" :columns="columns" :ui="{ td: 'align-top', th: 'whitespace-nowrap' }">
      <template #code-cell="{ row }">
        <CommonLanguageIndependentCodeCell :code="row.original.code" :name-en="row.original.nameEn" :name-fr="row.original.nameFr" />
      </template>
      <template #actions-cell="{ row }">
        <div class="flex items-center gap-1">
          <UButton icon="i-lucide-pencil" color="neutral" variant="ghost" size="sm" class="cursor-default" :aria-label="t('common.edit_named', { name: row.original.nameEn || row.original.nameFr || row.original.code })" @click="openEditEditor(row.index)" />
          <UButton icon="i-lucide-trash" color="error" variant="ghost" size="sm" class="cursor-default" :aria-label="t('common.delete_named', { name: row.original.nameEn || row.original.nameFr || row.original.code })" @click="removeQuestion(row.index)" />
        </div>
      </template>
    </CommonCompactTable>

    <ChecklistSchemaQuestionEditor
      v-if="draftQuestion"
      v-model:open="isEditorOpen"
      v-model:question="draftQuestion"
      :mode="editorMode"
      @save="saveDraft"
      @cancel="resetEditor" />
  </div>
</template>
