<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { AccountReceivableLine } from '~~/shared/types/account-receivable'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { formatAccountingDimension, formatAccountingDimensions } from '~~/shared/utils/accounting-dimensions'
import { formatAccountReceivableAmount } from '~/utils/account-receivable-display'

const { lines, currency, isAdjustment = false } = defineProps<{ lines: AccountReceivableLine[], currency: string, isAdjustment?: boolean }>()
const { t, locale } = useI18n()
type SourceRow = AccountReceivableLine & { index: number }
const rows = computed<SourceRow[]>(() => lines.map((line, index) => ({ ...line, index })))
const pagination: Ref<{ pageIndex: number, pageSize: number }> = ref({ pageIndex: 0, pageSize: 10 })
watch(() => lines.map(line => line.id).join(','), () => {
  pagination.value.pageIndex = 0
})
const columns: TableColumnInput<SourceRow>[] = [
  { id: 'coding', headerKey: 'agreement.commitments.coding' },
  { id: 'amount', headerKey: 'account_receivable.established_amount' }
]
const amount = (value: string) => formatAccountReceivableAmount(value, locale.value, currency) ?? t('common.not_available')
/**
 * Shows retained coding or explains why a source cannot be adjusted.
 * @param line Retained receivable source.
 * @returns Localized coding title or source instruction.
 */
const primaryCoding = (line: AccountReceivableLine) => {
  if (isAdjustment && !line.egcs_fc_accountreceivablechartofaccount) return t('account_receivable.adjustment_source_unavailable')
  const first = line.egcs_fc_accountreceivableaccountingdimensions[0]
  return first ? formatAccountingDimension(first, locale.value === 'fr' ? 'fr' : 'en') : t('account_receivable.coding_not_selected')
}
const secondaryCoding = (line: AccountReceivableLine) => formatAccountingDimensions(line.egcs_fc_accountreceivableaccountingdimensions.slice(1), locale.value === 'fr' ? 'fr' : 'en')
</script>

<template>
  <CommonResourceLayoutCard
    v-model:pagination="pagination"
    :data="rows"
    :columns="columns"
    :total-records="rows.length"
    :show-toolbar="false"
    :pagination-options="{ manualPagination: false }"
    data-testid="account-receivable-source-table">
    <template #coding-cell="{ row }">
      <div class="min-w-48 max-w-sm whitespace-normal">
        <slot name="coding" :line="row.original" :index="row.original.index">
          <div class="flex min-w-0 flex-col gap-1">
            <span class="text-sm font-semibold [overflow-wrap:anywhere]">{{ primaryCoding(row.original) }}</span>
            <span v-if="secondaryCoding(row.original)" class="text-xs text-muted [overflow-wrap:anywhere]">{{ secondaryCoding(row.original) }}</span>
          </div>
        </slot>
      </div>
    </template>
    <template #amount-cell="{ row }">
      <div class="min-w-32">
        <slot name="amount" :line="row.original" :index="row.original.index">
          <span class="font-semibold tabular-nums">{{ amount(row.original.egcs_fc_amount) }}</span>
        </slot>
      </div>
    </template>
  </CommonResourceLayoutCard>
</template>
