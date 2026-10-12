<script setup lang="ts">
import type { FundingCaseAgreementCommitmentLineBalances } from '~~/shared/types/funding-case-agreement-ui'
import { formatAccountingDimensions } from '~~/shared/utils/accounting-dimensions'
import { formatMoneyText, parseMoneyText } from '~~/shared/utils/money'

const { balances } = defineProps<{ balances: FundingCaseAgreementCommitmentLineBalances }>()
const { t, locale } = useI18n()
const money = (amount: string, currency: string) => formatMoneyText(parseMoneyText(amount), locale.value, currency.toUpperCase())
</script>

<template>
  <div v-if="balances.lines.length" class="mt-3 space-y-4">
    <div v-for="line in balances.lines" :key="line.id" class="rounded-md border border-default p-3">
      <p class="text-sm font-medium">
        {{ t('agreement.payments.commitment_line_prefix') }} {{ line.egcs_fc_commitmentlinenumber }} · {{ line.fiscal_year_display }}
      </p>
      <p class="mt-1 break-words text-sm text-muted">
        {{ formatAccountingDimensions(line.accounting_dimensions ?? [], locale === 'fr' ? 'fr' : 'en') }}
      </p>
      <dl class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <dt class="text-sm text-muted">
            {{ t('agreement.commitments.committed') }}
          </dt><dd class="font-medium tabular-nums">
            {{ money(line.egcs_fc_amount, balances.currency) }}
          </dd>
        </div>
        <div>
          <dt class="text-sm text-muted">
            {{ t('agreement.commitments.paid') }}
          </dt><dd class="font-medium tabular-nums">
            {{ money(line.egcs_fc_paidamount, balances.currency) }}
          </dd>
        </div>
        <div>
          <dt class="text-sm text-muted">
            {{ t('agreement.commitments.balance') }}
          </dt><dd class="font-medium tabular-nums">
            {{ money(line.egcs_fc_balance, balances.currency) }}
          </dd>
        </div>
      </dl>
    </div>
  </div>
  <p v-else class="mt-3 text-sm text-muted">
    {{ t('agreement.commitments.no_lines') }}
  </p>
</template>
