import { computed, isRef, ref, watch } from 'vue'
import type { FetchError } from 'ofetch'
import type { Ref } from 'vue'
import type { AgencyOptionItem, ListResponse } from '~~/shared/types/admin'

type AgencyOptionsInput = {
  selectedAgencyId?: Ref<string | null | undefined> | string | null | undefined
}

/**
 * Returns agency options, optionally ensuring a selected agency is present in the options list.
 *
 * @param input - Optional selected agency identifier reference.
 * @param input.selectedAgencyId - Currently selected agency identifier or ref.
 * @returns Computed agency options for selectors.
 */
export const useAgencyOptions = ({ selectedAgencyId }: AgencyOptionsInput = {}) => {
  const selectedAgencyIdRef: Ref<string | null | undefined> = isRef(selectedAgencyId)
    ? selectedAgencyId
    : ref(selectedAgencyId)

  const { data: agenciesResponse } = useFetch<
    ListResponse<AgencyOptionItem>,
    FetchError,
    '/api/agency'
  >('/api/agency', {
    query: {
      page: 1,
      limit: 100
    }
  })

  const selectedAgencyUrl = computed(() =>
    selectedAgencyIdRef.value ? `/api/agency/${String(selectedAgencyIdRef.value)}` : ''
  )
  const {
    data: selectedAgencyResponse,
    refresh: refreshSelectedAgency
  } = useFetch<AgencyOptionItem, FetchError, string>(selectedAgencyUrl, {
    immediate: false
  })

  watch(
    selectedAgencyIdRef,
    value => {
      if (!value) return
      void refreshSelectedAgency()
    },
    { immediate: true }
  )

  const agencies = computed<AgencyOptionItem[]>(() => {
    const items = agenciesResponse.value?.items ? [...agenciesResponse.value.items] : []
    const selectedAgency = selectedAgencyResponse.value
    const selectedAgencyId = selectedAgencyIdRef.value

    if (!selectedAgency || !selectedAgencyId || String(selectedAgency.id) !== String(selectedAgencyId)) {
      return items
    }

    const hasSelectedAgency = items.some(item => String(item.id) === String(selectedAgency.id))
    if (hasSelectedAgency) {
      return items
    }

    return [...items, selectedAgency]
  })

  return {
    agencies
  }
}
