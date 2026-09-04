<script setup lang="ts">
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
const toast = useToast()
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
  fetchUrl: `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/areas-of-expertise`
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
  openCreate,
  openUpdate,
  captureSession,
  closeSession
} = useCrudModal<TransferPaymentStreamAreaOfExpertiseItem, Partial<TransferPaymentStreamAreaOfExpertiseItem>>({
  createState: () => ({
    egcs_tp_transferpaymentstream: streamId
  }),
  updateState: row => ({ ...row })
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
  if (!selectedItem.value) return
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
    closeSession(session)
    await refresh()
    toast.add({
      title: t('common.success'),
      description: isUpdate ? t('common.updated_success') : t('common.created_success'),
      color: 'success'
    })
  } catch (error: unknown) {
    showError(error)
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
  try {
    const ok = await confirmDeleteRequest(
      `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/areas-of-expertise/${row.id}`
    )
    if (!ok) return
    await refresh()
    toast.add({ title: t('common.success'), description: t('common.deleted_success'), color: 'success' })
  } catch (error: unknown) {
    showError(error)
  }
}
</script>

<template>
  <CommonResourceLayoutCard
    v-model:search="search"
    v-model:pagination="pagination"
    :data="items"
    :columns="columns"
    :total-records="totalRecords"
    :loading="status === 'pending'"
    :button-label="t('common.add')"
    @add="openCreate">
    <template #actions-cell="{ row }">
      <div class="flex items-center gap-2">
        <UButton
          icon="i-lucide-pencil"
          color="neutral"
          variant="ghost"
          size="sm"
          :disabled="!canUpdateChild"
          :aria-label="t('common.edit_named', { name: getAreaActionTarget(row.original) })"
          @click="openUpdate(row.original)" />
        <UButton
          icon="i-lucide-trash"
          color="error"
          variant="ghost"
          size="sm"
          :disabled="!canDeleteChild"
          :aria-label="t('common.delete_named', { name: getAreaActionTarget(row.original) })"
          @click="deleteItem(row.original)" />
      </div>
    </template>
  </CommonResourceLayoutCard>

  <UModal
    v-if="selectedItem"
    v-model:open="isModalOpen"
    :title="selectedItem.id ? t('transfer_payment.area_of_expertise_update') : t('transfer_payment.area_of_expertise_create')">
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
