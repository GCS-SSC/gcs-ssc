<script setup lang="ts">
import { useActionContext } from '~/composables/useActionContext'
import { useFormSession } from '~/composables/useFormSession'
import { useCrudModalPending } from '~/composables/useCrudModal'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { onBeforeUnmount, watch } from 'vue'
import type { Ref } from 'vue'
import type { BilingualColumnConfig, TableColumnInput } from '~/composables/useTableColumns'
import type { AgencyHoldbackBasisItem, TransferPaymentStreamHoldbackBasisItem } from '~~/shared/types/schemas'
import { TransferPaymentStreamHoldbackBasisCreateSchema } from '~~/shared/types/schemas'

interface HoldbackBasisRow extends TransferPaymentStreamHoldbackBasisItem, Record<string, unknown> {
  egcs_ay_name_en: string
  egcs_ay_name_fr: string
  agency_holdback_name_en?: string
  agency_holdback_name_fr?: string
}

const { transferPaymentId, streamId, agencyId, canCreateChild, canDeleteChild } = defineProps<{
  transferPaymentId: string
  streamId: string
  agencyId?: string | null
  canCreateChild: boolean
  canDeleteChild: boolean
}>()

const { t } = useI18n()
const toast = useLocalizedToast()
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const writeContext = useActionContext({
  identity: [() => transferPaymentId, () => streamId, () => agencyId],
  authority: () => canCreateChild
})
const deleteContext = useActionContext({
  identity: [() => transferPaymentId, () => streamId, () => agencyId],
  authority: () => canDeleteChild
})
const { createValidator } = useZodI18n()

const fetchUrl = computed(() => `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/holdback-bases`)
const { search, pagination, items, totalRecords, refresh, status } = useResourceTable<HoldbackBasisRow>({ fetchUrl })

const columns: TableColumnInput<HoldbackBasisRow>[] = [
  { id: 'name', headerKey: 'transfer_payment.holdback_basis' },
  { id: 'actions', headerKey: 'common.actions' }
]
const bilingualColumns: BilingualColumnConfig<HoldbackBasisRow>[] = [
  { id: 'name', accessorKey: { en: 'egcs_ay_name_en', fr: 'egcs_ay_name_fr' } }
]

const modal = useCrudModal<HoldbackBasisRow, Partial<TransferPaymentStreamHoldbackBasisItem>>({
  createState: () => ({}),
  updateState: row => ({ ...row })
})
const isOpen: Ref<boolean> = modal.isOpen
const selected: Ref<Partial<TransferPaymentStreamHoldbackBasisItem> | null> = modal.selected
const pending = useCrudModalPending(modal.captureSession)
const isSaving = pending.isPending
const validate = createValidator(TransferPaymentStreamHoldbackBasisCreateSchema.strip())
const { getBilingualValue } = useBilingualValue()
const getActionTarget = (row: HoldbackBasisRow) =>
  `${getBilingualValue(row, 'egcs_ay_name', String(row.id))} [${row.id}]`
const openCreate = () => {
  if (canCreateChild) modal.openCreate()
}

const deletePending = useCrudModalPending(() => deleteContext.version.value)
const isDeleting = deletePending.isPending
const isRetryingAgencyHoldbacks: Ref<boolean> = ref(false)
let contextGeneration = 0
let disposed = false
const isCurrentContext = (generation: number) => !disposed && generation === contextGeneration
watch([() => transferPaymentId, () => streamId], () => {
  contextGeneration += 1
  isRetryingAgencyHoldbacks.value = false
  modal.close()
}, { flush: 'sync' })
watch(() => canCreateChild, allowed => {
  if (!allowed) modal.close()
}, { flush: 'sync' })
onBeforeUnmount(() => {
  disposed = true
  contextGeneration += 1
  modal.close()
})

/** Persists the selected stream holdback basis and refreshes the table. */
const save = async () => {
  if (disposed || !selected.value || !canCreateChild || selected.value.id) return
  const operation = writeContext.capture()
  if (!operation) return
  const session = modal.captureSession()
  if (!pending.begin(session)) return
  const generation = contextGeneration
  let closedSession = false
  try {
    const url = fetchUrl.value
    const response = await fetch(getClientRequestUrl(url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ egcs_tp_agencyholdback: selected.value.egcs_tp_agencyholdback })
    })
    if (!response.ok) await throwFetchResponseError(response)
    if (!operation.isCurrent() || !isCurrentContext(generation)) return
    closedSession = modal.closeSession(session)
  } catch (error: unknown) {
    if (operation.isCurrent() && isCurrentContext(generation) && modal.captureSession() === session) showError(error)
    return
  } finally {
    pending.end(session)
  }

  try {
    await refresh()
    if (!operation.isCurrent() || !isCurrentContext(generation) || !closedSession || !modal.isLatestSession(session) || status.value !== 'success') return
    toast.add({ title: toast.localized('common.success'), description: toast.localized('common.added_success'), color: 'success' })
  } catch (error: unknown) {
    if (operation.isCurrent() && isCurrentContext(generation) && closedSession && modal.isLatestSession(session)) showError(error)
  }
}

/**
 * Soft deletes a stream holdback basis after confirmation.
 *
 * @param row - Row targeted for removal.
 */
const remove = async (row: HoldbackBasisRow) => {
  if (disposed || !canDeleteChild || isDeleting.value) return
  const operation = deleteContext.capture()
  if (!operation) return
  const targetId = row.id
  const deleteSession = deleteContext.version.value
  if (!deletePending.begin(deleteSession)) return
  try {
    const ok = await confirmDeleteRequest(`${fetchUrl.value}/${row.id}`, {
      operation,
      target: {
        id: targetId,
        resolve: () => items.value.find(current => current.id === targetId),
        eligible: () => canDeleteChild
      }
    })
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

const { data: agencyHoldbackResponse, error: agencyHoldbackError, refresh: refreshAgencyHoldbacks } = await useAgencyReferenceData<AgencyHoldbackBasisItem>({
  agencyId,
  buildUrl: () => `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/lookups/holdback-bases`,
  query: { page: 1, limit: 100 }
})

/** Retries the selected Stream reference catalogue without clearing the current draft. */
const retryAgencyHoldbacks = async () => {
  if (disposed || isRetryingAgencyHoldbacks.value) return
  const generation = contextGeneration
  isRetryingAgencyHoldbacks.value = true
  try {
    await refreshAgencyHoldbacks()
  } catch (error: unknown) {
    if (isCurrentContext(generation)) showError(error)
  } finally {
    if (isCurrentContext(generation)) isRetryingAgencyHoldbacks.value = false
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
    :show-button="canCreateChild"
    :button-label="t('common.add')"
    @add="openCreate"
    @retry="refresh">
    <template #name-cell="{ row }">
      <CommonBilingualName :name-en="row.original.egcs_ay_name_en" :name-fr="row.original.egcs_ay_name_fr" />
    </template>
    <template #actions-cell="{ row }">
      <div class="flex items-center gap-2">
        <CommonActionButton v-if="canDeleteChild" icon="i-lucide-trash" color="error" variant="ghost" size="sm" :aria-label="t('common.delete_named', { name: getActionTarget(row.original) })" :disabled="isDeleting" @click="remove(row.original)" />
      </div>
    </template>
  </CommonResourceLayout>

  <UModal v-if="selected && canCreateChild" v-model:open="isOpen" :title="t('common.add')">
    <template #body>
      <UForm v-bind="formSession" :state="selected" :validate="validate" class="space-y-4">
        <div v-if="agencyHoldbackError" role="alert" class="flex flex-wrap items-center gap-2 text-sm text-error">
          <span>{{ t('common.lookup_load_failed') }}</span>
          <UButton
            type="button"
            color="neutral"
            variant="outline"
            size="xs"
            icon="i-lucide-refresh-cw"
            :label="t('common.retry')"
            :loading="isRetryingAgencyHoldbacks"
            @click="retryAgencyHoldbacks" />
        </div>
        <TransferPaymentFieldsTransferPaymentStreamHoldbackBasisFields
          :model="selected"
          :lookup-url="`/api/transfer-payments/${transferPaymentId}/streams/${streamId}/lookups/holdback-bases`"
          :agency-holdback-bases="agencyHoldbackResponse?.items" />
        <div class="flex justify-end gap-2 pt-4">
          <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="isOpen = false" />
          <CommonSaveButton :label="t('common.add')" :loading="isSaving" :disabled="isSaving" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
