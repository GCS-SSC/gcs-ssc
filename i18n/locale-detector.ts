import { resolveLocalePreference } from '../server/utils/request-locale'

export default defineI18nLocaleDetector((event, config) => {
  const cookieLocale = getCookie(event, 'i18n_redirected')
  const supportedCookie = cookieLocale?.startsWith('fr') || cookieLocale?.startsWith('en')
  return resolveLocalePreference(
    cookieLocale,
    supportedCookie ? undefined : getHeader(event, 'accept-language'),
    String(config.defaultLocale || 'en')
  )
})
