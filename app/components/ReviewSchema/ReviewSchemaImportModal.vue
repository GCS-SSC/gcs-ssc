<script setup lang="ts" generic="T">
import { ref, watch } from 'vue'
import type { Ref } from 'vue'
import { z } from 'zod'
import { useModalSession } from '~/composables/useModalSession'
import { useFormSession } from '~/composables/useFormSession'
import { withFormRequirements } from '~~/shared/utils/form-requirements'

const { schema, disabled = false } = defineProps<{ schema: z.ZodType<T>, disabled?: boolean }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ imported: [definition: T] }>()
const { t } = useI18n()
const { createValidator } = useZodI18n()
const state: Ref<{ json: string } | null> = ref(null)
const ImportInputSchema = z.object({ json: z.string().trim().min(1, 'validation.required') })
watch(open, value => {
  state.value = value ? { json: '' } : null
}, { immediate: true, flush: 'sync' })
const modalSession = useModalSession()
watch([() => open.value, () => state.value, () => schema, () => disabled], () => {
  modalSession.isOpen.value = false
  modalSession.isOpen.value = open.value && state.value !== null && !disabled
}, { immediate: true, flush: 'sync' })
let validated: { session: number; json: string; value: unknown } | null = null

/** Validates pasted JSON with the existing definition contract and localizes its issues. */
const validate = withFormRequirements(async (input: { json: string }) => {
  validated = null
  const session = modalSession.captureSession()
  const json = input.json
  const definitionSchema = schema
  const requiredErrors = await createValidator(ImportInputSchema)({ json })
  if (requiredErrors.length) return requiredErrors
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    return [{ name: 'json', message: t('review_schema_import.invalid_json') }]
  }
  const errors = await createValidator(definitionSchema)(value)
  if (errors.length === 0 && session !== null && modalSession.isCurrentSession(session) && state.value?.json === json) {
    validated = { session, json, value }
  }
  return errors.map(error => ({ name: 'json', message: error.name ? `${error.name}: ${error.message}` : error.message }))
}, ImportInputSchema)

/** Applies only validated data to the current editor; persistence remains its Save action. */
const importDefinition = () => {
  if (!validated || disabled || !modalSession.isCurrentSession(validated.session) || state.value?.json !== validated.json) return
  const result = schema.safeParse(validated.value)
  if (!result.success) return
  emit('imported', result.data)
  open.value = false
}
const formSession = useFormSession({ owner: modalSession, action: { kind: 'local-draft', purpose: 'review-schema-import' }, submit: importDefinition })
</script>

<template>
  <UModal v-model:open="open" :title="t('review_schema_import.title')" :description="t('review_schema_import.description')" :ui="{ content: 'sm:max-w-4xl' }" data-field-scope="review-schema.import-modal">
    <template #body>
      <UForm v-if="state" :key="formSession.key" :state="state" :validate="validate" class="space-y-4" @submit="formSession.onSubmit">
        <UFormField name="json" :label="t('review_schema_import.json')" required>
          <UTextarea v-model="state.json" :rows="16" class="w-full font-mono" :disabled="disabled" />
        </UFormField>
        <div class="flex justify-end gap-2">
          <UButton :label="t('common.cancel')" color="neutral" variant="outline" @click="open = false" />
          <UButton type="submit" icon="i-lucide-import" :label="t('review_schema_import.title')" :disabled="disabled" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
