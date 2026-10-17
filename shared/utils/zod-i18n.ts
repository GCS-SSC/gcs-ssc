import type { z } from 'zod'
import { ApiErrorTranslationSchema, type ApiErrorTranslation } from '../types/schemas/api-error'

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
 * Resolves a host validation message and safe metadata for later locale changes.
 * @param message - Schema message or translation key.
 * @param issue - Structured validation issue.
 * @param translate - Current locale translator.
 * @returns Localized prose and its host-owned catalog presentation.
 */
export const resolveZodIssuePresentation = (
  message: string,
  issue: z.ZodIssue,
  translate: ZodTranslateFn
): { message: string; translation: ApiErrorTranslation } => {
  const params = buildIssueParams(issue)
  let key = 'validation.invalid_input'
  if (message.startsWith('validation.') && translate(message, params) !== message) {
    key = message
  } else if (issue.code === 'invalid_value') {
    key = 'validation.invalid_selection'
  } else if (issue.code === 'too_big' && issue.origin === 'string') {
    key = 'validation.string_too_long'
  } else if (issue.code === 'too_big' && issue.origin === 'array') {
    key = 'validation.array_too_long'
  }

  const interpolation = 'params' in issue && issue.params ? issue.params : {}
  const safeParams = Object.fromEntries(Object.entries({
    ...interpolation,
    min: params.min,
    max: params.max
  }).flatMap(([name, value]): [string, string | number | boolean | null][] => {
    if (typeof value === 'bigint') return [[name, value.toString()]]
    if (value === null || typeof value === 'string' || typeof value === 'boolean'
      || (typeof value === 'number' && Number.isFinite(value))) return [[name, value]]
    return []
  }))
  const translation = ApiErrorTranslationSchema.parse({ key, params: safeParams })
  return { message: translate(key, params), translation }
}

/**
 * Translates schema keys and default validation failures through the host catalog.
 * @param message - Schema message or translation key.
 * @param issue - Structured validation issue.
 * @param translate - Current locale translator.
 * @returns Localized validation prose.
 */
export const translateZodIssueMessage = (
  message: string,
  issue: z.ZodIssue,
  translate: ZodTranslateFn
): string => resolveZodIssuePresentation(message, issue, translate).message

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
