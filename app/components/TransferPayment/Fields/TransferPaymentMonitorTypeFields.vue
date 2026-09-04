<script setup lang="ts">
import type { TransferPaymentMonitorType } from '~~/shared/types/schemas'

const model = defineModel<Partial<TransferPaymentMonitorType>>('model', { required: true })

const { namePrefix = '' } = defineProps<{
  namePrefix?: string
}>()

const { t } = useI18n()
const field = useFormFieldPath(() => namePrefix)
</script>

<template>
  <UFormField :label="t('transfer_payment.monitor_type_name_en')" :name="field('egcs_tp_name_en')">
    <UInput v-model="model.egcs_tp_name_en" />
  </UFormField>
  <UFormField :label="t('transfer_payment.monitor_type_name_fr')" :name="field('egcs_tp_name_fr')">
    <UInput v-model="model.egcs_tp_name_fr" />
  </UFormField>
</template>
