<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { ComputedRef, Ref, WritableComputedRef } from 'vue'
import type {
  AdminCommonLookupResponse,
  AdminCommonLookupResponseItem,
  AdminCommonSelectOption
} from '~~/shared/types/admin-common-ui'
import { useSelectMenuTriggerName } from '~/composables/useSelectMenuTriggerName'
import { toAdminLookupOption } from '~/utils/admin-common-lookup'

defineOptions({ inheritAttrs: false })

type LookupQueryValue = string | number | boolean
type LookupQuery = Record<string, LookupQueryValue>
type LookupRequestQuery = Record<string, LookupQueryValue | string[]>
type LookupModelValue = string | string[] | undefined
type LookupResponse = AdminCommonLookupResponse & { total?: number }

interface DeferredHydrationFailure {
  requestId: number
  signature: string
  error: unknown
}

const {
  fetchUrl,
  valueKey,
  labelEnKey,
  labelFrKey,
  showValueInLabel = true,
  deleted = false,
  limit = 25,
  query = {},
  prependItems = [],
  excludeValues = [],
  selectedFetchUrl,
  selectedValuesQueryKey,
  multiple = false,
  autoSelectSingle = false,
  disabled = false
} = defineProps<{
  fetchUrl: string
  valueKey: string
  labelEnKey: string
  labelFrKey: string
  showValueInLabel?: boolean
  deleted?: boolean
  limit?: number
  query?: Record<string, string | number | boolean>
  prependItems?: AdminCommonSelectOption[]
  excludeValues?: Array<string | number>
  selectedFetchUrl?: string
  selectedValuesQueryKey?: string
  multiple?: boolean
  autoSelectSingle?: boolean
  disabled?: boolean
}>()

const singleModel = defineModel<string | undefined>()
const valuesModel = defineModel<string[]>('values', { default: () => [] })
const { t, locale } = useI18n()
const { showError } = useApiErrorToast()
const selectMenuRef = useSelectMenuTriggerName()

const searchTerm: Ref<string> = ref('')
const debouncedSearchTerm: Readonly<Ref<string>> = refDebounced(searchTerm, 250)
const selectedItemsByValue: Ref<Record<string, AdminCommonLookupResponseItem>> = ref({})
const unavailableSelectedValues: Ref<Set<string>> = ref(new Set())
const isHydratingSelectedItem: Ref<boolean> = ref(false)
const autoSelectionAvailable: Ref<boolean> = ref(autoSelectSingle)
const selectedItemSequenceByValue = new Map<string, number>()
let operationSequence = 0
let hydrateRequestId = 0
let hydrationAbortControllers: AbortController[] = []
let deferredHydrationFailure: DeferredHydrationFailure | null = null

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
  autoSelectionAvailable.value = false
  const normalized = normalizeValues(value)
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
  deleted,
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
  prependValues: prependValueSignature.value,
  valueKey,
  multiple,
  autoSelectSingle
}))
const selectedHydrationSignature = computed(() => JSON.stringify({
  scope: selectedHydrationScopeSignature.value,
  values: normalizedValues.value
}))
const fetchState = useFetch<LookupResponse, Error, string>(() => fetchUrl, {
  query: requestQuery,
  default: () => ({ items: [] })
})
const response = fetchState.data
const status = fetchState.status
const collectionError: Ref<unknown | null> = fetchState.error ?? ref(null)
const refreshCollection = fetchState.refresh ?? (async () => undefined)
const queryGeneration: Ref<number> = ref(0)
const responseGeneration: Ref<number> = ref(-1)
const collectionSettlementGeneration: Ref<number> = ref(-1)
const collectionPendingGeneration: Ref<number> = ref(status.value === 'pending' ? 0 : -1)
const collectionSequenceByGeneration = new Map<number, number>([[0, ++operationSequence]])
const currentResponseItems = computed<AdminCommonLookupResponseItem[]>(() => {
  return responseGeneration.value === queryGeneration.value
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
    selectedItemSequenceByValue.set(value, requestSequence)
  }

  selectedItemsByValue.value = nextItems
}

const unresolvedSelectedValues = () => normalizedValues.value.filter(value =>
  !isPrependedValue(value)
  && !selectedItemsByValue.value[value]
  && !findLookupItemByValue(currentResponseItems.value, value))

/**
 * Cancels current selected-item hydration and invalidates its results.
 */
const cancelSelectedItemHydration = () => {
  hydrateRequestId += 1
  hydrationAbortControllers.forEach(controller => controller.abort())
  hydrationAbortControllers = []
  deferredHydrationFailure = null
  isHydratingSelectedItem.value = false
}

/**
 * Publishes a hydration failure only after the active collection cannot resolve the values.
 */
const finalizeDeferredHydrationFailure = () => {
  const failure = deferredHydrationFailure
  if (
    !failure
    || failure.requestId !== hydrateRequestId
    || failure.signature !== selectedHydrationSignature.value
  ) return

  deferredHydrationFailure = null
  const unresolved = unresolvedSelectedValues()
  if (unresolved.length === 0) {
    isHydratingSelectedItem.value = false
    return
  }

  unavailableSelectedValues.value = new Set([
    ...unavailableSelectedValues.value,
    ...unresolved
  ])
  isHydratingSelectedItem.value = false
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
  if (status.value !== 'success' || responseGeneration.value !== queryGeneration.value) return
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
      deleted,
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
      deleted,
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
  cancelSelectedItemHydration()
  const currentRequestId = hydrateRequestId
  const currentSignature = selectedHydrationSignature.value
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

  isHydratingSelectedItem.value = true
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
      hydrationAbortControllers.push(controller)
      return await fetchHydrationChunk(chunk, controller)
    }))
    if (currentRequestId !== hydrateRequestId || currentSignature !== selectedHydrationSignature.value) return

    const hydratedItems = responses.flat().filter(item => selectedValueSet.has(String(item[valueKey] ?? '')))
    mergeSelectedItems(hydratedItems, requestSequence)
    const resolvedValues = new Set(hydratedItems.map(item => String(item[valueKey] ?? '')))
    unavailableSelectedValues.value = new Set([
      ...unavailableSelectedValues.value,
      ...missingValues.filter(value => !resolvedValues.has(value))
    ])
  } catch (error: unknown) {
    reconcileCurrentSuccessfulCollection()
    if (
      currentRequestId === hydrateRequestId
      && currentSignature === selectedHydrationSignature.value
      && !hydrationAbortControllers.some(controller => controller.signal.aborted)
    ) {
      deferredHydrationFailure = { requestId: currentRequestId, signature: currentSignature, error }
      if (status.value !== 'pending' && collectionSettlementGeneration.value === queryGeneration.value) {
        finalizeDeferredHydrationFailure()
      }
    }
  } finally {
    if (currentRequestId === hydrateRequestId) {
      if (deferredHydrationFailure?.requestId !== currentRequestId) {
        isHydratingSelectedItem.value = false
      }
      hydrationAbortControllers = []
    }
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
  unavailableSelectedValues.value = new Set()
  await refreshCollection()
  await hydrateSelectedItems(normalizedValues.value)
}

watch(collectionRequestSignature, () => {
  queryGeneration.value += 1
  collectionSequenceByGeneration.set(queryGeneration.value, ++operationSequence)
  collectionPendingGeneration.value = status.value === 'pending' ? queryGeneration.value : -1
}, { flush: 'sync' })

watch(selectedHydrationScopeSignature, () => {
  cancelSelectedItemHydration()
  selectedItemsByValue.value = {}
  unavailableSelectedValues.value = new Set()
  selectedItemSequenceByValue.clear()
  autoSelectionAvailable.value = autoSelectSingle && normalizedValues.value.length === 0
}, { flush: 'sync' })

onBeforeUnmount(() => {
  cancelSelectedItemHydration()
})

watch(status, currentStatus => {
  if (currentStatus === 'pending') {
    collectionPendingGeneration.value = queryGeneration.value
    return
  }

  const isInitialSettledCollection = queryGeneration.value === 0
    && collectionSettlementGeneration.value === -1
  if (!isInitialSettledCollection && collectionPendingGeneration.value !== queryGeneration.value) return

  if (currentStatus === 'error') {
    collectionSettlementGeneration.value = queryGeneration.value
    collectionPendingGeneration.value = -1
    finalizeDeferredHydrationFailure()
    return
  }
  if (currentStatus !== 'success') return

  collectionSettlementGeneration.value = queryGeneration.value
  responseGeneration.value = queryGeneration.value
  collectionPendingGeneration.value = -1
  reconcileSelectedItemsFromCollection()
  finalizeDeferredHydrationFailure()
  applyAutomaticSingleSelection()
}, { immediate: true, flush: 'sync' })

watch(selectedHydrationSignature, () => {
  void hydrateSelectedItems(normalizedValues.value)
}, { immediate: true })

const selectItems = computed<AdminCommonSelectOption[]>(() => {
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

  return [...dedupedItems.values()]
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
const isCollectionError = computed(() => status.value === 'error' || Boolean(collectionError.value))
const showEmptyState = computed(() =>
  status.value === 'success'
  && currentResponseItems.value.length === 0
  && normalizedValues.value.length === 0
  && debouncedSearchTerm.value.length === 0)
const statusMessage = computed(() => {
  if (status.value === 'pending' || isHydratingSelectedItem.value) return t('common.loading')
  if (isCollectionError.value) return t('common.lookup_load_failed')
  if (showEmptyState.value) return t('common.no_options')
  return t('common.selected_count', { count: normalizedValues.value.length })
})
const removeSelectedValue = (value: string) => {
  autoSelectionAvailable.value = false
  model.value = normalizedValues.value.filter(item => item !== value)
}
</script>

<template>
  <div class="space-y-2">
    <div @keydown.enter.prevent.stop>
      <USelectMenu
        ref="selectMenuRef"
        v-model:search-term="searchTerm"
        :model-value="displayedModel"
        :items="selectItems"
        value-key="value"
        label-key="label"
        :multiple="multiple"
        :ignore-filter="true"
        :loading="status === 'pending' || isHydratingSelectedItem"
        :disabled="disabled || isCollectionError"
        :search-input="{ placeholder: t('common.search') }"
        v-bind="$attrs"
        @update:model-value="onModelUpdate" />
    </div>

    <div v-if="isCollectionError" role="alert" class="flex flex-wrap items-center gap-2 text-sm text-error">
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
          <button
            type="button"
            class="cursor-default rounded-sm p-0.5 text-zinc-500 hover:text-error disabled:opacity-50"
            :disabled="disabled"
            :aria-label="t('common.remove_selected_item', { label: item.label })"
            @click="removeSelectedValue(item.value)">
            <UIcon name="i-lucide-x" aria-hidden="true" />
          </button>
        </span>
      </li>
    </ul>
    <p v-if="multiple" class="sr-only" aria-live="polite" aria-atomic="true">
      {{ statusMessage }}
    </p>
  </div>
</template>
