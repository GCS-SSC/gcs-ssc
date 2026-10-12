<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { GcsPaymentAmountCalculatorResult } from '@gcs-ssc/extensions/ui'
import type { GcsExtensionPaymentCalculationResult } from '@gcs-ssc/extensions/server'
import type { FundingCaseAgreementCommitmentLineBalances } from '~~/shared/types/funding-case-agreement-ui'
import { formatAccountingDimensions } from '~~/shared/utils/accounting-dimensions'
import { formatMoneyText, parseMoney } from '~~/shared/utils/money'

const props = defineProps<{
  agreementId: string
  showCalculation?: boolean
  calculatorResult?: GcsPaymentAmountCalculatorResult | null
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
const disclosureItems = computed(() => [
  ...(props.showCalculation ? [{ label: t('agreement.payments.financial_inputs.calculation_details'), value: 'calculation', slot: 'calculation', icon: 'i-lucide-list' }] : []),
  { label: t('agreement.payments.financial_inputs.title'), value: 'inputs', slot: 'inputs', icon: 'i-lucide-wallet' },
  { label: t('agreement.payments.financial_inputs.line_balances'), value: 'balances', slot: 'balances', icon: 'i-lucide-list-tree' }
])
const money = (amount: string, currency: string) => formatMoneyText(parseMoney(amount), locale.value, currency.toUpperCase())
</script>

<template>
  <div class="space-y-4">
    <UAccordion
      :default-value="[]"
      type="multiple"
      :items="disclosureItems"
      :unmount-on-hide="false"
      :ui="{
        header: 'm-0',
        trigger: 'w-full px-0 py-3 text-left text-sm font-semibold text-highlighted transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/30',
        body: 'px-0 pb-3 pt-2',
        content: 'data-[state=open]:animate-none'
      }">
      <template #calculation-body>
        <p v-if="calculatorResult?.loading" role="status" class="text-sm text-muted">
          {{ t('common.loading') }}
        </p>
        <div v-else-if="calculatorResult?.explanation?.length" data-testid="payment-calculation-breakdown" class="grid gap-x-10 gap-y-6 text-sm sm:grid-cols-2">
          <section
            v-for="step in calculatorResult.explanation"
            :key="step.label"
            :class="step.emphasis ? 'sm:col-span-2' : ''"
            class="min-w-0">
            <h3 class="mb-3 font-semibold text-highlighted">
              {{ step.label }}
            </h3>
            <dl>
              <div v-for="row in step.rows" :key="row.label" :class="step.emphasis ? 'grid-cols-[minmax(0,1fr)_minmax(0,auto)]' : 'grid-cols-[1rem_minmax(0,1fr)_minmax(0,auto)]'" class="grid items-baseline gap-x-2 py-1.5">
                <span v-if="!step.emphasis" aria-hidden="true" class="text-muted tabular-nums">{{ row.operator }}</span>
                <dt class="min-w-0 break-words text-muted">
                  <span v-if="row.operator" class="sr-only">{{ row.operator }} </span>{{ row.label }}
                </dt>
                <dd class="min-w-0 text-right font-medium text-highlighted tabular-nums [overflow-wrap:anywhere]">
                  {{ row.value }}
                </dd>
              </div>
              <div data-testid="payment-calculation-total" :class="step.emphasis ? 'mt-3' : 'mt-1'" class="grid grid-cols-[minmax(0,1fr)_minmax(0,auto)] items-baseline gap-x-2 border-t border-default pt-3">
                <dt class="min-w-0 break-words font-semibold text-highlighted">
                  {{ step.total.label }}
                </dt>
                <dd :class="step.emphasis ? 'text-lg text-primary' : 'text-highlighted'" class="min-w-0 text-right font-semibold tabular-nums [overflow-wrap:anywhere]">
                  {{ step.total.value }}
                </dd>
              </div>
            </dl>
            <p v-if="step.note" class="mt-2 pl-6 text-xs leading-5 text-muted">
              {{ step.note }}
            </p>
          </section>
        </div>
        <dl v-else-if="calculatorResult?.details?.length" class="grid gap-4 text-sm sm:grid-cols-2">
          <div v-for="detail in calculatorResult.details" :key="detail.label">
            <dt class="text-muted">
              {{ detail.label }}
            </dt>
            <dd class="mt-1 font-medium tabular-nums">
              {{ money(detail.value, calculatorResult.currency ?? '') }}
            </dd>
          </div>
        </dl>
        <p v-else class="text-sm text-muted">
          {{ calculatorResult?.error || t('agreement.payments.financial_inputs.select_period') }}
        </p>
      </template>
      <template #inputs-body>
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
      </template>
      <template #balances-body>
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
      </template>
    </UAccordion>
    <UButton v-if="failed" :label="t('common.retry')" color="neutral" variant="ghost" @click="load" />
  </div>
</template>
