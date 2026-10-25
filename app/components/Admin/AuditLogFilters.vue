<script setup lang="ts">
export type AuditLogFilters = {
  actor: string
  table: string
  recordId: string
  operation: string
  requestId: string
  from: string
  to: string
}

const { kind } = defineProps<{ kind: 'events' | 'access' }>()
const filters = defineModel<AuditLogFilters>({ required: true })
const { t } = useI18n()
const activeFilterCount = computed(() => Object.values(filters.value).filter(value => value !== '').length)
/** Clears every list filter, including the two primary toolbar fields. */
const resetFilters = () => {
  filters.value = { actor: '', table: '', recordId: '', operation: '', requestId: '', from: '', to: '' }
}
</script>

<template>
  <div class="flex w-full min-w-0 flex-wrap items-center gap-3" data-field-scope="admin.audit-log-filters">
    <AdminAuditTableFilter v-model="filters.table" data-field-container="Composite editor; its individual field declarations own their identities." :kind="kind" :show-label="false" class="w-full sm:w-40 sm:shrink-0" />
    <UInput v-model="filters.recordId" :placeholder="t('audit.recordId')" :aria-label="t('audit.recordId')" class="min-w-40 flex-1" data-ui-target="admin.audit-log-filters.filters.recordId" />
    <UPopover :content="{ align: 'end' }">
      <UButton
        :label="t('audit.filters')"
        icon="i-lucide-list-filter"
        :color="activeFilterCount ? 'primary' : 'neutral'"
        :aria-description="activeFilterCount ? t('audit.activeFilters', { count: activeFilterCount }) : undefined"
        variant="outline">
        <template v-if="activeFilterCount" #trailing>
          <UBadge :label="String(activeFilterCount)" color="primary" variant="solid" size="xs" aria-hidden="true" />
        </template>
      </UButton>
      <template #content>
        <div class="max-h-[min(calc(100dvh-2rem),var(--reka-popover-content-available-height))] w-80 max-w-[calc(100vw-2rem)] space-y-4 overflow-y-auto overscroll-contain p-4">
          <AdminAuditActorFilter v-model="filters.actor" data-field-container="Composite editor; its individual field declarations own their identities." />
          <AdminAuditOperationFilter v-model="filters.operation" data-field-container="Composite editor; its individual field declarations own their identities." :kind="kind" />
          <UFormField :label="t('audit.requestId')" data-ui-target="admin.audit-log-filters.requestId">
            <UInput v-model="filters.requestId" type="text" class="w-full" />
          </UFormField>
          <UFormField :label="t('audit.from')" data-ui-target="admin.audit-log-filters.from">
            <UInput v-model="filters.from" type="datetime-local" class="w-full" />
          </UFormField>
          <UFormField :label="t('audit.to')" data-ui-target="admin.audit-log-filters.to">
            <UInput v-model="filters.to" type="datetime-local" class="w-full" />
          </UFormField>
          <UButton :label="t('audit.resetFilters')" icon="i-lucide-rotate-ccw" color="neutral" variant="soft" block @click="resetFilters" />
        </div>
      </template>
    </UPopover>
  </div>
</template>
