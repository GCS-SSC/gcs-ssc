<script setup lang="ts">
import type { AlertProps } from '@nuxt/ui'

defineOptions({ inheritAttrs: false })

const { tone, title, description, icon, actions } = defineProps<{
  tone: 'info' | 'success' | 'error' | 'warning'
  title?: AlertProps['title']
  description?: AlertProps['description']
  icon?: AlertProps['icon']
  actions?: AlertProps['actions']
}>()

const icons = {
  info: 'i-lucide-info',
  success: 'i-lucide-circle-check',
  error: 'i-lucide-circle-alert',
  warning: 'i-lucide-triangle-alert'
}
const noticeUi = {
  root: 'text-default',
  title: 'text-highlighted',
  description: 'text-default',
  icon: 'text-highlighted'
}
</script>

<template>
  <UAlert
    v-bind="$attrs"
    :color="tone"
    variant="subtle"
    :ui="noticeUi"
    :role="$attrs.role ?? (tone === 'error' ? 'alert' : 'status')"
    :title="title"
    :description="description"
    :icon="icon ?? icons[tone]"
    :actions="actions">
    <template v-if="$slots.title" #title>
      <slot name="title" />
    </template>
    <template v-if="$slots.description || $slots.default" #description>
      <slot name="description">
        <slot />
      </slot>
    </template>
    <template v-if="$slots.actions" #actions>
      <slot name="actions" />
    </template>
  </UAlert>
</template>
