<script setup lang="ts">
import { useActionContext } from '~/composables/useActionContext'
import { useFormSession } from '~/composables/useFormSession'
import { onScopeDispose, shallowRef, watch } from 'vue'
import type { Ref } from 'vue'
import { useCrudModal, useCrudModalPending } from '~/composables/useCrudModal'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { TransferPaymentStreamDocumentTemplateLinkSchema, type TransferPaymentStreamDocumentTemplateItem } from '~~/shared/types/schemas'
import { withFormRequirements } from '~~/shared/utils/form-requirements'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'

const { transferPaymentId, streamId, agencyId, canUpdateChild, canDeleteChild } = defineProps<{
  transferPaymentId: string
  streamId: string
  agencyId: string
  canUpdateChild: boolean
  canDeleteChild: boolean
}>()
const { t } = useI18n()
const { getBilingualValue } = useBilingualValue()
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const writeContext = useActionContext({
  identity: [() => transferPaymentId, () => streamId, () => agencyId],
  authority: () => canUpdateChild
})
const deleteContext = useActionContext({
  identity: [() => transferPaymentId, () => streamId, () => agencyId],
  authority: () => canDeleteChild
})
const { createValidator } = useZodI18n()
const { search, pagination, items, totalRecords, refresh, status } = useResourceTable<TransferPaymentStreamDocumentTemplateItem>({
  fetchUrl: computed(() => `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/document-templates`)
})
const columns: TableColumnInput<TransferPaymentStreamDocumentTemplateItem>[] = [
  { accessorKey: 'egcs_ay_entitytype', headerKey: 'transfer_payment.entity_type' },
  { id: 'name', accessorKey: 'egcs_ay_name_en', headerKey: 'common.name' },
  { accessorKey: 'egcs_ay_templatekind', headerKey: 'transfer_payment.document_templates.template_kind' },
  { accessorKey: 'egcs_ay_active', headerKey: 'common.status' },
  { id: 'actions', headerKey: 'common.actions' }
]
type TemplateLinkDraft = { egcs_tp_agencydocumenttemplate?: string }
type ResourceContext = { kind: 'active' } | { kind: 'disposed' }
const context: Ref<ResourceContext> = shallowRef({ kind: 'active' })
const isCurrentContext = (owner: ResourceContext) => owner.kind === 'active' && context.value === owner
const modal = useCrudModal<TemplateLinkDraft, TemplateLinkDraft>({
  createState: () => ({}),
  updateState: draft => ({ ...draft })
})
const { selected, isOpen } = modal
const pending = useCrudModalPending(modal.captureSession)
const isSaving = pending.isPending
const validate = withFormRequirements(createValidator(TransferPaymentStreamDocumentTemplateLinkSchema), TransferPaymentStreamDocumentTemplateLinkSchema)
watch([() => transferPaymentId, () => streamId, () => agencyId], () => {
  context.value = { kind: 'active' }
  modal.close()
}, { flush: 'sync' })
watch(() => canUpdateChild, allowed => {
  if (!allowed) modal.close()
}, { flush: 'sync' })
onScopeDispose(() => {
  context.value = { kind: 'disposed' }
  modal.close()
})
const openCreate = () => {
  if (context.value.kind === 'active' && canUpdateChild) modal.openCreate()
}
/** Links the selected Agency template to this Stream. */
const save = async () => {
  const templateId = selected.value?.egcs_tp_agencydocumenttemplate
  const operation = writeContext.capture()
  if (!operation) return
  const session = modal.captureSession()
  const owner = context.value
  if (!templateId || session === null || !canUpdateChild || !operation.isCurrent() || !isCurrentContext(owner) || !pending.begin(session)) return
  const endpoint = `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/document-templates`
  let closedSession = false
  try {
    const response = await fetch(getClientRequestUrl(endpoint), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ egcs_tp_agencydocumenttemplate: templateId })
    })
    if (!response.ok) await throwFetchResponseError(response)
    if (!operation.isCurrent() || !isCurrentContext(owner)) return
    closedSession = modal.closeSession(session)
  } catch (error) {
    if (operation.isCurrent() && isCurrentContext(owner) && modal.isCurrentSession(session)) showError(error)
    return
  } finally {
    pending.end(session)
  }
  try {
    await refresh()
  } catch (error) {
    if (operation.isCurrent() && isCurrentContext(owner) && (modal.isCurrentSession(session) || (closedSession && modal.isLatestSession(session)))) showError(error)
  }
}
/**
 * Removes this Stream's template link without deleting the Agency definition.
 * @param item - Stream template link selected for removal.
 */
const remove = async (item: TransferPaymentStreamDocumentTemplateItem) => {
  const owner = context.value
  const operation = deleteContext.capture()
  if (!operation) return
  const targetId = item.id
  if (!canDeleteChild || !isCurrentContext(owner)) return
  try {
    const confirmed = await confirmDeleteRequest(`/api/transfer-payments/${transferPaymentId}/streams/${streamId}/document-templates/${item.id}`, {
      operation,
      target: {
        id: targetId,
        resolve: () => items.value.find(current => current.id === targetId),
        eligible: () => canDeleteChild
      }
    })
    if (confirmed && operation.isCurrent()) await refresh()
  } catch (error) {
    if (operation.isCurrent()) showError(error)
  }
}
const formSession = useFormSession({ owner: modal, action: { kind: 'remote', context: writeContext }, submit: save })
</script>

<template>
  <CommonResourceLayout
    v-model:search="search"
    v-model:pagination="pagination"
    :title="t('transfer_payment.document_templates.title')"
    :data="items"
    :columns="columns"
    :bilingual-columns="[{ id: 'name', accessorKey: { en: 'egcs_ay_name_en', fr: 'egcs_ay_name_fr' } }]"
    :total-records="totalRecords"
    :loading="status === 'pending'"
    :request-status="status"
    :button-label="canUpdateChild ? t('common.add') : undefined"
    :show-button="canUpdateChild"
    data-field-scope="transfer-payment.document-templates-tab"
    @add="openCreate" @retry="refresh">
    <template #name-cell="{ row }">
      <CommonBilingualName :name-en="row.original.egcs_ay_name_en" :name-fr="row.original.egcs_ay_name_fr" />
    </template>
    <template #egcs_ay_active-cell="{ row }">
      <CommonStatusBadge :variant="row.original.egcs_ay_active ? 'active' : 'inactive'" />
    </template>
    <template #actions-cell="{ row }">
      <CommonActionButton
        v-if="canDeleteChild"
        icon="i-lucide-trash"
        color="error"
        variant="ghost"
        :aria-label="t('common.delete_named', { name: getBilingualValue(row.original, 'egcs_ay_name', row.original.id) })"
        @click="remove(row.original)" />
    </template>
  </CommonResourceLayout>
  <UModal v-if="selected" v-model:open="isOpen" :title="t('transfer_payment.document_templates.create')" :description="t('common.form_dialog_description')" data-field-scope="transfer-payment.document-templates-tab">
    <template #body>
      <UForm v-bind="formSession" :state="selected" :validate="validate" class="space-y-4">
        <UFormField :label="t('transfer_payment.document_templates.title')" name="egcs_tp_agencydocumenttemplate" required>
          <CommonServerLookupSelect
            v-model="selected.egcs_tp_agencydocumenttemplate"
            :fetch-url="`/api/transfer-payments/${transferPaymentId}/streams/${streamId}/lookups/document-templates`"
            :include-deleted-query="false"
            selected-values-query-key="ids"
            value-key="id"
            label-en-key="egcs_ay_name_en"
            label-fr-key="egcs_ay_name_fr" />
        </UFormField>
        <div class="flex justify-end gap-2">
          <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="isOpen = false" />
          <CommonSaveButton :label="t('common.add')" :loading="isSaving" :disabled="isSaving" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
