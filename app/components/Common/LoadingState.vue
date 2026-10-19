<script setup lang="ts">
defineProps<{
  label: string
}>()
</script>

<template>
  <div role="status" aria-live="polite" class="sr-only">
    <span>{{ label }}</span>
  </div>
</template>
