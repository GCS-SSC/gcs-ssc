<script setup lang="ts">
import type { TransferPaymentStreamCommitmentTypeItem } from '~~/shared/types/schemas/transfer-payment'
import type { BilingualColumnConfig, TableColumnInput } from '~/composables/useTableColumns'
import { watch } from 'vue'

const { transferPaymentId, streamId, canCreateChild, canDeleteChild } = defineProps<{
  transferPaymentId: string
  streamId: string
  canCreateChild: boolean
  canUpdateChild: boolean
  canDeleteChild: boolean
}>()
const { t } = useI18n()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const { showError } = useApiErrorToast()
const modal = useCrudModal<TransferPaymentStreamCommitmentTypeItem>({
  createState: () => ({}),
  updateState: item => ({ ...item })
})
const { isOpen, selected, captureSession, closeSession } = modal
const openCreate = () => {
  if (canCreateChild) modal.openCreate()
}
const { getBilingualValue } = useBilingualValue()
const getActionTarget = (item: TransferPaymentStreamCommitmentTypeItem) =>
  `${getBilingualValue(item, 'egcs_ay_name', String(item.id))} [${item.id}]`
const { search, pagination, items, totalRecords, refresh, status } = useResourceTable<TransferPaymentStreamCommitmentTypeItem>({
  fetchUrl: computed(() => `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/commitment-types`)
})
const columns: TableColumnInput<TransferPaymentStreamCommitmentTypeItem>[] = [
  { id: 'name', accessorKey: 'egcs_ay_name_en', headerKey: 'common.name' },
  { id: 'agency_definition_deleted', accessorKey: 'agency_definition_deleted', headerKey: 'common.status' },
  { id: 'actions', headerKey: 'common.actions' }
]
const bilingualColumns: BilingualColumnConfig<TransferPaymentStreamCommitmentTypeItem>[] = [
  { id: 'name', accessorKey: { en: 'egcs_ay_name_en', fr: 'egcs_ay_name_fr' } }
]
/**
 * Soft-deletes an unused stream commitment type after confirmation.
 *
 * @param id - Commitment type identifier.
 */
const onDelete = async (id: string) => {
  try {
    const deleted = await confirmDeleteRequest(
      `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/commitment-types/${id}`
    )
    if (!deleted) return
  } catch (error) {
    showError(error)
    return
  }
  try {
    await refresh()
  } catch (error) {
    showError(error)
  }
}

watch([() => transferPaymentId, () => streamId], () => modal.close())
</script>

<template>
  <CommonResourceLayoutCard
    v-model:search="search"
    v-model:pagination="pagination"
    :title="t('transfer_payment.commitment_types.title')"
    :data="items"
    :columns="columns"
    :bilingual-columns="bilingualColumns"
    :total-records="totalRecords"
    :loading="status === 'pending'"
    :request-status="status"
    :button-label="t('common.add')"
    :show-button="canCreateChild"
    @add="openCreate"
    @retry="refresh">
    <template #name-cell="{ row }">
      <CommonBilingualName :name-en="row.original.egcs_ay_name_en" :name-fr="row.original.egcs_ay_name_fr" />
    </template>
    <template #agency_definition_deleted-cell="{ row }">
      <CommonStatusBadge :variant="row.original.agency_definition_deleted ? 'inactive' : 'active'" />
    </template>
    <template #actions-cell="{ row }">
      <div class="flex justify-end gap-2">
        <UButton v-if="canDeleteChild" icon="i-lucide-trash" color="error" variant="ghost" :aria-label="t('common.delete_named', { name: getActionTarget(row.original) })" @click="onDelete(row.original.id)" />
      </div>
    </template>
  </CommonResourceLayoutCard>
  <TransferPaymentStreamCommitmentTypeModal
    v-if="selected && canCreateChild"
    v-model:open="isOpen"
    v-model:state="selected"
    :transfer-payment-id="transferPaymentId"
    :stream-id="streamId"
    :capture-session="captureSession"
    :close-session="closeSession"
    @saved="refresh" />
</template>
