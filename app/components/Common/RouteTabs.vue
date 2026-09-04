<script setup lang="ts">
import type { TranslatedTabItem } from '~~/shared/types/ui'

const {
  items,
  variant = 'link',
  size = 'sm',
  orientation = 'vertical',
  content = false,
  mobileCollapsible = true,
  mobileAutoCloseOnSelect = true,
  ui
} = defineProps<{
  items: TranslatedTabItem[]
  variant?: 'link' | 'pill'
  size?: 'xs' | 'sm' | 'md' | 'lg'
  orientation?: 'horizontal' | 'vertical'
  content?: boolean
  mobileCollapsible?: boolean
  mobileAutoCloseOnSelect?: boolean
  ui?: Record<string, string>
}>()

const modelValue = defineModel<string>({ required: true })
</script>

<template>
  <CommonTranslatedTabs
    v-model="modelValue"
    :items="items"
    :variant="variant"
    :size="size"
    :orientation="orientation"
    :content="content"
    :mobile-collapsible="mobileCollapsible"
    :mobile-auto-close-on-select="mobileAutoCloseOnSelect"
    :ui="ui" />
</template>
