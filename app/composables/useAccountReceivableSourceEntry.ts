import { computed, onScopeDispose, ref, shallowRef, toValue, watch } from 'vue'
import type { MaybeRefOrGetter, Ref } from 'vue'
import type { FetchError } from 'ofetch'
import type { AccountReceivableSourceEntry } from '~~/shared/types/account-receivable-source-entry'
import { appRouteLocations } from '~/utils/route-locations'

type SourceEntryState =
  | { kind: 'disabled' | 'closed' | 'open' | 'disposed' }
  | { kind: 'starting'; request: symbol; modal: 'closed' | 'open' }

/**
 * Loads an independently authorized AR starting context for one Claim or advance.
 * @param agreementId Owning Agreement identity.
 * @param kind Eligible source family.
 * @param sourceId Claim or advance Payment identity.
 * @param enabled Authoritative Agreement context capability to create an AR from this source.
 * @returns Authorized source initialization, refresh, modal state and detail navigation.
 */
export const useAccountReceivableSourceEntry = (agreementId: string, kind: 'claim' | 'advance', sourceId: string, enabled: MaybeRefOrGetter<boolean>) => {
  const state = shallowRef<SourceEntryState>({ kind: 'disabled' })
  const open = computed({
    get: () => state.value.kind === 'open' || (state.value.kind === 'starting' && state.value.modal === 'open'),
    /**
     * Applies modal binding updates without reviving inactive contexts.
     * @param value Whether the modal is open.
     */
    set: (value: boolean) => {
      if (state.value.kind === 'disabled' || state.value.kind === 'disposed') return
      if (state.value.kind === 'starting') state.value = { ...state.value, modal: value ? 'open' : 'closed' }
      else state.value = { kind: value ? 'open' : 'closed' }
    }
  })
  const starting = computed(() => state.value.kind === 'starting')
  const canCreate = computed(() => toValue(enabled))
  const toast = useLocalizedToast()
  const { showError } = useApiErrorToast()
  const { data, error, refresh: refreshSource } = useFetch<{ entry: AccountReceivableSourceEntry | null }, FetchError, string>(`/api/agreements/${agreementId}/account-receivables/source-entry`, {
    query: { kind, sourceId }, immediate: false, watch: false
  })
  const refresh = async () => {
    if (state.value.kind !== 'disposed' && canCreate.value) await refreshSource()
  }
  watch(canCreate, canLoad => {
    if (state.value.kind === 'disposed') return
    state.value = { kind: canLoad ? 'closed' : 'disabled' }
    if (canLoad) void refresh()
  }, { immediate: true, flush: 'sync' })
  const lastSuccessfulEntry: Ref<AccountReceivableSourceEntry | null> = ref(null)
  watch([data, error], () => {
    if (!error.value) lastSuccessfulEntry.value = data.value?.entry ?? null
  }, { immediate: true, flush: 'sync' })
  const entry = computed(() => canCreate.value ? lastSuccessfulEntry.value : null)
  onScopeDispose(() => {
    state.value = { kind: 'disposed' }
    lastSuccessfulEntry.value = null
  })
  /** Refreshes eligibility before opening the source-bound create modal. */
  const start = async () => {
    if (state.value.kind !== 'closed' && state.value.kind !== 'open') return
    if (!canCreate.value) return
    const request = Symbol('source-entry-activation')
    state.value = { kind: 'starting', request, modal: state.value.kind }
    const isCurrent = () => state.value.kind === 'starting' && state.value.request === request && canCreate.value
    try {
      await refresh()
      if (!isCurrent()) return
      if (error.value) showError(error.value)
      else if (!entry.value) toast.add({ title: toast.localized('account_receivable.create'), description: toast.localized('apiErrors.account_receivable.source_unavailable'), color: 'warning' })
      else open.value = true
    } catch (cause) {
      if (isCurrent()) showError(cause)
    } finally {
      if (state.value.kind === 'starting' && state.value.request === request) state.value = { kind: state.value.modal }
    }
  }
  const localePath = useLocalePath()
  const created = async (id: string) => {
    await navigateTo(localePath(appRouteLocations.agreementAccountReceivableDetail(agreementId, id)))
  }
  return { open, entry, refresh, created, canCreate, starting, start }
}
