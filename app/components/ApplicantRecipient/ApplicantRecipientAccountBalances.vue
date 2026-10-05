<script setup lang="ts">
import { computed } from 'vue'
import type { ProponentAccountBalanceRow } from '~~/shared/types/account-receivable-proponent'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { formatAccountReceivableAmount } from '~/utils/account-receivable-display'

const { applicantRecipientId } = defineProps<{ applicantRecipientId: string }>()
const { t, locale } = useI18n()
const { pagination, items, totalRecords, status, retry } = useResourceTable<ProponentAccountBalanceRow>({
  fetchUrl: computed(() => `/api/applicant-recipients/${applicantRecipientId}/financial-summary`)
})
const columns: TableColumnInput<ProponentAccountBalanceRow>[] = [
  { id: 'agency', headerKey: 'account_receivable.credit_memo_agency' },
  { id: 'currency', headerKey: 'common.currency' },
  { id: 'debits', headerKey: 'account_receivable.pool_receivables' },
  { id: 'credits', headerKey: 'account_receivable.pool_credit_memos' },
  { id: 'owedBy', headerKey: 'account_receivable.pool_owed_by_proponent' },
  { id: 'owedTo', headerKey: 'account_receivable.pool_owed_to_proponent' }
]
const amount = (value: string, currency: string) =>
  formatAccountReceivableAmount(value, locale.value, currency) ?? t('common.not_available')
</script>

<template>
  <CommonSection :title="t('account_receivable.pool_balance')" :grid-cols="1" data-testid="proponent-financial-summary">
    <p class="text-sm text-muted">
      {{ t('account_receivable.pool_balance_description') }}
    </p>
    <CommonResourceLayoutCard
      v-model:pagination="pagination"
      :data="items" :columns="columns" :total-records="totalRecords"
      :loading="status === 'pending'" :request-status="status"
      :show-toolbar="false" :show-button="false" @retry="retry">
      <template #agency-cell="{ row }">
        <CommonBilingualName :name-en="row.original.egcs_fc_agencyname_en" :name-fr="row.original.egcs_fc_agencyname_fr" />
      </template>
      <template #currency-cell="{ row }">
        <span class="text-sm uppercase">{{ row.original.egcs_fc_currency }}</span>
      </template>
      <template #debits-cell="{ row }">
        <span class="text-sm tabular-nums">{{ amount(row.original.egcs_fc_debitamount, row.original.egcs_fc_currency) }}</span>
      </template>
      <template #credits-cell="{ row }">
        <span class="text-sm tabular-nums">{{ amount(row.original.egcs_fc_creditamount, row.original.egcs_fc_currency) }}</span>
      </template>
      <template #owedBy-cell="{ row }">
        <span class="text-sm font-semibold tabular-nums">{{ amount(row.original.egcs_fc_receivableamount, row.original.egcs_fc_currency) }}</span>
      </template>
      <template #owedTo-cell="{ row }">
        <span class="text-sm font-semibold tabular-nums">{{ amount(row.original.egcs_fc_refundableamount, row.original.egcs_fc_currency) }}</span>
      </template>
    </CommonResourceLayoutCard>
  </CommonSection>
</template>
