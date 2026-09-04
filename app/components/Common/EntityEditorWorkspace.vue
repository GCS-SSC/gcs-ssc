<script setup lang="ts">
const { contentTestId } = defineProps<{
  contentTestId?: string
}>()
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-6 overflow-visible px-6 pt-0 pb-6 lg:flex-row lg:gap-0">
    <aside
      v-if="$slots.sidebar"
      class="w-full shrink-0 lg:w-72 lg:border-r lg:border-zinc-200 lg:pr-4 dark:lg:border-zinc-800">
      <div class="pt-6">
        <slot name="sidebar" />
      </div>
    </aside>

    <div :data-testid="contentTestId" class="min-h-0 min-w-0 flex-1 overflow-visible pt-6 lg:pl-6">
      <slot />
    </div>
  </div>
</template>
