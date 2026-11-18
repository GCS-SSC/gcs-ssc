import { computed, inject, toValue, watch, watchEffect } from 'vue'
import type { ComputedRef, InjectionKey, MaybeRefOrGetter, Ref } from 'vue'
import type { TablePreferences } from '~~/shared/types/schemas/table-preferences'

export type TablePreferenceSession = {
  userId: string
  preferences: TablePreferences
  sync: 'loading' | 'load-error' | 'ready' | 'saving' | 'save-error'
  pending: boolean
}

type TablePreferenceStore = {
  state: ComputedRef<TablePreferenceSession | null>
  update: (tableId: string, entry?: TablePreferences[string]) => void
  retry: () => void
}

export const tablePreferencesKey: InjectionKey<TablePreferenceStore> = Symbol('tablePreferences')

type FilterValue = string | null | undefined

export type TableFilterBinding = {
  read: () => string | null
  resolve: (value: unknown) => { selected: FilterValue, apply: () => boolean }
}

export type TableFilterBindings = Record<string, TableFilterBinding>

/**
 * Registers a structured filter with its default and optional current choice set.
 * @param model The existing control's reactive value.
 * @param defaultValue The caller's unfiltered value.
 * @param options A reactive source of selectable values that may finish loading later.
 * @param isSupported An optional parser check for literal values.
 * @returns Read and restoration operations for the mounted filter.
 */
export const tableFilter = (
  model: Ref<FilterValue>,
  defaultValue: FilterValue,
  options?: MaybeRefOrGetter<readonly (FilterValue | { value: FilterValue })[]>,
  isSupported?: (value: string) => boolean
): TableFilterBinding => ({
  read: () => model.value ?? null,
  /**
   * Falls back immediately when the saved value is unavailable.
   * @param value The persisted value at the table boundary.
   * @returns The chosen value and an operation that reports whether it changed the model.
   */
  resolve: value => {
    const validLiteral = typeof value === 'string' && isSupported?.(value) !== false
    const choices = toValue(options)
    const available = value === defaultValue || !choices || choices.some(choice => (choice && typeof choice === 'object' ? choice.value : choice) === value)
    const selected = validLiteral && available ? value : defaultValue
    return {
      selected,
      /** @returns Whether the resolved filter changes the active control. */
      apply: () => {
        if (model.value === selected) return false
        model.value = selected
        return true
      }
    }
  }
})

/**
 * Connects one mounted table to the current account's app-wide preference store.
 * @param options Table identity, structured filters and page-reset callback.
 * @param options.tableId Stable ID shared across instances of this table.
 * @param options.filters The mounted table's structured filter bindings.
 * @param options.resetPage Returns the table to its first page.
 * @returns This table's preference projection and local update operations.
 */
export const useTablePreferences = (options: {
  tableId: MaybeRefOrGetter<string | undefined>
  filters: MaybeRefOrGetter<TableFilterBindings | undefined>
  resetPage: () => void
}) => {
  const store = inject(tablePreferencesKey, null)
  const tableId = computed(() => toValue(options.tableId))
  const state = computed(() => tableId.value ? store?.state.value : undefined)
  const entry = computed(() => {
    const id = tableId.value
    return id ? state.value?.preferences[id] : undefined
  })
  const filters = computed(() => toValue(options.filters) ?? {})
  const editable = computed(() => Boolean(state.value && state.value.sync !== 'loading' && state.value.sync !== 'load-error'))

  const update = (patch: TablePreferences[string]) => {
    const id = tableId.value
    if (id && editable.value) store?.update(id, { ...entry.value, ...patch })
  }

  let applying = false
  let lastOwner: string | undefined
  let lastTable: string | undefined
  let lastSavedFilters: TablePreferences[string]['filters']
  const restored = new Map<string, FilterValue>()
  watchEffect(() => {
    const owner = state.value?.userId
    const id = tableId.value
    const saved = entry.value?.filters
    if (!owner && !lastOwner) return
    if (id !== lastTable || owner !== lastOwner || saved !== lastSavedFilters) restored.clear()
    lastOwner = owner
    lastTable = id
    lastSavedFilters = saved

    applying = true
    let changed = false
    for (const [filterId, binding] of Object.entries(filters.value)) {
      const { selected, apply } = binding.resolve(saved?.[filterId])
      if (restored.has(filterId) && restored.get(filterId) === selected) continue
      restored.set(filterId, selected)
      if (apply()) changed = true
    }
    applying = false
    if (changed) options.resetPage()
  })

  watch(() => Object.entries(filters.value).map(([id, binding]) => [id, binding.read()] as const), (values, previous) => {
    if (applying || !editable.value) return
    const previousValues = new Map(previous)
    const changed = values.filter(([id, value]) => previousValues.has(id) && previousValues.get(id) !== value)
    if (!changed.length) return
    options.resetPage()
    update({ filters: { ...entry.value?.filters, ...Object.fromEntries(changed) } })
  }, { flush: 'sync' })

  const reset = () => {
    if (tableId.value && editable.value) store?.update(tableId.value)
  }

  return { state, entry, editable, update, reset, retry: () => store?.retry() }
}
