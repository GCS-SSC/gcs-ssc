<script setup lang="ts">
import { computed } from 'vue'

const {
  title,
  badge,
  icon,
  variant = 'indicator',
  hideIndicator = false,
  compact = false
} = defineProps<{
  title: string
  badge?: string | number
  icon?: string
  variant?: 'indicator' | 'bullet'
  hideIndicator?: boolean
  compact?: boolean
}>()

const displayBadge = computed(() => variant === 'bullet' ? badge ?? '•' : badge)
</script>

<template>
  <div :class="compact ? 'flex items-center justify-between gap-3' : 'flex items-center justify-between gap-4'">
    <div :class="compact ? 'flex min-w-0 items-center gap-2' : 'flex min-w-0 items-center gap-3'">
      <div
        v-if="variant === 'indicator' && !hideIndicator"
        class="bg-primary h-8 w-1 shrink-0 rounded-full" />

      <div
        v-else-if="variant === 'bullet'"
        class="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-black tracking-wider">
        {{ displayBadge }}
      </div>

      <div class="min-w-0">
        <h2 class="truncate text-xl font-black tracking-tight text-zinc-900 dark:text-white">
          {{ title }}
        </h2>
      </div>
    </div>

    <div class="flex shrink-0 items-center gap-2">
      <UIcon v-if="icon" :name="icon" class="text-primary size-5" />
      <slot name="actions" />
    </div>
  </div>
</template>
