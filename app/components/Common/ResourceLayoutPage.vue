<script setup lang="ts" generic="T extends object">
import { computed, useId } from 'vue'
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
  buttonDisabled = false,
  selectable = false,
  getRowSelectionLabel,
  searchPlaceholder,
  tableClass
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
  buttonDisabled?: boolean
  selectable?: boolean
  getRowSelectionLabel?: (row: T, index: number) => string
  searchPlaceholder?: string
  tableClass?: string
}>()

defineEmits(['add', 'retry'])

const search = defineModel<string>('search', { default: '' })
const statusFilter = defineModel<string>('statusFilter', { default: 'all' })
const pagination = defineModel<{ pageIndex: number; pageSize: number }>('pagination', {
  required: true
})

const { t } = useI18n()
const pageSizeId = useId()
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
  <div class="flex min-w-0 flex-1 flex-col overflow-hidden">
    <CommonTableToolbar
      v-model:search="search"
      v-model:status-filter="statusFilter"
      :status-enum-name="statusEnumName"
      :status-filter-label="statusFilterLabel"
      :button-label="buttonLabel"
      :show-button="showButton"
      :button-disabled="buttonDisabled"
      :search-placeholder="searchPlaceholder"
      :table="table"
      sticky
      @add="$emit('add')">
      <template v-for="(_, name) in $slots" #[name]="slotData">
        <slot :name="name" v-bind="slotData" />
      </template>
    </CommonTableToolbar>

    <CommonResourceTableFeedback
      :status="requestStatus"
      :has-stale-rows="hasStaleRows"
      class="px-6 pt-6"
      @retry="$emit('retry')" />

    <div
      v-if="isInitialLoading"
      data-testid="resource-table-loading"
      class="flex min-h-40 flex-1 items-center justify-center gap-2 p-6 text-sm text-muted"
      aria-live="polite">
      <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" aria-hidden="true" />
      <span>{{ t('common.loading_records') }}</span>
    </div>

    <div v-else-if="showTable" data-testid="resource-table-viewport" class="min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-6">
      <div class="w-full min-w-0 shrink-0 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
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
              ...((($attrs['pagination-options'] || {}) as Record<string, unknown>))
            }">
            <template v-if="selectable && !$slots['select-header']" #select-header="{ table: tableApi }">
              <UCheckbox
                :model-value="tableApi.getIsSomePageRowsSelected() ? 'indeterminate' : tableApi.getIsAllPageRowsSelected()"
                :aria-label="t('common.select_all')"
                @update:model-value="value => tableApi.toggleAllPageRowsSelected(!!value)" />
            </template>

            <template v-if="selectable && !$slots['select-cell']" #select-cell="{ row }">
              <UCheckbox
                :model-value="row.getIsSelected()"
                :aria-label="getRowSelectionLabel?.(row.original, row.index) ?? t('common.select_row_named', { number: row.index + 1 })"
                @update:model-value="value => row.toggleSelected(!!value)" />
            </template>

            <template v-for="(_, name) in $slots" #[name]="slotData">
              <slot :name="name" v-bind="slotData" />
            </template>
          </UTable>
        </div>
      </div>
    </div>

    <div v-if="showTable && !isInitialLoading" class="border-default flex items-center justify-between gap-3 border-t bg-white p-6 dark:bg-zinc-900">
      <div class="text-xs font-bold tracking-widest text-zinc-400 uppercase">
        <slot name="footer-left">
          <span class="text-zinc-900 dark:text-white">
            {{ table?.tableApi?.getFilteredSelectedRowModel().rows.length || 0 }}
          </span>
          /
          {{ totalRecords }}
          {{ t('common.selected') || 'Records' }}
        </slot>
      </div>

      <div class="flex items-center gap-4">
        <div class="flex items-center gap-1.5">
          <label :for="pageSizeId" class="text-xs font-medium text-zinc-500">{{ t('common.rows_per_page') }}</label>
          <USelect
            :id="pageSizeId"
            v-model="pagination.pageSize"
            :items="[5, 10, 20, 50]"
            variant="ghost"
            size="xs"
            @update:model-value="val => (pagination.pageIndex = 0)" />
        </div>
        <UPagination
          :page="pagination.pageIndex + 1"
          :items-per-page="pagination.pageSize"
          :total="totalRecords"
          @update:page="val => (pagination.pageIndex = val - 1)" />
      </div>
    </div>
  </div>
</template>
