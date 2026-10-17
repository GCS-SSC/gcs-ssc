<script setup lang="ts">
import { computed } from 'vue'
import { DateFieldInput, injectDateFieldRootContext, useForwardExpose } from 'reka-ui'
import type { DateFieldInputProps } from 'reka-ui'

const props = defineProps<DateFieldInputProps>()
const { t } = useI18n()
const field = injectDateFieldRootContext()
const empty = computed(() => {
  const values = field.segmentValues.value
  return (props.part === 'day' && values.day === null)
    || (props.part === 'month' && values.month === null)
    || (props.part === 'year' && values.year === null)
})
const { forwardRef } = useForwardExpose()
</script>

<template>
  <DateFieldInput
    :ref="forwardRef"
    v-bind="{ ...props, ...empty ? { 'aria-valuetext': t('common.date_empty') } : {} }"
    :aria-label="part === 'literal' ? undefined : t(`common.date_parts.${part}`)">
    <slot />
  </DateFieldInput>
</template>
