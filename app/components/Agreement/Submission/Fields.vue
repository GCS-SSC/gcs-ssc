<script setup lang="ts">
import { computed } from 'vue'
import { isCanonicalMoney } from '~~/shared/utils/money'
import type { MoneyInput } from '~~/shared/utils/money'
import { fiscalMonthLabels, isSubmissionObject, submissionFieldKey } from '~/utils/agreement-submission-view'
import type { SubmissionFields, SubmissionObject } from '~/utils/agreement-submission-view'

const { fields, requiredKeys, currency, disabled = false } = defineProps<{
  fields: SubmissionFields
  requiredKeys: readonly string[]
  currency: string
  disabled?: boolean
}>()
const model = defineModel<SubmissionObject>({ required: true })
const { t } = useI18n()
const additional = computed(() => Object.fromEntries(Object.entries(model.value).filter(([key]) => !Object.hasOwn(fields, key))))
const boolOptions = computed(() => [
  { label: t('submission.blank'), value: 'unset' },
  { label: t('submission.yes'), value: 'true' },
  { label: t('submission.no'), value: 'false' }
])
const monthOptions = computed(() => [
  { label: t('submission.blank'), value: 'unset' },
  ...fiscalMonthLabels.map((key, index) => ({ label: t(key), value: String(index) }))
])

/**
 * Sets one editable field, preserving all untouched payload fields.
 * @param key Field name in the incoming JSON schema.
 * @param value New value. Undefined clears the field.
 */
const update = (key: string, value: unknown) => {
  model.value = value === undefined
    ? Object.fromEntries(Object.entries(model.value).filter(([field]) => field !== key))
    : { ...model.value, [key]: value }
}

/**
 * Gets rows in a repeated section without discarding any malformed evidence.
 * @param key Repeated field key.
 * @returns Existing rows or an empty list.
 */
const rows = (key: string): unknown[] => {
  const value = model.value[key]
  return Array.isArray(value) ? value : []
}

/**
 * Replaces one repeated row, or removes it when no value is supplied.
 * @param key Field owning the rows.
 * @param index Row position.
 * @param value Replacement row.
 */
const updateRow = (key: string, index: number, value?: SubmissionObject) => {
  const next = [...rows(key)]
  if (value === undefined) next.splice(index, 1)
  else next[index] = value
  update(key, next)
}

/**
 * Preserves partially entered amounts for correction without coercing money to a number.
 * @param key Money field.
 * @returns Canonical amount or pending text.
 */
const moneyValue = (key: string): MoneyInput => {
  const value = model.value[key]
  if (isCanonicalMoney(value)) return value
  if (isSubmissionObject(value) && typeof value.draft === 'string') return { draft: value.draft }
  return null
}

/**
 * Reads the scalar portion of an editable field for its input.
 * @param key Field name.
 * @returns Existing scalar or an empty input.
 */
const inputValue = (key: string) => {
  const value = model.value[key]
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

/**
 * Preserves invalid percent input so it remains visible until corrected.
 * @param value Numeric input text.
 * @returns A percent number when the text is complete, otherwise the draft text.
 */
const percentValue = (value: string | number) => {
  if (typeof value === 'number') return value
  const text = value.trim().replace(',', '.')
  return /^\d+(\.\d+)?$/.test(text) && Number.isFinite(Number(text)) ? Number(text) : value
}
</script>

<template>
  <div class="grid min-w-0 gap-x-5 gap-y-4 sm:grid-cols-2" data-field-exclude="Versioned source fields are defined by the submission format.">
    <template v-for="(field, key) in fields" :key="key">
      <fieldset v-if="typeof field !== 'string'" class="min-w-0 space-y-4 rounded-md border border-default p-4 sm:col-span-2" :disabled="disabled">
        <legend class="px-1 font-semibold text-highlighted">
          {{ t(submissionFieldKey(String(key))) }}
        </legend>
        <AgreementSubmissionValue v-if="model[key] !== undefined && !Array.isArray(model[key])" :value="model[key]" />
        <p v-else-if="!rows(String(key)).length" class="text-sm text-muted">
          {{ t('submission.no_rows') }}
        </p>
        <fieldset v-for="(row, index) in rows(String(key))" :key="index" class="min-w-0 space-y-3 border-b border-default pb-4">
          <legend class="text-sm font-medium text-highlighted">
            {{ t('submission.row', { number: index + 1 }) }}
          </legend>
          <AgreementSubmissionFields
            v-if="isSubmissionObject(row)"
            :model-value="row" :fields="field.rows" :required-keys="field.required" :currency="currency" :disabled="disabled"
            @update:model-value="updateRow(String(key), index, $event)" />
          <AgreementSubmissionValue v-else :value="row" />
          <UButton
            color="neutral" variant="outline" size="sm" icon="i-lucide-minus" :disabled="disabled"
            :aria-label="t('submission.remove_row_number', { number: index + 1 })" @click="updateRow(String(key), index)">
            {{ t('submission.remove_row') }}
          </UButton>
        </fieldset>
        <UButton
          color="neutral" variant="outline" size="sm" icon="i-lucide-plus" :disabled="disabled"
          :aria-label="t('submission.add_named_row', { field: t(submissionFieldKey(String(key))) })"
          @click="update(String(key), [...rows(String(key)), {}])">
          {{ t('submission.add_row') }}
        </UButton>
      </fieldset>
      <UFormField v-else :required="requiredKeys.includes(String(key))" :label="t(submissionFieldKey(String(key)))">
        <USelect
          v-if="field === 'boolean'"
          :model-value="typeof model[key] === 'boolean' ? String(model[key]) : 'unset'"
          :items="boolOptions" :required="requiredKeys.includes(String(key))" :disabled="disabled" class="w-full"
          @update:model-value="update(String(key), $event === 'unset' ? undefined : $event === 'true')" />
        <USelect
          v-else-if="field === 'month'"
          :model-value="typeof model[key] === 'number' ? String(model[key]) : 'unset'"
          :items="monthOptions" :required="requiredKeys.includes(String(key))" :disabled="disabled" class="w-full"
          @update:model-value="update(String(key), $event === 'unset' ? undefined : Number($event))" />
        <CommonCurrencyInput
          v-else-if="field === 'money'" :model-value="moneyValue(String(key))" :currency="currency"
          :disabled="disabled" :required="requiredKeys.includes(String(key))" class="w-full" @update:model-value="update(String(key), $event ?? undefined)" />
        <UInput
          v-else :model-value="inputValue(String(key))" :required="requiredKeys.includes(String(key))" :disabled="disabled" class="w-full"
          :type="field === 'date' ? 'date' : 'text'" :inputmode="field === 'id' ? 'numeric' : field === 'percent' ? 'decimal' : undefined"
          @update:model-value="update(String(key), $event === '' || $event === undefined ? undefined : field === 'percent' ? percentValue($event) : $event)" />
        <template #hint>
          <span v-if="model[key] !== undefined && (field === 'money' ? moneyValue(String(key)) === null : field === 'boolean' ? typeof model[key] !== 'boolean' : field === 'month' ? typeof model[key] !== 'number' : typeof model[key] !== 'string' && typeof model[key] !== 'number')">
            {{ t('submission.received_value') }} <AgreementSubmissionValue :value="model[key]" />
          </span>
        </template>
      </UFormField>
    </template>
    <section v-if="Object.keys(additional).length" class="space-y-3 sm:col-span-2">
      <h4 class="text-sm font-semibold text-highlighted">
        {{ t('submission.additional') }}
      </h4>
      <AgreementSubmissionValue :value="additional" />
    </section>
  </div>
</template>
