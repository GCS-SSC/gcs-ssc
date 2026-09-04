<script setup lang="ts">
import type { ResourceTableStatus } from '~~/shared/types/resource-table'

const {
  status,
  hasStaleRows = false
} = defineProps<{
  status?: ResourceTableStatus
  hasStaleRows?: boolean
}>()

defineEmits<{
  (event: 'retry'): void
}>()

const { t } = useI18n()
</script>

<template>
  <UAlert
    v-if="status === 'error'"
    data-testid="resource-table-error"
    role="alert"
    color="error"
    variant="soft"
    icon="i-lucide-circle-alert"
    :title="t('common.resource_table_load_failed')"
    :description="t(hasStaleRows ? 'common.resource_table_stale_description' : 'common.resource_table_load_failed_description')">
    <template #actions>
      <div class="flex flex-wrap items-center gap-2">
        <UBadge v-if="hasStaleRows" color="warning" variant="subtle">
          {{ t('common.stale_data') }}
        </UBadge>
        <UButton
          data-testid="resource-table-retry"
          color="error"
          variant="soft"
          size="sm"
          icon="i-lucide-refresh-cw"
          :label="t('common.retry')"
          @click="$emit('retry')" />
      </div>
    </template>
  </UAlert>
</template>
