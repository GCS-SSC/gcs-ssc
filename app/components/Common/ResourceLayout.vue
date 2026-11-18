<script setup lang="ts" generic="T extends object">
import { computed } from 'vue'
import type { EnumKey } from '~/types/enums'
import type { BilingualColumnConfig, TableColumnInput } from '~/composables/useTableColumns'
import { tableFilter, useTablePreferences, type TableFilterBindings } from '~/composables/useTablePreferences'
import type { ToolbarTableLike } from '~~/shared/types/ui'
import type { CursorPagination, ResourceTableStatus } from '~~/shared/types/resource-table'

const {
  layout = 'card',
  data,
  columns,
  bilingualColumns,
  totalRecords,
  cursor,
  tableId,
  preferenceFilters,
  preferenceStatusOptions,
  loading = false,
  requestStatus,
  statusEnumName,
  statusFilterLabel,
  buttonLabel,
  helpAddTarget,
  helpSearchTarget,
  buttonDisabled = false,
  showButton = true,
  showToolbar = true,
  showSearch = true,
  showColumnToggle = true,
  selectable = false,
  getRowSelectionLabel,
  searchPlaceholder,
  tableClass,
  embedded = false
} = defineProps<{
  layout?: 'card' | 'page'
  data: T[]
  columns: TableColumnInput<T>[]
  bilingualColumns?: BilingualColumnConfig<T>[]
  totalRecords?: number
  cursor?: CursorPagination
  tableId?: string
  preferenceFilters?: TableFilterBindings
  preferenceStatusOptions?: readonly string[]
  loading?: boolean
  requestStatus?: ResourceTableStatus
  statusEnumName?: EnumKey
  statusFilterLabel?: string
  helpAddTarget?: string
  helpSearchTarget?: string
  buttonLabel?: string
  buttonDisabled?: boolean
  showButton?: boolean
  showToolbar?: boolean
  showSearch?: boolean
  showColumnToggle?: boolean
  selectable?: boolean
  getRowSelectionLabel?: (row: T, index: number) => string
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
const table = ref<ToolbarTableLike & { tableApi?: { getFilteredSelectedRowModel: () => { rows: unknown[] } } }>()
const columnVisibility = defineModel<Record<string, boolean>>('columnVisibility')
const filters = computed(() => preferenceStatusOptions
  ? { ...preferenceFilters, status: tableFilter(statusFilter, 'all', () => preferenceStatusOptions) }
  : preferenceFilters)
const resetPage = () => {
  if (pagination.value.pageIndex > 0) pagination.value = { ...pagination.value, pageIndex: 0 }
}
const preferences = useTablePreferences({
  tableId: () => showToolbar && showColumnToggle ? tableId : undefined,
  filters,
  resetPage
})
const preferencesActive = computed(() => Boolean(tableId && showToolbar && showColumnToggle && preferences.state.value))
const defaultColumns = computed(() => table.value?.tableApi?.getAllFlatColumns().filter(column => !column.columns.length) ?? [])
const defaultIds = computed(() => defaultColumns.value.map(column => column.id))
const reorderableIds = computed(() => defaultColumns.value
  .filter(column => column.getCanHide() && column.id !== 'select' && column.id !== 'actions')
  .map(column => column.id))
const orderedIds = computed(() => {
  const saved = (preferences.entry.value?.order ?? []).filter(id => reorderableIds.value.includes(id))
  return [...new Set([...saved, ...reorderableIds.value])]
})
const orderedColumns = computed(() => {
  if (!preferencesActive.value) return undefined
  const order = orderedIds.value.values()
  return defaultIds.value.map(id => reorderableIds.value.includes(id) ? order.next().value ?? id : id)
})
const visibility = computed({
  /**
   * @returns Caller visibility defaults with valid user overrides applied.
   */
  get: () => {
    if (!preferencesActive.value) return columnVisibility.value
    return {
      ...columnVisibility.value,
      ...Object.fromEntries(defaultColumns.value.flatMap(column => {
        const saved = preferences.entry.value?.visibility?.[column.id]
        return column.getCanHide() && saved !== undefined ? [[column.id, saved]] : []
      }))
    }
  },
  /**
   * Stores only visibility changes relative to current caller defaults.
   * @param value The TanStack visibility model after a toggle.
   */
  set: value => {
    if (preferencesActive.value) {
      if (value) {
        const overrides = Object.fromEntries(defaultColumns.value.flatMap(column => {
          const selected = value[column.id] ?? true
          const baseline = columnVisibility.value?.[column.id] ?? true
          return column.getCanHide() && selected !== baseline ? [[column.id, selected]] : []
        }))
        preferences.update({ visibility: overrides })
      }
    } else {
      columnVisibility.value = value
    }
  }
})

/**
 * Moves a user-reorderable column one position in the chosen direction.
 * @param id Stable ID of the column being moved.
 * @param direction One position backward or forward.
 */
const moveColumn = (id: string, direction: -1 | 1) => {
  const order = [...orderedIds.value]
  const index = order.indexOf(id)
  const target = index + direction
  const displaced = order[target]
  if (index < 0 || displaced === undefined) return
  order[index] = displaced
  order[target] = id
  preferences.update({ order })
}
const preferenceError = computed(() => {
  if (preferences.state.value?.sync === 'save-error') return t('common.table_preferences_save_error')
  if (preferences.state.value?.sync === 'load-error') return t('common.table_preferences_load_error')
  return undefined
})
const resolvedColumns = useTableColumns<T>(() => columns, () => bilingualColumns)
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
  <div
    :class="layout === 'page' ? 'flex min-w-0 flex-1 flex-col overflow-hidden' : 'resource-layout-card w-full min-w-0'"
    :data-field-scope="layout === 'page' ? 'common.resource-layout-page' : 'common.resource-layout-card'">
    <CommonTableToolbar
      v-if="showToolbar"
      v-model:search="search"
      v-model:status-filter="statusFilter"
      :status-enum-name="statusEnumName"
      :status-filter-label="statusFilterLabel"
      :ordered-column-ids="preferencesActive ? orderedIds : undefined"
      :preferences-editable="preferences.editable.value"
      :preference-error="preferenceError"
      :preferences-loading="preferences.state.value?.sync === 'loading'"
      :button-label="buttonLabel"
      :help-add-target="helpAddTarget"
      :help-search-target="helpSearchTarget"
      :button-disabled="buttonDisabled"
      :show-button="showButton"
      :show-search="showSearch"
      :show-column-toggle="showColumnToggle"
      :search-placeholder="searchPlaceholder"
      :table="table"
      :sticky="layout === 'page'"
      @add="$emit('add')"
      @move-column="moveColumn"
      @reset-preferences="preferences.reset"
      @retry-preferences="preferences.retry">
      <template v-for="(_, name) in $slots" #[name]="slotData">
        <slot :name="name" v-bind="slotData" />
      </template>
    </CommonTableToolbar>

    <CommonResourceTableFeedback
      :status="requestStatus"
      :has-stale-rows="hasStaleRows"
      :class="layout === 'page' ? 'px-6 pt-6' : ['border-x border-default px-4 pt-4', embedded ? 'border-x-0' : showToolbar ? undefined : 'rounded-xl border']"
      @retry="$emit('retry')" />

    <div
      v-if="isInitialLoading"
      data-testid="resource-table-loading"
      class="flex items-center justify-center gap-2 text-sm text-muted"
      :class="layout === 'page' ? 'min-h-40 flex-1 p-6' : ['min-h-32 border-default px-4 py-8', showToolbar ? 'border-y' : 'rounded-xl border']"
      aria-live="polite">
      <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" aria-hidden="true" />
      <span>{{ t('common.loading_records') }}</span>
    </div>

    <div
      v-else-if="showTable"
      :class="layout === 'page' ? 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden' : ['w-full min-w-0 overflow-hidden', embedded ? 'border-y border-default' : showToolbar ? 'rounded-b-xl border border-t-0 border-default bg-white shadow-sm dark:bg-zinc-900' : 'rounded-xl border border-default bg-white shadow-sm dark:bg-zinc-900']">
      <div
        :data-testid="layout === 'page' ? 'resource-table-viewport' : undefined"
        :class="layout === 'page' ? 'min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-6' : undefined">
        <div :class="layout === 'page' ? 'w-full min-w-0 shrink-0 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800' : undefined">
          <div
            data-testid="resource-table-scroll"
            :tabindex="rowsAreDisabled ? -1 : 0"
            role="group"
            :aria-label="t('common.records')"
            class="w-full min-w-0 overflow-x-auto transition-opacity"
            :class="hasStaleRows ? 'opacity-60 saturate-50' : undefined"
            :inert="rowsAreDisabled"
            :aria-disabled="rowsAreDisabled ? 'true' : undefined"
            :data-stale="hasStaleRows ? 'true' : undefined">
            <UTable
              ref="table"
              v-model:pagination="pagination"
              v-model:column-visibility="visibility"
              :column-order="orderedColumns"
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
              <template v-if="selectable && !$slots['select-header']" #select-header="{ table: tableApi }">
                <UCheckbox
                  :model-value="tableApi.getIsSomePageRowsSelected() ? 'indeterminate' : tableApi.getIsAllPageRowsSelected()"
                  :aria-label="t('common.select_all')"
                  data-field-scope="common.resource-layout-page"
                  data-ui-target="common.resource-layout-page.select-all-rows"
                  @update:model-value="value => tableApi.toggleAllPageRowsSelected(!!value)" />
              </template>

              <template v-if="selectable && !$slots['select-cell']" #select-cell="{ row }">
                <UCheckbox
                  :model-value="row.getIsSelected()"
                  :aria-label="getRowSelectionLabel?.(row.original, row.index) ?? t('common.select_row_named', { number: row.index + 1 })"
                  data-field-scope="common.resource-layout-page"
                  data-ui-target="common.resource-layout-page.select-row"
                  @update:model-value="value => row.toggleSelected(!!value)" />
              </template>

              <template v-for="(_, name) in $slots" #[name]="slotData">
                <slot :name="name" v-bind="slotData" />
              </template>
            </UTable>
          </div>
        </div>
      </div>

      <div
        data-testid="resource-table-footer"
        class="border-default flex flex-col gap-3 border-t sm:flex-row sm:items-center sm:justify-between"
        :class="layout === 'page' ? 'bg-white p-6 dark:bg-zinc-900' : 'px-4 py-3'">
        <div class="text-xs font-bold tracking-widest text-zinc-600 uppercase dark:text-zinc-400">
          <slot name="footer-left">
            <template v-if="selectable">
              <span class="text-zinc-900 dark:text-white">{{ table?.tableApi?.getFilteredSelectedRowModel().rows.length || 0 }}</span>
              / {{ totalRecords }} {{ t('common.selected') }}
            </template>
            <template v-else-if="totalRecords !== undefined">
              <span :class="layout === 'page' ? 'text-zinc-900 dark:text-white' : undefined">{{ totalRecords }}</span>
              {{ t('common.records') }}
            </template>
          </slot>
        </div>

        <div
          class="flex w-full min-w-0 items-center justify-between gap-2 sm:w-auto sm:justify-start sm:gap-4"
          :class="layout === 'page' ? 'flex-wrap' : undefined">
          <USelect
            v-if="layout === 'page'"
            v-model="pagination.pageSize"
            :required="false"
            :aria-required="false"
            :items="[5, 10, 20, 50]"
            :aria-label="t('common.rows_per_page_label')"
            variant="ghost"
            size="xs"
            class="w-16 shrink-0"
            data-field-scope="common.resource-layout-page"
            data-ui-target="common.resource-layout-page.pagination.pageSize"
            @update:model-value="pagination.pageIndex = 0" />
          <USelect
            v-else
            v-model="pagination.pageSize"
            :items="[5, 10, 20, 50]"
            :aria-label="t('common.rows_per_page_label')"
            variant="ghost"
            size="xs"
            data-field-scope="common.resource-layout-card"
            data-ui-target="common.resource-layout-card.pagination.pageSize"
            @update:model-value="pagination.pageIndex = 0" />
          <CommonPagination
            v-if="totalRecords !== undefined || cursor"
            :page="pagination.pageIndex + 1"
            :items-per-page="pagination.pageSize"
            :total="totalRecords"
            :cursor="cursor"
            @update:page="val => (pagination.pageIndex = val - 1)" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.resource-layout-card :deep(td[data-slot='td'][colspan]) {
  padding-top: 0;
  padding-bottom: 0;
}
</style>
