<script setup lang="ts">
import { useCrudModalPending } from '~/composables/useCrudModal'
import { throwFetchResponseError } from '~/utils/fetch-error'
/* eslint-disable jsdoc/require-jsdoc -- component-local callbacks are self-descriptive */
import { getClientRequestUrl } from '~/utils/client-request-url'
import { watch } from 'vue'
import type { Ref } from 'vue'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { buildDocumentTemplateFormData, getDocumentTemplateSaveRequest, type DocumentTemplateFormState } from '~/utils/document-template-form'
import type { TransferPaymentStreamDocumentTemplateItem } from '~~/shared/types/schemas'
import type { TransferPaymentDocumentTemplateOutputFormat } from '~~/shared/types/database'
import {
  TRANSFER_PAYMENT_DOCUMENT_TEMPLATE_OUTPUT_FORMAT_ENUM,
  TransferPaymentStreamDocumentTemplateCreateSchema
} from '~~/shared/types/schemas'

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
const { createValidator } = useZodI18n()

type TemplateFormState = DocumentTemplateFormState

const {
  search,
  pagination,
  items,
  totalRecords,
  refresh,
  status
} = useResourceTable<TransferPaymentStreamDocumentTemplateItem>({
  fetchUrl: computed(() => `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/document-templates`)
})

const columns: TableColumnInput<TransferPaymentStreamDocumentTemplateItem>[] = [
  { accessorKey: 'egcs_tp_entitytype', headerKey: 'transfer_payment.entity_type' },
  { id: 'name', accessorKey: 'egcs_tp_name_en', headerKey: 'common.name' },
  { accessorKey: 'egcs_tp_templatekind', headerKey: 'transfer_payment.document_templates.template_kind' },
  { id: 'outputFormats', headerKey: 'transfer_payment.document_templates.output_formats' },
  { accessorKey: 'egcs_tp_active', headerKey: 'common.status' },
  { id: 'attachments', headerKey: 'transfer_payment.document_templates.attachments' },
  { id: 'actions', headerKey: 'common.actions' }
]

const templateModal = useCrudModal<TransferPaymentStreamDocumentTemplateItem, TemplateFormState>({
  createState: () => ({
    egcs_tp_entitytype: 'fundingcaseagreement',
    egcs_tp_templatekind: 'docx',
    egcs_tp_outputformats: ['docx', 'pdf'],
    egcs_tp_active: true,
    fileEn: null,
    fileFr: null
  }),
  updateState: row => ({ ...row, fileEn: null, fileFr: null })
})
const {
  isOpen,
  selected,
  openCreate,
  openUpdate,
  captureSession,
  closeSession
} = templateModal

const selectedTemplate: Ref<TemplateFormState | null> = selected
const templatePending = useCrudModalPending(captureSession)
const isSaving = templatePending.isPending
const fileInputVersion: Ref<number> = ref(0)
const validate = createValidator(TransferPaymentStreamDocumentTemplateCreateSchema)
const outputFormatOptions = TRANSFER_PAYMENT_DOCUMENT_TEMPLATE_OUTPUT_FORMAT_ENUM
const fileAccept = computed(() => selectedTemplate.value?.egcs_tp_templatekind === 'html' ? '.html,.htm' : '.docx')
const compatibleOutputFormats: Record<'docx' | 'html', TransferPaymentDocumentTemplateOutputFormat[]> = {
  docx: ['docx', 'pdf'],
  html: ['html', 'pdf']
}
const { getBilingualValue } = useBilingualValue()
const getTemplateActionTarget = (template: TransferPaymentStreamDocumentTemplateItem) =>
  `${getBilingualValue(template, 'egcs_tp_name', String(template.id))} [${template.id}]`
const getDownloadActionName = (template: TransferPaymentStreamDocumentTemplateItem, language: 'eng' | 'fra') =>
  `${t('common.download')}: ${getTemplateActionTarget(template)} (${t(`enums.language_preference.${language}`)})`

const hasOutputFormat = (format: TransferPaymentDocumentTemplateOutputFormat) => Boolean(selectedTemplate.value?.egcs_tp_outputformats?.includes(format))

const getTemplateDownloadUrl = (template: TransferPaymentStreamDocumentTemplateItem, language: 'eng' | 'fra') => {
  return `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/document-templates/${template.id}/download?language=${language}`
}

const canSelectOutputFormat = (format: TransferPaymentDocumentTemplateOutputFormat) => {
  const kind = selectedTemplate.value?.egcs_tp_templatekind
  return kind ? compatibleOutputFormats[kind].includes(format) : false
}

const toggleOutputFormat = (format: TransferPaymentDocumentTemplateOutputFormat, enabled: boolean) => {
  if (!selectedTemplate.value) return
  if (!canSelectOutputFormat(format)) return
  const current = selectedTemplate.value.egcs_tp_outputformats || []
  if (enabled) {
    selectedTemplate.value.egcs_tp_outputformats = [...new Set([...current, format])]
    return
  }
  selectedTemplate.value.egcs_tp_outputformats = current.filter(item => item !== format)
}

const clearSelectedTemplateFiles = () => {
  if (!selectedTemplate.value) return
  selectedTemplate.value.fileEn = null
  selectedTemplate.value.fileFr = null
  fileInputVersion.value += 1
}

watch(() => selectedTemplate.value?.egcs_tp_templatekind, kind => {
  if (!selectedTemplate.value || selectedTemplate.value.id || !kind) return
  selectedTemplate.value.egcs_tp_outputformats = [...compatibleOutputFormats[kind]]
  clearSelectedTemplateFiles()
}, { flush: 'sync' })
watch([() => transferPaymentId, () => streamId], () => templateModal.close())

const onFileChange = (event: Event, language: 'en' | 'fr') => {
  const input = event.target as HTMLInputElement
  if (language === 'en') {
    selectedTemplate.value!.fileEn = input.files?.[0] ?? null
    return
  }
  selectedTemplate.value!.fileFr = input.files?.[0] ?? null
}

const saveTemplate = async () => {
  if (!selectedTemplate.value) return
  const item = selectedTemplate.value
  const formData = buildDocumentTemplateFormData(item)
  const request = getDocumentTemplateSaveRequest(transferPaymentId, streamId, item)
  const session = captureSession()
  if (!templatePending.begin(session)) return

  try {
    const response = await fetch(getClientRequestUrl(request.url), {
      method: request.method,
      body: formData
    })
    if (!response.ok) await throwFetchResponseError(response)
    if (!closeSession(session)) return
  } catch (error: unknown) {
    if (captureSession() === session) showError(error)
    return
  } finally {
    templatePending.end(session)
  }

  toast.add({ title: t('common.success'), description: request.isUpdate ? t('common.updated_success') : t('common.added_success'), color: 'success' })
  try {
    await refresh()
  } catch (error: unknown) {
    showError(error)
  }
}

const deleteTemplate = async (row: TransferPaymentStreamDocumentTemplateItem) => {
  try {
    const ok = await confirmDeleteRequest(`/api/transfer-payments/${transferPaymentId}/streams/${streamId}/document-templates/${row.id}`)
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
</script>

<template>
  <div class="space-y-6">
    <CommonResourceLayoutCard
      v-model:search="search"
      v-model:pagination="pagination"
      :data="items"
      :columns="columns"
      :bilingual-columns="[{ id: 'name', accessorKey: { en: 'egcs_tp_name_en', fr: 'egcs_tp_name_fr' } }]"
      :total-records="totalRecords"
      :loading="status === 'pending'"
      :request-status="status"
      :button-label="canUpdateChild ? t('common.add') : undefined"
      :show-button="canUpdateChild"
      table-class="document-templates-table"
      @add="openCreate"
      @retry="refresh">
      <template #name-cell="{ row }">
        <button
          v-if="canUpdateChild"
          type="button"
          class="text-left font-bold text-zinc-900 transition-colors hover:text-primary dark:text-white"
          :aria-label="t('common.edit_named', { name: getTemplateActionTarget(row.original) })"
          @click="openUpdate(row.original)">
          <CommonBilingualName :name-en="row.original.egcs_tp_name_en" :name-fr="row.original.egcs_tp_name_fr" />
        </button>
        <div v-else class="font-bold text-zinc-900 dark:text-white">
          <CommonBilingualName :name-en="row.original.egcs_tp_name_en" :name-fr="row.original.egcs_tp_name_fr" />
        </div>
      </template>

      <template #egcs_tp_active-cell="{ row }">
        <CommonStatusBadge :variant="row.original.egcs_tp_active ? 'active' : 'inactive'" />
      </template>

      <template #egcs_tp_entitytype-cell="{ row }">
        <CommonEntityTypeBadge :type="row.original.egcs_tp_entitytype" variant="meta" />
      </template>

      <template #egcs_tp_templatekind-cell="{ row }">
        <UBadge color="neutral" variant="subtle">
          {{ row.original.egcs_tp_templatekind.toUpperCase() }}
        </UBadge>
      </template>

      <template #outputFormats-cell="{ row }">
        <div class="flex flex-wrap gap-1">
          <UBadge v-for="format in row.original.egcs_tp_outputformats" :key="format" color="neutral" variant="subtle">
            {{ t(`enums.transfer_payment_document_template_output_format.${format}`) }}
          </UBadge>
        </div>
      </template>

      <template #attachments-cell="{ row }">
        <div class="space-y-1 text-xs leading-5">
          <div class="flex items-center justify-between gap-2">
            <span>{{ t('enums.language_preference.eng') }}: {{ row.original.attachment_en_name_en }}</span>
            <UButton
              icon="i-lucide-download"
              color="neutral"
              variant="ghost"
              size="xs"
              class="shrink-0 cursor-default"
              :href="getTemplateDownloadUrl(row.original, 'eng')"
              external
              download
              :aria-label="getDownloadActionName(row.original, 'eng')" />
          </div>
          <div class="flex items-center justify-between gap-2">
            <span>{{ t('enums.language_preference.fra') }}: {{ row.original.attachment_fr_name_fr }}</span>
            <UButton
              icon="i-lucide-download"
              color="neutral"
              variant="ghost"
              size="xs"
              class="shrink-0 cursor-default"
              :href="getTemplateDownloadUrl(row.original, 'fra')"
              external
              download
              :aria-label="getDownloadActionName(row.original, 'fra')" />
          </div>
        </div>
      </template>

      <template #actions-cell="{ row }">
        <div class="flex items-center gap-2">
          <UButton v-if="canUpdateChild" icon="i-lucide-pencil" color="neutral" variant="ghost" size="sm" class="cursor-default" :aria-label="t('common.edit_named', { name: getTemplateActionTarget(row.original) })" @click="openUpdate(row.original)" />
          <UButton v-if="canDeleteChild" icon="i-lucide-trash" color="error" variant="ghost" size="sm" class="cursor-default" :aria-label="t('common.delete_named', { name: getTemplateActionTarget(row.original) })" @click="deleteTemplate(row.original)" />
        </div>
      </template>
    </CommonResourceLayoutCard>

    <UModal
      v-if="selectedTemplate"
      v-model:open="isOpen"
      :title="selectedTemplate.id ? t('transfer_payment.document_templates.update') : t('transfer_payment.document_templates.create')"
      :description="t('common.form_dialog_description')">
      <template #body>
        <UForm :state="selectedTemplate" :validate="validate" class="space-y-4" @submit="saveTemplate">
          <UFormField :label="t('transfer_payment.entity_type')" name="egcs_tp_entitytype">
            <CommonEnumSelect
              v-model="selectedTemplate.egcs_tp_entitytype"
              name="transfer_payment_document_template_entity_type"
              class="w-full" />
          </UFormField>
          <UFormField :label="t('transfer_payment.document_templates.template_kind')" name="egcs_tp_templatekind">
            <CommonEnumSelect
              v-model="selectedTemplate.egcs_tp_templatekind"
              name="transfer_payment_document_template_kind"
              :disabled="Boolean(selectedTemplate.id)"
              class="w-full" />
          </UFormField>
          <UFormField :label="t('transfer_payment.name_en')" name="egcs_tp_name_en">
            <UInput v-model="selectedTemplate.egcs_tp_name_en" class="w-full" />
          </UFormField>
          <UFormField :label="t('transfer_payment.name_fr')" name="egcs_tp_name_fr">
            <UInput v-model="selectedTemplate.egcs_tp_name_fr" class="w-full" />
          </UFormField>
          <UFormField :label="t('transfer_payment.description_en')" name="egcs_tp_description_en">
            <UTextarea v-model="selectedTemplate.egcs_tp_description_en" class="w-full" />
          </UFormField>
          <UFormField :label="t('transfer_payment.description_fr')" name="egcs_tp_description_fr">
            <UTextarea v-model="selectedTemplate.egcs_tp_description_fr" class="w-full" />
          </UFormField>
          <UFormField :label="t('transfer_payment.document_templates.output_formats')" name="egcs_tp_outputformats">
            <div class="flex flex-wrap gap-4">
              <UCheckbox
                v-for="format in outputFormatOptions"
                :key="format"
                :model-value="hasOutputFormat(format)"
                :label="t(`enums.transfer_payment_document_template_output_format.${format}`)"
                :disabled="!canSelectOutputFormat(format)"
                @update:model-value="value => toggleOutputFormat(format, Boolean(value))" />
            </div>
          </UFormField>
          <div class="grid gap-4 md:grid-cols-2">
            <UFormField :label="t('transfer_payment.document_templates.file_en')" name="fileEn">
              <UInput
                :key="`file-en-${fileInputVersion}`"
                type="file"
                :accept="fileAccept"
                class="w-full"
                @change="onFileChange($event, 'en')" />
            </UFormField>
            <UFormField :label="t('transfer_payment.document_templates.file_fr')" name="fileFr">
              <UInput
                :key="`file-fr-${fileInputVersion}`"
                type="file"
                :accept="fileAccept"
                class="w-full"
                @change="onFileChange($event, 'fr')" />
            </UFormField>
          </div>
          <UCheckbox v-model="selectedTemplate.egcs_tp_active" :label="t('common.active')" />
          <div class="flex justify-end gap-2 pt-4">
            <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="isOpen = false" />
            <CommonSaveButton :label="selectedTemplate.id ? t('common.update') : t('common.add')" :loading="isSaving" :disabled="isSaving" />
          </div>
        </UForm>
      </template>
    </UModal>
  </div>
</template>

<style scoped>
:deep(.document-templates-table) {
  min-width: 0;
  width: 100%;
}

:deep(.document-templates-table table) {
  table-layout: fixed;
  min-width: 0;
  width: 100%;
}

:deep(.document-templates-table th),
:deep(.document-templates-table td) {
  padding-left: 0.75rem;
  padding-right: 0.75rem;
  white-space: normal;
  overflow-wrap: anywhere;
}

:deep(.document-templates-table th:nth-child(1)) {
  width: 14%;
}

:deep(.document-templates-table th:nth-child(2)) {
  width: 24%;
}

:deep(.document-templates-table th:nth-child(3)) {
  width: 9%;
}

:deep(.document-templates-table th:nth-child(4)) {
  width: 10%;
}

:deep(.document-templates-table th:nth-child(5)) {
  width: 9%;
}

:deep(.document-templates-table th:nth-child(6)) {
  width: 27%;
}

:deep(.document-templates-table th:nth-child(7)) {
  width: 7%;
}

:deep(.document-templates-table th:nth-child(7)),
:deep(.document-templates-table td:nth-child(7)) {
  padding-left: 0.5rem;
  padding-right: 0.5rem;
}

:deep(.document-templates-table td:nth-child(7) > div) {
  justify-content: flex-end;
}
</style>
