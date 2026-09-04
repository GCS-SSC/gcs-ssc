<script setup lang="ts">
import type { TransferPaymentPerformanceIndicator } from '~~/shared/types/schemas'

interface OutcomeOption {
  id?: string
  tempId?: string
  egcs_tp_name_en: string
  egcs_tp_name_fr: string
}

const model = defineModel<Partial<TransferPaymentPerformanceIndicator> & {
  tempOutcomeId?: string
  egcs_tp_transferpaymentoutcome?: string
}>('model', { required: true })

const {
  namePrefix = '',
  outcomes = [],
  outcomeField = '',
  outcomeValueKey = 'id',
  isStacked = false
} = defineProps<{
  namePrefix?: string
  outcomes?: OutcomeOption[]
  outcomeField?: string
  outcomeValueKey?: string
  isStacked?: boolean
}>()

const { t } = useI18n()
const field = useFormFieldPath(() => namePrefix)
</script>

<template>
  <UFormField v-if="outcomeField" :label="t('transfer_payment.outcomes')" :name="field(outcomeField)">
    <CommonBilingualSelectMenu
      v-model="model[outcomeField as keyof typeof model]"
      :items="outcomes"
      :value-key="outcomeValueKey"
      label-en-key="egcs_tp_name_en"
      label-fr-key="egcs_tp_name_fr"
      searchable />
  </UFormField>

  <div class="grid grid-cols-1 gap-4" :class="{ 'md:grid-cols-2': isStacked }">
    <UFormField :label="t('transfer_payment.name_en')" :name="field('egcs_tp_name_en')">
      <UInput v-model="model.egcs_tp_name_en" />
    </UFormField>
    <UFormField :label="t('transfer_payment.name_fr')" :name="field('egcs_tp_name_fr')">
      <UInput v-model="model.egcs_tp_name_fr" />
    </UFormField>
  </div>
  <div class="grid grid-cols-1 gap-4" :class="{ 'md:grid-cols-2': isStacked }">
    <UFormField :label="t('transfer_payment.description_en')" :name="field('egcs_tp_description_en')">
      <CommonTextarea v-model="model.egcs_tp_description_en" :rows="2" />
    </UFormField>
    <UFormField :label="t('transfer_payment.description_fr')" :name="field('egcs_tp_description_fr')">
      <CommonTextarea v-model="model.egcs_tp_description_fr" :rows="2" />
    </UFormField>
  </div>
</template>
