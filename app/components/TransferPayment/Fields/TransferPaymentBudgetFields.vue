<script setup lang="ts">
import type { AgencyFiscalYearItem } from '~~/shared/types/schemas'
import type { TransferPaymentBudgetForm } from '~~/shared/types/transfer-payment-ui'

const model = defineModel<TransferPaymentBudgetForm>('model', { required: true })

const { fiscalYears = [], namePrefix = '' } = defineProps<{
  fiscalYears?: AgencyFiscalYearItem[]
  namePrefix?: string
}>()

const { t } = useI18n()
const field = useFormFieldPath(() => namePrefix)
</script>

<template>
  <UFormField :label="t('transfer_payment.fiscal_year')" :name="field('egcs_tp_fiscalyear')">
    <CommonBilingualSelectMenu
      v-model="model.egcs_tp_fiscalyear"
      :items="fiscalYears"
      label-key="egcs_ay_fiscalyeardisplay" />
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
