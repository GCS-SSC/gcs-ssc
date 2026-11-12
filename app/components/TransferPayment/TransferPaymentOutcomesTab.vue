<script setup lang="ts">
import { useActionContext } from '~/composables/useActionContext'
import { TransferPaymentOutcomeSchema } from '~~/shared/types/schemas'
import { useCrudModalPending } from '~/composables/useCrudModal'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { computed, onScopeDispose, shallowRef, watch } from 'vue'
import type { Ref } from 'vue'
import type { BilingualColumnConfig, TableColumnInput } from '~/composables/useTableColumns'
import type { TransferPaymentOutcomeItem } from '~~/shared/types/schemas'
import type { TransferPaymentOutcomeRow } from '~~/shared/types/transfer-payment-ui'

const { programId, canUpdateChild, canDeleteChild } = defineProps<{
  programId: string
  canUpdateChild: boolean
  canDeleteChild: boolean
}>()

const emit = defineEmits<{
  outcomesUpdated: []
}>()

const { t } = useI18n()
const toast = useLocalizedToast()
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const { getBilingualValue } = useBilingualValue()
const getOutcomeActionTarget = (outcome: TransferPaymentOutcomeRow) =>
  `${getBilingualValue(outcome, 'egcs_tp_name', String(outcome.id))} [${outcome.id}]`

const {
  search: outcomeSearch,
  pagination: outcomePagination,
  items: outcomes,
  totalRecords: outcomeTotal,
  refresh: refreshOutcomes,
  status: outcomeStatusState
} = useResourceTable<TransferPaymentOutcomeRow>({
  fetchUrl: computed(() => `/api/transfer-payments/${programId}/outcomes`)
})

const outcomeColumns: TableColumnInput<TransferPaymentOutcomeRow>[] = [
  { id: 'name', accessorKey: 'egcs_tp_name_en', headerKey: 'transfer_payment.name_en' },
  { id: 'description', accessorKey: 'egcs_tp_description_en', headerKey: 'common.description' },
  { id: 'actions', headerKey: 'common.actions' }
]

const outcomeBilingualColumns: BilingualColumnConfig<TransferPaymentOutcomeRow>[] = [
  { id: 'name', accessorKey: { en: 'egcs_tp_name_en', fr: 'egcs_tp_name_fr' } },
  { id: 'description', accessorKey: { en: 'egcs_tp_description_en', fr: 'egcs_tp_description_fr' } }
]

const outcomeModal = useCrudModal<TransferPaymentOutcomeRow, Partial<TransferPaymentOutcomeItem>>({
  createState: () => ({}),
  updateState: outcome => ({ ...outcome })
})

const isOutcomeModalOpen: Ref<boolean> = outcomeModal.isOpen
const selectedOutcome: Ref<Partial<TransferPaymentOutcomeItem> | null> = outcomeModal.selected
/** Opens a new local draft under the current role and resource. */
const openCreateOutcome = () => {
  if (resourceContext.value.kind === 'disposed' || !canUpdateChild) return
  editingTarget.value = null
  outcomeModal.openCreate()
}
/** @param outcome - Accepted record whose immutable ID owns the edit. */
const openUpdateOutcome = (outcome: TransferPaymentOutcomeRow) => {
  if (resourceContext.value.kind === 'disposed' || !canUpdateChild) return
  editingTarget.value = String(outcome.id)
  outcomeModal.openUpdate(outcome)
}
const outcomePending = useCrudModalPending(outcomeModal.captureSession)
const isSavingOutcome = outcomePending.isPending

const editingTarget: Ref<string | null> = shallowRef(null)
const writeContext = useActionContext({
  identity: [() => programId],
  authority: () => canUpdateChild,
  eligible: () => editingTarget.value === null || outcomes.value.some(row => String(row.id) === editingTarget.value)
})
const deleteContext = useActionContext({
  identity: [() => programId],
  authority: () => canDeleteChild
})

type ResourceContext = { kind: 'active' } | { kind: 'disposed' }
const resourceContext: Ref<ResourceContext> = shallowRef({ kind: 'active' })
const ownsContext = (captured: ResourceContext) => captured.kind === 'active' && captured === resourceContext.value
watch(() => programId, () => {
  resourceContext.value = { kind: 'active' }
  outcomeModal.close()
}, { flush: 'sync' })
watch(() => canUpdateChild, allowed => {
  if (!allowed) outcomeModal.close()
}, { flush: 'sync' })
onScopeDispose(() => {
  resourceContext.value = { kind: 'disposed' }
  outcomeModal.close()
})

/**
 * Saves the currently selected outcome record.
 * Performs a PATCH if the record has an ID (update), or a POST if it doesn't (new).
 * Closes the modal, refreshes outcome data, emits an update event, and provides success feedback.
 */
const saveOutcome = async () => {
  const operation = writeContext.capture()
  if (!operation) return
  const targetId = editingTarget.value
  const context = resourceContext.value
  if (!(ownsContext(context) && operation.isCurrent()) || !selectedOutcome.value || !canUpdateChild) return
  const session = outcomeModal.captureSession()
  if (session === null || !outcomePending.begin(session)) return
  const item = selectedOutcome.value
  const isUpdate = targetId !== null
  let closedSession = false
  try {
    const response = await fetch(getClientRequestUrl(targetId !== null
      ? `/api/transfer-payments/${programId}/outcomes/${targetId}`
      : `/api/transfer-payments/${programId}/outcomes`), {
      method: targetId !== null ? 'PATCH' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(item)
    })
    if (!response.ok) await throwFetchResponseError(response)
    if (!(ownsContext(context) && operation.isCurrent())) return
    closedSession = outcomeModal.closeSession(session)
  } catch (error: unknown) {
    if ((ownsContext(context) && operation.isCurrent()) && outcomeModal.isCurrentSession(session)) showError(error)
    return
  } finally {
    outcomePending.end(session)
  }

  emit('outcomesUpdated')
  try {
    await refreshOutcomes()
    if (!(ownsContext(context) && operation.isCurrent()) || !closedSession || !outcomeModal.isLatestSession(session) || outcomeStatusState.value === 'error') return
    toast.add({
      title: toast.localized('common.success'),
      description: toast.localized(isUpdate ? 'common.updated_success' : 'common.added_success'),
      color: 'success'
    })
  } catch (error: unknown) {
    if ((ownsContext(context) && operation.isCurrent()) && closedSession && outcomeModal.isLatestSession(session)) showError(error)
  }
}

/**
 * Initiates the deletion process for a specific outcome record.
 * Displays a confirmation dialog before calling the deletion API.
 * Refreshes outcome data, emits an update event, and providing feedback on successful deletion.
 *
 * @param {TransferPaymentOutcomeRow} item - The outcome record to be deleted.
 */
const deleteOutcome = async (item: TransferPaymentOutcomeRow) => {
  const targetId = String(item.id)
  const context = resourceContext.value
  if (!ownsContext(context) || !canDeleteChild) return
  const operation = deleteContext.capture()
  if (!operation) return
  try {
    const ok = await confirmDeleteRequest(`/api/transfer-payments/${programId}/outcomes/${targetId}`, {
      operation,
      target: {
        id: targetId,
        resolve: () => outcomes.value.find(current => String(current.id) === targetId),
        eligible: current => String(current.id) === targetId
      },
      shouldProceed: () => (ownsContext(context) && operation.isCurrent()) && canDeleteChild
    })
    if (!ok || !(ownsContext(context) && operation.isCurrent())) return
    await refreshOutcomes()
    if (!(ownsContext(context) && operation.isCurrent())) return
    emit('outcomesUpdated')
    if (outcomeStatusState.value === 'error') return
    toast.add({ title: toast.localized('common.success'), description: toast.localized('common.deleted_success'), color: 'success' })
  } catch (error: unknown) {
    if ((ownsContext(context) && operation.isCurrent())) showError(error)
  }
}
</script>

<template>
  <div class="space-y-6">
    <CommonResourceLayout
      v-model:search="outcomeSearch"
      v-model:pagination="outcomePagination"
      :data="outcomes"
      :columns="outcomeColumns"
      :bilingual-columns="outcomeBilingualColumns"
      :total-records="outcomeTotal"
      :loading="outcomeStatusState === 'pending'"
      :request-status="outcomeStatusState"
      :button-label="t('common.add')"
      :show-button="canUpdateChild"
      @add="openCreateOutcome"
      @retry="refreshOutcomes">
      <template #name-cell="{ row }">
        <CommonBilingualName
          :name-en="row.original.egcs_tp_name_en"
          :name-fr="row.original.egcs_tp_name_fr" />
      </template>

      <template #description-cell="{ row }">
        <span class="text-sm text-zinc-500 dark:text-zinc-400">
          {{ getBilingualValue(row.original, 'egcs_tp_description', '') }}
        </span>
      </template>

      <template #actions-cell="{ row }">
        <div class="flex items-center gap-2">
          <CommonActionButton
            v-if="canUpdateChild"
            icon="i-lucide-pencil"
            color="neutral"
            variant="ghost"
            size="sm"
            :aria-label="t('common.edit_named', { name: getOutcomeActionTarget(row.original) })"
            @click="openUpdateOutcome(row.original)" />
          <CommonActionButton
            v-if="canDeleteChild"
            icon="i-lucide-trash"
            color="error"
            variant="ghost"
            size="sm"
            :aria-label="t('common.delete_named', { name: getOutcomeActionTarget(row.original) })"
            @click="deleteOutcome(row.original)" />
        </div>
      </template>
    </CommonResourceLayout>

    <CommonFormDialog
      v-if="selectedOutcome && canUpdateChild"
      v-model:open="isOutcomeModalOpen"
      :action-context="writeContext"
      :state="selectedOutcome"
      :schema="TransferPaymentOutcomeSchema"
      :title="selectedOutcome.id ? t('common.update') : t('common.add')"
      :submit-label="selectedOutcome.id ? t('common.update') : t('common.add')"
      :pending="isSavingOutcome"
      @submit="saveOutcome">
      <template #default="{ state }">
        <TransferPaymentFieldsTransferPaymentOutcomeFields :model="state" />
      </template>
    </CommonFormDialog>
  </div>
</template>
