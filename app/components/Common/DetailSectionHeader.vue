<script setup lang="ts">
const { title, description } = defineProps<{
  title: string
  description?: string
}>()
</script>

<template>
  <header class="flex flex-wrap items-start justify-between gap-4">
    <div class="min-w-0">
      <h2 class="break-words text-xl font-semibold text-highlighted [overflow-wrap:anywhere]" data-testid="detail-section-title">
        {{ title }}
      </h2>
      <p v-if="description" class="mt-1 break-words text-sm text-muted [overflow-wrap:anywhere]">
        {{ description }}
      </p>
    </div>
    <div v-if="$slots.actions" class="flex shrink-0 items-center justify-end gap-2">
      <slot name="actions" />
    </div>
  </header>
</template>
