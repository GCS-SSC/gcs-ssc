<script setup lang="ts">
import { upperFirst } from 'scule'
import type { EnumKey } from '~/types/enums'
import type { ToolbarTableLike } from '~~/shared/types/ui'

const {
  statusEnumName,
  statusFilterLabel,
  buttonLabel,
  searchPlaceholder,
  table,
  showButton = true,
  buttonDisabled = false,
  showSearch = true,
  showColumnToggle = true,
  sticky = false
} = defineProps<{
  statusEnumName?: EnumKey
  statusFilterLabel?: string
  buttonLabel?: string
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

defineEmits(['add'])
</script>

<template>
  <div
    class="border-default flex min-w-0 flex-wrap items-center justify-between gap-4 p-4"
    :class="[
      sticky ? 'sticky top-0 z-10 border-b bg-zinc-50/80 backdrop-blur-md dark:bg-zinc-950/80' : 'rounded-t-xl border bg-zinc-50/50 dark:bg-zinc-900/50'
    ]">
    <div class="flex min-w-0 flex-1 items-center gap-3">
      <UInput
        v-if="showSearch"
        v-model="search"
        icon="i-lucide-search"
        :placeholder="searchPlaceholder || t('common.search')"
        class="w-full max-w-sm"
        :ui="{
          base: 'bg-white dark:bg-zinc-900 ring-1 ring-zinc-200 dark:ring-zinc-800 transition-shadow focus-within:ring-primary'
        }" />

      <CommonEnumSelect
        v-if="statusEnumName"
        v-model="statusFilter"
        :name="statusEnumName"
        :all-option-label="statusFilterLabel"
        :aria-label="t('common.status_filter')"
        show-all-option
        variant="outline"
        class="min-w-40" />

      <slot name="filters" />
    </div>

    <div class="flex items-center gap-2">
      <slot name="actions" />
      <UDropdownMenu
        v-if="showColumnToggle && table?.tableApi"
        :items="
          table.tableApi
            .getAllColumns()
            .filter(column => column.getCanHide())
            .map(column => ({
              label: typeof column.columnDef.header === 'string' ? column.columnDef.header : upperFirst(column.id),
              type: 'checkbox' as const,
              checked: column.getIsVisible(),
              onUpdateChecked(checked: boolean) {
                table?.tableApi?.getColumn(column.id)?.toggleVisibility(!!checked)
              },
              onSelect(e?: Event) {
                e?.preventDefault()
              }
            }))
        "
        :content="{ align: 'end' }">
        <UButton
          icon="i-lucide-columns-3"
          :aria-label="t('common.choose_columns')"
          color="neutral"
          variant="outline" />
      </UDropdownMenu>

      <UButton
        v-if="showButton"
        :label="buttonLabel || t('common.add')"
        icon="i-lucide-plus"
        :disabled="buttonDisabled"
        class="shadow-primary/20 shadow-lg"
        @click="$emit('add')" />
    </div>
  </div>
</template>
