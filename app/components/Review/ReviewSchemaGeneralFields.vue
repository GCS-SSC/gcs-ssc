<script setup lang="ts">
import type { AssessmentReviewSchemaGeneralPatch } from '~~/shared/types/schemas/assessment/review-schema'

const state = defineModel<Partial<AssessmentReviewSchemaGeneralPatch>>('state', { required: true, default: () => ({}) })

const { t } = useI18n()
</script>

<template>
  <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
    <UFormField :label="t('transfer_payment.name_en')" name="egcs_cn_name_en">
      <UInput
        :model-value="String(state.egcs_cn_name_en ?? '')"
        @update:model-value="value => (state.egcs_cn_name_en = value)" />
    </UFormField>

    <UFormField :label="t('transfer_payment.name_fr')" name="egcs_cn_name_fr">
      <UInput
        :model-value="String(state.egcs_cn_name_fr ?? '')"
        @update:model-value="value => (state.egcs_cn_name_fr = value)" />
    </UFormField>
  </div>

  <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
    <UFormField :label="t('admin_common.fields.egcs_cn_outcomename_en')" name="egcs_cn_outcomename_en">
      <UInput
        :model-value="String(state.egcs_cn_outcomename_en ?? '')"
        @update:model-value="value => (state.egcs_cn_outcomename_en = value)" />
    </UFormField>

    <UFormField :label="t('admin_common.fields.egcs_cn_outcomename_fr')" name="egcs_cn_outcomename_fr">
      <UInput
        :model-value="String(state.egcs_cn_outcomename_fr ?? '')"
        @update:model-value="value => (state.egcs_cn_outcomename_fr = value)" />
    </UFormField>
  </div>

  <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
    <UFormField :label="t('transfer_payment.disable_custom_outcomes')" name="egcs_cn_disablecustomoutcomes">
      <USwitch
        :model-value="Boolean(state.egcs_cn_disablecustomoutcomes)"
        @update:model-value="value => (state.egcs_cn_disablecustomoutcomes = value)" />
    </UFormField>

    <UFormField :label="t('transfer_payment.disable_alignment')" name="egcs_cn_disablealignment">
      <USwitch
        :model-value="Boolean(state.egcs_cn_disablealignment)"
        @update:model-value="value => (state.egcs_cn_disablealignment = value)" />
    </UFormField>

    <UFormField :label="t('transfer_payment.disable_reviewers')" name="egcs_cn_disablereviewers">
      <USwitch
        :model-value="Boolean(state.egcs_cn_disablereviewers)"
        @update:model-value="value => (state.egcs_cn_disablereviewers = value)" />
    </UFormField>
  </div>
</template>
