<script setup lang="ts">
import { computed } from 'vue'
import { formatAccountReceivableAmount } from '~/utils/account-receivable-display'

const { payment } = defineProps<{ payment: {
  egcs_fc_paymentamount: string
  egcs_fc_grossamount?: string
  egcs_fc_creditmemoreference?: string | null
  egcs_fc_currency: string
  egcs_fc_offsetamount?: string
  egcs_fc_netamount?: string
  egcs_fc_recoverycontrol?: 'allowed' | 'direct_repayment_hold' | 'recovery_pending'
  egcs_fc_offsets?: Array<{ egcs_fc_number: string, egcs_fc_amount: string }>
} }>()
const { t, locale } = useI18n()
const amount = (value: string | undefined) => formatAccountReceivableAmount(value, locale.value, payment.egcs_fc_currency) ?? t('common.not_available')
const totals = computed(() => [
  { label: 'agreement.payments.gross', value: payment.egcs_fc_grossamount ?? payment.egcs_fc_paymentamount },
  { label: 'agreement.payments.offset', value: payment.egcs_fc_offsetamount ?? '0.00' },
  { label: 'agreement.payments.net', value: payment.egcs_fc_netamount ?? payment.egcs_fc_paymentamount }
])
</script>

<template>
  <section :aria-label="t('agreement.payments.recovery_summary')" class="space-y-4">
    <UAlert v-if="payment.egcs_fc_recoverycontrol === 'direct_repayment_hold'" color="warning" icon="i-lucide-lock-keyhole" :title="t('agreement.payments.hold_title')" :description="t('agreement.payments.hold_description')" />
    <p v-if="payment.egcs_fc_creditmemoreference" class="text-sm font-semibold">
      {{ payment.egcs_fc_creditmemoreference }}
    </p>
    <dl class="grid gap-4 border-y border-default py-4 text-sm sm:grid-cols-3">
      <div v-for="total in totals" :key="total.label">
        <dt class="text-muted">
          {{ t(total.label) }}
        </dt><dd class="mt-1 font-semibold">
          {{ amount(total.value) }}
        </dd>
      </div>
    </dl>
    <p v-if="payment.egcs_fc_recoverycontrol === 'recovery_pending'" class="text-sm text-muted">
      {{ t('agreement.payments.offset_reserved') }}
    </p>
    <ul v-if="payment.egcs_fc_offsets?.length" :aria-label="t('agreement.payments.offset_allocations')" class="divide-y divide-default text-sm">
      <li v-for="(allocation, index) in payment.egcs_fc_offsets" :key="`${allocation.egcs_fc_number}:${index}`" class="flex flex-wrap justify-between gap-3 py-3">
        <span>{{ t('account_receivable.offset_reference', { number: allocation.egcs_fc_number }) }}</span>
        <span class="font-semibold">{{ amount(allocation.egcs_fc_amount) }}</span>
      </li>
    </ul>
    <p class="text-sm text-muted">
      {{ t('agreement.payments.offset_policy_description') }}
    </p>
  </section>
</template>
