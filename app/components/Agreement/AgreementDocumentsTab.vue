<script setup lang="ts">
import { throwFetchResponseError } from '~/utils/fetch-error'
/* eslint-disable jsdoc/require-jsdoc -- component-local callbacks are self-descriptive */
import { getClientRequestUrl } from '~/utils/client-request-url'
import { computed, onBeforeUnmount, watch } from 'vue'
import { useBusinessStatusState } from '~/composables/useBusinessStatusState'
import { useCatalogCacheRefresh } from '~/composables/useCatalogCacheRefresh'
import type { FundingCaseAgreementProfileRow, FundingCaseAgreementAmendmentRow } from '~~/shared/types/funding-case-agreement-ui'
import type { Ref } from 'vue'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { AgreementDocumentGenerateSchema } from '~~/shared/types/schemas'
import type { AgreementGeneratedDocumentItem, TransferPaymentStreamDocumentTemplateItem } from '~~/shared/types/schemas'
import type { TransferPaymentDocumentTemplateOutputFormat } from '~~/shared/types/database'

const { agreementId, amendmentId, canCreate = false, canDelete = false } = defineProps<{
  agreementId: string
  amendmentId?: string
  canCreate?: boolean
  canDelete?: boolean
}>()
const apiBase = computed(() => amendmentId ? `/api/agreements/${agreementId}/amendments/${amendmentId}` : `/api/agreements/${agreementId}`)

const { t, locale } = useI18n()
const validateGenerate = useZodI18n().createValidator(AgreementDocumentGenerateSchema)
const toast = useLocalizedToast()
const { isRecordLocked } = useBusinessStatusState()
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const isGenerateOpen: Ref<boolean> = ref(false)
const isGenerating: Ref<boolean> = ref(false)
const isOpeningGenerate: Ref<boolean> = ref(false)
const generateState: Ref<{ templateId?: string, language: 'eng' | 'fra', outputFormat?: TransferPaymentDocumentTemplateOutputFormat } | null> = ref(null)

const {
  items,
  totalRecords,
  refresh,
  status,
  search,
  pagination
} = useResourceTable<AgreementGeneratedDocumentItem>({
  fetchUrl: computed(() => `${apiBase.value}/documents`)
})

const templates: Ref<TransferPaymentStreamDocumentTemplateItem[]> = ref([])
const historicalTemplate: Ref<TransferPaymentStreamDocumentTemplateItem | null> = ref(null)
const templatesStatus: Ref<'pending' | 'success' | 'error'> = ref('pending')
let templateGeneration = 0
let operationGeneration = 0
let ownerGeneration = 0
onBeforeUnmount(() => {
  ownerGeneration++
  templateGeneration++
  operationGeneration++
})
watch(isGenerateOpen, open => {
  if (!open) {
    operationGeneration++
    isGenerating.value = false
  }
}, { flush: 'sync' })

const refreshTemplates = async () => {
  const generation = ++templateGeneration
  const requestedApiBase = apiBase.value
  templatesStatus.value = 'pending'
  try {
    const response = await fetch(getClientRequestUrl(`${requestedApiBase}/document-templates`))
    if (!response.ok) await throwFetchResponseError(response)
    const data = await response.json() as { items: TransferPaymentStreamDocumentTemplateItem[] }
    if (generation !== templateGeneration || requestedApiBase !== apiBase.value) return
    const previousSelection = templates.value.find(template => template.id === generateState.value?.templateId)
    if (previousSelection) historicalTemplate.value = previousSelection
    templates.value = data.items
    templatesStatus.value = 'success'
  } catch (error: unknown) {
    if (generation !== templateGeneration || requestedApiBase !== apiBase.value) return
    templatesStatus.value = 'error'
    showError(error)
  }
}
const { check: checkCatalogVersions, checking: checkingCatalog, failed: catalogCheckFailed } = useCatalogCacheRefresh(() => `${apiBase.value}/document-templates`, change => {
  if (change.securityContextChanged) {
    templateGeneration++
    templates.value = []
    historicalTemplate.value = null
    return
  }
  return refreshTemplates().then(() => templatesStatus.value !== 'error')
}, showError)
const retryTemplates = async () => {
  if (await checkCatalogVersions() && templatesStatus.value !== 'success') await refreshTemplates()
}
watch(apiBase, () => {
  ownerGeneration++
  operationGeneration++
  isGenerating.value = false
  isOpeningGenerate.value = false
  isGenerateOpen.value = false
  generateState.value = null
  templates.value = []
  historicalTemplate.value = null
  void refreshTemplates()
}, { immediate: true, flush: 'sync' })

const columns: TableColumnInput<AgreementGeneratedDocumentItem>[] = [
  { id: 'name', headerKey: 'common.name' },
  { id: 'language', accessorKey: 'egcs_fc_language', headerKey: 'agency.detail.language' },
  { accessorKey: 'egcs_fc_outputformat', headerKey: 'transfer_payment.document_templates.output_format' },
  { accessorKey: 'egcs_fc_generatedat', headerKey: 'agreement.documents.generated_at' },
  { id: 'actions', headerKey: 'common.actions' }
]

const selectedTemplate = computed(() => templates.value.find(template => template.id === generateState.value?.templateId)
  ?? (historicalTemplate.value?.id === generateState.value?.templateId ? historicalTemplate.value : undefined))
const templateOptions = computed(() => {
  const selected = selectedTemplate.value
  return selected && !templates.value.some(template => template.id === selected.id)
    ? [...templates.value, { ...selected, disabled: true }]
    : templates.value
})
const outputFormatItems = computed(() => (selectedTemplate.value?.egcs_ay_outputformats || []).map(format => ({
  label: t(`enums.transfer_payment_document_template_output_format.${format}`),
  value: format
})))

const warnDocumentPrerequisite = (missingAssignment = false) => toast.add({
  title: toast.localized('common.warning'),
  description: toast.localized(missingAssignment ? 'assignments.read_only_description' : 'agreement.child_records.work_prerequisite'),
  color: 'warning'
})
const readJson = async (path: string): Promise<unknown> => {
  const response = await fetch(getClientRequestUrl(path))
  if (!response.ok) await throwFetchResponseError(response)
  return await response.json()
}
const checkDocumentPrerequisites = async (action: 'create' | 'delete', current: () => boolean): Promise<boolean> => {
  const owner = agreementId
  const child = amendmentId
  const entityType = child ? 'fundingcaseamendment' : 'fundingcaseagreement'
  const [parent, roster, amendment] = await Promise.all([
    readJson(`/api/agreements/${owner}`) as Promise<FundingCaseAgreementProfileRow>,
    readJson(`/api/entity-assignments/${entityType}/${child ?? owner}`) as Promise<{ is_assigned: boolean }>,
    child ? readJson(`/api/agreements/${owner}/amendments/${child}`) as Promise<FundingCaseAgreementAmendmentRow> : Promise.resolve(null)
  ])
  if (!current()) return false
  if (roster.is_assigned !== true) {
    warnDocumentPrerequisite(true)
    return false
  }
  const allowed = amendment
    ? amendment.egcs_fc_isopen && (action === 'create' ? amendment.can_edit : amendment.can_delete_documents)
    : action === 'create'
      ? parent.can_create_child_records_role && parent.can_create_child_records
      : parent.can_delete_child_records_role && parent.can_delete_child_records
  if (allowed && !isRecordLocked(parent) && (!amendment || !isRecordLocked(amendment))) return true
  warnDocumentPrerequisite()
  return false
}
const openGenerate = async () => {
  if (!canCreate || isOpeningGenerate.value) return
  const generation = ++operationGeneration
  const requestedBase = apiBase.value
  const current = () => generation === operationGeneration && requestedBase === apiBase.value
  try {
    isOpeningGenerate.value = true
    if (!await checkCatalogVersions() || !current()) return
    if (!await checkDocumentPrerequisites('create', current) || !current()) return
    const initialTemplate = templates.value[0]
    generateState.value = {
      templateId: initialTemplate?.id,
      language: locale.value === 'fr' ? 'fra' : 'eng',
      outputFormat: initialTemplate?.egcs_ay_outputformats[0] || 'docx'
    }
    isGenerateOpen.value = true
  } catch (error: unknown) {
    if (current()) showError(error)
  } finally {
    if (current()) isOpeningGenerate.value = false
  }
}

watch(() => generateState.value?.templateId, () => {
  if (!generateState.value) return
  const formats = outputFormatItems.value.map(item => item.value)
  if (!generateState.value.outputFormat || !formats.includes(generateState.value.outputFormat)) {
    generateState.value.outputFormat = formats[0] || 'docx'
  }
})

const downloadDocument = async (generatedDocument: AgreementGeneratedDocumentItem) => {
  const generation = ownerGeneration
  const requestedBase = apiBase.value
  const current = () => generation === ownerGeneration && requestedBase === apiBase.value
  try {
    const response = await fetch(getClientRequestUrl(`${requestedBase}/documents/${generatedDocument.id}/download`))
    if (!response.ok) await throwFetchResponseError(response)
    const blob = await response.blob()
    if (!current()) return
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
    if (current()) showError(error)
  }
}

const generateDocument = async () => {
  if (!canCreate || !generateState.value?.templateId || !generateState.value.outputFormat || isGenerating.value) {
    return
  }

  let generation = ++operationGeneration
  const requestedBase = apiBase.value
  const draft = generateState.value
  const current = () => generation === operationGeneration && requestedBase === apiBase.value
  try {
    isGenerating.value = true
    if (!await checkDocumentPrerequisites('create', current) || !current()) return
    const response = await fetch(getClientRequestUrl(`${requestedBase}/documents/generate`), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(draft)
    })
    if (!response.ok) await throwFetchResponseError(response)
    if (!current()) return
    isGenerateOpen.value = false
    generation = operationGeneration
    await refresh()
    if (!current()) return
    toast.add({ title: toast.localized('common.success'), description: toast.localized('agreement.documents.generated_success'), color: 'success' })
  } catch (error: unknown) {
    if (current()) showError(error)
  } finally {
    if (current()) isGenerating.value = false
  }
}

const deleteDocument = async (generatedDocument: AgreementGeneratedDocumentItem) => {
  const generation = operationGeneration
  const requestedBase = apiBase.value
  const current = () => generation === operationGeneration && requestedBase === apiBase.value
  try {
    if (!await checkDocumentPrerequisites('delete', current) || !current()) return
    const ok = await confirmDeleteRequest(`${requestedBase}/documents/${generatedDocument.id}`)
    if (!ok || !current()) return
    await refresh()
    if (!current()) return
    toast.add({ title: toast.localized('common.success'), description: toast.localized('common.deleted_success'), color: 'success' })
  } catch (error: unknown) {
    if (current()) showError(error)
  }
}
</script>

<template>
  <div class="w-full" data-field-tooltip-context="agreement" data-field-scope="agreement.documents-tab" data-scope-label-en="Agreements > Documents" data-scope-label-fr="Ententes > Documents" @focusin="checkCatalogVersions">
    <UAlert
      v-if="templatesStatus === 'error' || catalogCheckFailed"
      color="error"
      icon="i-lucide-circle-alert"
      :title="t('common.error')"
      class="mb-4">
      <template #actions>
        <UButton color="error" variant="soft" size="sm" icon="i-lucide-refresh-cw" :label="t('common.retry')" @click="retryTemplates" />
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
      :button-disabled="isOpeningGenerate || isGenerating"
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
          <CommonActionButton
            icon="i-lucide-download"
            color="neutral"
            variant="ghost"
            class="cursor-default"
            :aria-label="`${t('common.download')}: ${locale === 'fr' ? row.original.egcs_fc_name_fr : row.original.egcs_fc_name_en}`"
            @click="downloadDocument(row.original)" />
          <CommonActionButton
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
        <UForm :state="generateState" :validate="validateGenerate" class="space-y-4" @submit="generateDocument">
          <UFormField :label="t('transfer_payment.document_templates.title')" name="templateId">
            <CommonBilingualSelectMenu
              v-model="generateState.templateId"
              :items="templateOptions"
              value-key="id"
              label-en-key="egcs_ay_name_en"
              label-fr-key="egcs_ay_name_fr"
              :searchable="templates.length > 5"
              :disabled="checkingCatalog || catalogCheckFailed"
              class="w-full"
              @update:open="(open: boolean) => open && checkCatalogVersions()" />
          </UFormField>
          <p v-if="selectedTemplate" class="text-sm leading-5 text-muted">
            {{ locale === 'fr' ? selectedTemplate.egcs_ay_description_fr : selectedTemplate.egcs_ay_description_en }}
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
