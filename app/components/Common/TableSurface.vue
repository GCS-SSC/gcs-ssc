<script setup lang="ts">
defineOptions({ inheritAttrs: false })
const { t } = useI18n()
</script>

<template>
  <div
    class="overflow-hidden rounded-xl border border-default bg-white shadow-sm dark:bg-zinc-900"
    v-bind="$attrs">
    <div
      data-testid="common-table-scroll"
      role="group"
      :aria-label="t('common.records')"
      tabindex="0"
      class="w-full min-w-0 overflow-x-auto">
      <slot />
    </div>
  </div>
</template>
