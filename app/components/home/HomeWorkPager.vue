<script setup lang="ts">
const { title, page, hasNext, loading = false } = defineProps<{
  title: string
  page: number
  hasNext: boolean
  loading?: boolean
}>()
const emit = defineEmits<{ previous: [], next: [] }>()
const { t } = useI18n()
</script>

<template>
  <nav :aria-label="title" class="mt-3 flex items-center justify-end gap-2 border-t border-default pt-3">
    <UButton
      size="sm"
      color="neutral"
      variant="ghost"
      icon="i-lucide-chevron-left"
      :label="t('home_dashboard.previous')"
      :disabled="page <= 1 || loading"
      @click="emit('previous')" />
    <span class="min-w-16 text-center text-xs tabular-nums text-muted">{{ t('home_dashboard.page', { page }) }}</span>
    <UButton
      size="sm"
      color="neutral"
      variant="ghost"
      trailing-icon="i-lucide-chevron-right"
      :label="t('home_dashboard.next')"
      :loading="loading"
      :disabled="!hasNext"
      @click="emit('next')" />
  </nav>
</template>
