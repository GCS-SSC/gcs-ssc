<script setup lang="ts">
import type { AgencyCostCategoryLineItem } from '~~/shared/types/schemas'

const state = defineModel<Partial<AgencyCostCategoryLineItem>>({ required: true })
const { categoryId } = defineProps<{ categoryId: string }>()
const { t } = useI18n()
const modes = computed(() => ['manual', 'category', 'all_other'].map(value => ({ value, label: t(`budget_calculation.${value}`) })))
/**
 * Resets incompatible fields when selecting a calculation mode.
 * @param value - Selected calculation mode.
 */
const changeMode = (value: string | undefined) => {
  if (!value) return
  state.value.egcs_ay_calculationmode = value as 'manual' | 'category' | 'all_other'
  state.value.egcs_ay_sourcecategory = null
  if (value === 'manual') {
    state.value.egcs_ay_percentage = null
    state.value.egcs_ay_allowpercentageoverride = false
  }
}
</script>

<template>
  <UFormField :label="t('budget_calculation.mode')" name="egcs_ay_calculationmode">
    <CommonEnumSelect name="budget_calculation_mode" :items="modes" :model-value="state.egcs_ay_calculationmode ?? 'manual'" @update:model-value="changeMode" />
  </UFormField>
  <template v-if="state.egcs_ay_calculationmode && state.egcs_ay_calculationmode !== 'manual'">
    <UFormField :label="t('budget_calculation.percentage')" name="egcs_ay_percentage" required>
      <UInput v-model.number="state.egcs_ay_percentage" type="number" min="0" max="100" step="0.01" />
    </UFormField>
    <UFormField v-if="state.egcs_ay_calculationmode === 'category'" :label="t('budget_calculation.source')" name="egcs_ay_sourcecategory" required>
      <CommonServerLookupSelect :model-value="state.egcs_ay_sourcecategory ?? undefined" :fetch-url="`/api/agency/cost-categories/${categoryId}/calculation-sources`" selected-values-query-key="selected_ids" value-key="id" label-en-key="label_en" label-fr-key="label_fr" @update:model-value="state.egcs_ay_sourcecategory = $event ?? null" />
    </UFormField>
    <UCheckbox v-model="state.egcs_ay_allowpercentageoverride" :label="t('budget_calculation.allow_override')" />
  </template>
</template>
