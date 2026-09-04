<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- component-local handlers are self-describing */
import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getGcsExtensionComponent } from '#gcs-extensions/registry'
import { AttachmentMetadataBaseSchema } from '~~/shared/types/schemas'

type JsonObject = Record<string, unknown>

interface AttachmentItem {
  id: string
  attachment_type_id: string
  attachment_type_name_en: string
  attachment_type_name_fr: string
  name_en: string
  name_fr: string
  description_en: string
  description_fr: string
  filename?: string
  original_filename?: string
  mime_type: string
  file_size: string | number
  uploaded_at: string
  uploaded_by_name?: string
  uploader_name?: string
  provider_metadata?: JsonObject | null
  provider_metadata_component_name?: string | null
  provider_metadata_mutability?: 'upload-only' | 'editable' | null
  can_update?: boolean
  can_delete?: boolean
}

interface AttachmentListResponse {
  items: AttachmentItem[]
  total: number
  can_upload?: boolean
  agency_id?: string
  provider_metadata?: {
    componentName?: string | null
    mutability?: 'upload-only' | 'editable'
    value?: JsonObject
  } | null
}

interface AttachmentFormState {
  attachmentTypeId?: string
  nameEn: string
  nameFr: string
  descriptionEn: string
  descriptionFr: string
  providerMetadata: JsonObject
  file: File | null
}

interface AttachmentHostPatch {
  attachmentTypeId?: string
  nameEn?: string
  nameFr?: string
  descriptionEn?: string
  descriptionFr?: string
}

const { entityType, entityId } = defineProps<{
  entityType: string
  entityId: string
}>()

const { t, locale } = useI18n()
const { getBilingualValue } = useBilingualValue()
const { formatDate } = useDateHelpers({
  formatterOptions: { dateStyle: 'medium', timeStyle: 'short' },
  fallback: ''
})
const { createValidator } = useZodI18n()
const validateMetadata = createValidator(AttachmentMetadataBaseSchema)
const toast = useToast()
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const baseUrl = computed(() => `/api/attachments/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`)
const selectedAttachment: Ref<AttachmentItem | null> = ref(null)
const formState: Ref<AttachmentFormState | null> = ref(null)
const isModalOpen: Ref<boolean> = ref(false)
const isSaving: Ref<boolean> = ref(false)

const {
  items,
  totalRecords,
  refresh,
  status,
  error = ref(undefined),
  search,
  pagination,
  response
} = useResourceTable<AttachmentItem>({
  fetchUrl: baseUrl
})

const attachmentResponse = computed(() => response.value as AttachmentListResponse | null | undefined)
const hasAttachmentListError = computed(() => status.value === 'error' || error.value !== undefined)
const canUpload = computed(() => status.value === 'success' && attachmentResponse.value?.can_upload === true)
const isEditing = computed(() => selectedAttachment.value !== null)
const uploadMetadataDeclaration = computed(() => attachmentResponse.value?.provider_metadata ?? null)
const metadataComponentName = computed(() => {
  if (!isEditing.value) return uploadMetadataDeclaration.value?.componentName
  return selectedAttachment.value?.provider_metadata_mutability === 'editable'
    ? selectedAttachment.value.provider_metadata_component_name
    : null
})
const metadataComponent = computed(() => metadataComponentName.value
  ? getGcsExtensionComponent(metadataComponentName.value)
  : null)
const metadataEditable = computed(() => !isEditing.value
  || selectedAttachment.value?.provider_metadata_mutability === 'editable')
const getAttachmentLabel = (attachment: AttachmentItem) =>
  getBilingualValue(attachment, 'name', attachment.original_filename || attachment.filename || attachment.id)

const columns: TableColumnInput<AttachmentItem>[] = [
  { id: 'name', headerKey: 'common.name' },
  { id: 'type', headerKey: 'attachments.type' },
  { accessorKey: 'mime_type', headerKey: 'attachments.mime_type' },
  { id: 'size', headerKey: 'attachments.size' },
  { id: 'uploaded', headerKey: 'attachments.uploaded' },
  { id: 'actions', headerKey: 'common.actions' }
]

const formatSize = (value: string | number): string => {
  const bytes = Number(value)
  if (!Number.isFinite(bytes) || bytes < 0) return t('common.not_available')
  const format = (amount: number): string => new Intl.NumberFormat(locale.value, {
    maximumFractionDigits: 1
  }).format(amount)
  if (bytes < 1024) return `${format(bytes)} B`
  if (bytes < 1024 * 1024) return `${format(bytes / 1024)} KB`
  return `${format(bytes / (1024 * 1024))} MB`
}
const formatUploadedAt = (value: string): string => formatDate(value) || t('common.not_available')

const emptyState = (): AttachmentFormState => ({
  nameEn: '',
  nameFr: '',
  descriptionEn: '',
  descriptionFr: '',
  providerMetadata: { ...(uploadMetadataDeclaration.value?.value ?? {}) },
  file: null
})

const openUpload = () => {
  if (!canUpload.value) return
  selectedAttachment.value = null
  formState.value = emptyState()
  isModalOpen.value = true
}

const openEdit = (item: AttachmentItem) => {
  if (status.value !== 'success' || item.can_update !== true) return
  selectedAttachment.value = item
  formState.value = {
    attachmentTypeId: item.attachment_type_id,
    nameEn: item.name_en,
    nameFr: item.name_fr,
    descriptionEn: item.description_en,
    descriptionFr: item.description_fr,
    providerMetadata: { ...(item.provider_metadata ?? {}) },
    file: null
  }
  isModalOpen.value = true
}

const resetModalState = () => {
  isModalOpen.value = false
  selectedAttachment.value = null
  formState.value = null
}

const closeModal = () => {
  if (isSaving.value) return
  resetModalState()
}

const onFileChange = (event: Event) => {
  if (!formState.value) return
  const input = event.target as HTMLInputElement
  formState.value.file = input.files?.[0] ?? null
}

const cloneJsonObject = (value: JsonObject): JsonObject => JSON.parse(JSON.stringify(value)) as JsonObject

const patchAttachment = async (attachmentId: string, patchBody: AttachmentHostPatch | { providerMetadata: JsonObject }) => {
  const responseValue = await fetch(getClientRequestUrl(`${baseUrl.value}/${attachmentId}`), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patchBody)
  })
  if (!responseValue.ok) await throwFetchResponseError(responseValue)
}

const applyHostPatch = (attachment: AttachmentItem, patch: AttachmentHostPatch): AttachmentItem => ({
  ...attachment,
  attachment_type_id: patch.attachmentTypeId ?? attachment.attachment_type_id,
  name_en: patch.nameEn ?? attachment.name_en,
  name_fr: patch.nameFr ?? attachment.name_fr,
  description_en: patch.descriptionEn ?? attachment.description_en,
  description_fr: patch.descriptionFr ?? attachment.description_fr
})

const rebasePartiallySavedEdit = async (
  attachment: AttachmentItem,
  hostPatch: AttachmentHostPatch,
  providerMetadataDraft: JsonObject
) => {
  try {
    await refresh()
  } catch {
    // The list publishes its own retryable error; retain a deterministic local view of the saved host fields.
  }
  const refreshedAttachment = items.value.find(item => item.id === attachment.id)
  const rebasedAttachment = applyHostPatch(refreshedAttachment ?? attachment, hostPatch)
  selectedAttachment.value = rebasedAttachment
  formState.value = {
    attachmentTypeId: rebasedAttachment.attachment_type_id,
    nameEn: rebasedAttachment.name_en,
    nameFr: rebasedAttachment.name_fr,
    descriptionEn: rebasedAttachment.description_en,
    descriptionFr: rebasedAttachment.description_fr,
    providerMetadata: providerMetadataDraft,
    file: null
  }
  isModalOpen.value = true
}

const save = async () => {
  if (!formState.value || isSaving.value) return
  if (!isEditing.value && !formState.value.file) return

  let savedHostPatch: AttachmentHostPatch | null = null
  let failedProviderMetadataDraft: JsonObject | null = null
  let editingAttachment: AttachmentItem | null = null
  let providerMetadataSaved = false
  try {
    isSaving.value = true
    if (selectedAttachment.value) {
      const attachment = selectedAttachment.value
      editingAttachment = attachment
      const providerMetadataChanged = metadataEditable.value
        && JSON.stringify(formState.value.providerMetadata) !== JSON.stringify(attachment.provider_metadata ?? {})
      const hostPatch: AttachmentHostPatch = {
        ...(formState.value.attachmentTypeId !== attachment.attachment_type_id
          ? { attachmentTypeId: formState.value.attachmentTypeId }
          : {}),
        ...(formState.value.nameEn !== attachment.name_en ? { nameEn: formState.value.nameEn } : {}),
        ...(formState.value.nameFr !== attachment.name_fr ? { nameFr: formState.value.nameFr } : {}),
        ...(formState.value.descriptionEn !== (attachment.description_en ?? '')
          ? { descriptionEn: formState.value.descriptionEn }
          : {}),
        ...(formState.value.descriptionFr !== (attachment.description_fr ?? '')
          ? { descriptionFr: formState.value.descriptionFr }
          : {})
      }
      const hasHostPatch = Object.keys(hostPatch).length > 0
      if (!hasHostPatch && !providerMetadataChanged) {
        resetModalState()
        return
      }
      if (hasHostPatch) {
        await patchAttachment(attachment.id, hostPatch)
        savedHostPatch = hostPatch
      }
      if (providerMetadataChanged) {
        failedProviderMetadataDraft = cloneJsonObject(formState.value.providerMetadata)
        await patchAttachment(attachment.id, { providerMetadata: formState.value.providerMetadata })
        providerMetadataSaved = true
      }
    } else {
      const body = new FormData()
      body.set('file', formState.value.file as File)
      body.set('attachmentTypeId', formState.value.attachmentTypeId ?? '')
      body.set('nameEn', formState.value.nameEn)
      body.set('nameFr', formState.value.nameFr)
      body.set('descriptionEn', formState.value.descriptionEn)
      body.set('descriptionFr', formState.value.descriptionFr)
      body.set('providerMetadata', JSON.stringify(formState.value.providerMetadata))
      const responseValue = await fetch(getClientRequestUrl(baseUrl.value), { method: 'POST', body })
      if (!responseValue.ok) await throwFetchResponseError(responseValue)
    }
    resetModalState()
    toast.add({ title: t('common.success'), description: t('common.updated_success'), color: 'success' })
    try {
      await refresh()
    } catch (refreshError) {
      showError(refreshError)
    }
  } catch (error: unknown) {
    if (editingAttachment && savedHostPatch && failedProviderMetadataDraft && !providerMetadataSaved) {
      await rebasePartiallySavedEdit(editingAttachment, savedHostPatch, failedProviderMetadataDraft)
      toast.add({
        title: t('attachments.partial_update_title'),
        description: t('attachments.partial_update_metadata_failed'),
        color: 'warning'
      })
    }
    showError(error)
  } finally {
    isSaving.value = false
  }
}

const download = async (item: AttachmentItem) => {
  if (status.value !== 'success') return
  try {
    const responseValue = await fetch(getClientRequestUrl(`${baseUrl.value}/${item.id}/download`))
    if (!responseValue.ok) await throwFetchResponseError(responseValue)
    const blob = await responseValue.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = item.filename ?? item.original_filename ?? `${item.name_en || item.name_fr}`
    link.click()
    URL.revokeObjectURL(url)
  } catch (error: unknown) {
    showError(error)
  }
}

const remove = async (item: AttachmentItem) => {
  if (status.value !== 'success' || item.can_delete !== true) return
  const deleted = await confirmDeleteRequest(`${baseUrl.value}/${item.id}`)
  if (!deleted) return
  toast.add({ title: t('common.success'), description: t('common.deleted_success'), color: 'success' })
  try {
    await refresh()
  } catch (error) {
    showError(error)
  }
}

const retryAttachmentList = async () => {
  try {
    await refresh()
  } catch {
    // useResourceTable publishes the current request error for the inline alert.
  }
}
</script>

<template>
  <div class="w-full">
    <UAlert
      v-if="hasAttachmentListError"
      color="error"
      variant="soft"
      icon="i-lucide-circle-alert"
      :title="t('attachments.load_failed')"
      :description="t('attachments.load_failed_description')">
      <template #actions>
        <UButton color="error" variant="soft" size="sm" icon="i-lucide-refresh-cw" :label="t('common.retry')" @click="retryAttachmentList" />
      </template>
    </UAlert>

    <CommonResourceLayoutCard
      v-else
      v-model:search="search"
      v-model:pagination="pagination"
      :data="items"
      :columns="columns"
      :total-records="totalRecords"
      :loading="status === 'pending'"
      :button-label="t('attachments.upload')"
      :show-button="canUpload"
      search-placeholder=""
      @add="openUpload">
      <template #name-cell="{ row }">
        <CommonBilingualName :name-en="row.original.name_en" :name-fr="row.original.name_fr" />
        <p class="text-sm text-muted">
          {{ getBilingualValue(row.original, 'description', t('common.not_available')) }}
        </p>
        <p class="text-xs text-muted">
          {{ row.original.filename ?? row.original.original_filename ?? t('common.not_available') }}
        </p>
      </template>
      <template #type-cell="{ row }">
        {{ getBilingualValue(row.original, 'attachment_type_name', t('common.not_available')) }}
      </template>
      <template #size-cell="{ row }">
        {{ formatSize(row.original.file_size) }}
      </template>
      <template #uploaded-cell="{ row }">
        <div>{{ row.original.uploaded_by_name ?? row.original.uploader_name ?? t('common.not_available') }}</div>
        <div class="text-xs text-muted">
          {{ formatUploadedAt(row.original.uploaded_at) }}
        </div>
      </template>
      <template #actions-cell="{ row }">
        <div v-if="status === 'success'" class="flex items-center justify-end gap-1">
          <UButton icon="i-lucide-download" color="neutral" variant="ghost" :aria-label="`${t('common.download')}: ${getAttachmentLabel(row.original)}`" @click="download(row.original)" />
          <UButton v-if="row.original.can_update" icon="i-lucide-pencil" color="neutral" variant="ghost" :aria-label="t('common.edit_named', { name: getAttachmentLabel(row.original) })" @click="openEdit(row.original)" />
          <UButton v-if="row.original.can_delete" icon="i-lucide-trash" color="error" variant="ghost" :aria-label="t('common.delete_named', { name: getAttachmentLabel(row.original) })" @click="remove(row.original)" />
        </div>
      </template>
    </CommonResourceLayoutCard>

    <UModal v-if="formState" v-model:open="isModalOpen" :title="t(isEditing ? 'attachments.edit' : 'attachments.upload')" :dismissible="!isSaving" @update:open="value => value ? undefined : closeModal()">
      <template #body>
        <UForm :state="formState" :validate="validateMetadata" class="space-y-4" @submit="save">
          <UFormField v-if="!isEditing" :label="t('attachments.file')" name="file" required>
            <input type="file" class="block w-full text-sm" required @change="onFileChange">
          </UFormField>
          <UFormField :label="t('attachments.type')" name="attachmentTypeId" required>
            <CommonServerLookupSelect v-model="formState.attachmentTypeId" :fetch-url="`${baseUrl}/types`" value-key="id" label-en-key="egcs_cn_name_en" label-fr-key="egcs_cn_name_fr" :show-value-in-label="false" class="w-full" />
          </UFormField>
          <div class="grid gap-4 md:grid-cols-2">
            <UFormField :label="t('attachments.name_en')" name="nameEn">
              <UInput v-model="formState.nameEn" class="w-full" />
            </UFormField>
            <UFormField :label="t('attachments.name_fr')" name="nameFr">
              <UInput v-model="formState.nameFr" class="w-full" />
            </UFormField>
          </div>
          <div class="grid gap-4 md:grid-cols-2">
            <UFormField :label="t('attachments.description_en')" name="descriptionEn">
              <CommonTextarea v-model="formState.descriptionEn" class="w-full" />
            </UFormField>
            <UFormField :label="t('attachments.description_fr')" name="descriptionFr">
              <CommonTextarea v-model="formState.descriptionFr" class="w-full" />
            </UFormField>
          </div>
          <component
            :is="metadataComponent"
            v-if="metadataComponent"
            v-model="formState.providerMetadata"
            :mode="isEditing ? 'update' : 'create'"
            :agency-id="attachmentResponse?.agency_id ?? ''"
            purpose="attachment"
            :target="{ entityType, entityId }"
            :target-context="{ entityType, entityId }"
            :disabled="isSaving || !metadataEditable"
            :read-only="!metadataEditable" />
          <div class="flex justify-end gap-2 pt-2">
            <UButton :label="t('common.cancel')" color="neutral" variant="ghost" :disabled="isSaving" @click="closeModal" />
            <CommonSaveButton :label="t('common.save')" :loading="isSaving" :disabled="isSaving || !formState.attachmentTypeId || (!isEditing && !formState.file)" />
          </div>
        </UForm>
      </template>
    </UModal>
  </div>
</template>
