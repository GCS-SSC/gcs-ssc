import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { useResourceRequest } from '~/composables/useResourceRequest'
import { computed, toValue } from 'vue'
import type { MaybeRefOrGetter, Ref } from 'vue'
import type { ExtensionEntityTabItem, ExtensionEntityTabsResponse } from '~~/shared/types/schemas/extensions'
import type { GcsExtensionEntityTabTarget } from '~~/shared/utils/extensions'
import type { TranslatedTabItem } from '~~/shared/types/ui'

type MaybeRefString = MaybeRefOrGetter<string | undefined>

interface ExtensionEntityTabsOptions {
  target: GcsExtensionEntityTabTarget
  agreementId?: MaybeRefString
  applicantRecipientId?: MaybeRefString
  agencyId?: MaybeRefString
  claimId?: MaybeRefString
  monitorId?: MaybeRefString
  paymentId?: MaybeRefString
  opportunityId?: MaybeRefString
}

/**
 * Reads a plain string, ref, computed ref, or undefined into a query-safe string.
 *
 * @param value - Optional plain or reactive string.
 * @returns Resolved string value.
 */
const resolveMaybeRefString = (value: MaybeRefString): string | undefined => {
  return toValue(value)
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
  const { user, permissionRevision } = useAuth()
  const query = computed(() => ({
    target: options.target,
    agreementId: resolveMaybeRefString(options.agreementId),
    applicantRecipientId: resolveMaybeRefString(options.applicantRecipientId),
    agencyId: resolveMaybeRefString(options.agencyId),
    claimId: resolveMaybeRefString(options.claimId),
    monitorId: resolveMaybeRefString(options.monitorId),
    paymentId: resolveMaybeRefString(options.paymentId),
    opportunityId: resolveMaybeRefString(options.opportunityId)
  }))

  const requiredId = computed(() => {
    const resolvedQuery = query.value
    return options.target === 'agreement'
      ? resolvedQuery.agreementId
      : options.target === 'payment'
        ? resolvedQuery.paymentId
        : options.target === 'claim'
          ? resolvedQuery.claimId
          : options.target === 'monitor'
            ? resolvedQuery.monitorId
            : options.target === 'opportunity'
              ? resolvedQuery.opportunityId
              : resolvedQuery.applicantRecipientId
  })
  const { data, status, error, refresh: refreshRequest } = useResourceRequest<ExtensionEntityTabsResponse>({
    identity: () => JSON.stringify([query.value, user.value?.id, permissionRevision.value]),
    enabled: () => Boolean(requiredId.value),
    refreshData: 'clear',
    failureData: 'clear',
    /**
     * Loads tabs for the exact subject captured before the request starts.
     * @param signal - Cancellation owned by the shared request lifecycle.
     * @returns The host's authorized extension discovery response.
     */
    load: async signal => {
      const resolvedQuery = query.value
      const requestUrl = getClientRequestUrl('/api/extensions/entity-tabs')
      for (const [key, value] of Object.entries(resolvedQuery)) {
        if (value) {
          requestUrl.searchParams.set(key, value)
        }
      }
      const response = await fetch(requestUrl, { signal })
      if (!response.ok) await throwFetchResponseError(response)
      return response.json()
    }
  })
  /** Refreshes discovery without exposing the shared request's settlement result. */
  const refresh = async (): Promise<void> => {
    await refreshRequest()
  }

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
