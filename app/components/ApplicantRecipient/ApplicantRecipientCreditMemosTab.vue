<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { ProponentCreditMemoRow } from '~~/shared/types/account-receivable-proponent'
import type { ApplicantRecipientProfileRow } from '~~/shared/types/applicant-recipient-ui'
import type { CreditMemoCreateContext } from '~/utils/credit-memo-create-context'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { appRouteLocations } from '~/utils/route-locations'
import { formatAccountReceivableAmount } from '~/utils/account-receivable-display'

const { applicantRecipientId, profile } = defineProps<{ applicantRecipientId: string; profile: ApplicantRecipientProfileRow | null }>()
const { t, locale } = useI18n()
const localePath = useLocalePath()
const { getBilingualValue } = useBilingualValue()
const { formatDate } = useDateHelpers()
const createOpen: Ref<boolean> = ref(false)
const { search, pagination, items, totalRecords, status, retry, response } = useResourceTable<ProponentCreditMemoRow>({
  fetchUrl: computed(() => `/api/applicant-recipients/${applicantRecipientId}/credit-memos`)
})
const canCreate = computed(() => status.value === 'success' && profile !== null
  && (response.value as { egcs_fc_cancreate?: boolean } | undefined)?.egcs_fc_cancreate === true)
/**
 * Retains both Proponent names when the modal changes language.
 * @param language - Requested name language.
 * @returns The available legal or operating name.
 */
const proponentName = (language: 'en' | 'fr') => {
  const legalName = language === 'en' ? profile?.egcs_ar_legalname_en : profile?.egcs_ar_legalname_fr
  if (legalName?.trim()) return legalName.trim()
  const operatingName = language === 'en' ? profile?.egcs_ar_operatingname_en : profile?.egcs_ar_operatingname_fr
  if (operatingName?.trim()) return operatingName.trim()
  return getBilingualValue(profile, 'egcs_ar_legalname', getBilingualValue(profile, 'egcs_ar_operatingname', applicantRecipientId))
}
const createContext = computed<CreditMemoCreateContext>(() => ({
  egcs_fc_applicantrecipient: applicantRecipientId,
  egcs_fc_debtorname_en: proponentName('en'),
  egcs_fc_debtorname_fr: proponentName('fr')
}))
watch(() => applicantRecipientId, () => {
  createOpen.value = false
}, { flush: 'sync' })
const created = async (id: string, proponentId: string) => {
  if (proponentId !== applicantRecipientId) return
  await navigateTo(localePath(appRouteLocations.proponentCreditMemoDetail(proponentId, id)))
}
const columns: TableColumnInput<ProponentCreditMemoRow>[] = [
  { accessorKey: 'egcs_fc_creditmemoreference', headerKey: 'account_receivable.credit_memos_number' },
  { id: 'agency', headerKey: 'account_receivable.credit_memo_agency' },
  { id: 'status', headerKey: 'common.status' },
  { id: 'kind', headerKey: 'account_receivable.activity_type' },
  { id: 'agreement', headerKey: 'agreement.agreement_number', meta: { class: { th: 'min-w-40', td: 'min-w-40' } } },
  { id: 'payment', headerKey: 'account_receivable.offset_payments', meta: { class: { th: 'min-w-48', td: 'min-w-48' } } },
  { id: 'amount', headerKey: 'account_receivable.credit_memo_amount' },
  { id: 'received', headerKey: 'account_receivable.received_date' },
  { id: 'actions', headerKey: 'common.actions' }
]
const amount = (value: string, currency: string) =>
  formatAccountReceivableAmount(value, locale.value, currency) ?? t('common.not_available')
/**
 * Opens a cash memo or the Payment that generated an automatic offset memo.
 * @param memo - Independently authorized collection row.
 * @returns The localized destination, when its target is readable.
 */
const memoDetailPath = (memo: ProponentCreditMemoRow): string | undefined => {
  if (memo.egcs_fc_kind === 'cash') return localePath(appRouteLocations.proponentCreditMemoDetail(applicantRecipientId, memo.id))
  const origin = memo.egcs_fc_originapplication
  return origin ? localePath(appRouteLocations.agreementPaymentDetail(origin.egcs_fc_fundingagreement, origin.egcs_fc_payment)) : undefined
}
</script>

<template>
  <div class="min-w-0 space-y-6" data-testid="proponent-credit-memos">
    <ApplicantRecipientAccountBalances :applicant-recipient-id="applicantRecipientId" />
    <p class="text-sm text-muted">
      {{ t('account_receivable.credit_memos_description') }}
    </p>
    <CommonResourceLayoutCard
      v-model:search="search" v-model:pagination="pagination"
      :data="items" :columns="columns" :total-records="totalRecords"
      :loading="status === 'pending'" :request-status="status" :show-button="canCreate"
      :button-label="t('account_receivable.create_credit_memo')"
      :search-placeholder="t('account_receivable.credit_memos_search')" @retry="retry" @add="createOpen = true">
      <template #egcs_fc_creditmemoreference-cell="{ row }">
        <ULink
          v-if="memoDetailPath(row.original)" :to="memoDetailPath(row.original)"
          class="text-sm font-bold text-zinc-900 transition-colors hover:text-primary dark:text-white">
          {{ row.original.egcs_fc_creditmemoreference }}
        </ULink>
        <span v-else class="text-sm font-semibold">{{ row.original.egcs_fc_creditmemoreference }}</span>
      </template>
      <template #agency-cell="{ row }">
        <CommonBilingualName :name-en="row.original.egcs_fc_agencyname_en" :name-fr="row.original.egcs_fc_agencyname_fr" />
      </template>
      <template #status-cell="{ row }">
        <CommonStatusBadge v-if="row.original.egcs_fc_kind === 'cash'" :status-id="row.original.egcs_fc_status" />
      </template>
      <template #kind-cell="{ row }">
        {{ t(row.original.egcs_fc_kind === 'cash' ? 'account_receivable.manual_credit_memo' : 'account_receivable.automatic_offset') }}
      </template>
      <template #agreement-cell="{ row }">
        <div v-if="row.original.egcs_fc_kind === 'automatic'" class="flex flex-col gap-3">
          <span v-if="!row.original.egcs_fc_originapplication" class="text-sm text-muted">{{ t('common.not_available') }}</span>
          <div v-for="application in row.original.egcs_fc_applications" :key="application.id" class="flex flex-col gap-1">
            <ULink :to="localePath(appRouteLocations.agreementDetail(application.egcs_fc_fundingagreement))" class="text-sm font-semibold hover:text-primary">
              {{ application.egcs_fc_agreementnumber }}
            </ULink>
            <span class="text-xs text-muted">{{ t(application.id === row.original.egcs_fc_originapplication?.id ? 'account_receivable.offset_origin' : 'account_receivable.offset_application') }}</span>
          </div>
        </div>
        <span v-else class="text-sm text-muted">{{ t('common.none') }}</span>
      </template>
      <template #payment-cell="{ row }">
        <div v-if="row.original.egcs_fc_kind === 'automatic'" class="flex flex-col gap-3">
          <span v-if="!row.original.egcs_fc_originapplication" class="text-sm text-muted">{{ t('common.not_available') }}</span>
          <div v-for="application in row.original.egcs_fc_applications" :key="application.id" class="flex flex-col gap-1">
            <ULink :to="localePath(appRouteLocations.agreementPaymentDetail(application.egcs_fc_fundingagreement, application.egcs_fc_payment))" class="text-sm font-semibold hover:text-primary">
              {{ t('account_receivable.payment_reference', { reference: application.egcs_fc_payment }) }}
            </ULink>
            <span class="text-xs text-muted tabular-nums">{{ amount(application.egcs_fc_amount, row.original.egcs_fc_currency) }} · {{ t(`account_receivable.recovery_outcomes.${application.egcs_fc_outcome}`) }}</span>
          </div>
        </div>
        <span v-else class="text-sm text-muted">{{ t('common.none') }}</span>
      </template>
      <template #amount-cell="{ row }">
        <span v-if="row.original.egcs_fc_kind === 'automatic'" class="text-sm font-semibold tabular-nums">
          {{ t('account_receivable.credit_memo_applied') }}: {{ amount(row.original.egcs_fc_amount, row.original.egcs_fc_currency) }}
        </span>
        <span v-else class="text-sm tabular-nums">{{ amount(row.original.egcs_fc_amount, row.original.egcs_fc_currency) }}</span>
      </template>
      <template #received-cell="{ row }">
        {{ formatDate(row.original.egcs_fc_kind === 'cash' ? row.original.egcs_fc_receiveddate : row.original.egcs_fc_createdat) }}
      </template>
      <template #actions-cell="{ row }">
        <div class="flex justify-end gap-2">
          <UButton
            v-if="memoDetailPath(row.original)"
            icon="i-lucide-arrow-right" color="neutral" variant="ghost"
            :aria-label="`${t('common.view_details')}: ${row.original.egcs_fc_creditmemoreference}`"
            :to="memoDetailPath(row.original)" />
        </div>
      </template>
    </CommonResourceLayoutCard>
    <AccountReceivableCreditMemoCreateModal v-if="profile" v-model:open="createOpen" :context="createContext" @created="created" />
  </div>
</template>
