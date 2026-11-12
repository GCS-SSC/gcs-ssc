<script setup lang="ts">
import { useActionContext } from '~/composables/useActionContext'
import { TransferPaymentPerformanceIndicatorSchema } from '~~/shared/types/schemas'

import { useCrudModalPending } from '~/composables/useCrudModal'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { onScopeDispose, shallowRef, toRef, watch } from 'vue'
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
const toast = useLocalizedToast()
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()

const { outcomes, selectedOutcomeId, outcomeSelectionEnabled } = await useOutcomeSelection({
  programId: () => programId,
  outcomesRefreshKey: toRef(() => outcomesRefreshKey)
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
/** Opens a new indicator only while the caller can update the Program. */
const openCreateIndicator = () => {
  if (resourceContext.value.kind !== 'active' || !canUpdateChild) return
  editingTarget.value = null
  editingOutcomeId.value = null
  indicatorModal.openCreate()
}
/** @param row - Indicator selected for editing. */
const openUpdateIndicator = (row: TransferPaymentPerformanceIndicatorRow) => {
  if (resourceContext.value.kind !== 'active' || !canUpdateChild) return
  editingTarget.value = String(row.id)
  editingOutcomeId.value = row.egcs_tp_transferpaymentoutcome ? String(row.egcs_tp_transferpaymentoutcome) : null
  indicatorModal.openUpdate(row)
}
const indicatorPending = useCrudModalPending(indicatorModal.captureSession)
const isSavingIndicator = indicatorPending.isPending

const editingTarget: Ref<string | null> = shallowRef(null)
const editingOutcomeId: Ref<string | null> = shallowRef(null)
const writeContext = useActionContext({
  identity: [() => programId, selectedOutcomeId],
  authority: () => canUpdateChild,
  eligible: () => editingTarget.value === null || performanceIndicators.value.some(row => String(row.id) === editingTarget.value)
})
const deleteContext = useActionContext({
  identity: [() => programId, selectedOutcomeId],
  authority: () => canDeleteChild
})

type ResourceContext = { kind: 'active' } | { kind: 'disposed' }
const resourceContext: Ref<ResourceContext> = shallowRef({ kind: 'active' })
const ownsContext = (captured: ResourceContext) => captured.kind === 'active' && captured === resourceContext.value
watch([() => programId, selectedOutcomeId], () => {
  resourceContext.value = { kind: 'active' }
  indicatorModal.close()
}, { flush: 'sync' })
watch(() => canUpdateChild, allowed => {
  if (!allowed) indicatorModal.close()
}, { flush: 'sync' })
onScopeDispose(() => {
  resourceContext.value = { kind: 'disposed' }
  indicatorModal.close()
})

/**
 * Saves the currently selected performance indicator record.
 * Performs a PATCH if the record has an ID (update), or a POST if it doesn't (new).
 * Correctly handles the association with an outcome, closes the modal, refreshes data, and provides success feedback.
 */
const saveIndicator = async () => {
  const operation = writeContext.capture()
  if (!operation) return
  const targetId = editingTarget.value
  const context = resourceContext.value
  if (!(ownsContext(context) && operation.isCurrent()) || !selectedIndicator.value || !canUpdateChild) return
  const outcomeId = targetId !== null
    ? editingOutcomeId.value
    : selectedOutcomeId.value === 'all'
      ? selectedIndicator.value.egcs_tp_transferpaymentoutcome
      : selectedOutcomeId.value
  if (!outcomeId) {
    toast.add({ title: toast.localized('common.warning'), description: toast.localized('validation.outcome_required'), color: 'warning' })
    return
  }
  const session = indicatorModal.captureSession()
  if (session === null || !indicatorPending.begin(session)) return
  let closedSession = false
  try {
    const response = await fetch(getClientRequestUrl(targetId !== null
      ? `/api/transfer-payments/${programId}/outcomes/${outcomeId}/performance-indicators/${targetId}`
      : `/api/transfer-payments/${programId}/outcomes/${outcomeId}/performance-indicators`), {
      method: targetId !== null ? 'PATCH' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...selectedIndicator.value,
        egcs_tp_transferpaymentoutcome: outcomeId
      })
    })
    if (!response.ok) await throwFetchResponseError(response)
    if (!(ownsContext(context) && operation.isCurrent())) return
    closedSession = indicatorModal.closeSession(session)
    await refreshIndicators()
    if (!(ownsContext(context) && operation.isCurrent()) || !closedSession || !indicatorModal.isLatestSession(session) || indicatorStatusState.value === 'error') return
    toast.add({ title: toast.localized('common.success'), description: toast.localized('common.updated_success'), color: 'success' })
  } catch (error: unknown) {
    if ((ownsContext(context) && operation.isCurrent()) && (indicatorModal.isCurrentSession(session) || (closedSession && indicatorModal.isLatestSession(session)))) showError(error)
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
  const targetId = String(row.id)
  const context = resourceContext.value
  if (!ownsContext(context) || !canDeleteChild || !selectedOutcomeId.value) return
  const outcomeId = selectedOutcomeId.value === 'all'
    ? row.egcs_tp_transferpaymentoutcome
    : selectedOutcomeId.value
  if (!outcomeId) return
  const operation = deleteContext.capture()
  if (!operation) return
  try {
    const ok = await confirmDeleteRequest(`/api/transfer-payments/${programId}/outcomes/${outcomeId}/performance-indicators/${targetId}`, {
      operation,
      target: {
        id: targetId,
        resolve: () => performanceIndicators.value.find(current => String(current.id) === targetId),
        eligible: current => String(current.id) === targetId
      },
      shouldProceed: () => (ownsContext(context) && operation.isCurrent()) && canDeleteChild
    })
    if (!ok || !(ownsContext(context) && operation.isCurrent())) return
    await refreshIndicators()
    if (!(ownsContext(context) && operation.isCurrent()) || indicatorStatusState.value === 'error') return
    toast.add({ title: toast.localized('common.success'), description: toast.localized('common.deleted_success'), color: 'success' })
  } catch (error: unknown) {
    if ((ownsContext(context) && operation.isCurrent())) showError(error)
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
      :request-status="indicatorStatusState"
      :can-update-child="canUpdateChild"
      :can-delete-child="canDeleteChild"
      @retry="refreshIndicators"
      @add="openCreateIndicator"
      @edit="openUpdateIndicator"
      @delete="deleteIndicator" />

    <CommonFormDialog
      v-if="selectedIndicator"
      v-model:open="isIndicatorModalOpen"
      :action-context="writeContext"
      :state="selectedIndicator"
      :schema="TransferPaymentPerformanceIndicatorSchema"
      :title="selectedIndicator.id ? t('common.update') : t('common.add')"
      :submit-label="selectedIndicator.id ? t('common.update') : t('common.add')"
      :pending="isSavingIndicator"
      @submit="saveIndicator">
      <template #default="{ state }">
        <TransferPaymentFieldsTransferPaymentPerformanceIndicatorFields
          :model="state"
          :outcomes="outcomes"
          outcome-field="egcs_tp_transferpaymentoutcome"
          outcome-value-key="id" />
      </template>
    </CommonFormDialog>
  </div>
</template>
