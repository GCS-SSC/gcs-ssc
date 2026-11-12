<script setup lang="ts">
import { useActionContext } from '~/composables/useActionContext'
import type { TransferPaymentMonitorTypeItem } from '~~/shared/types/schemas/transfer-payment'
import type { TableColumnInput, BilingualColumnConfig } from '~/composables/useTableColumns'
import { onScopeDispose, watch } from 'vue'

const {
  transferPaymentId,
  streamId,
  agencyId,
  canCreateChild,
  canDeleteChild
} = defineProps<{
  transferPaymentId: string
  streamId: string
  agencyId: string
  canCreateChild: boolean
  canDeleteChild: boolean
}>()

const writeContext = useActionContext({
  identity: [() => transferPaymentId, () => streamId, () => agencyId],
  authority: () => canCreateChild
})
const deleteActionContext = useActionContext({
  identity: [() => transferPaymentId, () => streamId, () => agencyId],
  authority: () => canDeleteChild
})
const { t } = useI18n()
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const modal = useCrudModal<TransferPaymentMonitorTypeItem>({
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
const getActionTarget = (item: TransferPaymentMonitorTypeItem) =>
  `${getBilingualValue(item, 'egcs_ay_name', String(item.id))} [${item.id}]`

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
  { id: 'name', accessorKey: 'egcs_ay_name_en', headerKey: 'common.name' },
  { id: 'actions', headerKey: 'common.actions' }
]

const bilingualColumns: BilingualColumnConfig<TransferPaymentMonitorTypeItem>[] = [
  { id: 'name', accessorKey: { en: 'egcs_ay_name_en', fr: 'egcs_ay_name_fr' } }
]

/**
 * Initiates the deletion process for a specific monitor type record.
 * Displays a confirmation dialog before calling the deletion API.
 * Refreshes the dataset upon successful removal.
 *
 * @param {TransferPaymentMonitorTypeItem} row - The record intended for deletion.
 */
const onDelete = async (row: TransferPaymentMonitorTypeItem) => {
  const operation = deleteActionContext.capture()
  if (!operation) return
  const id = row.id
  const owner = deleteContext
  const shouldProceed = () => ownsDeleteContext(owner) && canDeleteChild
  if (!shouldProceed()) return
  try {
    const deleted = await confirmDeleteRequest(
      `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/monitor-types/${id}`,
      { operation, target: { id, resolve: () => items.value.find(current => current.id === id), eligible: current => current.id === id }, shouldProceed }
    )
    if (!deleted || !operation.isCurrent() || !shouldProceed()) return
    await refresh()
  } catch (error: unknown) {
    if (operation.isCurrent() && shouldProceed()) showError(error)
  }
}

watch([() => transferPaymentId, () => streamId, () => agencyId], () => {
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
        :name-en="row.original.egcs_ay_name_en"
        :name-fr="row.original.egcs_ay_name_fr"
      />
    </template>

    <template #actions-cell="{ row }">
      <div class="flex items-center gap-2">
        <CommonActionButton
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
  </CommonResourceLayout>

  <TransferPaymentMonitorTypeModal
    v-if="selected && canCreateChild"
    v-model:open="isOpen"
    v-model:state="selected"
    :action-context="writeContext"
    :transfer-payment-id="transferPaymentId"
    :stream-id="streamId"
    :agency-id="agencyId"
    :capture-session="captureSession"
    :close-session="closeSession"
    :refresh-collection="refresh"
  />
</template>
