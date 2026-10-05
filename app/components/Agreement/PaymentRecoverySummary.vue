<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import type { AccountReceivablePaymentCreditMemo } from '~~/shared/types/account-receivable'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { hasPaymentOffset } from '~/utils/payment-offset-display'
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
  egcs_fc_creditmemos?: AccountReceivablePaymentCreditMemo[]
} }>()
const { t, locale } = useI18n()
const amount = (value: string | undefined) => formatAccountReceivableAmount(value, locale.value, payment.egcs_fc_currency) ?? t('common.not_available')
const totals = computed(() => [
  { label: 'agreement.payments.gross', value: payment.egcs_fc_grossamount ?? payment.egcs_fc_paymentamount },
  ...(hasPaymentOffset(payment.egcs_fc_offsetamount)
    ? [{ label: 'agreement.payments.offset', value: payment.egcs_fc_offsetamount }]
    : []),
  { label: 'agreement.payments.net', value: payment.egcs_fc_netamount ?? payment.egcs_fc_paymentamount }
])
const pagination: Ref<{ pageIndex: number, pageSize: number }> = ref({ pageIndex: 0, pageSize: 10 })
const memoColumns: TableColumnInput<AccountReceivablePaymentCreditMemo>[] = [
  { id: 'reference', headerKey: 'account_receivable.credit_memos_number' },
  { id: 'original', headerKey: 'account_receivable.offset_plan_amount' },
  { id: 'deduction', headerKey: 'account_receivable.payment_deduction' },
  { id: 'remaining', headerKey: 'account_receivable.credit_memo_remaining' },
  { id: 'available', headerKey: 'account_receivable.credit_memo_available' }
]
</script>

<template>
  <section :aria-label="t('agreement.payments.recovery_summary')" class="space-y-4">
    <UAlert v-if="payment.egcs_fc_recoverycontrol === 'direct_repayment_hold'" color="warning" icon="i-lucide-lock-keyhole" :title="t('agreement.payments.hold_title')" :description="t('agreement.payments.hold_description')" />
    <p v-if="!payment.egcs_fc_creditmemos?.length && payment.egcs_fc_creditmemoreference" class="text-sm font-semibold">
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
    <CommonResourceLayoutCard
      v-if="payment.egcs_fc_creditmemos?.length"
      v-model:pagination="pagination"
      :data="payment.egcs_fc_creditmemos" :columns="memoColumns"
      :total-records="payment.egcs_fc_creditmemos.length"
      :show-toolbar="false" :pagination-options="{ manualPagination: false }"
      data-testid="payment-credit-memos">
      <template #reference-cell="{ row }">
        <div class="flex flex-col items-start gap-1">
          <span class="text-sm font-semibold">{{ row.original.egcs_fc_creditmemoreference }}</span>
          <CommonStatusBadge :label="t(`account_receivable.recovery_outcomes.${row.original.egcs_fc_outcome}`)" />
        </div>
      </template>
      <template #original-cell="{ row }">
        <span class="tabular-nums">{{ amount(row.original.egcs_fc_amount) }}</span>
      </template>
      <template #deduction-cell="{ row }">
        <span class="font-semibold tabular-nums">{{ amount(row.original.egcs_fc_appliedamount) }}</span>
      </template>
      <template #remaining-cell="{ row }">
        <span class="tabular-nums">{{ amount(row.original.egcs_fc_remainingamount) }}</span>
      </template>
      <template #available-cell="{ row }">
        <span class="tabular-nums">{{ amount(row.original.egcs_fc_availableamount) }}</span>
      </template>
    </CommonResourceLayoutCard>
    <ul v-else-if="payment.egcs_fc_offsets?.length" :aria-label="t('agreement.payments.offset_allocations')" class="divide-y divide-default text-sm">
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
