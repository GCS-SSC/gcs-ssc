<script setup lang="ts" generic="T extends object">
import type { EnumKey } from '~/types/enums'
import type { BilingualColumnConfig, TableColumnInput } from '~/composables/useTableColumns'
import type { ResourceTableStatus } from '~~/shared/types/resource-table'

const {
  data,
  columns,
  bilingualColumns,
  totalRecords,
  loading = false,
  requestStatus,
  statusEnumName,
  statusFilterLabel,
  buttonLabel,
  showButton = true,
  showSearch = true,
  showColumnToggle = true,
  searchPlaceholder,
  tableClass,
  embedded = false
} = defineProps<{
  data: T[]
  columns: TableColumnInput<T>[]
  bilingualColumns?: BilingualColumnConfig<T>[]
  totalRecords: number
  loading?: boolean
  requestStatus?: ResourceTableStatus
  statusEnumName?: EnumKey
  statusFilterLabel?: string
  buttonLabel?: string
  showButton?: boolean
  showSearch?: boolean
  showColumnToggle?: boolean
  searchPlaceholder?: string
  tableClass?: string
  embedded?: boolean
}>()

defineEmits(['add', 'retry'])

const search = defineModel<string>('search', { default: '' })
const statusFilter = defineModel<string>('statusFilter', { default: 'all' })
const pagination = defineModel<{ pageIndex: number; pageSize: number }>('pagination', {
  required: true
})

const { t } = useI18n()
const table = ref()
const resolvedColumns = useTableColumns<T>(columns, bilingualColumns)
const hasStaleRows = computed(() => requestStatus === 'error' && data.length > 0)
const isInitialLoading = computed(() => requestStatus === 'pending' && data.length === 0)
const rowsAreDisabled = computed(() => hasStaleRows.value || (requestStatus === 'pending' && data.length > 0))
const showTable = computed(() => requestStatus !== 'error' || hasStaleRows.value)

defineExpose({
  table,
  search,
  statusFilter,
  pagination
})
</script>

<template>
  <div class="w-full min-w-0">
    <CommonTableToolbar
      v-model:search="search"
      v-model:status-filter="statusFilter"
      :status-enum-name="statusEnumName"
      :status-filter-label="statusFilterLabel"
      :button-label="buttonLabel"
      :show-button="showButton"
      :show-search="showSearch"
      :show-column-toggle="showColumnToggle"
      :search-placeholder="searchPlaceholder"
      :table="table"
      :sticky="false"
      @add="$emit('add')">
      <template v-for="(_, name) in $slots" #[name]="slotData">
        <slot :name="name" v-bind="slotData" />
      </template>
    </CommonTableToolbar>

    <CommonResourceTableFeedback
      :status="requestStatus"
      :has-stale-rows="hasStaleRows"
      class="border-x border-default px-4 pt-4"
      :class="embedded ? 'border-x-0' : undefined"
      @retry="$emit('retry')" />

    <div
      v-if="isInitialLoading"
      data-testid="resource-table-loading"
      class="flex min-h-32 items-center justify-center gap-2 border-y border-default px-4 py-8 text-sm text-muted"
      aria-live="polite">
      <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" aria-hidden="true" />
      <span>{{ t('common.loading_records') }}</span>
    </div>

    <div
      v-else-if="showTable"
      class="w-full min-w-0 overflow-hidden"
      :class="embedded ? 'border-y border-default' : 'rounded-b-xl border border-t-0 border-default bg-white shadow-sm dark:bg-zinc-900'">
      <div
        data-testid="resource-table-scroll"
        class="w-full min-w-0 overflow-x-auto transition-opacity"
        :class="hasStaleRows ? 'opacity-60 saturate-50' : undefined"
        :inert="rowsAreDisabled"
        :aria-disabled="rowsAreDisabled ? 'true' : undefined"
        :data-stale="hasStaleRows ? 'true' : undefined">
        <UTable
          ref="table"
          v-model:pagination="pagination"
          :data="data"
          :columns="resolvedColumns"
          :loading="loading"
          class="min-w-full overflow-visible"
          :class="tableClass"
          v-bind="$attrs"
          :pagination-options="{
            manualPagination: true,
            rowCount: totalRecords,
            ...(($attrs['pagination-options'] || {}) as Record<string, unknown>)
          }">
          <template v-for="(_, name) in $slots" #[name]="slotData">
            <slot :name="name" v-bind="slotData" />
          </template>
        </UTable>
      </div>

      <div class="border-default flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="text-xs font-bold tracking-widest text-zinc-400 uppercase">
          <slot name="footer-left">
            {{ totalRecords }} {{ t('common.records') }}
          </slot>
        </div>

        <div class="flex w-full min-w-0 items-center justify-between gap-2 sm:w-auto sm:justify-start sm:gap-4">
          <USelect
            v-model="pagination.pageSize"
            :items="[5, 10, 20, 50]"
            :aria-label="t('common.rows_per_page_label')"
            variant="ghost"
            size="xs"
            @update:model-value="val => (pagination.pageIndex = 0)" />
          <UPagination
            :page="pagination.pageIndex + 1"
            :items-per-page="pagination.pageSize"
            :total="totalRecords"
            @update:page="val => (pagination.pageIndex = val - 1)" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
:deep(td[data-slot='td'][colspan]) {
  padding-top: 0;
  padding-bottom: 0;
}
</style>
