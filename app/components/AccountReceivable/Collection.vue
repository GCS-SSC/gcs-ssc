<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { AccountReceivableRow } from '~~/shared/types/account-receivable'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { appRouteLocations } from '~/utils/route-locations'
import { accountReceivableReference, formatAccountReceivableAmount } from '~/utils/account-receivable-display'

const { agreementId } = defineProps<{ agreementId: string }>()
const { t, locale } = useI18n()
const localePath = useLocalePath()
const createOpen: Ref<boolean> = ref(false)
const { search, pagination, items, totalRecords, status, retry, response } = useResourceTable<AccountReceivableRow>({
  fetchUrl: computed(() => `/api/agreements/${agreementId}/account-receivables`)
})
const canCreate = computed(() => (response.value as { egcs_fc_cancreate?: boolean } | undefined)?.egcs_fc_cancreate === true)
const columns: TableColumnInput<AccountReceivableRow>[] = [
  { id: 'reference', headerKey: 'account_receivable.number' },
  { id: 'status', accessorKey: 'egcs_fc_status', headerKey: 'common.status' },
  { id: 'debtor', headerKey: 'account_receivable.debtor' },
  { id: 'amounts', headerKey: 'account_receivable.balance' },
  { id: 'type', accessorKey: 'egcs_fc_type', headerKey: 'account_receivable.type' },
  { id: 'year', accessorKey: 'egcs_fc_fiscalyeardisplay', headerKey: 'agreement.payments.fiscal_year' },
  { id: 'method', accessorKey: 'egcs_fc_effectiverecoverymethod', headerKey: 'account_receivable.current_recovery_method' },
  { id: 'actions', headerKey: 'common.actions' }
]
const amount = (value: string | null | undefined, currency: string) => formatAccountReceivableAmount(value, locale.value, currency) ?? t('common.not_available')
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
    <CommonResourceLayoutCard v-model:search="search" v-model:pagination="pagination" :data="items" :columns="columns" :total-records="totalRecords" :request-status="status" :loading="status === 'pending'" :button-label="t('account_receivable.create')" :show-button="canCreate" :search-placeholder="t('account_receivable.search')" @add="createOpen = true" @retry="retry">
      <template #reference-cell="{ row }">
        <div class="flex flex-col gap-1">
          <span>{{ accountReceivableReference(row.original) }}</span>
          <span v-if="row.original.egcs_fc_linkedreceivable" class="text-xs text-muted">{{ t('account_receivable.adjustment') }}</span>
        </div>
      </template>
      <template #status-cell="{ row }">
        <CommonStatusBadge :status-id="row.original.egcs_fc_status" />
      </template>
      <template #debtor-cell="{ row }">
        {{ locale === 'fr' ? row.original.egcs_fc_debtorname_fr : row.original.egcs_fc_debtorname_en }}
      </template>
      <template #type-cell="{ row }">
        <CommonBilingualName :name-en="row.original.egcs_fc_typename_en" :name-fr="row.original.egcs_fc_typename_fr" />
      </template>
      <template #amounts-cell="{ row }">
        <dl class="space-y-1 text-xs">
          <div class="flex flex-wrap gap-x-2">
            <dt class="text-muted">
              {{ t('account_receivable.principal') }}
            </dt><dd>{{ amount(row.original.egcs_fc_principal, row.original.egcs_fc_currency) }}</dd>
          </div>
          <div class="flex flex-wrap gap-x-2">
            <dt class="text-muted">
              {{ t('account_receivable.recovered') }}
            </dt><dd>{{ amount(row.original.egcs_fc_recovered, row.original.egcs_fc_currency) }}</dd>
          </div>
          <div class="flex flex-wrap gap-x-2">
            <dt class="text-muted">
              {{ t('account_receivable.reserved') }}
            </dt><dd>{{ amount(row.original.egcs_fc_reserved, row.original.egcs_fc_currency) }}</dd>
          </div>
          <div class="flex flex-wrap gap-x-2 font-semibold">
            <dt>{{ t('account_receivable.outstanding') }}</dt><dd>{{ amount(row.original.egcs_fc_outstanding, row.original.egcs_fc_currency) }}</dd>
          </div>
        </dl>
      </template>
      <template #method-cell="{ row }">
        {{ row.original.egcs_fc_effectiverecoverymethod ? t(`enums.account_receivable_recovery_method.${row.original.egcs_fc_effectiverecoverymethod}`) : t('common.none') }}
      </template>
      <template #actions-cell="{ row }">
        <div class="flex justify-end gap-2">
          <UButton icon="i-lucide-eye" color="neutral" variant="ghost" :aria-label="`${t('common.view_details')}: ${accountReceivableReference(row.original)}`" :to="localePath(appRouteLocations.agreementAccountReceivableDetail(agreementId, String(row.original.id)))" />
        </div>
      </template>
    </CommonResourceLayoutCard>
    <AccountReceivableCreateModal v-model:open="createOpen" :agreement-id="agreementId" @created="created" />
  </div>
</template>
