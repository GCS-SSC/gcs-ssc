<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'
import { useCrudModalPending } from '~/composables/useCrudModal'
import { useBilingualValue } from '~/composables/useBilingualValue'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
/* eslint-disable jsdoc/require-param-description -- Legacy component callbacks omit redundant parameter prose. */
import type { TableColumnInput } from '~/composables/useTableColumns'
import type { TransferPaymentStreamAreaOfExpertiseItem } from '~~/shared/types/schemas'
import { TransferPaymentStreamAreaOfExpertiseSchema } from '~~/shared/types/schemas'

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
const { getBilingualValue } = useBilingualValue()
const getAreaActionTarget = (area: TransferPaymentStreamAreaOfExpertiseItem) =>
  `${getBilingualValue(area, 'egcs_tp_name', String(area.id))} [${area.id}]`
const toast = useLocalizedToast()
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const { createValidator } = useZodI18n()

const {
  search,
  pagination,
  items,
  totalRecords,
  refresh,
  status
} = useResourceTable<TransferPaymentStreamAreaOfExpertiseItem>({
  fetchUrl: computed(() => `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/areas-of-expertise`)
})

const columns: TableColumnInput<TransferPaymentStreamAreaOfExpertiseItem>[] = [
  { accessorKey: 'egcs_tp_name_en', headerKey: 'transfer_payment.area_of_expertise_name_en' },
  { accessorKey: 'egcs_tp_name_fr', headerKey: 'transfer_payment.area_of_expertise_name_fr' },
  { accessorKey: 'egcs_tp_description_en', headerKey: 'transfer_payment.area_of_expertise_description_en' },
  { accessorKey: 'egcs_tp_description_fr', headerKey: 'transfer_payment.area_of_expertise_description_fr' },
  { id: 'actions', headerKey: 'common.actions' }
]

const {
  isOpen: isModalOpen,
  selected: selectedItem,
  openCreate: createArea,
  openUpdate: updateArea,
  captureSession,
  closeSession
} = useCrudModal<TransferPaymentStreamAreaOfExpertiseItem, Partial<TransferPaymentStreamAreaOfExpertiseItem>>({
  createState: () => ({
    egcs_tp_transferpaymentstream: streamId
  }),
  updateState: row => ({ ...row })
})

/** Opens a new Area only while the caller can update the Stream. */
const openCreate = () => {
  if (canUpdateChild) createArea()
}
/** @param row - Area selected for editing. */
const openUpdate = (row: TransferPaymentStreamAreaOfExpertiseItem) => {
  if (canUpdateChild) updateArea(row)
}

let contextGeneration = 0
let disposed = false
const isCurrentContext = (generation: number) => !disposed && generation === contextGeneration
watch([() => transferPaymentId, () => streamId], () => {
  contextGeneration += 1
  isModalOpen.value = false
  selectedItem.value = null
}, { flush: 'sync' })
onBeforeUnmount(() => {
  disposed = true
  contextGeneration += 1
})

const validate = createValidator(TransferPaymentStreamAreaOfExpertiseSchema)
const pending = useCrudModalPending(captureSession)
const isSaving = pending.isPending
/**
 *
 * @param url
 * @param method
 * @param body
 */
const sendJson = async (url: string, method: 'PATCH' | 'POST', body: unknown) => {
  const response = await fetch(getClientRequestUrl(url), {
    method,
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  })
  if (!response.ok) {
    await throwFetchResponseError(response)
  }
}

/**
 * Saves the current area of expertise item.
 * Performs a PATCH for updates or a POST for new entries.
 * Closes the modal, refreshes the table data, and provides success feedback on completion.
 */
const save = async () => {
  if (disposed || !selectedItem.value || !canUpdateChild) return
  const generation = contextGeneration
  const itemState = selectedItem.value
  const itemId = itemState.id
  const isUpdate = Boolean(itemId)
  const session = captureSession()
  if (!pending.begin(session)) return
  try {
    if (isUpdate) {
      await sendJson(
        `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/areas-of-expertise/${itemId}`,
        'PATCH',
        itemState
      )
    } else {
      await sendJson(
        `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/areas-of-expertise`,
        'POST',
        itemState
      )
    }
    if (!isCurrentContext(generation) || !closeSession(session)) return
    await refresh()
    if (!isCurrentContext(generation) || captureSession() !== null || status.value === 'error') return
    toast.add({
      title: toast.localized('common.success'),
      description: isUpdate ? toast.localized('common.updated_success') : toast.localized('common.created_success'),
      color: 'success'
    })
  } catch (error: unknown) {
    if (isCurrentContext(generation) && captureSession() === session) showError(error)
  } finally {
    pending.end(session)
  }
}

/**
 * Initiates the deletion process for a specific area of expertise item.
 * Requests user confirmation before calling the deletion API.
 * Refreshes the list and provides feedback to the user on success.
 *
 * @param {TransferPaymentStreamAreaOfExpertiseItem} row - The expertise record to be deleted.
 */
const deleteItem = async (row: TransferPaymentStreamAreaOfExpertiseItem) => {
  if (disposed || !canDeleteChild) return
  const generation = contextGeneration
  try {
    const ok = await confirmDeleteRequest(
      `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/areas-of-expertise/${row.id}`,
      { shouldProceed: () => isCurrentContext(generation) && canDeleteChild }
    )
    if (!ok || !isCurrentContext(generation)) return
    await refresh()
    if (!isCurrentContext(generation) || status.value !== 'success') return
    toast.add({ title: toast.localized('common.success'), description: toast.localized('common.deleted_success'), color: 'success' })
  } catch (error: unknown) {
    if (isCurrentContext(generation)) showError(error)
  }
}
</script>

<template>
  <CommonResourceLayout
    v-model:search="search"
    v-model:pagination="pagination"
    :data="items"
    :columns="columns"
    :total-records="totalRecords"
    :loading="status === 'pending'"
    :request-status="status"
    :button-label="t('common.add')"
    :show-button="canUpdateChild"
    data-field-scope="transfer-payment.areas-of-expertise-tab"
    @add="openCreate" @retry="refresh">
    <template #actions-cell="{ row }">
      <div class="flex items-center gap-2">
        <CommonActionButton
          v-if="canUpdateChild"
          icon="i-lucide-pencil"
          color="neutral"
          variant="ghost"
          size="sm"
          :aria-label="t('common.edit_named', { name: getAreaActionTarget(row.original) })"
          @click="openUpdate(row.original)" />
        <CommonActionButton
          v-if="canDeleteChild"
          icon="i-lucide-trash"
          color="error"
          variant="ghost"
          size="sm"
          :aria-label="t('common.delete_named', { name: getAreaActionTarget(row.original) })"
          @click="deleteItem(row.original)" />
      </div>
    </template>
  </CommonResourceLayout>

  <UModal
    v-if="selectedItem"
    v-model:open="isModalOpen"
    :title="selectedItem.id ? t('transfer_payment.area_of_expertise_update') : t('transfer_payment.area_of_expertise_create')" data-field-scope="transfer-payment.areas-of-expertise-tab">
    <template #body>
      <UForm :state="selectedItem" :validate="validate" class="space-y-4" @submit="save">
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <UFormField :label="t('transfer_payment.area_of_expertise_name_en')" name="egcs_tp_name_en">
            <UInput v-model="selectedItem.egcs_tp_name_en" />
          </UFormField>
          <UFormField :label="t('transfer_payment.area_of_expertise_name_fr')" name="egcs_tp_name_fr">
            <UInput v-model="selectedItem.egcs_tp_name_fr" />
          </UFormField>
        </div>
        <UFormField :label="t('transfer_payment.area_of_expertise_description_en')" name="egcs_tp_description_en">
          <CommonTextarea v-model="selectedItem.egcs_tp_description_en" />
        </UFormField>
        <UFormField :label="t('transfer_payment.area_of_expertise_description_fr')" name="egcs_tp_description_fr">
          <CommonTextarea v-model="selectedItem.egcs_tp_description_fr" />
        </UFormField>
        <div class="flex justify-end gap-2 pt-4">
          <UButton
            :label="t('common.cancel')"
            color="neutral"
            variant="ghost"
            :disabled="isSaving"
            @click="isModalOpen = false" />
          <CommonSaveButton
            :label="selectedItem.id ? t('common.update') : t('common.add')"
            :loading="isSaving"
            :disabled="isSaving" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
