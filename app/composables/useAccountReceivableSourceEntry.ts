import { computed, onScopeDispose, ref, toValue, watch } from 'vue'
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
  const starting: Ref<boolean> = ref(false)
  const canCreate = computed(() => toValue(enabled))
  const toast = useLocalizedToast()
  const { showError } = useApiErrorToast()
  let generation = 0
  let disposed = false
  const { data, error, refresh: refreshSource } = useFetch<{ entry: AccountReceivableSourceEntry | null }, FetchError, string>(`/api/agreements/${agreementId}/account-receivables/source-entry`, {
    query: { kind, sourceId }, immediate: false, watch: false
  })
  const refresh = async () => {
    if (!disposed && canCreate.value) await refreshSource()
  }
  watch(canCreate, canLoad => {
    generation += 1
    if (canLoad) void refresh()
    else open.value = false
  }, { immediate: true })
  const lastSuccessfulEntry: Ref<AccountReceivableSourceEntry | null> = ref(null)
  watch([data, error], () => {
    if (!error.value) lastSuccessfulEntry.value = data.value?.entry ?? null
  }, { immediate: true, flush: 'sync' })
  const entry = computed(() => canCreate.value ? lastSuccessfulEntry.value : null)
  onScopeDispose(() => {
    disposed = true
    generation += 1
    open.value = false
    lastSuccessfulEntry.value = null
  })
  /** Refreshes eligibility before opening the source-bound create modal. */
  const start = async () => {
    if (disposed || starting.value || !canCreate.value) return
    starting.value = true
    const currentGeneration = generation
    try {
      await refresh()
      if (disposed || generation !== currentGeneration || !canCreate.value) return
      if (error.value) showError(error.value)
      else if (!entry.value) toast.add({ title: toast.localized('account_receivable.create'), description: toast.localized('apiErrors.account_receivable.source_unavailable'), color: 'warning' })
      else open.value = true
    } catch (cause) {
      if (!disposed && generation === currentGeneration && canCreate.value) showError(cause)
    } finally {
      starting.value = false
    }
  }
  const localePath = useLocalePath()
  const created = async (id: string) => {
    await navigateTo(localePath(appRouteLocations.agreementAccountReceivableDetail(agreementId, id)))
  }
  return { open, entry, refresh, created, canCreate, starting, start }
}
