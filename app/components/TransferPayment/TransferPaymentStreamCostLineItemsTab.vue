<script setup lang="ts">
import { useCrudModalPending } from '~/composables/useCrudModal'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { watch } from 'vue'
import type { Ref } from 'vue'
import type { BilingualColumnConfig, TableColumnInput } from '~/composables/useTableColumns'
import type { TransferPaymentCostCategoryLineItemItem, AgencyCostCategoryLineItemItem } from '~~/shared/types/schemas'
import { TransferPaymentCostCategoryLineItemSchema } from '~~/shared/types/schemas'

interface TransferPaymentCostCategoryLineRow extends TransferPaymentCostCategoryLineItemItem, Record<string, unknown> {
  line_item_name_en?: string
  line_item_name_fr?: string
}

const {
  transferPaymentId,
  streamId,
  canUpdateChild,
  canDeleteChild,
  agencyId
} = defineProps<{
  transferPaymentId: string
  streamId: string
  canUpdateChild: boolean
  canDeleteChild: boolean
  agencyId?: string | null
}>()

const { t, n } = useI18n()
const toast = useToast()
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
  { id: 'actions', headerKey: 'common.actions' }
]

const costLineBilingualColumns: BilingualColumnConfig<TransferPaymentCostCategoryLineRow>[] = [
  { id: 'line_item', accessorKey: { en: 'line_item_name_en', fr: 'line_item_name_fr' } }
]

const costCategoryModal = useCrudModal<TransferPaymentCostCategoryLineRow, Partial<TransferPaymentCostCategoryLineItemItem>>({
  createState: () => ({}),
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

watch([() => transferPaymentId, () => streamId], () => costCategoryModal.close())

/**
 * Saves the currently selected cost category line item record.
 * Performs a PATCH if the record has an ID (update), or a POST if it doesn't (new).
 * Closes the modal, refreshes the dataset, and provides success feedback.
 */
const saveCostCategoryLine = async () => {
  if (!selectedCostCategoryLine.value || !canUpdateChild) return
  const session = costCategoryModal.captureSession()
  if (!costCategoryPending.begin(session)) return
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
    if (!costCategoryModal.closeSession(session)) return
  } catch (error: unknown) {
    if (costCategoryModal.captureSession() === session) showError(error)
    return
  } finally {
    costCategoryPending.end(session)
  }

  toast.add({
    title: t('common.success'),
    description: t(isUpdate ? 'common.updated_success' : 'common.added_success'),
    color: 'success'
  })
  try {
    await refreshCostLines()
  } catch (error: unknown) {
    showError(error)
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
  try {
    const ok = await confirmDeleteRequest(
      `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/cost-category-line-items/${row.id}`
    )
    if (!ok) return
    toast.add({ title: t('common.success'), description: t('common.deleted_success'), color: 'success' })
  } catch (error: unknown) {
    showError(error)
    return
  }
  try {
    await refreshCostLines()
  } catch (error: unknown) {
    showError(error)
  }
}

const { data: costLineItemResponse } = await useAgencyReferenceData<AgencyCostCategoryLineItemItem>({
  agencyId,
  buildUrl: id => `/api/agency/${id}/line-items`,
  query: { page: 1, limit: 100 }
})
</script>

<template>
  <CommonResourceLayoutCard
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
    @add="openCreateCostCategoryLine"
    @retry="refreshCostLines">
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

    <template #actions-cell="{ row }">
      <div class="flex items-center gap-2">
        <UButton
          icon="i-lucide-pencil"
          color="neutral"
          variant="ghost"
          size="sm"
          :aria-label="t('common.edit_named', { name: getCostLineActionTarget(row.original) })"
          :disabled="!canUpdateChild"
          @click="openUpdateCostCategoryLine(row.original)" />
        <UButton
          icon="i-lucide-trash"
          color="error"
          variant="ghost"
          size="sm"
          :aria-label="t('common.delete_named', { name: getCostLineActionTarget(row.original) })"
          :disabled="!canDeleteChild"
          @click="deleteCostCategoryLine(row.original)" />
      </div>
    </template>
  </CommonResourceLayoutCard>

  <UModal
    v-if="selectedCostCategoryLine && canUpdateChild"
    v-model:open="isCostCategoryModalOpen"
    :title="selectedCostCategoryLine?.id ? t('common.update') : t('common.add')">
    <template #body>
      <UForm
        :state="selectedCostCategoryLine"
        :validate="validateCostCategoryLine"
        class="space-y-4"
        @submit="saveCostCategoryLine">
        <TransferPaymentFieldsTransferPaymentCostCategoryLineItemFields
          :model="selectedCostCategoryLine"
          :line-item-options="costLineItemResponse?.items || []" />
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
