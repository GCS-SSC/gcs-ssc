import { computed, ref, shallowReactive, watch } from 'vue'
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
 * Manages open/close and selected state for create/update modals.
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
  const isOpen: Ref<boolean> = ref(false)
  const selected: Ref<U | null> = ref(null)
  let nextSession: CrudModalSession = 0
  const activeSession: Ref<CrudModalSession | null> = ref(null)

  const beginSession = () => {
    nextSession += 1
    activeSession.value = nextSession
  }

  /** Opens the modal with state produced by the configured create mapper. */
  const openCreate = () => {
    if (!options.createState) {
      throw new Error('useCrudModal requires createState to open create mode')
    }

    selected.value = options.createState()
    beginSession()
    isOpen.value = true
  }

  /**
   * Opens the modal with state produced by the configured update mapper.
   *
   * @param item - Item to map into editable state.
   */
  const openUpdate = (item: T) => {
    selected.value = options.updateState(item)
    beginSession()
    isOpen.value = true
  }

  /** Closes the active modal and clears its form state. */
  const close = () => {
    activeSession.value = null
    selected.value = null
    isOpen.value = false
  }

  /**
   * Returns the currently active modal session, if one exists.
   *
   * @returns Active modal session or null when closed.
   */
  const captureSession = () => activeSession.value

  /**
   * Checks whether a captured session still owns the open modal.
   *
   * @param session - Session captured before asynchronous work began.
   * @returns Whether the captured session still owns the open modal.
   */
  const isCurrentSession = (session: CrudModalSession | null) => (
    session !== null
    && isOpen.value
    && activeSession.value === session
  )

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

  watch(isOpen, (open) => {
    if (!open) {
      activeSession.value = null
      selected.value = null
    }
  }, { flush: 'sync' })

  return {
    isOpen,
    selected,
    openCreate,
    openUpdate,
    close,
    captureSession,
    isCurrentSession,
    closeSession
  }
}
