import { computed, ref, shallowReactive, shallowRef } from 'vue'
import type { ComputedRef, Ref } from 'vue'

type CrudModalOptions<T, U> =
  | {
    createState: () => U
    updateState: (item: T) => U
  }
  | {
    createState?: never
    updateState: (item: T) => U
  }

export type CrudModalSession = number

type CrudModalState<U> =
  | { kind: 'closed' }
  | { kind: 'create' | 'update'; session: CrudModalSession; draft: Ref<U | null> }

export type CrudModalSessionLifecycle =
  | {
    captureSession: () => CrudModalSession | null
    closeSession: (session: CrudModalSession | null) => boolean
  }
  | {
    captureSession?: never
    closeSession?: never
  }

/**
 * @param captureSession - Active session getter.
 * @returns Session pending controls.
 */
export const useCrudModalPending = (captureSession: () => CrudModalSession | null) => {
  const pendingSessions = shallowReactive(new Set<CrudModalSession | null>())
  const isPending: ComputedRef<boolean> = computed(() => pendingSessions.has(captureSession()))

  /**
   * @param session - Request session.
   * @returns Whether ownership was acquired.
   */
  const begin = (session: CrudModalSession | null) => {
    if (pendingSessions.has(session)) return false
    pendingSessions.add(session)
    return true
  }

  /** @param session - Completed request session. */
  const end = (session: CrudModalSession | null) => {
    pendingSessions.delete(session)
  }

  return { isPending, begin, end }
}

/**
 * Owns closed/create/update sessions; open through the mappers and close through v-model.
 *
 * @param options - Explicit state mappers for the supported create/update operations.
 * @returns Reactive modal state and control handlers.
 *
 * @example
 * ```typescript
 * const modal = useCrudModal<User>({
 *   createState: () => ({}),
 *   updateState: user => ({ ...user })
 * })
 * modal.openCreate()
 * ```
 */
export const useCrudModal = <T, U = Partial<T>>(options: CrudModalOptions<T, U>) => {
  const modalState: Ref<CrudModalState<U>> = shallowRef({ kind: 'closed' })
  let nextSession: CrudModalSession = 0

  const isOpen = computed({
    get: () => modalState.value.kind !== 'closed',
    set: (open: boolean) => {
      if (!open) close()
    }
  })
  const selected = computed({
    get: () => modalState.value.kind === 'closed' ? null : modalState.value.draft.value,
    set: (draft: U | null) => {
      if (modalState.value.kind !== 'closed') modalState.value.draft.value = draft
    }
  })

  /**
   * @param kind - Mapped editing operation.
   * @param value - Initial editable draft.
   */
  const beginSession = (kind: 'create' | 'update', value: U) => {
    const draft: Ref<U | null> = ref(null)
    draft.value = value
    modalState.value = { kind, session: ++nextSession, draft }
  }

  /** Opens the modal with state produced by the configured create mapper. */
  const openCreate = () => {
    if (!options.createState) {
      throw new Error('useCrudModal requires createState to open create mode')
    }

    beginSession('create', options.createState())
  }

  /**
   * Opens the modal with state produced by the configured update mapper.
   *
   * @param item - Item to map into editable state.
   */
  const openUpdate = (item: T) => {
    beginSession('update', options.updateState(item))
  }

  /** Closes the active modal and clears its form state. */
  const close = () => {
    modalState.value = { kind: 'closed' }
  }

  /**
   * Returns the currently active modal session, if one exists.
   *
   * @returns Active modal session or null when closed.
   */
  const captureSession = () => modalState.value.kind === 'closed' ? null : modalState.value.session

  /**
   * Checks whether a captured session still owns the open modal.
   *
   * @param session - Session captured before asynchronous work began.
   * @returns Whether the captured session still owns the open modal.
   */
  const isCurrentSession = (session: CrudModalSession | null) => (
    session !== null
    && modalState.value.kind !== 'closed'
    && modalState.value.session === session
  )

  /**
   * Checks the latest opening even after it closes, until another opening replaces it.
   *
   * @param session - Session captured before asynchronous work began.
   * @returns Whether no later modal opening has occurred.
   */
  const isLatestSession = (session: CrudModalSession | null) => session !== null && session === nextSession

  /**
   * Closes the modal only when the captured session still owns it.
   *
   * @param session - Session captured before asynchronous work began.
   * @returns Whether the captured session was closed.
   */
  const closeSession = (session: CrudModalSession | null) => {
    if (!isCurrentSession(session)) {
      return false
    }

    close()
    return true
  }

  return {
    isOpen,
    selected,
    openCreate,
    openUpdate,
    close,
    captureSession,
    isCurrentSession,
    isLatestSession,
    closeSession
  }
}
