import { computed, ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'
/* eslint-disable jsdoc/require-jsdoc -- The client factory exposes a compact cache contract exercised by focused tests. */
import type { StatusDefinition } from '~~/shared/types/status'
import { throwFetchResponseError } from '~/utils/fetch-error'

const STATUS_CATALOG_TTL_MS = 60 * 60 * 1000

type StatusCatalogState = {
  userId: string
  generation: number
  definitions: StatusDefinition[]
  fullLoadedAt: number
  agencyLoadedAt: Record<string, number>
  status: 'idle' | 'pending' | 'resolved'
}

type CatalogRequest = {
  generation: number
  id: number
  promise: Promise<void>
}

type StatusCatalogClientOptions = {
  initialUserId?: string
  fetcher?: typeof globalThis.fetch
  now?: () => number
}

export type StatusCatalogClient = {
  state: Ref<StatusCatalogState>
  byId: ComputedRef<Map<string, StatusDefinition>>
  setUser: (userId: string) => void
  load: (force?: boolean) => Promise<void>
  refreshAgency: (agencyId: string) => Promise<void>
  getById: (id: string | null | undefined) => StatusDefinition | undefined
  getForAgency: (agencyId: string, includeDeleted?: boolean) => StatusDefinition[]
}

declare module '#app' {
  interface NuxtApp {
    $statusCatalog: StatusCatalogClient
  }
}

const emptyState = (userId: string, generation = 0): StatusCatalogState => ({
  userId,
  generation,
  definitions: [],
  fullLoadedAt: 0,
  agencyLoadedAt: {},
  status: 'idle'
})

const asDefinitions = (value: unknown): StatusDefinition[] => Array.isArray(value) ? value as StatusDefinition[] : []

export const createStatusCatalogClient = (options: StatusCatalogClientOptions = {}): StatusCatalogClient => {
  const fetcher = options.fetcher ?? globalThis.fetch
  const now = options.now ?? Date.now
  const state: Ref<StatusCatalogState> = ref(emptyState(options.initialUserId ?? 'anon'))
  const byId: ComputedRef<Map<string, StatusDefinition>> = computed(() => new Map(state.value.definitions.map(item => [item.id, item])))
  const agencyRevisions = new Map<string, number>()
  const agencyRequests = new Map<string, CatalogRequest>()
  let fullRequest: CatalogRequest | null = null
  let nextRequestId = 0
  let fullLoadRequested = false
  const agencyRefreshRequested = new Set<string>()

  const hasCurrentRequest = (): boolean => fullRequest?.generation === state.value.generation
    || [...agencyRequests.values()].some(request => request.generation === state.value.generation)

  const updateRequestStatus = (): void => {
    state.value = {
      ...state.value,
      status: hasCurrentRequest() ? 'pending' : state.value.definitions.length > 0 || state.value.fullLoadedAt > 0 ? 'resolved' : 'idle'
    }
  }

  const requestDefinitions = async (url: string): Promise<StatusDefinition[]> => {
    const response = await fetcher(url)
    if (!response.ok) await throwFetchResponseError(response)
    return asDefinitions(await response.json())
  }

  const setUser = (userId: string): void => {
    if (state.value.userId === userId) return
    state.value = emptyState(userId, state.value.generation + 1)
    agencyRevisions.clear()
    agencyRequests.clear()
    fullRequest = null
    if (userId !== 'anon' && fullLoadRequested) void load()
    if (userId !== 'anon') {
      for (const agencyId of agencyRefreshRequested) void refreshAgency(agencyId).catch(() => undefined)
    }
  }

  const load = async (force = false): Promise<void> => {
    fullLoadRequested = true
    if (state.value.userId === 'anon') return
    if (!force && state.value.fullLoadedAt > 0 && now() - state.value.fullLoadedAt < STATUS_CATALOG_TTL_MS) return
    if (!force && fullRequest?.generation === state.value.generation) return await fullRequest.promise

    const requestedGeneration = state.value.generation
    const requestId = ++nextRequestId
    const revisionsAtStart = new Map(agencyRevisions)
    const promise = Promise.resolve()
      .then(async () => await requestDefinitions('/api/statuses'))
      .then(definitions => {
        if (state.value.generation !== requestedGeneration || fullRequest?.id !== requestId) return
        const refreshedAgencies = new Set([...agencyRevisions.entries()]
          .filter(([agencyId, revision]) => revision !== (revisionsAtStart.get(agencyId) ?? 0))
          .map(([agencyId]) => agencyId))
        const preservedDefinitions = state.value.definitions.filter(definition => refreshedAgencies.has(definition.agencyId))
        state.value = {
          ...state.value,
          definitions: [...definitions.filter(definition => !refreshedAgencies.has(definition.agencyId)), ...preservedDefinitions],
          fullLoadedAt: now()
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (fullRequest?.generation === requestedGeneration && fullRequest.id === requestId) fullRequest = null
        if (state.value.generation === requestedGeneration) updateRequestStatus()
      })
    fullRequest = { generation: requestedGeneration, id: requestId, promise }
    updateRequestStatus()
    return await promise
  }

  const refreshAgency = async (agencyId: string): Promise<void> => {
    agencyRefreshRequested.add(agencyId)
    if (state.value.userId === 'anon') return
    const requestedGeneration = state.value.generation
    const requestId = ++nextRequestId
    const promise = Promise.resolve()
      .then(async () => await requestDefinitions(`/api/agency/${agencyId}/statuses`))
      .then(definitions => {
        const currentRequest = agencyRequests.get(agencyId)
        if (state.value.generation !== requestedGeneration || currentRequest?.id !== requestId) return
        agencyRevisions.set(agencyId, (agencyRevisions.get(agencyId) ?? 0) + 1)
        state.value = {
          ...state.value,
          definitions: [...state.value.definitions.filter(item => item.agencyId !== agencyId), ...definitions],
          agencyLoadedAt: { ...state.value.agencyLoadedAt, [agencyId]: now() }
        }
      })
      .finally(() => {
        const currentRequest = agencyRequests.get(agencyId)
        if (currentRequest?.generation === requestedGeneration && currentRequest.id === requestId) agencyRequests.delete(agencyId)
        if (state.value.generation === requestedGeneration) updateRequestStatus()
      })
    agencyRequests.set(agencyId, { generation: requestedGeneration, id: requestId, promise })
    updateRequestStatus()
    return await promise
  }

  const getById = (id: string | null | undefined): StatusDefinition | undefined => id ? byId.value.get(id) : undefined
  const getForAgency = (agencyId: string, includeDeleted = false): StatusDefinition[] => state.value.definitions
    .filter(item => item.agencyId === agencyId && (includeDeleted || !item.deleted))

  return { state, byId, setUser, load, refreshAgency, getById, getForAgency }
}

export const useStatusCatalog = (): StatusCatalogClient => useNuxtApp().$statusCatalog
