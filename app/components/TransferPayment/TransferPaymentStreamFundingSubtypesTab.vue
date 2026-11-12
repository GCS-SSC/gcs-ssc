<script setup lang="ts">
import { useActionContext } from '~/composables/useActionContext'
import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { useCrudModal, useCrudModalPending } from '~/composables/useCrudModal'
import { useFormSession } from '~/composables/useFormSession'
import type { Ref } from 'vue'
import type { FetchError } from 'ofetch'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { StreamFundingSubtypeSchema } from '~~/shared/types/schemas/funding-sources'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'

type LinkedSubtype = {
  id: string
  egcs_tp_fundingsubtype: string
  egcs_ay_name_en: string
  egcs_ay_name_fr: string
  egcs_ay_type_name_en: string
  egcs_ay_type_name_fr: string
  egcs_ay_instacking: boolean
  egcs_ay_incostsharing: boolean
}
const writeContext = useActionContext({
  identity: [() => transferPaymentId, () => streamId, () => agencyId],
  authority: () => canCreateChild
})
const deleteActionContext = useActionContext({
  identity: [() => transferPaymentId, () => streamId, () => agencyId],
  authority: () => canDeleteChild
})
const { transferPaymentId, streamId, agencyId, canCreateChild, canDeleteChild } = defineProps<{
  transferPaymentId: string
  streamId: string
  agencyId: string | null
  canCreateChild: boolean
  canDeleteChild: boolean
}>()

const { t } = useI18n()
const { getBilingualValue } = useBilingualValue()
const { createValidator } = useZodI18n()
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const toast = useLocalizedToast()
const baseUrl = computed(() => `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/funding-subtypes`)
const lookupUrl = computed(() => `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/lookups/funding-subtypes`)
const { data: links, refresh: refreshLinks, status: linkStatus } = await useFetch<{ items: LinkedSubtype[] }, FetchError, string>(baseUrl)
type SubtypeDraft = { egcs_tp_fundingsubtype?: string }
const modal = useCrudModal<SubtypeDraft, SubtypeDraft>({
  createState: () => ({}),
  updateState: item => ({ ...item })
})
const { selected, isOpen } = modal
const pending = useCrudModalPending(modal.captureSession)
const saving = pending.isPending
type ResourceContext = { kind: 'active' } | { kind: 'disposed' }
const context: Ref<ResourceContext> = shallowRef({ kind: 'active' })
const isCurrentContext = (captured: ResourceContext) => captured.kind === 'active' && captured === context.value
let deleteCapabilityGeneration = 0
const removing: Ref<boolean> = ref(false)
const validate = createValidator(StreamFundingSubtypeSchema)
const items = computed(() => links.value?.items ?? [])
const search: Ref<string> = ref('')
const pagination: Ref<{ pageIndex: number; pageSize: number }> = ref({ pageIndex: 0, pageSize: 10 })
const filteredItems = computed(() => items.value.filter(item => {
  const value = search.value.trim().toLocaleLowerCase()
  return !value || [item.egcs_ay_name_en, item.egcs_ay_name_fr, item.egcs_ay_type_name_en, item.egcs_ay_type_name_fr]
    .some(name => name.toLocaleLowerCase().includes(value))
}))
const pageItems = computed(() => filteredItems.value.slice(pagination.value.pageIndex * pagination.value.pageSize,
  (pagination.value.pageIndex + 1) * pagination.value.pageSize))
const columns: TableColumnInput<LinkedSubtype>[] = [
  { id: 'name', headerKey: 'agency.funding_types.subtypes' },
  { id: 'type', headerKey: 'agency.funding_types.type' },
  { id: 'stacking', headerKey: 'agency.funding_types.stacking' },
  { id: 'costSharing', headerKey: 'agency.funding_types.cost_sharing' },
  { id: 'actions', headerKey: 'common.actions' }
]
watch([() => transferPaymentId, () => streamId, () => agencyId], () => {
  context.value = { kind: 'active' }
  removing.value = false
  modal.close()
}, { flush: 'sync' })
watch(() => canCreateChild, allowed => {
  if (!allowed) modal.close()
}, { flush: 'sync' })
watch(() => canDeleteChild, () => {
  deleteCapabilityGeneration += 1
}, { flush: 'sync' })
onScopeDispose(() => {
  context.value = { kind: 'disposed' }
  modal.close()
})
const openCreate = () => {
  if (context.value.kind === 'active' && canCreateChild) modal.openCreate()
}
watch(search, () => {
  pagination.value.pageIndex = 0
})

/** Adds an Agency subtype to the Stream after validation. */
const save = async () => {
  const operation = writeContext.capture()
  if (!operation) return
  if (context.value.kind === 'disposed' || !selected.value?.egcs_tp_fundingsubtype || !canCreateChild) return
  const session = modal.captureSession()
  if (session === null || !pending.begin(session)) return
  const requestedContext = context.value
  const requestedUrl = baseUrl.value
  const body = JSON.stringify(selected.value)
  let closedSession = false
  try {
    const response = await fetch(getClientRequestUrl(requestedUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body
    })
    if (!response.ok) await throwFetchResponseError(response)
    if (!(operation.isCurrent() && isCurrentContext(requestedContext))) return
    closedSession = modal.closeSession(session)
  } catch (error: unknown) {
    if ((operation.isCurrent() && isCurrentContext(requestedContext)) && modal.isCurrentSession(session)) showError(error)
    return
  } finally {
    pending.end(session)
  }
  try {
    await refreshLinks()
    if (!(operation.isCurrent() && isCurrentContext(requestedContext)) || !closedSession || !modal.isLatestSession(session) || linkStatus.value === 'error') return
    toast.add({ title: toast.localized('common.success'), description: toast.localized('common.added_success'), color: 'success' })
  } catch (error: unknown) {
    if ((operation.isCurrent() && isCurrentContext(requestedContext)) && closedSession && modal.isLatestSession(session)) showError(error)
  }
}

/**
 * Removes a Stream subtype association without deleting historical funding evidence.
 * @param row - Active association selected from the Stream table.
 */
const remove = async (row: LinkedSubtype) => {
  const operation = deleteActionContext.capture()
  if (!operation) return
  const id = row.id
  if (context.value.kind === 'disposed' || !canDeleteChild || removing.value) return
  const requestedContext = context.value
  const capabilityGeneration = deleteCapabilityGeneration
  removing.value = true
  try {
    const removed = await confirmDeleteRequest(`${baseUrl.value}/${id}`, {
      operation, target: { id, resolve: () => items.value.find(current => current.id === id), eligible: current => current.id === id },
      shouldProceed: () => operation.isCurrent() && isCurrentContext(requestedContext) && canDeleteChild && capabilityGeneration === deleteCapabilityGeneration
    })
    if (!removed || !(operation.isCurrent() && isCurrentContext(requestedContext))) return
    await refreshLinks()
    if (!(operation.isCurrent() && isCurrentContext(requestedContext)) || linkStatus.value === 'error') return
    toast.add({ title: toast.localized('common.success'), description: toast.localized('common.deleted_success'), color: 'success' })
  } catch (error: unknown) {
    if (operation.isCurrent() && isCurrentContext(requestedContext)) showError(error)
  } finally {
    if (isCurrentContext(requestedContext)) removing.value = false
  }
}
const formSession = useFormSession({ owner: modal, action: { kind: 'remote', context: writeContext }, submit: save })
</script>

<template>
  <div class="space-y-4" data-field-scope="transfer-payment.stream-funding-subtypes-tab">
    <CommonResourceLayout
      v-model:search="search"
      v-model:pagination="pagination"
      :data="pageItems"
      :columns="columns"
      :total-records="filteredItems.length"
      :loading="linkStatus === 'pending'"
      :request-status="linkStatus"
      :show-button="canCreateChild"
      :button-label="t('agency.funding_types.add_subtype')"
      @add="openCreate"
      @retry="refreshLinks">
      <template #name-cell="{ row }">
        <CommonBilingualName :name-en="row.original.egcs_ay_name_en" :name-fr="row.original.egcs_ay_name_fr" />
      </template>
      <template #type-cell="{ row }">
        {{ getBilingualValue(row.original, 'egcs_ay_type_name', '') }}
      </template>
      <template #stacking-cell="{ row }">
        {{ row.original.egcs_ay_instacking ? t('common.yes') : t('common.no') }}
      </template>
      <template #costSharing-cell="{ row }">
        {{ row.original.egcs_ay_incostsharing ? t('common.yes') : t('common.no') }}
      </template>
      <template #actions-cell="{ row }">
        <div class="flex justify-end gap-2">
          <CommonActionButton
            v-if="canDeleteChild" icon="i-lucide-trash" color="error" variant="ghost"
            :aria-label="t('common.delete_named', { name: getBilingualValue(row.original, 'egcs_ay_name', row.original.id) })"
            :disabled="removing" @click="remove(row.original)" />
        </div>
      </template>
    </CommonResourceLayout>
    <UModal
      v-if="selected && canCreateChild" v-model:open="isOpen" :title="t('agency.funding_types.add_subtype')">
      <template #body>
        <UForm v-bind="formSession" :state="selected" :validate="validate" class="space-y-4">
          <UFormField :label="t('agency.funding_types.subtypes')" name="egcs_tp_fundingsubtype" required>
            <CommonServerLookupSelect
              v-model="selected.egcs_tp_fundingsubtype" :fetch-url="lookupUrl"
              value-key="id" label-en-key="egcs_ay_name_en" label-fr-key="egcs_ay_name_fr"
              :include-deleted-query="false" />
          </UFormField>
          <div class="flex justify-end gap-2 pt-4">
            <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="modal.close()" />
            <CommonSaveButton :label="t('common.add')" :loading="saving" :disabled="saving" />
          </div>
        </UForm>
      </template>
    </UModal>
  </div>
</template>
