<script setup lang="ts">
import { useCrudModalPending } from '~/composables/useCrudModal'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import type { TableColumnInput } from '~/composables/useTableColumns'
import type { TransferPaymentAmendmentTypeItem } from '~~/shared/types/schemas/transfer-payment'

const {
  transferPaymentId,
  streamId,
  canUpdateChild,
  canDeleteChild
} = defineProps<{
  transferPaymentId: string
  streamId: string
  canUpdateChild: boolean
  canDeleteChild: boolean
}>()

const { t } = useI18n()
const toast = useToast()
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()

const {
  search,
  pagination,
  items,
  totalRecords,
  refresh,
  status
} = useResourceTable<TransferPaymentAmendmentTypeItem>({
  fetchUrl: `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/amendment-types`
})

const columns: TableColumnInput<TransferPaymentAmendmentTypeItem>[] = [
  { id: 'egcs_tp_amended', headerKey: 'transfer_payment.amended_type' },
  { id: 'name', accessorKey: 'egcs_tp_name_en', headerKey: 'common.name' },
  { accessorKey: 'egcs_tp_requiresamendmentsubtype', headerKey: 'transfer_payment.amendment_type_requires_subtype' },
  { id: 'actions', headerKey: 'common.actions' }
]

const {
  isOpen: isModalOpen,
  selected: selectedItem,
  openCreate,
  openUpdate,
  captureSession,
  closeSession
} = useCrudModal<TransferPaymentAmendmentTypeItem, Partial<TransferPaymentAmendmentTypeItem>>({
  createState: () => ({ egcs_tp_transferpaymentstream: streamId }),
  updateState: row => ({ ...row })
})
const itemPending = useCrudModalPending(captureSession)
const isSavingItem = itemPending.isPending

/**
 * Saves the currently selected amendment type record.
 * Performs a PATCH if the record has an ID (update), or a POST if it doesn't (new).
 * Closes the modal, refreshes the dataset, and provides success feedback.
 */
const saveItem = async () => {
  if (!selectedItem.value) return
  const session = captureSession()
  if (!itemPending.begin(session)) return
  const isUpdate = !!selectedItem.value.id
  try {
    const response = await fetch(getClientRequestUrl(isUpdate
      ? `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/amendment-types/${selectedItem.value.id}`
      : `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/amendment-types`), {
      method: isUpdate ? 'PATCH' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(selectedItem.value)
    })
    if (!response.ok) await throwFetchResponseError(response)
    closeSession(session)
    await refresh()
    toast.add({ title: t('common.success'), description: isUpdate ? t('common.updated_success') : t('common.added_success'), color: 'success' })
  } catch (error: unknown) {
    showError(error)
  } finally {
    itemPending.end(session)
  }
}

/**
 * Initiates the deletion process for a specific amendment type record.
 * Displays a confirmation dialog before calling the deletion API.
 * Refreshes the dataset and provides feedback on successful removal.
 *
 * @param {TransferPaymentAmendmentTypeItem} row - The record to be deleted.
 */
const deleteItem = async (row: TransferPaymentAmendmentTypeItem) => {
  try {
    const ok = await confirmDeleteRequest(
      `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/amendment-types/${row.id}`
    )
    if (!ok) return
    await refresh()
    toast.add({ title: t('common.success'), description: t('common.deleted_success'), color: 'success' })
  } catch (error: unknown) {
    showError(error)
  }
}
</script>

<template>
  <div class="space-y-6">
    <CommonResourceLayoutCard
      v-model:search="search"
      v-model:pagination="pagination"
      :data="items"
      :columns="columns"
      :bilingual-columns="[{ id: 'name', accessorKey: { en: 'egcs_tp_name_en', fr: 'egcs_tp_name_fr' } }]"
      :total-records="totalRecords"
      :loading="status === 'pending'"
      :button-label="canUpdateChild ? t('common.add') : undefined"
      :show-button="canUpdateChild"
      @add="openCreate">
      <template #name-cell="{ row }">
        <button
          v-if="canUpdateChild"
          type="button"
          class="text-left font-bold text-zinc-900 transition-colors hover:text-primary dark:text-white"
          :aria-label="t('common.edit')"
          @click="openUpdate(row.original)">
          <CommonBilingualName :name-en="row.original.egcs_tp_name_en" :name-fr="row.original.egcs_tp_name_fr" />
        </button>
        <div v-else class="font-bold text-zinc-900 dark:text-white">
          <CommonBilingualName :name-en="row.original.egcs_tp_name_en" :name-fr="row.original.egcs_tp_name_fr" />
        </div>
      </template>

      <template #egcs_tp_amended-cell="{ row }">
        <span class="font-medium">
          {{ t(`enums.amended_type.${row.original.egcs_tp_amended}`) }}
        </span>
      </template>
      <template #egcs_tp_requiresamendmentsubtype-cell="{ row }">
        {{ t(row.original.egcs_tp_requiresamendmentsubtype ? 'common.yes' : 'common.no') }}
      </template>

      <template #actions-cell="{ row }">
        <div class="flex items-center gap-2">
          <UButton
            v-if="canUpdateChild"
            icon="i-lucide-pencil"
            color="neutral"
            variant="ghost"
            size="sm"
            class="cursor-default"
            :aria-label="t('common.edit')"
            @click="openUpdate(row.original)" />
          <UButton
            v-if="canDeleteChild"
            icon="i-lucide-trash"
            color="error"
            variant="ghost"
            size="sm"
            class="cursor-default"
            :aria-label="t('common.delete')"
            @click="deleteItem(row.original)" />
        </div>
      </template>
    </CommonResourceLayoutCard>

    <TransferPaymentAmendmentTypeModal
      v-if="selectedItem"
      v-model:open="isModalOpen"
      v-model:state="selectedItem"
      :title="selectedItem.id ? t('transfer_payment.amendment_type_update') : t('transfer_payment.amendment_type_create')"
      :submit-label="selectedItem.id ? t('common.update') : t('common.add')"
      :pending="isSavingItem"
      @submit="saveItem" />
  </div>
</template>
