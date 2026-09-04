<script setup lang="ts">
import { useCrudModalPending } from '~/composables/useCrudModal'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { computed } from 'vue'
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
const toast = useToast()
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
const openCreateOutcome = () => {
  if (!canUpdateChild) return
  outcomeModal.openCreate()
}
const openUpdateOutcome = (outcome: TransferPaymentOutcomeRow) => {
  if (!canUpdateChild) return
  outcomeModal.openUpdate(outcome)
}
const outcomePending = useCrudModalPending(outcomeModal.captureSession)
const isSavingOutcome = outcomePending.isPending

/**
 * Saves the currently selected outcome record.
 * Performs a PATCH if the record has an ID (update), or a POST if it doesn't (new).
 * Closes the modal, refreshes outcome data, emits an update event, and provides success feedback.
 */
const saveOutcome = async () => {
  if (!selectedOutcome.value || !canUpdateChild) return
  const session = outcomeModal.captureSession()
  if (!outcomePending.begin(session)) return
  const isUpdate = Boolean(selectedOutcome.value.id)
  try {
    const response = await fetch(getClientRequestUrl(selectedOutcome.value.id
      ? `/api/transfer-payments/${programId}/outcomes/${selectedOutcome.value.id}`
      : `/api/transfer-payments/${programId}/outcomes`), {
      method: selectedOutcome.value.id ? 'PATCH' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(selectedOutcome.value)
    })
    if (!response.ok) await throwFetchResponseError(response)
    if (!outcomeModal.closeSession(session)) return
  } catch (error: unknown) {
    showError(error)
    return
  } finally {
    outcomePending.end(session)
  }

  toast.add({
    title: t('common.success'),
    description: t(isUpdate ? 'common.updated_success' : 'common.added_success'),
    color: 'success'
  })
  emit('outcomesUpdated')
  try {
    await refreshOutcomes()
  } catch (error: unknown) {
    showError(error)
  }
}

/**
 * Initiates the deletion process for a specific outcome record.
 * Displays a confirmation dialog before calling the deletion API.
 * Refreshes outcome data, emits an update event, and providing feedback on successful deletion.
 *
 * @param {TransferPaymentOutcomeRow} outcome - The outcome record to be deleted.
 */
const deleteOutcome = async (outcome: TransferPaymentOutcomeRow) => {
  try {
    const ok = await confirmDeleteRequest(`/api/transfer-payments/${programId}/outcomes/${outcome.id}`)
    if (!ok) return
    toast.add({ title: t('common.success'), description: t('common.deleted_success'), color: 'success' })
  } catch (error: unknown) {
    showError(error)
    return
  }
  emit('outcomesUpdated')
  try {
    await refreshOutcomes()
  } catch (error: unknown) {
    showError(error)
  }
}
</script>

<template>
  <div class="space-y-6">
    <CommonResourceLayoutCard
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
          <UButton
            icon="i-lucide-pencil"
            color="neutral"
            variant="ghost"
            size="sm"
            :disabled="!canUpdateChild"
            :aria-label="t('common.edit_named', { name: getOutcomeActionTarget(row.original) })"
            @click="openUpdateOutcome(row.original)" />
          <UButton
            icon="i-lucide-trash"
            color="error"
            variant="ghost"
            size="sm"
            :disabled="!canDeleteChild"
            :aria-label="t('common.delete_named', { name: getOutcomeActionTarget(row.original) })"
            @click="deleteOutcome(row.original)" />
        </div>
      </template>
    </CommonResourceLayoutCard>

    <TransferPaymentOutcomeModal
      v-if="selectedOutcome && canUpdateChild"
      v-model:open="isOutcomeModalOpen"
      v-model:state="selectedOutcome"
      :title="selectedOutcome.id ? t('common.update') : t('common.add')"
      :submit-label="selectedOutcome.id ? t('common.update') : t('common.add')"
      :pending="isSavingOutcome"
      @submit="saveOutcome" />
  </div>
</template>
