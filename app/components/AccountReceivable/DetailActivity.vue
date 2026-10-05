<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { AccountReceivableDetail } from '~~/shared/types/account-receivable'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { appRouteLocations } from '~/utils/route-locations'
import { formatAccountReceivableAmount } from '~/utils/account-receivable-display'
import { buildAccountReceivableAdjustmentRows, type AccountReceivableAdjustmentRow } from '~/utils/account-receivable-detail-activity'

const { receivable, agreementId } = defineProps<{ receivable: AccountReceivableDetail, agreementId: string }>()
const { t, locale } = useI18n()
const localePath = useLocalePath()
const { formatDate } = useDateHelpers()
const rows = computed(() => buildAccountReceivableAdjustmentRows(receivable))
const pagination: Ref<{ pageIndex: number, pageSize: number }> = ref({ pageIndex: 0, pageSize: 10 })
watch(() => `${agreementId}:${receivable.id}`, () => {
  pagination.value.pageIndex = 0
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
</script>

<template>
  <CommonResourceLayoutCard
    v-model:pagination="pagination"
    :data="rows"
    :columns="columns"
    :total-records="rows.length"
    :show-toolbar="false"
    :pagination-options="{ manualPagination: false }"
    data-testid="account-receivable-adjustments-table">
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
        <UButton
          icon="i-lucide-arrow-right" color="neutral" variant="ghost"
          :to="localePath(appRouteLocations.agreementAccountReceivableDetail(agreementId, row.original.adjustment.id))"
          :aria-label="`${t('common.view_details')}: ${row.original.reference}`" />
      </div>
    </template>
  </CommonResourceLayoutCard>
</template>
