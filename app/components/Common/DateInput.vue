<script setup lang="ts">
import { computed, ref } from 'vue'
import { DateFieldRoot } from 'reka-ui'
import type { ComponentPublicInstance } from 'vue'
import type { DateFieldRootProps } from 'reka-ui'
import type { InputDateProps } from '@nuxt/ui'
import { useFormField } from '@nuxt/ui/composables/useFormField'
import { tv } from '@nuxt/ui/utils/tv'
import theme from '#build/ui/input-date'
import DateSegment from './DateSegment.vue'

defineOptions({ inheritAttrs: false })

const props = defineProps<Pick<DateFieldRootProps, 'modelValue' | 'disabled' | 'readonly' | 'required' | 'name' | 'id' | 'minValue' | 'maxValue'>>()
const emit = defineEmits<{ 'update:modelValue': [value: DateFieldRootProps['modelValue']] }>()
const { id, name, disabled, color, highlight, ariaAttrs, emitFormBlur, emitFormFocus, emitFormChange, emitFormInput } = useFormField<InputDateProps>(props)
const entryRequired = computed(() => Boolean(props.required && !disabled.value && !props.readonly))
const ui = computed(() => tv(theme)({ color: color.value, highlight: highlight.value }))
const inputsRef = ref<(Element | ComponentPublicInstance | null)[]>([])
/** Emits the selected date and triggers the owning Nuxt form's validation.
 * @param value Selected calendar date or cleared value.
 */
const updateValue = (value: DateFieldRootProps['modelValue']) => {
  emit('update:modelValue', value)
  emitFormChange()
  emitFormInput()
}
defineExpose({ inputsRef })
</script>

<template>
  <DateFieldRoot
    v-bind="{ ...$attrs, ...ariaAttrs }"
    :id="id"
    v-slot="{ segments }"
    :name="name"
    :model-value="modelValue"
    :disabled="disabled"
    :readonly="readonly"
    :required="entryRequired"
    :min-value="minValue"
    :max-value="maxValue"
    data-slot="base"
    :class="ui.base()"
    @update:model-value="updateValue"
    @blur="emitFormBlur"
    @focus="emitFormFocus">
    <DateSegment
      v-for="(segment, index) in segments"
      :key="`${segment.part}-${index}`"
      :ref="element => inputsRef[index] = element"
      :part="segment.part"
      :aria-required="segment.part !== 'literal' && entryRequired ? 'true' : undefined"
      :data-segment="segment.part"
      data-slot="segment"
      :class="ui.segment()">
      {{ segment.value.trim() }}
    </DateSegment>
  </DateFieldRoot>
</template>
