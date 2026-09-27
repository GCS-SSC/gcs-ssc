<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { useAgreementOverview } from '~/composables/useAgreementOverview'
import { formatMoneyText, parseMoney, sumMoney, type Money } from '~~/shared/utils/money'

type MonthlyAmounts = [Money, Money, Money, Money, Money, Money, Money, Money, Money, Money, Money, Money]
type Measure = 'forecast' | 'budget' | 'claimed' | 'reconciled'
type RowType = Measure | 'payments'
type FinancialLine = {
  id: string
  categoryNameEn: string
  categoryNameFr: string
  costSubsection: string | null
  nameEn: string
  nameFr: string
  description: string | null
  budget: Money
  forecast: MonthlyAmounts | null
  claimed: MonthlyAmounts
  reconciled: MonthlyAmounts
  currency: string
}
type FinancialPayment = {
  id: string
  month: number
  periodStart: number
  periodEnd: number
  amount: Money
  currency: string
}
type CurrencySummary = {
  currency: string
  lines: FinancialLine[]
  paid: MonthlyAmounts
  payments: FinancialPayment[]
}
type FinancialYear = {
  id: string
  label: string
  forecastSource: { status: 'active' | 'none', forecastId: string | null, version: string | null }
  currencies: CurrencySummary[]
}
type FinancialSummary = { fiscalYears: FinancialYear[] }

const MONTH_KEYS = ['apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec', 'jan', 'feb', 'mar'] as const
const MEASURES: Measure[] = ['forecast', 'budget', 'claimed', 'reconciled']
const ROW_TYPES: RowType[] = [...MEASURES, 'payments']
const MONTHS = Array.from({ length: 12 }, (_, index) => index)
const ZERO_MONEY = parseMoney('0')
const ROW_TONES: Record<RowType, { row: string, sticky: string, chip: string }> = {
  forecast: {
    row: 'bg-sky-50/60 dark:bg-sky-950/20',
    sticky: 'border-l-4 border-sky-500 bg-sky-50 dark:bg-sky-950/40',
    chip: 'border-sky-500/50 bg-sky-50 text-sky-800 dark:bg-sky-950/50 dark:text-sky-200'
  },
  budget: {
    row: 'bg-amber-50/60 dark:bg-amber-950/20',
    sticky: 'border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-950/40',
    chip: 'border-amber-500/50 bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200'
  },
  claimed: {
    row: 'bg-violet-50/60 dark:bg-violet-950/20',
    sticky: 'border-l-4 border-violet-500 bg-violet-50 dark:bg-violet-950/40',
    chip: 'border-violet-500/50 bg-violet-50 text-violet-800 dark:bg-violet-950/50 dark:text-violet-200'
  },
  reconciled: {
    row: 'bg-teal-50/60 dark:bg-teal-950/20',
    sticky: 'border-l-4 border-teal-500 bg-teal-50 dark:bg-teal-950/40',
    chip: 'border-teal-500/50 bg-teal-50 text-teal-800 dark:bg-teal-950/50 dark:text-teal-200'
  },
  payments: {
    row: 'bg-emerald-50/70 dark:bg-emerald-950/25',
    sticky: 'border-l-4 border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40',
    chip: 'border-emerald-500/50 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200'
  }
}

const { agreementId } = defineProps<{ agreementId: string }>()
const { t, locale } = useI18n()
const selectedYearId: Ref<string | null> = ref(null)
const visibleRowTypes: Ref<RowType[]> = ref([...ROW_TYPES])
const allMode: Ref<boolean> = ref(true)
const { overview, overviewStatus, refreshOverview } = useAgreementOverview<FinancialSummary>(
  computed(() => `/api/agreements/${agreementId}/financial-summary`)
)

watch(() => agreementId, () => {
  selectedYearId.value = null
  visibleRowTypes.value = [...ROW_TYPES]
  allMode.value = true
}, { flush: 'sync' })
watch(overview, nextSummary => {
  if (!nextSummary) return
  selectedYearId.value = nextSummary.fiscalYears.some(year => year.id === selectedYearId.value)
    ? selectedYearId.value
    : nextSummary.fiscalYears[0]?.id ?? null
})

const fiscalYearOptions = computed(() => (overview.value?.fiscalYears ?? []).map(year => ({
  id: year.id,
  label_en: year.label,
  label_fr: year.label
})))
const selectedYear = computed(() => overview.value?.fiscalYears.find(year => year.id === selectedYearId.value) ?? null)
const visibleMeasures = computed(() => MEASURES.filter(measure => visibleRowTypes.value.includes(measure)))
const showPayments = computed(() => visibleRowTypes.value.includes('payments'))
/**
 * Isolates one measure from All, then toggles individual measures.
 * @param type - Measure to isolate or toggle.
 */
const toggleRowType = (type: RowType) => {
  if (allMode.value) {
    allMode.value = false
    visibleRowTypes.value = [type]
    return
  }
  if (visibleRowTypes.value.includes(type)) {
    if (visibleRowTypes.value.length === 1) return
    visibleRowTypes.value = visibleRowTypes.value.filter(item => item !== type)
    return
  }
  visibleRowTypes.value = [...visibleRowTypes.value, type]
}
const showAllRowTypes = () => {
  allMode.value = true
  visibleRowTypes.value = [...ROW_TYPES]
}
const rowTypeLabel = (type: RowType): string => type === 'payments'
  ? t('agreement.financial_summary.payments')
  : t(`agreement.financial_summary.measures.${type}`)
const monthLabel = (month: number): string => {
  const key = MONTH_KEYS[month]
  return key ? t(`agreement.forecasts.months.${key}`) : t('common.unavailable')
}
const formatMoney = (value: Money, currency: string): string => formatMoneyText(value, locale.value, currency.toUpperCase())
const lineName = (line: FinancialLine): string => locale.value === 'fr'
  ? line.nameFr || line.nameEn
  : line.nameEn || line.nameFr
const categoryName = (line: FinancialLine): string => locale.value === 'fr'
  ? line.categoryNameFr || line.categoryNameEn
  : line.categoryNameEn || line.categoryNameFr
const monthAmount = (line: FinancialLine, measure: Measure, month: number): Money | null =>
  measure === 'budget' ? null : line[measure]?.[month] ?? null
const yearAmount = (line: FinancialLine, measure: Measure): Money | null =>
  measure === 'budget' ? line.budget : line[measure] ? sumMoney(line[measure]) : null
const displayMonthlyAmount = (value: Money | null, currency: string): string =>
  value === null || value === ZERO_MONEY ? t('agreement.financial_summary.not_allocated_short') : formatMoney(value, currency)
const displayYearAmount = (value: Money | null, currency: string): string =>
  value === null ? t('agreement.financial_summary.not_allocated_short') : formatMoney(value, currency)
const paidYearTotal = (group: CurrencySummary): Money => sumMoney(group.paid)
const paymentsInMonth = (group: CurrencySummary, month: number): FinancialPayment[] =>
  group.payments.filter(payment => payment.month === month)
const paymentPeriod = (payment: FinancialPayment): string =>
  `${monthLabel(payment.periodStart)}–${monthLabel(payment.periodEnd)}`
const forecastSourceLabel = (source: FinancialYear['forecastSource']): string => {
  const status = t(`agreement.financial_summary.forecast_source.${source.status}`)
  return source.version ? `${status} · ${t('agreement.financial_summary.forecast_version', { version: source.version })}` : status
}
</script>

<template>
  <section data-testid="agreement-financial-summary" class="space-y-6">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div class="space-y-1">
        <h2 class="text-xl font-semibold text-highlighted">
          {{ t('agreement.financial_summary.title') }}
        </h2>
      </div>
      <div v-if="overview?.fiscalYears.length" class="w-full shrink-0 sm:w-52">
        <label for="financial-summary-year" class="mb-1.5 block text-sm font-medium text-highlighted">
          {{ t('agreement.financial_summary.fiscal_year') }}
        </label>
        <CommonBilingualSelectMenu
          id="financial-summary-year"
          v-model="selectedYearId"
          data-testid="financial-summary-year-select"
          :items="fiscalYearOptions"
          value-key="id"
          label-en-key="label_en"
          label-fr-key="label_fr"
          :aria-label="t('agreement.financial_summary.fiscal_year')" />
      </div>
    </div>

    <div v-if="overviewStatus === 'pending' && !overview" role="status" aria-live="polite" class="flex min-h-32 items-center justify-center gap-2 text-sm text-muted">
      <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" aria-hidden="true" />
      <span>{{ t('common.loading_records') }}</span>
    </div>
    <UAlert
      v-else-if="overviewStatus === 'error'"
      color="error"
      icon="i-lucide-circle-alert"
      :title="t('agreement.financial_summary.load_failed')"
      :description="t('common.resource_table_load_failed_description')">
      <template #actions>
        <UButton color="error" variant="soft" icon="i-lucide-refresh-cw" :label="t('common.retry')" @click="() => { void refreshOverview() }" />
      </template>
    </UAlert>
    <div v-else-if="overviewStatus === 'success' && !selectedYear" class="rounded-xl border border-dashed border-default px-6 py-10 text-center text-sm text-muted">
      {{ t('agreement.financial_summary.no_fiscal_years') }}
    </div>
    <template v-else-if="selectedYear">
      <p class="text-sm text-muted">
        {{ t('agreement.financial_summary.grid_note') }}
      </p>
      <div class="flex flex-wrap items-center gap-2" role="group" :aria-label="t('agreement.financial_summary.filter_title')" data-testid="financial-summary-filters">
        <span class="mr-1 text-xs font-medium text-muted">{{ t('agreement.financial_summary.filter_title') }}</span>
        <button type="button" class="rounded-md border border-default px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary" :class="allMode ? 'bg-elevated text-highlighted' : 'text-muted hover:bg-elevated'" :aria-pressed="allMode" data-testid="financial-summary-filter-all" @click="showAllRowTypes">
          {{ t('agreement.financial_summary.show_all') }}
        </button>
        <button
          v-for="type in ROW_TYPES"
          :key="type"
          type="button"
          class="rounded-md border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary"
          :class="visibleRowTypes.includes(type) ? ROW_TONES[type].chip : 'border-default bg-default text-muted hover:bg-elevated'"
          :aria-pressed="visibleRowTypes.includes(type)"
          :aria-label="allMode ? t('agreement.financial_summary.show_only', { measure: rowTypeLabel(type) }) : rowTypeLabel(type)"
          :disabled="!allMode && visibleRowTypes.length === 1 && visibleRowTypes.includes(type)"
          :data-testid="`financial-summary-filter-${type}`"
          @click="toggleRowType(type)">
          {{ rowTypeLabel(type) }}
        </button>
      </div>
      <div v-if="selectedYear.currencies.length === 0" class="rounded-xl border border-dashed border-default px-6 py-10 text-center text-sm text-muted">
        {{ t('agreement.financial_summary.no_financial_data') }}
      </div>
      <section v-for="group in selectedYear.currencies" :key="group.currency" class="space-y-3" data-testid="financial-summary-grid">
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-default pb-2">
          <h3 class="text-base font-semibold text-highlighted">
            {{ t('agreement.financial_summary.currency_heading', { currency: group.currency.toUpperCase() }) }}
          </h3>
          <UBadge v-if="visibleRowTypes.includes('forecast')" color="neutral" variant="soft" :label="forecastSourceLabel(selectedYear.forecastSource)" />
        </div>
        <p class="flex items-center gap-1.5 text-xs text-muted">
          <UIcon name="i-lucide-move-horizontal" class="size-4 shrink-0" aria-hidden="true" />
          {{ t('agreement.financial_summary.scroll_hint') }}
        </p>
        <CommonTableSurface>
          <table class="w-full min-w-max border-separate border-spacing-0 text-sm">
            <caption class="sr-only">
              {{ t('agreement.financial_summary.grid_caption', { year: selectedYear.label, currency: group.currency.toUpperCase() }) }}
            </caption>
            <thead class="text-muted">
              <tr class="bg-elevated">
                <th scope="col" rowspan="2" class="sticky left-0 z-30 w-24 min-w-24 border-b border-default bg-elevated px-2 py-3 text-left font-medium sm:w-56 sm:min-w-56 sm:px-3">
                  {{ t('agreement.financial_summary.budget_line') }}
                </th>
                <th scope="col" rowspan="2" class="sticky left-24 z-30 w-20 min-w-20 border-b border-default bg-elevated px-2 py-3 text-left text-xs font-medium sm:left-56 sm:w-28 sm:min-w-28 sm:px-3 sm:text-sm">
                  {{ t('agreement.financial_summary.measure') }}
                </th>
                <th v-for="quarter in 4" :key="quarter" scope="colgroup" colspan="3" class="border-b border-l border-default px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide">
                  {{ t(`agreement.forecasts.quarters.q${quarter}`) }}
                </th>
                <th scope="col" rowspan="2" class="min-w-36 border-b border-l border-default px-3 py-3 text-right font-medium">
                  {{ t('agreement.financial_summary.year_total') }}
                </th>
              </tr>
              <tr class="bg-elevated">
                <th v-for="month in MONTHS" :key="month" scope="col" class="min-w-32 border-b border-l border-default px-3 py-2 text-right text-xs font-medium uppercase tracking-wide">
                  {{ monthLabel(month) }}
                </th>
              </tr>
            </thead>
            <tbody v-for="line in visibleMeasures.length ? group.lines : []" :key="line.id">
              <tr v-for="(measure, index) in visibleMeasures" :key="measure" data-testid="financial-summary-line-row" :data-measure="measure" :class="ROW_TONES[measure].row">
                <th v-if="index === 0" scope="rowgroup" :rowspan="visibleMeasures.length" class="sticky left-0 z-20 w-24 min-w-24 border-b border-t border-default bg-default px-2 py-3 text-left align-top sm:w-56 sm:min-w-56 sm:px-3">
                  <span v-if="categoryName(line)" class="block break-words text-[10px] font-medium uppercase tracking-wide text-muted">{{ categoryName(line) }}</span>
                  <span v-if="line.costSubsection" class="mt-1 block break-words text-xs font-normal text-muted">{{ line.costSubsection }}</span>
                  <span class="mt-1 block break-words font-semibold text-highlighted">{{ lineName(line) }}</span>
                </th>
                <th scope="row" class="sticky left-24 z-20 w-20 min-w-20 break-words border-t border-default px-2 py-2 text-left text-[11px] font-semibold sm:left-56 sm:w-28 sm:min-w-28 sm:px-3 sm:text-xs" :class="ROW_TONES[measure].sticky">
                  {{ t(`agreement.financial_summary.measures.${measure}`) }}
                </th>
                <td v-for="month in MONTHS" :key="month" class="border-t border-l border-default px-3 py-2 text-right tabular-nums" :class="measure === 'budget' ? 'text-muted' : 'text-highlighted'">
                  <span v-if="monthAmount(line, measure, month) === ZERO_MONEY">
                    <span aria-hidden="true">{{ t('agreement.financial_summary.not_allocated_short') }}</span>
                    <span class="sr-only">{{ formatMoney(ZERO_MONEY, group.currency) }}</span>
                  </span>
                  <span v-else>{{ displayMonthlyAmount(monthAmount(line, measure, month), group.currency) }}</span>
                </td>
                <td class="border-t border-l border-default px-3 py-2 text-right font-semibold tabular-nums text-highlighted">
                  {{ displayYearAmount(yearAmount(line, measure), group.currency) }}
                </td>
              </tr>
            </tbody>
            <tbody v-if="group.lines.length === 0 && visibleMeasures.length > 0">
              <tr>
                <td colspan="15" class="px-4 py-8 text-center text-muted">
                  {{ t('agreement.financial_summary.no_lines') }}
                </td>
              </tr>
            </tbody>
            <tfoot v-if="showPayments">
              <tr data-testid="financial-summary-payment-row" :class="ROW_TONES.payments.row">
                <th scope="row" colspan="2" class="sticky left-0 z-20 border-t-2 border-default px-3 py-3 text-left" :class="ROW_TONES.payments.sticky">
                  <span class="block font-semibold text-highlighted">{{ t('agreement.financial_summary.payments') }}</span>
                  <span class="block text-xs font-normal text-muted">{{ t('agreement.financial_summary.lump_sum_note') }}</span>
                </th>
                <td v-for="month in MONTHS" :key="month" class="border-t-2 border-l border-default px-3 py-3 text-right align-top tabular-nums">
                  <span class="font-semibold text-highlighted">{{ displayMonthlyAmount(group.paid[month] as Money, group.currency) }}</span>
                  <details v-if="paymentsInMonth(group, month).length > 0" class="mt-1 text-left text-xs text-muted">
                    <summary class="cursor-pointer whitespace-nowrap">
                      {{ t(paymentsInMonth(group, month).length === 1 ? 'agreement.financial_summary.payment_count_one' : 'agreement.financial_summary.payment_count', { count: paymentsInMonth(group, month).length }) }}
                    </summary>
                    <ul class="mt-1 space-y-1">
                      <li v-for="payment in paymentsInMonth(group, month)" :key="payment.id" class="whitespace-nowrap">
                        {{ paymentPeriod(payment) }}: {{ formatMoney(payment.amount, group.currency) }}
                      </li>
                    </ul>
                  </details>
                </td>
                <td class="border-t-2 border-l border-default px-3 py-3 text-right font-bold tabular-nums text-primary">
                  {{ formatMoney(paidYearTotal(group), group.currency) }}
                </td>
              </tr>
            </tfoot>
          </table>
        </CommonTableSurface>
      </section>
    </template>
  </section>
</template>
