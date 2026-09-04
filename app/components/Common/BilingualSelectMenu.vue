<script setup lang="ts">
import { computed } from 'vue'
import { useSelectMenuTriggerName } from '~/composables/useSelectMenuTriggerName'

defineOptions({ inheritAttrs: false })

const {
  items = [],
  valueKey = 'id',
  labelKey,
  labelEnKey = 'name_en',
  labelFrKey = 'name_fr',
  prependOptions = []
} = defineProps<{
  items?: unknown[]
  valueKey?: string
  labelKey?: string
  labelEnKey?: string
  labelFrKey?: string
  prependOptions?: Array<{ label: string; value: string | null }>
}>()

const model = defineModel<string | null | undefined>({ default: undefined })

const { locale } = useI18n()
const selectMenuRef = useSelectMenuTriggerName()

const mappedItems = computed<Array<{ label: string; value: string | null; raw: unknown }>>(() => {
  const baseItems = items.map(item => {
    const record = item as Record<string, unknown>
    const value = record[valueKey]
    const preferredLabel = locale.value === 'fr' ? record[labelFrKey] : record[labelEnKey]
    const label = labelKey
      ? record[labelKey]
      : preferredLabel || record[labelEnKey] || record[labelFrKey]

    return {
      label: String(label ?? ''),
      value: value === undefined || value === null ? null : String(value),
      raw: item
    }
  })

  return [
    ...prependOptions.map(option => ({
      label: option.label,
      value: option.value,
      raw: option
    })),
    ...baseItems
  ]
})
</script>

<template>
  <div @keydown.enter.prevent.stop>
    <USelectMenu ref="selectMenuRef" v-model="model" :items="mappedItems" value-key="value" v-bind="$attrs" />
  </div>
</template>
