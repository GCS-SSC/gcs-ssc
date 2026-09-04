import { computed, getCurrentInstance, onBeforeUnmount, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { AdminCommonSelectOption } from '~~/shared/types/admin-common-ui'
import type { TransferPaymentProfileRow } from '~~/shared/types/transfer-payment-ui'
import { RoleSchema, type RoleInput } from '~~/shared/types/schemas/rbac'

interface UseRoleModalStateOptions {
  state: Ref<Partial<RoleInput>>
  open?: Ref<boolean>
  pageSize?: number
}

interface TransferPaymentRequest {
  generation: number
  controller: AbortController
}

type TransferPaymentResolution =
  | { status: 'loading' }
  | { status: 'resolved'; item: TransferPaymentProfileRow }
  | { status: 'unavailable' }
  | { status: 'error' }

interface SelectedTransferPayment {
  id: string
  name: string
  loading: boolean
  retryable?: boolean
}

/**
 * Normalizes a nullable agency identifier for lookup queries.
 * @param value - Candidate agency identifier.
 * @returns The normalized identifier, or null when absent.
 */
const normalizeAgencyId = (value: string | number | null | undefined) => {
  if (value === undefined || value === null || value === '') {
    return null
  }

  return String(value)
}

/**
 * Resolves an HTTP status code from common client-fetch error shapes.
 *
 * @param error - Candidate API error.
 * @returns The HTTP status code when present.
 */
const getHttpStatusCode = (error: unknown): number | null => {
  if (!error || typeof error !== 'object') {
    return null
  }

  const errorRecord = error as Record<string, unknown>
  const response = errorRecord.response && typeof errorRecord.response === 'object'
    ? errorRecord.response as Record<string, unknown>
    : {}
  const data = errorRecord.data && typeof errorRecord.data === 'object'
    ? errorRecord.data as Record<string, unknown>
    : {}
  const status = errorRecord.statusCode
    ?? errorRecord.status
    ?? response.status
    ?? data.statusCode
  const numericStatus = Number(status)
  return Number.isInteger(numericStatus) ? numericStatus : null
}

/**
 * Keeps role scope state and selected program display rows synchronized.
 * @param root0 - Role modal state options.
 * @param root0.state - Mutable role form state.
 * @param root0.open - Optional modal visibility lifecycle.
 * @param root0.pageSize - Lookup result page size.
 * @returns Role lookup state and actions.
 */
export const useRoleModalState = ({
  state,
  open,
  pageSize = 10
}: UseRoleModalStateOptions) => {
  const { t, locale } = useI18n()
  const { showError } = useApiErrorToast()
  const { createValidator } = useZodI18n()
  const validate = createValidator(RoleSchema)
  const {
    agencyOptions,
    agencySelection,
    updateAgencySelection
  } = useRoleScopeSelection(state)

  const selectedTransferPaymentToAdd: Ref<string | undefined> = ref(undefined)
  const transferPaymentResolutions: Ref<Record<string, TransferPaymentResolution>> = ref({})
  const modalOpen: Ref<boolean> = open === undefined ? ref(true) : open
  const transferPaymentRequestsById = new Map<string, TransferPaymentRequest>()
  let transferPaymentLifecycleGeneration = 0
  let transferPaymentRequestSequence = 0
  let observedRoleState = state.value
  let observedAgencyId = normalizeAgencyId(state.value.agency_id)

  const selectedTransferPaymentIds = computed<string[]>(() => {
    const values = state.value.transfer_payment_ids
    return Array.isArray(values) ? values.map(value => String(value)) : []
  })
  const roleId = computed<string | undefined>(() => {
    const id = state.value.id
    return id ? String(id) : undefined
  })
  const isUpdate = computed<boolean>(() => roleId.value !== undefined)
  const agencyLookupQuery = computed<Record<string, string>>(() => {
    const id = roleId.value
    const query: Record<string, string> = {}
    if (id !== undefined) {
      query.role_id = id
    }
    return query
  })

  const agencyPrependItems = computed<AdminCommonSelectOption[]>(() =>
    agencyOptions.value.map(option => ({
      label: option.label,
      value: option.value
    }))
  )

  const selectedAgencyFetchUrl = computed<string | undefined>(() => {
    const agencyId = normalizeAgencyId(state.value.agency_id)
    if (!agencyId) {
      return undefined
    }

    const id = roleId.value
    const roleQuery = id === undefined ? '' : `?role_id=${encodeURIComponent(id)}`
    return `/api/roles/lookups/agencies/${encodeURIComponent(agencyId)}${roleQuery}`
  })

  const transferPaymentQuery = computed<Record<string, string>>(() => {
    const agencyId = normalizeAgencyId(state.value.agency_id)
    const id = roleId.value
    const query: Record<string, string> = {
      agency_id: agencyId ? agencyId : ''
    }
    if (id !== undefined) {
      query.role_id = id
    }
    return query
  })

  /**
   * Builds the authorized detail endpoint for a selected program.
   * @param transferPaymentId - Selected transfer-payment identifier.
   * @returns The scoped lookup URL.
   */
  const getSelectedTransferPaymentFetchUrl = (transferPaymentId: string): string => {
    const agencyId = normalizeAgencyId(state.value.agency_id)
    const id = roleId.value
    const query = id === undefined
      ? `agency_id=${encodeURIComponent(agencyId ? agencyId : '')}`
      : `role_id=${encodeURIComponent(id)}`
    return `/api/roles/lookups/transfer-payments/${encodeURIComponent(transferPaymentId)}?${query}`
  }

  const selectedTransferPayments = computed<SelectedTransferPayment[]>(() =>
    selectedTransferPaymentIds.value.map(id => {
      const resolution = transferPaymentResolutions.value[id]
      if (!resolution || resolution.status === 'loading') {
        return { id, name: t('common.loading'), loading: true }
      }

      if (resolution.status === 'unavailable') {
        return { id, name: t('role.assignment.program_unavailable'), loading: false }
      }

      if (resolution.status === 'error') {
        return {
          id,
          name: t('role.assignment.program_load_failed'),
          loading: false,
          retryable: true
        }
      }

      const name = locale.value === 'fr'
        ? String(resolution.item.egcs_tp_name_fr)
        : String(resolution.item.egcs_tp_name_en)
      return { id, name, loading: false }
    })
  )

  /**
   * Replaces the display-resolution state for one selected program.
   * @param id - Selected transfer-payment identifier.
   * @param resolution - Current display resolution.
   */
  const setTransferPaymentResolution = (
    id: string,
    resolution: TransferPaymentResolution
  ) => {
    transferPaymentResolutions.value = {
      ...transferPaymentResolutions.value,
      [id]: resolution
    }
  }

  /**
   * Invalidates every selected-program request after a role or agency lifecycle change.
   */
  const invalidateAllTransferPaymentHydration = () => {
    transferPaymentLifecycleGeneration += 1
    transferPaymentRequestsById.forEach(request => request.controller.abort())
    transferPaymentRequestsById.clear()
  }

  /**
   * Checks whether one selected-program response still owns its row state.
   *
   * @param id - Transfer-payment identifier.
   * @param lifecycleGeneration - Lifecycle captured when the request started.
   * @param requestGeneration - Per-id generation captured when the request started.
   * @returns Whether the request can still update the selected row.
   */
  const isCurrentTransferPaymentRequest = (
    id: string,
    lifecycleGeneration: number,
    requestGeneration: number
  ) => {
    return lifecycleGeneration === transferPaymentLifecycleGeneration
      && transferPaymentRequestsById.get(id)?.generation === requestGeneration
  }

  /**
   * Resolves selected program rows and rejects details outside the current agency scope.
   * @param agencyId - Agency that every resolved program must belong to.
   * @param ids - Selected transfer-payment identifiers to resolve.
   * @param lifecycleGeneration - Modal lifecycle captured when hydration starts.
   * @param force - Whether to retry rows with an existing terminal resolution.
   */
  const hydrateSelectedTransferPayments = async (
    agencyId: string,
    ids: string[],
    lifecycleGeneration: number,
    force = false
  ) => {
    const idsToHydrate = ids.filter(id => {
      if (transferPaymentRequestsById.has(id)) {
        return false
      }

      const resolution = transferPaymentResolutions.value[id]
      return force
        || !resolution
        || (
          resolution.status === 'resolved'
          && String(resolution.item.egcs_tp_agency) !== agencyId
        )
    })

    const requests = idsToHydrate.map(id => {
      const requestGeneration = ++transferPaymentRequestSequence
      const controller = new AbortController()
      transferPaymentRequestsById.set(id, { generation: requestGeneration, controller })
      if (transferPaymentResolutions.value[id]?.status !== 'loading') {
        setTransferPaymentResolution(id, { status: 'loading' })
      }
      return { id, requestGeneration, controller }
    })

    await Promise.all(requests.map(async ({ id, requestGeneration, controller }) => {
      try {
        const item = await $fetch<TransferPaymentProfileRow, string>(
          getSelectedTransferPaymentFetchUrl(id),
          { signal: controller.signal }
        )
        if (!isCurrentTransferPaymentRequest(id, lifecycleGeneration, requestGeneration)) {
          return
        }

        const itemMatchesScope = String(item.id) === id
          && String(item.egcs_tp_agency) === agencyId
        setTransferPaymentResolution(
          id,
          itemMatchesScope ? { status: 'resolved', item } : { status: 'unavailable' }
        )
      } catch (error: unknown) {
        if (!isCurrentTransferPaymentRequest(id, lifecycleGeneration, requestGeneration)) {
          return
        }

        if (getHttpStatusCode(error) === 404) {
          setTransferPaymentResolution(id, { status: 'unavailable' })
          return
        }

        setTransferPaymentResolution(id, { status: 'error' })
        showError(error)
      } finally {
        if (isCurrentTransferPaymentRequest(id, lifecycleGeneration, requestGeneration)) {
          transferPaymentRequestsById.delete(id)
        }
      }
    }))
  }

  /**
   * Retries one selected program after an operational hydration failure.
   *
   * @param transferPaymentId - Selected transfer-payment id to retry.
   */
  const retrySelectedTransferPayment = async (transferPaymentId: string) => {
    const id = String(transferPaymentId)
    const agencyId = normalizeAgencyId(state.value.agency_id)
    if (
      !agencyId
      || !selectedTransferPaymentIds.value.includes(id)
      || transferPaymentResolutions.value[id]?.status !== 'error'
    ) {
      return
    }

    setTransferPaymentResolution(id, { status: 'loading' })
    await hydrateSelectedTransferPayments(
      agencyId,
      [id],
      transferPaymentLifecycleGeneration,
      true
    )
  }

  /** Adds the pending transfer-payment selection to the role state. */
  const addSelectedTransferPayment = () => {
    const transferPaymentId = selectedTransferPaymentToAdd.value
    if (!transferPaymentId) {
      return
    }

    const existingIds = new Set(selectedTransferPaymentIds.value)
    existingIds.add(String(transferPaymentId))
    state.value.transfer_payment_ids = [...existingIds]
    selectedTransferPaymentToAdd.value = undefined
  }

  const removeSelectedTransferPayment = (transferPaymentId: string) => {
    state.value.transfer_payment_ids = selectedTransferPaymentIds.value
      .filter(id => id !== String(transferPaymentId))
  }

  watch(
    [() => state.value, () => state.value.agency_id],
    ([currentRoleState, agencyId]) => {
      const normalizedAgencyId = normalizeAgencyId(agencyId)
      const hasRoleStateChanged = currentRoleState !== observedRoleState
      const hasScopeChanged = normalizedAgencyId !== observedAgencyId
      observedRoleState = currentRoleState
      observedAgencyId = normalizedAgencyId

      if (hasRoleStateChanged || hasScopeChanged) {
        invalidateAllTransferPaymentHydration()
        transferPaymentResolutions.value = {}
        selectedTransferPaymentToAdd.value = undefined
      }

      if (hasScopeChanged && !hasRoleStateChanged) {
        currentRoleState.transfer_payment_ids = []
      }

      if (!normalizedAgencyId) {
        selectedTransferPaymentToAdd.value = undefined
      }
    }
  )

  watch(
    [() => state.value.agency_id, selectedTransferPaymentIds],
    async ([agencyId, ids]) => {
      const normalizedAgencyId = normalizeAgencyId(agencyId)
      const selectedIdSet = new Set(ids)
      transferPaymentRequestsById.forEach((request, id) => {
        if (!selectedIdSet.has(id)) {
          request.controller.abort()
          transferPaymentRequestsById.delete(id)
        }
      })
      transferPaymentResolutions.value = Object.fromEntries(
        Object.entries(transferPaymentResolutions.value)
          .filter(([id]) => selectedIdSet.has(id))
      )
      if (!modalOpen.value || !normalizedAgencyId || ids.length === 0) {
        return
      }

      await hydrateSelectedTransferPayments(
        normalizedAgencyId,
        ids,
        transferPaymentLifecycleGeneration
      )
    },
    { immediate: true }
  )

  watch(modalOpen, async isOpen => {
    if (!isOpen) {
      invalidateAllTransferPaymentHydration()
      transferPaymentResolutions.value = {}
      selectedTransferPaymentToAdd.value = undefined
      return
    }

    const agencyId = normalizeAgencyId(state.value.agency_id)
    if (!agencyId || selectedTransferPaymentIds.value.length === 0) {
      return
    }

    await hydrateSelectedTransferPayments(
      agencyId,
      selectedTransferPaymentIds.value,
      transferPaymentLifecycleGeneration
    )
  })

  if (getCurrentInstance()) {
    onBeforeUnmount(() => {
      invalidateAllTransferPaymentHydration()
    })
  }

  return {
    t,
    validate,
    lookupPageSize: pageSize,
    isUpdate,
    agencySelection,
    updateAgencySelection,
    agencyPrependItems,
    agencyLookupQuery,
    selectedAgencyFetchUrl,
    transferPaymentQuery,
    selectedTransferPaymentIds,
    selectedTransferPaymentToAdd,
    selectedTransferPayments,
    addSelectedTransferPayment,
    retrySelectedTransferPayment,
    removeSelectedTransferPayment
  }
}
