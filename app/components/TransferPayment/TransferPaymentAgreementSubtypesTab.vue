<script setup lang="ts">
import { useActionContext } from '~/composables/useActionContext'
import { useFormSession } from '~/composables/useFormSession'
import { useCrudModalPending } from '~/composables/useCrudModal'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { onBeforeUnmount, watch } from 'vue'
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
const toast = useLocalizedToast()
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()

const deleteContext = useActionContext({
  identity: [() => transferPaymentId, () => streamId, () => agencyId],
  authority: () => canDeleteChild
})
const { createValidator } = useZodI18n()

const {
  search,
  pagination,
  items,
  totalRecords,
  refresh,
  status
} = useResourceTable<AgreementSubtypeRow>({
  fetchUrl: computed(() => `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/agreement-subtypes`)
})

const columns: TableColumnInput<AgreementSubtypeRow>[] = [
  { id: 'agreement', headerKey: 'transfer_payment.agreement_subtype' },
  { id: 'agreementType', headerKey: 'agency.tabs.agreement_types' },
  { id: 'actions', headerKey: 'common.actions' }
]

const bilingualColumns: BilingualColumnConfig<AgreementSubtypeRow>[] = [
  { id: 'agreement', accessorKey: { en: 'agreement_name_en', fr: 'agreement_name_fr' } }
]

const editingTarget = ref<string | null>(null)
const modal = useCrudModal<AgreementSubtypeRow, Partial<TransferPaymentAgreementSubtypeItem>>({
  createState: () => {
    editingTarget.value = null
    return { egcs_tp_transferpaymentstream: streamId }
  },
  updateState: row => {
    editingTarget.value = row.id
    return { ...row }
  }
})
const writeContext = useActionContext({
  identity: [() => transferPaymentId, () => streamId, () => agencyId],
  authority: () => canUpdateChild,
  eligible: () => (editingTarget.value === null || items.value.some(row => row.id === editingTarget.value))
})

const isOpen: Ref<boolean> = modal.isOpen
const selected: Ref<Partial<TransferPaymentAgreementSubtypeItem> | null> = modal.selected
const openCreate = modal.openCreate
const openUpdate = modal.openUpdate
const validateAgreementSubtype = createValidator(TransferPaymentAgreementSubtypeSchema)
const modalPending = useCrudModalPending(modal.captureSession)
const isSaving = modalPending.isPending

const deletePending = useCrudModalPending(() => deleteContext.version.value)
const isDeleting = deletePending.isPending
const isRetryingAgreementTypes: Ref<boolean> = ref(false)
let contextGeneration = 0
let disposed = false
const isCurrentContext = (generation: number) => !disposed && generation === contextGeneration
watch([() => transferPaymentId, () => streamId], () => {
  contextGeneration += 1
  isRetryingAgreementTypes.value = false
  modal.close()
}, { flush: 'sync' })
watch(() => canUpdateChild, allowed => {
  if (!allowed) modal.close()
}, { flush: 'sync' })
onBeforeUnmount(() => {
  disposed = true
  contextGeneration += 1
  modal.close()
})

/**
 * Persists the selected stream agreement subtype and refreshes the table.
 */
const save = async () => {
  if (disposed || !selected.value || !canUpdateChild) return
  const targetId = editingTarget.value
  const operation = writeContext.capture()
  if (!operation) return
  const session = modal.captureSession()
  if (!modalPending.begin(session)) return
  const generation = contextGeneration
  const isUpdate = targetId !== null
  let closedSession = false

  try {
    const response = await fetch(getClientRequestUrl(isUpdate
      ? `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/agreement-subtypes/${targetId}`
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
    if (!operation.isCurrent() || !isCurrentContext(generation)) return
    closedSession = modal.closeSession(session)
  } catch (error: unknown) {
    if (operation.isCurrent() && isCurrentContext(generation) && modal.captureSession() === session) showError(error)
    return
  } finally {
    modalPending.end(session)
  }

  try {
    await refresh()
    if (!operation.isCurrent() || !isCurrentContext(generation) || !closedSession || !modal.isLatestSession(session) || status.value === 'error') return
    toast.add({
      title: toast.localized('common.success'),
      description: isUpdate ? toast.localized('common.updated_success') : toast.localized('common.added_success'),
      color: 'success'
    })
  } catch (error: unknown) {
    if (operation.isCurrent() && isCurrentContext(generation) && closedSession && modal.isLatestSession(session)) showError(error)
  }
}

/**
 * Soft deletes the selected stream agreement subtype after confirmation.
 *
 * @param row - Row targeted for removal.
 */
const remove = async (row: AgreementSubtypeRow) => {
  if (disposed || !canDeleteChild || isDeleting.value) return
  const operation = deleteContext.capture()
  if (!operation) return
  const targetId = row.id
  const deleteSession = deleteContext.version.value
  if (!deletePending.begin(deleteSession)) return
  try {
    const ok = await confirmDeleteRequest(
      `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/agreement-subtypes/${row.id}`,
      {
        operation,
        target: {
          id: targetId,
          resolve: () => items.value.find(current => current.id === targetId),
          eligible: () => canDeleteChild
        }
      }
    )
    if (!ok || !operation.isCurrent()) return
    await refresh()
    if (!operation.isCurrent() || status.value !== 'success') return
    toast.add({ title: toast.localized('common.success'), description: toast.localized('common.deleted_success'), color: 'success' })
  } catch (error: unknown) {
    if (operation.isCurrent()) showError(error)
  } finally {
    deletePending.end(deleteSession)
  }
}

const { data: agreementTypeResponse, error: agreementTypeError, refresh: refreshAgreementTypes } = await useAgencyReferenceData<AgencyAgreementTypeItem>({
  agencyId,
  buildUrl: () => `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/lookups/agreement-types`,
  query: { page: 1, limit: 100 }
})

/** Retries the failed reference request without changing the selected subtype. */
const retryAgreementTypes = async () => {
  if (disposed || isRetryingAgreementTypes.value) return
  const generation = contextGeneration
  isRetryingAgreementTypes.value = true
  try {
    await refreshAgreementTypes()
  } catch (error: unknown) {
    if (isCurrentContext(generation)) showError(error)
  } finally {
    if (isCurrentContext(generation)) isRetryingAgreementTypes.value = false
  }
}
const formSession = useFormSession({ owner: modal, action: { kind: 'remote', context: writeContext }, submit: save })
</script>

<template>
  <CommonResourceLayout
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
        <CommonActionButton
          icon="i-lucide-pencil"
          color="neutral"
          variant="ghost"
          size="sm"
          :disabled="!canUpdateChild"
          :aria-label="t('common.edit_named', { name: getAgreementSubtypeActionTarget(row.original) })"
          @click="openUpdate(row.original)" />
        <CommonActionButton
          icon="i-lucide-trash"
          color="error"
          variant="ghost"
          size="sm"
          :disabled="!canDeleteChild || isDeleting"
          :aria-label="t('common.delete_named', { name: getAgreementSubtypeActionTarget(row.original) })"
          @click="remove(row.original)" />
      </div>
    </template>
  </CommonResourceLayout>

  <UModal v-if="selected && canUpdateChild" v-model:open="isOpen" :title="selected.id ? t('common.update') : t('common.add')">
    <template #body>
      <UForm v-bind="formSession" :state="selected" :validate="validateAgreementSubtype" class="space-y-4">
        <div v-if="agreementTypeError" role="alert" class="flex flex-wrap items-center gap-2 text-sm text-error">
          <span>{{ t('common.lookup_load_failed') }}</span>
          <UButton
            type="button"
            color="neutral"
            variant="outline"
            size="xs"
            icon="i-lucide-refresh-cw"
            :label="t('common.retry')"
            :loading="isRetryingAgreementTypes"
            @click="retryAgreementTypes" />
        </div>
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
