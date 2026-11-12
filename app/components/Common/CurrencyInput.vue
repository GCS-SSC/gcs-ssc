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
type CurrencyDraft =
  | { kind: 'empty'; text: '' }
  | { kind: 'valid'; text: string }
  | { kind: 'invalid'; text: string }
const draft: Ref<CurrencyDraft> = ref(isCanonicalMoney(modelValue)
  ? { kind: 'valid', text: majorMoneyText(modelValue) }
  : modelValue && 'draft' in modelValue
    ? { kind: 'invalid', text: modelValue.draft }
    : { kind: 'empty', text: '' })
let lastEmitted: Money | null | undefined
watch(() => modelValue, value => {
  if (value && 'draft' in value) {
    draft.value = { kind: 'invalid', text: value.draft }
  } else if (isCanonicalMoney(value)) {
    if (focused.value && lastEmitted?.amount === value.amount && lastEmitted.currency === value.currency) return
    draft.value = { kind: 'valid', text: majorMoneyText(value) }
  } else {
    draft.value = { kind: 'empty', text: '' }
  }
})
watch(() => currency, (next, previous) => {
  if (previous && next !== previous && isCanonicalMoney(modelValue) && modelValue.currency !== next?.toUpperCase()) {
    draft.value = { kind: 'empty', text: '' }
    lastEmitted = undefined
    emit('update:modelValue', null)
  }
})
const displayValue = computed(() => {
  if ((focused.value && !readonly && !disabled) || draft.value.kind === 'invalid' || !isCanonicalMoney(modelValue)) return draft.value.text
  if (!currency || modelValue.currency !== currency.toUpperCase()) return draft.value.text
  return formatMoneyText(modelValue, locale.value)
})
/**
 * Converts a human draft to exact currency money while preserving invalid text.
 * @param value Current native input text.
 */
const update = (value: string | number | undefined) => {
  const text = value === undefined ? '' : String(value)
  if (text === '') {
    draft.value = { kind: 'empty', text: '' }
    lastEmitted = undefined
    emit('update:modelValue', null)
    return
  }
  try {
    if (!currency) throw new TypeError('A currency must be selected before entering money.')
    const amount = parseCurrencyMoney(text, currency)
    if (!isPersistableMoney(amount)) throw new RangeError('Amount exceeds the persisted minor-unit range.')
    draft.value = { kind: 'valid', text }
    lastEmitted = amount
    emit('update:modelValue', amount)
  } catch {
    draft.value = { kind: 'invalid', text }
    lastEmitted = null
    emit('update:modelValue', { draft: text })
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
