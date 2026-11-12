<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { DateFieldRootProps } from 'reka-ui'
import { parseDate } from '@internationalized/date'
import type { CalendarProps, InputDateProps } from '@nuxt/ui'
import DateInput from './DateInput.vue'
import { createRequiredControl } from '~/utils/required-control'
import { formRequirementKey } from '~/utils/form-requirement-context'

const LocalizedDateInput = createRequiredControl(DateInput, 'segmented')
const { t } = useI18n()

const {
  disabled = false,
  readonly = false
} = defineProps<{
  disabled?: boolean
  readonly?: boolean
}>()

const modelValue = defineModel<string | Date | null | undefined>({ required: true })
const form = inject(formRequirementKey, undefined)
const isInteractionDisabled = computed(() => disabled || Boolean(form?.disabled.value))
const isEditable = computed(() => !isInteractionDisabled.value && !readonly)
const isOpen = ref(false)

/** Opens only while entry is allowed; dismissal remains available while disabled.
 * @param open Requested popover visibility.
 */
const updateOpen = (open: boolean) => {
  if (!open || isEditable.value) isOpen.value = open
}

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

/** Admits calendar and segmented updates through the same owning-form gate.
 * @param value Selected calendar date or cleared value.
 */
const updateInputDateValue = (value: InputCalendarValue) => {
  if (!isEditable.value) return
  inputDateValue.value = value
  const nextNormalized = value ? value.toString() : ''
  const currentNormalized = normalizeToIsoDate(modelValue.value)

  if (nextNormalized === currentNormalized) {
    return
  }

  setInputDateValue(value)
}

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
  <UPopover :open="isOpen" @update:open="updateOpen">
    <LocalizedDateInput
      data-field-container="Composite editor; its individual field declarations own their identities."
      :model-value="inputDateValue as DateFieldRootProps['modelValue']"
      :disabled="isInteractionDisabled"
      :readonly="readonly"
      class="w-full"
      @update:model-value="updateInputDateValue" />

    <template #content>
      <UCalendar
        data-field-container="Composite editor; its individual field declarations own their identities."
        :range="false"
        :multiple="false"
        :calendar-label="t('common.calendar_date')"
        :model-value="inputDateValue as CalendarProps['modelValue']"
        :disabled="isInteractionDisabled"
        :readonly="readonly"
        class="p-2"
        @update:model-value="updateInputDateValue" />
    </template>
  </UPopover>
</template>
