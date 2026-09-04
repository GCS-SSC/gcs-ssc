<script setup lang="ts" generic="T extends object">
import type { TableColumn } from '@nuxt/ui'

defineOptions({ inheritAttrs: false })

const {
  data,
  columns,
  loading = false,
  emptyText,
  tableClass,
  ui
} = defineProps<{
  data: T[]
  columns: TableColumn<T>[]
  loading?: boolean
  emptyText?: string
  tableClass?: string
  ui?: Record<string, string>
}>()

const table = ref()

defineExpose({ table })
</script>

<template>
  <CommonTableSurface v-bind="$attrs">
    <UTable
      ref="table"
      :data="data"
      :columns="columns"
      :loading="loading"
      :ui="ui"
      class="min-w-full overflow-visible"
      :class="tableClass">
      <template v-if="emptyText && !$slots.empty" #empty>
        <div class="px-4 py-8 text-sm text-muted">
          {{ emptyText }}
        </div>
      </template>
      <template v-for="(_, name) in $slots" #[name]="slotData">
        <slot :name="name" v-bind="slotData" />
      </template>
    </UTable>
  </CommonTableSurface>
</template>
