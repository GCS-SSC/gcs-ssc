<script setup lang="ts">
import type { AgencyApplicantRecipientSubtypeItem, TransferPaymentEligibleRecipient } from '~~/shared/types/schemas'

const model = defineModel<Partial<TransferPaymentEligibleRecipient>>('model', { required: true })

const { recipientOptions = [], namePrefix = '' } = defineProps<{
  recipientOptions?: AgencyApplicantRecipientSubtypeItem[]
  namePrefix?: string
}>()

const { t } = useI18n()
const field = useFormFieldPath(() => namePrefix)
</script>

<template>
  <UFormField :label="t('transfer_payment.applicant_recipient_subtype')" :name="field('egcs_tp_applicantrecipientsubtype')">
    <CommonBilingualSelectMenu
      v-model="model.egcs_tp_applicantrecipientsubtype"
      :items="recipientOptions"
      value-key="id"
      label-en-key="egcs_ay_name_en"
      label-fr-key="egcs_ay_name_fr"
      :aria-label="t('transfer_payment.applicant_recipient_subtype')"
      searchable />
  </UFormField>
</template>
