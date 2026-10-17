<script setup lang="ts">
const { t } = useI18n()
const emit = defineEmits<{ 'update:page': [page: number] }>()
</script>

<template>
  <UPagination v-bind="$attrs" @update:page="emit('update:page', $event)">
    <template #first>
      <CommonActionButton icon="i-lucide-chevrons-left" color="neutral" variant="outline" :aria-label="t('common.pagination_first')" />
    </template>
    <template #prev>
      <CommonActionButton icon="i-lucide-chevron-left" color="neutral" variant="outline" :aria-label="t('common.pagination_previous')" />
    </template>
    <template #next>
      <CommonActionButton icon="i-lucide-chevron-right" color="neutral" variant="outline" :aria-label="t('common.pagination_next')" />
    </template>
    <template #last>
      <CommonActionButton icon="i-lucide-chevrons-right" color="neutral" variant="outline" :aria-label="t('common.pagination_last')" />
    </template>
  </UPagination>
</template>
