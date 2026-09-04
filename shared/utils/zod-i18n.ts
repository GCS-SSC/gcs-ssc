import type { z } from 'zod'

export type ZodTranslateFn = (key: string, params?: Record<string, unknown>) => string

export interface ZodIssueDetail {
  path: string
  message: string
  code: string
}

export type SupportedValidationLocale = 'en' | 'fr'

/**
 * Resolves bilingual domain labels carried by validation issues for one request locale.
 *
 * The selected locale falls back to English, then French, then an existing generic
 * placeholder. The original bilingual values remain available to callers as immutable
 * issue evidence.
 *
 * @param params - Translation parameters extracted from a Zod issue.
 * @param locale - Supported request or client locale.
 * @returns Parameters with localized generic placeholders populated.
 */
export const localizeBilingualIssueParams = (
  params: Record<string, unknown>,
  locale: SupportedValidationLocale
): Record<string, unknown> => {
  const localized = { ...params }

  /**
   * Resolves one supported bilingual placeholder with the canonical fallback order.
   *
   * @param base - Generic placeholder name to resolve.
   * @returns The localized value, existing placeholder, or `undefined`.
   */
  const resolve = (base: 'question' | 'outcome'): unknown => {
    const preferred = localized[`${base}_${locale}`]
    if (typeof preferred === 'string' && preferred) return preferred
    const english = localized[`${base}_en`]
    if (typeof english === 'string' && english) return english
    const french = localized[`${base}_fr`]
    if (typeof french === 'string' && french) return french
    return localized[base]
  }

  if ('question_en' in localized || 'question_fr' in localized) {
    localized.question = resolve('question')
  }
  if ('outcome_en' in localized || 'outcome_fr' in localized) {
    localized.outcome = resolve('outcome')
  }

  return localized
}

/**
 * Builds translation parameters from a Zod issue, including minimum and maximum constraints.
 *
 * @param issue - The Zod issue object to extract parameters from.
 * @returns A record of translation parameters.
 */
const buildIssueParams = (issue: z.ZodIssue): Record<string, unknown> => {
  const min = 'minimum' in issue ? issue.minimum : undefined
  const max = 'maximum' in issue ? issue.maximum : undefined
  const params = 'params' in issue && issue.params && typeof issue.params === 'object'
    && !Array.isArray(issue.params)
    ? issue.params
    : {}

  return {
    ...issue,
    ...params,
    min,
    max
  }
}

/**
 * Translates a Zod issue message using the provided translation function.
 *
 * @param message - The message key or default message.
 * @param issue - The Zod issue object.
 * @param translate - The translation function.
 * @returns The translated message.
 */
export const translateZodIssueMessage = (
  message: string,
  issue: z.ZodIssue,
  translate: ZodTranslateFn
): string => {
  if (message.startsWith('validation.')) {
    return translate(message, buildIssueParams(issue))
  }

  if (issue.code === 'invalid_value') {
    return translate('validation.invalid_selection', buildIssueParams(issue))
  }

  return message
}

/**
 * Formats a list of Zod issues into a standardized structure with translated messages.
 *
 * @param issues - The list of Zod issues.
 * @param translate - The translation function.
 * @returns An array of formatted issue details.
 */
export const formatZodIssues = (issues: z.ZodIssue[], translate: ZodTranslateFn): ZodIssueDetail[] => {
  return issues.map(issue => ({
    path: issue.path.join('.'),
    message: translateZodIssueMessage(issue.message, issue, translate),
    code: issue.code
  }))
}
