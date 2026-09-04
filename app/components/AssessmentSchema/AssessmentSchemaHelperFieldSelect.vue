<script setup lang="ts">
import { computed } from 'vue'
import { useAssessmentSchemaHelperDefinitions } from '~/composables/useAssessmentSchemaHelpers'

const modelValue = defineModel<string>({
  default: ''
})

const helperDefinitions = useAssessmentSchemaHelperDefinitions()
const { t } = useI18n()

const helperItems = computed(() => helperDefinitions.value.map(definition => ({
  label: t(definition.labelKey),
  value: definition.field
})))
</script>

<template>
  <USelectMenu
    v-model="modelValue"
    :items="helperItems"
    value-key="value"
    label-key="label"
    searchable />
</template>
