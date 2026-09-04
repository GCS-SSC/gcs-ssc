import type { H3Event } from 'h3'
import { useTranslation } from '@intlify/h3'
import type { ZodError } from 'zod'
import { formatZodIssues, localizeBilingualIssueParams } from '../../shared/utils/zod-i18n'
import { resolveRequestLocale } from './request-locale'

export interface ApiErrorDetail {
  path: string
  message: string
  code?: string
}

export interface ApiErrorData {
  message: string
  code: string
  details?: ApiErrorDetail[]
  warnings?: unknown[]
}

type ServerTranslationFn = (
  event: H3Event
) => Promise<(key: string, params?: Record<string, unknown>) => string>

interface ThrowApiErrorOptions {
  statusCode: number
  code: string
  key?: string
  message?: string
  params?: Record<string, unknown>
  details?: ApiErrorDetail[]
  warnings?: unknown[]
}

/**
 * Resolves a localized message when translation utilities are available.
 *
 * @param event - Current H3 event.
 * @param key - Translation key.
 * @param params - Optional translation params.
 * @returns Localized message or the raw key when translation is unavailable.
 */
const translate = async (event: H3Event, key: string, params?: Record<string, unknown>): Promise<string> => {
  const translationLoader = (globalThis as typeof globalThis & {
    useTranslation?: ServerTranslationFn
  }).useTranslation ?? useTranslation

  const t = await translationLoader(event)
  return t(key, params ?? {})
}

/**
 * Throws a standardized API error with localization support.
 *
 * @param event - The H3 event.
 * @param options - Error options including status code, error code, and localization key.
 * @returns Never returns (throws error).
 */
export const throwApiError = async (event: H3Event, options: ThrowApiErrorOptions): Promise<never> => {
  const message = options.message ?? await translate(event, options.key ?? 'common.unknown_error', options.params)
  throw createError({
    statusCode: options.statusCode,
    message,
    data: {
      message,
      code: options.code,
      details: options.details,
      warnings: options.warnings
    } satisfies ApiErrorData
  })
}

/**
 * Throws a 401 Unauthorized error.
 *
 * @param event - The H3 event.
 * @returns Never returns.
 */
export const unauthorized = async (event: H3Event): Promise<never> => {
  return await throwApiError(event, {
    statusCode: 401,
    code: 'AUTH_UNAUTHORIZED',
    key: 'apiErrors.auth.unauthorized'
  })
}

/**
 * Throws a 403 Forbidden error.
 *
 * @param event - The H3 event.
 * @returns Never returns.
 */
export const forbidden = async (event: H3Event): Promise<never> => {
  return await throwApiError(event, {
    statusCode: 403,
    code: 'AUTH_FORBIDDEN',
    key: 'apiErrors.auth.forbidden'
  })
}

/**
 * Throws a 400 Bad Request error.
 *
 * @param event - The H3 event.
 * @param code - The error code.
 * @param key - The localization key.
 * @param params - Optional localization parameters.
 * @returns Never returns.
 */
export const badRequest = async (
  event: H3Event,
  code: string,
  key: string,
  params?: Record<string, unknown>
): Promise<never> => {
  return await throwApiError(event, {
    statusCode: 400,
    code,
    key,
    params
  })
}

/**
 * Throws a 404 Not Found error.
 *
 * @param event - The H3 event.
 * @param code - The error code.
 * @param key - The localization key.
 * @param params - Optional localization parameters.
 * @returns Never returns.
 */
export const notFound = async (
  event: H3Event,
  code: string,
  key: string,
  params?: Record<string, unknown>
): Promise<never> => {
  return await throwApiError(event, {
    statusCode: 404,
    code,
    key,
    params
  })
}

/**
 * Throws a 400 Bad Request error for Zod validation failures.
 *
 * @param event - The H3 event.
 * @param error - The ZodError object.
 * @returns Never returns.
 */
export const validationError = async (event: H3Event, error: ZodError): Promise<never> => {
  const translationLoader = (globalThis as typeof globalThis & {
    useTranslation?: ServerTranslationFn
  }).useTranslation ?? useTranslation

  const t = await translationLoader(event)
  const locale = resolveRequestLocale(event)
  const details = formatZodIssues(error.issues, (key, params) => t(
    key,
    localizeBilingualIssueParams(params ?? {}, locale)
  )).map(issue => ({
    path: issue.path,
    message: issue.message,
    code: issue.code
  }))

  return await throwApiError(event, {
    statusCode: 400,
    code: 'VALIDATION_FAILED',
    key: 'apiErrors.validation.failed',
    details
  })
}
