<script setup lang="ts">
import type { TransferPaymentAmendmentSubtypes } from '~~/shared/types/schemas'

interface AmendmentTypeOption {
  id?: string
  tempId?: string
  egcs_tp_name_en: string
  egcs_tp_name_fr: string
}

const model = defineModel<Partial<TransferPaymentAmendmentSubtypes> & { tempAmendmentTypeIds?: string[] }>('model', { required: true })

const {
  definitionLocked = false,
  amendmentTypes = [],
  amendmentTypesFetchUrl,
  namePrefix = '',
  amendmentTypeField = 'amendment_type_ids',
  amendmentTypeValueKey = 'id'
} = defineProps<{
  amendmentTypes?: AmendmentTypeOption[]
  amendmentTypesFetchUrl?: string
  definitionLocked?: boolean
  namePrefix?: string
  amendmentTypeField?: string
  amendmentTypeValueKey?: string
}>()

const { t } = useI18n()
const field = useFormFieldPath(() => namePrefix)
const amendmentTypeIds = () => {
  const value = model.value[amendmentTypeField as keyof typeof model.value]
  return Array.isArray(value) ? value : []
}
const updateAmendmentTypeIds = (value: string[]) => {
  const mutableModel = model.value as Record<string, unknown>
  mutableModel[amendmentTypeField] = value
}
</script>

<template>
  <UFormField :label="t('transfer_payment.amendment_subtype_type')" :name="field(amendmentTypeField)" data-ui-target="transfer-payment.fields.amendment-subtype-fields.field-amendmentTypeField" data-field-scope="transfer-payment.fields.amendment-subtype-fields">
    <CommonServerLookupSelect
      v-if="amendmentTypesFetchUrl"
      multiple
      :disabled="definitionLocked"
      :limit="100"
      :values="amendmentTypeIds()"
      :fetch-url="amendmentTypesFetchUrl"
      value-key="id"
      label-en-key="egcs_tp_name_en"
      label-fr-key="egcs_tp_name_fr"
      required
      @update:values="updateAmendmentTypeIds" />
    <CommonBilingualMultiSelectMenu
      v-else
      :disabled="definitionLocked"
      :model-value="amendmentTypeIds()"
      :items="amendmentTypes"
      :value-key="amendmentTypeValueKey"
      label-en-key="egcs_tp_name_en"
      label-fr-key="egcs_tp_name_fr"
      searchable
      @update:model-value="updateAmendmentTypeIds" />
  </UFormField>
  <UFormField :label="t('transfer_payment.amendment_subtype_name_en')" :name="field('egcs_tp_name_en')" data-field-scope="transfer-payment.fields.amendment-subtype-fields">
    <UInput v-model="model.egcs_tp_name_en" :disabled="definitionLocked" />
  </UFormField>
  <UFormField :label="t('transfer_payment.amendment_subtype_name_fr')" :name="field('egcs_tp_name_fr')" data-field-scope="transfer-payment.fields.amendment-subtype-fields">
    <UInput v-model="model.egcs_tp_name_fr" :disabled="definitionLocked" />
  </UFormField>
  <UFormField :label="t('transfer_payment.amendment_subtype_description_en')" :name="field('egcs_tp_description_en')" data-field-scope="transfer-payment.fields.amendment-subtype-fields">
    <CommonTextarea v-model="model.egcs_tp_description_en" :disabled="definitionLocked" :rows="2" />
  </UFormField>
  <UFormField :label="t('transfer_payment.amendment_subtype_description_fr')" :name="field('egcs_tp_description_fr')" data-field-scope="transfer-payment.fields.amendment-subtype-fields">
    <CommonTextarea v-model="model.egcs_tp_description_fr" :disabled="definitionLocked" :rows="2" />
  </UFormField>
  <UFormField :label="t('common.active')" :name="field('egcs_tp_active')" data-field-scope="transfer-payment.fields.amendment-subtype-fields">
    <USwitch :model-value="model.egcs_tp_active ?? true" @update:model-value="model.egcs_tp_active = $event" />
  </UFormField>
</template>
