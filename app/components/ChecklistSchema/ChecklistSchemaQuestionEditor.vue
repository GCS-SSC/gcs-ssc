<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- local modal actions are self-describing */
import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import type { ChecklistEditorQuestion } from '~/types/checklist-schema-editor'

const open = defineModel<boolean>('open', { default: false })
const question = defineModel<ChecklistEditorQuestion | null>('question', { required: true })
const { mode } = defineProps<{ mode: 'create' | 'edit' }>()
const emit = defineEmits<{ save: []; cancel: [] }>()

const { t } = useI18n()
const closeAction: Ref<'dismiss' | 'cancel' | 'save'> = ref('dismiss')
const title = computed(() => mode === 'create'
  ? t('checklist_schema.question_create')
  : t('checklist_schema.question_update'))
const handleClose = () => {
  const action = closeAction.value
  closeAction.value = 'dismiss'
  if (action === 'dismiss') emit('cancel')
}
const cancel = () => {
  closeAction.value = 'cancel'
  open.value = false
  emit('cancel')
}
const save = () => {
  closeAction.value = 'save'
  open.value = false
  emit('save')
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="title"
    :description="t('checklist_schema.questions')"
    fullscreen
    :ui="{ content: 'rounded-none shadow-none ring-0' }"
    @close="handleClose">
    <template #body>
      <div v-if="question" class="flex h-full flex-col">
        <div class="flex-1 overflow-y-auto p-6 lg:p-8">
          <div class="mx-auto w-full max-w-6xl space-y-8 pb-12">
            <ChecklistSchemaQuestionFields v-model:question="question" />
          </div>
        </div>
        <div class="border-default flex items-center justify-end gap-3 border-t bg-white px-6 py-4 dark:bg-zinc-950 lg:px-8">
          <UButton :label="t('common.cancel')" color="neutral" variant="ghost" class="cursor-default" @click="cancel" />
          <CommonSaveButton :label="t('common.save')" @click="save" />
        </div>
      </div>
    </template>
  </UModal>
</template>
