import { computed } from 'vue'
import type { ComputedRef } from 'vue'

type DateHelperOptions = {
  formatterOptions?: Intl.DateTimeFormatOptions
  fallback?: string
}

/**
 * Provides localized date formatting and input-normalization helpers.
 *
 * @param options - Formatter configuration and fallback text.
 * @returns Date parsing and formatting helpers.
 */
export const useDateHelpers = (options: DateHelperOptions = {}) => {
  const { locale } = useI18n()

  const formatterOptions: Intl.DateTimeFormatOptions = options.formatterOptions ?? { dateStyle: 'medium' }
  const fallback = options.fallback ?? '-'

  const dateFormatter: ComputedRef<Intl.DateTimeFormat> = computed(() => new Intl.DateTimeFormat(locale.value, formatterOptions))

  const padNumber = (value: number): string => value.toString().padStart(2, '0')

  /**
   * Parses a YYYY-MM-DD input string into a Date object.
   *
   * @param value - The date string to parse.
   * @returns A Date object at noon, or null if the input is invalid.
   */
  const parseDateInput: (value: string) => Date | null = (value) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
    if (!match) return null

    const year = Number(match[1])
    const month = Number(match[2])
    const day = Number(match[3])
    const date = new Date(year, month - 1, day, 12, 0, 0, 0)

    // Guard against invalid dates like 2026-02-31.
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
      return null
    }

    return date
  }

  /**
   * Normalizes various date-like inputs into a Date object.
   *
   * @param value - A string, Date, or null value.
   * @returns A valid Date object or null if normalization fails.
   */
  const normalizeDate: (value: string | Date | null | undefined) => Date | null = (value) => {
    if (!value) return null
    if (value instanceof Date) return value
    const dateOnlyMatch = /^(\d{4}-\d{2}-\d{2})(?:T00:00:00(?:\.\d{3})?Z)?$/.exec(value)
    if (dateOnlyMatch?.[1]) {
      return parseDateInput(dateOnlyMatch[1])
    }
    return new Date(value)
  }

  const toLocalDateInput = (date: Date): string =>
    `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`

  /**
   * Formats a date-like value into a localized string using the medium date style.
   *
   * @param value - The date-like value to format.
   * @returns The formatted date string, or the fallback value.
   */
  const formatDate: (value: string | Date | null | undefined) => string = (value) => {
    const date = normalizeDate(value)
    if (!date) return fallback
    if (Number.isNaN(date.getTime())) return fallback
    return dateFormatter.value.format(date)
  }

  /**
   * Converts a date-like value into a YYYY-MM-DD string suitable for date inputs.
   *
   * @param value - The date-like value to convert.
   * @returns A YYYY-MM-DD string or an empty string.
   */
  const toDateInput: (value: string | Date | null | undefined) => string = (value) => {
    const date = normalizeDate(value)
    if (!date) return ''
    if (Number.isNaN(date.getTime())) return ''
    return toLocalDateInput(date)
  }

  /**
  * Converts a date-like value into a `datetime-local` input string.
  *
  * @remarks
  * Uses local date/time parts to avoid UTC-based shifts in non-UTC timezones.
  *
  * @param value - A string or Date value to normalize.
  * @returns A `YYYY-MM-DDTHH:mm` string or an empty string for invalid input.
  *
  * @example
  * ```typescript
  * const value = toDateTimeLocalInput(new Date(2026, 0, 2, 3, 4))
  * ```
  */
  const toDateTimeLocalInput: (value: string | Date | null | undefined) => string = (value) => {
    const date = normalizeDate(value)
    if (!date) return ''
    if (Number.isNaN(date.getTime())) return ''

    return `${toLocalDateInput(date)}T${padNumber(date.getHours())}:${padNumber(date.getMinutes())}`
  }

  return {
    formatDate,
    parseDateInput,
    toDateInput,
    toDateTimeLocalInput
  }
}
