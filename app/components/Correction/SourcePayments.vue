<script setup lang="ts">
import type { TransferPaymentStreamChartOfAccountDimension } from '~~/shared/types/schemas/transfer-payment'
import { appRouteLocations } from '~/utils/route-locations'
import { formatMoneyText, parseMoneyText } from '~~/shared/utils/money'

const { sources, agreementId, canOpen = false } = defineProps<{
  sources: Array<{
    id: string
    egcs_fc_payment: string
    egcs_fc_evidence: {
      header: { egcs_fc_fiscalyeardisplay: string; egcs_fc_currency: string }
      allocations: Array<{
        egcs_fc_commitmentlinenumber: string | number
        egcs_fc_accountingdimensions: TransferPaymentStreamChartOfAccountDimension[]
        egcs_fc_amount: string | null
      }>
    }
  }>
  agreementId?: string
  canOpen?: boolean
}>()
const { t, locale } = useI18n()
const localePath = useLocalePath()
const amount = (value: string | null, currency: string) => value === null
  ? t('common.not_available')
  : formatMoneyText(parseMoneyText(value), locale.value, currency)
</script>

<template>
  <div class="space-y-6">
    <section v-for="source in sources" :key="source.id" class="min-w-0 rounded-lg border border-default">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-default p-4 sm:p-5">
        <h3 class="font-semibold">
          <ULink v-if="canOpen && agreementId" :to="localePath(appRouteLocations.agreementPaymentDetail(agreementId, source.egcs_fc_payment))">{{ t('correction.source_payment_reference', { reference: source.egcs_fc_payment }) }}</ULink>
          <span v-else>{{ t('correction.source_payment_reference', { reference: source.egcs_fc_payment }) }}</span>
        </h3>
        <span class="text-sm text-muted">{{ t('agreement.payments.fiscal_year') }}: {{ source.egcs_fc_evidence.header.egcs_fc_fiscalyeardisplay }} · {{ source.egcs_fc_evidence.header.egcs_fc_currency.toUpperCase() }}</span>
      </div>
      <div class="space-y-5 p-4 sm:p-5">
        <h4 class="text-sm font-semibold">
          {{ t('correction.source_allocations') }}
        </h4>
        <div v-for="(allocation, index) in source.egcs_fc_evidence.allocations" :key="index" class="space-y-4 border-t border-default pt-4">
          <div class="flex flex-wrap items-center justify-between gap-2 text-sm">
            <h5 class="font-medium">
              {{ t('correction.line_heading', { number: allocation.egcs_fc_commitmentlinenumber }) }}
            </h5>
            <span class="font-semibold tabular-nums">{{ amount(allocation.egcs_fc_amount, source.egcs_fc_evidence.header.egcs_fc_currency) }}</span>
          </div>
          <CorrectionAccountingDimensions :dimensions="allocation.egcs_fc_accountingdimensions" />
        </div>
      </div>
    </section>
    <p v-if="!sources.length" class="text-sm text-muted">
      {{ t('correction.no_sources') }}
    </p>
  </div>
</template>
