import { computed, toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
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
  const key = computed(() => `payment-amount-calculators:${agreementId.value}`)
  const { data, status, error, refresh } = useAsyncData(key, async () => {
    const owner = agreementId.value
    const response = await $fetch<ExtensionPaymentAmountCalculatorsResponse, string>(
      '/api/extensions/payment-amount-calculators',
      { query: { operation: 'agreement.payments.create', agreementId: owner } }
    )
    return { agreementId: owner, response }
  }, { server: false })
  const isReady = computed(() => status.value === 'success' && data.value?.agreementId === agreementId.value)
  const items = computed(() => isReady.value ? data.value?.response.items ?? [] : [])
  const hasConflict = computed(() => isReady.value && data.value?.response.conflict === true)
  const calculator = computed(() => items.value.length === 1 && !hasConflict.value ? items.value[0] ?? null : null)

  return {
    calculator,
    hasConflict,
    isReady,
    error,
    refresh
  }
}
