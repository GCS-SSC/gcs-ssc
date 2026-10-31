<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { formatMoneyText, isCanonicalMoney, isPersistableMoney, majorMoneyText, parseCurrencyMoney, type Money, type MoneyInput } from '~~/shared/utils/money'

defineOptions({ inheritAttrs: false })
const { modelValue, currency, readonly = false, disabled = false } = defineProps<{
  modelValue?: MoneyInput
  currency: string | null | undefined
  readonly?: boolean
  disabled?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: MoneyInput] }>()
const { locale } = useI18n()
const focused: Ref<boolean> = ref(false)
const draft: Ref<string> = ref(isCanonicalMoney(modelValue) ? majorMoneyText(modelValue) : modelValue && 'draft' in modelValue ? modelValue.draft : '')
const invalidDraft: Ref<boolean> = ref(Boolean(modelValue && 'draft' in modelValue))
let lastEmitted: Money | null | undefined
watch(() => modelValue, value => {
  if (value && 'draft' in value) {
    draft.value = value.draft
    invalidDraft.value = true
  } else if (isCanonicalMoney(value)) {
    if (focused.value && lastEmitted?.amount === value.amount && lastEmitted.currency === value.currency) return
    draft.value = majorMoneyText(value)
    invalidDraft.value = false
  } else {
    draft.value = ''
    invalidDraft.value = false
  }
})
watch(() => currency, (next, previous) => {
  if (previous && next !== previous && isCanonicalMoney(modelValue) && modelValue.currency !== next?.toUpperCase()) {
    draft.value = ''
    invalidDraft.value = false
    lastEmitted = undefined
    emit('update:modelValue', null)
  }
})
const displayValue = computed(() => {
  if ((focused.value && !readonly && !disabled) || invalidDraft.value || !isCanonicalMoney(modelValue)) return draft.value
  if (!currency || modelValue.currency !== currency.toUpperCase()) return draft.value
  return formatMoneyText(modelValue, locale.value)
})
/**
 * Converts a human draft to exact currency money while preserving invalid text.
 * @param value Current native input text.
 */
const update = (value: string | number | undefined) => {
  draft.value = value === undefined ? '' : String(value)
  if (draft.value === '') {
    invalidDraft.value = false
    lastEmitted = undefined
    emit('update:modelValue', null)
    return
  }
  try {
    if (!currency) throw new TypeError('A currency must be selected before entering money.')
    const amount = parseCurrencyMoney(draft.value, currency)
    if (!isPersistableMoney(amount)) throw new RangeError('Amount exceeds the persisted minor-unit range.')
    invalidDraft.value = false
    lastEmitted = amount
    emit('update:modelValue', amount)
  } catch {
    invalidDraft.value = true
    lastEmitted = null
    emit('update:modelValue', { draft: draft.value })
  }
}
</script>

<template>
  <UInput
    v-bind="$attrs"
    :model-value="displayValue"
    type="text"
    inputmode="decimal"
    :readonly="readonly"
    :disabled="disabled"
    data-field-exclude="Composite control internals; configurable help belongs to the owning business field."
    @update:model-value="update"
    @focus="focused = true" @blur="focused = false" />
</template>
