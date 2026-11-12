<script setup lang="ts">
import { useActionContext } from '~/composables/useActionContext'
import { useFormSession } from '~/composables/useFormSession'
import { useCrudModalPending } from '~/composables/useCrudModal'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { onBeforeUnmount, watch } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type { BilingualColumnConfig, TableColumnInput } from '~/composables/useTableColumns'
import type { TransferPaymentEligibleRecipientItem, AgencyApplicantRecipientSubtypeItem } from '~~/shared/types/schemas'
import { TransferPaymentEligibleRecipientSchema } from '~~/shared/types/schemas'

interface TransferPaymentEligibleRecipientRow extends TransferPaymentEligibleRecipientItem, Record<string, unknown> {
  recipient_name_en?: string
  recipient_name_fr?: string
}

type RecipientReferenceOption = Pick<AgencyApplicantRecipientSubtypeItem, 'id' | 'egcs_ay_name_en' | 'egcs_ay_name_fr'>

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

const writeContext = useActionContext({
  identity: [() => transferPaymentId, () => streamId, () => agencyId],
  authority: () => canUpdateChild
})
const deleteActionContext = useActionContext({
  identity: [() => transferPaymentId, () => streamId, () => agencyId],
  authority: () => canDeleteChild
})
const { t } = useI18n()
const toast = useLocalizedToast()
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

const persistedRecipient: Ref<TransferPaymentEligibleRecipientRow | null> = ref(null)
const recipientModal = useCrudModal<TransferPaymentEligibleRecipientRow, Partial<TransferPaymentEligibleRecipientItem>>({
  createState: () => {
    persistedRecipient.value = null
    return {}
  },
  updateState: row => {
    persistedRecipient.value = { ...row }
    return { ...row }
  }
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

const isRetryingRecipientReferences: Ref<boolean> = ref(false)
let contextGeneration = 0
let deleteCapabilityGeneration = 0
let disposed = false
const isCurrentContext = (generation: number) => !disposed && generation === contextGeneration
watch([() => transferPaymentId, () => streamId], () => {
  contextGeneration += 1
  isRetryingRecipientReferences.value = false
  recipientModal.close()
}, { flush: 'sync' })
watch(() => canDeleteChild, () => {
  deleteCapabilityGeneration += 1
}, { flush: 'sync' })
watch(() => canUpdateChild, allowed => {
  if (!allowed) recipientModal.close()
}, { flush: 'sync' })
onBeforeUnmount(() => {
  disposed = true
  contextGeneration += 1
  recipientModal.close()
})

/**
 * Saves the currently selected eligible recipient record.
 * Performs a PATCH if the record has an ID (update), or a POST if it doesn't (new).
 * Closes the modal, refreshes the dataset, and provides success feedback.
 */
const saveRecipient = async () => {
  const operation = writeContext.capture()
  if (!operation) return
  if (disposed || !selectedRecipient.value || !canUpdateChild) return
  const session = recipientModal.captureSession()
  if (!recipientPending.begin(session)) return
  const generation = contextGeneration
  const isUpdate = Boolean(selectedRecipient.value.id)
  let closedSession = false
  try {
    const response = await fetch(getClientRequestUrl(selectedRecipient.value.id
      ? `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/eligible-recipients/${selectedRecipient.value.id}`
      : `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/eligible-recipients`), {
      method: selectedRecipient.value.id ? 'PATCH' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(selectedRecipient.value)
    })
    if (!response.ok) await throwFetchResponseError(response)
    if (!(operation.isCurrent() && isCurrentContext(generation))) return
    closedSession = recipientModal.closeSession(session)
  } catch (error: unknown) {
    if ((operation.isCurrent() && isCurrentContext(generation)) && recipientModal.captureSession() === session) showError(error)
    return
  } finally {
    recipientPending.end(session)
  }

  try {
    await refreshRecipients()
    if (!(operation.isCurrent() && isCurrentContext(generation)) || !closedSession || !recipientModal.isLatestSession(session) || recipientStatusState.value === 'error') return
    toast.add({
      title: toast.localized('common.success'),
      description: toast.localized(isUpdate ? 'common.updated_success' : 'common.added_success'),
      color: 'success'
    })
  } catch (error: unknown) {
    if ((operation.isCurrent() && isCurrentContext(generation)) && closedSession && recipientModal.isLatestSession(session)) showError(error)
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
  const operation = deleteActionContext.capture()
  if (!operation) return
  const id = row.id
  if (disposed || !canDeleteChild) return
  const generation = contextGeneration
  const capabilityGeneration = deleteCapabilityGeneration
  try {
    const ok = await confirmDeleteRequest(
      `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/eligible-recipients/${id}`,
      {
        operation, target: { id, resolve: () => recipients.value.find(current => current.id === id), eligible: current => current.id === id },
        shouldProceed: () => operation.isCurrent() && isCurrentContext(generation) && canDeleteChild && capabilityGeneration === deleteCapabilityGeneration
      }
    )
    if (!ok || !(operation.isCurrent() && isCurrentContext(generation))) return
    toast.add({ title: toast.localized('common.success'), description: toast.localized('common.deleted_success'), color: 'success' })
    await refreshRecipients()
  } catch (error: unknown) {
    if (operation.isCurrent() && isCurrentContext(generation)) showError(error)
  }
}

const { data: recipientResponse, error: recipientReferenceError, refresh: refreshRecipientReferences } = await useAgencyReferenceData<AgencyApplicantRecipientSubtypeItem>({
  agencyId,
  buildUrl: id => `/api/agency/${id}/applicant-recipient-subtypes`,
  query: { page: 1, limit: 100 }
})
// Preserve only the original saved selection; never pair an edited ID with old labels.
const recipientOptions: ComputedRef<RecipientReferenceOption[]> = computed(() => {
  const options = recipientResponse.value?.items ?? []
  const original = persistedRecipient.value
  const draft = selectedRecipient.value
  if (!original || draft?.id !== original.id
    || draft.egcs_tp_applicantrecipientsubtype !== original.egcs_tp_applicantrecipientsubtype
    || options.some(option => option.id === original.egcs_tp_applicantrecipientsubtype)) return options
  return [{
    id: original.egcs_tp_applicantrecipientsubtype,
    egcs_ay_name_en: original.recipient_name_en ?? '',
    egcs_ay_name_fr: original.recipient_name_fr ?? ''
  }, ...options]
})

/** Retries failed subtype options without changing the selected eligible recipient. */
const retryRecipientReferences = async () => {
  if (disposed || isRetryingRecipientReferences.value) return
  const generation = contextGeneration
  isRetryingRecipientReferences.value = true
  try {
    await refreshRecipientReferences()
  } catch (error: unknown) {
    if (isCurrentContext(generation)) showError(error)
  } finally {
    if (isCurrentContext(generation)) isRetryingRecipientReferences.value = false
  }
}
const formSession = useFormSession({ owner: recipientModal, action: { kind: 'remote', context: writeContext }, submit: saveRecipient })
</script>

<template>
  <CommonResourceLayout
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
        <CommonActionButton
          v-if="canUpdateChild"
          icon="i-lucide-pencil"
          color="neutral"
          variant="ghost"
          size="sm"
          :aria-label="t('common.edit_named', { name: getRecipientActionTarget(row.original) })"
          @click="openUpdateRecipient(row.original)" />
        <CommonActionButton
          v-if="canDeleteChild"
          icon="i-lucide-trash"
          color="error"
          variant="ghost"
          size="sm"
          :aria-label="t('common.delete_named', { name: getRecipientActionTarget(row.original) })"
          @click="deleteRecipient(row.original)" />
      </div>
    </template>
  </CommonResourceLayout>

  <UModal
    v-if="selectedRecipient && canUpdateChild"
    v-model:open="isRecipientModalOpen"
    :title="selectedRecipient?.id ? t('common.update') : t('common.add')">
    <template #body>
      <UForm v-bind="formSession" :state="selectedRecipient" :validate="validateRecipient" class="space-y-4">
        <div v-if="recipientReferenceError" role="alert" class="flex flex-wrap items-center gap-2 text-sm text-error">
          <span>{{ t('common.lookup_load_failed') }}</span>
          <UButton
            type="button"
            color="neutral"
            variant="outline"
            size="xs"
            icon="i-lucide-refresh-cw"
            :label="t('common.retry')"
            :loading="isRetryingRecipientReferences"
            @click="retryRecipientReferences" />
        </div>
        <TransferPaymentFieldsTransferPaymentEligibleRecipientFields
          :model="selectedRecipient"
          :recipient-options="recipientOptions" />
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
