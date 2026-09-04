<script setup lang="ts">
import type { AgencyAgreementTypeItem, TransferPaymentAgreementSubtype } from '~~/shared/types/schemas'

const model = defineModel<Partial<TransferPaymentAgreementSubtype>>('model', { required: true })

const {
  agreementTypes = [],
  namePrefix = ''
} = defineProps<{
  agreementTypes?: AgencyAgreementTypeItem[]
  namePrefix?: string
}>()

const { t } = useI18n()
const field = useFormFieldPath(() => namePrefix)
</script>

<template>
  <UFormField :label="t('transfer_payment.agreement_subtype')" :name="field('egcs_tp_agreementtype')">
    <CommonBilingualSelectMenu
      v-model="model.egcs_tp_agreementtype"
      :items="agreementTypes"
      value-key="id"
      label-en-key="egcs_ay_name_en"
      label-fr-key="egcs_ay_name_fr"
      searchable />
  </UFormField>
</template>
