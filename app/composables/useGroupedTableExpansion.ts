import { getGroupedRowModel } from '@tanstack/vue-table'
import type { ExpandedState, Updater } from '@tanstack/vue-table'
import { ref, toValue, watch } from 'vue'
import type { MaybeRefOrGetter, Ref } from 'vue'

export type GroupedTableRow<Row> = {
  id: string
  depth?: number
  groupingColumnId?: string
  original: Row
  subRows?: GroupedTableRow<Row>[]
  leafRows?: GroupedTableRow<Row>[]
  getIsExpanded?: () => boolean
  getIsGrouped?: () => boolean
  toggleExpanded?: () => void
  getParentRow?: () => GroupedTableRow<Row> | undefined
}

type GroupColumn<Row> = {
  id: string
  getValue: (row: Row) => string
}

type GroupedTableExpansionOptions<Row> = {
  rows: MaybeRefOrGetter<Row[]>
  groups: GroupColumn<Row>[]
  isPlaceholder?: (row: Row) => boolean
  defaultExpanded?: boolean
}

/**
 * Creates shared TanStack grouped-table state and helpers for resource table group rows.
 *
 * @param options - Table rows, grouping columns, and optional placeholder handling.
 * @returns Grouping state, grouped row helpers, and expansion update handler.
 */
export const useGroupedTableExpansion = <Row>(options: GroupedTableExpansionOptions<Row>) => {
  const defaultExpanded = options.defaultExpanded === false ? false : true
  const expandedRows: Ref<ExpandedState> = ref(defaultExpanded ? true : {})
  const grouping: Ref<string[]> = ref(options.groups.map(group => group.id))
  const columnVisibility: Ref<Record<string, boolean>> = ref(Object.fromEntries(
    options.groups.map(group => [group.id, false])
  ))
  const groupingOptions = {
    getGroupedRowModel: getGroupedRowModel(),
    getRowId: (row: Row) => String((row as Row & { id: string }).id)
  }
  const expandedOptions = { autoResetExpanded: false }
  const getGroupRowId = (row: Row, groupIndex: number) => options.groups
    .slice(0, groupIndex + 1)
    .map(group => `${group.id}:${group.getValue(row)}`)
    .join('>')
  const getCurrentGroupRowIds = (): string[] => [...new Set(
    toValue(options.rows).flatMap(row => options.groups.map((_group, groupIndex) => getGroupRowId(row, groupIndex)))
  )]

  watch(getCurrentGroupRowIds, currentGroupRowIds => {
    const currentExpandedRows = expandedRows.value
    if (currentExpandedRows === true) return

    const nextExpandedRows: Record<string, boolean> = {}
    for (const groupRowId of currentGroupRowIds) {
      nextExpandedRows[groupRowId] = Object.prototype.hasOwnProperty.call(currentExpandedRows, groupRowId)
        ? currentExpandedRows[groupRowId] === true
        : defaultExpanded
    }

    const currentKeys = Object.keys(currentExpandedRows)
    const hasChanged = currentKeys.length !== currentGroupRowIds.length
      || currentGroupRowIds.some(groupRowId => currentExpandedRows[groupRowId] !== nextExpandedRows[groupRowId])
    if (hasChanged) expandedRows.value = nextExpandedRows
  })
  const isGroupedRow = (row: GroupedTableRow<Row>) => row.getIsGrouped?.() === true
  const isGroupRow = (row: GroupedTableRow<Row>, groupColumnId: string) => (
    isGroupedRow(row) && row.groupingColumnId === groupColumnId
  )

  /**
   * Returns visible leaf rows for aggregate counts and totals.
   *
   * @param row - TanStack grouped table row.
   * @returns Leaf rows, excluding placeholders when configured.
   */
  const getLeafRows = (row: GroupedTableRow<Row>) => {
    const leafRows = row.leafRows ?? row.subRows ?? []

    if (!options.isPlaceholder) {
      return leafRows
    }

    return leafRows.filter(leafRow => !options.isPlaceholder?.(leafRow.original))
  }
  const getGroupedRowCount = (row: GroupedTableRow<Row>) => getLeafRows(row).length
  const canExpandGroupedRow = (row: GroupedTableRow<Row>) => getGroupedRowCount(row) > 0

  /**
   * Applies TanStack's expansion update while retaining explicit state for collapsed groups.
   *
   * @param value - A replacement expansion state or TanStack updater callback.
   */
  const updateExpandedRows = (value: Updater<ExpandedState>) => {
    const nextExpandedRows = typeof value === 'function' ? value(expandedRows.value) : value

    if (nextExpandedRows === true) {
      expandedRows.value = true
      return
    }

    expandedRows.value = Object.fromEntries(
      getCurrentGroupRowIds().map(groupRowId => [groupRowId, nextExpandedRows[groupRowId] === true])
    )
  }

  return {
    expandedRows,
    grouping,
    columnVisibility,
    groupingOptions,
    expandedOptions,
    getGroupRowId,
    isGroupedRow,
    isGroupRow,
    getLeafRows,
    getGroupedRowCount,
    canExpandGroupedRow,
    updateExpandedRows
  }
}
