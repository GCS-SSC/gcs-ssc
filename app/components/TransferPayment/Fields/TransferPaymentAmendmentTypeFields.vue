<script setup lang="ts">
import type { TransferPaymentAmendmentType } from '~~/shared/types/schemas'

const model = defineModel<Partial<TransferPaymentAmendmentType>>('model', { required: true })

const { namePrefix = '', definitionLocked = false } = defineProps<{
  definitionLocked?: boolean
  namePrefix?: string
}>()

const { t } = useI18n()
const field = useFormFieldPath(() => namePrefix)
</script>

<template>
  <UFormField :label="t('transfer_payment.amended_type')" :name="field('egcs_tp_amended')" data-field-scope="transfer-payment.fields.amendment-type-fields">
    <CommonEnumSelect v-model="model.egcs_tp_amended" :disabled="definitionLocked" name="amended_type" />
  </UFormField>
  <UFormField :label="t('transfer_payment.amendment_type_name_en')" :name="field('egcs_tp_name_en')" data-field-scope="transfer-payment.fields.amendment-type-fields">
    <UInput v-model="model.egcs_tp_name_en" :disabled="definitionLocked" />
  </UFormField>
  <UFormField :label="t('transfer_payment.amendment_type_name_fr')" :name="field('egcs_tp_name_fr')" data-field-scope="transfer-payment.fields.amendment-type-fields">
    <UInput v-model="model.egcs_tp_name_fr" :disabled="definitionLocked" />
  </UFormField>
  <UFormField :label="t('transfer_payment.amendment_type_requires_subtype')" :name="field('egcs_tp_requiresamendmentsubtype')" data-field-scope="transfer-payment.fields.amendment-type-fields">
    <USwitch v-model="model.egcs_tp_requiresamendmentsubtype" :disabled="definitionLocked" />
  </UFormField>
  <UFormField :label="t('common.active')" :name="field('egcs_tp_active')" data-field-scope="transfer-payment.fields.amendment-type-fields">
    <USwitch :model-value="model.egcs_tp_active ?? true" @update:model-value="model.egcs_tp_active = $event" />
  </UFormField>
</template>
