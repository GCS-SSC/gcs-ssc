<script setup lang="ts">
import { useCrudModalPending } from '~/composables/useCrudModal'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { watch } from 'vue'
import type { Ref } from 'vue'
import type { BilingualColumnConfig, TableColumnInput } from '~/composables/useTableColumns'
import type { AgencyHoldbackBasisItem, TransferPaymentStreamHoldbackBasisItem } from '~~/shared/types/schemas'
import { TransferPaymentStreamHoldbackBasisSchema } from '~~/shared/types/schemas'

interface HoldbackBasisRow extends TransferPaymentStreamHoldbackBasisItem, Record<string, unknown> {
  agency_holdback_name_en?: string
  agency_holdback_name_fr?: string
}

const { transferPaymentId, streamId, agencyId, canCreateChild, canUpdateChild, canDeleteChild } = defineProps<{
  transferPaymentId: string
  streamId: string
  agencyId?: string | null
  canCreateChild: boolean
  canUpdateChild: boolean
  canDeleteChild: boolean
}>()

const { t } = useI18n()
const toast = useToast()
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const { createValidator } = useZodI18n()

const fetchUrl = computed(() => `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/holdback-bases`)
const { search, pagination, items, totalRecords, refresh, status } = useResourceTable<HoldbackBasisRow>({ fetchUrl })

const columns: TableColumnInput<HoldbackBasisRow>[] = [
  { id: 'name', headerKey: 'transfer_payment.holdback_basis' },
  { id: 'agencyBasis', headerKey: 'transfer_payment.agency_holdback_basis' },
  { id: 'actions', headerKey: 'common.actions' }
]
const bilingualColumns: BilingualColumnConfig<HoldbackBasisRow>[] = [
  { id: 'name', accessorKey: { en: 'egcs_tp_name_en', fr: 'egcs_tp_name_fr' } },
  { id: 'agencyBasis', accessorKey: { en: 'agency_holdback_name_en', fr: 'agency_holdback_name_fr' } }
]

const modal = useCrudModal<HoldbackBasisRow, Partial<TransferPaymentStreamHoldbackBasisItem>>({
  createState: () => ({}),
  updateState: row => ({ ...row })
})
const isOpen: Ref<boolean> = modal.isOpen
const selected: Ref<Partial<TransferPaymentStreamHoldbackBasisItem> | null> = modal.selected
const pending = useCrudModalPending(modal.captureSession)
const isSaving = pending.isPending
const validate = createValidator(TransferPaymentStreamHoldbackBasisSchema)
const { getBilingualValue } = useBilingualValue()
const getActionTarget = (row: HoldbackBasisRow) =>
  `${getBilingualValue(row, 'egcs_tp_name', String(row.id))} [${row.id}]`
const openCreate = () => {
  if (canCreateChild) modal.openCreate()
}

watch([() => transferPaymentId, () => streamId], () => modal.close())

/** Persists the selected stream holdback basis and refreshes the table. */
const save = async () => {
  if (!selected.value || (!selected.value.id && !canCreateChild) || (selected.value.id && !canUpdateChild)) return
  const session = modal.captureSession()
  if (!pending.begin(session)) return
  const isUpdate = Boolean(selected.value.id)
  try {
    const url = fetchUrl.value
    const response = await fetch(getClientRequestUrl(isUpdate ? `${url}/${selected.value.id}` : url), {
      method: isUpdate ? 'PATCH' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(selected.value)
    })
    if (!response.ok) await throwFetchResponseError(response)
    if (!modal.closeSession(session)) return
  } catch (error: unknown) {
    if (modal.captureSession() === session) showError(error)
    return
  } finally {
    pending.end(session)
  }

  toast.add({ title: t('common.success'), description: t(isUpdate ? 'common.updated_success' : 'common.added_success'), color: 'success' })
  try {
    await refresh()
  } catch (error: unknown) {
    showError(error)
  }
}

/**
 * Soft deletes a stream holdback basis after confirmation.
 *
 * @param row - Row targeted for removal.
 */
const remove = async (row: HoldbackBasisRow) => {
  try {
    const ok = await confirmDeleteRequest(`${fetchUrl.value}/${row.id}`)
    if (!ok) return
    toast.add({ title: t('common.success'), description: t('common.deleted_success'), color: 'success' })
  } catch (error: unknown) {
    showError(error)
    return
  }
  try {
    await refresh()
  } catch (error: unknown) {
    showError(error)
  }
}

const { data: agencyHoldbackResponse } = await useAgencyReferenceData<AgencyHoldbackBasisItem>({
  agencyId,
  buildUrl: id => `/api/agency/${id}/holdback-bases`,
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
    :show-button="canCreateChild"
    :button-label="t('common.add')"
    @add="openCreate"
    @retry="refresh">
    <template #name-cell="{ row }">
      <CommonBilingualName :name-en="row.original.egcs_tp_name_en" :name-fr="row.original.egcs_tp_name_fr" />
    </template>
    <template #agencyBasis-cell="{ row }">
      <CommonBilingualName :name-en="row.original.agency_holdback_name_en" :name-fr="row.original.agency_holdback_name_fr" />
    </template>
    <template #actions-cell="{ row }">
      <div class="flex items-center gap-2">
        <UButton icon="i-lucide-pencil" color="neutral" variant="ghost" size="sm" :aria-label="t('common.edit_named', { name: getActionTarget(row.original) })" :disabled="!canUpdateChild" @click="modal.openUpdate(row.original)" />
        <UButton icon="i-lucide-trash" color="error" variant="ghost" size="sm" :aria-label="t('common.delete_named', { name: getActionTarget(row.original) })" :disabled="!canDeleteChild" @click="remove(row.original)" />
      </div>
    </template>
  </CommonResourceLayoutCard>

  <UModal v-if="selected && (selected.id ? canUpdateChild : canCreateChild)" v-model:open="isOpen" :title="selected.id ? t('common.update') : t('common.add')">
    <template #body>
      <UForm :state="selected" :validate="validate" class="space-y-4" @submit="save">
        <TransferPaymentFieldsTransferPaymentStreamHoldbackBasisFields
          :model="selected"
          :agency-holdback-bases="agencyHoldbackResponse?.items" />
        <div class="flex justify-end gap-2 pt-4">
          <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="isOpen = false" />
          <CommonSaveButton :label="selected.id ? t('common.update') : t('common.add')" :loading="isSaving" :disabled="isSaving" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
