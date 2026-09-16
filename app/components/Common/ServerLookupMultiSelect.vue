<script setup lang="ts">
import ServerLookupSelect from './ServerLookupSelect.vue'

defineOptions({ inheritAttrs: false })

const {
  fetchUrl,
  valueKey,
  labelEnKey,
  labelFrKey,
  showValueInLabel = true,
  deleted = false,
  query = {},
  disabled = false,
  required = false
} = defineProps<{
  fetchUrl: string
  valueKey: string
  labelEnKey: string
  labelFrKey: string
  showValueInLabel?: boolean
  deleted?: boolean
  query?: Record<string, string | number | boolean>
  disabled?: boolean
  required?: boolean
}>()

const model = defineModel<string[]>({ default: () => [] })
</script>

<template>
  <ServerLookupSelect
    v-model:values="model"
    :fetch-url="fetchUrl"
    :value-key="valueKey"
    :label-en-key="labelEnKey"
    :label-fr-key="labelFrKey"
    :show-value-in-label="showValueInLabel"
    :deleted="deleted"
    :query="query"
    :disabled="disabled"
    :required="required"
    :limit="100"
    multiple
    v-bind="$attrs" />
</template>
