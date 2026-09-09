<script setup lang="ts">
import { computed } from 'vue'
import type { AdminCommonLookupResponseItem } from '~~/shared/types/admin-common-ui'
import type { TransferPaymentBudgetForm } from '~~/shared/types/transfer-payment-ui'

const model = defineModel<TransferPaymentBudgetForm>('model', { required: true })

const { agencyId, namePrefix = '' } = defineProps<{
  agencyId: string
  namePrefix?: string
}>()

const emit = defineEmits<{
  'fiscal-year-resolved': [payload: { agencyId: string, items: AdminCommonLookupResponseItem[] }]
}>()
const lookupQuery = computed(() => ({ agency_id: agencyId }))
const selectedFiscalYearUrl = computed(() => {
  if (!agencyId || !model.value.egcs_tp_fiscalyear) return undefined
  const query = new URLSearchParams(lookupQuery.value)
  return `/api/transfer-payments/lookups/fiscal-years/${model.value.egcs_tp_fiscalyear}?${query.toString()}`
})
const { t } = useI18n()
const field = useFormFieldPath(() => namePrefix)
</script>

<template>
  <UFormField :label="t('transfer_payment.fiscal_year')" :name="field('egcs_tp_fiscalyear')">
    <CommonServerLookupSelect
      v-if="agencyId"
      v-model="model.egcs_tp_fiscalyear"
      fetch-url="/api/transfer-payments/lookups/fiscal-years"
      :query="lookupQuery"
      :selected-fetch-url="selectedFiscalYearUrl"
      value-key="id"
      label-en-key="egcs_ay_fiscalyeardisplay"
      label-fr-key="egcs_ay_fiscalyeardisplay"
      :show-value-in-label="false"
      :aria-label="t('transfer_payment.fiscal_year')"
      @resolved-items="items => emit('fiscal-year-resolved', { agencyId, items })" />
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
