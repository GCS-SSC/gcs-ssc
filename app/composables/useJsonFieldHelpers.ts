/* eslint-disable jsdoc/require-jsdoc */
export const useJsonFieldHelpers = () => {
  const toJsonTextareaValue = (value: unknown): string => {
    if (value === null || value === undefined) {
      return ''
    }

    if (typeof value === 'string') {
      return value
    }

    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return ''
    }
  }

  const parseJsonTextareaValue = (value: string): unknown => {
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }

  return {
    toJsonTextareaValue,
    parseJsonTextareaValue
  }
}
