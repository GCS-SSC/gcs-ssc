import { h } from 'vue'
import type { ApiErrorTranslation } from '~~/shared/types/schemas/api-error'
import { ApiErrorTranslationSchema } from '~~/shared/types/schemas/api-error'
import { localizeBilingualIssueParams } from '~~/shared/utils/zod-i18n'

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
 * @param translate Optional renderer for explicit host-owned translation metadata.
 * @returns Localized detail messages supplied by the server.
 */
export const resolveApiErrorDetails = (error: unknown, translate?: (metadata: ApiErrorTranslation, fallback: string) => string): string[] => {
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
    if (typeof message !== 'string' || message.trim().length === 0) return []
    const metadata = ApiErrorTranslationSchema.safeParse('translation' in detail ? detail.translation : undefined)
    return [metadata.success && translate ? translate(metadata.data, message) : message]
  })
}

/**
 * Creates a helper for showing normalized API error toasts.
 *
 * @returns Error toast helpers.
 */
export const useApiErrorToast = () => {
  const { locale, t, te } = useI18n({ useScope: 'global' })
  const toast = useLocalizedToast()

  /**
   * Displays an error toast with a resolved description from the error payload.
   *
   * @param error - The caught error object to resolve and display.
   */
  const showError: (error: unknown) => void = (error) => {
    const description = resolveApiErrorDescription(error, '')
    const payload = error && typeof error === 'object' && 'data' in error ? error.data : undefined
    const data = payload && typeof payload === 'object' && 'data' in payload ? payload.data : payload
    const metadata = ApiErrorTranslationSchema.safeParse(
      data && typeof data === 'object' && 'translation' in data ? data.translation : undefined
    )
    const renderedDescription = metadata.success && te(metadata.data.key)
      ? () => h('span', t(metadata.data.key, localizeBilingualIssueParams(metadata.data.params ?? {}, locale.value === 'fr' ? 'fr' : 'en')))
      : description || toast.localized('common.unknown_error')
    toast.add({ title: toast.localized('common.error'), description: renderedDescription, color: 'error' })
  }

  /** Resolves only explicit host metadata again when called from a reactive render/computed.
   * @param error The original server error, including display-ready fallback messages.
   * @returns Localized details without retranslating arbitrary server or extension prose.
   */
  const resolveDetails = (error: unknown): string[] => resolveApiErrorDetails(error, (metadata, fallback) => te(metadata.key)
    ? t(metadata.key, localizeBilingualIssueParams(metadata.params ?? {}, locale.value === 'fr' ? 'fr' : 'en'))
    : fallback)

  return { showError, resolveDetails }
}
