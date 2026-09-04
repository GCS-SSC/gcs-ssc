import type { z } from 'zod'
import { en, frCA } from 'zod/locales'
import { localizeBilingualIssueParams, translateZodIssueMessage } from '~~/shared/utils/zod-i18n'

/**
 * Provides localized Zod validation helpers for Nuxt UI forms.
 *
 * @returns Helpers to translate Zod messages and build form validators.
 */
export const useZodI18n = () => {
  const { locale, t } = useI18n()

  /**
   * Translates a Zod message if it's a known validation key.
   * Only translates if the message starts with 'validation.',
   * which indicates it was explicitly set in the schema as a translation key.
   *
   * @param message - The raw message or translation key.
   * @param issue - The Zod issue being translated.
   * @returns The localized message string.
   */
  const translateMessage = (message: string, issue: z.ZodIssue): string => {
    return translateZodIssueMessage(message, issue, (key, params) => t(
      key,
      localizeBilingualIssueParams(params ?? {}, locale.value === 'fr' ? 'fr' : 'en')
    ))
  }

  /**
   * Creates a validation function compatible with Nuxt UI <UForm :validate="..." />.
   *
   * @param schema - The Zod schema to validate against.
   * @returns A function that takes form state and returns a list of formatted validation errors.
   */
  const createValidator = <T extends z.ZodType<unknown, unknown>>(schema: T) => {
    return async (state: z.input<T>) => {
      // We use standard safeParseAsync.
      // If the schema has { error: 'validation.key' },
      // Zod will put 'validation.key' into issue.message automatically.
      const localeError = (locale.value === 'fr' ? frCA() : en()).localeError
      const result = await schema.safeParseAsync(state, { error: localeError })

      if (result.success) return []

      return result.error.issues.map(issue => ({
        name: issue.path.join('.'),
        message: translateMessage(issue.message, issue)
      }))
    }
  }

  return { createValidator, translateMessage }
}
