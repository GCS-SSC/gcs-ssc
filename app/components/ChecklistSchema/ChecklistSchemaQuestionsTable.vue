<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- local table editor actions are self-describing */
import type { TableColumn } from '@nuxt/ui'
import { useLocalRowEditor } from '~/composables/useLocalRowEditor'
import { nanoid } from 'nanoid'
import { computed, toRaw } from 'vue'
import type { ChecklistEditorQuestion } from '~/types/checklist-schema-editor'
import { DEFAULT_CHECKLIST_OPTIONS } from '~~/shared/types/schemas/checklist/checklist'

const questions = defineModel<ChecklistEditorQuestion[]>('questions', { default: () => [] })
const { t, locale } = useI18n()
const rowEditor = useLocalRowEditor<ChecklistEditorQuestion, string>()
const { isOpen: isEditorOpen, mode: editorMode, target: editingKey, draft: draftQuestion, close: resetEditor } = rowEditor

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

const openCreateEditor = () => {
  const number = questions.value.length + 1
  rowEditor.openCreate({
    _key: nanoid(),
    key: `question-${number}-${nanoid(6)}`,
    question: { en: '', fr: '' },
    help: [],
    options: DEFAULT_CHECKLIST_OPTIONS.map(option => ({ value: option.value, description: { ...option.description } })),
    required: true,
    commentPolicy: 'optional'
  })
}
const openEditEditor = (index: number) => {
  const currentQuestion = questions.value[index]
  if (!currentQuestion) return
  rowEditor.openEdit(currentQuestion._key, structuredClone(toRaw(currentQuestion)))
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
          <CommonActionButton icon="i-lucide-pencil" color="neutral" variant="ghost" size="sm" class="cursor-default" :aria-label="t('common.edit_named', { name: (locale === 'fr' ? row.original.nameFr : row.original.nameEn) || row.original.nameEn || row.original.nameFr || row.original.code })" @click="openEditEditor(row.index)" />
          <CommonActionButton icon="i-lucide-trash" color="error" variant="ghost" size="sm" class="cursor-default" :aria-label="t('common.delete_named', { name: (locale === 'fr' ? row.original.nameFr : row.original.nameEn) || row.original.nameEn || row.original.nameFr || row.original.code })" @click="removeQuestion(row.index)" />
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
