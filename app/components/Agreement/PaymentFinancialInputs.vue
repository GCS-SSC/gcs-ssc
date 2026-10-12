<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { GcsPaymentAmountCalculatorResult } from '@gcs-ssc/extensions/ui'
import type { GcsExtensionPaymentCalculationResult } from '@gcs-ssc/extensions/server'
import type { FundingCaseAgreementCommitmentLineBalances } from '~~/shared/types/funding-case-agreement-ui'
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
        <CommonPaymentCalculationBreakdown
          v-else-if="calculatorResult?.explanation?.length"
          :explanation="calculatorResult.explanation" />
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
        <AgreementPaymentFinancialInputValues v-else-if="inputs" :inputs="inputs" />
      </template>
      <template #balances-body>
        <p v-if="!commitmentType || !fiscalYear" class="mt-3 text-sm text-muted">
          {{ t('agreement.payments.financial_inputs.select_year') }}
        </p>
        <p v-else-if="loading" role="status" class="mt-3 text-sm text-muted">
          {{ t('common.loading') }}
        </p>
        <AgreementPaymentCommitmentBalances v-else-if="balances" :balances="balances" />
      </template>
    </UAccordion>
    <UButton v-if="failed" :label="t('common.retry')" color="neutral" variant="ghost" @click="load" />
  </div>
</template>
