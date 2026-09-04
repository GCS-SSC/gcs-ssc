<script setup lang="ts">
import { nanoid } from 'nanoid'
import type { TransferPaymentStreamChartOfAccountDimension } from '~~/shared/types/schemas/transfer-payment'

type EditableDimension = TransferPaymentStreamChartOfAccountDimension & { tempId?: string, uiKey?: string }
type ChartOfAccountFieldsModel = {
  egcs_tp_streambudget?: string
  tempStreamBudgetId?: string
  egcs_tp_accountingdimensions: EditableDimension[]
}

const {
  budgetOptions = [],
  budgetField = 'egcs_tp_streambudget',
  namePrefix = '',
  budgetFetchUrl
} = defineProps<{
  budgetOptions?: Array<{ label: string, value: string }>
  budgetField?: 'egcs_tp_streambudget' | 'tempStreamBudgetId'
  namePrefix?: string
  budgetFetchUrl?: string
}>()
const model = defineModel<ChartOfAccountFieldsModel>({
  default: () => ({ egcs_tp_accountingdimensions: [] })
})
const { t } = useI18n()
/**
 * Prefixes a field path when the editor is nested in another form.
 *
 * @param name - Local form field name.
 * @returns Fully qualified form field name.
 */
const fieldName = (name: string) => namePrefix ? `${namePrefix}.${name}` : name
/**
 * Resolves the stable key supplied by either the CRUD modal or wizard.
 *
 * @param dimension - Editable dimension carrying one stable key.
 * @returns Stable rendering key.
 */
const dimensionKey = (dimension: EditableDimension) => dimension.uiKey ?? dimension.tempId ?? ''

/** Adds one empty, stably keyed accounting dimension. */
const addDimension = () => {
  model.value.egcs_tp_accountingdimensions.push({
    tempId: nanoid(),
    label_en: '',
    label_fr: '',
    value: ''
  })
}
/**
 * Removes an accounting dimension while preserving the required minimum.
 *
 * @param index - Dimension position to remove.
 */
const removeDimension = (index: number) => {
  if (model.value.egcs_tp_accountingdimensions.length === 1) return
  model.value.egcs_tp_accountingdimensions.splice(index, 1)
}
/**
 * Moves an accounting dimension by one position when the target exists.
 *
 * @param index - Current dimension position.
 * @param offset - Direction to move the dimension.
 */
const moveDimension = (index: number, offset: -1 | 1) => {
  const targetIndex = index + offset
  if (targetIndex < 0 || targetIndex >= model.value.egcs_tp_accountingdimensions.length) return
  const [dimension] = model.value.egcs_tp_accountingdimensions.splice(index, 1)
  if (dimension) model.value.egcs_tp_accountingdimensions.splice(targetIndex, 0, dimension)
}
</script>

<template>
  <div class="space-y-6">
    <UFormField
      :label="t('transfer_payment.chart_of_accounts.fiscal_year')"
      :name="fieldName(budgetField)"
      required>
      <CommonServerLookupSelect
        v-if="budgetFetchUrl"
        v-model="model[budgetField]"
        :fetch-url="budgetFetchUrl"
        value-key="id"
        label-en-key="fiscal_year_display"
        label-fr-key="fiscal_year_display"
        :show-value-in-label="false"
        :limit="100" />
      <CommonBilingualSelectMenu
        v-else
        v-model="model[budgetField]"
        :items="budgetOptions"
        value-key="value"
        label-key="label"
        :placeholder="t('common.select')" />
    </UFormField>

    <section class="space-y-3">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h3 class="font-semibold text-highlighted">
            {{ t('transfer_payment.chart_of_accounts.accounting_fields') }}
          </h3>
          <p class="mt-1 text-sm text-muted">
            {{ t('transfer_payment.chart_of_accounts.fields_description') }}
          </p>
        </div>
        <UButton
          type="button"
          icon="i-lucide-plus"
          color="neutral"
          variant="outline"
          :label="t('transfer_payment.chart_of_accounts.add_field')"
          @click="addDimension" />
      </div>

      <div class="space-y-3">
        <div
          v-for="(dimension, index) in model.egcs_tp_accountingdimensions"
          :key="dimensionKey(dimension)"
          class="rounded-lg border border-default bg-elevated/40 p-4">
          <div class="grid gap-4 md:grid-cols-[1fr_1fr_1fr_auto] md:items-start">
            <UFormField :label="t('transfer_payment.chart_of_accounts.label_en')" :name="fieldName(`egcs_tp_accountingdimensions.${index}.label_en`)" required>
              <UInput v-model="dimension.label_en" class="w-full" />
            </UFormField>
            <UFormField :label="t('transfer_payment.chart_of_accounts.label_fr')" :name="fieldName(`egcs_tp_accountingdimensions.${index}.label_fr`)" required>
              <UInput v-model="dimension.label_fr" class="w-full" />
            </UFormField>
            <UFormField :label="t('transfer_payment.chart_of_accounts.value')" :name="fieldName(`egcs_tp_accountingdimensions.${index}.value`)" required>
              <UInput v-model="dimension.value" class="w-full font-mono" />
            </UFormField>
            <div class="flex gap-1 md:pt-7">
              <UButton type="button" icon="i-lucide-arrow-up" color="neutral" variant="ghost" :aria-label="t('transfer_payment.chart_of_accounts.move_up')" :disabled="index === 0" @click="moveDimension(index, -1)" />
              <UButton type="button" icon="i-lucide-arrow-down" color="neutral" variant="ghost" :aria-label="t('transfer_payment.chart_of_accounts.move_down')" :disabled="index === model.egcs_tp_accountingdimensions.length - 1" @click="moveDimension(index, 1)" />
              <UButton type="button" icon="i-lucide-trash" color="error" variant="ghost" :aria-label="t('transfer_payment.chart_of_accounts.remove_field')" :disabled="model.egcs_tp_accountingdimensions.length === 1" @click="removeDimension(index)" />
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
