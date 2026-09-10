<script setup lang="ts">
import { computed } from 'vue'
import type { TransferPaymentStreamBudgetForm } from '~~/shared/types/transfer-payment-ui'
import type { AdminCommonLookupResponseItem } from '~~/shared/types/admin-common-ui'

const model = defineModel<TransferPaymentStreamBudgetForm>('model', { required: true })

const { transferPaymentId, namePrefix = '' } = defineProps<{
  transferPaymentId: string
  namePrefix?: string
}>()

const emit = defineEmits<{
  'budget-resolved': [payload: { programId: string, items: AdminCommonLookupResponseItem[] }]
}>()
const { t } = useI18n()
const field = useFormFieldPath(() => namePrefix)
const budgetFetchUrl = computed(() => `/api/transfer-payments/${transferPaymentId}/budgets`)
const selectedBudgetFetchUrl = computed<string | undefined>(() => {
  const budgetId = model.value.egcs_tp_transferpaymentbudget
  if (!budgetId) {
    return undefined
  }

  return `/api/transfer-payments/${transferPaymentId}/budgets/${budgetId}`
})
</script>

<template>
  <UFormField :label="t('transfer_payment.program_budget')" :name="field('egcs_tp_transferpaymentbudget')">
    <CommonServerLookupSelect
      v-model="model.egcs_tp_transferpaymentbudget"
      :fetch-url="budgetFetchUrl"
      :query="{ purpose: 'allocation' }"
      value-key="id"
      label-en-key="fiscal_year_display"
      label-fr-key="fiscal_year_display"
      :show-value-in-label="false"
      :aria-label="t('transfer_payment.program_budget')"
      :selected-fetch-url="selectedBudgetFetchUrl"
      @resolved-items="items => emit('budget-resolved', { programId: transferPaymentId, items })" />
  </UFormField>
  <UFormField :label="t('transfer_payment.total_budget')" :name="field('egcs_tp_totalbudget')">
    <UInput
      v-model="model.egcs_tp_totalbudget"
      inputmode="decimal" />
  </UFormField>
  <UFormField :label="t('transfer_payment.overcommit_threshold')" :name="field('egcs_tp_overcommitthreshold')">
    <UInputNumber
      v-model="model.egcs_tp_overcommitthreshold"
      :step="0.01"
      :format-options="{ style: 'percent' }" />
  </UFormField>
</template>
