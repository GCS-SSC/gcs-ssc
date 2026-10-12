<script setup lang="ts">
import { computed } from 'vue'
import type { GcsExtensionPaymentCalculationResult } from '@gcs-ssc/extensions/server'
import { formatMoneyText, parseMoneyText } from '~~/shared/utils/money'

const { inputs } = defineProps<{ inputs: GcsExtensionPaymentCalculationResult }>()
const { t, locale } = useI18n()
const financialRows = computed<[string, string][]>(() => [
  ['agreement.payments.financial_inputs.commitment_remaining', inputs.commitmentRemaining],
  ['agreement.payments.financial_inputs.payments_to_date', inputs.totalPaymentsToDate],
  ['agreement.payments.financial_inputs.credit_memos', inputs.totalCreditMemos],
  ['agreement.payments.financial_inputs.reconciled_credit_memos', inputs.totalCreditMemosForReconciledPeriods],
  ['agreement.payments.financial_inputs.claims_to_last_claim_month', inputs.totalClaimsToLastClaimMonth],
  ['agreement.payments.financial_inputs.forecast_to_last_claim_month', inputs.totalForecastToLastClaimMonth],
  ['agreement.payments.financial_inputs.forecast_to_period_end', inputs.totalForecastToPeriodEnd],
  ['agreement.payments.financial_inputs.available_before_holdback', inputs.availableForDisbursementBeforeHoldback],
  ['agreement.payments.financial_inputs.agreement_total', inputs.agreementTotal],
  ['agreement.payments.financial_inputs.final_fiscal_year_total', inputs.finalFiscalYearTotal]
])
const money = (amount: string, currency: string) => formatMoneyText(parseMoneyText(amount), locale.value, currency.toUpperCase())
</script>

<template>
  <dl class="mt-3 grid gap-4 sm:grid-cols-2">
    <div v-for="[label, amount] in financialRows" :key="label" class="min-w-0">
      <dt class="text-sm text-muted">
        {{ t(label) }}
      </dt>
      <dd class="mt-1 min-w-0 font-medium tabular-nums [overflow-wrap:anywhere]">
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
