<script setup lang="ts">
import type { TransferPaymentStreamItem } from '~~/shared/types/schemas'

const model = defineModel<Partial<TransferPaymentStreamItem>>('model', { required: true })

const {
  programId,
  namePrefix = '',
  isStacked = false
} = defineProps<{
  programId: string
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
    <CommonServerLookupSelect
      :model-value="model.egcs_tp_parentstream ?? undefined"
      :fetch-url="`/api/transfer-payments/${programId}/streams`"
      :selected-fetch-url="model.egcs_tp_parentstream ? `/api/transfer-payments/${programId}/streams/${model.egcs_tp_parentstream}` : undefined"
      value-key="id"
      label-en-key="egcs_tp_name_en"
      label-fr-key="egcs_tp_name_fr"
      :prepend-items="[{ label: t('common.none'), value: '' }]"
      :placeholder="t('common.none')"
      :show-value-in-label="false"
      :exclude-values="model.id ? [model.id] : []"
      @update:model-value="model.egcs_tp_parentstream = $event ?? null" />
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
