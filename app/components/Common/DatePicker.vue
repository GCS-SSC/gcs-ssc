<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Ref } from 'vue'
import { parseDate } from '@internationalized/date'
import type { CalendarProps, InputDateProps } from '@nuxt/ui'

const {
  disabled = false
} = defineProps<{
  disabled?: boolean
}>()

const modelValue = defineModel<string | Date | null | undefined>({ required: true })

/**
 * Converts a date-like value into a YYYY-MM-DD string when possible.
 *
 * @param value - String or Date value to normalize.
 * @returns A YYYY-MM-DD value or an empty string.
 */
const normalizeToIsoDate = (value: string | Date | null | undefined): string => {
  if (!value) {
    return ''
  }

  if (typeof value === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
    if (!match) return ''
    const candidate = `${match[1]}-${match[2]}-${match[3]}`
    const parsed = new Date(`${candidate}T00:00:00.000Z`)
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === candidate
      ? candidate
      : ''
  }

  if (!Number.isFinite(value.getTime())) return ''

  const year = value.getFullYear().toString()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

type InputCalendarValue = ReturnType<typeof parseDate> | CalendarProps['modelValue'] | InputDateProps['modelValue']

/**
 * Maps the bound value into a calendar date for Nuxt UI date controls.
 *
 * @returns Parsed calendar date or undefined.
 */
const getInputDateValue = (): InputCalendarValue => {
  const normalized = normalizeToIsoDate(modelValue.value)
  if (!normalized) {
    return undefined
  }

  try {
    return parseDate(normalized)
  } catch {
    return undefined
  }
}

/**
 * Stores selected date values as YYYY-MM-DD strings.
 *
 * @param value - The selected date object from Nuxt UI date components.
 */
const setInputDateValue = (value: InputCalendarValue) => {
  const nextValue = value ? normalizeToIsoDate(value.toString()) : ''
  modelValue.value = nextValue || null
}

const inputDateValue: Ref<InputCalendarValue> = ref(getInputDateValue()) as Ref<InputCalendarValue>

watch(inputDateValue, value => {
  const nextNormalized = value ? value.toString() : ''
  const currentNormalized = normalizeToIsoDate(modelValue.value)

  if (nextNormalized === currentNormalized) {
    return
  }

  setInputDateValue(value)
})

watch(() => modelValue.value, () => {
  const nextValue = getInputDateValue()
  const nextNormalized = nextValue ? nextValue.toString() : ''
  const currentValue = inputDateValue.value
  const currentNormalized = currentValue ? currentValue.toString() : ''

  if (nextNormalized === currentNormalized) {
    return
  }

  inputDateValue.value = nextValue
})
</script>

<template>
  <UPopover>
    <UInputDate
      :model-value="inputDateValue as InputDateProps['modelValue']"
      :disabled="disabled"
      class="w-full"
      @update:model-value="value => inputDateValue = value as InputCalendarValue" />

    <template #content>
      <UCalendar
        :model-value="inputDateValue as CalendarProps['modelValue']"
        class="p-2"
        @update:model-value="value => inputDateValue = value as InputCalendarValue" />
    </template>
  </UPopover>
</template>
