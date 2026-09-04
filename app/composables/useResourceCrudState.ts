/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns -- generic CRUD helpers are documented by their option and return types */
import type { z } from 'zod'
import { computed, ref, watch, toValue } from 'vue'
import type { ComputedRef, MaybeRef, MaybeRefOrGetter, Ref } from 'vue'
import { useCrudModal, useCrudModalPending } from '~/composables/useCrudModal'
import type { ResourceTableStatus } from '~~/shared/types/resource-table'

interface UseResourceCrudStateOptions<T extends { id: string } & Record<string, unknown>> {
  title: MaybeRefOrGetter<string>
  fetchUrl: MaybeRef<string>
  staticItems?: MaybeRefOrGetter<T[] | undefined>
  postUrl?: MaybeRefOrGetter<string | undefined>
  updateUrlBase?: MaybeRefOrGetter<string | undefined>
  deleteUrlBase?: MaybeRefOrGetter<string | undefined>
  updateMethod?: 'PATCH' | 'PUT'
  schema: z.ZodTypeAny
  initialNewItem?: Partial<T> | null
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
  title,
  fetchUrl,
  staticItems,
  postUrl,
  updateUrlBase,
  deleteUrlBase,
  updateMethod = 'PATCH',
  schema,
  initialNewItem,
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
  const toast = useToast()
  const { createValidator } = useZodI18n()
  const validate = createValidator(schema)
  const { showError } = useApiErrorToast()
  const { confirmDeleteRequest } = useConfirmDeleteRequest()
  const { saveJson } = useJsonRequest()

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
  const staticRows = ref(resolvedStaticItems) as Ref<T[]>
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

  const isEditing: Ref<boolean> = ref(false)
  const isDeleting: Ref<boolean> = ref(false)

  const createInitialFormState = () => (initialNewItem ? { ...initialNewItem } : {})
  const modal = useCrudModal<T, Partial<T>>({
    createState: createInitialFormState,
    updateState: item => ({ ...item })
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

  const canUpdate: ComputedRef<boolean> = computed(() => Boolean(toValue(updateUrlBase)))
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

  const openCreate = () => {
    isEditing.value = false
    modal.openCreate()
  }

  const openUpdate = (item: T) => {
    if (!toValue(updateUrlBase)) {
      return
    }

    isEditing.value = true
    modal.openUpdate(item)
  }

  /** Creates or updates the modal item, emits the matching event, and refreshes the list. */
  const saveItem = async () => {
    const currentState = formState.value
    if (!currentState) {
      return
    }
    const session = captureSession()
    if (!isCurrentSession(session) || !savePending.begin(session)) return
    const editing = isEditing.value

    try {
      if (editing) {
        const updateId = currentState.id
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

      if (!closeSession(session)) return
    } catch (error: unknown) {
      if (isCurrentSession(session)) {
        showError(error)
      }
      return
    } finally {
      savePending.end(session)
    }

    if (editing) {
      emitUpdated()
      toast.add({
        title: t('common.success'),
        description: t('common.updated_success'),
        color: 'success'
      })
    } else {
      emitAdded()
      toast.add({
        title: t('common.success'),
        description: t('common.added_success'),
        color: 'success'
      })
    }

    try {
      await refresh()
    } catch (error: unknown) {
      showError(error)
    }
  }

  /** Confirms deletion and emits success only after the refreshed list reflects the request. */
  const deleteItem = async (id: string) => {
    const resolvedDeleteUrlBase = toValue(deleteUrlBase)
    if (!resolvedDeleteUrlBase || isDeleting.value) {
      return
    }

    try {
      isDeleting.value = true

      const deleted = await confirmDeleteRequest(`${resolvedDeleteUrlBase}/${id}`, {
        description: t(toValue(deleteConfirmKey))
      })
      if (!deleted) {
        return
      }

      emitDeleted()
      toast.add({
        title: t('common.success'),
        description: t('common.deleted_success'),
        color: 'success'
      })
    } catch (error: unknown) {
      showError(error)
      return
    } finally {
      isDeleting.value = false
    }

    try {
      await refresh()
    } catch (error: unknown) {
      showError(error)
    }
  }

  return {
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
    resolvedModalTitle,
    submitLabel,
    closeModal,
    openCreate,
    openUpdate,
    saveItem,
    deleteItem
  }
}
