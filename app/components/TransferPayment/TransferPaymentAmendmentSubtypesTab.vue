<script setup lang="ts">
import { useActionContext } from '~/composables/useActionContext'
import { computed, onScopeDispose, shallowRef, watch } from 'vue'
import type { Ref } from 'vue'
import { TransferPaymentAmendmentSubtypesSchema } from '~~/shared/types/schemas'
import { useCrudModalPending } from '~/composables/useCrudModal'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import type { TableColumnInput } from '~/composables/useTableColumns'
import type { TransferPaymentAmendmentSubtypesItem } from '~~/shared/types/schemas'

interface AmendmentSubtypeRow extends TransferPaymentAmendmentSubtypesItem, Record<string, unknown> {
  amendment_types: Array<{ id: string, egcs_tp_name_en: string, egcs_tp_name_fr: string }>
}

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
} = useResourceTable<AmendmentSubtypeRow>({
  fetchUrl: computed(() => `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/amendment-subtypes`)
})

const columns: TableColumnInput<AmendmentSubtypeRow>[] = [
  { id: 'name', accessorKey: 'egcs_tp_name_en', headerKey: 'common.name' },
  { id: 'type', headerKey: 'transfer_payment.amendment_subtype_type' },
  { accessorKey: 'egcs_tp_active', headerKey: 'common.active' },
  { id: 'actions', headerKey: 'common.actions' }
]

const bilingualColumns = [
  { id: 'name', accessorKey: { en: 'egcs_tp_name_en', fr: 'egcs_tp_name_fr' } }
]
const { getBilingualValue } = useBilingualValue()

const { isOpen, selected, openCreate: createDraft, openUpdate: updateDraft, captureSession, closeSession, close, isCurrentSession, isLatestSession } = useCrudModal<AmendmentSubtypeRow, Partial<TransferPaymentAmendmentSubtypesItem>>({
  createState: () => ({ egcs_tp_transferpaymentstream: streamId }),
  updateState: row => ({ ...row })
})
const pending = useCrudModalPending(captureSession)
const isSaving = pending.isPending

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
const openUpdate = (row: AmendmentSubtypeRow) => {
  if (context.value.kind !== 'active' || !canUpdateChild) return
  editingTarget.value = String(row.id)
  updateDraft(row)
}

/**
 * Saves the currently selected amendment subtype.
 * Performs a PATCH if updating an existing record, or a POST if creating a new one.
 * Closes the modal, refreshes the table data, and provides success feedback.
 */
const save = async () => {
  const operation = writeContext.capture()
  if (!operation) return
  const targetId = editingTarget.value
  if (context.value.kind === 'disposed' || !selected.value || !canUpdateChild) return
  const session = captureSession()
  if (session === null || !pending.begin(session)) return
  const requestedContext = context.value
  const isUpdate = targetId !== null
  const url = `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/amendment-subtypes${isUpdate ? `/${targetId}` : ''}`
  const body = JSON.stringify(selected.value)
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
    pending.end(session)
  }
}

/**
 * Removes a specific amendment subtype record after confirming the action with the user.
 * Refreshes the dataset and provides success feedback on successful deletion.
 *
 * @param {AmendmentSubtypeRow} row - The record to be deleted.
 */
const remove = async (row: AmendmentSubtypeRow) => {
  const targetId = String(row.id)
  if (context.value.kind === 'disposed' || !canDeleteChild) return
  const requestedContext = context.value
  const operation = deleteContext.capture()
  if (!operation) return
  try {
    const removed = await confirmDeleteRequest(
      `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/amendment-subtypes/${targetId}`,
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
  <div>
    <CommonResourceLayout
      v-model:search="search"
      v-model:pagination="pagination"
      :data="items"
      :columns="columns"
      :bilingual-columns="bilingualColumns"
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

      <template #type-cell="{ row }">
        <div class="flex flex-wrap gap-2">
          <CommonStatusBadge
            v-for="type in row.original.amendment_types"
            :key="type.id"
            variant="meta"
            :label="getBilingualValue(type, 'egcs_tp_name', String(type.id))" />
        </div>
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
            @click="remove(row.original)" />
        </div>
      </template>
    </CommonResourceLayout>

    <CommonFormDialog
      v-if="selected"
      v-model:open="isOpen"
      :action-context="writeContext"
      :state="selected"
      :schema="TransferPaymentAmendmentSubtypesSchema"
      :title="selected.id ? t('transfer_payment.amendment_subtype_update') : t('transfer_payment.amendment_subtype_create')"
      :submit-label="selected.id ? t('common.update') : t('common.add')"
      :pending="isSaving"
      @submit="save">
      <template #default="{ state }">
        <TransferPaymentFieldsTransferPaymentAmendmentSubtypeFields
          :definition-locked="Boolean(state.in_use)"
          :model="state"
          :amendment-types-fetch-url="`/api/transfer-payments/${transferPaymentId}/streams/${streamId}/amendment-types`"
          amendment-type-field="amendment_type_ids" />
      </template>
    </CommonFormDialog>
  </div>
</template>
