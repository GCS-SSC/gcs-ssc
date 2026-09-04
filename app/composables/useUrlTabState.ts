import { computed, isRef, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { TranslatedTabItem } from '~~/shared/types/ui'

type TranslatedTabInput = Omit<TranslatedTabItem, 'value'> & { value?: string }

type UrlTabStateOptions = {
  tabs: Ref<TranslatedTabInput[]> | TranslatedTabInput[]
  defaultTab?: Ref<string> | string
  defaultKey?: Ref<string> | string
  enabled?: Ref<boolean> | boolean
  queryKey?: string
  historyMode?: 'replace' | 'push'
}

const UNSAFE_MESSAGE_PATH_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * Normalizes a route query parameter into a single string value.
 *
 * @param value - Raw route query parameter value.
 * @returns The first string value or an empty string.
 */
const resolveQueryParamValue = (value: unknown): string => {
  if (Array.isArray(value)) {
    const first = value[0]
    return typeof first === 'string' ? first : ''
  }

  return typeof value === 'string' ? value : ''
}

/**
 * Converts a translated tab label into a URL-safe slug.
 *
 * @param value - Localized tab label.
 * @returns URL-safe tab value.
 */
const toTabValue = (value: string): string => {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Reads a nested translation value from a locale message object.
 *
 * @param messages - Locale messages object.
 * @param key - Dot-delimited translation key.
 * @returns The translated message or the key when unavailable.
 */
const getMessageForKey = (messages: Record<string, unknown>, key: string): string => {
  const segments = key.split('.')
  let current: unknown = messages

  for (const segment of segments) {
    if (UNSAFE_MESSAGE_PATH_SEGMENTS.has(segment)) {
      return key
    }

    if (typeof current !== 'object' || current == null || !Object.hasOwn(current, segment)) {
      return key
    }

    current = (current as Record<string, unknown>)[segment]
  }

  return typeof current === 'string' && current.length > 0 ? current : key
}

/**
 * Removes the locale prefix from a localized route path.
 *
 * @param path - Localized route path.
 * @returns Path without the leading locale segment.
 */
const stripLocalePrefix = (path: string): string => {
  const segments = path.split('/').filter(Boolean)
  if (segments.length === 0) {
    return '/'
  }

  if (/^[a-z]{2}$/i.test(segments[0] ?? '')) {
    return `/${segments.slice(1).join('/')}`
  }

  return `/${segments.join('/')}`
}

/**
 * Extracts the locale segment from a localized route path.
 *
 * @param path - Localized route path.
 * @returns Leading locale segment or an empty string.
 */
const getPathLocaleSegment = (path: string): string => {
  const [localeSegment] = path.split('/').filter(Boolean)
  return localeSegment && /^[a-z]{2}$/i.test(localeSegment) ? localeSegment : ''
}

/**
 * Resolves the selected tab key from route query aliases and configured defaults.
 *
 * @param input - Route query, alias map, defaults, and locale-switch state.
 * @param input.queryValue - Candidate route query value.
 * @param input.isLocaleSwitch - Whether the current navigation is a locale switch.
 * @param input.explicitDefaultKey - Configured default tab key.
 * @param input.tabKeyToValue - Map of tab keys to URL values.
 * @param input.tabAliasToKey - Map of URL aliases to tab keys.
 * @param input.fallbackKey - First available tab key.
 * @returns The selected tab key.
 */
export const resolveUrlTabKey = ({
  queryValue,
  isLocaleSwitch,
  explicitDefaultKey,
  tabKeyToValue,
  tabAliasToKey,
  fallbackKey
}: {
  queryValue: unknown
  isLocaleSwitch: boolean
  explicitDefaultKey: string
  tabKeyToValue: Record<string, string>
  tabAliasToKey: Record<string, string>
  fallbackKey: string
}): string => {
  if (isLocaleSwitch) {
    return explicitDefaultKey && tabKeyToValue[explicitDefaultKey]
      ? explicitDefaultKey
      : fallbackKey
  }

  const keyFromQuery = tabAliasToKey[resolveQueryParamValue(queryValue)]
  if (keyFromQuery) {
    return keyFromQuery
  }

  return explicitDefaultKey && tabKeyToValue[explicitDefaultKey]
    ? explicitDefaultKey
    : fallbackKey
}

/**
 * Synchronizes translated section state with the route query string.
 *
 * @param options - Tab definitions and query synchronization settings.
 * @param options.tabs - Available tabs that may be selected.
 * @param options.defaultTab - Fallback tab when the route query is invalid.
 * @param options.defaultKey - Fallback tab key when the route query is invalid.
 * @param options.enabled - Whether this tab state instance should own query synchronization.
 * @param options.queryKey - Query parameter key used for the tab value.
 * @param options.historyMode - Router navigation mode used when updating the query.
 * @returns The resolved tabs, selected tab value, selected tab key, and resolved default tab.
 */
export const useUrlTabState = ({
  tabs,
  defaultTab,
  defaultKey,
  enabled = true,
  queryKey = 'section',
  historyMode = 'replace'
}: UrlTabStateOptions) => {
  const { t, locale, getLocaleMessage } = useI18n()
  const route = useRoute()
  const router = useRouter()
  const selectedTab: Ref<string> = ref('')
  const selectedTabKey: Ref<string> = ref('')
  const previousPath: Ref<string> = ref(route.path)
  const previousRouteName: Ref<string> = ref(typeof route.name === 'string' ? route.name : '')
  const inputTabsRef: Ref<TranslatedTabInput[]> = isRef(tabs) ? tabs : computed(() => tabs)
  const defaultTabRef: Ref<string> = isRef(defaultTab) ? defaultTab : computed(() => defaultTab ?? '')
  const defaultKeyRef: Ref<string> = isRef(defaultKey) ? defaultKey : computed(() => defaultKey ?? '')
  const enabledRef: Ref<boolean> = isRef(enabled) ? enabled : computed(() => enabled)
  const tabsRef = computed<TranslatedTabItem[]>(() =>
    inputTabsRef.value.map(item => ({
      ...item,
      value:
        item.value && item.value.length > 0
          ? item.value
          : toTabValue(t(item.key))
    }))
  )
  const tabKeyToValue = computed<Record<string, string>>(() =>
    Object.fromEntries(tabsRef.value.map(item => [item.key, String(item.value)]))
  )
  const tabAliasToKey = computed<Record<string, string>>(() => {
    const aliases = new Map<string, string>()

    for (const item of tabsRef.value) {
      aliases.set(String(item.value), item.key)

      if (typeof getLocaleMessage !== 'function') {
        continue
      }

      const englishLabel = getMessageForKey(getLocaleMessage('en') as Record<string, unknown>, item.key)
      const frenchLabel = getMessageForKey(getLocaleMessage('fr') as Record<string, unknown>, item.key)

      aliases.set(toTabValue(englishLabel), item.key)
      aliases.set(toTabValue(frenchLabel), item.key)
    }

    return Object.fromEntries(aliases)
  })
  const tabValueToKey = computed<Record<string, string>>(() =>
    Object.fromEntries(tabsRef.value.map(item => [String(item.value), item.key]))
  )

  const tabValues = computed(() => tabsRef.value.map(item => String(item.value)))
  const resolvedDefaultTab = computed(() => {
    const explicitDefaultTab = String(defaultTabRef.value || '')
    if (tabValues.value.includes(explicitDefaultTab)) {
      return explicitDefaultTab
    }

    const explicitDefaultKey = String(defaultKeyRef.value || '')
    const tabValueForKey = tabKeyToValue.value[explicitDefaultKey]
    if (tabValueForKey) {
      return tabValueForKey
    }

    const firstTab = tabValues.value[0]
    return firstTab ? String(firstTab) : ''
  })
  const routeLocaleMatches = computed(() => {
    const [localeSegment] = route.path.split('/').filter(Boolean)
    if (!localeSegment) {
      return true
    }

    return localeSegment === locale.value
  })

  /**
   * Determines whether the current navigation is a locale switch on the same page.
   *
   * @returns True when the user is switching locales on the same page.
   */
  const isLocaleSwitchNavigation = (): boolean =>
    route.path !== previousPath.value
    && getPathLocaleSegment(route.path) !== getPathLocaleSegment(previousPath.value)
    && (
      (
        typeof route.name === 'string'
        && previousRouteName.value.length > 0
        && route.name === previousRouteName.value
      )
      || stripLocalePrefix(route.path) === stripLocalePrefix(previousPath.value)
    )

  /**
   * Coerces an arbitrary tab value to one of the allowed tab values.
   *
   * @param value - Candidate tab value.
   * @returns A valid tab value or the resolved default.
   */
  const normalizeTabValue = (value: string): string => {
    if (tabValues.value.includes(value)) {
      return value
    }

    return resolvedDefaultTab.value
  }

  /**
   * Resolves a valid tab key from the current route query or active selection.
   *
   * @param queryValue - Raw route query value for the tab.
   * @returns A valid tab key.
   */
  const resolveTabKey = (queryValue: unknown): string => {
    return resolveUrlTabKey({
      queryValue,
      isLocaleSwitch: isLocaleSwitchNavigation(),
      explicitDefaultKey: String(defaultKeyRef.value || ''),
      tabKeyToValue: tabKeyToValue.value,
      tabAliasToKey: tabAliasToKey.value,
      fallbackKey: tabsRef.value[0]?.key ?? ''
    })
  }

  /**
   * Writes the normalized tab value back to the URL query.
   *
   * @param nextTab - Normalized tab value to persist.
   */
  const updateRouteTab = async (nextTab: string) => {
    if (!enabledRef.value) {
      return
    }

    if (!routeLocaleMatches.value) {
      return
    }

    const currentTab = resolveQueryParamValue(route.query[queryKey])
    if (currentTab === nextTab) {
      return
    }

    const nextQuery = {
      ...route.query,
      [queryKey]: nextTab
    }

    if (historyMode === 'push') {
      await router.push({ query: nextQuery })
      return
    }

    await router.replace({ query: nextQuery })
  }

  watch(
    [() => route.path, () => route.query[queryKey], tabValues, resolvedDefaultTab, enabledRef],
    ([, queryTab, , , isEnabled]) => {
      if (!isEnabled) {
        previousPath.value = route.path
        previousRouteName.value = typeof route.name === 'string' ? route.name : ''
        return
      }

      const nextTabKey = resolveTabKey(queryTab)
      const nextTabValue = normalizeTabValue(tabKeyToValue.value[nextTabKey] ?? '')

      if (selectedTabKey.value !== nextTabKey) {
        selectedTabKey.value = nextTabKey
      }

      if (selectedTab.value !== nextTabValue) {
        selectedTab.value = nextTabValue
      }

      if (nextTabValue) {
        updateRouteTab(nextTabValue).catch((error: unknown) => {
          if (import.meta.dev) {
            console.error('[useUrlTabState] failed to sync section query', error)
          }
        })
      }

      previousPath.value = route.path
      previousRouteName.value = typeof route.name === 'string' ? route.name : ''
    },
    { immediate: true }
  )

  watch(selectedTab, value => {
    if (!enabledRef.value) {
      return
    }

    const normalizedTab = normalizeTabValue(String(value || ''))
    if (selectedTab.value !== normalizedTab) {
      selectedTab.value = normalizedTab
      return
    }

    const nextTabKey = tabValueToKey.value[normalizedTab] ?? resolveTabKey(normalizedTab)
    if (selectedTabKey.value !== nextTabKey) {
      selectedTabKey.value = nextTabKey
    }

    if (normalizedTab) {
      updateRouteTab(normalizedTab).catch((error: unknown) => {
        if (import.meta.dev) {
          console.error('[useUrlTabState] failed to sync section query', error)
        }
      })
    }
  })

  return {
    tabs: tabsRef,
    selectedTab,
    selectedTabKey,
    defaultTab: resolvedDefaultTab
  }
}
