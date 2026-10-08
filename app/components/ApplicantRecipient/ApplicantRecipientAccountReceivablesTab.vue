<script setup lang="ts">
import { computed } from 'vue'
import type { ProponentAccountReceivableRow } from '~~/shared/types/account-receivable-proponent'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { appRouteLocations } from '~/utils/route-locations'
import { accountReceivableReference, formatAccountReceivableAmount } from '~/utils/account-receivable-display'

const { applicantRecipientId } = defineProps<{ applicantRecipientId: string }>()
const { t, locale } = useI18n()
const localePath = useLocalePath()
const { search, pagination, items, totalRecords, status, retry } = useResourceTable<ProponentAccountReceivableRow>({
  fetchUrl: computed(() => `/api/applicant-recipients/${applicantRecipientId}/account-receivables`)
})
const columns: TableColumnInput<ProponentAccountReceivableRow>[] = [
  { id: 'reference', headerKey: 'account_receivable.number' },
  { id: 'status', headerKey: 'common.status' },
  { id: 'amount', headerKey: 'account_receivable.approved_amount' },
  { id: 'type', headerKey: 'account_receivable.type' },
  { accessorKey: 'egcs_fc_fiscalyeardisplay', headerKey: 'agreement.payments.fiscal_year' },
  { id: 'method', headerKey: 'account_receivable.recovery_kind' },
  { id: 'actions', headerKey: 'common.actions' }
]
const amount = (value: string, currency: string) =>
  formatAccountReceivableAmount(value, locale.value, currency) ?? t('common.not_available')
</script>

<template>
  <div class="min-w-0 space-y-4" data-testid="proponent-account-receivables">
    <ApplicantRecipientAccountBalances :applicant-recipient-id="applicantRecipientId" />
    <CommonSection :title="t('account_receivable.title')" :grid-cols="1">
      <p class="text-sm text-muted">
        {{ t('account_receivable.proponent_description') }}
      </p>
      <CommonResourceLayoutCard
        v-model:search="search" v-model:pagination="pagination"
        :data="items" :columns="columns" :total-records="totalRecords"
        :loading="status === 'pending'" :request-status="status" :show-button="false"
        :search-placeholder="t('account_receivable.search')" @retry="retry">
        <template #reference-cell="{ row }">
          <div class="flex min-w-0 flex-col gap-1">
            <ULink
              :to="localePath(appRouteLocations.agreementAccountReceivableDetail(row.original.egcs_fc_fundingagreement, row.original.id))"
              class="text-sm font-bold text-zinc-900 transition-colors hover:text-primary dark:text-white">
              {{ accountReceivableReference(row.original) }}
            </ULink>
            <span v-if="row.original.egcs_fc_linkedreceivable" class="text-xs text-muted">{{ t('account_receivable.adjustment') }}</span>
          </div>
        </template>
        <template #status-cell="{ row }">
          <CommonStatusBadge :status-id="row.original.egcs_fc_status" />
        </template>
        <template #amount-cell="{ row }">
          <div class="flex flex-col gap-1 tabular-nums">
            <span class="text-sm font-semibold">{{ amount(row.original.egcs_fc_approvedamount, row.original.egcs_fc_currency) }}</span>
            <span class="text-xs text-muted">{{ t('account_receivable.original_amount') }}: {{ amount(row.original.egcs_fc_originalamount, row.original.egcs_fc_currency) }}</span>
          </div>
        </template>
        <template #type-cell="{ row }">
          <CommonBilingualName :name-en="row.original.egcs_fc_typename_en" :name-fr="row.original.egcs_fc_typename_fr" />
        </template>
        <template #method-cell="{ row }">
          {{ row.original.egcs_fc_effectiverecoverymethod ? t(`enums.account_receivable_recovery_method.${row.original.egcs_fc_effectiverecoverymethod}`) : t('common.none') }}
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end gap-2">
            <UButton
              icon="i-lucide-arrow-right" color="neutral" variant="ghost"
              :aria-label="`${t('common.view_details')}: ${accountReceivableReference(row.original)}`"
              :to="localePath(appRouteLocations.agreementAccountReceivableDetail(row.original.egcs_fc_fundingagreement, row.original.id))" />
          </div>
        </template>
      </CommonResourceLayoutCard>
    </CommonSection>
  </div>
</template>
