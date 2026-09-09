/**
 * Preserves the stored calendar day in Agreement SQL DATE response strings.
 *
 * @param value - Agreement calendar-date value from the API or form.
 * @returns Its ISO calendar prefix, or the original value for existing fallback handling.
 */
export const agreementCalendarDate = (value: string | Date | null | undefined): string | Date | null | undefined => {
  if (typeof value !== 'string') return value
  const match = /^(\d{4}-\d{2}-\d{2})(?:$|T)/.exec(value)
  return match?.[1] ?? value
}
