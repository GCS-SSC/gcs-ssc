import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import type { FetchError } from 'ofetch'
import type { AccountReceivableSourceEntry } from '~~/shared/types/account-receivable-source-entry'
import { appRouteLocations } from '~/utils/route-locations'

/**
 * Loads an independently authorized AR starting context for one Claim or advance.
 * @param agreementId Owning Agreement identity.
 * @param kind Eligible source family.
 * @param sourceId Claim or advance Payment identity.
 * @returns Authorized source initialization, modal state and detail navigation.
 */
export const useAccountReceivableSourceEntry = (agreementId: string, kind: 'claim' | 'advance', sourceId: string) => {
  const open: Ref<boolean> = ref(false)
  const { data } = useFetch<{ entry: AccountReceivableSourceEntry | null }, FetchError, string>(`/api/agreements/${agreementId}/account-receivables/source-entry`, {
    query: { kind, sourceId }
  })
  const entry = computed(() => data.value?.entry ?? null)
  const localePath = useLocalePath()
  const created = async (id: string) => {
    await navigateTo(localePath(appRouteLocations.agreementAccountReceivableDetail(agreementId, id)))
  }
  return { open, entry, created }
}
