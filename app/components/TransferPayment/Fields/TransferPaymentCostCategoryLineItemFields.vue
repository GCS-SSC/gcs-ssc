<script setup lang="ts">
import type { AgencyCostCategoryLineItemItem, TransferPaymentCostCategoryLineItem } from '~~/shared/types/schemas'

const model = defineModel<Partial<TransferPaymentCostCategoryLineItem>>('model', { required: true })

const { lineItemOptions = [], namePrefix = '' } = defineProps<{
  lineItemOptions?: AgencyCostCategoryLineItemItem[]
  namePrefix?: string
}>()

const { t } = useI18n()
const field = useFormFieldPath(() => namePrefix)
</script>

<template>
  <UFormField :label="t('transfer_payment.cost_category_line_items')" :name="field('egcs_tp_organizationcostcategory')">
    <CommonBilingualSelectMenu
      v-model="model.egcs_tp_organizationcostcategory"
      :items="lineItemOptions"
      value-key="id"
      label-en-key="egcs_ay_name_en"
      label-fr-key="egcs_ay_name_fr"
      :aria-label="t('transfer_payment.cost_category_line_items')"
      searchable />
  </UFormField>
  <UFormField :label="t('transfer_payment.cost_sharing_ratio')" :name="field('egcs_tp_costsharingratio')">
    <UInputNumber
      v-model="model.egcs_tp_costsharingratio"
      :step="0.01"
      :format-options="{ style: 'percent' }" />
  </UFormField>
</template>
