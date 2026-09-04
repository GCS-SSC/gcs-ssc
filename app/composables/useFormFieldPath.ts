import { toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'

/**
 * Creates a field-path builder for nested form structures.
 *
 * @param prefix - Optional dot-path prefix, static or reactive.
 * @returns A function that prepends the current prefix to field names.
 *
 * @example
 * ```typescript
 * const withPath = useFormFieldPath('address')
 * withPath('city') // address.city
 * ```
 */
export const useFormFieldPath = (prefix: MaybeRefOrGetter<string | undefined> = '') => {
  return (fieldName: string) => {
    const currentPrefix = (toValue(prefix) ?? '').trim()
    return currentPrefix.length > 0 ? `${currentPrefix}.${fieldName}` : fieldName
  }
}
