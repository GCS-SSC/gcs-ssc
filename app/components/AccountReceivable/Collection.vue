<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { AccountReceivableDetail } from '~~/shared/types/account-receivable'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { appRouteLocations } from '~/utils/route-locations'
import { accountReceivableReference, formatAccountReceivableAmount } from '~/utils/account-receivable-display'
import { sumMoney } from '~~/shared/utils/money'

const { agreementId } = defineProps<{ agreementId: string }>()
const { t, locale } = useI18n()
const localePath = useLocalePath()
const createOpen: Ref<boolean> = ref(false)
const { search, pagination, items, totalRecords, status, retry, response } = useResourceTable<AccountReceivableDetail>({
  fetchUrl: computed(() => `/api/agreements/${agreementId}/account-receivables`)
})
const canCreate = computed(() => (response.value as { egcs_fc_cancreate?: boolean } | undefined)?.egcs_fc_cancreate === true)
const tableRows = computed(() => items.value.map(receivable => ({
  ...receivable,
  originalAmount: sumMoney(receivable.egcs_fc_lines.map(line => line.egcs_fc_amount))
})))
type CollectionRow = typeof tableRows.value[number]
const columns: TableColumnInput<CollectionRow>[] = [
  { id: 'reference', headerKey: 'account_receivable.number' },
  { id: 'status', headerKey: 'common.status' },
  { id: 'amount', headerKey: 'account_receivable.receivable_amount' },
  { id: 'type', headerKey: 'account_receivable.type' },
  { id: 'year', headerKey: 'agreement.payments.fiscal_year' },
  { id: 'method', headerKey: 'account_receivable.recovery_kind' },
  { id: 'actions', headerKey: 'common.actions' }
]
const amount = (value: string | null | undefined, currency: string | undefined) => currency ? formatAccountReceivableAmount(value, locale.value, currency) ?? t('common.not_available') : t('common.not_available')
watch(() => agreementId, () => {
  createOpen.value = false
}, { flush: 'sync' })
const created = async (id: string) => {
  await navigateTo(localePath(appRouteLocations.agreementAccountReceivableDetail(agreementId, id)))
}
</script>

<template>
  <div class="min-w-0 space-y-4">
    <p class="text-sm text-muted">
      {{ t('account_receivable.description') }}
    </p>
    <CommonResourceLayoutCard
      v-model:search="search" v-model:pagination="pagination"
      :data="tableRows" :columns="columns" :total-records="totalRecords"
      :request-status="status" :loading="status === 'pending'"
      :button-label="t('account_receivable.create')" :show-button="canCreate"
      :search-placeholder="t('account_receivable.search')"
      @add="createOpen = true" @retry="retry">
      <template #reference-cell="{ row }">
        <div class="flex min-w-0 flex-col gap-1">
          <ULink
            :to="localePath(appRouteLocations.agreementAccountReceivableDetail(agreementId, row.original.id))"
            class="text-sm font-bold text-zinc-900 transition-colors hover:text-primary dark:text-white">
            {{ accountReceivableReference(row.original) }}
          </ULink>
          <span class="text-xs text-muted">{{ locale === 'fr' ? row.original.egcs_fc_debtorname_fr : row.original.egcs_fc_debtorname_en }}</span>
        </div>
      </template>
      <template #status-cell="{ row }">
        <CommonStatusBadge :status-id="row.original.egcs_fc_status" />
      </template>
      <template #type-cell="{ row }">
        <CommonBilingualName :name-en="row.original.egcs_fc_typename_en" :name-fr="row.original.egcs_fc_typename_fr" />
      </template>
      <template #amount-cell="{ row }">
        <div class="flex flex-col gap-1 tabular-nums">
          <span class="text-sm font-semibold">{{ amount(row.original.egcs_fc_outcome === 'posted' ? row.original.egcs_fc_approvedamount : row.original.originalAmount, row.original.egcs_fc_currency) }}</span>
          <span class="text-xs text-muted">{{ t('account_receivable.original_amount') }}: {{ amount(row.original.originalAmount, row.original.egcs_fc_currency) }}</span>
        </div>
      </template>
      <template #year-cell="{ row }">
        {{ row.original.egcs_fc_fiscalyeardisplay }}
      </template>
      <template #method-cell="{ row }">
        {{ row.original.egcs_fc_effectiverecoverymethod ? t(`enums.account_receivable_recovery_method.${row.original.egcs_fc_effectiverecoverymethod}`) : t('common.none') }}
      </template>
      <template #actions-cell="{ row }">
        <div class="flex justify-end gap-2">
          <UButton
            icon="i-lucide-arrow-right" color="neutral" variant="ghost"
            :aria-label="`${t('common.view_details')}: ${accountReceivableReference(row.original)}`"
            :to="localePath(appRouteLocations.agreementAccountReceivableDetail(agreementId, row.original.id))" />
        </div>
      </template>
    </CommonResourceLayoutCard>
    <AccountReceivableCreateModal v-model:open="createOpen" :agreement-id="agreementId" @created="created" />
  </div>
</template>
