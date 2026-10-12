<script setup lang="ts">
import { computed } from 'vue'
import type { PaymentEvidence } from '~~/shared/types/payment-evidence'
import { formatMoneyText, parseMoneyText } from '~~/shared/utils/money'

const { agreementId, paymentId, evidence } = defineProps<{
  agreementId: string
  paymentId: string
  evidence: PaymentEvidence | null
}>()
const { t, locale } = useI18n()
const capturedAt = computed(() => evidence
  ? new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(evidence.capturedAt))
  : '')
const monthKeys = ['apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec', 'jan', 'feb', 'mar'] as const
const period = computed(() => evidence
  ? `${t(`agreement.payments.months.${monthKeys[evidence.selection.periodStart]}`)} – ${t(`agreement.payments.months.${monthKeys[evidence.selection.periodEnd]}`)}`
  : '')
</script>

<template>
  <div class="space-y-8" data-testid="payment-evidence">
    <div v-if="evidence" class="space-y-4">
      <p class="text-sm text-muted">
        {{ t('agreement.payments.evidence.captured', { date: capturedAt }) }}
      </p>
      <dl class="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt class="text-muted">
            {{ t('agreement.payments.type') }}
          </dt>
          <dd class="mt-1 font-medium">
            {{ t(`enums.payment_type.${evidence.selection.paymentType}`) }}
          </dd>
        </div>
        <div>
          <dt class="text-muted">
            {{ t('agreement.payments.fiscal_year') }}
          </dt>
          <dd class="mt-1 font-medium">
            {{ evidence.selection.fiscalYearDisplay }}
          </dd>
        </div>
        <div>
          <dt class="text-muted">
            {{ t('agreement.payments.period') }}
          </dt>
          <dd class="mt-1 font-medium">
            {{ period }}
          </dd>
        </div>
        <div>
          <dt class="text-muted">
            {{ t('agreement.payments.evidence.amount') }}
          </dt>
          <dd class="mt-1 font-medium tabular-nums">
            {{ formatMoneyText(parseMoneyText(evidence.selection.paymentAmount), locale, evidence.selection.currency.toUpperCase()) }}
          </dd>
        </div>
      </dl>
    </div>

    <ExtensionSlotHost
      slot-name="payment.evidence"
      subject="agreement"
      :context="{ kind: 'payment.evidence', agreementId, paymentId, ownerType: 'fundingcasepayment', ownerId: paymentId }">
      <template #loading>
        <p role="status" class="text-sm text-muted">
          {{ t('common.loading') }}
        </p>
      </template>
      <template #error="{ retry }">
        <UAlert color="error" icon="i-lucide-circle-alert" :title="t('agreement.payments.evidence.extension_error')">
          <template #actions>
            <UButton :label="t('common.retry')" color="error" variant="soft" @click="retry()" />
          </template>
        </UAlert>
      </template>
    </ExtensionSlotHost>

    <CommonSection :title="t('agreement.payments.financial_inputs.title')" :grid-cols="1" data-testid="payment-evidence-inputs">
      <AgreementPaymentFinancialInputValues v-if="evidence" :inputs="evidence.financialInputs" />
      <p v-else class="text-sm text-muted">
        {{ t('agreement.payments.evidence.unavailable') }}
      </p>
    </CommonSection>

    <CommonSection :title="t('agreement.payments.financial_inputs.line_balances')" :grid-cols="1" data-testid="payment-evidence-balances">
      <AgreementPaymentCommitmentBalances v-if="evidence" :balances="evidence.commitmentBalances" />
      <p v-else class="text-sm text-muted">
        {{ t('agreement.payments.evidence.unavailable') }}
      </p>
    </CommonSection>
  </div>
</template>
