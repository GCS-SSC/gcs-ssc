<script setup lang="ts">
import { useCrudModalPending } from '~/composables/useCrudModal'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import type { Ref } from 'vue'
import type { BilingualColumnConfig, TableColumnInput } from '~/composables/useTableColumns'
import type {
  AgencyAgreementTypeItem,
  TransferPaymentAgreementSubtypeItem
} from '~~/shared/types/schemas'
import { TransferPaymentAgreementSubtypeSchema } from '~~/shared/types/schemas/transfer-payment'

interface AgreementSubtypeRow extends TransferPaymentAgreementSubtypeItem, Record<string, unknown> {
  agreement_name_en?: string
  agreement_name_fr?: string
  agreement_type?: string
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
const { getBilingualValue } = useBilingualValue()
const getAgreementSubtypeActionTarget = (subtype: AgreementSubtypeRow) =>
  `${getBilingualValue(subtype, 'agreement_name', String(subtype.id))} [${subtype.id}]`
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
} = useResourceTable<AgreementSubtypeRow>({
  fetchUrl: `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/agreement-subtypes`
})

const columns: TableColumnInput<AgreementSubtypeRow>[] = [
  { id: 'agreement', headerKey: 'transfer_payment.agreement_subtype' },
  { id: 'agreementType', headerKey: 'agency.tabs.agreement_types' },
  { id: 'actions', headerKey: 'common.actions' }
]

const bilingualColumns: BilingualColumnConfig<AgreementSubtypeRow>[] = [
  { id: 'agreement', accessorKey: { en: 'agreement_name_en', fr: 'agreement_name_fr' } }
]

const modal = useCrudModal<AgreementSubtypeRow, Partial<TransferPaymentAgreementSubtypeItem>>({
  createState: () => ({ egcs_tp_transferpaymentstream: streamId }),
  updateState: row => ({ ...row })
})

const isOpen: Ref<boolean> = modal.isOpen
const selected: Ref<Partial<TransferPaymentAgreementSubtypeItem> | null> = modal.selected
const openCreate = modal.openCreate
const openUpdate = modal.openUpdate
const validateAgreementSubtype = createValidator(TransferPaymentAgreementSubtypeSchema)
const modalPending = useCrudModalPending(modal.captureSession)
const isSaving = modalPending.isPending

/**
 * Persists the selected stream agreement subtype and refreshes the table.
 */
const save = async () => {
  if (!selected.value || !canUpdateChild) return
  const session = modal.captureSession()
  if (!modalPending.begin(session)) return

  try {
    const isUpdate = !!selected.value.id
    const response = await fetch(getClientRequestUrl(isUpdate
      ? `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/agreement-subtypes/${selected.value.id}`
      : `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/agreement-subtypes`), {
      method: isUpdate ? 'PATCH' : 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(selected.value)
    })
    if (!response.ok) {
      await throwFetchResponseError(response)
    }
    if (!modal.closeSession(session)) return
    await refresh()
    toast.add({
      title: t('common.success'),
      description: isUpdate ? t('common.updated_success') : t('common.added_success'),
      color: 'success'
    })
  } catch (error: unknown) {
    showError(error)
  } finally {
    modalPending.end(session)
  }
}

/**
 * Soft deletes the selected stream agreement subtype after confirmation.
 *
 * @param row - Row targeted for removal.
 */
const remove = async (row: AgreementSubtypeRow) => {
  try {
    const ok = await confirmDeleteRequest(
      `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/agreement-subtypes/${row.id}`
    )
    if (!ok) return
    await refresh()
    toast.add({ title: t('common.success'), description: t('common.deleted_success'), color: 'success' })
  } catch (error: unknown) {
    showError(error)
  }
}

const { data: agreementTypeResponse } = await useAgencyReferenceData<AgencyAgreementTypeItem>({
  agencyId,
  buildUrl: id => `/api/agency/${id}/agreement-types`,
  query: { page: 1, limit: 100 }
})
</script>

<template>
  <CommonResourceLayoutCard
    v-model:search="search"
    v-model:pagination="pagination"
    :data="items"
    :columns="columns"
    :bilingual-columns="bilingualColumns"
    :total-records="totalRecords"
    :loading="status === 'pending'"
    :request-status="status"
    :show-button="canUpdateChild"
    :button-label="t('common.add')"
    @add="openCreate"
    @retry="refresh">
    <template #agreement-cell="{ row }">
      <CommonBilingualName
        :name-en="row.original.agreement_name_en"
        :name-fr="row.original.agreement_name_fr" />
    </template>

    <template #agreementType-cell="{ row }">
      <CommonStatusBadge v-if="row.original.agreement_type" variant="meta" :label="t(`enums.agreement_type.${row.original.agreement_type}`)" />
    </template>

    <template #actions-cell="{ row }">
      <div class="flex items-center gap-2">
        <UButton
          icon="i-lucide-pencil"
          color="neutral"
          variant="ghost"
          size="sm"
          :disabled="!canUpdateChild"
          :aria-label="t('common.edit_named', { name: getAgreementSubtypeActionTarget(row.original) })"
          @click="openUpdate(row.original)" />
        <UButton
          icon="i-lucide-trash"
          color="error"
          variant="ghost"
          size="sm"
          :disabled="!canDeleteChild"
          :aria-label="t('common.delete_named', { name: getAgreementSubtypeActionTarget(row.original) })"
          @click="remove(row.original)" />
      </div>
    </template>
  </CommonResourceLayoutCard>

  <UModal v-if="selected && canUpdateChild" v-model:open="isOpen" :title="selected.id ? t('common.update') : t('common.add')">
    <template #body>
      <UForm :state="selected" :validate="validateAgreementSubtype" class="space-y-4" @submit="save">
        <TransferPaymentFieldsTransferPaymentAgreementSubtypeFields
          :model="selected"
          :agreement-types="agreementTypeResponse?.items" />

        <div class="flex justify-end gap-2 pt-4">
          <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="isOpen = false" />
          <CommonSaveButton
            :label="selected.id ? t('common.update') : t('common.add')"
            :loading="isSaving"
            :disabled="isSaving" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
