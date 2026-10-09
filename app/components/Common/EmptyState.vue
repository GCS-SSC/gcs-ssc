<script setup lang="ts">
const { title, description, icon = 'i-lucide-inbox' } = defineProps<{
  title?: string
  description: string
  icon?: string
}>()
</script>

<template>
  <div class="rounded-lg border border-dashed border-default px-6 py-12 text-center" data-testid="empty-state">
    <UIcon :name="icon" class="mb-3 size-8 text-muted" aria-hidden="true" />
    <p v-if="title" class="font-semibold text-highlighted">
      {{ title }}
    </p>
    <p class="text-sm text-muted" :class="title ? 'mt-2' : ''">
      {{ description }}
    </p>
    <div v-if="$slots.actions" class="mt-4 flex justify-center gap-2">
      <slot name="actions" />
    </div>
  </div>
</template>
