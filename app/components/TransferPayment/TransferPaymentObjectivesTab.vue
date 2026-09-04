<script setup lang="ts">
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
const toast = useToast()
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
const openCreateObjective = () => {
  if (canUpdateChild) objectiveModal.openCreate()
}
const openUpdateObjective = objectiveModal.openUpdate
const objectivePending = useCrudModalPending(objectiveModal.captureSession)
const isSavingObjective = objectivePending.isPending

/**
 * Saves the currently selected objective record.
 * Performs a PATCH if the record has an ID (update), or a POST if it doesn't (new).
 * Closes the modal, refreshes objective data, emits an update event, and provides success feedback.
 */
const saveObjective = async () => {
  if (!selectedObjective.value || !canUpdateChild) return
  const session = objectiveModal.captureSession()
  if (!objectivePending.begin(session)) return
  const isUpdate = Boolean(selectedObjective.value.id)
  try {
    const response = await fetch(getClientRequestUrl(selectedObjective.value.id
      ? `/api/transfer-payments/${programId}/objectives/${selectedObjective.value.id}`
      : `/api/transfer-payments/${programId}/objectives`), {
      method: selectedObjective.value.id ? 'PATCH' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(selectedObjective.value)
    })
    if (!response.ok) await throwFetchResponseError(response)
    if (!objectiveModal.closeSession(session)) return
  } catch (error: unknown) {
    if (objectiveModal.captureSession() === session) showError(error)
    return
  } finally {
    objectivePending.end(session)
  }

  emit('objectivesUpdated')
  toast.add({
    title: t('common.success'),
    description: t(isUpdate ? 'common.updated_success' : 'common.added_success'),
    color: 'success'
  })
  try {
    await refreshObjectives()
  } catch (error: unknown) {
    showError(error)
  }
}

/**
 * Initiates the deletion process for a specific objective record.
 * Displays a confirmation dialog before calling the deletion API.
 * Refreshes objective data, emits an update event, and providing feedback on successful deletion.
 *
 * @param {TransferPaymentObjectiveRow} objective - The objective record to be deleted.
 */
const deleteObjective = async (objective: TransferPaymentObjectiveRow) => {
  try {
    const ok = await confirmDeleteRequest(`/api/transfer-payments/${programId}/objectives/${objective.id}`)
    if (!ok) return
    await refreshObjectives()
    emit('objectivesUpdated')
    toast.add({ title: t('common.success'), description: t('common.deleted_success'), color: 'success' })
  } catch (error: unknown) {
    showError(error)
  }
}
</script>

<template>
  <div class="space-y-6">
    <CommonResourceLayoutCard
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
          <UButton
            icon="i-lucide-pencil"
            color="neutral"
            variant="ghost"
            size="sm"
            :disabled="!canUpdateChild"
            :aria-label="t('common.edit_named', { name: getObjectiveActionTarget(row.original) })"
            @click="openUpdateObjective(row.original)" />
          <UButton
            icon="i-lucide-trash"
            color="error"
            variant="ghost"
            size="sm"
            :disabled="!canDeleteChild"
            :aria-label="t('common.delete_named', { name: getObjectiveActionTarget(row.original) })"
            @click="deleteObjective(row.original)" />
        </div>
      </template>
    </CommonResourceLayoutCard>

    <TransferPaymentObjectiveModal
      v-if="selectedObjective && canUpdateChild"
      v-model:open="isObjectiveModalOpen"
      v-model:state="selectedObjective"
      :title="selectedObjective.id ? t('common.update') : t('common.add')"
      :submit-label="selectedObjective.id ? t('common.update') : t('common.add')"
      :pending="isSavingObjective"
      @submit="saveObjective" />
  </div>
</template>
