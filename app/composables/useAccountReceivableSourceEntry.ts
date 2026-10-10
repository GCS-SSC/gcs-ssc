import { computed, ref, toValue, watch } from 'vue'
import type { MaybeRefOrGetter, Ref } from 'vue'
import type { FetchError } from 'ofetch'
import type { AccountReceivableSourceEntry } from '~~/shared/types/account-receivable-source-entry'
import { appRouteLocations } from '~/utils/route-locations'

/**
 * Loads an independently authorized AR starting context for one Claim or advance.
 * @param agreementId Owning Agreement identity.
 * @param kind Eligible source family.
 * @param sourceId Claim or advance Payment identity.
 * @param enabled Authoritative Agreement context capability to create an AR from this source.
 * @returns Authorized source initialization, refresh, modal state and detail navigation.
 */
export const useAccountReceivableSourceEntry = (agreementId: string, kind: 'claim' | 'advance', sourceId: string, enabled: MaybeRefOrGetter<boolean>) => {
  const open: Ref<boolean> = ref(false)
  const { data, refresh: refreshSource } = useFetch<{ entry: AccountReceivableSourceEntry | null }, FetchError, string>(`/api/agreements/${agreementId}/account-receivables/source-entry`, {
    query: { kind, sourceId }, immediate: false, watch: false
  })
  const refresh = async () => {
    if (toValue(enabled)) await refreshSource()
  }
  watch(() => toValue(enabled), canLoad => {
    if (canLoad) void refresh()
    else open.value = false
  }, { immediate: true })
  const entry = computed(() => toValue(enabled) ? data.value?.entry ?? null : null)
  const localePath = useLocalePath()
  const created = async (id: string) => {
    await navigateTo(localePath(appRouteLocations.agreementAccountReceivableDetail(agreementId, id)))
  }
  return { open, entry, refresh, created }
}
