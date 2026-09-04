/* eslint-disable jsdoc/require-jsdoc */
export const getReviewReturnPath = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null
  return value
}
