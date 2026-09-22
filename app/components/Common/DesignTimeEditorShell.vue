<script setup lang="ts">
const { contentTestId } = defineProps<{
  contentTestId?: string
}>()
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-6 overflow-visible px-6 pt-0 pb-6 lg:flex-row lg:gap-0">
    <slot name="sidebar" />
    <main :data-testid="contentTestId" class="min-h-0 min-w-0 flex-1 pt-6 lg:pl-6">
      <slot />
    </main>
  </div>
</template>
