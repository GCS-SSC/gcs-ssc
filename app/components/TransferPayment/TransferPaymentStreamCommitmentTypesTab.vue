<script setup lang="ts">
import { useActionContext } from '~/composables/useActionContext'
import type { TransferPaymentStreamCommitmentTypeItem } from '~~/shared/types/schemas/transfer-payment'
import type { BilingualColumnConfig, TableColumnInput } from '~/composables/useTableColumns'
import { onScopeDispose, watch } from 'vue'

const writeContext = useActionContext({
  identity: [() => transferPaymentId, () => streamId],
  authority: () => canCreateChild
})
const deleteActionContext = useActionContext({
  identity: [() => transferPaymentId, () => streamId],
  authority: () => canDeleteChild
})
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
type DeleteContext = { kind: 'active' } | { kind: 'disposed' }
let deleteContext: DeleteContext = { kind: 'active' }
const ownsDeleteContext = (owner: DeleteContext) => owner.kind === 'active' && deleteContext === owner
const openCreate = () => {
  if (canCreateChild && deleteContext.kind === 'active') modal.openCreate()
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
  const operation = deleteActionContext.capture()
  if (!operation) return
  const owner = deleteContext
  const shouldProceed = () => ownsDeleteContext(owner) && canDeleteChild
  if (!shouldProceed()) return
  try {
    const deleted = await confirmDeleteRequest(
      `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/commitment-types/${id}`,
      { operation, target: { id, resolve: () => items.value.find(current => current.id === id), eligible: current => current.id === id }, shouldProceed }
    )
    if (!deleted || !operation.isCurrent() || !shouldProceed()) return
    await refresh()
  } catch (error: unknown) {
    if (operation.isCurrent() && shouldProceed()) showError(error)
  }
}

watch([() => transferPaymentId, () => streamId], () => {
  if (deleteContext.kind !== 'active') return
  deleteContext = { kind: 'active' }
  modal.close()
}, { flush: 'sync' })
watch(() => canDeleteChild, () => {
  if (deleteContext.kind === 'active') deleteContext = { kind: 'active' }
}, { flush: 'sync' })
watch(() => canCreateChild, allowed => {
  if (!allowed) modal.close()
}, { flush: 'sync' })
onScopeDispose(() => {
  deleteContext = { kind: 'disposed' }
  modal.close()
})
</script>

<template>
  <CommonResourceLayout
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
        <CommonActionButton v-if="canDeleteChild" icon="i-lucide-trash" color="error" variant="ghost" :aria-label="t('common.delete_named', { name: getActionTarget(row.original) })" @click="onDelete(row.original.id)" />
      </div>
    </template>
  </CommonResourceLayout>
  <TransferPaymentStreamCommitmentTypeModal
    v-if="selected && canCreateChild"
    v-model:open="isOpen"
    v-model:state="selected"
    :action-context="writeContext"
    :transfer-payment-id="transferPaymentId"
    :stream-id="streamId"
    :capture-session="captureSession"
    :close-session="closeSession"
    :refresh-collection="refresh" />
</template>
