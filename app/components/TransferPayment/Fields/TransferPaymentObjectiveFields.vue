<script setup lang="ts">
import type { TransferPaymentObjective } from '~~/shared/types/schemas'

const model = defineModel<Partial<TransferPaymentObjective>>('model', { required: true })

const { namePrefix = '', isStacked = false } = defineProps<{
  namePrefix?: string
  isStacked?: boolean
}>()

const { t } = useI18n()
const field = useFormFieldPath(() => namePrefix)
</script>

<template>
  <div class="grid grid-cols-1 gap-4" :class="{ 'md:grid-cols-2': isStacked }">
    <UFormField :label="t('transfer_payment.objective_en')" :name="field('egcs_tp_objective_en')">
      <CommonTextarea v-model="model.egcs_tp_objective_en" :rows="2" />
    </UFormField>
    <UFormField :label="t('transfer_payment.objective_fr')" :name="field('egcs_tp_objective_fr')">
      <CommonTextarea v-model="model.egcs_tp_objective_fr" :rows="2" />
    </UFormField>
  </div>
</template>
