<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref, shallowReactive, shallowRef, useId, watch } from 'vue'
import type { Ref } from 'vue'
import { formRequirementKey } from '~/utils/form-requirement-context'
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
  startedSequence: number
  settlement: { kind: 'pending' } | { kind: 'settled'; sequence: number; outcome: VisibleSearchOutcome }
  promise: Promise<VisibleSearchOutcome>
  resolve: (outcome: VisibleSearchOutcome) => void
}

type HydrationLifetime = { kind: 'active' } | { kind: 'disposed' }

type SelectedHydrationRequest = {
  controller: AbortController
  lifetime: Extract<HydrationLifetime, { kind: 'active' }>
  startedSequence: number
  ids: Set<string>
}

const HYDRATION_REQUEST_LIMIT = 100

const {
  name = 'egcs_fc_applicantrecipients',
  streamId
} = defineProps<{
  name?: string
  streamId?: string
}>()

const model = defineModel<{ egcs_fc_applicantrecipient: string; egcs_fc_applicantrecipientsubtype?: string | null; egcs_fc_agencyfinancialid?: string | null }[]>('model', {
  default: () => []
})

const { t, locale } = useI18n()
const pickerId = useId()
const pickerDialogContent = { id: `${pickerId}-dialog`, disableOutsidePointerEvents: true }
const { showError } = useApiErrorToast()
const form = inject(formRequirementKey, undefined)
const isInteractionDisabled = computed(() => Boolean(form?.disabled.value))

type PickerSession = { kind: 'closed' } | { kind: 'open'; draft: string[] }
const pickerSession = ref<PickerSession>({ kind: 'closed' })
const isOpen = computed({
  get: () => pickerSession.value.kind === 'open',
  /**
   * Opens the picker only while its owning Form permits edits.
   * @param open - Requested picker visibility.
   */
  set: (open: boolean) => {
    if (open && isInteractionDisabled.value) return
    if (open === (pickerSession.value.kind === 'open')) return
    pickerSession.value = open ? { kind: 'open', draft: [...selectedIds.value] } : { kind: 'closed' }
  }
})
type VisibleSearchState =
  | { kind: 'idle' | 'disposed' }
  | { kind: 'debouncing'; attempt: VisibleSearchAttempt; timer: ReturnType<typeof setTimeout> }
  | { kind: 'pending' | 'settled'; attempt: VisibleSearchAttempt }
const visibleSearch = shallowRef<VisibleSearchState>({ kind: 'idle' })
const isLoading = computed(() => visibleSearch.value.kind === 'debouncing' || visibleSearch.value.kind === 'pending')
const searchTerm: Ref<string> = ref('')
const lookupItems: Ref<FundingCaseAgreementApplicantRecipientLookupItem[]> = ref([])
const selectedIds: Ref<string[]> = ref([])
const draftSelectedIds = computed({
  get: () => pickerSession.value.kind === 'open' ? pickerSession.value.draft : selectedIds.value,
  set: (draft: string[]) => {
    if (isInteractionDisabled.value) return
    if (pickerSession.value.kind === 'open') pickerSession.value.draft = draft
  }
})
const invalidSelectedIds: Ref<string[]> = ref([])
const cachedItemsById: Ref<Record<string, FundingCaseAgreementApplicantRecipientLookupItem>> = ref({})
const cachedItemSequenceById = new Map<string, number>()
const hydrationLifetime = shallowRef<HydrationLifetime>({ kind: 'active' })
let lookupOperationSequence = 0
let lastReportedLookupErrorSequence: number | null = null
const currentVisibleSearchAttempt = () => 'attempt' in visibleSearch.value ? visibleSearch.value.attempt : null
const ownsVisibleSearch = (attempt: VisibleSearchAttempt) => currentVisibleSearchAttempt() === attempt
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

/** Invalidates visible work while keeping selected-label hydration independent. */
const invalidateVisibleSearch = () => {
  if (visibleSearch.value.kind === 'debouncing') clearTimeout(visibleSearch.value.timer)
  const attempt = currentVisibleSearchAttempt()
  if (attempt?.settlement.kind === 'pending') {
    attempt.controller.abort()
    settleVisibleSearchAttempt(attempt, 'cancelled')
  }
  visibleSearch.value = { kind: 'idle' }
  lookupItems.value = []
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
  if (attempt.settlement.kind === 'settled') return attempt.settlement.sequence
  const sequence = ++lookupOperationSequence
  attempt.settlement = { kind: 'settled', sequence, outcome }
  if (ownsVisibleSearch(attempt)) visibleSearch.value = { kind: 'settled', attempt }
  attempt.resolve(outcome)
  return sequence
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
    startedSequence: ++lookupOperationSequence,
    settlement: { kind: 'pending' },
    promise,
    resolve: resolveAttempt
  }

  visibleSearch.value = { kind: 'pending', attempt }
  return attempt
}

/**
 * Loads visible applicant-recipient options for the command palette.
 *
 * @param search - Optional search term used to filter results.
 * @param attempt - Search attempt captured when the request was scheduled.
 */
const fetchVisibleItems = async (search: string, attempt: VisibleSearchAttempt) => {
  if (!ownsVisibleSearch(attempt)) {
    settleVisibleSearchAttempt(attempt, 'cancelled')
    return
  }

  try {
    visibleSearch.value = { kind: 'pending', attempt }
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

    if (!ownsVisibleSearch(attempt)) {
      settleVisibleSearchAttempt(attempt, 'cancelled')
      return
    }

    lookupItems.value = response.items
    mergeCachedItems(response.items, attempt.startedSequence)
    abortUnneededHydrationRequests(activeSelectedIds())
    settleVisibleSearchAttempt(attempt, 'success')
  } catch (error: unknown) {
    if (ownsVisibleSearch(attempt)) {
      const errorSequence = settleVisibleSearchAttempt(attempt, 'error')
      reportLookupError(error, attempt.startedSequence, errorSequence)
    } else {
      settleVisibleSearchAttempt(attempt, 'cancelled')
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
  let attempt = currentVisibleSearchAttempt()
  if (
    !attempt
    || (
      attempt.settlement.kind === 'settled'
      && attempt.settlement.sequence < hydrationStartedSequence
    )
  ) {
    return false
  }

  while (attempt) {
    const outcome = await attempt.promise
    if (outcome === 'error') {
      return true
    }

    if (currentVisibleSearchAttempt() === attempt) {
      return false
    }

    attempt = currentVisibleSearchAttempt()
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
  hydrationLifetime.value = { kind: 'disposed' }
  abortPendingHydrationRequests()
}

/**
 * Hydrates one endpoint-sized batch of selected applicant-recipient ids.
 *
 * @param missingIds - Uncached selected ids, capped to the endpoint limit.
 */
const hydrateSelectedItemsChunk = async (missingIds: string[]) => {
  if (hydrationLifetime.value.kind === 'disposed') return
  const request: SelectedHydrationRequest = {
    controller: new AbortController(),
    lifetime: hydrationLifetime.value,
    startedSequence: ++lookupOperationSequence,
    ids: new Set(missingIds)
  }

  missingIds.forEach(id => pendingHydrationById.set(id, request))
  let outcome: { kind: 'accepted'; invalidIds: string[] } | { kind: 'failed'; error: unknown }

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
      request.lifetime !== hydrationLifetime.value
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
    outcome = { kind: 'accepted', invalidIds: missingIds.filter(id => currentSelectedIds.has(id) && !resolvedIds.has(id)) }
  } catch (error: unknown) {
    outcome = { kind: 'failed', error }
  } finally {
    missingIds.forEach(id => {
      if (pendingHydrationById.get(id) === request) {
        pendingHydrationById.delete(id)
      }
    })
  }

  if (
    request.lifetime !== hydrationLifetime.value
    || request.controller.signal.aborted
  ) {
    return
  }

  if (outcome.kind === 'accepted') {
    removeInvalidSelectedIds(outcome.invalidIds)
    return
  }

  const visibleSearchReportedError = await waitForCurrentVisibleSearch(request.startedSequence)
  if (
    visibleSearchReportedError
    || request.lifetime !== hydrationLifetime.value
  ) {
    return
  }

  const unresolvedIds = missingIds.filter(id =>
    activeSelectedIds().includes(id)
    && !cachedItemsById.value[id]
    && !pendingHydrationById.has(id)
  )

  if (unresolvedIds.length > 0) {
    reportLookupError(outcome.error, request.startedSequence)
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
  const normalizedValue = Array.isArray(value) ? value.map(item => String(item.egcs_fc_applicantrecipient)) : []

  if (areIdsEqual(selectedIds.value, normalizedValue)) {
    return
  }

  selectedIds.value = normalizedValue
  if (isOpen.value) draftSelectedIds.value = [...normalizedValue]
}, { immediate: true })

watch(selectedIds, value => {
  if (!areIdsEqual(model.value.map(item => item.egcs_fc_applicantrecipient), value)) {
    model.value = value.map(id => model.value.find(item => item.egcs_fc_applicantrecipient === id) ?? { egcs_fc_applicantrecipient: id })
  }
  void hydrateSelectedItems(value)
}, { immediate: true })

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
  if (isOpen.value) void hydrateSelectedItems(value)
})

/** Commits the picker draft only while its owning Form permits edits. */
const saveSelection = () => {
  if (isInteractionDisabled.value) return
  selectedIds.value = [...draftSelectedIds.value]
  isOpen.value = false
}

watch(searchTerm, value => {
  if (!isOpen.value) {
    return
  }

  invalidateVisibleSearch()
  const attempt = createVisibleSearchAttempt()
  const timer = setTimeout(() => {
    void fetchVisibleItems(value.trim(), attempt)
  }, 200)
  visibleSearch.value = { kind: 'debouncing', attempt, timer }
})

onBeforeUnmount(() => {
  teardownLookupRequests()
  visibleSearch.value = { kind: 'disposed' }
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
  if (isInteractionDisabled.value) return
  selectedIds.value = selectedIds.value.filter(value => value !== id)
}
</script>

<template>
  <UFormField v-slot="fieldState" :label="t('agreement.applicant_recipients.title')" :name="name" required data-ui-target="agreement.fields.applicant-recipients-field.name" data-field-tooltip-context="agreement" data-field-scope="agreement.fields.applicant-recipients-field" data-scope-label-en="Agreements > General" data-scope-label-fr="Ententes > Général">
    <div class="space-y-3">
      <div v-if="selectedItems.length > 0" class="flex flex-wrap gap-2">
        <div
          v-for="item in selectedItems"
          :key="item.id"
          class="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
          <span>{{ getSelectedLabel(item) }}</span>
          <UTooltip :text="`${t('common.remove')}: ${getSelectedLabel(item)}`">
            <button
              type="button"
              class="cursor-default text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
              :aria-label="`${t('common.remove')}: ${getSelectedLabel(item)}`"
              :disabled="isInteractionDisabled"
              @click="removeSelectedId(String(item.id))">
              <UIcon name="i-lucide-x" class="size-4" />
            </button>
          </UTooltip>
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
          role="combobox"
          aria-haspopup="dialog"
          :aria-required="!isInteractionDisabled || undefined"
          :aria-expanded="isOpen"
          :disabled="isInteractionDisabled"
          :aria-controls="`${pickerId}-dialog`"
          :aria-label="t('agreement.applicant_recipients.title')"
          :aria-invalid="Boolean(fieldState?.error)"
          :aria-describedby="fieldState?.error ? `${pickerId}-error` : undefined"
          :label="selectedIds.length > 0 ? t('agreement.applicant_recipients.edit_selection') : t('agreement.applicant_recipients.select')"
          @click="isOpen = true" />
        <span v-if="fieldState?.error" :id="`${pickerId}-error`" class="sr-only">{{ fieldState?.error }}</span>
      </div>
    </div>
  </UFormField>

  <div
    v-for="(relationship, index) in model"
    :key="relationship.egcs_fc_applicantrecipient"
    class="space-y-4" data-field-tooltip-context="agreement" data-field-scope="agreement.fields.applicant-recipients-field" data-scope-label-en="Agreements > General" data-scope-label-fr="Ententes > Général">
    <AgreementProponentTypeField
      v-model="relationship.egcs_fc_applicantrecipientsubtype"
      data-field-container="Composite editor; its individual field declarations own their identities."
      :proponent-id="relationship.egcs_fc_applicantrecipient"
      :stream-id="streamId"
      :name="`${name}.${index}.egcs_fc_applicantrecipientsubtype`"
      :label="`${getSelectedLabel(cachedItemsById[relationship.egcs_fc_applicantrecipient] ?? { id: relationship.egcs_fc_applicantrecipient })} — ${t('agreement.applicant_recipients.type')}`" />
    <AgreementFinancialIdField
      v-model="relationship.egcs_fc_agencyfinancialid"
      data-field-container="Composite editor; its individual field declarations own their identities."
      :proponent-id="relationship.egcs_fc_applicantrecipient"
      :stream-id="streamId"
      :name="`${name}.${index}.egcs_fc_agencyfinancialid`"
      :label="`${getSelectedLabel(cachedItemsById[relationship.egcs_fc_applicantrecipient] ?? { id: relationship.egcs_fc_applicantrecipient })} — ${t('agreement.applicant_recipients.financial_id')}`" />
  </div>

  <UModal v-model:open="isOpen" :content="pickerDialogContent" :title="t('agreement.applicant_recipients.select')" :description="t('agreement.applicant_recipients.search')" data-field-tooltip-context="agreement" data-field-scope="agreement.fields.applicant-recipients-field" data-scope-label-en="Agreements > General" data-scope-label-fr="Ententes > Général">
    <template #body>
      <UCommandPalette
        v-model="draftSelectedIds"
        v-model:search-term="searchTerm"
        data-field-container="Composite editor; its individual field declarations own their identities."
        multiple
        selection-behavior="toggle"
        value-key="id"
        selected-icon="i-lucide-circle-check"
        :groups="groups"
        :loading="isLoading"
        :disabled="isInteractionDisabled"
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
          :disabled="isInteractionDisabled"
          @click="saveSelection" />
      </div>
    </template>
  </UModal>
</template>
