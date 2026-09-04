<script setup lang="ts">
const {
  items = [],
  valueKey = 'id',
  labelEnKey = 'name_en',
  labelFrKey = 'name_fr'
} = defineProps<{
  items?: unknown[]
  valueKey?: string
  labelEnKey?: string
  labelFrKey?: string
}>()

const model = defineModel<string[]>({ default: () => [] })
const { locale } = useI18n()

const mappedItems = computed<Array<{ label: string, value: string }>>(() => items.flatMap(item => {
  const record = item as Record<string, unknown>
  const value = record[valueKey]
  if (value === undefined || value === null) return []
  const label = locale.value === 'fr' ? record[labelFrKey] : record[labelEnKey]
  return [{ label: String(label ?? ''), value: String(value) }]
}))
</script>

<template>
  <USelectMenu v-model="model" :items="mappedItems" value-key="value" multiple v-bind="$attrs" />
</template>
