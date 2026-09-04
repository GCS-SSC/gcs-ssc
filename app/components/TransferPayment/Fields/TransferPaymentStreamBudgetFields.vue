<script setup lang="ts">
import { computed } from 'vue'
import type { TransferPaymentStreamBudgetForm } from '~~/shared/types/transfer-payment-ui'
import type { AdminCommonSelectOption } from '~~/shared/types/admin-common-ui'

interface ProgramBudgetOption extends Record<string, unknown> {
  id: string
  fiscal_year_display?: string
}

const model = defineModel<TransferPaymentStreamBudgetForm>('model', { required: true })

const { transferPaymentId, budgetOptions = [], namePrefix = '' } = defineProps<{
  transferPaymentId: string
  budgetOptions?: ProgramBudgetOption[]
  namePrefix?: string
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
const budgetPrependItems = computed<AdminCommonSelectOption[]>(() =>
  budgetOptions.map(item => ({
    label: item.fiscal_year_display ? item.fiscal_year_display : t('common.none'),
    value: String(item.id)
  }))
)
</script>

<template>
  <UFormField :label="t('transfer_payment.program_budget')" :name="field('egcs_tp_transferpaymentbudget')">
    <CommonServerLookupSelect
      v-model="model.egcs_tp_transferpaymentbudget"
      :fetch-url="budgetFetchUrl"
      value-key="id"
      label-en-key="fiscal_year_display"
      label-fr-key="fiscal_year_display"
      :show-value-in-label="false"
      :aria-label="t('transfer_payment.program_budget')"
      :prepend-items="budgetPrependItems"
      :selected-fetch-url="selectedBudgetFetchUrl" />
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
