<script setup lang="ts">
import { useCrudModalPending } from '~/composables/useCrudModal'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { watch } from 'vue'
import type { Ref } from 'vue'
import type { BilingualColumnConfig, TableColumnInput } from '~/composables/useTableColumns'
import type { TransferPaymentEligibleRecipientItem, AgencyApplicantRecipientSubtypeItem } from '~~/shared/types/schemas'
import { TransferPaymentEligibleRecipientSchema } from '~~/shared/types/schemas'

interface TransferPaymentEligibleRecipientRow extends TransferPaymentEligibleRecipientItem, Record<string, unknown> {
  recipient_name_en?: string
  recipient_name_fr?: string
}

const {
  transferPaymentId,
  streamId,
  canUpdateChild,
  canDeleteChild,
  agencyId
} = defineProps<{
  transferPaymentId: string
  streamId: string
  canUpdateChild: boolean
  canDeleteChild: boolean
  agencyId?: string | null
}>()

const { t } = useI18n()
const toast = useToast()
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const { createValidator } = useZodI18n()

const {
  search: recipientSearch,
  pagination: recipientPagination,
  items: recipients,
  totalRecords: recipientTotal,
  refresh: refreshRecipients,
  status: recipientStatusState
} = useResourceTable<TransferPaymentEligibleRecipientRow>({
  fetchUrl: computed(() => `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/eligible-recipients`)
})

const recipientColumns: TableColumnInput<TransferPaymentEligibleRecipientRow>[] = [
  { id: 'recipient', accessorKey: 'recipient_name_en', headerKey: 'transfer_payment.applicant_recipient_subtype' },
  { id: 'actions', headerKey: 'common.actions' }
]

const recipientBilingualColumns: BilingualColumnConfig<TransferPaymentEligibleRecipientRow>[] = [
  { id: 'recipient', accessorKey: { en: 'recipient_name_en', fr: 'recipient_name_fr' } }
]

const recipientModal = useCrudModal<TransferPaymentEligibleRecipientRow, Partial<TransferPaymentEligibleRecipientItem>>({
  createState: () => ({}),
  updateState: row => ({ ...row })
})

const isRecipientModalOpen: Ref<boolean> = recipientModal.isOpen
const selectedRecipient: Ref<Partial<TransferPaymentEligibleRecipientItem> | null> = recipientModal.selected
const openCreateRecipient = () => {
  if (canUpdateChild) recipientModal.openCreate()
}
const openUpdateRecipient = recipientModal.openUpdate
const validateRecipient = createValidator(TransferPaymentEligibleRecipientSchema)
const recipientPending = useCrudModalPending(recipientModal.captureSession)
const isSavingRecipient = recipientPending.isPending
const { getBilingualValue } = useBilingualValue()
const getRecipientActionTarget = (recipient: TransferPaymentEligibleRecipientRow) =>
  `${getBilingualValue(recipient, 'recipient_name', String(recipient.id))} [${recipient.id}]`

watch([() => transferPaymentId, () => streamId], () => recipientModal.close())

/**
 * Saves the currently selected eligible recipient record.
 * Performs a PATCH if the record has an ID (update), or a POST if it doesn't (new).
 * Closes the modal, refreshes the dataset, and provides success feedback.
 */
const saveRecipient = async () => {
  if (!selectedRecipient.value || !canUpdateChild) return
  const session = recipientModal.captureSession()
  if (!recipientPending.begin(session)) return
  const isUpdate = Boolean(selectedRecipient.value.id)
  try {
    const response = await fetch(getClientRequestUrl(selectedRecipient.value.id
      ? `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/eligible-recipients/${selectedRecipient.value.id}`
      : `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/eligible-recipients`), {
      method: selectedRecipient.value.id ? 'PATCH' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(selectedRecipient.value)
    })
    if (!response.ok) await throwFetchResponseError(response)
    if (!recipientModal.closeSession(session)) return
  } catch (error: unknown) {
    if (recipientModal.captureSession() === session) showError(error)
    return
  } finally {
    recipientPending.end(session)
  }

  toast.add({
    title: t('common.success'),
    description: t(isUpdate ? 'common.updated_success' : 'common.added_success'),
    color: 'success'
  })
  try {
    await refreshRecipients()
  } catch (error: unknown) {
    showError(error)
  }
}

/**
 * Initiates the deletion process for a specific eligible recipient record.
 * Displays a confirmation dialog before calling the deletion API.
 * Refreshes the dataset and provides feedback on successful removal.
 *
 * @param {TransferPaymentEligibleRecipientRow} row - The record to be deleted.
 */
const deleteRecipient = async (row: TransferPaymentEligibleRecipientRow) => {
  try {
    const ok = await confirmDeleteRequest(
      `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/eligible-recipients/${row.id}`
    )
    if (!ok) return
    toast.add({ title: t('common.success'), description: t('common.deleted_success'), color: 'success' })
  } catch (error: unknown) {
    showError(error)
    return
  }
  try {
    await refreshRecipients()
  } catch (error: unknown) {
    showError(error)
  }
}

const { data: recipientResponse } = await useAgencyReferenceData<AgencyApplicantRecipientSubtypeItem>({
  agencyId,
  buildUrl: id => `/api/agency/${id}/applicant-recipient-subtypes`,
  query: { page: 1, limit: 100 }
})
</script>

<template>
  <CommonResourceLayoutCard
    v-model:search="recipientSearch"
    v-model:pagination="recipientPagination"
    :data="recipients"
    :columns="recipientColumns"
    :bilingual-columns="recipientBilingualColumns"
    :total-records="recipientTotal"
    :loading="recipientStatusState === 'pending'"
    :request-status="recipientStatusState"
    :show-button="canUpdateChild"
    :button-label="t('common.add')"
    @add="openCreateRecipient"
    @retry="refreshRecipients">
    <template #recipient-cell="{ row }">
      <CommonBilingualName
        :name-en="row.original.recipient_name_en"
        :name-fr="row.original.recipient_name_fr" />
    </template>

    <template #actions-cell="{ row }">
      <div class="flex items-center gap-2">
        <UButton
          icon="i-lucide-pencil"
          color="neutral"
          variant="ghost"
          size="sm"
          :aria-label="t('common.edit_named', { name: getRecipientActionTarget(row.original) })"
          :disabled="!canUpdateChild"
          @click="openUpdateRecipient(row.original)" />
        <UButton
          icon="i-lucide-trash"
          color="error"
          variant="ghost"
          size="sm"
          :aria-label="t('common.delete_named', { name: getRecipientActionTarget(row.original) })"
          :disabled="!canDeleteChild"
          @click="deleteRecipient(row.original)" />
      </div>
    </template>
  </CommonResourceLayoutCard>

  <UModal
    v-if="selectedRecipient && canUpdateChild"
    v-model:open="isRecipientModalOpen"
    :title="selectedRecipient?.id ? t('common.update') : t('common.add')">
    <template #body>
      <UForm :state="selectedRecipient" :validate="validateRecipient" class="space-y-4" @submit="saveRecipient">
        <TransferPaymentFieldsTransferPaymentEligibleRecipientFields
          :model="selectedRecipient"
          :recipient-options="recipientResponse?.items" />
        <div class="flex justify-end gap-2 pt-4">
          <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="isRecipientModalOpen = false" />
          <CommonSaveButton
            :label="selectedRecipient?.id ? t('common.update') : t('common.add')"
            :loading="isSavingRecipient"
            :disabled="isSavingRecipient" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
