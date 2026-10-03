<script setup lang="ts">
import { computed } from 'vue'
import type { TransferPaymentStreamChartOfAccountDimension } from '~~/shared/types/schemas/transfer-payment'
import { formatAccountingDimension } from '~~/shared/utils/accounting-dimensions'
import { formatMoneyText, parseMoneyText, sumMoney } from '~~/shared/utils/money'

const { line, currency, correctedPaid, remaining, invalid = false } = defineProps<{
  line: {
    egcs_fc_commitmentlinenumber: string | number
    egcs_fc_fiscalyeardisplay: string
    egcs_fc_accountingdimensions: TransferPaymentStreamChartOfAccountDimension[]
    egcs_fc_originalpaid: string | null
    egcs_fc_jveffect: string | null
    egcs_fc_priorcorrections: string | null
    egcs_fc_arrecoveries?: string | null
    egcs_fc_adjustment: string | null
    egcs_fc_commitmentamount: string | null
  }
  currency: string
  correctedPaid: string | null
  remaining: string | null
  invalid?: boolean
}>()
const { t, locale } = useI18n()
const primaryCoding = computed(() => {
  const dimension = line.egcs_fc_accountingdimensions[0]
  return dimension ? formatAccountingDimension(dimension, locale.value === 'fr' ? 'fr' : 'en') : t('common.not_available')
})
const recordedPaid = computed(() => {
  const components = [line.egcs_fc_originalpaid, line.egcs_fc_jveffect, line.egcs_fc_priorcorrections, line.egcs_fc_arrecoveries ?? '0.00']
  return components.every(value => value !== null) ? sumMoney(components.map(value => parseMoneyText(value!))) : null
})
const amount = (value: string | null) => value === null
  ? t('common.not_available')
  : formatMoneyText(parseMoneyText(value), locale.value, currency)
</script>

<template>
  <section class="min-w-0 rounded-lg border border-default" :aria-label="t('correction.line_heading', { number: line.egcs_fc_commitmentlinenumber })">
    <div class="space-y-4 p-4 sm:p-5">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div class="min-w-0">
          <h3 class="font-semibold">
            {{ t('correction.line_heading', { number: line.egcs_fc_commitmentlinenumber }) }}
          </h3>
          <p class="mt-1 text-sm text-muted [overflow-wrap:anywhere]">
            {{ primaryCoding }}
          </p>
        </div>
        <span class="text-sm text-muted">{{ t('agreement.payments.fiscal_year') }}: {{ line.egcs_fc_fiscalyeardisplay }}</span>
      </div>
      <details v-if="line.egcs_fc_accountingdimensions.length" class="group">
        <summary class="flex cursor-default items-center gap-2 text-sm text-muted">
          <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0 transition-transform group-open:rotate-90" aria-hidden="true" />
          {{ t('correction.coding_details') }}
        </summary>
        <CorrectionAccountingDimensions :dimensions="line.egcs_fc_accountingdimensions" class="mt-4" />
      </details>
      <dl class="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2 2xl:grid-cols-4">
        <div>
          <dt class="text-muted">
            {{ t('correction.original_paid') }}
          </dt>
          <dd class="mt-1 tabular-nums">
            {{ amount(line.egcs_fc_originalpaid) }}
          </dd>
        </div>
        <div>
          <dt class="text-muted">
            {{ t('correction.jv_effect') }}
          </dt>
          <dd class="mt-1 tabular-nums">
            {{ amount(line.egcs_fc_jveffect) }}
          </dd>
        </div>
        <div>
          <dt class="text-muted">
            {{ t('correction.prior_corrections') }}
          </dt>
          <dd class="mt-1 tabular-nums">
            {{ amount(line.egcs_fc_priorcorrections) }}
          </dd>
        </div>
        <div v-if="line.egcs_fc_arrecoveries && line.egcs_fc_arrecoveries !== '0.00'">
          <dt class="text-muted">
            {{ t('agreement.financial_summary.ar_recoveries') }}
          </dt>
          <dd class="mt-1 tabular-nums">
            {{ amount(line.egcs_fc_arrecoveries) }}
          </dd>
        </div>
        <div>
          <dt class="text-muted">
            {{ t('correction.recorded_paid') }}
          </dt>
          <dd class="mt-1 font-semibold tabular-nums">
            {{ amount(recordedPaid) }}
          </dd>
        </div>
      </dl>
    </div>
    <div class="grid gap-4 border-t border-default bg-elevated/50 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3">
      <div class="min-w-0">
        <slot name="adjustment">
          <dl class="text-sm">
            <dt class="text-muted">
              {{ t('correction.adjustment') }}
            </dt>
            <dd class="mt-1 font-semibold tabular-nums">
              {{ amount(line.egcs_fc_adjustment) }}
            </dd>
          </dl>
        </slot>
      </div>
      <dl class="text-sm">
        <dt class="text-muted">
          {{ t('correction.corrected_paid') }}
        </dt>
        <dd class="mt-1 font-semibold tabular-nums" :class="invalid ? 'text-error' : ''">
          {{ amount(correctedPaid) }}
        </dd>
      </dl>
      <dl class="text-sm">
        <dt class="text-muted">
          {{ t('correction.remaining') }}
        </dt>
        <dd class="mt-1 font-semibold tabular-nums">
          {{ amount(remaining) }}
        </dd>
        <dt class="mt-2 text-xs text-muted">
          {{ t('correction.commitment_amount') }}
        </dt>
        <dd class="mt-1 text-xs tabular-nums">
          {{ amount(line.egcs_fc_commitmentamount) }}
        </dd>
      </dl>
    </div>
  </section>
</template>
