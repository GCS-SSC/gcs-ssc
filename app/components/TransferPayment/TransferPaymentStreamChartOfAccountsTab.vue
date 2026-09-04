<script setup lang="ts">
import { computed, watch } from 'vue'
import type { TransferPaymentStreamChartOfAccountItem } from '~~/shared/types/schemas/transfer-payment'

const { profileId, streamId, canUpdateChild, canDeleteChild } = defineProps<{
  profileId: string
  streamId: string
  canUpdateChild: boolean
  canDeleteChild: boolean
}>()

const { t, locale } = useI18n()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const {
  items,
  totalRecords,
  refresh,
  status,
  search,
  pagination
} = useResourceTable<TransferPaymentStreamChartOfAccountItem & { fiscal_year_display: string }>({
  fetchUrl: computed(() => `/api/transfer-payments/${profileId}/streams/${streamId}/chart-of-accounts`)
})

const columns = [
  { id: 'fiscal_year_display', accessorKey: 'fiscal_year_display', header: t('transfer_payment.chart_of_accounts.fiscal_year') },
  { id: 'egcs_tp_accountingdimensions', accessorKey: 'egcs_tp_accountingdimensions', header: t('transfer_payment.chart_of_accounts.accounting_fields') },
  { id: 'actions', header: '' }
]

const { isOpen, selected, openCreate, openUpdate, close, captureSession, closeSession } = useCrudModal<
  TransferPaymentStreamChartOfAccountItem,
  TransferPaymentStreamChartOfAccountItem | null
>({
  createState: () => null,
  updateState: item => ({ ...item })
})

watch(() => [profileId, streamId], close, { flush: 'sync' })

const getActionTarget = (item: TransferPaymentStreamChartOfAccountItem & { fiscal_year_display: string }) =>
  `${item.fiscal_year_display || String(item.egcs_tp_streambudget)} [${item.id}]`

/**
 * Soft-deletes a chart of accounts entry after confirmation.
 *
 * @param id - Chart of accounts entry identifier.
 */
const onDelete = async (id: string) => {
  const success = await confirmDeleteRequest(
    `/api/transfer-payments/${profileId}/streams/${streamId}/chart-of-accounts/${id}`
  )
  if (success) await refresh()
}
</script>

<template>
  <div class="space-y-4">
    <CommonResourceLayoutCard
      v-model:search="search"
      v-model:pagination="pagination"
      :title="t('transfer_payment.chart_of_accounts.title')"
      :data="items"
      :total-records="totalRecords"
      :columns="columns"
      :loading="status === 'pending'"
      :request-status="status"
      :button-label="t('common.add')"
      :show-button="canUpdateChild"
      @add="openCreate"
      @retry="refresh">
      <template #egcs_tp_accountingdimensions-cell="{ row }">
        <div class="flex min-w-64 flex-wrap gap-1.5 py-1">
          <CommonStatusBadge
            v-for="dimension in row.original.egcs_tp_accountingdimensions"
            :key="`${dimension.label_en}:${dimension.label_fr}`"
            variant="meta"
            size="sm"
            :label="`${locale === 'fr' ? dimension.label_fr : dimension.label_en}: ${dimension.value}`" />
        </div>
      </template>

      <template #actions-cell="{ row }">
        <div class="flex justify-end gap-2">
          <UButton
            v-if="canUpdateChild"
            :aria-label="t('common.edit_named', { name: getActionTarget(row.original) })"
            icon="i-lucide-pencil"
            color="neutral"
            variant="ghost"
            @click="openUpdate(row.original)" />
          <UButton
            v-if="canDeleteChild"
            :aria-label="t('common.delete_named', { name: getActionTarget(row.original) })"
            icon="i-lucide-trash"
            color="error"
            variant="ghost"
            @click="onDelete(row.original.id)" />
        </div>
      </template>
    </CommonResourceLayoutCard>

    <TransferPaymentStreamChartOfAccountModal
      v-if="canUpdateChild"
      v-model="isOpen"
      :stream-id="streamId"
      :profile-id="profileId"
      :item="selected"
      :capture-session="captureSession"
      :close-session="closeSession"
      @save="refresh" />
  </div>
</template>
