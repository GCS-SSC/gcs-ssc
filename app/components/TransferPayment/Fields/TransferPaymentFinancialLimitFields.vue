<script setup lang="ts">
import type { TransferPaymentFinancialLimitsForm } from '~~/shared/types/transfer-payment-ui'

const model = defineModel<TransferPaymentFinancialLimitsForm>('model', { required: true })

const {
  namePrefix = '',
  isStacked = false
} = defineProps<{
  namePrefix?: string
  isStacked?: boolean
}>()

const { t } = useI18n()
const field = useFormFieldPath(() => namePrefix)
</script>

<template>
  <div class="grid grid-cols-1 gap-4" :class="{ 'md:grid-cols-2': isStacked }">
    <UFormField
      :label="t('transfer_payment.financial_limit_max_allowable_per_recipient')"
      :name="field('egcs_tp_maxallowableperrecipient')">
      <UInput
        v-model="model.egcs_tp_maxallowableperrecipient"
        inputmode="decimal" />
    </UFormField>

    <UFormField
      :label="t('transfer_payment.financial_limit_max_percent_support_per_recipient')"
      :name="field('egcs_tp_maxpercentofsupportavailableperrecipient')">
      <UInputNumber
        v-model="model.egcs_tp_maxpercentofsupportavailableperrecipient"
        :step="0.01"
        :format-options="{ style: 'percent' }" />
    </UFormField>
  </div>

  <div class="grid grid-cols-1 gap-4" :class="{ 'md:grid-cols-2': isStacked }">
    <UFormField
      :label="t('transfer_payment.financial_limit_max_percent_retroactive_costs')"
      :name="field('egcs_tp_maxpercentofretroactivecostsallowable')">
      <UInputNumber
        v-model="model.egcs_tp_maxpercentofretroactivecostsallowable"
        :step="0.01"
        :format-options="{ style: 'percent' }" />
    </UFormField>

    <UFormField
      :label="t('transfer_payment.financial_limit_stacking_limit')"
      :name="field('egcs_tp_stackinglimit')">
      <UInputNumber
        v-model="model.egcs_tp_stackinglimit"
        :step="0.01"
        :format-options="{ style: 'percent' }" />
    </UFormField>
  </div>

  <UFormField :label="t('common.active')" :name="field('egcs_tp_active')">
    <USwitch v-model="model.egcs_tp_active" :label="t('common.active')" />
  </UFormField>
</template>
