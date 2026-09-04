<script setup lang="ts">
import type { TransferPaymentStreamRiskRatingItem } from '~~/shared/types/schemas/transfer-payment'
import type { TableColumnInput, BilingualColumnConfig } from '~/composables/useTableColumns'
import { watch } from 'vue'

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
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const modal = useCrudModal<TransferPaymentStreamRiskRatingItem>({
  createState: () => ({}),
  updateState: item => ({ ...item })
})
const { isOpen, openUpdate, selected, captureSession, closeSession } = modal
const openCreate = () => {
  if (canUpdateChild) modal.openCreate()
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
  try {
    const ok = await confirmDeleteRequest(
      `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/risk-ratings/${row.id}`
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
        <UButton
          v-if="canUpdateChild"
          icon="i-lucide-pencil"
          color="neutral"
          variant="ghost"
          size="sm"
          :aria-label="t('common.edit_named', { name: getActionTarget(row.original) })"
          @click="openUpdate(row.original)" />
        <UButton
          v-if="canDeleteChild"
          icon="i-lucide-trash"
          color="error"
          variant="ghost"
          size="sm"
          :aria-label="t('common.delete_named', { name: getActionTarget(row.original) })"
          @click="onDelete(row.original)" />
      </div>
    </template>
  </CommonResourceLayoutCard>

  <TransferPaymentStreamRiskRatingModal
    v-if="selected && canUpdateChild"
    v-model:open="isOpen"
    v-model:state="selected"
    :transfer-payment-id="transferPaymentId"
    :stream-id="streamId"
    :capture-session="captureSession"
    :close-session="closeSession"
    @saved="refresh" />
</template>
