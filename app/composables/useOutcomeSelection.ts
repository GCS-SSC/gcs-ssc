import { isRef } from 'vue'
import type { FetchError } from 'ofetch'
import type { ComputedRef, Ref } from 'vue'
import type { TransferPaymentOutcomeItem } from '~~/shared/types/schemas'
import type { TransferPaymentOutcomeRow } from '~~/shared/types/transfer-payment-ui'

type OutcomeSelectionOptions = {
  programId: string
  outcomesRefreshKey?: Ref<number> | number
  initialOutcomeId?: string
}

/**
 * Manages outcome list loading and selected outcome state for transfer payments.
 *
 * @param options - Program id and selection behavior options.
 * @param options.programId - The ID of the transfer payment program to load outcomes for.
 * @param options.outcomesRefreshKey - Optional reactive key to trigger outcome list refreshes.
 * @param options.initialOutcomeId - The initially selected outcome ID, defaults to 'all'.
 * @returns Outcomes list, selected outcome id, and refresh controls.
 */
export const useOutcomeSelection = async ({
  programId,
  outcomesRefreshKey = 0,
  initialOutcomeId = 'all'
}: OutcomeSelectionOptions) => {
  const refreshKeyRef: Ref<number> = isRef(outcomesRefreshKey) ? outcomesRefreshKey : ref(outcomesRefreshKey)

  const {
    data: outcomesResponse,
    refresh: refreshOutcomes
  } = useFetch<{ items: TransferPaymentOutcomeRow[] }, FetchError, string>(
    `/api/transfer-payments/${programId}/outcomes`,
    {
      query: {
        page: 1,
        limit: 100
      }
    }
  )

  watch(refreshKeyRef, () => {
    void refreshOutcomes()
  })

  const outcomes: ComputedRef<TransferPaymentOutcomeItem[]> = computed(() => outcomesResponse.value?.items || [])

  const selectedOutcomeId: Ref<string> = ref(initialOutcomeId)

  watch(
    outcomes,
    items => {
      if (!selectedOutcomeId.value) {
        selectedOutcomeId.value = 'all'
        return
      }
      if (selectedOutcomeId.value !== 'all') {
        const stillExists = items?.some(item => String(item.id) === String(selectedOutcomeId.value))
        if (!stillExists) {
          selectedOutcomeId.value = 'all'
        }
      }
    },
    { immediate: true }
  )

  const outcomeSelectionEnabled: ComputedRef<boolean> = computed(() => selectedOutcomeId.value !== '')

  return {
    outcomes,
    selectedOutcomeId,
    outcomeSelectionEnabled,
    refreshOutcomes
  }
}
