<script setup lang="ts">
import { useActionContext } from '~/composables/useActionContext'
import { useFormSession } from '~/composables/useFormSession'
import { useCrudModalPending } from '~/composables/useCrudModal'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { onScopeDispose, shallowRef, watch } from 'vue'
import type { Ref } from 'vue'
import type { BilingualColumnConfig, TableColumnInput } from '~/composables/useTableColumns'
import type { TransferPaymentCostCategoryLineItemItem } from '~~/shared/types/schemas'
import { TransferPaymentCostCategoryLineItemSchema } from '~~/shared/types/schemas'

interface TransferPaymentCostCategoryLineRow extends TransferPaymentCostCategoryLineItemItem, Record<string, unknown> {
  category_active?: boolean
  agency_line_item_active?: boolean
  line_item_name_en?: string
  line_item_name_fr?: string
}

const {
  transferPaymentId,
  streamId,
  agencyId,
  canUpdateChild,
  canDeleteChild
} = defineProps<{
  transferPaymentId: string
  streamId: string
  canUpdateChild: boolean
  canDeleteChild: boolean
  agencyId?: string | null
}>()

const writeContext = useActionContext({
  identity: [() => transferPaymentId, () => streamId, () => agencyId],
  authority: () => canUpdateChild
})
const deleteActionContext = useActionContext({
  identity: [() => transferPaymentId, () => streamId, () => agencyId],
  authority: () => canDeleteChild
})
const { t, n } = useI18n()
const toast = useLocalizedToast()
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const { createValidator } = useZodI18n()

const {
  search: costLineSearch,
  pagination: costLinePagination,
  items: costLines,
  totalRecords: costLineTotal,
  refresh: refreshCostLines,
  status: costLineStatusState
} = useResourceTable<TransferPaymentCostCategoryLineRow>({
  fetchUrl: computed(() => `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/cost-category-line-items`)
})

const costLineColumns: TableColumnInput<TransferPaymentCostCategoryLineRow>[] = [
  { id: 'line_item', accessorKey: 'line_item_name_en', headerKey: 'transfer_payment.cost_category_line_items' },
  { accessorKey: 'egcs_tp_costsharingratio', headerKey: 'transfer_payment.cost_sharing_ratio' },
  { id: 'availability', headerKey: 'common.status' },
  { id: 'actions', headerKey: 'common.actions' }
]

const costLineBilingualColumns: BilingualColumnConfig<TransferPaymentCostCategoryLineRow>[] = [
  { id: 'line_item', accessorKey: { en: 'line_item_name_en', fr: 'line_item_name_fr' } }
]

const costCategoryModal = useCrudModal<TransferPaymentCostCategoryLineRow, Partial<TransferPaymentCostCategoryLineItemItem>>({
  createState: () => ({ egcs_tp_active: true }),
  updateState: row => ({ ...row })
})

const isCostCategoryModalOpen: Ref<boolean> = costCategoryModal.isOpen
const selectedCostCategoryLine: Ref<Partial<TransferPaymentCostCategoryLineItemItem> | null> = costCategoryModal.selected
const openCreateCostCategoryLine = () => {
  if (canUpdateChild) costCategoryModal.openCreate()
}
const openUpdateCostCategoryLine = costCategoryModal.openUpdate
const validateCostCategoryLine = createValidator(TransferPaymentCostCategoryLineItemSchema)
const costCategoryPending = useCrudModalPending(costCategoryModal.captureSession)
const isSavingCostCategoryLine = costCategoryPending.isPending
const { getBilingualValue } = useBilingualValue()
const getCostLineActionTarget = (row: TransferPaymentCostCategoryLineRow) =>
  `${getBilingualValue(row, 'line_item_name', String(row.id))} [${row.id}]`

type ResourceContext = { kind: 'active' } | { kind: 'disposed' }
const context: Ref<ResourceContext> = shallowRef({ kind: 'active' })
const isCurrentContext = (captured: ResourceContext) => captured.kind === 'active' && captured === context.value
let deleteCapabilityGeneration = 0
watch([() => transferPaymentId, () => streamId], () => {
  context.value = { kind: 'active' }
  costCategoryModal.close()
}, { flush: 'sync' })
watch(() => canUpdateChild, allowed => {
  if (!allowed) costCategoryModal.close()
}, { flush: 'sync' })
watch(() => canDeleteChild, () => {
  deleteCapabilityGeneration += 1
}, { flush: 'sync' })
onScopeDispose(() => {
  context.value = { kind: 'disposed' }
  costCategoryModal.close()
})

/**
 * Saves the currently selected cost category line item record.
 * Performs a PATCH if the record has an ID (update), or a POST if it doesn't (new).
 * Closes the modal, refreshes the dataset, and provides success feedback.
 */
const saveCostCategoryLine = async () => {
  const operation = writeContext.capture()
  if (!operation) return
  if (context.value.kind === 'disposed' || !selectedCostCategoryLine.value || !canUpdateChild) return
  const session = costCategoryModal.captureSession()
  if (session === null || !costCategoryPending.begin(session)) return
  const requestedContext = context.value
  let closedSession = false
  const isUpdate = Boolean(selectedCostCategoryLine.value.id)
  try {
    const response = await fetch(getClientRequestUrl(selectedCostCategoryLine.value.id
      ? `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/cost-category-line-items/${selectedCostCategoryLine.value.id}`
      : `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/cost-category-line-items`), {
      method: selectedCostCategoryLine.value.id ? 'PATCH' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(selectedCostCategoryLine.value)
    })
    if (!response.ok) await throwFetchResponseError(response)
    if (!(operation.isCurrent() && isCurrentContext(requestedContext))) return
    closedSession = costCategoryModal.closeSession(session)
  } catch (error: unknown) {
    if ((operation.isCurrent() && isCurrentContext(requestedContext)) && costCategoryModal.isCurrentSession(session)) showError(error)
    return
  } finally {
    costCategoryPending.end(session)
  }

  try {
    await refreshCostLines()
    if (!(operation.isCurrent() && isCurrentContext(requestedContext)) || !closedSession || !costCategoryModal.isLatestSession(session) || costLineStatusState.value === 'error') return
    toast.add({
      title: toast.localized('common.success'),
      description: toast.localized(isUpdate ? 'common.updated_success' : 'common.added_success'),
      color: 'success'
    })
  } catch (error: unknown) {
    if ((operation.isCurrent() && isCurrentContext(requestedContext)) && closedSession && costCategoryModal.isLatestSession(session)) showError(error)
  }
}

/**
 * Initiates the deletion process for a specific cost category line item record.
 * Displays a confirmation dialog before calling the deletion API.
 * Refreshes the dataset and provides feedback on successful removal.
 *
 * @param {TransferPaymentCostCategoryLineRow} row - The record to be deleted.
 */
const deleteCostCategoryLine = async (row: TransferPaymentCostCategoryLineRow) => {
  const operation = deleteActionContext.capture()
  if (!operation) return
  const id = row.id
  if (context.value.kind === 'disposed' || !canDeleteChild) return
  const requestedContext = context.value
  const capabilityGeneration = deleteCapabilityGeneration
  try {
    const ok = await confirmDeleteRequest(
      `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/cost-category-line-items/${id}`,
      { operation, target: { id, resolve: () => costLines.value.find(current => current.id === id), eligible: current => current.id === id }, shouldProceed: () => operation.isCurrent() && isCurrentContext(requestedContext) && canDeleteChild && capabilityGeneration === deleteCapabilityGeneration }
    )
    if (!ok || !(operation.isCurrent() && isCurrentContext(requestedContext))) return
    await refreshCostLines()
    if (!(operation.isCurrent() && isCurrentContext(requestedContext)) || costLineStatusState.value === 'error') return
    toast.add({ title: toast.localized('common.success'), description: toast.localized('common.deleted_success'), color: 'success' })
  } catch (error: unknown) {
    if (operation.isCurrent() && isCurrentContext(requestedContext)) showError(error)
  }
}

const formSession = useFormSession({ owner: costCategoryModal, action: { kind: 'remote', context: writeContext }, submit: saveCostCategoryLine })
</script>

<template>
  <CommonResourceLayout
    v-model:search="costLineSearch"
    v-model:pagination="costLinePagination"
    :data="costLines"
    :columns="costLineColumns"
    :bilingual-columns="costLineBilingualColumns"
    :total-records="costLineTotal"
    :loading="costLineStatusState === 'pending'"
    :request-status="costLineStatusState"
    :show-button="canUpdateChild"
    :button-label="t('common.add')"
    data-field-scope="transfer-payment.stream-cost-line-items-tab"
    @add="openCreateCostCategoryLine" @retry="refreshCostLines">
    <template #line_item-cell="{ row }">
      <CommonBilingualName
        :name-en="row.original.line_item_name_en"
        :name-fr="row.original.line_item_name_fr" />
    </template>
    <template #egcs_tp_costsharingratio-cell="{ row }">
      <span class="font-semibold text-zinc-700 dark:text-zinc-300">
        {{ n(row.original.egcs_tp_costsharingratio, { style: 'percent' }) }}
      </span>
    </template>

    <template #availability-cell="{ row }">
      <div class="flex flex-wrap gap-2">
        <CommonStatusBadge
          v-if="row.original.egcs_tp_active !== false && row.original.category_active !== false && row.original.agency_line_item_active !== false"
          variant="active" />
        <CommonStatusBadge
          v-if="row.original.egcs_tp_active === false"
          variant="inactive"
          label-key="transfer_payment.cost_line_stream_inactive" />
        <CommonStatusBadge
          v-if="row.original.category_active === false"
          variant="inactive"
          label-key="transfer_payment.cost_line_category_inactive" />
        <CommonStatusBadge
          v-if="row.original.agency_line_item_active === false"
          variant="inactive"
          label-key="transfer_payment.cost_line_agency_inactive" />
      </div>
    </template>

    <template #actions-cell="{ row }">
      <div class="flex items-center gap-2">
        <CommonActionButton
          v-if="canUpdateChild"
          icon="i-lucide-pencil"
          color="neutral"
          variant="ghost"
          size="sm"
          :aria-label="t('common.edit_named', { name: getCostLineActionTarget(row.original) })"
          @click="openUpdateCostCategoryLine(row.original)" />
        <CommonActionButton
          v-if="canDeleteChild"
          icon="i-lucide-trash"
          color="error"
          variant="ghost"
          size="sm"
          :aria-label="t('common.delete_named', { name: getCostLineActionTarget(row.original) })"
          @click="deleteCostCategoryLine(row.original)" />
      </div>
    </template>
  </CommonResourceLayout>

  <UModal
    v-if="selectedCostCategoryLine && canUpdateChild"
    v-model:open="isCostCategoryModalOpen"
    :title="selectedCostCategoryLine?.id ? t('common.update') : t('common.add')" data-field-scope="transfer-payment.stream-cost-line-items-tab">
    <template #body>
      <UForm
        v-bind="formSession"
        :state="selectedCostCategoryLine"
        :validate="validateCostCategoryLine"
        class="space-y-4">
        <UFormField :label="t('transfer_payment.cost_category_line_items')" name="egcs_tp_organizationcostcategory">
          <CommonServerLookupSelect
            v-model="selectedCostCategoryLine.egcs_tp_organizationcostcategory"
            :fetch-url="`/api/transfer-payments/${transferPaymentId}/streams/${streamId}/lookups/cost-category-line-items`"
            :include-deleted-query="false"
            selected-values-query-key="ids"
            value-key="id"
            label-en-key="egcs_ay_name_en"
            label-fr-key="egcs_ay_name_fr" />
        </UFormField>
        <UFormField :label="t('transfer_payment.cost_sharing_ratio')" name="egcs_tp_costsharingratio" required>
          <UInputNumber v-model="selectedCostCategoryLine.egcs_tp_costsharingratio" :step="0.01" :format-options="{ style: 'percent' }" />
        </UFormField>
        <UFormField name="egcs_tp_active" :description="t('transfer_payment.cost_line_active_help')">
          <USwitch v-model="selectedCostCategoryLine.egcs_tp_active" :label="t('common.active')" />
        </UFormField>
        <div class="flex justify-end gap-2 pt-4">
          <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="isCostCategoryModalOpen = false" />
          <CommonSaveButton
            :label="selectedCostCategoryLine?.id ? t('common.update') : t('common.add')"
            :loading="isSavingCostCategoryLine"
            :disabled="isSavingCostCategoryLine" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
