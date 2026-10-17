<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { AccountReceivableDetail } from '~~/shared/types/account-receivable'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { appRouteLocations } from '~/utils/route-locations'
import { formatAccountReceivableAmount } from '~/utils/account-receivable-display'
import { buildAccountReceivableAdjustmentRows, type AccountReceivableAdjustmentRow } from '~/utils/account-receivable-detail-activity'

const { receivable, agreementId } = defineProps<{ receivable: AccountReceivableDetail, agreementId: string }>()
const emit = defineEmits<{ adjust: [], changed: [] }>()
const { t, locale } = useI18n()
const localePath = useLocalePath()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const { showError } = useApiErrorToast()
const toast = useLocalizedToast()
const deletingId: Ref<string | null> = ref(null)
let disposed = false
onBeforeUnmount(() => {
  disposed = true
})
const { formatDate } = useDateHelpers()
const rows = computed(() => buildAccountReceivableAdjustmentRows(receivable))
const pagination: Ref<{ pageIndex: number, pageSize: number }> = ref({ pageIndex: 0, pageSize: 10 })
watch(() => `${agreementId}:${receivable.id}`, () => {
  pagination.value.pageIndex = 0
  deletingId.value = null
})
const columns: TableColumnInput<AccountReceivableAdjustmentRow>[] = [
  { id: 'reference', accessorKey: 'reference', headerKey: 'account_receivable.activity_reference' },
  { id: 'status', headerKey: 'common.status' },
  { id: 'method', headerKey: 'account_receivable.recovery_kind' },
  { id: 'amount', headerKey: 'account_receivable.approved_amount' },
  { id: 'created', headerKey: 'account_receivable.created_at' },
  { id: 'actions', headerKey: 'common.actions' }
]
const amount = (value: string | null) => formatAccountReceivableAmount(value, locale.value, receivable.egcs_fc_currency) ?? t('common.not_available')
/**
 * Deletes only the selected independently assigned draft Adjustment.
 * @param row - Selected independently assigned draft record.
 */
const deleteAdjustment = async (row: AccountReceivableAdjustmentRow) => {
  if (!row.adjustment.egcs_fc_candeleterole || deletingId.value) return
  if (!row.adjustment.egcs_fc_candelete) {
    toast.add({ title: toast.localized('common.warning'), description: toast.localized('account_receivable.work_prerequisite'), color: 'warning' })
    return
  }
  const owner = `${agreementId}:${receivable.id}`
  deletingId.value = row.adjustment.id
  try {
    const deleted = await confirmDeleteRequest(`/api/account-receivables/${row.adjustment.id}`, {
      shouldProceed: () => !disposed && `${agreementId}:${receivable.id}` === owner
        && rows.value.some(item => item.adjustment.id === row.adjustment.id && item.adjustment.egcs_fc_candeleterole && item.adjustment.egcs_fc_candelete)
    })
    if (deleted && !disposed && `${agreementId}:${receivable.id}` === owner) emit('changed')
  } catch (error) {
    if (!disposed && `${agreementId}:${receivable.id}` === owner) showError(error)
  } finally {
    if (!disposed && `${agreementId}:${receivable.id}` === owner) deletingId.value = null
  }
}
</script>

<template>
  <CommonResourceLayoutCard
    v-model:pagination="pagination"
    :data="rows"
    :columns="columns"
    :total-records="rows.length"
    :show-search="false"
    :show-column-toggle="false"
    :show-button="receivable.egcs_fc_canadjust"
    :button-label="t('account_receivable.adjust_receivable')"
    :pagination-options="{ manualPagination: false }"
    data-testid="account-receivable-adjustments-table"
    @add="emit('adjust')">
    <template #reference-cell="{ row }">
      <span class="text-sm font-semibold">{{ row.original.reference }}</span>
    </template>
    <template #status-cell="{ row }">
      <CommonStatusBadge :status-id="row.original.adjustment.egcs_fc_status" />
    </template>
    <template #method-cell="{ row }">
      {{ row.original.adjustment.egcs_fc_recoverymethod ? t(`enums.account_receivable_recovery_method.${row.original.adjustment.egcs_fc_recoverymethod}`) : t('common.none') }}
    </template>
    <template #amount-cell="{ row }">
      <span class="font-medium tabular-nums">{{ amount(row.original.amount) }}</span>
    </template>
    <template #created-cell="{ row }">
      {{ formatDate(row.original.createdAt) }}
    </template>
    <template #actions-cell="{ row }">
      <div class="flex justify-end gap-2">
        <CommonActionButton
          v-if="row.original.adjustment.egcs_fc_candeleterole"
          icon="i-lucide-trash" color="error" variant="ghost"
          :aria-label="`${t('common.delete')}: ${row.original.reference}`"
          :loading="deletingId === row.original.adjustment.id" :disabled="deletingId !== null"
          @click="deleteAdjustment(row.original)" />
        <CommonActionButton
          icon="i-lucide-arrow-right" color="neutral" variant="ghost"
          :to="localePath({ ...appRouteLocations.agreementAccountReceivableDetail(agreementId, row.original.adjustment.id), query: { entityType: 'fundingcaseaccountreceivableadjustment' } })"
          :aria-label="`${t('common.view_details')}: ${row.original.reference}`" />
      </div>
    </template>
  </CommonResourceLayoutCard>
</template>
