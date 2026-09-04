<script setup lang="ts">
import { computed } from 'vue'
import type { EnumKey } from '~/types/enums'

const {
  name,
  items: propItems,
  showAllOption = false,
  allOptionLabel
} = defineProps<{
  name: EnumKey
  items?: Array<{ label: string, value: string }>
  showAllOption?: boolean
  allOptionLabel?: string
}>()

const modelValue = defineModel<string>()
const { items: fetchedItems } = useEnumSelectOptions({
  name: () => name,
  enabled: () => propItems === undefined,
  showAllOption: () => showAllOption,
  allOptionLabel: () => allOptionLabel
})

const selectItems = computed(() => {
  if (propItems !== undefined) {
    return propItems
  }

  return fetchedItems.value
})
</script>

<template>
  <USelect v-model="modelValue" :items="selectItems" v-bind="$attrs" />
</template>
