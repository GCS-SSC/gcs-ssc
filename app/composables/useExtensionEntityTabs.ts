import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { computed, isRef, ref, watch } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type { ExtensionEntityTabItem, ExtensionEntityTabsResponse } from '~~/shared/types/schemas/extensions'
import type { GcsExtensionEntityTabTarget } from '~~/shared/utils/extensions'
import type { TranslatedTabItem } from '~~/shared/types/ui'

type MaybeRefString = string | Ref<string | undefined> | ComputedRef<string | undefined> | undefined

interface ExtensionEntityTabsOptions {
  target: GcsExtensionEntityTabTarget
  agreementId?: MaybeRefString
  applicantRecipientId?: MaybeRefString
  claimId?: MaybeRefString
  monitorId?: MaybeRefString
}

/**
 * Reads a plain string, ref, computed ref, or undefined into a query-safe string.
 *
 * @param value - Optional plain or reactive string.
 * @returns Resolved string value.
 */
const resolveMaybeRefString = (value: MaybeRefString): string | undefined => {
  if (isRef(value)) {
    return value.value
  }

  return value
}

/**
 * Resolves the current locale-specific label for an extension entity tab.
 *
 * @param item - Extension tab item returned by the host runtime endpoint.
 * @param locale - Active locale ref.
 * @returns Localized tab label.
 */
const localizedLabel = (item: ExtensionEntityTabItem, locale: Ref<string>) => {
  return locale.value === 'fr' ? item.label.fr : item.label.en
}

/**
 * Loads extension tabs for a host entity detail page and maps them to route-tab items.
 *
 * @param options - Entity target and identifier refs used in the runtime query.
 * @returns Reactive extension tab state and lookup helpers.
 */
export const useExtensionEntityTabs = (options: ExtensionEntityTabsOptions) => {
  const { locale } = useI18n()
  const query = computed(() => ({
    target: options.target,
    agreementId: resolveMaybeRefString(options.agreementId),
    applicantRecipientId: resolveMaybeRefString(options.applicantRecipientId),
    claimId: resolveMaybeRefString(options.claimId),
    monitorId: resolveMaybeRefString(options.monitorId)
  }))

  const data: Ref<ExtensionEntityTabsResponse | null> = ref(null)
  const status: Ref<'idle' | 'pending' | 'success' | 'error'> = ref('idle')
  const error: Ref<unknown | null> = ref(null)
  /**
   *
   */
  const refresh = async () => {
    const resolvedQuery = query.value
    const requiredId = options.target === 'agreement'
      ? resolvedQuery.agreementId
      : options.target === 'claim'
        ? resolvedQuery.claimId
        : options.target === 'monitor'
          ? resolvedQuery.monitorId
          : options.target === 'proponent'
            ? resolvedQuery.applicantRecipientId
            : undefined
    if (!requiredId) {
      data.value = null
      error.value = null
      status.value = 'idle'
      return
    }
    try {
      status.value = 'pending'
      error.value = null
      const requestUrl = getClientRequestUrl('/api/extensions/entity-tabs')
      for (const [key, value] of Object.entries(resolvedQuery)) {
        if (value) {
          requestUrl.searchParams.set(key, value)
        }
      }
      const response = await fetch(requestUrl)
      if (!response.ok) await throwFetchResponseError(response)
      data.value = await response.json() as ExtensionEntityTabsResponse
      status.value = 'success'
    } catch (fetchError: unknown) {
      error.value = fetchError
      data.value = null
      status.value = 'error'
    }
  }

  watch(query, async () => {
    await refresh()
  }, { immediate: true })

  const items = computed<ExtensionEntityTabItem[]>(() => data.value?.items ?? [])
  const tabs = computed<TranslatedTabItem[]>(() =>
    items.value.map(item => ({
      key: item.value,
      label: localizedLabel(item, locale),
      value: item.value,
      icon: item.icon
    }))
  )

  const getExtensionTabItem = (value: string): ExtensionEntityTabItem | null =>
    items.value.find(item => item.value === value) ?? null

  return {
    items,
    tabs,
    status,
    error,
    refresh,
    getExtensionTabItem
  }
}
