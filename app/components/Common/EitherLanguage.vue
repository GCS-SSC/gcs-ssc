<script setup lang="ts">
defineProps<{ fields: string }>()

const { t } = useI18n()
</script>

<template>
  <span :data-either-language="fields" class="ml-1 text-xs font-normal text-muted">
    ({{ t('common.field_either') }})
    <span aria-hidden="true" class="font-semibold text-yellow-600 dark:text-yellow-300">*</span>
  </span>
</template>
