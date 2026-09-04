<script setup lang="ts">
const { label, tooltip } = defineProps<{
  label: string
  tooltip?: string
}>()
</script>

<template>
  <span class="inline-flex items-center gap-1.5">
    <span>{{ label }}</span>
    <UTooltip v-if="tooltip" :text="tooltip" :ui="{ content: 'text-sm' }">
      <button
        type="button"
        class="text-muted inline-flex cursor-default"
        :aria-label="tooltip">
        <UIcon name="i-lucide-circle-help" class="size-4" />
      </button>
    </UTooltip>
  </span>
</template>
