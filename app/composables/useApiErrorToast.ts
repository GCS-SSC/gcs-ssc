/**
 * Resolves an error message from known API error payload shapes.
 *
 * @param error - The caught error object to inspect.
 * @param fallback - Message used when the payload has no known message.
 * @returns The resolved error description.
 */
export const resolveApiErrorDescription = (error: unknown, fallback: string): string => {
  if (!error || typeof error !== 'object') {
    return fallback
  }

  const err = error as Record<string, unknown>
  if (!err.data || typeof err.data !== 'object') {
    return typeof err.message === 'string' ? err.message : fallback
  }

  const data = err.data as Record<string, unknown>
  const nestedData = data.data && typeof data.data === 'object'
    ? data.data as Record<string, unknown>
    : {}
  const directMessage = typeof data.message === 'string' ? data.message : undefined
  const nestedMessage = typeof nestedData.message === 'string' ? nestedData.message : undefined

  return directMessage || nestedMessage || (typeof err.message === 'string' ? err.message : fallback)
}

/**
 * Resolves actionable detail messages from a standardized API error payload.
 *
 * @param error - The caught error object to inspect.
 * @returns Localized detail messages supplied by the server.
 */
export const resolveApiErrorDetails = (error: unknown): string[] => {
  if (!error || typeof error !== 'object') return []

  const err = error as Record<string, unknown>
  if (!err.data || typeof err.data !== 'object') return []

  const data = err.data as Record<string, unknown>
  const nestedData = data.data && typeof data.data === 'object'
    ? data.data as Record<string, unknown>
    : data
  if (!Array.isArray(nestedData.details)) return []

  return nestedData.details.flatMap((detail) => {
    if (!detail || typeof detail !== 'object') return []
    const message = (detail as Record<string, unknown>).message
    return typeof message === 'string' && message.trim().length > 0 ? [message] : []
  })
}

/**
 * Creates a helper for showing normalized API error toasts.
 *
 * @returns Error toast helpers.
 */
export const useApiErrorToast = () => {
  const { t } = useI18n()
  const toast = useToast()

  /**
   * Displays an error toast with a resolved description from the error payload.
   *
   * @param error - The caught error object to resolve and display.
   */
  const showError: (error: unknown) => void = (error) => {
    const description = resolveApiErrorDescription(error, t('common.unknown_error'))
    toast.add({ title: t('common.error'), description, color: 'error' })
  }

  return { showError }
}
