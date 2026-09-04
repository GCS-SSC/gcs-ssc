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
  amendmentTypes = [],
  amendmentTypesFetchUrl,
  namePrefix = '',
  amendmentTypeField = 'amendment_type_ids',
  amendmentTypeValueKey = 'id'
} = defineProps<{
  amendmentTypes?: AmendmentTypeOption[]
  amendmentTypesFetchUrl?: string
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
  <UFormField :label="t('transfer_payment.amendment_subtype_type')" :name="field(amendmentTypeField)">
    <CommonServerLookupMultiSelect
      v-if="amendmentTypesFetchUrl"
      :model-value="amendmentTypeIds()"
      :fetch-url="amendmentTypesFetchUrl"
      value-key="id"
      label-en-key="egcs_tp_name_en"
      label-fr-key="egcs_tp_name_fr"
      required
      @update:model-value="updateAmendmentTypeIds" />
    <CommonBilingualMultiSelectMenu
      v-else
      :model-value="amendmentTypeIds()"
      :items="amendmentTypes"
      :value-key="amendmentTypeValueKey"
      label-en-key="egcs_tp_name_en"
      label-fr-key="egcs_tp_name_fr"
      searchable
      @update:model-value="updateAmendmentTypeIds" />
  </UFormField>
  <UFormField :label="t('transfer_payment.amendment_subtype_name_en')" :name="field('egcs_tp_name_en')">
    <UInput v-model="model.egcs_tp_name_en" />
  </UFormField>
  <UFormField :label="t('transfer_payment.amendment_subtype_name_fr')" :name="field('egcs_tp_name_fr')">
    <UInput v-model="model.egcs_tp_name_fr" />
  </UFormField>
  <UFormField :label="t('transfer_payment.amendment_subtype_description_en')" :name="field('egcs_tp_description_en')">
    <CommonTextarea v-model="model.egcs_tp_description_en" :rows="2" />
  </UFormField>
  <UFormField :label="t('transfer_payment.amendment_subtype_description_fr')" :name="field('egcs_tp_description_fr')">
    <CommonTextarea v-model="model.egcs_tp_description_fr" :rows="2" />
  </UFormField>
</template>
