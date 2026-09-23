<script setup lang="ts">
import type { AgencyHoldbackBasisItem, TransferPaymentStreamHoldbackBasis } from '~~/shared/types/schemas'

const model = defineModel<Partial<TransferPaymentStreamHoldbackBasis>>('model', { required: true })
const { agencyHoldbackBases = [], namePrefix = '', lookupUrl = '' } = defineProps<{
  agencyHoldbackBases?: AgencyHoldbackBasisItem[]
  namePrefix?: string
  lookupUrl?: string
}>()

const { t, locale } = useI18n()
const field = useFormFieldPath(() => namePrefix)
</script>

<template>
  <UFormField :label="t('transfer_payment.agency_holdback_basis')" :name="field('egcs_tp_agencyholdback')" required>
    <CommonServerLookupSelect
      v-model="model.egcs_tp_agencyholdback"
      :fetch-url="lookupUrl"
      value-key="id"
      label-en-key="egcs_ay_name_en"
      label-fr-key="egcs_ay_name_fr"
      :prepend-items="agencyHoldbackBases.map(item => ({ value: String(item.id), label: locale.startsWith('fr') ? item.egcs_ay_name_fr : item.egcs_ay_name_en }))" />
  </UFormField>
</template>
