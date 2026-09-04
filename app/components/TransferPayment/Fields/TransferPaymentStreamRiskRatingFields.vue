<script setup lang="ts">
import type { TransferPaymentStreamRiskRating } from '~~/shared/types/schemas'

const model = defineModel<Partial<TransferPaymentStreamRiskRating>>('model', { required: true })

const { namePrefix = '' } = defineProps<{
  namePrefix?: string
}>()

const { t } = useI18n()
const field = useFormFieldPath(() => namePrefix)
</script>

<template>
  <UFormField :label="t('transfer_payment.risk_rating_score')" :name="field('egcs_tp_riskscore')">
    <UInputNumber v-model="model.egcs_tp_riskscore" :step="0.01" :min="0" />
  </UFormField>

  <UFormField :label="t('transfer_payment.risk_rating_name_en')" :name="field('egcs_tp_name_en')">
    <UInput v-model="model.egcs_tp_name_en" />
  </UFormField>

  <UFormField :label="t('transfer_payment.risk_rating_name_fr')" :name="field('egcs_tp_name_fr')">
    <UInput v-model="model.egcs_tp_name_fr" />
  </UFormField>
</template>
