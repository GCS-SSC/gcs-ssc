<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowReactive, watch } from 'vue'
import type { Ref } from 'vue'
import type { FundingCaseAgreementApplicantRecipientLookupItem } from '~~/shared/types/funding-case-agreement-ui'

type ApplicantRecipientLookupResponse = {
  items: FundingCaseAgreementApplicantRecipientLookupItem[]
}

type ApplicantRecipientLookupQuery = {
  page: number
  limit: number
  ids?: string[]
  search?: string
}

type VisibleSearchOutcome = 'success' | 'error' | 'cancelled'

type VisibleSearchAttempt = {
  controller: AbortController
  generation: number
  startedSequence: number
  settledSequence: number | null
  promise: Promise<VisibleSearchOutcome>
  resolve: (outcome: VisibleSearchOutcome) => void
}

type SelectedHydrationRequest = {
  controller: AbortController
  lifecycleGeneration: number
  startedSequence: number
  ids: Set<string>
}

const HYDRATION_REQUEST_LIMIT = 100

const {
  streamId = '',
  name = 'applicant_recipient_ids'
} = defineProps<{
  streamId?: string
  name?: string
}>()

const model = defineModel<string[]>('model', {
  default: () => []
})

const { t, locale } = useI18n()
const { showError } = useApiErrorToast()

const isOpen: Ref<boolean> = ref(false)
const isLoading: Ref<boolean> = ref(false)
const searchTerm: Ref<string> = ref('')
const lookupItems: Ref<FundingCaseAgreementApplicantRecipientLookupItem[]> = ref([])
const selectedIds: Ref<string[]> = ref([])
const draftSelectedIds: Ref<string[]> = ref([])
const invalidSelectedIds: Ref<string[]> = ref([])
const cachedItemsById: Ref<Record<string, FundingCaseAgreementApplicantRecipientLookupItem>> = ref({})
const searchTimeout: Ref<ReturnType<typeof setTimeout> | null> = ref(null)
const cachedItemSequenceById = new Map<string, number>()
let visibleSearchGeneration = 0
let hydrationLifecycleGeneration = 0
let lookupOperationSequence = 0
let lastReportedLookupErrorSequence: number | null = null
let currentVisibleSearchAttempt: VisibleSearchAttempt | null = null
let hasResolvedStream = streamId.length > 0
let authoritativeStreamId = streamId
const pendingHydrationById: Map<string, SelectedHydrationRequest> = shallowReactive(new Map())

/**
 * Compares selected applicant-recipient id arrays in order.
 *
 * @param left - Existing selected ids.
 * @param right - Incoming selected ids.
 * @returns Whether both arrays contain the same ids in the same order.
 */
const areIdsEqual = (left: string[], right: string[]) => {
  if (left.length !== right.length) {
    return false
  }

  return left.every((value, index) => value === right[index])
}
const activeSelectedIds = () => isOpen.value ? draftSelectedIds.value : selectedIds.value

/**
 * Caches lookup rows by id so selected proponents keep their labels after searching.
 *
 * @param items - Lookup items to merge into the id cache.
 * @param requestStartedSequence - Sequence of the request that returned the items.
 */
const mergeCachedItems = (
  items: FundingCaseAgreementApplicantRecipientLookupItem[],
  requestStartedSequence: number
) => {
  const nextItems = { ...cachedItemsById.value }

  items.forEach(item => {
    const id = String(item.id)
    const cachedSequence = cachedItemSequenceById.get(id)
    if (cachedSequence !== undefined && cachedSequence > requestStartedSequence) {
      return
    }

    nextItems[id] = item
    cachedItemSequenceById.set(id, requestStartedSequence)
  })

  cachedItemsById.value = nextItems
}

/**
 * Clears a queued lookup search.
 */
const clearSearchTimeout = () => {
  if (searchTimeout.value === null) {
    return
  }

  clearTimeout(searchTimeout.value)
  searchTimeout.value = null
}

/**
 * Invalidates queued and in-flight visible search work and clears its options.
 */
const invalidateVisibleSearch = () => {
  clearSearchTimeout()
  visibleSearchGeneration += 1
  if (currentVisibleSearchAttempt?.settledSequence === null) {
    currentVisibleSearchAttempt.controller.abort()
    currentVisibleSearchAttempt.settledSequence = ++lookupOperationSequence
    currentVisibleSearchAttempt.resolve('cancelled')
  }
  currentVisibleSearchAttempt = null
  lookupItems.value = []
  isLoading.value = false
}

/**
 * Settles one visible-search attempt exactly once.
 *
 * @param attempt - Search attempt being completed.
 * @param outcome - Terminal outcome for the attempt.
 * @returns Operation sequence assigned to the settlement.
 */
const settleVisibleSearchAttempt = (
  attempt: VisibleSearchAttempt,
  outcome: VisibleSearchOutcome
): number => {
  if (attempt.settledSequence !== null) {
    return attempt.settledSequence
  }

  attempt.settledSequence = ++lookupOperationSequence
  attempt.resolve(outcome)
  return attempt.settledSequence
}

/** Reports only the newest lookup failure to avoid duplicate stale toasts.
 *
 * @param error - Lookup failure to display.
 * @param requestStartedSequence - Sequence assigned when the request began.
 * @param errorSequence - Optional preassigned settlement sequence.
 */
const reportLookupError = (
  error: unknown,
  requestStartedSequence: number,
  errorSequence?: number
) => {
  if (
    lastReportedLookupErrorSequence !== null
    && lastReportedLookupErrorSequence >= requestStartedSequence
  ) {
    return
  }

  showError(error)
  lastReportedLookupErrorSequence = errorSequence === undefined
    ? ++lookupOperationSequence
    : errorSequence
}

/**
 * Creates the completion signal used to coordinate visible search and label hydration.
 *
 * @returns The current visible search attempt.
 */
const createVisibleSearchAttempt = (): VisibleSearchAttempt => {
  let resolveAttempt: (outcome: VisibleSearchOutcome) => void = () => {}
  const promise = new Promise<VisibleSearchOutcome>(resolve => {
    resolveAttempt = resolve
  })
  const attempt: VisibleSearchAttempt = {
    controller: new AbortController(),
    generation: visibleSearchGeneration,
    startedSequence: ++lookupOperationSequence,
    settledSequence: null,
    promise,
    resolve: resolveAttempt
  }

  currentVisibleSearchAttempt = attempt
  return attempt
}

/**
 * Loads visible applicant-recipient options for the command palette.
 *
 * @param search - Optional search term used to filter results.
 * @param attempt - Search attempt captured when the request was scheduled.
 */
const fetchVisibleItems = async (search: string, attempt: VisibleSearchAttempt) => {
  if (attempt.generation !== visibleSearchGeneration) {
    settleVisibleSearchAttempt(attempt, 'cancelled')
    return
  }

  try {
    isLoading.value = true
    const query: ApplicantRecipientLookupQuery = {
      page: 1,
      limit: 25,
      ...(search ? { search } : {})
    }
    const response = await $fetch<
      ApplicantRecipientLookupResponse,
      '/api/agreements/lookups/applicant-recipients'
    >('/api/agreements/lookups/applicant-recipients', {
      query,
      signal: attempt.controller.signal
    })

    if (attempt.generation !== visibleSearchGeneration) {
      settleVisibleSearchAttempt(attempt, 'cancelled')
      return
    }

    lookupItems.value = response.items
    mergeCachedItems(response.items, attempt.startedSequence)
    abortUnneededHydrationRequests(activeSelectedIds())
    settleVisibleSearchAttempt(attempt, 'success')
  } catch (error: unknown) {
    if (attempt.generation === visibleSearchGeneration) {
      const errorSequence = settleVisibleSearchAttempt(attempt, 'error')
      reportLookupError(error, attempt.startedSequence, errorSequence)
    } else {
      settleVisibleSearchAttempt(attempt, 'cancelled')
    }
  } finally {
    if (attempt.generation === visibleSearchGeneration) {
      isLoading.value = false
    }
  }
}

/**
 * Waits for the latest visible search that could satisfy pending selected labels.
 *
 * @param hydrationStartedSequence - Sequence captured when selected-label hydration began.
 * @returns Whether that search already reported a lookup error.
 */
const waitForCurrentVisibleSearch = async (
  hydrationStartedSequence: number
): Promise<boolean> => {
  let attempt = currentVisibleSearchAttempt
  if (
    !attempt
    || (
      attempt.settledSequence !== null
      && attempt.settledSequence < hydrationStartedSequence
    )
  ) {
    return false
  }

  while (attempt) {
    const outcome = await attempt.promise
    if (outcome === 'error') {
      return true
    }

    if (currentVisibleSearchAttempt === attempt) {
      return false
    }

    attempt = currentVisibleSearchAttempt
  }

  return false
}

/**
 * Aborts hydration requests that can no longer provide a missing selected label.
 *
 * @param ids - Currently selected applicant-recipient ids.
 */
const abortUnneededHydrationRequests = (ids: string[]) => {
  const selectedIdSet = new Set(ids)
  const requests = new Set(pendingHydrationById.values())

  requests.forEach(request => {
    const canProvideMissingLabel = [...request.ids].some(id => {
      const cachedSequence = cachedItemSequenceById.get(id)
      return selectedIdSet.has(id)
        && (cachedSequence === undefined || cachedSequence < request.startedSequence)
    })
    if (!canProvideMissingLabel) {
      request.controller.abort()
      request.ids.forEach(id => {
        if (pendingHydrationById.get(id) === request) {
          pendingHydrationById.delete(id)
        }
      })
    }
  })
}

/**
 * Aborts every in-flight selected-label hydration request.
 */
const abortPendingHydrationRequests = () => {
  new Set(pendingHydrationById.values()).forEach(request => {
    request.controller.abort()
  })
  pendingHydrationById.clear()
}

/**
 * Removes ids disproved by a successful authoritative lookup and records user feedback.
 *
 * @param ids - Selected ids absent from the successful lookup response.
 */
const removeInvalidSelectedIds = (ids: string[]) => {
  const selectedIdSet = new Set(activeSelectedIds())
  const invalidIds = ids.filter(id => selectedIdSet.has(id))
  if (invalidIds.length === 0) {
    return
  }

  invalidSelectedIds.value = [...new Set([
    ...invalidSelectedIds.value,
    ...invalidIds
  ])]
  const invalidIdSet = new Set(invalidIds)
  if (isOpen.value) {
    draftSelectedIds.value = draftSelectedIds.value.filter(id => !invalidIdSet.has(id))
  } else {
    selectedIds.value = selectedIds.value.filter(id => !invalidIdSet.has(id))
  }
}

/**
 * Invalidates all visible-search and selected-label lookup work.
 */
const teardownLookupRequests = () => {
  invalidateVisibleSearch()
  hydrationLifecycleGeneration += 1
  abortPendingHydrationRequests()
}

/**
 * Hydrates one endpoint-sized batch of selected applicant-recipient ids.
 *
 * @param missingIds - Uncached selected ids, capped to the endpoint limit.
 */
const hydrateSelectedItemsChunk = async (missingIds: string[]) => {
  const request: SelectedHydrationRequest = {
    controller: new AbortController(),
    lifecycleGeneration: hydrationLifecycleGeneration,
    startedSequence: ++lookupOperationSequence,
    ids: new Set(missingIds)
  }

  missingIds.forEach(id => pendingHydrationById.set(id, request))
  let requestError: unknown
  let requestFailed = false
  let invalidIds: string[] = []

  try {
    const query: ApplicantRecipientLookupQuery = {
      page: 1,
      limit: missingIds.length,
      ids: missingIds
    }
    const response = await $fetch<
      ApplicantRecipientLookupResponse,
      '/api/agreements/lookups/applicant-recipients'
    >('/api/agreements/lookups/applicant-recipients', {
      query,
      signal: request.controller.signal
    })

    if (
      request.lifecycleGeneration !== hydrationLifecycleGeneration
      || request.controller.signal.aborted
    ) {
      return
    }

    const currentSelectedIds = new Set(activeSelectedIds())
    const resolvedItems = response.items.filter(item => {
      const id = String(item.id)
      return request.ids.has(id)
        && currentSelectedIds.has(id)
    })
    const resolvedIds = new Set(resolvedItems.map(item => String(item.id)))
    mergeCachedItems(resolvedItems, request.startedSequence)
    invalidIds = missingIds.filter(id => currentSelectedIds.has(id) && !resolvedIds.has(id))
  } catch (error: unknown) {
    requestError = error
    requestFailed = true
  } finally {
    missingIds.forEach(id => {
      if (pendingHydrationById.get(id) === request) {
        pendingHydrationById.delete(id)
      }
    })
  }

  if (
    request.lifecycleGeneration !== hydrationLifecycleGeneration
    || request.controller.signal.aborted
  ) {
    return
  }

  if (!requestFailed) {
    removeInvalidSelectedIds(invalidIds)
    return
  }

  const visibleSearchReportedError = await waitForCurrentVisibleSearch(request.startedSequence)
  if (
    visibleSearchReportedError
    || request.lifecycleGeneration !== hydrationLifecycleGeneration
  ) {
    return
  }

  const unresolvedIds = missingIds.filter(id =>
    activeSelectedIds().includes(id)
    && !cachedItemsById.value[id]
    && !pendingHydrationById.has(id)
  )

  if (unresolvedIds.length > 0) {
    reportLookupError(requestError, request.startedSequence)
  }
}

/**
 * Hydrates selected proponents by id so preselected forms render labels.
 *
 * @param ids - Selected applicant-recipient ids.
 */
const hydrateSelectedItems = async (ids: string[]) => {
  abortUnneededHydrationRequests(ids)
  const missingIds = ids.filter(id =>
    !cachedItemsById.value[id] && !pendingHydrationById.has(id)
  )
  const requests: Promise<void>[] = []

  for (let index = 0; index < missingIds.length; index += HYDRATION_REQUEST_LIMIT) {
    requests.push(hydrateSelectedItemsChunk(
      missingIds.slice(index, index + HYDRATION_REQUEST_LIMIT)
    ))
  }

  await Promise.all(requests)
}

watch(() => model.value, value => {
  const normalizedValue = Array.isArray(value) ? value.map(item => String(item)) : []

  if (areIdsEqual(selectedIds.value, normalizedValue)) {
    return
  }

  selectedIds.value = normalizedValue
  if (isOpen.value) draftSelectedIds.value = [...normalizedValue]
}, { immediate: true })

watch(selectedIds, value => {
  if (areIdsEqual(model.value ?? [], value)) {
    if (streamId) {
      void hydrateSelectedItems(value)
    }
    return
  }

  model.value = [...value]
  if (streamId) {
    void hydrateSelectedItems(value)
  }
}, { immediate: true })

watch(() => streamId, (value, previousValue) => {
  if (value === previousValue) {
    return
  }

  teardownLookupRequests()
  lookupItems.value = []
  cachedItemsById.value = {}
  cachedItemSequenceById.clear()
  invalidSelectedIds.value = []
  searchTerm.value = ''
  isOpen.value = false

  const nextStreamId = String(value)
  const isInitialStreamResolution = !hasResolvedStream && nextStreamId.length > 0
  const isActualStreamReplacement = hasResolvedStream
    && authoritativeStreamId !== nextStreamId

  if (!nextStreamId) {
    authoritativeStreamId = ''
    if (isActualStreamReplacement) {
      selectedIds.value = []
    }
    return
  }

  authoritativeStreamId = nextStreamId
  hasResolvedStream = true
  if (isInitialStreamResolution || isActualStreamReplacement) {
    void hydrateSelectedItems(selectedIds.value)
  }
})

watch(isOpen, value => {
  if (!value) {
    draftSelectedIds.value = [...selectedIds.value]
    invalidateVisibleSearch()
    searchTerm.value = ''
    return
  }

  invalidateVisibleSearch()
  draftSelectedIds.value = [...selectedIds.value]
  invalidSelectedIds.value = []
  const attempt = createVisibleSearchAttempt()
  void fetchVisibleItems(searchTerm.value.trim(), attempt)
})

watch(draftSelectedIds, value => {
  if (isOpen.value && streamId) void hydrateSelectedItems(value)
})

const saveSelection = () => {
  selectedIds.value = [...draftSelectedIds.value]
  isOpen.value = false
}

watch(searchTerm, value => {
  if (!isOpen.value) {
    return
  }

  invalidateVisibleSearch()
  const attempt = createVisibleSearchAttempt()
  isLoading.value = true

  searchTimeout.value = setTimeout(() => {
    searchTimeout.value = null
    void fetchVisibleItems(value.trim(), attempt)
  }, 200)
})

onBeforeUnmount(() => {
  teardownLookupRequests()
})

const groups = computed(() => [
  {
    id: 'applicant-recipients',
    label: t('agreement.applicant_recipients.title'),
    ignoreFilter: true,
    items: lookupItems.value.map(item => {
      const currentItem = cachedItemsById.value[String(item.id)] ?? item
      return {
        id: String(currentItem.id),
        label: String(currentItem[locale.value === 'fr' ? 'label_fr' : 'label_en'] ?? ''),
        description: String(currentItem[locale.value === 'fr' ? 'description_fr' : 'description_en'] ?? ''),
        icon: 'i-lucide-user-round'
      }
    })
  }
])

const selectedItems = computed(() => selectedIds.value.map(id =>
  cachedItemsById.value[id] ?? { id }
))

/**
 * Resolves the visible bilingual label for a selected proponent.
 *
 * @param item - Selected proponent lookup item.
 * @returns The locale-aware label for display.
 */
const getSelectedLabel = (item: FundingCaseAgreementApplicantRecipientLookupItem) => {
  const label = locale.value === 'fr'
    ? item.label_fr ?? item.label_en
    : item.label_en ?? item.label_fr
  if (label) {
    return String(label)
  }

  return pendingHydrationById.has(String(item.id))
    ? t('common.loading')
    : t('agreement.applicant_recipients.unavailable')
}

/**
 * Removes a selected applicant-recipient id from the form model.
 *
 * @param id - Applicant-recipient id to remove.
 */
const removeSelectedId = (id: string) => {
  selectedIds.value = selectedIds.value.filter(value => value !== id)
}
</script>

<template>
  <UFormField :label="t('agreement.applicant_recipients.title')" :name="name">
    <div class="space-y-3">
      <div v-if="selectedItems.length > 0" class="flex flex-wrap gap-2">
        <div
          v-for="item in selectedItems"
          :key="item.id"
          class="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
          <span>{{ getSelectedLabel(item) }}</span>
          <button
            type="button"
            class="cursor-default text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
            :aria-label="`${t('common.remove')}: ${getSelectedLabel(item)}`"
            @click="removeSelectedId(String(item.id))">
            <UIcon name="i-lucide-x" class="size-4" />
          </button>
        </div>
      </div>

      <p v-else class="text-sm text-zinc-500 dark:text-zinc-400">
        {{ t('agreement.applicant_recipients.none_selected') }}
      </p>

      <p
        v-if="invalidSelectedIds.length > 0"
        role="alert"
        class="text-sm text-amber-700 dark:text-amber-300">
        {{ t('agreement.applicant_recipients.invalid_removed') }}
      </p>

      <div class="flex flex-wrap items-center gap-3">
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-users-round"
          class="cursor-default"
          :disabled="!streamId"
          :label="selectedIds.length > 0 ? t('agreement.applicant_recipients.edit_selection') : t('agreement.applicant_recipients.select')"
          @click="isOpen = true" />

        <p v-if="!streamId" class="text-sm text-zinc-500 dark:text-zinc-400">
          {{ t('agreement.applicant_recipients.select_stream_first') }}
        </p>
      </div>
    </div>
  </UFormField>

  <UModal v-model:open="isOpen" :title="t('agreement.applicant_recipients.select')" :description="t('agreement.applicant_recipients.search')">
    <template #content>
      <UCommandPalette
        v-model="draftSelectedIds"
        v-model:search-term="searchTerm"
        multiple
        selection-behavior="toggle"
        value-key="id"
        selected-icon="i-lucide-circle-check"
        :groups="groups"
        :loading="isLoading"
        :placeholder="t('agreement.applicant_recipients.search')"
        class="h-96">
        <template #empty>
          <div class="px-4 py-6 text-sm text-zinc-500 dark:text-zinc-400">
            {{ t('common.no_records') }}
          </div>
        </template>
      </UCommandPalette>
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-between gap-3 px-4 pb-4">
        <span class="text-sm text-zinc-500 dark:text-zinc-400">
          {{ t('agreement.applicant_recipients.selected_count', { count: draftSelectedIds.length }) }}
        </span>
        <UButton
          color="primary"
          class="cursor-default"
          :label="t('common.save')"
          @click="saveSelection" />
      </div>
    </template>
  </UModal>
</template>
