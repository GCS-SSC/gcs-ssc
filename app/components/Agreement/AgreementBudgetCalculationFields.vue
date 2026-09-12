<script setup lang="ts">
import type { FundingCaseAgreementBudgetLineItemForm } from '~~/shared/types/funding-case-agreement-ui'
import type { Money } from '~~/shared/utils/money'

const state = defineModel<FundingCaseAgreementBudgetLineItemForm>({ required: true })
const { preview } = defineProps<{ preview: Money | null }>()
const { t, locale } = useI18n()
</script>

<template>
  <div v-if="state.egcs_fc_calculationmode && state.egcs_fc_calculationmode !== 'manual'" class="space-y-3 lg:col-span-2">
    <p class="text-sm text-muted">
      {{ t(`budget_calculation.${state.egcs_fc_calculationmode}`) }} {{ t('budget_calculation.program_only') }}
    </p>
    <p v-if="state.egcs_fc_calculationmode === 'category'" class="text-sm">
      {{ t('budget_calculation.source') }} {{ locale === 'fr' ? state.calculation_source_name_fr : state.calculation_source_name_en }}
    </p>
    <UFormField :label="t('budget_calculation.percentage')" name="egcs_fc_percentage">
      <UInput v-model.number="state.egcs_fc_percentage" type="number" min="0" max="100" step="0.01" :readonly="!state.egcs_fc_allowpercentageoverride" />
    </UFormField>
    <p aria-live="polite">
      {{ t('budget_calculation.preview', { amount: preview ?? t('common.not_available') }) }}
    </p>
  </div>
</template>
