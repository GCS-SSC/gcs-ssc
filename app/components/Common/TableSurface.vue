<script setup lang="ts">
defineOptions({ inheritAttrs: false })
</script>

<template>
  <div
    class="overflow-hidden rounded-xl border border-default bg-white shadow-sm dark:bg-zinc-900"
    v-bind="$attrs">
    <div data-testid="common-table-scroll" class="w-full min-w-0 overflow-x-auto">
      <slot />
    </div>
  </div>
</template>
