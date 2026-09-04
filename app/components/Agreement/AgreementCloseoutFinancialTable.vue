<script setup lang="ts">
import type { CloseoutFinancialRow, CloseoutFinancialTotal } from '~~/shared/types/agreement-closeout'
import { formatMoneyText, type Money } from '~~/shared/utils/money'

const { rows = [], totals = [] } = defineProps<{
  rows?: CloseoutFinancialRow[]
  totals?: CloseoutFinancialTotal[]
}>()

const { t, locale } = useI18n()
const formatMoney = (value: Money, currency: string): string =>
  formatMoneyText(value, locale.value, currency.toUpperCase())
</script>

<template>
  <CommonTableSurface>
    <table class="min-w-full text-sm">
      <caption class="sr-only">
        {{ t('agreement.closeout.financial_situation') }}
      </caption>
      <thead class="bg-elevated text-left text-muted">
        <tr>
          <th class="px-4 py-3">
            {{ t('agreement.closeout.fiscal_year') }}
          </th>
          <th class="px-4 py-3">
            {{ t('common.currency') }}
          </th>
          <th class="px-4 py-3 text-right">
            {{ t('agreement.closeout.approved_claims') }}
          </th>
          <th class="px-4 py-3 text-right">
            {{ t('agreement.closeout.paid_payments') }}
          </th>
          <th class="px-4 py-3 text-right">
            {{ t('agreement.closeout.variance') }}
          </th>
          <th class="px-4 py-3">
            {{ t('common.status') }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="`${row.fiscalYearId}-${row.currency}`" class="border-t border-default">
          <td class="px-4 py-3">
            {{ row.fiscalYear }}
          </td>
          <td class="px-4 py-3 uppercase">
            {{ row.currency }}
          </td>
          <td class="px-4 py-3 text-right">
            {{ formatMoney(row.approvedClaimAmount, row.currency) }}
          </td>
          <td class="px-4 py-3 text-right">
            {{ formatMoney(row.paidAmount, row.currency) }}
          </td>
          <td class="px-4 py-3 text-right font-medium">
            {{ formatMoney(row.variance, row.currency) }}
          </td>
          <td class="px-4 py-3">
            {{ t(`agreement.closeout.financial_states.${row.state}`) }}
          </td>
        </tr>
        <tr v-if="rows.length === 0">
          <td colspan="6" class="px-4 py-8 text-center text-muted">
            {{ t('common.no_data') }}
          </td>
        </tr>
      </tbody>
      <tfoot v-if="totals.length" class="border-t-2 border-default bg-elevated font-semibold">
        <tr v-for="total in totals" :key="total.currency">
          <td class="px-4 py-3">
            {{ t('common.total') }}
          </td>
          <td class="px-4 py-3 uppercase">
            {{ total.currency }}
          </td>
          <td class="px-4 py-3 text-right">
            {{ formatMoney(total.approvedClaimAmount, total.currency) }}
          </td>
          <td class="px-4 py-3 text-right">
            {{ formatMoney(total.paidAmount, total.currency) }}
          </td>
          <td class="px-4 py-3 text-right">
            {{ formatMoney(total.variance, total.currency) }}
          </td>
          <td class="px-4 py-3">
            {{ t(`agreement.closeout.financial_states.${total.state}`) }}
          </td>
        </tr>
      </tfoot>
    </table>
  </CommonTableSurface>
</template>
