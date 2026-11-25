<script setup lang="ts">
const { title, titleId, description, heading = 'h2' } = defineProps<{
  title: string
  titleId?: string
  description?: string
  heading?: 'h2' | 'h3'
}>()
</script>

<template>
  <header class="flex flex-wrap items-start justify-between gap-4">
    <div class="min-w-0">
      <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3
          v-if="heading === 'h3'"
          :id="titleId"
          class="break-words text-lg font-semibold text-highlighted [overflow-wrap:anywhere]"
          data-testid="detail-section-title">
          {{ title }}
        </h3>
        <h2
          v-else
          :id="titleId"
          class="break-words text-xl font-semibold text-highlighted [overflow-wrap:anywhere]"
          data-testid="detail-section-title">
          {{ title }}
        </h2>
        <slot name="title-trailing" />
      </div>
      <p v-if="description" class="mt-1 break-words text-sm text-muted [overflow-wrap:anywhere]">
        {{ description }}
      </p>
    </div>
    <div v-if="$slots.actions" class="flex shrink-0 items-center justify-end gap-2">
      <slot name="actions" />
    </div>
  </header>
</template>
