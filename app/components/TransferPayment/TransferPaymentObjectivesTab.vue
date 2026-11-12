<script setup lang="ts">
import { useActionContext } from '~/composables/useActionContext'
import { computed, onScopeDispose, shallowRef, watch } from 'vue'
import { TransferPaymentObjectiveSchema } from '~~/shared/types/schemas/transfer-payment'
import { useCrudModalPending } from '~/composables/useCrudModal'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import type { Ref } from 'vue'
import type { BilingualColumnConfig, TableColumnInput } from '~/composables/useTableColumns'
import type { TransferPaymentObjectiveItem } from '~~/shared/types/schemas/transfer-payment'
import type { TransferPaymentObjectiveRow } from '~~/shared/types/transfer-payment-ui'

const { programId, canUpdateChild, canDeleteChild } = defineProps<{
  programId: string
  canUpdateChild: boolean
  canDeleteChild: boolean
}>()

const emit = defineEmits<{
  objectivesUpdated: []
}>()

const { t } = useI18n()
const { getBilingualValue } = useBilingualValue()
const getObjectiveActionTarget = (objective: TransferPaymentObjectiveRow) =>
  `${getBilingualValue(objective, 'egcs_tp_objective', String(objective.id))} [${objective.id}]`
const toast = useLocalizedToast()
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()

const {
  search: objectiveSearch,
  pagination: objectivePagination,
  items: objectives,
  totalRecords: objectiveTotal,
  refresh: refreshObjectives,
  status: objectiveStatusState
} = useResourceTable<TransferPaymentObjectiveRow>({
  fetchUrl: computed(() => `/api/transfer-payments/${programId}/objectives`)
})

const objectiveColumns: TableColumnInput<TransferPaymentObjectiveRow>[] = [
  { id: 'objective_en', accessorKey: 'egcs_tp_objective_en', headerKey: 'transfer_payment.objective_en' },
  { id: 'objective_fr', accessorKey: 'egcs_tp_objective_fr', headerKey: 'transfer_payment.objective_fr' },
  { id: 'actions', headerKey: 'common.actions' }
]

const objectiveBilingualColumns: BilingualColumnConfig<TransferPaymentObjectiveRow>[] = [
  { id: 'objective', accessorKey: { en: 'egcs_tp_objective_en', fr: 'egcs_tp_objective_fr' } }
]

const objectiveModal = useCrudModal<TransferPaymentObjectiveRow, Partial<TransferPaymentObjectiveItem>>({
  createState: () => ({}),
  updateState: objective => ({ ...objective })
})

const isObjectiveModalOpen: Ref<boolean> = objectiveModal.isOpen
const selectedObjective: Ref<Partial<TransferPaymentObjectiveItem> | null> = objectiveModal.selected
/** Opens a new local draft under the current role and resource. */
const openCreateObjective = () => {
  if (resourceContext.value.kind !== 'active' || !canUpdateChild) return
  editingTarget.value = null
  objectiveModal.openCreate()
}
/** @param objective - Accepted record whose immutable ID owns the edit. */
const openUpdateObjective = (objective: TransferPaymentObjectiveRow) => {
  if (resourceContext.value.kind !== 'active' || !canUpdateChild) return
  editingTarget.value = String(objective.id)
  objectiveModal.openUpdate(objective)
}
const objectivePending = useCrudModalPending(objectiveModal.captureSession)
const isSavingObjective = objectivePending.isPending

const editingTarget: Ref<string | null> = shallowRef(null)
const writeContext = useActionContext({
  identity: [() => programId],
  authority: () => canUpdateChild,
  eligible: () => editingTarget.value === null || objectives.value.some(row => String(row.id) === editingTarget.value)
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
  objectiveModal.close()
}, { flush: 'sync' })
watch(() => canUpdateChild, allowed => {
  if (!allowed) objectiveModal.close()
}, { flush: 'sync' })
onScopeDispose(() => {
  resourceContext.value = { kind: 'disposed' }
  objectiveModal.close()
})

/**
 * Saves the currently selected objective record.
 * Performs a PATCH if the record has an ID (update), or a POST if it doesn't (new).
 * Closes the modal, refreshes objective data, emits an update event, and provides success feedback.
 */
const saveObjective = async () => {
  const operation = writeContext.capture()
  if (!operation) return
  const targetId = editingTarget.value
  const context = resourceContext.value
  if (!(ownsContext(context) && operation.isCurrent()) || !selectedObjective.value || !canUpdateChild) return
  const session = objectiveModal.captureSession()
  if (session === null || !objectivePending.begin(session)) return
  const item = selectedObjective.value
  const isUpdate = targetId !== null
  let closedSession = false
  try {
    const response = await fetch(getClientRequestUrl(targetId !== null
      ? `/api/transfer-payments/${programId}/objectives/${targetId}`
      : `/api/transfer-payments/${programId}/objectives`), {
      method: targetId !== null ? 'PATCH' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(item)
    })
    if (!response.ok) await throwFetchResponseError(response)
    if (!(ownsContext(context) && operation.isCurrent())) return
    closedSession = objectiveModal.closeSession(session)
  } catch (error: unknown) {
    if ((ownsContext(context) && operation.isCurrent()) && objectiveModal.isCurrentSession(session)) showError(error)
    return
  } finally {
    objectivePending.end(session)
  }

  emit('objectivesUpdated')
  try {
    await refreshObjectives()
    if (!(ownsContext(context) && operation.isCurrent()) || !closedSession || !objectiveModal.isLatestSession(session) || objectiveStatusState.value === 'error') return
    toast.add({
      title: toast.localized('common.success'),
      description: toast.localized(isUpdate ? 'common.updated_success' : 'common.added_success'),
      color: 'success'
    })
  } catch (error: unknown) {
    if ((ownsContext(context) && operation.isCurrent()) && closedSession && objectiveModal.isLatestSession(session)) showError(error)
  }
}

/**
 * Initiates the deletion process for a specific objective record.
 * Displays a confirmation dialog before calling the deletion API.
 * Refreshes objective data, emits an update event, and providing feedback on successful deletion.
 *
 * @param {TransferPaymentObjectiveRow} item - The objective record to be deleted.
 */
const deleteObjective = async (item: TransferPaymentObjectiveRow) => {
  const targetId = String(item.id)
  const context = resourceContext.value
  if (!ownsContext(context) || !canDeleteChild) return
  const operation = deleteContext.capture()
  if (!operation) return
  try {
    const ok = await confirmDeleteRequest(`/api/transfer-payments/${programId}/objectives/${targetId}`, {
      operation,
      target: {
        id: targetId,
        resolve: () => objectives.value.find(current => String(current.id) === targetId),
        eligible: current => String(current.id) === targetId
      },
      shouldProceed: () => (ownsContext(context) && operation.isCurrent()) && canDeleteChild
    })
    if (!ok || !(ownsContext(context) && operation.isCurrent())) return
    await refreshObjectives()
    if (!(ownsContext(context) && operation.isCurrent())) return
    emit('objectivesUpdated')
    if (objectiveStatusState.value === 'error') return
    toast.add({ title: toast.localized('common.success'), description: toast.localized('common.deleted_success'), color: 'success' })
  } catch (error: unknown) {
    if ((ownsContext(context) && operation.isCurrent())) showError(error)
  }
}
</script>

<template>
  <div class="space-y-6">
    <CommonResourceLayout
      v-model:search="objectiveSearch"
      v-model:pagination="objectivePagination"
      :data="objectives"
      :columns="objectiveColumns"
      :bilingual-columns="objectiveBilingualColumns"
      :total-records="objectiveTotal"
      :loading="objectiveStatusState === 'pending'"
      :request-status="objectiveStatusState"
      :show-button="canUpdateChild"
      :button-label="t('common.add')"
      @add="openCreateObjective"
      @retry="refreshObjectives">
      <template #objective_en-cell="{ row }">
        <span class="text-sm">
          {{ row.original.egcs_tp_objective_en }}
        </span>
      </template>

      <template #objective_fr-cell="{ row }">
        <span class="text-sm">
          {{ row.original.egcs_tp_objective_fr }}
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
            :aria-label="t('common.edit_named', { name: getObjectiveActionTarget(row.original) })"
            @click="openUpdateObjective(row.original)" />
          <CommonActionButton
            v-if="canDeleteChild"
            icon="i-lucide-trash"
            color="error"
            variant="ghost"
            size="sm"
            :aria-label="t('common.delete_named', { name: getObjectiveActionTarget(row.original) })"
            @click="deleteObjective(row.original)" />
        </div>
      </template>
    </CommonResourceLayout>

    <CommonFormDialog
      v-if="selectedObjective && canUpdateChild"
      v-model:open="isObjectiveModalOpen"
      :action-context="writeContext"
      :state="selectedObjective"
      :schema="TransferPaymentObjectiveSchema"
      :title="selectedObjective.id ? t('common.update') : t('common.add')"
      :submit-label="selectedObjective.id ? t('common.update') : t('common.add')"
      :pending="isSavingObjective"
      @submit="saveObjective">
      <template #default="{ state }">
        <TransferPaymentFieldsTransferPaymentObjectiveFields :model="state" />
      </template>
    </CommonFormDialog>
  </div>
</template>
