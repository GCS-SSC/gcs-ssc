<script setup lang="ts">
import type { Ref } from 'vue'
import type { AssessmentItemRow } from '~/composables/useAssessmentSchemaEditorState'
import AssessmentSchemaItemFields from '~/components/AssessmentSchema/AssessmentSchemaItemFields.vue'
import type { AssessmentAnswerPathTreeNode } from '~/utils/assessment-schema'
import { AssessmentQuestionItemSchema } from '~~/shared/types/schemas/assessment/assessment'

const open = defineModel<boolean>('open', { default: false })
const item = defineModel<AssessmentItemRow | null>('item', { required: true })

const {
  answerPathTree,
  mode
} = defineProps<{
  answerPathTree: AssessmentAnswerPathTreeNode[]
  mode: 'create' | 'edit'
}>()

const emit = defineEmits<{
  save: []
  cancel: []
}>()

const { t } = useI18n()
const closeAction: Ref<'dismiss' | 'cancel' | 'save'> = ref('dismiss')
const validationError = ref(false)
watch(open, value => {
  if (value) validationError.value = false
})

const modalTitle = computed(() => (
  mode === 'create' ? t('transfer_payment.assessment_item_create') : t('transfer_payment.assessment_item_update')
))

/**
 * Cancels the editor when the modal closes outside explicit save/cancel actions.
 */
const handleModalClose = () => {
  const action = closeAction.value
  closeAction.value = 'dismiss'

  if (action === 'save' || action === 'cancel') {
    return
  }

  open.value = false
  emit('cancel')
}

/**
 * Closes the editor and emits a cancel action.
 */
const closeEditor = () => {
  closeAction.value = 'cancel'
  open.value = false
  emit('cancel')
}

/**
 * Closes the editor and emits a save action.
 */
const saveEditor = () => {
  if (!item.value || !AssessmentQuestionItemSchema.safeParse(item.value).success) {
    validationError.value = true
    return
  }
  validationError.value = false
  closeAction.value = 'save'
  open.value = false
  emit('save')
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="modalTitle"
    :description="t('transfer_payment.assessment_items')"
    fullscreen
    :ui="{
      content: 'rounded-none shadow-none ring-0'
    }"
    @close="handleModalClose">
    <template #body>
      <div v-if="item" class="flex h-full flex-col">
        <div class="flex-1 overflow-y-auto p-6 lg:p-8">
          <div class="mx-auto w-full max-w-6xl space-y-8 pb-12">
            <UAlert v-if="validationError" color="error" icon="i-lucide-circle-alert" :description="t('errors.request.validation_failed')" />
            <AssessmentSchemaItemFields v-model:item="item" :answer-path-tree="answerPathTree" />
          </div>
        </div>

        <div class="border-default flex items-center justify-end gap-3 border-t bg-white px-6 py-4 dark:bg-zinc-950 lg:px-8">
          <UButton
            :label="t('common.cancel')"
            color="neutral"
            variant="ghost"
            class="cursor-default"
            @click="closeEditor" />
          <UButton
            :label="t('common.save')"
            class="cursor-default"
            @click="saveEditor" />
        </div>
      </div>
    </template>
  </UModal>
</template>
