<script setup lang="ts">
import { throwFetchResponseError } from '~/utils/fetch-error'
/* eslint-disable jsdoc/require-jsdoc -- component-local callbacks are self-descriptive */
import { getClientRequestUrl } from '~/utils/client-request-url'
import { computed, watch } from 'vue'
import type { Ref } from 'vue'
import type { TableColumnInput } from '~/composables/useTableColumns'
import type { AgreementGeneratedDocumentItem, TransferPaymentStreamDocumentTemplateItem } from '~~/shared/types/schemas'
import type { TransferPaymentDocumentTemplateOutputFormat } from '~~/shared/types/database'

const { agreementId, canCreate = false, canDelete = false } = defineProps<{
  agreementId: string
  canCreate?: boolean
  canDelete?: boolean
}>()
const agreementIdRef = computed(() => agreementId)

const { t, locale } = useI18n()
const toast = useToast()
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const isGenerateOpen: Ref<boolean> = ref(false)
const isGenerating: Ref<boolean> = ref(false)
const generateState: Ref<{ templateId?: string, language: 'eng' | 'fra', outputFormat?: TransferPaymentDocumentTemplateOutputFormat } | null> = ref(null)

const {
  items,
  totalRecords,
  refresh,
  status,
  search,
  pagination
} = useResourceTable<AgreementGeneratedDocumentItem>({
  fetchUrl: computed(() => `/api/agreements/${agreementId}/documents`)
})

const templates: Ref<TransferPaymentStreamDocumentTemplateItem[]> = ref([])
const templatesStatus: Ref<'pending' | 'success' | 'error'> = ref('pending')
let templateGeneration = 0

const refreshTemplates = async () => {
  const generation = ++templateGeneration
  const requestedAgreementId = agreementId
  templatesStatus.value = 'pending'
  try {
    const response = await fetch(getClientRequestUrl(`/api/agreements/${requestedAgreementId}/document-templates`))
    if (!response.ok) await throwFetchResponseError(response)
    const data = await response.json() as { items: TransferPaymentStreamDocumentTemplateItem[] }
    if (generation !== templateGeneration || requestedAgreementId !== agreementId) return
    templates.value = data.items
    templatesStatus.value = 'success'
  } catch (error: unknown) {
    if (generation !== templateGeneration || requestedAgreementId !== agreementId) return
    templatesStatus.value = 'error'
    showError(error)
  }
}
watch(agreementIdRef, () => {
  isGenerateOpen.value = false
  generateState.value = null
  templates.value = []
  void refreshTemplates()
}, { immediate: true, flush: 'sync' })

const columns: TableColumnInput<AgreementGeneratedDocumentItem>[] = [
  { id: 'name', headerKey: 'common.name' },
  { id: 'language', accessorKey: 'egcs_fc_language', headerKey: 'agency.detail.language' },
  { accessorKey: 'egcs_fc_outputformat', headerKey: 'transfer_payment.document_templates.output_format' },
  { accessorKey: 'egcs_fc_generatedat', headerKey: 'agreement.documents.generated_at' },
  { id: 'actions', headerKey: 'common.actions' }
]

const selectedTemplate = computed(() => templates.value.find(template => template.id === generateState.value?.templateId))
const outputFormatItems = computed(() => (selectedTemplate.value?.egcs_tp_outputformats || []).map(format => ({
  label: t(`enums.transfer_payment_document_template_output_format.${format}`),
  value: format
})))

const openGenerate = () => {
  if (!canCreate) return

  const initialTemplate = templates.value[0]
  generateState.value = {
    templateId: initialTemplate?.id,
    language: locale.value === 'fr' ? 'fra' : 'eng',
    outputFormat: initialTemplate?.egcs_tp_outputformats[0] || 'docx'
  }
  isGenerateOpen.value = true
}

watch(() => generateState.value?.templateId, () => {
  if (!generateState.value) return
  const formats = outputFormatItems.value.map(item => item.value)
  if (!generateState.value.outputFormat || !formats.includes(generateState.value.outputFormat)) {
    generateState.value.outputFormat = formats[0] || 'docx'
  }
})

const downloadDocument = async (generatedDocument: AgreementGeneratedDocumentItem) => {
  try {
    const response = await fetch(getClientRequestUrl(`/api/agreements/${agreementId}/documents/${generatedDocument.id}/download`))
    if (!response.ok) await throwFetchResponseError(response)
    const blob = await response.blob()
    const disposition = response.headers.get('content-disposition') || ''
    const filenameMatch = /filename="?([^";]+)"?/i.exec(disposition)
    const attachmentName = locale.value === 'fr' ? generatedDocument.attachment_name_fr : generatedDocument.attachment_name_en
    const documentName = locale.value === 'fr' ? generatedDocument.egcs_fc_name_fr : generatedDocument.egcs_fc_name_en
    const filename = filenameMatch?.[1] || attachmentName || `${documentName}.${generatedDocument.egcs_fc_outputformat}`
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  } catch (error: unknown) {
    showError(error)
  }
}

const generateDocument = async () => {
  if (!canCreate || !generateState.value?.templateId || !generateState.value.outputFormat || isGenerating.value) {
    return
  }

  try {
    isGenerating.value = true
    const response = await fetch(getClientRequestUrl(`/api/agreements/${agreementId}/documents/generate`), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(generateState.value)
    })
    if (!response.ok) await throwFetchResponseError(response)
    isGenerateOpen.value = false
    await refresh()
    toast.add({ title: t('common.success'), description: t('agreement.documents.generated_success'), color: 'success' })
  } catch (error: unknown) {
    showError(error)
  } finally {
    isGenerating.value = false
  }
}

const deleteDocument = async (generatedDocument: AgreementGeneratedDocumentItem) => {
  try {
    const ok = await confirmDeleteRequest(`/api/agreements/${agreementId}/documents/${generatedDocument.id}`)
    if (!ok) return
    await refresh()
    toast.add({ title: t('common.success'), description: t('common.deleted_success'), color: 'success' })
  } catch (error: unknown) {
    showError(error)
  }
}
</script>

<template>
  <div class="w-full">
    <UAlert
      v-if="templatesStatus === 'error'"
      color="error"
      icon="i-lucide-circle-alert"
      :title="t('common.error')"
      class="mb-4">
      <template #actions>
        <UButton color="error" variant="soft" size="sm" icon="i-lucide-refresh-cw" :label="t('common.retry')" @click="refreshTemplates" />
      </template>
    </UAlert>
    <CommonResourceLayoutCard
      v-model:search="search"
      v-model:pagination="pagination"
      :data="items"
      :columns="columns"
      :total-records="totalRecords"
      :loading="status === 'pending'"
      :button-label="t('agreement.documents.generate')"
      :show-button="canCreate && templatesStatus === 'success' && templates.length > 0"
      :request-status="status"
      search-placeholder=""
      table-class="agreement-documents-table"
      @add="openGenerate"
      @retry="refresh">
      <template #name-cell="{ row }">
        {{ locale === 'fr' ? row.original.egcs_fc_name_fr : row.original.egcs_fc_name_en }}
      </template>

      <template #language-cell="{ row }">
        {{ t(`enums.language_preference.${row.original.egcs_fc_language}`) }}
      </template>

      <template #egcs_fc_outputformat-cell="{ row }">
        {{ t(`enums.transfer_payment_document_template_output_format.${row.original.egcs_fc_outputformat}`) }}
      </template>

      <template #egcs_fc_generatedat-cell="{ row }">
        {{ new Date(row.original.egcs_fc_generatedat).toLocaleString(locale) }}
      </template>

      <template #actions-cell="{ row }">
        <div class="flex items-center justify-end gap-2">
          <UButton
            icon="i-lucide-download"
            color="neutral"
            variant="ghost"
            class="cursor-default"
            :aria-label="`${t('common.download')}: ${locale === 'fr' ? row.original.egcs_fc_name_fr : row.original.egcs_fc_name_en}`"
            @click="downloadDocument(row.original)" />
          <UButton
            v-if="canDelete"
            icon="i-lucide-trash"
            color="error"
            variant="ghost"
            class="cursor-default"
            :aria-label="`${t('common.delete')}: ${locale === 'fr' ? row.original.egcs_fc_name_fr : row.original.egcs_fc_name_en}`"
            @click="deleteDocument(row.original)" />
        </div>
      </template>
    </CommonResourceLayoutCard>

    <UModal v-if="canCreate && generateState" v-model:open="isGenerateOpen" :title="t('agreement.documents.generate')">
      <template #body>
        <UForm :state="generateState" class="space-y-4" @submit="generateDocument">
          <UFormField :label="t('transfer_payment.document_templates.title')" name="templateId">
            <CommonBilingualSelectMenu
              v-model="generateState.templateId"
              :items="templates"
              value-key="id"
              label-en-key="egcs_tp_name_en"
              label-fr-key="egcs_tp_name_fr"
              :searchable="templates.length > 5"
              class="w-full" />
          </UFormField>
          <p v-if="selectedTemplate" class="text-sm leading-5 text-muted">
            {{ locale === 'fr' ? selectedTemplate.egcs_tp_description_fr : selectedTemplate.egcs_tp_description_en }}
          </p>
          <UFormField :label="t('agency.detail.language')" name="language">
            <CommonEnumSelect v-model="generateState.language" name="language_preference" class="w-full" />
          </UFormField>
          <UFormField :label="t('transfer_payment.document_templates.output_format')" name="outputFormat">
            <CommonEnumSelect
              v-model="generateState.outputFormat"
              name="transfer_payment_document_template_output_format"
              :items="outputFormatItems"
              class="w-full" />
          </UFormField>
          <div class="flex justify-end gap-2 pt-4">
            <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="isGenerateOpen = false" />
            <CommonSaveButton :label="t('agreement.documents.generate')" :loading="isGenerating" :disabled="isGenerating || !generateState.templateId || !generateState.outputFormat" />
          </div>
        </UForm>
      </template>
    </UModal>
  </div>
</template>

<style scoped>
:deep(.agreement-documents-table) {
  min-width: 0;
  width: 100%;
}

:deep(.agreement-documents-table table) {
  table-layout: fixed;
  min-width: 0;
  width: 100%;
}

:deep(.agreement-documents-table th),
:deep(.agreement-documents-table td) {
  padding-left: 0.75rem;
  padding-right: 0.75rem;
  white-space: normal;
  overflow-wrap: anywhere;
}

:deep(.agreement-documents-table th:nth-child(1)) {
  width: 40%;
}

:deep(.agreement-documents-table th:nth-child(2)) {
  width: 14%;
}

:deep(.agreement-documents-table th:nth-child(3)) {
  width: 15%;
}

:deep(.agreement-documents-table th:nth-child(4)) {
  width: 20%;
}

:deep(.agreement-documents-table th:nth-child(5)) {
  width: 11%;
}

:deep(.agreement-documents-table th:nth-child(5)),
:deep(.agreement-documents-table td:nth-child(5)) {
  padding-left: 0.5rem;
  padding-right: 0.5rem;
}

:deep(.agreement-documents-table td:nth-child(5) > div) {
  justify-content: flex-end;
}
</style>
