/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns -- generic CRUD helpers are documented by their option and return types */
import type { z } from 'zod'
import { computed, onBeforeUnmount, ref, shallowRef, watch, toValue, toRaw } from 'vue'
import type { ComputedRef, MaybeRef, MaybeRefOrGetter, Ref } from 'vue'
import { useCrudModal, useCrudModalPending } from '~/composables/useCrudModal'
import type { ActionContext } from '~/composables/useActionContext'
import type { ResourceTableStatus } from '~~/shared/types/resource-table'

export type ResourceCrudAction =
  | { kind: 'read-only' }
  | { kind: 'remote'; create: ActionContext; update: ActionContext; delete: ActionContext }

interface UseResourceCrudStateOptions<T extends { id: string } & Record<string, unknown>> {
  action: MaybeRefOrGetter<ResourceCrudAction>
  deleteEligible?: (row: T) => boolean
  title: MaybeRefOrGetter<string>
  fetchUrl: MaybeRef<string>
  staticItems?: MaybeRefOrGetter<T[] | undefined>
  createAllowed?: MaybeRefOrGetter<boolean>
  postUrl?: MaybeRefOrGetter<string | undefined>
  updateUrlBase?: MaybeRefOrGetter<string | undefined>
  deleteUrlBase?: MaybeRefOrGetter<string | undefined>
  updateMethod?: 'PATCH' | 'PUT'
  schema: z.ZodTypeAny
  initialNewItem?: MaybeRefOrGetter<Partial<T> | null>
  beforeOpen?: (action: 'create' | 'update', original: T | null, shouldProceed: () => boolean) => Promise<boolean>
  beforeSave?: (state: Partial<T>, original: T | null, shouldProceed: () => boolean) => Promise<boolean>
  beforeDelete?: (id: string, shouldProceed: () => boolean) => Promise<boolean | undefined>
  buttonLabel?: MaybeRefOrGetter<string | undefined>
  modalTitle?: MaybeRefOrGetter<string | undefined>
  updateTitle?: MaybeRefOrGetter<string | undefined>
  deleteConfirmKey?: MaybeRefOrGetter<string>
  statusFilter: Ref<string | undefined>
  emitAdded: () => void
  emitUpdated: () => void
  emitDeleted: () => void
}

/** Centralizes list, modal, save, and confirmed-delete state for generic resources. */
export const useResourceCrudState = <T extends { id: string } & Record<string, unknown>>({
  action,
  deleteEligible = () => true,
  title,
  fetchUrl,
  staticItems,
  postUrl,
  createAllowed = true,
  updateUrlBase,
  deleteUrlBase,
  updateMethod = 'PATCH',
  schema,
  initialNewItem,
  beforeOpen,
  beforeSave,
  beforeDelete,
  buttonLabel,
  modalTitle,
  updateTitle,
  deleteConfirmKey = 'agency.delete_confirm',
  statusFilter,
  emitAdded,
  emitUpdated,
  emitDeleted
}: UseResourceCrudStateOptions<T>) => {
  const { t } = useI18n()
  const toast = useLocalizedToast()
  const { createValidator } = useZodI18n()
  const validate = createValidator(schema)
  const { showError } = useApiErrorToast()
  const { confirmDeleteRequest } = useConfirmDeleteRequest()
  const { saveJson } = useJsonRequest()

  const actionContext = (kind: 'create' | 'update' | 'delete') => {
    const policy = toValue(action)
    return policy.kind === 'remote' ? policy[kind] : null
  }
  const isStaticResource = staticItems !== undefined
  const resolvedStaticItems: T[] = toValue(staticItems) ?? []
  const liveResource = !isStaticResource
    ? useResourceTable<T>({
        fetchUrl,
        initialPageSize: 10
      })
    : null
  const staticSearch: Ref<string> = ref('')
  const staticStatusFilter: Ref<string> = ref('all')
  const staticPagination: Ref<{ pageIndex: number, pageSize: number }> = ref({ pageIndex: 0, pageSize: Math.max(resolvedStaticItems.length, 1) })
  const staticRows: Ref<T[]> = shallowRef(resolvedStaticItems)
  const staticTotal: Ref<number> = ref(resolvedStaticItems.length)
  const staticStatus: Ref<ResourceTableStatus> = ref('success')
  const staticRefresh = async () => undefined
  if (isStaticResource) {
    watch(
      () => toValue(staticItems) ?? [],
      value => {
        staticRows.value = value
        staticTotal.value = value.length
        staticPagination.value.pageIndex = 0
        staticPagination.value.pageSize = Math.max(value.length, 1)
      }
    )
  }
  const {
    search,
    statusFilter: tableStatusFilter,
    pagination,
    items,
    totalRecords,
    refresh,
    retry,
    status: listStatus
  } = liveResource ?? {
    search: staticSearch,
    statusFilter: staticStatusFilter,
    pagination: staticPagination,
    items: staticRows,
    totalRecords: staticTotal,
    refresh: staticRefresh,
    retry: staticRefresh,
    status: staticStatus
  }

  watch(
    statusFilter,
    value => {
      if (value === undefined || tableStatusFilter.value === value) {
        return
      }

      tableStatusFilter.value = value
    },
    { immediate: true }
  )

  watch(tableStatusFilter, value => {
    if (statusFilter.value === value) {
      return
    }

    statusFilter.value = value
  })

  type FormMode = { kind: 'create' } | { kind: 'update'; original: T }
  const formMode: Ref<FormMode> = shallowRef({ kind: 'create' })
  const isEditing = computed(() => formMode.value.kind === 'update')
  const deletion: Ref<{ kind: 'idle' } | { kind: 'pending'; token: object }> = shallowRef({ kind: 'idle' })
  const isDeleting = computed(() => deletion.value.kind === 'pending')

  const clone = <Value>(value: Value): Value => structuredClone(toRaw(value))
  const createInitialFormState = () => {
    const defaults = toValue(initialNewItem)
    return defaults ? clone(defaults) : {}
  }
  const modal = useCrudModal<T, Partial<T>>({
    createState: createInitialFormState,
    updateState: item => clone(item)
  })
  const {
    isOpen: isModalOpen,
    selected: formState,
    close: closeModal,
    captureSession,
    isCurrentSession,
    closeSession
  } = modal
  const savePending = useCrudModalPending(captureSession)
  const isSaving = savePending.isPending

  type ResourceContext = { kind: 'active'; token: object } | { kind: 'disposed' }
  const context: Ref<ResourceContext> = shallowRef({ kind: 'active', token: {} })
  watch(() => toValue(fetchUrl), () => {
    if (context.value.kind !== 'disposed') context.value = { kind: 'active', token: {} }
    closeModal()
    deletion.value = { kind: 'idle' }
  }, { flush: 'sync' })
  onBeforeUnmount(() => {
    context.value = { kind: 'disposed' }
  })
  const formActionContext = computed(() => actionContext(isEditing.value ? 'update' : 'create'))
  const canSave = computed(() => toValue(action).kind === 'remote' && context.value.kind === 'active' && !isStaticResource && (isEditing.value
    ? Boolean(toValue(updateUrlBase))
    : toValue(createAllowed)))

  const canUpdate: ComputedRef<boolean> = computed(() => toValue(action).kind === 'remote' && Boolean(toValue(updateUrlBase)))
  const resolvedModalTitle: ComputedRef<string> = computed(() => {
    if (isEditing.value) {
      return toValue(updateTitle) || t('common.update')
    }

    return toValue(modalTitle) || toValue(title)
  })
  const submitLabel: ComputedRef<string> = computed(() => {
    if (isEditing.value) {
      return t('common.update')
    }

    return toValue(buttonLabel) || t('common.add')
  })

  let opening: { kind: 'idle' } | { kind: 'checking'; token: object } = { kind: 'idle' }
  let modalRevision = 0
  watch(captureSession, () => {
    modalRevision++
    opening = { kind: 'idle' }
  }, { flush: 'sync' })
  watch(() => toValue(fetchUrl), () => {
    opening = { kind: 'idle' }
  }, { flush: 'sync' })

  const open = (action: 'create' | 'update', item: T | null) => {
    const operation = actionContext(action)?.capture()
    const allowed = () => Boolean(operation?.canDispatch()) && context.value.kind === 'active' && !isStaticResource && (action === 'create'
      ? toValue(createAllowed)
      : Boolean(toValue(updateUrlBase)))
    if (!allowed() || opening.kind === 'checking') return
    const apply = () => {
      formMode.value = item ? { kind: 'update', original: clone(item) } : { kind: 'create' }
      if (item) modal.openUpdate(item)
      else modal.openCreate()
    }
    // Existing callers open synchronously; only explicit guards introduce an await.
    if (!beforeOpen) {
      apply()
      return
    }
    const token = {}
    opening = { kind: 'checking', token }
    const requestedContext = context.value
    const requestedModalRevision = modalRevision
    const shouldProceed = () => opening.kind === 'checking' && opening.token === token
      && context.value === requestedContext
      && modalRevision === requestedModalRevision
      && allowed()
    return (async () => {
      try {
        if (await beforeOpen(action, item, shouldProceed) && shouldProceed()) apply()
      } catch (error: unknown) {
        if (shouldProceed()) showError(error)
      } finally {
        if (opening.kind === 'checking' && opening.token === token) opening = { kind: 'idle' }
      }
    })()
  }

  const openCreate = () => open('create', null)
  const openUpdate = (item: T) => open('update', item)

  /** Creates or updates the modal item, emits the matching event, and refreshes the list. */
  const saveItem = async ({ onSaved }: { onSaved?: () => void } = {}) => {
    const currentState = formState.value
    if (context.value.kind === 'disposed' || !currentState || !canSave.value) {
      return
    }
    const operation = formActionContext.value?.capture()
    if (!operation) return
    const session = captureSession()
    if (!isCurrentSession(session) || !savePending.begin(session)) return
    const editing = isEditing.value
    const requestedContext = context.value
    const originalItem = formMode.value.kind === 'update' ? formMode.value.original : null
    const isCurrentTarget = () => context.value.kind === 'active' && context.value === requestedContext
      && operation.isCurrent()
    const refreshCurrentTarget = async () => {
      if (!isCurrentTarget()) return
      try {
        await refresh()
      } catch (error: unknown) {
        if (isCurrentTarget()) showError(error)
      }
    }

    try {
      if (beforeSave && !await beforeSave(currentState, originalItem, () => isCurrentTarget() && operation.canDispatch() && isCurrentSession(session) && canSave.value)) return
      if (!isCurrentTarget() || !operation.canDispatch() || !isCurrentSession(session) || !canSave.value) return
      if (editing) {
        const updateId = originalItem?.id
        const resolvedUpdateUrlBase = toValue(updateUrlBase)
        if (!updateId || !resolvedUpdateUrlBase) {
          const message = 'Unable to save: missing id or endpoint'
          console.warn(message, { updateId, updateUrlBase: resolvedUpdateUrlBase })
          showError(new Error(message))
          return
        }

        await saveJson(`${resolvedUpdateUrlBase}/${updateId}`, updateMethod, currentState)
      } else {
        const url = toValue(postUrl) || toValue(fetchUrl)
        await saveJson(url, 'POST', currentState)
      }

      if (!isCurrentTarget()) return
      if (!closeSession(session)) {
        // Closing a modal does not undo an already committed write. Refresh
        // its current collection without settling a replacement modal session.
        if (editing) emitUpdated()
        else emitAdded()
        await refreshCurrentTarget()
        return
      }
      onSaved?.()
    } catch (error: unknown) {
      if (isCurrentTarget() && isCurrentSession(session)) {
        showError(error)
      }
      return
    } finally {
      savePending.end(session)
    }

    if (editing) {
      emitUpdated()
      toast.add({
        title: toast.localized('common.success'),
        description: toast.localized('common.updated_success'),
        color: 'success'
      })
    } else {
      emitAdded()
      toast.add({
        title: toast.localized('common.success'),
        description: toast.localized('common.added_success'),
        color: 'success'
      })
    }

    await refreshCurrentTarget()
  }

  /** Confirms deletion, scopes settlement to the resource identity, and refreshes after success. */
  const deleteItem = async (id: string) => {
    const operation = actionContext('delete')?.capture()
    if (!operation) return
    const requestedContext = context.value
    const isCurrentTarget = () => context.value.kind === 'active' && context.value === requestedContext && operation.isCurrent()
    const resolvedDeleteUrlBase = toValue(deleteUrlBase)
    if (context.value.kind === 'disposed' || !resolvedDeleteUrlBase || isDeleting.value) {
      return
    }

    const token = {}
    deletion.value = { kind: 'pending', token }
    try {
      const deleted = await confirmDeleteRequest(`${resolvedDeleteUrlBase}/${id}`, {
        operation,
        target: { id, resolve: () => items.value.find(row => String(row.id) === id), eligible: deleteEligible },
        description: t(toValue(deleteConfirmKey)),
        ...(beforeDelete ? { confirm: () => beforeDelete(id, () => isCurrentTarget() && toValue(deleteUrlBase) === resolvedDeleteUrlBase) } : {}),
        shouldProceed: () => isCurrentTarget() && toValue(deleteUrlBase) === resolvedDeleteUrlBase
      })
      if (!deleted || !isCurrentTarget()) {
        return
      }

      emitDeleted()
      toast.add({
        title: toast.localized('common.success'),
        description: toast.localized('common.deleted_success'),
        color: 'success'
      })
    } catch (error: unknown) {
      if (isCurrentTarget()) showError(error)
      return
    } finally {
      if (deletion.value.kind === 'pending' && deletion.value.token === token) deletion.value = { kind: 'idle' }
    }

    try {
      await refresh()
    } catch (error: unknown) {
      if (isCurrentTarget()) showError(error)
    }
  }

  return {
    formActionContext,
    validate,
    search,
    tableStatusFilter,
    pagination,
    items,
    totalRecords,
    refresh,
    retry,
    listStatus,
    isModalOpen,
    isEditing,
    isSaving,
    isDeleting,
    formState,
    canUpdate,
    canSave,
    resolvedModalTitle,
    submitLabel,
    closeModal,
    openCreate,
    openUpdate,
    saveItem,
    deleteItem
  }
}
