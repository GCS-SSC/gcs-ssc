<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { GcsExtensionPaymentCalculationResult } from '@gcs-ssc/extensions/server'
import type { FundingCaseAgreementCommitmentLineBalances } from '~~/shared/types/funding-case-agreement-ui'
import { formatAccountingDimensions } from '~~/shared/utils/accounting-dimensions'
import { formatMoneyText, parseMoney } from '~~/shared/utils/money'

const props = defineProps<{
  agreementId: string
  commitmentType?: string
  fiscalYear?: string
  periodStart?: number
  periodEnd?: number
}>()
const { t, locale } = useI18n()
const { showError } = useApiErrorToast()
const inputs = ref<GcsExtensionPaymentCalculationResult | null>(null)
const balances = ref<FundingCaseAgreementCommitmentLineBalances | null>(null)
const loading = ref(false)
const failed = ref(false)
let requestVersion = 0
onBeforeUnmount(() => {
  requestVersion += 1
})

const selection = computed(() => [props.agreementId, props.commitmentType, props.fiscalYear, props.periodStart, props.periodEnd] as const)
const hasPeriod = computed(() => props.periodStart !== undefined && props.periodEnd !== undefined && props.periodStart <= props.periodEnd)

/** Rejects stale financial responses when the payment selection changes. */
const load = async () => {
  const version = ++requestVersion
  inputs.value = null
  balances.value = null
  failed.value = false
  loading.value = false
  if (!props.commitmentType || !props.fiscalYear) return
  const query = { egcs_fc_commitmenttype: props.commitmentType, egcs_fc_fiscalyear: props.fiscalYear }
  loading.value = true
  const results = await Promise.allSettled([
    $fetch<FundingCaseAgreementCommitmentLineBalances, string>(`/api/agreements/${props.agreementId}/commitment-line-balances`, { query }),
    hasPeriod.value
      ? $fetch<GcsExtensionPaymentCalculationResult, string>(`/api/agreements/${props.agreementId}/payment-financial-inputs`, {
          query: { ...query, egcs_fc_periodstart: props.periodStart, egcs_fc_periodend: props.periodEnd }
        })
      : Promise.resolve(null)
  ])
  if (version !== requestVersion) return
  loading.value = false
  const [balanceResult, inputResult] = results
  if (balanceResult.status === 'fulfilled') balances.value = balanceResult.value
  if (inputResult.status === 'fulfilled') inputs.value = inputResult.value
  for (const result of results) {
    if (result.status === 'rejected') {
      failed.value = true
      showError(result.reason)
    }
  }
}
watch(selection, load, { immediate: true, flush: 'sync' })

const financialRows = computed<[string, string][]>(() => inputs.value
  ? [
      ['agreement.payments.financial_inputs.commitment_remaining', inputs.value.commitmentRemaining],
      ['agreement.payments.financial_inputs.payments_to_date', inputs.value.totalPaymentsToDate],
      ['agreement.payments.financial_inputs.credit_memos', inputs.value.totalCreditMemos],
      ['agreement.payments.financial_inputs.reconciled_credit_memos', inputs.value.totalCreditMemosForReconciledPeriods],
      ['agreement.payments.financial_inputs.claims_to_last_claim_month', inputs.value.totalClaimsToLastClaimMonth],
      ['agreement.payments.financial_inputs.forecast_to_last_claim_month', inputs.value.totalForecastToLastClaimMonth],
      ['agreement.payments.financial_inputs.forecast_to_period_end', inputs.value.totalForecastToPeriodEnd],
      ['agreement.payments.financial_inputs.available_before_holdback', inputs.value.availableForDisbursementBeforeHoldback],
      ['agreement.payments.financial_inputs.agreement_total', inputs.value.agreementTotal],
      ['agreement.payments.financial_inputs.final_fiscal_year_total', inputs.value.finalFiscalYearTotal]
    ]
  : [])
const money = (amount: string, currency: string) => formatMoneyText(parseMoney(amount), locale.value, currency.toUpperCase())
</script>

<template>
  <div class="space-y-4">
    <details open class="border-t border-default pt-4">
      <summary class="cursor-pointer font-medium">
        {{ t('agreement.payments.financial_inputs.title') }}
      </summary>
      <p v-if="!commitmentType || !fiscalYear || !hasPeriod" class="mt-3 text-sm text-muted">
        {{ t('agreement.payments.financial_inputs.select_period') }}
      </p>
      <p v-else-if="loading" role="status" class="mt-3 text-sm text-muted">
        {{ t('common.loading') }}
      </p>
      <dl v-else-if="inputs" class="mt-3 grid gap-4 sm:grid-cols-2">
        <div v-for="[label, amount] in financialRows" :key="label" class="min-w-0">
          <dt class="text-sm text-muted">
            {{ t(label) }}
          </dt>
          <dd class="mt-1 font-medium tabular-nums">
            {{ money(amount, inputs.currency) }}
          </dd>
        </div>
        <div>
          <dt class="text-sm text-muted">
            {{ t('agreement.payments.financial_inputs.holdback_percent') }}
          </dt>
          <dd class="mt-1 font-medium">
            {{ inputs.holdbackPercent }}%
          </dd>
        </div>
        <div>
          <dt class="text-sm text-muted">
            {{ t('agreement.payments.financial_inputs.holdback_basis') }}
          </dt>
          <dd class="mt-1 font-medium">
            {{ t(`enums.holdback_bases.${inputs.holdbackBasis}`) }}
          </dd>
        </div>
      </dl>
    </details>
    <details class="border-t border-default pt-4">
      <summary class="cursor-pointer font-medium">
        {{ t('agreement.payments.financial_inputs.line_balances') }}
      </summary>
      <p v-if="!commitmentType || !fiscalYear" class="mt-3 text-sm text-muted">
        {{ t('agreement.payments.financial_inputs.select_year') }}
      </p>
      <p v-else-if="loading" role="status" class="mt-3 text-sm text-muted">
        {{ t('common.loading') }}
      </p>
      <div v-else-if="balances?.lines.length" class="mt-3 space-y-4">
        <div v-for="line in balances.lines" :key="line.id" class="rounded-md border border-default p-3">
          <p class="text-sm font-medium">
            {{ t('agreement.payments.commitment_line_prefix') }} {{ line.egcs_fc_commitmentlinenumber }} · {{ line.fiscal_year_display }}
          </p>
          <p class="mt-1 break-words text-sm text-muted">
            {{ formatAccountingDimensions(line.accounting_dimensions ?? [], locale === 'fr' ? 'fr' : 'en') }}
          </p>
          <dl class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <dt class="text-sm text-muted">
                {{ t('agreement.commitments.committed') }}
              </dt><dd class="font-medium tabular-nums">
                {{ money(line.egcs_fc_amount, balances.currency) }}
              </dd>
            </div>
            <div>
              <dt class="text-sm text-muted">
                {{ t('agreement.commitments.paid') }}
              </dt><dd class="font-medium tabular-nums">
                {{ money(line.egcs_fc_paidamount, balances.currency) }}
              </dd>
            </div>
            <div>
              <dt class="text-sm text-muted">
                {{ t('agreement.commitments.balance') }}
              </dt><dd class="font-medium tabular-nums">
                {{ money(line.egcs_fc_balance, balances.currency) }}
              </dd>
            </div>
          </dl>
        </div>
      </div>
      <p v-else-if="balances" class="mt-3 text-sm text-muted">
        {{ t('agreement.commitments.no_lines') }}
      </p>
    </details>
    <UButton v-if="failed" :label="t('common.retry')" color="neutral" variant="ghost" @click="load" />
  </div>
</template>
