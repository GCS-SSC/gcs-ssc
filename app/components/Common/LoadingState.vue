<script setup lang="ts">
defineProps<{
  label: string
}>()
</script>

<template>
  <div role="status" aria-live="polite" class="flex min-h-32 items-center justify-center gap-2 text-sm text-muted">
    <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" aria-hidden="true" />
    <span>{{ label }}</span>
  </div>
</template>
