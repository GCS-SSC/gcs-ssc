<script setup lang="ts">
import type { AssessmentOutcomeRow } from '~/composables/useAssessmentSchemaEditorState'
import AssessmentSchemaMitigationFields from '~/components/AssessmentSchema/AssessmentSchemaMitigationFields.vue'
import { OutcomeSchema } from '~~/shared/types/schemas/assessment/assessment'

const open = defineModel<boolean>('open', { default: false })
const outcome = defineModel<AssessmentOutcomeRow | null>('outcome', { required: true })

const { mode } = defineProps<{
  mode: 'create' | 'edit'
}>()

const emit = defineEmits<{
  save: []
  cancel: []
}>()

const { t } = useI18n()
const validationError = ref(false)
/** Clears validation feedback for each newly opened editing session. */
watch(open, value => {
  if (value) validationError.value = false
})

const modalTitle = computed(() => mode === 'create' ? t('common.add') : t('common.edit'))

const closeEditor = () => {
  open.value = false
  emit('cancel')
}

/** Validates and saves the current mitigation. */
const saveEditor = () => {
  if (!outcome.value || !OutcomeSchema.safeParse(outcome.value).success) {
    validationError.value = true
    return
  }
  validationError.value = false
  open.value = false
  emit('save')
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="modalTitle"
    :description="t('transfer_payment.outcomes')"
    fullscreen
    :ui="{ content: 'rounded-none shadow-none ring-0' }">
    <template #body>
      <div v-if="outcome" class="flex h-full flex-col">
        <div class="flex-1 overflow-y-auto p-6 lg:p-8">
          <div class="mx-auto w-full max-w-6xl space-y-8 pb-12">
            <UAlert v-if="validationError" color="error" icon="i-lucide-circle-alert" :description="t('errors.request.validation_failed')" />
            <AssessmentSchemaMitigationFields v-model:outcome="outcome" />
          </div>
        </div>

        <div class="border-default flex items-center justify-end gap-3 border-t bg-white px-6 py-4 dark:bg-zinc-950 lg:px-8">
          <UButton :label="t('common.cancel')" color="neutral" variant="ghost" class="cursor-default" @click="closeEditor" />
          <UButton :label="t('common.save')" class="cursor-default" @click="saveEditor" />
        </div>
      </div>
    </template>
  </UModal>
</template>
