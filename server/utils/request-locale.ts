import type { H3Event } from 'h3'
import { getCookie, getHeader } from 'h3'

/**
 * Resolves locale strings using the canonical cookie and weighted header rules.
 *
 * @param cookieLocale - Persisted locale preference.
 * @param acceptedLanguage - HTTP Accept-Language value.
 * @param defaultLocale - Configured fallback locale.
 * @returns The supported English or French locale.
 */
export const resolveLocalePreference = (
  cookieLocale: string | undefined,
  acceptedLanguage: string | undefined,
  defaultLocale = 'en'
): 'en' | 'fr' => {
  if (cookieLocale?.startsWith('fr')) return 'fr'
  if (cookieLocale?.startsWith('en')) return 'en'

  const preferred = acceptedLanguage
    ?.split(',')
    .map((entry, index) => {
      const [range = '', ...parameters] = entry.trim().toLowerCase().split(';')
      const qualityValue = parameters.find(parameter => parameter.trim().startsWith('q='))?.trim().slice(2)
      const parsedQuality = qualityValue === undefined ? 1 : Number(qualityValue)
      const quality = Number.isFinite(parsedQuality) && parsedQuality >= 0 && parsedQuality <= 1 ? parsedQuality : 0
      const language: 'en' | 'fr' | null = range === 'fr' || range.startsWith('fr-')
        ? 'fr'
        : range === 'en' || range.startsWith('en-') ? 'en' : null
      return { index, language, quality }
    })
    .filter(candidate => candidate.language !== null && candidate.quality > 0)
    .sort((left, right) => right.quality - left.quality || left.index - right.index)[0]?.language
  return preferred ?? (defaultLocale.startsWith('fr') ? 'fr' : 'en')
}

/**
 * Resolves the supported locale for an HTTP request.
 *
 * @param event - Current HTTP request.
 * @param defaultLocale - Configured fallback locale.
 * @returns The supported English or French locale.
 */
export const resolveRequestLocale = (event: H3Event, defaultLocale = 'en'): 'en' | 'fr' => {
  const explicitLocale = (event as H3Event & { locale?: unknown }).locale
  if (explicitLocale === 'en' || explicitLocale === 'fr') return explicitLocale
  if (!event.node?.req) return resolveLocalePreference(undefined, undefined, defaultLocale)
  return resolveLocalePreference(getCookie(event, 'i18n_redirected'), getHeader(event, 'accept-language'), defaultLocale)
}
