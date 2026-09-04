<script setup lang="ts">
import type { TransferPaymentStreamAreaOfExpertise } from '~~/shared/types/schemas'

const model = defineModel<Partial<TransferPaymentStreamAreaOfExpertise>>('model', { required: true })

const { namePrefix = '', isStacked = false } = defineProps<{
  namePrefix?: string
  isStacked?: boolean
}>()

const { t } = useI18n()
const field = useFormFieldPath(() => namePrefix)
</script>

<template>
  <div class="grid grid-cols-1 gap-4" :class="{ 'md:grid-cols-2': isStacked }">
    <UFormField :label="t('transfer_payment.area_of_expertise_name_en')" :name="field('egcs_tp_name_en')">
      <UInput v-model="model.egcs_tp_name_en" />
    </UFormField>
    <UFormField :label="t('transfer_payment.area_of_expertise_name_fr')" :name="field('egcs_tp_name_fr')">
      <UInput v-model="model.egcs_tp_name_fr" />
    </UFormField>
  </div>
  <div class="grid grid-cols-1 gap-4" :class="{ 'md:grid-cols-2': isStacked }">
    <UFormField :label="t('transfer_payment.area_of_expertise_description_en')" :name="field('egcs_tp_description_en')">
      <CommonTextarea v-model="model.egcs_tp_description_en" :rows="2" />
    </UFormField>
    <UFormField :label="t('transfer_payment.area_of_expertise_description_fr')" :name="field('egcs_tp_description_fr')">
      <CommonTextarea v-model="model.egcs_tp_description_fr" :rows="2" />
    </UFormField>
  </div>
</template>
