<script setup lang="ts">
const {
  label,
  name,
  fetchUrl,
  valueKey,
  labelEnKey,
  labelFrKey,
  deleted = false,
  query,
  disabled = false
} = defineProps<{
  label: string
  name: string
  fetchUrl: string
  valueKey: string
  labelEnKey: string
  labelFrKey: string
  deleted?: boolean
  query?: Record<string, string | number | boolean>
  disabled?: boolean
}>()

const model = defineModel<string | undefined>()
</script>

<template>
  <UFormField :label="label" :name="name">
    <CommonServerLookupSelect
      v-model="model"
      :fetch-url="fetchUrl"
      :value-key="valueKey"
      :label-en-key="labelEnKey"
      :label-fr-key="labelFrKey"
      :deleted="deleted"
      :query="query"
      :disabled="disabled" />
  </UFormField>
</template>
