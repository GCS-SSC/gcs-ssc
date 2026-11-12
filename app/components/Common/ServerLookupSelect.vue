<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import type { ComputedRef, Ref, WritableComputedRef } from 'vue'
import { getCatalogRequestUrl } from '~/utils/catalog-request-url'
import type {
  AdminCommonLookupResponse,
  AdminCommonLookupResponseItem,
  AdminCommonSelectOption
} from '~~/shared/types/admin-common-ui'
import { useSelectMenuTriggerName } from '~/composables/useSelectMenuTriggerName'
import { useCatalogCacheRefresh } from '~/composables/useCatalogCacheRefresh'
import { toAdminLookupOption } from '~/utils/admin-common-lookup'
import { formRequirementKey } from '~/utils/form-requirement-context'

defineOptions({ inheritAttrs: false })

type LookupQueryValue = string | number | boolean
type LookupQuery = Record<string, LookupQueryValue>
type LookupRequestQuery = Record<string, LookupQueryValue | string[]>
type LookupModelValue = string | string[] | undefined
type LookupResponse = AdminCommonLookupResponse & { total?: number }

type HydrationRequest = {
  signature: string
  controllers: AbortController[]
}
type HydrationState =
  | { kind: 'idle' }
  | { kind: 'pending'; request: HydrationRequest }
  | { kind: 'awaiting-collection'; request: HydrationRequest; error: unknown }
  | { kind: 'disposed' }
type CollectionSettlement =
  | { kind: 'awaiting'; generation: number }
  | { kind: 'pending'; generation: number }
  | { kind: 'success'; generation: number }
  | { kind: 'error'; generation: number }
type CollectionEvidence = { kind: 'unaccepted' } | { kind: 'accepted'; generation: number }
type CatalogVersionState =
  | { kind: 'ready' }
  | { kind: 'error' }
  | { kind: 'checking'; request: symbol; failed: boolean }

const {
  fetchUrl,
  valueKey,
  labelEnKey,
  labelFrKey,
  showValueInLabel = true,
  deleted = false,
  includeDeletedQuery = true,
  limit = 25,
  query = {},
  prependItems = [],
  excludeValues = [],
  disabledValues = [],
  selectedFetchUrl,
  selectedValuesQueryKey,
  multiple = false,
  closeOnSelect = false,
  autoSelectSingle = false,
  disabled = false
} = defineProps<{
  fetchUrl: string
  valueKey: string
  labelEnKey: string
  labelFrKey: string
  showValueInLabel?: boolean
  deleted?: boolean
  includeDeletedQuery?: boolean
  limit?: number
  query?: Record<string, string | number | boolean>
  prependItems?: AdminCommonSelectOption[]
  excludeValues?: Array<string | number>
  disabledValues?: Array<string | number>
  selectedFetchUrl?: string
  selectedValuesQueryKey?: string
  multiple?: boolean
  closeOnSelect?: boolean
  autoSelectSingle?: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{
  'resolved-items': [items: AdminCommonLookupResponseItem[]]
}>()

const singleModel = defineModel<string | undefined>()
const valuesModel = defineModel<string[]>('values', { default: () => [] })
const { t, locale } = useI18n()
const { showError } = useApiErrorToast()
const selectMenuRef = useSelectMenuTriggerName()
const form = inject(formRequirementKey, undefined)
const isInteractionDisabled = computed(() => disabled || Boolean(form?.disabled.value))

const searchTerm: Ref<string> = ref('')
const menuOpen: Ref<boolean> = ref(false)
const debouncedSearchTerm: Readonly<Ref<string>> = refDebounced(searchTerm, 250)
const selectedItemsByValue: Ref<Record<string, AdminCommonLookupResponseItem>> = ref({})
const unavailableSelectedValues: Ref<Set<string>> = ref(new Set())
const hydrationState = shallowRef<HydrationState>({ kind: 'idle' })
const isHydratingSelectedItem = computed(() => hydrationState.value.kind === 'pending' || hydrationState.value.kind === 'awaiting-collection')
const catalogVersionState = shallowRef<CatalogVersionState>({ kind: 'ready' })
const isCheckingCatalogVersions = computed(() => catalogVersionState.value.kind === 'checking')
const catalogCheckFailed = computed(() => catalogVersionState.value.kind === 'error'
  || (catalogVersionState.value.kind === 'checking' && catalogVersionState.value.failed))
const autoSelectionAvailable: Ref<boolean> = ref(autoSelectSingle)
const selectedItemSequenceByValue = new Map<string, number>()
const staleSelectedValues = new Set<string>()
let operationSequence = 0
const isDisposed = () => hydrationState.value.kind === 'disposed'

const normalizeValues = (value: LookupModelValue): string[] => {
  const values = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]
  return [...new Set(values.map(item => String(item)).filter(Boolean))]
}
const model: WritableComputedRef<LookupModelValue> = computed({
  get: () => multiple ? valuesModel.value : singleModel.value,
  /**
   * Normalizes updates before forwarding them to the active single or multiple model.
   *
   * @param value - Updated lookup id value or values.
   */
  set: value => {
    const normalized = normalizeValues(value)
    if (multiple) {
      valuesModel.value = normalized
      return
    }
    singleModel.value = normalized[0]
  }
})
const normalizedValues: ComputedRef<string[]> = computed(() => normalizeValues(model.value))

/**
 * Propagates normalized select updates back to the parent model.
 *
 * @param value - Selected lookup id value or values.
 */
const onModelUpdate = (value: LookupModelValue) => {
  if (isDisposed() || isInteractionDisabled.value || isCheckingCatalogVersions.value || catalogCheckFailed.value) return
  autoSelectionAvailable.value = false
  const normalized = normalizeValues(value)
  if (closeOnSelect) menuOpen.value = false
  model.value = multiple ? normalized : normalized[0]
}

const stableQuerySignature = computed(() =>
  JSON.stringify(Object.entries(query).sort(([left], [right]) => left.localeCompare(right)))
)
const prependValueSignature = computed(() => prependItems.map(item => String(item.value)).join('\u0000'))
const stableQuery = computed<LookupQuery>(() => Object.fromEntries(JSON.parse(stableQuerySignature.value)) as LookupQuery)
const requestQuery = computed(() => ({
  page: 1,
  limit,
  search: debouncedSearchTerm.value,
  ...(includeDeletedQuery ? { deleted } : {}),
  ...stableQuery.value
}))
const collectionRequestSignature = computed(() => JSON.stringify({
  fetchUrl,
  query: requestQuery.value
}))
const selectedHydrationScopeSignature = computed(() => JSON.stringify({
  fetchUrl,
  selectedFetchUrl: selectedFetchUrl ?? null,
  selectedValuesQueryKey: selectedValuesQueryKey ?? null,
  query: stableQuerySignature.value,
  deleted,
  includeDeletedQuery,
  prependValues: prependValueSignature.value,
  valueKey,
  multiple,
  autoSelectSingle
}))
const selectedHydrationSignature = computed(() => JSON.stringify({
  scope: selectedHydrationScopeSignature.value,
  values: normalizedValues.value
}))
const fetchState = useCatalogFetch<LookupResponse, Error, string>(() => fetchUrl, {
  query: requestQuery,
  default: () => ({ items: [] })
})
const response = fetchState.data
const status = fetchState.status
const collectionError: Ref<unknown | null> = fetchState.error ?? ref(null)
const refreshCollection = fetchState.refresh ?? (async () => undefined)
const queryGeneration: Ref<number> = ref(0)
const collectionEvidence = shallowRef<CollectionEvidence>({ kind: 'unaccepted' })
const collectionSettlement = shallowRef<CollectionSettlement>({ kind: status.value === 'pending' ? 'pending' : 'awaiting', generation: 0 })
const collectionSequenceByGeneration = new Map<number, number>([[0, ++operationSequence]])
const currentResponseItems = computed<AdminCommonLookupResponseItem[]>(() => {
  return !isCheckingCatalogVersions.value && !catalogCheckFailed.value && collectionEvidence.value.kind === 'accepted' && collectionEvidence.value.generation === queryGeneration.value
    ? response.value?.items ?? []
    : []
})

const findLookupItemByValue = (items: AdminCommonLookupResponseItem[], value: string) => {
  return items.find(item => String(item[valueKey] ?? '') === value)
}
const isPrependedValue = (value: string) => prependItems.some(item => String(item.value) === value)

/**
 * Stores selected lookup records only when the response is not older than the saved record.
 *
 * @param items - Lookup records returned by collection or hydration requests.
 * @param requestSequence - Monotonic ordering token for the request.
 */
const mergeSelectedItems = (
  items: AdminCommonLookupResponseItem[],
  requestSequence: number
) => {
  const selectedValues = new Set(normalizedValues.value)
  const nextItems = { ...selectedItemsByValue.value }

  for (const item of items) {
    const value = String(item[valueKey] ?? '')
    if (!selectedValues.has(value)) continue
    const storedSequence = selectedItemSequenceByValue.get(value)
    if (storedSequence !== undefined && storedSequence > requestSequence) continue
    nextItems[value] = item
    staleSelectedValues.delete(value)
    selectedItemSequenceByValue.set(value, requestSequence)
  }

  selectedItemsByValue.value = nextItems
}

/**
 * Finds selected values whose labels need an authoritative request.
 * @returns Selected ids with absent or stale labels.
 */
const unresolvedSelectedValues = () => normalizedValues.value.filter(value =>
  !isPrependedValue(value)
  && (staleSelectedValues.has(value)
    || (!selectedItemsByValue.value[value]
      && !findLookupItemByValue(currentResponseItems.value, value))))

/**
 * Cancels current selected-item hydration and invalidates its results.
 */
const cancelSelectedItemHydration = () => {
  const current = hydrationState.value
  if (current.kind === 'disposed') return
  hydrationState.value = { kind: 'idle' }
  if (current.kind === 'pending' || current.kind === 'awaiting-collection') {
    current.request.controllers.forEach(controller => controller.abort())
  }
}

/**
 * Checks whether the active hydration still owns the selected identity.
 * @param request - Hydration operation whose result is settling.
 * @returns Whether this request can update the selected labels.
 */
const ownsHydration = (request: HydrationRequest) => {
  const current = hydrationState.value
  return (current.kind === 'pending' || current.kind === 'awaiting-collection')
    && current.request === request
    && request.signature === selectedHydrationSignature.value
}

/** Publishes a hydration failure only after the collection cannot resolve it. */
const finalizeDeferredHydrationFailure = () => {
  const failure = hydrationState.value
  if (failure.kind !== 'awaiting-collection' || !ownsHydration(failure.request)) return

  const unresolved = unresolvedSelectedValues()
  hydrationState.value = { kind: 'idle' }
  if (unresolved.length === 0) return

  unavailableSelectedValues.value = new Set([
    ...unavailableSelectedValues.value,
    ...unresolved
  ])
  showError(failure.error)
}

/**
 * Reconciles selected values from the accepted collection page.
 */
const reconcileSelectedItemsFromCollection = () => {
  const requestSequence = collectionSequenceByGeneration.get(queryGeneration.value) ?? 0
  mergeSelectedItems(currentResponseItems.value, requestSequence)
  const resolvedValues = new Set(currentResponseItems.value.map(item => String(item[valueKey] ?? '')))
  unavailableSelectedValues.value = new Set(
    [...unavailableSelectedValues.value].filter(value => !resolvedValues.has(value))
  )
  if (isHydratingSelectedItem.value && unresolvedSelectedValues().length === 0) {
    cancelSelectedItemHydration()
  }
}

/**
 * Reconciles the current successful collection synchronously with hydration settlement.
 */
const reconcileCurrentSuccessfulCollection = () => {
  if (status.value !== 'success' || collectionEvidence.value.kind !== 'accepted' || collectionEvidence.value.generation !== queryGeneration.value) return
  reconcileSelectedItemsFromCollection()
}

/**
 * Fetches one bounded batch of selected lookup records.
 *
 * @param values - Selected ids to hydrate.
 * @param controller - Abort controller owned by the active hydration request.
 * @returns Matching lookup records.
 */
const fetchHydrationChunk = async (
  values: string[],
  controller: AbortController
): Promise<AdminCommonLookupResponseItem[]> => {
  if (!multiple && selectedFetchUrl && values.length === 1) {
    const item = await $fetch<AdminCommonLookupResponseItem, string>(selectedFetchUrl, {
      signal: controller.signal
    })
    return String(item[valueKey] ?? '') === values[0] ? [item] : []
  }

  if (selectedValuesQueryKey) {
    const queryWithValues: LookupRequestQuery = {
      page: 1,
      limit: values.length,
      ...(includeDeletedQuery ? { deleted } : {}),
      ...stableQuery.value,
      [selectedValuesQueryKey]: values
    }
    const selectedResponse = await $fetch<LookupResponse, string>(fetchUrl, {
      signal: controller.signal,
      query: queryWithValues
    })
    return selectedResponse.items ?? []
  }

  const responses = await Promise.all(values.map(async value => await $fetch<LookupResponse, string>(fetchUrl, {
    signal: controller.signal,
    query: {
      page: 1,
      limit: 1,
      search: value,
      ...(includeDeletedQuery ? { deleted } : {}),
      ...stableQuery.value
    }
  })))
  return responses.flatMap(item => item.items ?? [])
}

/**
 * Resolves off-page model values without allowing stale requests to replace them.
 *
 * @param values - Selected lookup values to resolve.
 */
const hydrateSelectedItems = async (values: string[]) => {
  if (isDisposed()) return
  cancelSelectedItemHydration()
  const request: HydrationRequest = { signature: selectedHydrationSignature.value, controllers: [] }
  const selectedValueSet = new Set(values)
  selectedItemsByValue.value = Object.fromEntries(
    Object.entries(selectedItemsByValue.value).filter(([value]) => selectedValueSet.has(value))
  )
  unavailableSelectedValues.value = new Set(
    [...unavailableSelectedValues.value].filter(value => selectedValueSet.has(value))
  )
  reconcileCurrentSuccessfulCollection()

  const missingValues = unresolvedSelectedValues()
  if (missingValues.length === 0 || typeof $fetch !== 'function') return

  hydrationState.value = { kind: 'pending', request }
  unavailableSelectedValues.value = new Set(
    [...unavailableSelectedValues.value].filter(value => !missingValues.includes(value))
  )
  const requestSequence = ++operationSequence
  const chunks = selectedValuesQueryKey
    ? Array.from({ length: Math.ceil(missingValues.length / 100) }, (_, index) =>
        missingValues.slice(index * 100, (index + 1) * 100))
    : [missingValues]

  try {
    const responses = await Promise.all(chunks.map(async chunk => {
      const controller = new AbortController()
      request.controllers.push(controller)
      return await fetchHydrationChunk(chunk, controller)
    }))
    if (!ownsHydration(request)) return

    const hydratedItems = responses.flat().filter(item => selectedValueSet.has(String(item[valueKey] ?? '')))
    mergeSelectedItems(hydratedItems, requestSequence)
    const resolvedValues = new Set(hydratedItems.map(item => String(item[valueKey] ?? '')))
    unavailableSelectedValues.value = new Set([
      ...unavailableSelectedValues.value,
      ...missingValues.filter(value => !resolvedValues.has(value))
    ])
  } catch (error: unknown) {
    reconcileCurrentSuccessfulCollection()
    if (ownsHydration(request) && !request.controllers.some(controller => controller.signal.aborted)) {
      hydrationState.value = { kind: 'awaiting-collection', request, error }
      const settlement = collectionSettlement.value
      if (status.value !== 'pending' && settlement.generation === queryGeneration.value
        && (settlement.kind === 'success' || settlement.kind === 'error')) {
        finalizeDeferredHydrationFailure()
      }
    }
  } finally {
    const current = hydrationState.value
    if (current.kind === 'pending' && current.request === request) {
      hydrationState.value = { kind: 'idle' }
    }
    request.controllers = []
  }
}

/**
 * Selects the sole authoritative result once for relationship fields that require a default.
 */
const applyAutomaticSingleSelection = () => {
  if (
    !autoSelectSingle
    || !autoSelectionAvailable.value
    || normalizedValues.value.length > 0
    || debouncedSearchTerm.value.length > 0
    || response.value?.total !== 1
    || currentResponseItems.value.length !== 1
  ) return

  const value = String(currentResponseItems.value[0]?.[valueKey] ?? '')
  if (!value) return
  autoSelectionAvailable.value = false
  model.value = multiple ? [value] : value
}

/**
 * Retries both the visible collection and any unresolved selected-id hydration.
 */
const retryLookup = async () => {
  if (isDisposed()) return
  if (!await ensureCatalogVersions()) return
  const signature = selectedHydrationSignature.value
  try {
    await refreshCollection()
  } catch (error: unknown) {
    if (isDisposed() || signature !== selectedHydrationSignature.value) return
    collectionError.value = error
    showError(error)
    return
  }
  if (isDisposed() || signature !== selectedHydrationSignature.value) return
  await hydrateSelectedItems(normalizedValues.value)
}

const { check: checkCatalogVersions } = useCatalogCacheRefresh(
  () => getCatalogRequestUrl(fetchUrl, requestQuery.value),
  change => {
    cancelSelectedItemHydration()
    queryGeneration.value += 1
    collectionEvidence.value = { kind: 'unaccepted' }
    collectionSequenceByGeneration.set(queryGeneration.value, ++operationSequence)
    collectionSettlement.value = { kind: status.value === 'pending' ? 'pending' : 'awaiting', generation: queryGeneration.value }
    selectedItemSequenceByValue.clear()
    staleSelectedValues.clear()
    if (change.securityContextChanged) {
      catalogVersionState.value = { kind: 'ready' }
      selectedItemsByValue.value = {}
      unavailableSelectedValues.value = new Set()
      return
    }
    normalizedValues.value.forEach(value => staleSelectedValues.add(value))
    // Keep historical selected labels until a fresh collection or hydration replaces them.
    return hydrateSelectedItems(normalizedValues.value)
  },
  error => {
    const current = catalogVersionState.value
    catalogVersionState.value = current.kind === 'checking' ? { ...current, failed: true } : { kind: 'error' }
    showError(error)
  }
)
/**
 * Holds choices until the version check settles without changing selected values.
 * @returns Whether the current catalog versions are available.
 */
const ensureCatalogVersions = async (): Promise<boolean> => {
  const request = Symbol('catalog-check')
  catalogVersionState.value = { kind: 'checking', request, failed: catalogCheckFailed.value }
  try {
    const success = await checkCatalogVersions()
    const current = catalogVersionState.value
    if (!isDisposed() && current.kind === 'checking' && current.request === request) {
      catalogVersionState.value = { kind: success ? 'ready' : 'error' }
    }
    return success
  } finally {
    const current = catalogVersionState.value
    if (!isDisposed() && current.kind === 'checking' && current.request === request) {
      catalogVersionState.value = { kind: current.failed ? 'error' : 'ready' }
    }
  }
}

watch(menuOpen, open => {
  if (open) void ensureCatalogVersions()
}, { flush: 'sync' })

watch(collectionRequestSignature, () => {
  catalogVersionState.value = { kind: 'ready' }
  queryGeneration.value += 1
  collectionSequenceByGeneration.set(queryGeneration.value, ++operationSequence)
  collectionSettlement.value = { kind: status.value === 'pending' ? 'pending' : 'awaiting', generation: queryGeneration.value }
}, { flush: 'sync' })

watch(selectedHydrationScopeSignature, () => {
  cancelSelectedItemHydration()
  selectedItemsByValue.value = {}
  unavailableSelectedValues.value = new Set()
  selectedItemSequenceByValue.clear()
  staleSelectedValues.clear()
  autoSelectionAvailable.value = autoSelectSingle && normalizedValues.value.length === 0
}, { flush: 'sync' })

onBeforeUnmount(() => {
  cancelSelectedItemHydration()
  hydrationState.value = { kind: 'disposed' }
})

watch(status, currentStatus => {
  if (currentStatus === 'pending') {
    collectionSettlement.value = { kind: 'pending', generation: queryGeneration.value }
    return
  }

  const settlement = collectionSettlement.value
  const isInitialSettledCollection = queryGeneration.value === 0 && settlement.kind === 'awaiting'
  if (!isInitialSettledCollection && (settlement.kind !== 'pending' || settlement.generation !== queryGeneration.value)) return

  if (currentStatus === 'error') {
    collectionSettlement.value = { kind: 'error', generation: queryGeneration.value }
    finalizeDeferredHydrationFailure()
    return
  }
  if (currentStatus !== 'success') return

  collectionSettlement.value = { kind: 'success', generation: queryGeneration.value }
  collectionEvidence.value = { kind: 'accepted', generation: queryGeneration.value }
  reconcileSelectedItemsFromCollection()
  finalizeDeferredHydrationFailure()
  applyAutomaticSingleSelection()
}, { immediate: true, flush: 'sync' })

watch(selectedHydrationSignature, () => {
  void hydrateSelectedItems(normalizedValues.value)
}, { immediate: true })

const selectItems = computed<Array<AdminCommonSelectOption & { disabled?: boolean }>>(() => {
  const excludedValueSet = new Set(excludeValues.map(value => String(value)))
  const dedupedItems = new Map<string, AdminCommonSelectOption>()

  for (const item of prependItems) {
    const value = String(item.value)
    if (!excludedValueSet.has(value) && !dedupedItems.has(value)) {
      dedupedItems.set(value, { label: item.label, value })
    }
  }

  const hydratedSelectedItems = normalizedValues.value
    .map(value => selectedItemsByValue.value[value])
    .filter((item): item is AdminCommonLookupResponseItem => Boolean(item))
  const remoteItems: AdminCommonLookupResponseItem[] = [
    ...hydratedSelectedItems,
    ...currentResponseItems.value
  ]
  for (const item of remoteItems) {
    const option = toAdminLookupOption(item, {
      valueKey,
      labelEnKey,
      labelFrKey,
      locale: locale.value,
      showValueInLabel
    })
    if (!excludedValueSet.has(option.value) && !dedupedItems.has(option.value)) {
      dedupedItems.set(option.value, option)
    }
  }

  for (const value of normalizedValues.value) {
    if (excludedValueSet.has(value) || dedupedItems.has(value)) continue
    if (!multiple && !unavailableSelectedValues.value.has(value)) continue
    dedupedItems.set(value, {
      label: unavailableSelectedValues.value.has(value) ? t('common.unavailable') : t('common.loading'),
      value
    })
  }

  const disabledValueSet = new Set(disabledValues.map(String))
  return [...dedupedItems.values()].map(item => disabledValueSet.has(item.value) ? { ...item, disabled: true } : item)
})
const displayedModel = computed<LookupModelValue>(() => {
  const availableValues = new Set(selectItems.value.map(item => item.value))
  const values = normalizedValues.value.filter(value => availableValues.has(value))
  return multiple ? values : values[0]
})
const selectedOptions = computed(() => {
  const optionsByValue = new Map(selectItems.value.map(item => [item.value, item]))
  return normalizedValues.value.flatMap(value => {
    const option = optionsByValue.get(value)
    return option ? [option] : []
  })
})
const resolvedSelectedItems = computed(() => normalizedValues.value.flatMap(value => {
  const item = selectedItemsByValue.value[value]
  return item ? [item] : []
}))
watch(resolvedSelectedItems, items => emit('resolved-items', items), { immediate: true, flush: 'sync' })
const hasUnavailableSelection = computed(() => unavailableSelectedValues.value.size > 0)
const isCollectionError = computed(() => catalogCheckFailed.value || status.value === 'error' || Boolean(collectionError.value))
const showEmptyState = computed(() =>
  status.value === 'success'
  && currentResponseItems.value.length === 0
  && normalizedValues.value.length === 0
  && debouncedSearchTerm.value.length === 0)
const statusMessage = computed(() => {
  if (status.value === 'pending' || isHydratingSelectedItem.value || isCheckingCatalogVersions.value) return t('common.loading')
  if (isCollectionError.value) return t('common.lookup_load_failed')
  if (showEmptyState.value) return t('common.no_options')
  return t('common.selected_count', { count: normalizedValues.value.length })
})
/**
 * Removes a selected chip while its owning form permits editing.
 * @param value - Selected lookup ID to remove.
 */
const removeSelectedValue = (value: string) => {
  if (isDisposed() || isInteractionDisabled.value) return
  autoSelectionAvailable.value = false
  model.value = normalizedValues.value.filter(item => item !== value)
}
</script>

<template>
  <div class="space-y-2" data-field-exclude="Composite control internals; configurable help belongs to the owning business field.">
    <div @keydown.enter.prevent.stop>
      <USelectMenu
        ref="selectMenuRef"
        v-model:search-term="searchTerm"
        :open="closeOnSelect ? menuOpen : undefined"
        :ui="closeOnSelect ? { content: 'data-[state=closed]:animate-none' } : undefined"
        :model-value="displayedModel"
        :items="selectItems"
        value-key="value"
        label-key="label"
        :multiple="multiple"
        :ignore-filter="true"
        :loading="status === 'pending' || isHydratingSelectedItem || isCheckingCatalogVersions"
        :disabled="isInteractionDisabled || isCollectionError || isCheckingCatalogVersions"
        :search-input="{ placeholder: t('common.search') }"
        v-bind="$attrs"
        @update:model-value="onModelUpdate"
        @update:open="value => menuOpen = value" />
    </div>

    <div v-if="isCollectionError || hasUnavailableSelection" role="alert" class="flex flex-wrap items-center gap-2 text-sm text-error">
      <span>{{ t('common.lookup_load_failed') }}</span>
      <UButton
        type="button"
        color="neutral"
        variant="outline"
        size="xs"
        icon="i-lucide-refresh-cw"
        :label="t('common.retry')"
        :loading="status === 'pending'"
        @click="retryLookup" />
    </div>
    <p v-else-if="showEmptyState" class="text-sm text-zinc-500 dark:text-zinc-400">
      {{ t('common.no_options') }}
    </p>

    <ul
      v-if="multiple && selectedOptions.length > 0"
      class="flex flex-wrap gap-2"
      :aria-label="t('common.selected_items')">
      <li v-for="item in selectedOptions" :key="item.value">
        <span class="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-2 py-1 text-sm dark:bg-zinc-800">
          {{ item.label }}
          <UTooltip :text="t('common.remove_selected_item', { label: item.label })">
            <button
              type="button"
              class="cursor-default rounded-sm p-0.5 text-zinc-500 hover:text-error disabled:opacity-50"
              :disabled="isInteractionDisabled"
              :aria-label="t('common.remove_selected_item', { label: item.label })"
              @click="removeSelectedValue(item.value)">
              <UIcon name="i-lucide-x" aria-hidden="true" />
            </button>
          </UTooltip>
        </span>
      </li>
    </ul>
    <p v-if="multiple" class="sr-only" aria-live="polite" aria-atomic="true">
      {{ statusMessage }}
    </p>
  </div>
</template>
