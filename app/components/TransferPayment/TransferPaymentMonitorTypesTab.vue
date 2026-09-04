<script setup lang="ts">
import type { TransferPaymentMonitorTypeItem } from '~~/shared/types/schemas/transfer-payment'
import type { TableColumnInput, BilingualColumnConfig } from '~/composables/useTableColumns'
import { watch } from 'vue'

const {
  transferPaymentId,
  streamId,
  canCreateChild,
  canUpdateChild,
  canDeleteChild
} = defineProps<{
  transferPaymentId: string
  streamId: string
  canCreateChild: boolean
  canUpdateChild: boolean
  canDeleteChild: boolean
}>()

const { t } = useI18n()
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const modal = useCrudModal<TransferPaymentMonitorTypeItem>({
  createState: () => ({}),
  updateState: item => ({ ...item })
})
const { isOpen, openUpdate, selected, captureSession, closeSession } = modal
const openCreate = () => {
  if (canCreateChild) modal.openCreate()
}
const { getBilingualValue } = useBilingualValue()
const getActionTarget = (item: TransferPaymentMonitorTypeItem) =>
  `${getBilingualValue(item, 'egcs_tp_name', String(item.id))} [${item.id}]`

const {
  search,
  pagination,
  items,
  totalRecords,
  refresh,
  status
} = useResourceTable<TransferPaymentMonitorTypeItem>({
  fetchUrl: computed(() => `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/monitor-types`)
})

const columns: TableColumnInput<TransferPaymentMonitorTypeItem>[] = [
  { id: 'name', accessorKey: 'egcs_tp_name_en', headerKey: 'common.name' },
  { id: 'actions', headerKey: 'common.actions' }
]

const bilingualColumns: BilingualColumnConfig<TransferPaymentMonitorTypeItem>[] = [
  { id: 'name', accessorKey: { en: 'egcs_tp_name_en', fr: 'egcs_tp_name_fr' } }
]

/**
 * Initiates the deletion process for a specific monitor type record.
 * Displays a confirmation dialog before calling the deletion API.
 * Refreshes the dataset upon successful removal.
 *
 * @param {TransferPaymentMonitorTypeItem} row - The record intended for deletion.
 */
const onDelete = async (row: TransferPaymentMonitorTypeItem) => {
  try {
    const ok = await confirmDeleteRequest(
      `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/monitor-types/${row.id}`
    )
    if (!ok) return
  } catch (error: unknown) {
    showError(error)
    return
  }
  try {
    await refresh()
  } catch (error: unknown) {
    showError(error)
  }
}

watch([() => transferPaymentId, () => streamId], () => modal.close())
</script>

<template>
  <CommonResourceLayoutCard
    v-model:search="search"
    v-model:pagination="pagination"
    :data="items"
    :columns="columns"
    :bilingual-columns="bilingualColumns"
    :total-records="totalRecords"
    :loading="status === 'pending'"
    :request-status="status"
    :show-button="canCreateChild"
    :button-label="t('common.add')"
    @add="openCreate"
    @retry="refresh"
  >
    <template #name-cell="{ row }">
      <CommonBilingualName
        :name-en="row.original.egcs_tp_name_en"
        :name-fr="row.original.egcs_tp_name_fr"
      />
    </template>

    <template #actions-cell="{ row }">
      <div class="flex items-center gap-2">
        <UButton
          v-if="canUpdateChild"
          icon="i-lucide-pencil"
          color="neutral"
          variant="ghost"
          size="sm"
          :aria-label="t('common.edit_named', { name: getActionTarget(row.original) })"
          @click="openUpdate(row.original)"
        />
        <UButton
          v-if="canDeleteChild"
          icon="i-lucide-trash"
          color="error"
          variant="ghost"
          size="sm"
          :aria-label="t('common.delete_named', { name: getActionTarget(row.original) })"
          @click="onDelete(row.original)"
        />
      </div>
    </template>
  </CommonResourceLayoutCard>

  <TransferPaymentMonitorTypeModal
    v-if="selected && (selected.id ? canUpdateChild : canCreateChild)"
    v-model:open="isOpen"
    v-model:state="selected"
    :transfer-payment-id="transferPaymentId"
    :stream-id="streamId"
    :capture-session="captureSession"
    :close-session="closeSession"
    @saved="refresh"
  />
</template>
