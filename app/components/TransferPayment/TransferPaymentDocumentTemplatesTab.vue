<script setup lang="ts">
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
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
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
const selected = ref<{ egcs_tp_agencydocumenttemplate?: string } | null>(null)
const isOpen = ref(false)
const isSaving = ref(false)
const validate = withFormRequirements(createValidator(TransferPaymentStreamDocumentTemplateLinkSchema), TransferPaymentStreamDocumentTemplateLinkSchema)
const openCreate = () => {
  selected.value = {}
  isOpen.value = true
}
/** Links the selected Agency template to this Stream. */
const save = async () => {
  if (!selected.value?.egcs_tp_agencydocumenttemplate || isSaving.value) return
  isSaving.value = true
  try {
    const response = await fetch(getClientRequestUrl(`/api/transfer-payments/${transferPaymentId}/streams/${streamId}/document-templates`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ egcs_tp_agencydocumenttemplate: selected.value.egcs_tp_agencydocumenttemplate })
    })
    if (!response.ok) await throwFetchResponseError(response)
    isOpen.value = false
    selected.value = null
    await refresh()
  } catch (error) {
    showError(error)
  } finally {
    isSaving.value = false
  }
}
/**
 * Removes this Stream's template link without deleting the Agency definition.
 * @param item - Stream template link selected for removal.
 */
const remove = async (item: TransferPaymentStreamDocumentTemplateItem) => {
  try {
    const confirmed = await confirmDeleteRequest(`/api/transfer-payments/${transferPaymentId}/streams/${streamId}/document-templates/${item.id}`)
    if (confirmed) await refresh()
  } catch (error) {
    showError(error)
  }
}
</script>

<template>
  <CommonResourceLayoutCard
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
    @add="openCreate"
    @retry="refresh">
    <template #name-cell="{ row }">
      <CommonBilingualName :name-en="row.original.egcs_ay_name_en" :name-fr="row.original.egcs_ay_name_fr" />
    </template>
    <template #egcs_ay_active-cell="{ row }">
      <CommonStatusBadge :variant="row.original.egcs_ay_active ? 'active' : 'inactive'" />
    </template>
    <template #actions-cell="{ row }">
      <UButton
        v-if="canDeleteChild"
        icon="i-lucide-trash"
        color="error"
        variant="ghost"
        :aria-label="t('common.delete_named', { name: row.original.egcs_ay_name_en })"
        @click="remove(row.original)" />
    </template>
  </CommonResourceLayoutCard>
  <UModal v-if="selected" v-model:open="isOpen" :title="t('transfer_payment.document_templates.create')" :description="t('common.form_dialog_description')">
    <template #body>
      <UForm :state="selected" :validate="validate" class="space-y-4" @submit="save">
        <AdminCommonLookupField
          v-model="selected.egcs_tp_agencydocumenttemplate"
          :label="t('transfer_payment.document_templates.title')"
          name="egcs_tp_agencydocumenttemplate"
          :fetch-url="`/api/agency/${agencyId}/document-templates`"
          :include-deleted-query="false"
          value-key="id"
          label-en-key="egcs_ay_name_en"
          label-fr-key="egcs_ay_name_fr" />
        <div class="flex justify-end gap-2">
          <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="isOpen = false" />
          <CommonSaveButton :label="t('common.add')" :loading="isSaving" :disabled="isSaving" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
