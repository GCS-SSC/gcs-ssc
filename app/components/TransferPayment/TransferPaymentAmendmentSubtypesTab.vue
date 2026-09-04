<script setup lang="ts">
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
const toast = useToast()
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
  fetchUrl: `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/amendment-subtypes`
})

const columns: TableColumnInput<AmendmentSubtypeRow>[] = [
  { id: 'name', accessorKey: 'egcs_tp_name_en', headerKey: 'common.name' },
  { id: 'type', headerKey: 'transfer_payment.amendment_subtype_type' },
  { id: 'actions', headerKey: 'common.actions' }
]

const bilingualColumns = [
  { id: 'name', accessorKey: { en: 'egcs_tp_name_en', fr: 'egcs_tp_name_fr' } }
]
const { getBilingualValue } = useBilingualValue()

const { isOpen, selected, openCreate, openUpdate, captureSession, closeSession } = useCrudModal<AmendmentSubtypeRow, Partial<TransferPaymentAmendmentSubtypesItem>>({
  createState: () => ({ egcs_tp_transferpaymentstream: streamId }),
  updateState: row => ({ ...row })
})
const pending = useCrudModalPending(captureSession)
const isSaving = pending.isPending

/**
 * Saves the currently selected amendment subtype.
 * Performs a PATCH if updating an existing record, or a POST if creating a new one.
 * Closes the modal, refreshes the table data, and provides success feedback.
 */
const save = async () => {
  if (!selected.value) return
  const session = captureSession()
  if (!pending.begin(session)) return
  try {
    const isUpdate = !!selected.value.id
    const response = await fetch(getClientRequestUrl(isUpdate
      ? `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/amendment-subtypes/${selected.value.id}`
      : `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/amendment-subtypes`), {
      method: isUpdate ? 'PATCH' : 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(selected.value)
    })
    if (!response.ok) {
      await throwFetchResponseError(response)
    }
    closeSession(session)
    await refresh()
    toast.add({
      title: t('common.success'),
      description: isUpdate ? t('common.updated_success') : t('common.added_success'),
      color: 'success'
    })
  } catch (error: unknown) {
    showError(error)
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
  try {
    const ok = await confirmDeleteRequest(
      `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/amendment-subtypes/${row.id}`
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
  <div>
    <CommonResourceLayoutCard
      v-model:search="search"
      v-model:pagination="pagination"
      :data="items"
      :columns="columns"
      :bilingual-columns="bilingualColumns"
      :total-records="totalRecords"
      :loading="status === 'pending'"
      :button-label="canUpdateChild ? t('common.add') : undefined"
      :show-button="canUpdateChild"
      @add="openCreate">
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
      <template #actions-cell="{ row }">
        <div class="flex items-center gap-2">
          <UButton
            v-if="canUpdateChild"
            icon="i-lucide-pencil"
            color="neutral"
            variant="ghost"
            size="sm"
            class="cursor-default"
            :aria-label="t('common.edit')"
            @click="openUpdate(row.original)" />
          <UButton
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
    </CommonResourceLayoutCard>

    <TransferPaymentAmendmentSubtypeModal
      v-if="selected"
      v-model:open="isOpen"
      v-model:state="selected"
      :title="selected.id ? t('transfer_payment.amendment_subtype_update') : t('transfer_payment.amendment_subtype_create')"
      :submit-label="selected.id ? t('common.update') : t('common.add')"
      :amendment-types-fetch-url="`/api/transfer-payments/${transferPaymentId}/streams/${streamId}/amendment-types`"
      :pending="isSaving"
      @submit="save"
    />
  </div>
</template>
