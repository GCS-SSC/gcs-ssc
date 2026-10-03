<script setup lang="ts">
import type { AccountReceivableLine } from '~~/shared/types/account-receivable'
import { formatAccountReceivableAmount } from '~/utils/account-receivable-display'

const { lines, currency } = defineProps<{ lines: AccountReceivableLine[], currency: string }>()
const { t, locale } = useI18n()
const monthKeys = ['apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec', 'jan', 'feb', 'mar'] as const
const period = (line: AccountReceivableLine) => `${t(`agreement.payments.months.${monthKeys[line.egcs_fc_periodstart]}`)} – ${t(`agreement.payments.months.${monthKeys[line.egcs_fc_periodend]}`)}`
const amount = (value: string) => formatAccountReceivableAmount(value, locale.value, currency) ?? t('common.not_available')
</script>

<template>
  <div class="space-y-6">
    <article v-for="(line, index) in lines" :key="line.id" class="space-y-4 border-t border-default pt-4 first:border-t-0 first:pt-0">
      <div class="flex flex-wrap justify-between gap-2 text-sm">
        <h3 class="font-semibold">
          {{ t('account_receivable.source_line', { number: index + 1 }) }}
        </h3><span class="text-muted">{{ period(line) }}</span>
      </div>
      <dl class="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt class="text-muted">
            {{ t('account_receivable.source_kind') }}
          </dt><dd>{{ t(line.egcs_fc_claim ? 'account_receivable.source_claim' : 'account_receivable.source_advance') }}</dd>
        </div>
        <div>
          <dt class="text-muted">
            {{ t('account_receivable.source_basis') }}
          </dt><dd>{{ amount(line.egcs_fc_sourceamount) }}</dd>
        </div>
      </dl>
      <div v-for="coding in line.egcs_fc_coding" :key="coding.id" class="space-y-2 border-l-2 border-default pl-4">
        <CorrectionAccountingDimensions :dimensions="coding.egcs_fc_accountingdimensions" />
        <p class="text-sm text-muted">
          {{ t('account_receivable.retained_paid') }}: {{ amount(coding.egcs_fc_paidbasis) }}
        </p>
      </div>
      <slot name="amount" :line="line" :index="index" />
    </article>
  </div>
</template>
