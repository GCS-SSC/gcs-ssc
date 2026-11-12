<script setup lang="ts">
import { useActionContext } from '~/composables/useActionContext'
import { computed, onScopeDispose, shallowRef, watch } from 'vue'
import type { Ref } from 'vue'
import { TransferPaymentAmendmentTypeSchema } from '~~/shared/types/schemas/transfer-payment'
import { useCrudModalPending } from '~/composables/useCrudModal'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import type { TableColumnInput } from '~/composables/useTableColumns'
import type { TransferPaymentAmendmentTypeItem } from '~~/shared/types/schemas/transfer-payment'

const {
  transferPaymentId,
  streamId,
  canUpdateChild,
  canDeleteChild
} = defineProps<{
  transferPaymentId: string
  streamId: string
  canUpdateChild: boolean
  canDeleteChild: boolean
}>()

const { t } = useI18n()
const toast = useLocalizedToast()
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()

const {
  search,
  pagination,
  items,
  totalRecords,
  refresh,
  status
} = useResourceTable<TransferPaymentAmendmentTypeItem>({
  fetchUrl: computed(() => `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/amendment-types`)
})

const columns: TableColumnInput<TransferPaymentAmendmentTypeItem>[] = [
  { id: 'egcs_tp_amended', headerKey: 'transfer_payment.amended_type' },
  { id: 'name', accessorKey: 'egcs_tp_name_en', headerKey: 'common.name' },
  { accessorKey: 'egcs_tp_requiresamendmentsubtype', headerKey: 'transfer_payment.amendment_type_requires_subtype' },
  { accessorKey: 'egcs_tp_active', headerKey: 'common.active' },
  { id: 'actions', headerKey: 'common.actions' }
]

const {
  isOpen: isModalOpen,
  selected: selectedItem,
  openCreate: createDraft,
  openUpdate: updateDraft,
  captureSession,
  closeSession,
  close,
  isCurrentSession,
  isLatestSession
} = useCrudModal<TransferPaymentAmendmentTypeItem, Partial<TransferPaymentAmendmentTypeItem>>({
  createState: () => ({ egcs_tp_transferpaymentstream: streamId }),
  updateState: row => ({ ...row })
})
const itemPending = useCrudModalPending(captureSession)
const isSavingItem = itemPending.isPending

const editingTarget: Ref<string | null> = shallowRef(null)
const writeContext = useActionContext({
  identity: [() => transferPaymentId, () => streamId],
  authority: () => canUpdateChild,
  eligible: () => editingTarget.value === null || items.value.some(row => String(row.id) === editingTarget.value)
})
const deleteContext = useActionContext({
  identity: [() => transferPaymentId, () => streamId],
  authority: () => canDeleteChild
})

type ResourceContext = { kind: 'active' } | { kind: 'disposed' }
const context: Ref<ResourceContext> = shallowRef({ kind: 'active' })
const isCurrentContext = (captured: ResourceContext) => captured.kind === 'active' && context.value === captured
watch([() => transferPaymentId, () => streamId], () => {
  context.value = { kind: 'active' }
  close()
}, { flush: 'sync' })
watch(() => canUpdateChild, allowed => {
  if (!allowed) close()
}, { flush: 'sync' })
onScopeDispose(() => {
  context.value = { kind: 'disposed' }
  close()
})
/** Opens a new local draft under the current role and resource. */
const openCreate = () => {
  if (context.value.kind !== 'active' || !canUpdateChild) return
  editingTarget.value = null
  createDraft()
}
/** @param row - Accepted record whose immutable ID owns the edit. */
const openUpdate = (row: TransferPaymentAmendmentTypeItem) => {
  if (context.value.kind !== 'active' || !canUpdateChild) return
  editingTarget.value = String(row.id)
  updateDraft(row)
}

/**
 * Saves the currently selected amendment type record.
 * Performs a PATCH if the record has an ID (update), or a POST if it doesn't (new).
 * Closes the modal, refreshes the dataset, and provides success feedback.
 */
const saveItem = async () => {
  const operation = writeContext.capture()
  if (!operation) return
  const targetId = editingTarget.value
  if (context.value.kind === 'disposed' || !selectedItem.value || !canUpdateChild) return
  const session = captureSession()
  if (session === null || !itemPending.begin(session)) return
  const requestedContext = context.value
  const isUpdate = targetId !== null
  const url = `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/amendment-types${isUpdate ? `/${targetId}` : ''}`
  const body = JSON.stringify(selectedItem.value)
  let closedSession = false
  const ownsFeedback = () => (isCurrentContext(requestedContext) && operation.isCurrent()) && (
    isCurrentSession(session) || (closedSession && isLatestSession(session))
  )
  try {
    const response = await fetch(getClientRequestUrl(url), {
      method: isUpdate ? 'PATCH' : 'POST',
      headers: { 'content-type': 'application/json' },
      body
    })
    if (!response.ok) await throwFetchResponseError(response)
    if (!(isCurrentContext(requestedContext) && operation.isCurrent())) return
    closedSession = closeSession(session)
    await refresh()
    if (!ownsFeedback() || status.value === 'error') return
    toast.add({ title: toast.localized('common.success'), description: toast.localized(isUpdate ? 'common.updated_success' : 'common.added_success'), color: 'success' })
  } catch (error: unknown) {
    if (ownsFeedback()) showError(error)
  } finally {
    itemPending.end(session)
  }
}

/**
 * Initiates the deletion process for a specific amendment type record.
 * Displays a confirmation dialog before calling the deletion API.
 * Refreshes the dataset and provides feedback on successful removal.
 *
 * @param {TransferPaymentAmendmentTypeItem} row - The record to be deleted.
 */
const deleteItem = async (row: TransferPaymentAmendmentTypeItem) => {
  const targetId = String(row.id)
  if (context.value.kind === 'disposed' || !canDeleteChild) return
  const requestedContext = context.value
  const operation = deleteContext.capture()
  if (!operation) return
  try {
    const removed = await confirmDeleteRequest(
      `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/amendment-types/${targetId}`,
      {
        operation,
        target: {
          id: targetId,
          resolve: () => items.value.find(current => String(current.id) === targetId),
          eligible: current => String(current.id) === targetId
        },
        shouldProceed: () => isCurrentContext(requestedContext) && operation.canDispatch()
      }
    )
    if (!removed || !(isCurrentContext(requestedContext) && operation.isCurrent())) return
    await refresh()
    if (!(isCurrentContext(requestedContext) && operation.isCurrent()) || status.value === 'error') return
    toast.add({ title: toast.localized('common.success'), description: toast.localized('common.deleted_success'), color: 'success' })
  } catch (error: unknown) {
    if ((isCurrentContext(requestedContext) && operation.isCurrent())) showError(error)
  }
}
</script>

<template>
  <div class="space-y-6">
    <CommonResourceLayout
      v-model:search="search"
      v-model:pagination="pagination"
      :data="items"
      :columns="columns"
      :bilingual-columns="[{ id: 'name', accessorKey: { en: 'egcs_tp_name_en', fr: 'egcs_tp_name_fr' } }]"
      :total-records="totalRecords"
      :loading="status === 'pending'"
      :request-status="status"
      :button-label="canUpdateChild ? t('common.add') : undefined"
      :show-button="canUpdateChild"
      @add="openCreate"
      @retry="refresh">
      <template #name-cell="{ row }">
        <button
          v-if="canUpdateChild"
          type="button"
          class="text-left font-bold text-zinc-900 transition-colors hover:text-primary dark:text-white"
          :aria-label="t('common.edit')"
          @click="openUpdate(row.original)">
          <CommonBilingualName :name-en="row.original.egcs_tp_name_en" :name-fr="row.original.egcs_tp_name_fr" />
        </button>
        <div v-else class="font-bold text-zinc-900 dark:text-white">
          <CommonBilingualName :name-en="row.original.egcs_tp_name_en" :name-fr="row.original.egcs_tp_name_fr" />
        </div>
      </template>

      <template #egcs_tp_amended-cell="{ row }">
        <span class="font-medium">
          {{ t(`enums.amended_type.${row.original.egcs_tp_amended}`) }}
        </span>
      </template>
      <template #egcs_tp_requiresamendmentsubtype-cell="{ row }">
        {{ t(row.original.egcs_tp_requiresamendmentsubtype ? 'common.yes' : 'common.no') }}
      </template>

      <template #egcs_tp_active-cell="{ row }">
        {{ t(row.original.egcs_tp_active ? 'common.yes' : 'common.no') }}
      </template>
      <template #actions-cell="{ row }">
        <div class="flex items-center gap-2">
          <CommonActionButton
            v-if="canUpdateChild"
            icon="i-lucide-pencil"
            color="neutral"
            variant="ghost"
            size="sm"
            class="cursor-default"
            :aria-label="t('common.edit')"
            @click="openUpdate(row.original)" />
          <CommonActionButton
            v-if="canDeleteChild"
            icon="i-lucide-trash"
            color="error"
            variant="ghost"
            size="sm"
            class="cursor-default"
            :aria-label="t('common.delete')"
            @click="deleteItem(row.original)" />
        </div>
      </template>
    </CommonResourceLayout>

    <CommonFormDialog
      v-if="selectedItem"
      v-model:open="isModalOpen"
      :action-context="writeContext"
      :state="selectedItem"
      :schema="TransferPaymentAmendmentTypeSchema"
      :title="selectedItem.id ? t('transfer_payment.amendment_type_update') : t('transfer_payment.amendment_type_create')"
      :submit-label="selectedItem.id ? t('common.update') : t('common.add')"
      :pending="isSavingItem"
      @submit="saveItem">
      <template #default="{ state }">
        <TransferPaymentFieldsTransferPaymentAmendmentTypeFields
          :definition-locked="Boolean(state.in_use)" :model="state" />
      </template>
    </CommonFormDialog>
  </div>
</template>
