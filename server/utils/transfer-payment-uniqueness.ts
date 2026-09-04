/**
 * Normalizes a text key for comparison by trimming and converting to lower case.
 *
 * @param value - The text to normalize.
 * @returns The normalized text string.
 */
export const normalizeTextKey = (value: string): string => {
  return value.trim().toLowerCase()
}

/**
 * Checks if an array of items contains duplicate keys.
 *
 * @param items - The array of items to check.
 * @param getKey - A function to extract the key from an item.
 * @returns True if duplicates are found, false otherwise.
 */
export const hasDuplicateByKey = <T>(items: T[], getKey: (item: T) => string): boolean => {
  const seen = new Set<string>()
  for (const item of items) {
    const key = getKey(item)
    if (seen.has(key)) return true
    seen.add(key)
  }
  return false
}
