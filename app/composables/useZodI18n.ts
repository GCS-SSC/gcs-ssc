import type { z } from 'zod'
import { FORM_VALIDATOR_SCHEMA } from '~~/shared/utils/form-requirements'
import { en, frCA } from 'zod/locales'
import { localizeBilingualIssueParams, translateZodIssueMessage } from '~~/shared/utils/zod-i18n'

export const LOCALIZED_VALIDATION_ISSUE = Symbol('localized-validation-issue')

export type LocalizedValidationError = {
  name: string
  message: string
  [LOCALIZED_VALIDATION_ISSUE]?: z.ZodIssue
}

/**
 * Provides localized Zod validation helpers for Nuxt UI forms.
 *
 * @returns Helpers to translate Zod messages and build form validators.
 */
export const useZodI18n = () => {
  const { locale, t } = useI18n()

  /**
   * Resolves schema keys and default Zod failures through the host catalog.
   * Uncatalogued prose and missing validation keys use a localized fallback.
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
    /**
     * Validates current form values with the active interface locale.
     * @param state Untrusted, possibly incomplete form input.
     * @returns Localized field errors for Nuxt UI.
     */
    const validate = async (state: unknown): Promise<LocalizedValidationError[]> => {
      // We use standard safeParseAsync.
      // If the schema has { error: 'validation.key' },
      // Zod will put 'validation.key' into issue.message automatically.
      const localeError = (locale.value === 'fr' ? frCA() : en()).localeError
      const result = await schema.safeParseAsync(state, { error: localeError })

      if (result.success) return []

      return result.error.issues.map(issue => ({
        name: issue.path.join('.'),
        message: translateMessage(issue.message, issue),
        [LOCALIZED_VALIDATION_ISSUE]: issue
      }))
    }
    return Object.assign(validate, { [FORM_VALIDATOR_SCHEMA]: schema })
  }

  return { createValidator, translateMessage }
}
