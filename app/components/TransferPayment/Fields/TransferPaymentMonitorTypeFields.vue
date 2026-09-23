<script setup lang="ts">
import type { TransferPaymentMonitorType } from '~~/shared/types/schemas'

const model = defineModel<Partial<TransferPaymentMonitorType>>('model', { required: true })

const { namePrefix = '', lookupUrl = '' } = defineProps<{
  namePrefix?: string
  lookupUrl?: string
}>()

const { t } = useI18n()
const field = useFormFieldPath(() => namePrefix)
</script>

<template>
  <UFormField :label="t('transfer_payment.monitor_types')" :name="field('egcs_tp_agencymonitortype')" required>
    <CommonServerLookupSelect
      v-model="model.egcs_tp_agencymonitortype"
      :fetch-url="lookupUrl"
      value-key="id"
      label-en-key="egcs_ay_name_en"
      label-fr-key="egcs_ay_name_fr" />
  </UFormField>
</template>
