<script setup lang="ts">
import type { AgencyHoldbackBasisItem, TransferPaymentStreamHoldbackBasis } from '~~/shared/types/schemas'

const model = defineModel<Partial<TransferPaymentStreamHoldbackBasis>>('model', { required: true })
const { agencyHoldbackBases = [], namePrefix = '' } = defineProps<{
  agencyHoldbackBases?: AgencyHoldbackBasisItem[]
  namePrefix?: string
}>()

const { t } = useI18n()
const field = useFormFieldPath(() => namePrefix)
</script>

<template>
  <UFormField :label="t('transfer_payment.agency_holdback_basis')" :name="field('egcs_tp_agencyholdback')">
    <CommonBilingualSelectMenu
      v-model="model.egcs_tp_agencyholdback"
      :items="agencyHoldbackBases"
      value-key="id"
      label-en-key="egcs_ay_name_en"
      label-fr-key="egcs_ay_name_fr"
      :aria-label="t('transfer_payment.agency_holdback_basis')"
      searchable />
  </UFormField>
  <UFormField :label="t('transfer_payment.name_en')" :name="field('egcs_tp_name_en')">
    <UInput v-model="model.egcs_tp_name_en" />
  </UFormField>
  <UFormField :label="t('transfer_payment.name_fr')" :name="field('egcs_tp_name_fr')">
    <UInput v-model="model.egcs_tp_name_fr" />
  </UFormField>
</template>
