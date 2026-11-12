<script setup lang="ts">
import { useActionContext } from '~/composables/useActionContext'
import type { TransferPaymentStreamRiskRatingItem } from '~~/shared/types/schemas/transfer-payment'
import type { TableColumnInput, BilingualColumnConfig } from '~/composables/useTableColumns'
import { onScopeDispose, watch } from 'vue'

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

const writeContext = useActionContext({
  identity: [() => transferPaymentId, () => streamId],
  authority: () => canUpdateChild
})
const deleteActionContext = useActionContext({
  identity: [() => transferPaymentId, () => streamId],
  authority: () => canDeleteChild
})
const { t } = useI18n()
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const modal = useCrudModal<TransferPaymentStreamRiskRatingItem>({
  createState: () => ({}),
  updateState: item => ({ ...item })
})
const { isOpen, openUpdate, selected, captureSession, closeSession } = modal
type DeleteContext = { kind: 'active' } | { kind: 'disposed' }
let deleteContext: DeleteContext = { kind: 'active' }
const ownsDeleteContext = (owner: DeleteContext) => owner.kind === 'active' && deleteContext === owner
const openCreate = () => {
  if (canUpdateChild && deleteContext.kind === 'active') modal.openCreate()
}
const { getBilingualValue } = useBilingualValue()
const getActionTarget = (row: TransferPaymentStreamRiskRatingItem) =>
  `${getBilingualValue(row, 'egcs_tp_name', String(row.egcs_tp_riskscore ?? row.id))} [${row.id}]`

const {
  search,
  pagination,
  items,
  totalRecords,
  refresh,
  status
} = useResourceTable<TransferPaymentStreamRiskRatingItem>({
  fetchUrl: computed(() => `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/risk-ratings`)
})

const columns: TableColumnInput<TransferPaymentStreamRiskRatingItem>[] = [
  { id: 'score', accessorKey: 'egcs_tp_riskscore', headerKey: 'transfer_payment.risk_rating_score' },
  { id: 'name', accessorKey: 'egcs_tp_name_en', headerKey: 'common.name' },
  { id: 'actions', headerKey: 'common.actions' }
]

const bilingualColumns: BilingualColumnConfig<TransferPaymentStreamRiskRatingItem>[] = [
  { id: 'name', accessorKey: { en: 'egcs_tp_name_en', fr: 'egcs_tp_name_fr' } }
]

/**
 * Confirms and soft deletes a stream risk rating.
 *
 * @param row - Risk rating row selected for deletion.
 */
const onDelete = async (row: TransferPaymentStreamRiskRatingItem) => {
  const operation = deleteActionContext.capture()
  if (!operation) return
  const id = row.id
  const owner = deleteContext
  const shouldProceed = () => ownsDeleteContext(owner) && canDeleteChild
  if (!shouldProceed()) return
  try {
    const deleted = await confirmDeleteRequest(
      `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/risk-ratings/${id}`,
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
watch(() => canUpdateChild, allowed => {
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
    :show-button="canUpdateChild"
    :button-label="t('common.add')"
    @add="openCreate"
    @retry="refresh">
    <template #score-cell="{ row }">
      <span class="font-semibold text-zinc-700 dark:text-zinc-300">
        {{ row.original.egcs_tp_riskscore }}
      </span>
    </template>

    <template #name-cell="{ row }">
      <CommonBilingualName
        :name-en="row.original.egcs_tp_name_en"
        :name-fr="row.original.egcs_tp_name_fr" />
    </template>

    <template #actions-cell="{ row }">
      <div class="flex items-center gap-2">
        <CommonActionButton
          v-if="canUpdateChild"
          icon="i-lucide-pencil"
          color="neutral"
          variant="ghost"
          size="sm"
          :aria-label="t('common.edit_named', { name: getActionTarget(row.original) })"
          @click="openUpdate(row.original)" />
        <CommonActionButton
          v-if="canDeleteChild"
          icon="i-lucide-trash"
          color="error"
          variant="ghost"
          size="sm"
          :aria-label="t('common.delete_named', { name: getActionTarget(row.original) })"
          @click="onDelete(row.original)" />
      </div>
    </template>
  </CommonResourceLayout>

  <TransferPaymentStreamRiskRatingModal
    v-if="selected && canUpdateChild"
    v-model:open="isOpen"
    v-model:state="selected"
    :action-context="writeContext"
    :transfer-payment-id="transferPaymentId"
    :stream-id="streamId"
    :capture-session="captureSession"
    :close-session="closeSession"
    :refresh-collection="refresh" />
</template>
