<script setup lang="ts">
import { upperFirst } from 'scule'
import type { EnumKey } from '~/types/enums'
import type { ColumnVisibilityItem, ToolbarTableLike } from '~~/shared/types/ui'

const {
  statusEnumName,
  statusFilterLabel,
  orderedColumnIds,
  preferencesEditable,
  preferenceError,
  preferencesLoading,
  buttonLabel,
  helpAddTarget,
  searchPlaceholder,
  helpSearchTarget,
  table,
  showButton = true,
  buttonDisabled = false,
  showSearch = true,
  showColumnToggle = true,
  sticky = false
} = defineProps<{
  statusEnumName?: EnumKey
  statusFilterLabel?: string
  orderedColumnIds?: string[]
  preferencesEditable?: boolean
  preferenceError?: string
  preferencesLoading?: boolean
  helpAddTarget?: string
  buttonLabel?: string
  helpSearchTarget?: string
  searchPlaceholder?: string
  table?: ToolbarTableLike
  showButton?: boolean
  buttonDisabled?: boolean
  showSearch?: boolean
  showColumnToggle?: boolean
  sticky?: boolean
}>()

const search = defineModel<string>('search')
const statusFilter = defineModel<string>('statusFilter')

const { t } = useI18n()
const chooserContent = computed(() => ({ 'align': 'end' as const, 'aria-label': t('common.choose_columns') }))

const emit = defineEmits<{
  add: []
  moveColumn: [id: string, direction: -1 | 1]
  resetPreferences: []
  retryPreferences: []
}>()
const chooserColumns = computed(() => (table?.tableApi?.getAllLeafColumns() ?? []).filter(column => column.getCanHide()))
const columnLabel = (column: ColumnVisibilityItem) => {
  if (column.id === 'select') return t('common.select')
  return typeof column.columnDef.header === 'string' ? column.columnDef.header : upperFirst(column.id)
}
const canToggle = computed(() => orderedColumnIds === undefined || preferencesEditable)
const setVisibility = (id: string, visible: unknown) => table?.tableApi?.getColumn(id)?.toggleVisibility(visible === true)
const canMove = (id: string, direction: -1 | 1) => {
  const index = orderedColumnIds?.indexOf(id) ?? -1
  return preferencesEditable && index >= 0 && orderedColumnIds?.[index + direction] !== undefined
}
const move = (id: string, direction: -1 | 1) => {
  if (canMove(id, direction)) emit('moveColumn', id, direction)
}
</script>

<template>
  <div
    class="border-default flex min-w-0 flex-wrap items-start justify-between gap-4 p-4 sm:items-center"
    :class="[
      sticky ? 'sticky top-0 z-10 border-b bg-zinc-50/80 backdrop-blur-md dark:bg-zinc-950/80' : 'rounded-t-xl border bg-zinc-50/50 dark:bg-zinc-900/50'
    ]" data-field-exclude="Composite control internals; configurable help belongs to the owning business field.">
    <div class="toolbar-filters flex w-full min-w-40 flex-wrap items-center gap-3 sm:w-auto sm:flex-1">
      <UInput
        v-if="showSearch"
        v-model="search"
        :data-help-target="helpSearchTarget"
        icon="i-lucide-search"
        :placeholder="searchPlaceholder || t('common.search')"
        :aria-label="searchPlaceholder || t('common.search')"
        class="min-w-40 flex-1"
        :ui="{
          base: 'bg-white dark:bg-zinc-900 ring-1 ring-zinc-200 dark:ring-zinc-800 transition-shadow focus-within:ring-primary'
        }" />

      <div v-if="statusEnumName" class="w-full sm:w-40 sm:shrink-0">
        <CommonEnumSelect
          v-model="statusFilter"
          :name="statusEnumName"
          :all-option-label="statusFilterLabel"
          :aria-label="t('common.status_filter')"
          show-all-option
          variant="outline"
          class="min-w-40" />
      </div>

      <slot name="filters" />
    </div>

    <div class="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
      <slot name="actions" />
      <UPopover v-if="showColumnToggle && table?.tableApi" :content="chooserContent">
        <CommonActionButton
          icon="i-lucide-columns-3"
          :aria-label="t('common.choose_columns')"
          color="neutral"
          variant="outline" />
        <template #content>
          <div data-testid="table-column-preferences" class="w-72 max-w-[calc(100vw-2rem)]">
            <ul class="max-h-[min(55dvh,22rem)] space-y-1 overflow-y-auto p-2">
              <li v-for="column in chooserColumns" :key="column.id" class="flex items-center justify-between gap-2 px-1 py-0.5">
                <UCheckbox
                  :label="columnLabel(column)"
                  :model-value="column.getIsVisible()"
                  :disabled="!canToggle"
                  @update:model-value="value => setVisibility(column.id, value)" />
                <div v-if="orderedColumnIds?.includes(column.id)" class="flex shrink-0">
                  <CommonActionButton
                    icon="i-lucide-arrow-up"
                    color="neutral" variant="ghost" size="xs"
                    :aria-label="t('common.move_column_up', { column: columnLabel(column) })"
                    :aria-disabled="!canMove(column.id, -1)"
                    :class="{ 'opacity-40': !canMove(column.id, -1) }"
                    @click="move(column.id, -1)" />
                  <CommonActionButton
                    icon="i-lucide-arrow-down"
                    color="neutral" variant="ghost" size="xs"
                    :aria-label="t('common.move_column_down', { column: columnLabel(column) })"
                    :aria-disabled="!canMove(column.id, 1)"
                    :class="{ 'opacity-40': !canMove(column.id, 1) }"
                    @click="move(column.id, 1)" />
                </div>
              </li>
            </ul>
            <div v-if="orderedColumnIds !== undefined" class="border-default flex justify-end border-t p-2">
              <UButton
                :label="t('common.reset_table_preferences')"
                icon="i-lucide-rotate-ccw"
                color="neutral" variant="ghost" size="sm"
                :loading="preferencesLoading"
                :disabled="!preferencesEditable"
                @click="emit('resetPreferences')" />
            </div>
          </div>
        </template>
      </UPopover>

      <UButton
        v-if="showButton"
        :data-help-target="helpAddTarget"
        :label="buttonLabel || t('common.add')"
        icon="i-lucide-plus"
        :disabled="buttonDisabled"
        class="shadow-primary/20 shadow-lg"
        @click="$emit('add')" />
      <slot name="trailing-actions" />
    </div>
    <div v-if="preferenceError" data-testid="table-preferences-sync-error" class="flex w-full items-center gap-2 text-sm text-error" role="status">
      <UIcon name="i-lucide-circle-alert" aria-hidden="true" />
      {{ preferenceError }}
      <UButton
        :label="t('common.retry')"
        icon="i-lucide-rotate-cw"
        color="error"
        variant="outline"
        size="sm"
        @click="emit('retryPreferences')" />
    </div>
  </div>
</template>

<style scoped>
@media (min-width: 640px) {
  .toolbar-filters :deep([role='combobox']) {
    width: 10rem;
    flex-shrink: 0;
  }
}
</style>
