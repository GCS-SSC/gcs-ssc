<script setup lang="ts">
import type { CursorPagination } from '~~/shared/types/resource-table'

const { page = 1, itemsPerPage = 10, total, cursor } = defineProps<{
  page?: number
  itemsPerPage?: number
  total?: number
  cursor?: CursorPagination
}>()
const { t } = useI18n()
const emit = defineEmits<{ 'update:page': [page: number] }>()
// Cursor navigation exposes visited pages and the next page without claiming a total count.
const navigationTotal = computed(() => cursor
  ? Math.max(cursor.availablePages, page + (cursor.hasNextPage ? 1 : 0)) * itemsPerPage
  : total ?? 0)
</script>

<template>
  <UPagination v-bind="$attrs" :page="page" :items-per-page="itemsPerPage" :total="navigationTotal" @update:page="emit('update:page', $event)">
    <template #first>
      <CommonActionButton icon="i-lucide-chevrons-left" color="neutral" variant="outline" :aria-label="t('common.pagination_first')" />
    </template>
    <template #prev>
      <CommonActionButton icon="i-lucide-chevron-left" color="neutral" variant="outline" :aria-label="t('common.pagination_previous')" />
    </template>
    <template #next>
      <CommonActionButton icon="i-lucide-chevron-right" color="neutral" variant="outline" :aria-label="t('common.pagination_next')" :disabled="cursor ? !cursor.hasNextPage : undefined" />
    </template>
    <template #last>
      <CommonActionButton icon="i-lucide-chevrons-right" color="neutral" variant="outline" :aria-label="t('common.pagination_last')" :disabled="cursor ? true : undefined" />
    </template>
  </UPagination>
</template>
