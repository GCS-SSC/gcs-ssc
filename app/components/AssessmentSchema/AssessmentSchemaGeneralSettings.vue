<script setup lang="ts">
import type { AssessmentDefinitionEditorState } from '~/composables/useAssessmentSchemaEditorState'
import { useJsonFieldHelpers } from '~/composables/useJsonFieldHelpers'

const state = defineModel<AssessmentDefinitionEditorState>({ required: true })

const { t } = useI18n()
const { toJsonTextareaValue, parseJsonTextareaValue } = useJsonFieldHelpers()

/**
 * Parses helper JSON text and updates the editor state when valid.
 *
 * @param value - Textarea contents for the helpers payload.
 */
const updateHelpers = (value: string) => {
  const parsedValue = parseJsonTextareaValue(value)

  if (parsedValue && typeof parsedValue === 'object' && !Array.isArray(parsedValue)) {
    state.value.helpers = parsedValue as Record<string, unknown>
    return
  }

  if (!value.trim()) {
    state.value.helpers = undefined
  }
}
</script>

<template>
  <CommonSection :title="t('transfer_payment.schema_inputs')" badge="01" :grid-cols="1">
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <UFormField :label="t('admin_common.fields.egcs_cn_assessmentschema_json')" name="assessment.helpers">
        <CommonTextarea
          :model-value="toJsonTextareaValue(state.helpers)"
          :rows="4"
          @update:model-value="updateHelpers" />
      </UFormField>
    </div>
  </CommonSection>
</template>
