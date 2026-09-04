import { computed, isRef } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { useUrlTabState } from '~/composables/useUrlTabState'
import type { TabMap, TranslatedTabItem } from '~~/shared/types/ui'

type RouteTabMapOptions<Props extends Record<string, unknown>> = {
  tabMap: Ref<TabMap<Props>> | ComputedRef<TabMap<Props>> | TabMap<Props>
  defaultTabId?: string
  enabled?: Ref<boolean> | boolean
  queryKey?: string
  historyMode?: 'replace' | 'push'
}

/**
 * Resolves route tab metadata, active component, and active props from a single tab map.
 *
 * @param options - Route tab map configuration.
 * @param options.tabMap - Single source of truth for route tabs.
 * @param options.defaultTabId - Internal map key for the default tab.
 * @param options.enabled - Whether this route tab map should synchronize with the current query string.
 * @param options.queryKey - Query-string key used to persist the active tab.
 * @param options.historyMode - Router navigation mode used when updating the tab query.
 * @returns Route-ready tabs plus the active tab component and props.
 */
export const useRouteTabMap = <Props extends Record<string, unknown>>({
  tabMap,
  defaultTabId,
  enabled,
  queryKey,
  historyMode
}: RouteTabMapOptions<Props>) => {
  const tabMapRef: Ref<TabMap<Props>> | ComputedRef<TabMap<Props>> = isRef(tabMap) ? tabMap : computed(() => tabMap)

  const tabDefinitions = computed<TranslatedTabItem[]>(() =>
    Array.from(tabMapRef.value.values()).map(({ key, label, icon, value }) => ({
      key,
      label,
      icon,
      value: value ?? ''
    }))
  )

  const defaultKey = computed(() => {
    if (defaultTabId && tabMapRef.value.has(defaultTabId)) {
      const defaultTab = tabMapRef.value.get(defaultTabId)
      if (defaultTab) {
        return defaultTab.key
      }
    }

    const firstTab = Array.from(tabMapRef.value.values())[0]
    return firstTab ? firstTab.key : ''
  })

  const { tabs, selectedTab, selectedTabKey, defaultTab } = useUrlTabState({
    tabs: tabDefinitions,
    defaultKey,
    enabled,
    queryKey,
    historyMode
  })

  const activeTab = computed(() => {
    for (const tab of tabMapRef.value.values()) {
      if (tab.key === selectedTabKey.value) {
        return tab
      }
    }

    return null
  })

  const activeTabComponent = computed(() => {
    const currentTab = activeTab.value
    return currentTab ? currentTab.component ?? null : null
  })

  const activeTabProps = computed<Partial<Props>>(() => {
    const currentTab = activeTab.value
    if (!currentTab || !currentTab.getProps) {
      return {}
    }

    return currentTab.getProps()
  })

  return {
    tabs,
    selectedTab,
    selectedTabKey,
    defaultTab,
    activeTab,
    activeTabComponent,
    activeTabProps
  }
}
