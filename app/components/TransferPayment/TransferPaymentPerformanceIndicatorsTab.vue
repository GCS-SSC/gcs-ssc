<script setup lang="ts">
import { useCrudModalPending } from '~/composables/useCrudModal'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import type { ComputedRef, Ref } from 'vue'
import type { TransferPaymentPerformanceIndicatorItem } from '~~/shared/types/schemas'
import type { TransferPaymentPerformanceIndicatorRow } from '~~/shared/types/transfer-payment-ui'

const { programId, canUpdateChild, canDeleteChild, outcomesRefreshKey = 0 } = defineProps<{
  programId: string
  canUpdateChild: boolean
  canDeleteChild: boolean
  outcomesRefreshKey?: number
}>()

const { t } = useI18n()
const toast = useToast()
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()

const { outcomes, selectedOutcomeId, outcomeSelectionEnabled } = await useOutcomeSelection({
  programId,
  outcomesRefreshKey
})

const indicatorFetchUrl: ComputedRef<string> = computed(() => {
  if (!selectedOutcomeId.value) return ''
  if (selectedOutcomeId.value === 'all') {
    return `/api/transfer-payments/${programId}/performance-indicators`
  }
  return `/api/transfer-payments/${programId}/outcomes/${selectedOutcomeId.value}/performance-indicators`
})

const {
  search: indicatorSearch,
  pagination: indicatorPagination,
  items: performanceIndicators,
  totalRecords: indicatorTotal,
  refresh: refreshIndicators,
  status: indicatorStatusState
} = useResourceTable<TransferPaymentPerformanceIndicatorRow>({
  fetchUrl: indicatorFetchUrl,
  enabled: outcomeSelectionEnabled
})

type IndicatorForm = Partial<TransferPaymentPerformanceIndicatorItem & { egcs_tp_transferpaymentoutcome?: string }>

const indicatorModal = useCrudModal<TransferPaymentPerformanceIndicatorRow, IndicatorForm>({
  /**
   * Factory function that creates a new performance indicator form state with pre-selected outcome.
   *
   * @returns A partial performance indicator object.
   */
  createState: () => ({
    ...(selectedOutcomeId.value && selectedOutcomeId.value !== 'all'
      ? { egcs_tp_transferpaymentoutcome: selectedOutcomeId.value }
      : { egcs_tp_transferpaymentoutcome: undefined })
  }),
  updateState: row => ({ ...row })
})

const isIndicatorModalOpen: Ref<boolean> = indicatorModal.isOpen
const selectedIndicator: Ref<IndicatorForm | null> = indicatorModal.selected
const openCreateIndicator = indicatorModal.openCreate
const openUpdateIndicator = indicatorModal.openUpdate
const indicatorPending = useCrudModalPending(indicatorModal.captureSession)
const isSavingIndicator = indicatorPending.isPending

/**
 * Saves the currently selected performance indicator record.
 * Performs a PATCH if the record has an ID (update), or a POST if it doesn't (new).
 * Correctly handles the association with an outcome, closes the modal, refreshes data, and provides success feedback.
 */
const saveIndicator = async () => {
  if (!selectedIndicator.value || !selectedOutcomeId.value) return
  const session = indicatorModal.captureSession()
  if (!indicatorPending.begin(session)) return
  const outcomeId = selectedOutcomeId.value === 'all'
    ? selectedIndicator.value.egcs_tp_transferpaymentoutcome
    : selectedOutcomeId.value
  if (!outcomeId) return
  try {
    const response = await fetch(getClientRequestUrl(selectedIndicator.value.id
      ? `/api/transfer-payments/${programId}/outcomes/${outcomeId}/performance-indicators/${selectedIndicator.value.id}`
      : `/api/transfer-payments/${programId}/outcomes/${outcomeId}/performance-indicators`), {
      method: selectedIndicator.value.id ? 'PATCH' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...selectedIndicator.value,
        egcs_tp_transferpaymentoutcome: outcomeId
      })
    })
    if (!response.ok) await throwFetchResponseError(response)
    indicatorModal.closeSession(session)
    await refreshIndicators()
    toast.add({ title: t('common.success'), description: t('common.updated_success'), color: 'success' })
  } catch (error: unknown) {
    showError(error)
  } finally {
    indicatorPending.end(session)
  }
}

/**
 * Initiates the deletion process for a specific performance indicator record.
 * Displays a confirmation dialog before calling the deletion API.
 * Refreshes indicator data and providing feedback on successful deletion.
 *
 * @param {TransferPaymentPerformanceIndicatorRow} row - The performance indicator record to be deleted.
 */
const deleteIndicator = async (row: TransferPaymentPerformanceIndicatorRow) => {
  if (!selectedOutcomeId.value) return
  const outcomeId = selectedOutcomeId.value === 'all'
    ? row.egcs_tp_transferpaymentoutcome
    : selectedOutcomeId.value
  if (!outcomeId) return
  try {
    const ok = await confirmDeleteRequest(`/api/transfer-payments/${programId}/outcomes/${outcomeId}/performance-indicators/${row.id}`)
    if (!ok) return
    await refreshIndicators()
    toast.add({ title: t('common.success'), description: t('common.deleted_success'), color: 'success' })
  } catch (error: unknown) {
    showError(error)
  }
}
</script>

<template>
  <div class="space-y-6">
    <TransferPaymentPerformanceIndicatorsTable
      v-model:search="indicatorSearch"
      v-model:pagination="indicatorPagination"
      v-model:selected-outcome-id="selectedOutcomeId"
      :outcomes="outcomes"
      :indicators="performanceIndicators"
      :total-records="indicatorTotal"
      :loading="indicatorStatusState === 'pending'"
      :can-update-child="canUpdateChild"
      :can-delete-child="canDeleteChild"
      @add="openCreateIndicator"
      @edit="openUpdateIndicator"
      @delete="deleteIndicator" />

    <TransferPaymentPerformanceIndicatorModal
      v-if="selectedIndicator"
      v-model:open="isIndicatorModalOpen"
      v-model:state="selectedIndicator"
      :outcomes="outcomes"
      :pending="isSavingIndicator"
      @submit="saveIndicator" />
  </div>
</template>
