import { nanoid } from 'nanoid'
import { computed, onScopeDispose, ref, shallowRef, unref, watch } from 'vue'
import type { Ref } from 'vue'
import type { UseResourceTableOptions, ResourceTableReturn, ResourceTableStatus } from '~~/shared/types/resource-table'
import type { ListResponse } from '~~/shared/types/admin'
import type { FetchError } from 'ofetch'

/**
 * Serializes query data with stable object-key ordering.
 *
 * @param value - Query data to serialize.
 * @returns Stable serialized value.
 */
const stableSerialize = (value: unknown): string => {
  const serialized = JSON.stringify(value, (_key, currentValue: unknown) => {
    if (
      currentValue === null
      || typeof currentValue !== 'object'
      || Array.isArray(currentValue)
    ) {
      return currentValue
    }

    return Object.fromEntries(
      Object.entries(currentValue)
        .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    )
  })

  return serialized === undefined ? '' : serialized
}

/**
 * Creates shared reactive table state and remote resource fetching behavior.
 *
 * @param options - Resource URL and table options.
 * @returns Standardized table state and fetch controls.
 */
export const useResourceTable = <T>(options: UseResourceTableOptions): ResourceTableReturn<T> => {
  const fetchKey = `resource-table-${nanoid()}`
  const configuredStatusFilter = options.initialStatusFilter
  const configuredPageSize = options.initialPageSize
  const initialStatusFilter = configuredStatusFilter === undefined || configuredStatusFilter === ''
    ? 'all'
    : configuredStatusFilter
  const initialPageSize = configuredPageSize === undefined || configuredPageSize === 0 || Number.isNaN(configuredPageSize)
    ? 10
    : configuredPageSize
  const search: Ref<string> = ref('')
  const statusFilter: Ref<string> = ref(initialStatusFilter)
  const pagination: Ref<{ pageIndex: number; pageSize: number }> = ref({
    pageIndex: 0,
    pageSize: initialPageSize
  })

  const columnFilters: Ref<Array<Record<string, unknown>>> = ref([])
  const columnVisibility: Ref<Record<string, boolean>> = ref({})
  const rowSelection: Ref<Record<string, boolean>> = ref({})

  const fetchUrl = computed(() => unref(options.fetchUrl).trim())
  const staticQuery = computed(() => {
    if (options.query === undefined) {
      return {}
    }

    return unref(options.query)
  })
  const enabled = computed(() => {
    if (options.enabled === undefined) return true
    return unref(options.enabled)
  })
  const isFetchable = computed(() => {
    if (!enabled.value) {
      return false
    }

    return fetchUrl.value.length > 0
  })
  const resourceIdentity = computed(() =>
    `${fetchUrl.value}\u0000${stableSerialize(staticQuery.value)}\u0000${unref(options.contextKey) ?? ''}`
  )

  const query = computed(() => ({
    ...staticQuery.value,
    page: pagination.value.pageIndex + 1,
    limit: pagination.value.pageSize,
    search: search.value === '' ? undefined : search.value,
    status: statusFilter.value === 'all' ? undefined : statusFilter.value
  }))
  const requestState = computed(() => ({
    canFetch: isFetchable.value,
    identity: resourceIdentity.value,
    url: fetchUrl.value,
    query: query.value
  }))
  const initialRequest = {
    canFetch: isFetchable.value,
    query: { ...query.value },
    resourceIdentity: resourceIdentity.value
  }
  const {
    data: requestResponse,
    refresh: refreshRequest,
    clear,
    status: requestStatus,
    error: requestError
  } = useFetch<ListResponse<T>, FetchError, string>(fetchUrl, {
    key: fetchKey,
    query,
    immediate: initialRequest.canFetch,
    watch: false
  })

  const hasAcceptedInitialResponse = initialRequest.canFetch && requestStatus.value === 'success'
  let initialRequestState: 'pending' | 'settled' = initialRequest.canFetch
    && requestStatus.value !== 'success'
    && requestStatus.value !== 'error'
    ? 'pending'
    : 'settled'
  let resolveInitialRequest: () => void = () => {}
  const initialRequestCompletion = new Promise<void>(resolve => {
    resolveInitialRequest = resolve
  })
  if (initialRequestState === 'settled') {
    resolveInitialRequest()
  }
  type AcceptedEvidence = { kind: 'absent' } | {
    kind: 'accepted'
    response: ListResponse<T> | null | undefined
    query: Record<string, unknown>
    resourceIdentity: string
  }
  const evidence: Ref<AcceptedEvidence> = shallowRef(hasAcceptedInitialResponse
    ? { kind: 'accepted', response: requestResponse.value, query: initialRequest.query, resourceIdentity: initialRequest.resourceIdentity }
    : { kind: 'absent' })
  const status: Ref<ResourceTableStatus> = ref(requestStatus.value)
  const error: Ref<FetchError | undefined> = shallowRef(requestError.value)
  type RequestOwner = { kind: 'initial' } | { kind: 'refresh'; token: object } | { kind: 'disabled' } | { kind: 'disposed' }
  let requestOwner: RequestOwner = { kind: 'initial' }
  let refreshTransport: { kind: 'idle' } | { kind: 'running'; request: Promise<void> } = { kind: 'idle' }
  watch([requestResponse, requestStatus, requestError], ([nextResponse, nextStatus, nextError]) => {
    if (initialRequestState === 'pending' && (nextStatus === 'success' || nextStatus === 'error')) {
      initialRequestState = 'settled'
      resolveInitialRequest()
    }

    if (requestOwner.kind !== 'initial') {
      return
    }

    status.value = nextStatus
    error.value = nextError
    if (initialRequest.canFetch && nextStatus === 'success') {
      evidence.value = { kind: 'accepted', response: nextResponse, query: initialRequest.query, resourceIdentity: initialRequest.resourceIdentity }
    }
  })
  const displayedResponse = computed(() => {
    if (evidence.value.kind !== 'accepted' || evidence.value.resourceIdentity !== resourceIdentity.value) {
      return undefined
    }

    return evidence.value.response
  })
  const displayedQuery = computed(() => {
    if (evidence.value.kind !== 'accepted' || evidence.value.resourceIdentity !== resourceIdentity.value) {
      return undefined
    }

    return evidence.value.query
  })
  const items = computed(() => {
    const responseItems: unknown = displayedResponse.value?.items
    return Array.isArray(responseItems) ? responseItems : []
  })
  const totalRecords = computed(() => {
    const total: unknown = displayedResponse.value?.total
    return typeof total === 'number' && !Number.isNaN(total) ? total : 0
  })

  watch([search, statusFilter], () => {
    pagination.value.pageIndex = 0
  })

  /** Refreshes the current request and commits only the newest matching result. */
  const refresh = async (): Promise<void> => {
    if (!isFetchable.value || requestOwner.kind === 'disposed') {
      return
    }

    const token = {}
    requestOwner = { kind: 'refresh', token }
    const ownsRequest = () => requestOwner.kind === 'refresh' && requestOwner.token === token
    const requestedResourceIdentity = resourceIdentity.value
    const requestedQuery = { ...query.value }
    status.value = 'pending'
    error.value = undefined

    if (initialRequestState === 'pending') {
      await initialRequestCompletion
    }

    if (
      !ownsRequest()
      || requestedResourceIdentity !== resourceIdentity.value
    ) {
      return
    }

    while (refreshTransport.kind === 'running') {
      try {
        await refreshTransport.request
      } catch {
        // The request owner publishes the current error; queued refreshes only wait for isolation.
      }

      if (
        !ownsRequest()
        || requestedResourceIdentity !== resourceIdentity.value
      ) {
        return
      }
    }

    const currentRefreshRequest = refreshRequest()
    refreshTransport = { kind: 'running', request: currentRefreshRequest }
    try {
      await currentRefreshRequest
    } catch (requestFailure: unknown) {
      if (
        ownsRequest()
        && requestedResourceIdentity === resourceIdentity.value
      ) {
        status.value = 'error'
        error.value = requestError.value
        throw requestFailure
      }
      return
    } finally {
      if (refreshTransport.kind === 'running' && refreshTransport.request === currentRefreshRequest) {
        refreshTransport = { kind: 'idle' }
      }
    }

    if (
      !ownsRequest()
      || requestedResourceIdentity !== resourceIdentity.value
    ) {
      return
    }

    status.value = requestStatus.value
    error.value = requestError.value
    if (requestStatus.value === 'success') {
      evidence.value = { kind: 'accepted', response: requestResponse.value, query: requestedQuery, resourceIdentity: requestedResourceIdentity }
    }
  }

  /** Retries the exact currently rendered table request and leaves failures in durable table state. */
  const retry = async (): Promise<void> => {
    try {
      await refresh()
    } catch {
      // The current request session publishes its error for the shared durable alert.
    }
  }

  watch(isFetchable, canFetch => {
    if (!canFetch) {
      if (requestOwner.kind !== 'disposed') requestOwner = { kind: 'disabled' }
      if (initialRequestState === 'pending') {
        initialRequestState = 'settled'
        resolveInitialRequest()
      }
      evidence.value = { kind: 'absent' }
      clear()
      status.value = 'idle'
      error.value = undefined
    }
  })

  watch(requestState, ({ canFetch }) => {
    if (!canFetch) {
      return
    }

    void refresh().catch(() => undefined)
  }, { deep: true })

  onScopeDispose(() => {
    requestOwner = { kind: 'disposed' }
    if (initialRequestState === 'pending') {
      initialRequestState = 'settled'
      resolveInitialRequest()
    }
  }, true)

  return {
    search,
    statusFilter,
    pagination,
    columnFilters,
    columnVisibility,
    rowSelection,
    items,
    totalRecords,
    response: displayedResponse,
    responseQuery: displayedQuery,
    refresh,
    retry,
    status,
    error
  }
}
