<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { formatMoneyText, parseMoney } from '~~/shared/utils/money'

defineOptions({ inheritAttrs: false })
const { modelValue, currency, readonly = false, disabled = false, formatValue } = defineProps<{
  modelValue?: string | null
  currency: string | null | undefined
  readonly?: boolean
  disabled?: boolean
  formatValue?: (value: string, locale: string, currency: string) => string | null
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const { locale } = useI18n()
const focused: Ref<boolean> = ref(false)
const displayValue = computed(() => {
  const value = modelValue ?? ''
  if ((focused.value && !readonly && !disabled) || !currency || !value) return value
  try {
    return formatValue
      ? formatValue(value, locale.value, currency) ?? value
      : formatMoneyText(parseMoney(value), locale.value, currency)
  } catch {
    return value
  }
})
</script>

<template>
  <UInput
    v-bind="$attrs"
    :model-value="displayValue"
    type="text"
    inputmode="decimal"
    :readonly="readonly"
    :disabled="disabled"
    @update:model-value="emit('update:modelValue', String($event))"
    @focus="focused = true"
    @blur="focused = false" />
</template>
