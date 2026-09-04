<script setup lang="ts">
const { title, description } = defineProps<{
  title: string
  description: string
}>()
</script>

<template>
  <div class="min-w-0 space-y-6">
    <header class="flex flex-wrap items-start justify-between gap-4">
      <div class="min-w-0">
        <h2 class="break-words text-xl font-semibold text-highlighted [overflow-wrap:anywhere]">
          {{ title }}
        </h2>
        <p class="mt-1 break-words text-sm text-muted [overflow-wrap:anywhere]">
          {{ description }}
        </p>
      </div>

      <div v-if="$slots.action" class="flex shrink-0 items-center justify-end">
        <slot name="action" />
      </div>
    </header>

    <div v-if="$slots.notices" class="min-w-0 space-y-3">
      <slot name="notices" />
    </div>

    <div class="min-w-0 space-y-8">
      <slot />
    </div>
  </div>
</template>
