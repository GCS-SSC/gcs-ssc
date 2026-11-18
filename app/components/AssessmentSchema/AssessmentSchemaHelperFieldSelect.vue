<script setup lang="ts">
import { computed } from 'vue'
import { useAssessmentSchemaHelperDefinitions } from '~/composables/useAssessmentSchemaHelpers'
import type { AssessmentHelperDataType } from '~~/shared/utils/assessment-helpers'

const modelValue = defineModel<string>({
  default: ''
})

const helperDefinitions = useAssessmentSchemaHelperDefinitions()
const { excludeDataTypes = [] } = defineProps<{ excludeDataTypes?: AssessmentHelperDataType[] }>()
const { t } = useI18n()

const helperItems = computed(() => helperDefinitions.value.filter(definition => !excludeDataTypes.includes(definition.dataType)).map(definition => ({
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
    searchable data-field-exclude="Composite helper selector; configurable help belongs to the owning business field." />
</template>
