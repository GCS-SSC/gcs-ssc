import { computed, toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type { FetchError } from 'ofetch'
import type { ExtensionPaymentAmountCalculatorsResponse } from '~~/shared/types/schemas/extensions'

/**
 * Selects the sole non-conflicting extension payment calculator for an agreement.
 *
 * @param options - Calculator lookup options.
 * @param options.agreementId - Agreement whose calculators should be loaded.
 * @returns The selected calculator and conflict state.
 */
export const useExtensionPaymentAmountCalculators = (options: {
  agreementId: MaybeRefOrGetter<string>
}) => {
  const agreementId = computed(() => toValue(options.agreementId))
  const query = computed(() => ({
    operation: 'agreement.payments.create',
    agreementId: agreementId.value
  }))
  const { data } = useFetch<ExtensionPaymentAmountCalculatorsResponse, FetchError, string>(
    '/api/extensions/payment-amount-calculators',
    {
      query,
      /**
       * Builds the empty response used before the request completes.
       *
       * @returns Empty calculator response.
       */
      default: (): ExtensionPaymentAmountCalculatorsResponse => ({
        operation: 'agreement.payments.create',
        items: [],
        conflict: false
      }),
      server: false,
      watch: [() => agreementId.value]
    }
  )

  const items = computed(() => data.value?.items ?? [])
  const hasConflict = computed(() => data.value?.conflict === true)
  const calculator = computed(() => items.value.length === 1 && !hasConflict.value ? items.value[0] ?? null : null)

  return {
    calculator,
    hasConflict
  }
}
