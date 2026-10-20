<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import type { AccountReceivableOffsetMemoLine, AccountReceivablePaymentCreditMemo } from '~~/shared/types/account-receivable'
import { TransferPaymentStreamChartOfAccountDimensionSchema } from '~~/shared/types/schemas/transfer-payment'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { hasPaymentOffset } from '~/utils/payment-offset-display'
import { formatAccountReceivableAmount } from '~/utils/account-receivable-display'
import { useBilingualValue } from '~/composables/useBilingualValue'

const { payment } = defineProps<{ payment: {
  egcs_fc_paymentamount: string
  egcs_fc_grossamount?: string
  egcs_fc_currency: string
  egcs_fc_offsetamount?: string
  egcs_fc_netamount?: string
  egcs_fc_recoverycontrol?: 'allowed' | 'direct_repayment_hold' | 'recovery_pending'
  egcs_fc_creditmemos?: AccountReceivablePaymentCreditMemo[]
} }>()
const { t, locale } = useI18n()
const { getBilingualValue } = useBilingualValue()
const amount = (value: string | undefined) => formatAccountReceivableAmount(value, locale.value, payment.egcs_fc_currency) ?? t('common.not_available')
const dimensions = (line: AccountReceivableOffsetMemoLine) => TransferPaymentStreamChartOfAccountDimensionSchema.array().parse(line.egcs_fc_creditmemoaccountingdimensions)
const codedMemos = computed(() => payment.egcs_fc_creditmemos?.filter(memo => memo.egcs_fc_codinglines?.length) ?? [])
const showMemoBalances = computed(() => Boolean(payment.egcs_fc_creditmemos?.length) && payment.egcs_fc_creditmemos!.every(memo =>
  [memo.egcs_fc_receivablerecovered, memo.egcs_fc_receivablereserved, memo.egcs_fc_receivableoutstanding, memo.egcs_fc_receivableavailable]
    .every(value => typeof value === 'string')))
const totals = computed(() => [
  { label: 'agreement.payments.gross', value: payment.egcs_fc_grossamount ?? payment.egcs_fc_paymentamount },
  ...(hasPaymentOffset(payment.egcs_fc_offsetamount)
    ? [{ label: 'agreement.payments.offset', value: payment.egcs_fc_offsetamount }]
    : []),
  { label: 'agreement.payments.net', value: payment.egcs_fc_netamount ?? payment.egcs_fc_paymentamount }
])
const pagination: Ref<{ pageIndex: number, pageSize: number }> = ref({ pageIndex: 0, pageSize: 10 })
const memoColumns = computed<TableColumnInput<AccountReceivablePaymentCreditMemo>[]>(() => [
  { id: 'reference', headerKey: 'account_receivable.credit_memos_number' },
  { id: 'original', headerKey: 'account_receivable.credit_memo_amount' },
  { id: 'deduction', headerKey: 'account_receivable.payment_deduction' },
  ...(showMemoBalances.value
    ? [
        { id: 'collected', headerKey: 'account_receivable.memo_ar_collected' },
        { id: 'pending', headerKey: 'account_receivable.memo_ar_pending' },
        { id: 'remaining', headerKey: 'account_receivable.memo_ar_outstanding' },
        { id: 'available', headerKey: 'account_receivable.memo_ar_available' }
      ]
    : [])
])
</script>

<template>
  <section :aria-label="t('agreement.payments.recovery_summary')" class="space-y-4">
    <UAlert v-if="payment.egcs_fc_recoverycontrol === 'direct_repayment_hold'" color="warning" icon="i-lucide-lock-keyhole" :title="t('agreement.payments.hold_title')" :description="t('agreement.payments.hold_description')" />
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
      <template #collected-cell="{ row }">
        <span class="tabular-nums">{{ amount(row.original.egcs_fc_receivablerecovered) }}</span>
      </template>
      <template #pending-cell="{ row }">
        <span class="tabular-nums">{{ amount(row.original.egcs_fc_receivablereserved) }}</span>
      </template>
      <template #remaining-cell="{ row }">
        <span class="tabular-nums">{{ amount(row.original.egcs_fc_receivableoutstanding) }}</span>
      </template>
      <template #available-cell="{ row }">
        <span class="tabular-nums">{{ amount(row.original.egcs_fc_receivableavailable) }}</span>
      </template>
    </CommonResourceLayoutCard>
    <p v-if="showMemoBalances" class="text-sm text-muted">
      {{ t('account_receivable.memo_ar_balance_description') }}
    </p>
    <CommonSection v-if="codedMemos.length" :title="t('agreement.payments.offset_coding_title')" :grid-cols="1" data-testid="payment-offset-coding">
      <section v-for="memo in codedMemos" :key="memo.id" :aria-label="memo.egcs_fc_creditmemoreference" class="space-y-3">
        <h4 class="text-sm font-semibold">
          {{ memo.egcs_fc_creditmemoreference }}
        </h4>
        <dl v-for="line in memo.egcs_fc_codinglines" :key="line.id" class="grid gap-4 border-t border-default pt-3 text-sm sm:grid-cols-2" data-testid="payment-offset-coding-line">
          <div>
            <dt class="text-muted">
              {{ t('account_receivable.credit_memo_line_number') }}
            </dt>
            <dd>{{ line.egcs_fc_linenumber }}</dd>
          </div>
          <div>
            <dt class="text-muted">
              {{ t('account_receivable.credit_memo_amount') }}
            </dt>
            <dd class="font-semibold tabular-nums">
              {{ amount(line.egcs_fc_amount) }}
            </dd>
          </div>
          <div v-for="(dimension, index) in dimensions(line)" :key="index">
            <dt class="text-muted">
              {{ getBilingualValue(dimension, 'label', t('common.none')) }}
            </dt>
            <dd>{{ dimension.value }}</dd>
          </div>
        </dl>
      </section>
    </CommonSection>
    <p v-if="payment.egcs_fc_creditmemos?.length" class="text-sm text-muted" data-testid="payment-offset-approval-description">
      {{ t('agreement.payments.offset_approval_description') }}
    </p>
    <p class="text-sm text-muted">
      {{ t('agreement.payments.offset_policy_description') }}
    </p>
  </section>
</template>
