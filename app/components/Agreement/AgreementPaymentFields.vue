<script setup lang="ts">
import { computed, ref } from 'vue'
import type { GcsPaymentAmountCalculatorResult } from '@gcs-ssc/extensions/ui'
import type { Currency_Codes } from '~~/shared/types/database'
import type { FundingCaseAgreementPaymentForm } from '~~/shared/types/funding-case-agreement-ui'
import type { ExtensionPaymentAmountCalculatorItem } from '~~/shared/types/schemas/extensions'
import type { AdminCommonLookupResponseItem } from '~~/shared/types/admin-common-ui'

const state = defineModel<FundingCaseAgreementPaymentForm>('state', { required: true })
const { agreementId, currency, paymentAmountCalculator, paymentCalculatorModel, ceilingError, pending = false } = defineProps<{
  agreementId: string
  currency: Currency_Codes
  paymentAmountCalculator: ExtensionPaymentAmountCalculatorItem | null
  paymentCalculatorModel: Record<string, unknown>
  ceilingError: string | null
  pending?: boolean
}>()
const emit = defineEmits<{
  'amount': [value: string]
  'calculator-result': [value: Record<string, unknown>]
  'calculator-payload': [key: string, value: Record<string, unknown>]
  'resolved-items': [field: string, items: AdminCommonLookupResponseItem[]]
}>()
const { t } = useI18n()
const calculatorResult = ref<GcsPaymentAmountCalculatorResult | null>(null)
const handleCalculatorResult = (value: Record<string, unknown>) => {
  calculatorResult.value = value as GcsPaymentAmountCalculatorResult
  emit('calculator-result', value)
}
const lookupQuery = computed(() => {
  const query: Record<string, string | number | boolean> = { permission_action: state.value.id ? 'update' : 'create', currency }
  if (state.value.id) query.paymentId = state.value.id
  return query
})
const monthOptions = computed(() => ['apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec', 'jan', 'feb', 'mar']
  .map((month, value) => ({ value, label: t(`agreement.payments.months.${month}`) })))
</script>

<template>
  <div class="space-y-4">
    <UFormField :label="t('agreement.payments.payee')" name="egcs_fc_applicantrecipient" :description="t('agreement.payments.payee_description')">
      <CommonServerLookupSelect
        v-model="state.egcs_fc_applicantrecipient"
        :fetch-url="`/api/agreements/${agreementId}/payments/lookups/proponents`"
        selected-values-query-key="selected_ids"
        value-key="id" label-en-key="label_en" label-fr-key="label_fr"
        :disabled="pending" :limit="100" :show-value-in-label="false" close-on-select
        :query="lookupQuery" @resolved-items="items => emit('resolved-items', 'egcs_fc_applicantrecipient', items)" />
    </UFormField>

    <UFormField :label="t('agreement.payments.commitment_type')" name="egcs_fc_commitmenttype">
      <CommonServerLookupSelect
        v-model="state.egcs_fc_commitmenttype"
        :fetch-url="`/api/agreements/${agreementId}/payments/lookups/commitments`"
        selected-values-query-key="selected_ids"
        value-key="id"
        label-en-key="label_en"
        label-fr-key="label_fr"
        :show-value-in-label="false"
        :disabled="pending" :limit="100"
        :query="lookupQuery" @resolved-items="items => emit('resolved-items', 'egcs_fc_commitmenttype', items)" />
    </UFormField>

    <UFormField :label="t('agreement.payments.fiscal_year')" name="egcs_fc_fiscalyear">
      <CommonServerLookupSelect
        v-model="state.egcs_fc_fiscalyear"
        :fetch-url="`/api/agreements/${agreementId}/payments/lookups/fiscal-years`"
        selected-values-query-key="selected_ids"
        value-key="id"
        label-en-key="label_en"
        label-fr-key="label_fr"
        :show-value-in-label="false"
        :disabled="pending" :limit="100"
        :query="lookupQuery" @resolved-items="items => emit('resolved-items', 'egcs_fc_fiscalyear', items)" />
    </UFormField>

    <UFormField :label="t('agreement.payments.type')" name="egcs_fc_paymenttype">
      <CommonEnumSelect v-model="state.egcs_fc_paymenttype" name="payment_type" :disabled="pending" class="w-full" />
    </UFormField>

    <UFormField :label="t('common.currency')" name="egcs_fc_currency" required>
      <CommonEnumSelect
        v-model="state.egcs_fc_currency"
        name="currency_codes"
        disabled
        class="w-full" />
    </UFormField>

    <div class="grid gap-4 sm:grid-cols-2">
      <UFormField :label="t('agreement.payments.period_start')" name="egcs_fc_periodstart">
        <USelect v-model="state.egcs_fc_periodstart" :items="monthOptions" :disabled="pending" />
      </UFormField>

      <UFormField :label="t('agreement.payments.period_end')" name="egcs_fc_periodend">
        <USelect v-model="state.egcs_fc_periodend" :items="monthOptions" :disabled="pending" />
      </UFormField>
    </div>

    <UFormField :label="t('agreement.payments.amount')" name="egcs_fc_paymentamount">
      <CommonCurrencyInput
        :model-value="state.egcs_fc_paymentamount"
        :currency="state.egcs_fc_currency" :disabled="pending"
        @update:model-value="value => emit('amount', value)" />
      <p v-if="ceilingError" class="mt-1 text-sm text-error">
        {{ ceilingError }}
      </p>
    </UFormField>

    <ExtensionPaymentAmountCalculatorHost
      v-if="paymentAmountCalculator && !state.id"
      :item="paymentAmountCalculator"
      :model="paymentCalculatorModel"
      @result="handleCalculatorResult"
      @extension-payload="(key, value) => emit('calculator-payload', key, value)" />

    <AgreementPaymentFinancialInputs
      v-if="!state.id"
      :agreement-id="agreementId"
      :show-calculation="Boolean(paymentAmountCalculator)"
      :calculator-result="calculatorResult"
      :commitment-type="state.egcs_fc_commitmenttype"
      :fiscal-year="state.egcs_fc_fiscalyear"
      :period-start="state.egcs_fc_periodstart"
      :period-end="state.egcs_fc_periodend" />

    <UFormField :label="t('common.comment')" name="egcs_fc_comment">
      <UTextarea v-model.nullable="state.egcs_fc_comment" :disabled="pending" class="w-full" />
    </UFormField>
  </div>
</template>
