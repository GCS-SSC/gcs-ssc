<script setup lang="ts">
import { computed, useTemplateRef } from 'vue'
import { formatMoneyText, isCanonicalMoney, type MoneyInput } from '~~/shared/utils/money'
import { customFieldHasValue, customFieldOptionIds } from '~~/shared/types/schemas/agreement-custom-fields'
import type { AssignedAgencyCustomFieldDefinition, AgreementCustomFieldPatch } from '~~/shared/types/schemas/agreement-custom-fields'

type FieldOption = AssignedAgencyCustomFieldDefinition['options'][number] & { disabled?: boolean }
const {
  field,
  options,
  currency,
  name,
  readonly = false,
  disabled = false,
  selectDisabled = false,
  clearDisabled = false
} = defineProps<{
  field: AssignedAgencyCustomFieldDefinition
  options: FieldOption[]
  name?: string
  currency?: string
  readonly?: boolean
  disabled?: boolean
  selectDisabled?: boolean
  clearDisabled?: boolean
}>()
const emit = defineEmits<{ 'open-options': [] }>()
const model = defineModel<AgreementCustomFieldPatch[string]>()
const { t, locale, n } = useI18n()
const dateFormatter = computed(() => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeZone: 'UTC' }))
const numberInput = useTemplateRef<{ inputRef: HTMLInputElement | null }>('numberInput')
const dateInput = useTemplateRef<{ inputRef: HTMLInputElement | null }>('dateInput')
const incompleteDate = 'invalid-date'
const inputError = computed(() => {
  if (!field.egcs_tp_active) return undefined
  if (field.egcs_ay_kind === 'currency' && typeof model.value === 'string') return t('validation.invalid_number')
  if (field.egcs_ay_kind === 'number' && typeof model.value === 'string') return t('validation.custom_field_number')
  if (field.egcs_ay_kind === 'date' && model.value === incompleteDate) return t('validation.custom_field_date')
  return undefined
})

/**
 * Reads native number validity before interpreting an empty value as a clear.
 * @param event - Native input event from UInput.
 */
const updateNumber = (event: Event) => {
  const input = event.target
  if (!(input instanceof HTMLInputElement)) return
  // The browser hides incomplete number text from .value. Keep a nonempty
  // string in the draft so the existing number validation rejects the edit.
  if (input.validity.badInput) model.value = 'NaN'
  else model.value = input.value === '' ? null : input.valueAsNumber
}

/**
 * Preserves incomplete browser date entries as invalid drafts.
 * @param event - Native input event from UInput.
 */
const updateDate = (event: Event) => {
  const input = event.target
  if (!(input instanceof HTMLInputElement)) return
  model.value = input.validity.badInput ? incompleteDate : input.value || null
}

/** Clears a value or an incomplete entry still held by the browser. */
const clear = () => {
  if (numberInput.value?.inputRef) numberInput.value.inputRef.value = ''
  if (dateInput.value?.inputRef) dateInput.value.inputRef.value = ''
  model.value = null
}

/**
 * @param value - Field or option with bilingual names.
 * @param value.egcs_ay_name_en - English name.
 * @param value.egcs_ay_name_fr - French name.
 * @returns Name in the reader's language.
 */
const label = (value: { egcs_ay_name_en: string; egcs_ay_name_fr: string }) =>
  locale.value === 'fr' ? value.egcs_ay_name_fr : value.egcs_ay_name_en
const fieldLabel = computed(() => label(field))
const numberDescription = computed(() => {
  if (field.egcs_ay_kind !== 'number' || !field.egcs_tp_active) return undefined
  const { egcs_ay_minimum: minimum, egcs_ay_maximum: maximum, egcs_ay_decimalplaces: decimalPlaces } = field
  return [
    minimum == null ? '' : t('custom_fields.minimum_hint', { minimum: n(minimum, { maximumSignificantDigits: 21 }) }),
    maximum == null ? '' : t('custom_fields.maximum_hint', { maximum: n(maximum, { maximumSignificantDigits: 21 }) }),
    decimalPlaces == null ? '' : t('custom_fields.decimal_places_hint', { places: n(decimalPlaces) })
  ].filter(Boolean).join(' ') || undefined
})
const moneyInput = computed<MoneyInput>(() => {
  if (isCanonicalMoney(model.value)) return model.value
  return typeof model.value === 'string' ? { draft: model.value } : null
})
const updateMoney = (value: MoneyInput) => {
  model.value = value && 'draft' in value ? (value.draft.trim() ? value.draft : null) : value ?? null
}
const optionIds = computed(() => field.egcs_ay_kind === 'relational' ? customFieldOptionIds(model.value) : [])
const checkboxItems = computed(() => options
  .filter(option => option.egcs_ay_active || optionIds.value.includes(option.id))
  .map(option => ({ value: option.id, label: label(option), disabled: option.disabled })))
const valueLabel = computed(() => {
  const value = model.value
  if (field.egcs_ay_kind === 'currency') return isCanonicalMoney(value) ? formatMoneyText(value, locale.value) : ''
  if (field.egcs_ay_kind === 'number') return typeof value === 'number' ? n(value, { maximumSignificantDigits: 21 }) : ''
  if (field.egcs_ay_kind === 'date') {
    const date = typeof value === 'string' ? new Date(`${value}T00:00:00Z`) : null
    return date && !Number.isNaN(date.getTime()) ? dateFormatter.value.format(date) : ''
  }
  if (field.egcs_ay_kind !== 'relational') return String(value ?? '')
  return optionIds.value.map(id => options.find(option => option.id === id))
    .map(option => option ? label(option) : '').join(', ')
})
</script>

<template>
  <div class="min-w-0 space-y-2" data-field-exclude="Agency-defined custom inputs receive their identity and labels from the field definition.">
    <slot v-if="readonly" name="answer" :label="fieldLabel" :answer="valueLabel">
      <CommonValueCard :label="fieldLabel" :value="valueLabel || t('common.not_available')" :sub-value="field.egcs_tp_active ? undefined : t('custom_fields.inactive')" class="whitespace-pre-wrap [overflow-wrap:anywhere]" />
    </slot>
    <UFormField v-else :label="fieldLabel" :name="name ?? `egcs_fc_customfields.${field.id}`" :description="numberDescription" :error="inputError" :required="field.egcs_tp_active && field.egcs_tp_required" :ui="field.egcs_ay_kind === 'relational' ? { labelWrapper: 'justify-start gap-2 mb-1.5', label: 'mb-0', hint: 'flex items-center' } : undefined">
      <template v-if="field.egcs_ay_kind === 'relational' && customFieldHasValue(model)" #hint>
        <UButton type="button" size="xs" variant="soft" color="warning" class="bg-amber-100 text-amber-700 ring-1 ring-inset ring-amber-300 hover:bg-amber-200 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/30 dark:hover:bg-amber-400/20" icon="i-lucide-x" :disabled="disabled || clearDisabled" :label="t('custom_fields.clear')" @click="model = null" />
      </template>
      <div v-if="!field.egcs_tp_active" class="flex items-start justify-between gap-4">
        <p class="whitespace-pre-wrap text-sm">
          {{ valueLabel }}
        </p>
        <UBadge color="neutral" :label="t('custom_fields.inactive')" />
      </div>
      <UTextarea v-else-if="field.egcs_ay_kind === 'text' && field.egcs_ay_presentation === 'multiline'" :model-value="String(model ?? '')" :disabled="disabled" class="w-full" @update:model-value="model = $event" />
      <UInput v-else-if="field.egcs_ay_kind === 'text'" :model-value="String(model ?? '')" :disabled="disabled" class="w-full" @update:model-value="model = $event" />
      <CommonCurrencyInput
        v-else-if="field.egcs_ay_kind === 'currency'"
        :model-value="moneyInput"
        :currency="currency"
        :required="field.egcs_tp_required"
        :disabled="disabled || !currency"
        class="w-full"
        @update:model-value="updateMoney" />
      <UInput v-else-if="field.egcs_ay_kind === 'email'" type="email" :model-value="String(model ?? '')" :required="field.egcs_tp_required" :disabled="disabled" class="w-full" @update:model-value="model = $event" />
      <UInput v-else-if="field.egcs_ay_kind === 'date'" ref="dateInput" type="date" :model-value="model !== incompleteDate ? String(model ?? '') : ''" :required="field.egcs_tp_required" :disabled="disabled" class="w-full" @input="updateDate" />
      <UInput v-else-if="field.egcs_ay_kind === 'number'" ref="numberInput" type="number" step="any" :min="field.egcs_ay_minimum ?? undefined" :max="field.egcs_ay_maximum ?? undefined" :model-value="typeof model === 'number' ? String(model) : ''" :disabled="disabled" class="w-full" @input="updateNumber" />
      <UCheckboxGroup v-else-if="field.egcs_ay_presentation === 'checkboxes'" :model-value="optionIds" :items="checkboxItems" :disabled="disabled || selectDisabled" @update:model-value="model = $event" />
      <CommonBilingualSelectMenu v-else-if="!field.egcs_ay_multiple" label-en-key="egcs_ay_name_en" label-fr-key="egcs_ay_name_fr" :model-value="optionIds[0] ?? null" :items="options" category-en-key="egcs_ay_category_en" category-fr-key="egcs_ay_category_fr" :aria-label="fieldLabel" :disabled="disabled || selectDisabled" class="w-full" @update:open="(open: boolean) => open && emit('open-options')" @update:model-value="model = $event ? [$event] : null" />
      <CommonBilingualMultiSelectMenu v-else label-en-key="egcs_ay_name_en" label-fr-key="egcs_ay_name_fr" :model-value="optionIds" :items="options" category-en-key="egcs_ay_category_en" category-fr-key="egcs_ay_category_fr" :aria-label="fieldLabel" :disabled="disabled || selectDisabled" class="w-full" @update:open="(open: boolean) => open && emit('open-options')" @update:model-value="model = $event" />
    </UFormField>
    <UButton v-if="!readonly && field.egcs_ay_kind !== 'relational' && customFieldHasValue(model)" type="button" variant="link" color="neutral" :disabled="disabled || clearDisabled" :label="t('custom_fields.clear')" @click="clear" />
  </div>
</template>
