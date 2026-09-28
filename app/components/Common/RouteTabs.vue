<script setup lang="ts">
import { computed } from 'vue'
import type { TranslatedTabItem } from '~~/shared/types/ui'

const {
  items,
  variant = 'link',
  size = 'sm',
  orientation = 'vertical',
  content = false,
  mobileCollapsible = true,
  mobileAutoCloseOnSelect = true,
  priorityValues = [],
  ui
} = defineProps<{
  items: TranslatedTabItem[]
  variant?: 'link' | 'pill'
  size?: 'xs' | 'sm' | 'md' | 'lg'
  orientation?: 'horizontal' | 'vertical'
  content?: boolean
  mobileCollapsible?: boolean
  mobileAutoCloseOnSelect?: boolean
  priorityValues?: string[]
  ui?: Record<string, string>
}>()

const modelValue = defineModel<string>({ required: true })
const { t, locale } = useI18n()

const sortedItems = computed(() => {
  const collator = new Intl.Collator(locale.value, { sensitivity: 'base' })

  return [...items].sort((left, right) => {
    const leftPriority = priorityValues.indexOf(left.value)
    const rightPriority = priorityValues.indexOf(right.value)
    if (leftPriority !== rightPriority) {
      if (leftPriority < 0) return 1
      if (rightPriority < 0) return -1
      return leftPriority - rightPriority
    }
    const leftIsGeneral = left.value === 'general' || left.key.endsWith('.general')
    const rightIsGeneral = right.value === 'general' || right.key.endsWith('.general')

    if (leftIsGeneral !== rightIsGeneral) return leftIsGeneral ? -1 : 1

    return collator.compare(left.label ?? t(left.key), right.label ?? t(right.key))
  })
})
</script>

<template>
  <CommonTranslatedTabs
    v-model="modelValue"
    :items="sortedItems"
    :variant="variant"
    :size="size"
    :orientation="orientation"
    :content="content"
    :mobile-collapsible="mobileCollapsible"
    :mobile-auto-close-on-select="mobileAutoCloseOnSelect"
    :ui="ui" />
</template>
