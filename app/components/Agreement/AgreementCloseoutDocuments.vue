<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- component-local callbacks are self-descriptive */
import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { AgreementGeneratedDocumentItem, TransferPaymentStreamDocumentTemplateItem } from '~~/shared/types/schemas'
import type { TransferPaymentDocumentTemplateOutputFormat } from '~~/shared/types/database'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'

const { agreementId, closeoutId, canPersist } = defineProps<{ agreementId: string, closeoutId: string, canPersist: boolean }>()
const { t, locale } = useI18n()
const { showError } = useApiErrorToast()
const toast = useToast()
const templates: Ref<TransferPaymentStreamDocumentTemplateItem[]> = ref([])
const documents: Ref<AgreementGeneratedDocumentItem[]> = ref([])
const selectedTemplateId: Ref<string | undefined> = ref(undefined)
const language: Ref<'eng' | 'fra'> = ref(locale.value === 'fr' ? 'fra' : 'eng')
const outputFormat: Ref<TransferPaymentDocumentTemplateOutputFormat> = ref('docx')
const isGenerating: Ref<boolean> = ref(false)
const loadStatus: Ref<'pending' | 'success' | 'error'> = ref('pending')
let loadGeneration = 0
const selectedTemplate = computed(() => templates.value.find(template => template.id === selectedTemplateId.value))
const outputFormats = computed(() => selectedTemplate.value?.egcs_tp_outputformats ?? [])
watch(outputFormats, formats => {
  if (!formats.includes(outputFormat.value)) {
    outputFormat.value = formats[0] ?? 'docx'
  }
})

const baseUrl = computed(() => `/api/agreements/${agreementId}/closeouts/${closeoutId}`)
const refresh = async () => {
  const generation = ++loadGeneration
  const requestedBaseUrl = baseUrl.value
  loadStatus.value = 'pending'
  const [templateResponse, documentResponse] = await Promise.all([
    fetch(getClientRequestUrl(`${requestedBaseUrl}/document-templates`)),
    fetch(getClientRequestUrl(`${requestedBaseUrl}/documents`))
  ])
  if (!templateResponse.ok) await throwFetchResponseError(templateResponse)
  if (!documentResponse.ok) await throwFetchResponseError(documentResponse)
  const templateItems = (await templateResponse.json() as { items: TransferPaymentStreamDocumentTemplateItem[] }).items
  const documentItems = (await documentResponse.json() as { items: AgreementGeneratedDocumentItem[] }).items
  if (generation !== loadGeneration || requestedBaseUrl !== baseUrl.value) return false
  templates.value = templateItems.map(template => ({ ...template, id: String(template.id) }))
  documents.value = documentItems
  if (!templates.value.some(template => template.id === selectedTemplateId.value)) {
    selectedTemplateId.value = templates.value[0]?.id
  }
  if (!outputFormats.value.includes(outputFormat.value)) {
    outputFormat.value = outputFormats.value[0] ?? 'docx'
  }
  loadStatus.value = 'success'
  return true
}

const load = async () => {
  try {
    await refresh()
  } catch (error: unknown) {
    loadStatus.value = 'error'
    showError(error)
  }
}
watch(baseUrl, () => {
  templates.value = []
  documents.value = []
  selectedTemplateId.value = undefined
  void load()
}, { immediate: true })

const saveBlob = async (response: Response, fallbackName: string) => {
  const blob = await response.blob()
  const disposition = response.headers.get('content-disposition') ?? ''
  const filename = /filename="?([^";]+)"?/i.exec(disposition)?.[1] ?? fallbackName
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

const generate = async (persist: boolean) => {
  if (!selectedTemplateId.value || isGenerating.value) return
  try {
    isGenerating.value = true
    const response = await fetch(getClientRequestUrl(`${baseUrl.value}/documents/${persist ? 'generate' : 'preview'}`), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ templateId: selectedTemplateId.value, language: language.value, outputFormat: outputFormat.value })
    })
    if (!response.ok) await throwFetchResponseError(response)
    if (persist) {
      try {
        await refresh()
      } catch (error: unknown) {
        loadStatus.value = 'error'
        showError(error)
        return
      }
      toast.add({ title: t('common.success'), description: t('agreement.documents.generated_success'), color: 'success' })
    } else {
      await saveBlob(response, `closeout-${closeoutId}.${outputFormat.value}`)
    }
  } catch (error: unknown) {
    showError(error)
  } finally {
    isGenerating.value = false
  }
}

const download = async (item: AgreementGeneratedDocumentItem) => {
  try {
    const response = await fetch(getClientRequestUrl(`${baseUrl.value}/documents/${item.id}/download`))
    if (!response.ok) await throwFetchResponseError(response)
    await saveBlob(response, `${item.egcs_fc_name_en}.${item.egcs_fc_outputformat}`)
  } catch (error: unknown) { showError(error) }
}
</script>

<template>
  <div class="space-y-6">
    <UAlert v-if="loadStatus === 'error'" color="error" icon="i-lucide-circle-alert" :title="t('common.error')">
      <template #actions>
        <UButton color="error" variant="soft" size="sm" icon="i-lucide-refresh-cw" :label="t('common.retry')" @click="load" />
      </template>
    </UAlert>
    <div v-if="templates.length" class="grid gap-4 rounded-lg border border-default p-4 md:grid-cols-[minmax(0,2fr)_1fr_1fr_auto] md:items-end">
      <UFormField :label="t('transfer_payment.document_templates.title')">
        <CommonBilingualSelectMenu v-model="selectedTemplateId" :items="templates" value-key="id" label-en-key="egcs_tp_name_en" label-fr-key="egcs_tp_name_fr" class="w-full" />
      </UFormField>
      <UFormField :label="t('agency.detail.language')">
        <CommonEnumSelect v-model="language" name="language_preference" class="w-full" />
      </UFormField>
      <UFormField :label="t('transfer_payment.document_templates.output_format')">
        <CommonEnumSelect v-model="outputFormat" name="transfer_payment_document_template_output_format" :items="outputFormats.map(value => ({ value, label: t(`enums.transfer_payment_document_template_output_format.${value}`) }))" class="w-full" />
      </UFormField>
      <div class="flex gap-2">
        <UButton color="neutral" variant="soft" icon="i-lucide-download" :label="t('agreement.closeout.preview_document')" :loading="isGenerating" @click="generate(false)" />
        <UButton v-if="canPersist" icon="i-lucide-file-plus" :label="t('agreement.documents.generate')" :loading="isGenerating" @click="generate(true)" />
      </div>
    </div>
    <UAlert v-else color="info" icon="i-lucide-info" :title="t('agreement.closeout.no_document_templates')" />

    <div class="overflow-hidden rounded-lg border border-default">
      <div v-for="item in documents" :key="item.id" class="flex items-center justify-between gap-3 border-b border-default px-4 py-3 last:border-b-0">
        <div>
          <p class="font-medium text-highlighted">
            {{ locale === 'fr' ? item.egcs_fc_name_fr : item.egcs_fc_name_en }}
          </p>
          <p class="text-sm text-muted">
            {{ t(`enums.language_preference.${item.egcs_fc_language}`) }} · {{ item.egcs_fc_outputformat.toUpperCase() }} · {{ new Date(item.egcs_fc_generatedat).toLocaleString(locale) }}
          </p>
        </div>
        <UButton color="neutral" variant="ghost" icon="i-lucide-download" :aria-label="`${t('common.download')}: ${locale === 'fr' ? item.egcs_fc_name_fr : item.egcs_fc_name_en}`" @click="download(item)" />
      </div>
      <p v-if="documents.length === 0" class="px-4 py-6 text-center text-sm text-muted">
        {{ t('common.no_data') }}
      </p>
    </div>
  </div>
</template>
