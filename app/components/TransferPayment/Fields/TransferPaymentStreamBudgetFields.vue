<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
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
const resolvedBudget: Ref<AdminCommonLookupResponseItem | null> = ref(null)
watch([() => transferPaymentId, () => model.value.egcs_tp_transferpaymentbudget], () => {
  resolvedBudget.value = null
}, { flush: 'sync' })
const currency = computed(() => typeof resolvedBudget.value?.egcs_tp_currency === 'string'
  ? resolvedBudget.value.egcs_tp_currency
  : undefined)
/**
 * Retains the selected Program budget denomination without adding it to the Stream payload.
 * @param items - Resolved selected Program budget records.
 */
const resolveBudget = (items: AdminCommonLookupResponseItem[]) => {
  resolvedBudget.value = items.find(item => String(item.id) === String(model.value.egcs_tp_transferpaymentbudget)) ?? null
  emit('budget-resolved', { programId: transferPaymentId, items })
}
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
      label-en-key="fiscal_year_currency_display"
      label-fr-key="fiscal_year_currency_display"
      :show-value-in-label="false"
      :aria-label="t('transfer_payment.program_budget')"
      :selected-fetch-url="selectedBudgetFetchUrl"
      @resolved-items="resolveBudget" />
  </UFormField>
  <UFormField :label="t('transfer_payment.total_budget')" :name="field('egcs_tp_totalbudget')">
    <CommonCurrencyInput
      v-model="model.egcs_tp_totalbudget"
      :currency="currency" />
  </UFormField>
  <UFormField :label="t('transfer_payment.overcommit_threshold')" :name="field('egcs_tp_overcommitthreshold')" required>
    <UInputNumber
      v-model="model.egcs_tp_overcommitthreshold"
      :step="0.01"
      :format-options="{ style: 'percent' }" />
  </UFormField>
</template>
