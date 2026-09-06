<script setup lang="ts">
import { computed } from 'vue'
import { useSelectMenuTriggerName } from '~/composables/useSelectMenuTriggerName'

defineOptions({ inheritAttrs: false })

const {
  items = [],
  valueKey = 'id',
  labelEnKey = 'name_en',
  labelFrKey = 'name_fr',
  categoryEnKey,
  categoryFrKey
} = defineProps<{
  items?: unknown[]
  valueKey?: string
  labelEnKey?: string
  labelFrKey?: string
  categoryEnKey?: string
  categoryFrKey?: string
}>()

const model = defineModel<string[]>({ default: () => [] })
const { locale } = useI18n()
const selectMenuRef = useSelectMenuTriggerName()

type Option = { label: string, value: string, disabled: boolean }
const mappedItems = computed(() => {
  const groups = new Map<string, Option[]>()
  for (const item of items) {
    const record = item as Record<string, unknown>
    const value = record[valueKey]
    if (value === undefined || value === null) continue
    const label = locale.value === 'fr' ? record[labelFrKey] : record[labelEnKey]
    const categoryKey = locale.value === 'fr' ? categoryFrKey : categoryEnKey
    const category = categoryKey ? String(record[categoryKey] ?? '') : ''
    const option = { label: String(label ?? ''), value: String(value), disabled: record.disabled === true }
    groups.set(category, [...(groups.get(category) ?? []), option])
  }
  if (!categoryEnKey && !categoryFrKey) return [...groups.values()].flat()
  return [...groups.entries()].map(([category, options]) => category
    ? [{ type: 'label' as const, label: category }, ...options]
    : options)
})
</script>

<template>
  <div @keydown.enter.prevent.stop>
    <USelectMenu ref="selectMenuRef" v-model="model" :items="mappedItems" value-key="value" multiple v-bind="$attrs" />
  </div>
</template>
