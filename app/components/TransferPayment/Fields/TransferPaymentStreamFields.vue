<script setup lang="ts">
import type { TransferPaymentStream } from '~~/shared/types/schemas'

const model = defineModel<Partial<TransferPaymentStream>>('model', { required: true })

const {
  parentStreams = [],
  namePrefix = '',
  isStacked = false
} = defineProps<{
  parentStreams?: Array<{ id: string; egcs_tp_name_en: string; egcs_tp_name_fr: string }>
  namePrefix?: string
  isStacked?: boolean
}>()

const { t } = useI18n()
const field = useFormFieldPath(() => namePrefix)
</script>

<template>
  <div class="grid grid-cols-1 gap-4" :class="{ 'md:grid-cols-2': isStacked }">
    <UFormField :label="t('transfer_payment.name_en')" :name="field('egcs_tp_name_en')">
      <UInput v-model="model.egcs_tp_name_en" />
    </UFormField>
    <UFormField :label="t('transfer_payment.name_fr')" :name="field('egcs_tp_name_fr')">
      <UInput v-model="model.egcs_tp_name_fr" />
    </UFormField>
  </div>

  <div class="grid grid-cols-1 gap-4" :class="{ 'md:grid-cols-2': isStacked }">
    <UFormField :label="t('transfer_payment.abbreviation_en')" :name="field('egcs_tp_abbreviation_en')">
      <UInput v-model="model.egcs_tp_abbreviation_en" />
    </UFormField>
    <UFormField :label="t('transfer_payment.abbreviation_fr')" :name="field('egcs_tp_abbreviation_fr')">
      <UInput v-model="model.egcs_tp_abbreviation_fr" />
    </UFormField>
  </div>

  <UFormField :label="t('transfer_payment.parent_stream')" :name="field('egcs_tp_parentstream')">
    <CommonBilingualSelectMenu
      v-model="model.egcs_tp_parentstream"
      :items="parentStreams"
      value-key="id"
      label-en-key="egcs_tp_name_en"
      label-fr-key="egcs_tp_name_fr"
      :prepend-options="[{ label: t('common.none'), value: null }]"
      searchable />
  </UFormField>

  <div class="grid grid-cols-1 gap-4" :class="{ 'md:grid-cols-2': isStacked }">
    <UFormField :label="t('transfer_payment.objective_en')" :name="field('egcs_tp_objective_en')">
      <CommonTextarea v-model="model.egcs_tp_objective_en" />
    </UFormField>
    <UFormField :label="t('transfer_payment.objective_fr')" :name="field('egcs_tp_objective_fr')">
      <CommonTextarea v-model="model.egcs_tp_objective_fr" />
    </UFormField>
  </div>

  <UFormField :label="t('transfer_payment.allows_further_distribution')" :name="field('egcs_tp_allowsfurtherdistribution')">
    <USwitch v-model="model.egcs_tp_allowsfurtherdistribution" />
  </UFormField>

  <div class="grid grid-cols-1 gap-4" :class="{ 'md:grid-cols-2': isStacked }">
    <UFormField :label="t('transfer_payment.description_en')" :name="field('egcs_tp_description_en')">
      <CommonTextarea v-model="model.egcs_tp_description_en" />
    </UFormField>
    <UFormField :label="t('transfer_payment.description_fr')" :name="field('egcs_tp_description_fr')">
      <CommonTextarea v-model="model.egcs_tp_description_fr" />
    </UFormField>
  </div>

  <UFormField :label="t('common.active')" :name="field('egcs_tp_active')">
    <USwitch v-model="model.egcs_tp_active" :label="t('common.active')" />
  </UFormField>
</template>
