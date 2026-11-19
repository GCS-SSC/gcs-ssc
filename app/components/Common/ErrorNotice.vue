<script setup lang="ts">
import type { AlertProps } from '@nuxt/ui'

defineOptions({ inheritAttrs: false })

const { actions } = defineProps<{ actions?: AlertProps['actions'] }>()
const theme = {
  button: {
    color: 'error',
    variant: 'soft',
    size: 'sm',
    icon: 'i-lucide-refresh-cw'
  }
} as const
</script>

<template>
  <UTheme :props="theme">
    <UAlert
      role="alert"
      v-bind="$attrs"
      color="error"
      variant="soft"
      icon="i-lucide-circle-alert"
      :actions="actions?.map(action => ({ ...action, size: 'sm' }))">
      <template v-for="(_, name) in $slots" #[name]="slotProps">
        <slot :name="name" v-bind="slotProps || {}" />
      </template>
    </UAlert>
  </UTheme>
</template>
