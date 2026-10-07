<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { TableColumn } from '@nuxt/ui'
import type { AdminCommonLookupResponseItem } from '~~/shared/types/admin-common-ui'
import { z } from 'zod'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'

interface OpportunityAttachmentType {
  id: string
  name_en: string
  name_fr: string
  egcs_fo_isinternal: boolean
}

interface AttachmentTypeDraft {
  id?: string
  egcs_fo_isinternal: boolean
}

interface AttachmentTypeLookupItem {
  id: string
  egcs_cn_name_en: string
  egcs_cn_name_fr: string
}

const {
  opportunityId,
  attachmentTypes,
  canEdit,
  loading = false
} = defineProps<{
  opportunityId: string
  attachmentTypes: OpportunityAttachmentType[]
  canEdit: boolean
  loading?: boolean
}>()
const emit = defineEmits<{ updated: [] }>()
const { t } = useI18n()
const { getBilingualValue } = useBilingualValue()
const { showError } = useApiErrorToast()
const { createValidator } = useZodI18n()

const LinkSchema = z.object({
  id: z.string({ error: 'validation.required' }).min(1, { error: 'validation.required' }),
  egcs_fo_isinternal: z.boolean()
})
const rows: Ref<OpportunityAttachmentType[]> = ref([...attachmentTypes])
const draft: Ref<AttachmentTypeDraft | null> = ref(null)
const selectedType: Ref<AttachmentTypeLookupItem | null> = ref(null)
const pending: Ref<boolean> = ref(false)
const mutationError: Ref<boolean> = ref(false)
let contextGeneration = 0
let disposed = false

const columns = computed<TableColumn<OpportunityAttachmentType>[]>(() => [
  { id: 'name', header: t('attachments.type') },
  { id: 'visibility', header: t('funding_opportunity.attachment_visibility') },
  { id: 'actions', header: t('common.actions') }
])
const linkedIds = computed(() => rows.value.map(row => row.id))
const lookupUrl = computed(() => `/api/funding-opportunities/${opportunityId}/lookups/attachment-types`)
const label = (row: OpportunityAttachmentType): string => getBilingualValue(row, 'name', row.id)

watch(() => attachmentTypes, value => {
  rows.value = [...value]
  mutationError.value = false
})
watch(() => opportunityId, () => {
  contextGeneration += 1
  rows.value = [...attachmentTypes]
  draft.value = null
  selectedType.value = null
  pending.value = false
  mutationError.value = false
}, { flush: 'sync' })
onBeforeUnmount(() => {
  disposed = true
  contextGeneration += 1
})

/** Opens the association form with a portal-visible default. */
const openAdd = () => {
  if (!canEdit || pending.value) return
  draft.value = { id: undefined, egcs_fo_isinternal: false }
  selectedType.value = null
}
/** Closes the association form unless its save is in flight. */
const closeAdd = () => {
  if (pending.value) return
  draft.value = null
  selectedType.value = null
}

/** Keeps the selected type's bilingual names for immediate table feedback after saving.
 * @param items - Resolved lookup rows.
 */
const onResolvedType = (items: AdminCommonLookupResponseItem[]) => {
  const item = items.find(candidate => candidate.id === draft.value?.id)
  selectedType.value = item
    && typeof item.egcs_cn_name_en === 'string'
    && typeof item.egcs_cn_name_fr === 'string'
    ? { id: item.id, egcs_cn_name_en: item.egcs_cn_name_en, egcs_cn_name_fr: item.egcs_cn_name_fr }
    : null
}

/** Saves a complete replacement, preserving every other attachment-type association.
 * @param nextRows - Complete next set of linked types.
 */
const save = async (nextRows: OpportunityAttachmentType[]): Promise<void> => {
  if (!canEdit || pending.value || disposed) return
  const generation = contextGeneration
  pending.value = true
  mutationError.value = false
  try {
    const response = await fetch(getClientRequestUrl(`/api/funding-opportunities/${opportunityId}`), {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        egcs_fo_attachmenttypes: nextRows.map(row => ({ id: row.id, egcs_fo_isinternal: row.egcs_fo_isinternal }))
      })
    })
    if (!response.ok) await throwFetchResponseError(response)
    if (disposed || generation !== contextGeneration) return
    rows.value = nextRows
    draft.value = null
    selectedType.value = null
    emit('updated')
  } catch (error: unknown) {
    if (disposed || generation !== contextGeneration) return
    mutationError.value = true
    showError(error)
  } finally {
    if (!disposed && generation === contextGeneration) pending.value = false
  }
}

/** Adds the chosen Agency attachment type to this Opportunity. */
const add = async (): Promise<void> => {
  const selected = draft.value
  if (!selected?.id || linkedIds.value.includes(selected.id)) return
  await save([...rows.value, {
    id: selected.id,
    name_en: selectedType.value?.id === selected.id ? selectedType.value.egcs_cn_name_en : selected.id,
    name_fr: selectedType.value?.id === selected.id ? selectedType.value.egcs_cn_name_fr : selected.id,
    egcs_fo_isinternal: selected.egcs_fo_isinternal
  }])
}

/** Changes whether a linked type is available to the external portal.
 * @param id - Linked attachment type ID.
 * @param isInternal - Whether only internal Intakes may use it.
 */
const setInternal = async (id: string, isInternal: boolean): Promise<void> => {
  await save(rows.value.map(row => row.id === id ? { ...row, egcs_fo_isinternal: isInternal } : row))
}

/** Removes an attachment type from the Opportunity's intake requirements.
 * @param id - Linked attachment type ID.
 */
const remove = async (id: string): Promise<void> => {
  await save(rows.value.filter(row => row.id !== id))
}
</script>

<template>
  <section class="space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold">
          {{ t('funding_opportunity.attachment_types') }}
        </h2>
        <p class="mt-1 text-sm text-muted">
          {{ t('funding_opportunity.attachment_types_help') }}
        </p>
      </div>
      <UButton v-if="canEdit" icon="i-lucide-link" :label="t('common.add')" :disabled="pending" @click="openAdd" />
    </div>

    <UAlert
      v-if="mutationError"
      role="alert"
      color="error"
      icon="i-lucide-circle-alert"
      :title="t('funding_opportunity.attachment_save_failed')" />

    <CommonCompactTable :data="rows" :columns="columns" :loading="loading" :empty-text="t('common.no_data')">
      <template #name-cell="{ row }">
        <CommonBilingualName :name-en="row.original.name_en" :name-fr="row.original.name_fr" />
      </template>
      <template #visibility-cell="{ row }">
        <span class="text-sm text-muted">
          {{ t(row.original.egcs_fo_isinternal ? 'funding_opportunity.internal_only' : 'funding_opportunity.portal_visible') }}
        </span>
      </template>
      <template #actions-cell="{ row }">
        <div class="flex items-center justify-end gap-2">
          <USwitch
            v-if="canEdit"
            :model-value="row.original.egcs_fo_isinternal"
            :required="false"
            :disabled="pending"
            :aria-label="t('funding_opportunity.internal_only_named', { name: label(row.original) })"
            @update:model-value="value => setInternal(row.original.id, value)" />
          <UButton
            v-if="canEdit"
            icon="i-lucide-unlink"
            color="error"
            variant="ghost"
            :disabled="pending"
            :aria-label="`${t('common.remove')}: ${label(row.original)}`"
            @click="remove(row.original.id)" />
        </div>
      </template>
    </CommonCompactTable>

    <UModal :open="draft !== null" :title="t('funding_opportunity.add_attachment_type')" @update:open="value => { if (!value) closeAdd() }">
      <template #body>
        <UForm v-if="draft" :state="draft" :validate="createValidator(LinkSchema)" class="space-y-4" @submit="add">
          <UFormField :label="t('attachments.type')" name="id" required>
            <CommonServerLookupSelect
              v-model="draft.id"
              :fetch-url="lookupUrl"
              selected-values-query-key="ids"
              value-key="id"
              label-en-key="egcs_cn_name_en"
              label-fr-key="egcs_cn_name_fr"
              :exclude-values="linkedIds"
              :disabled="pending"
              aria-required="true"
              close-on-select
              searchable
              @resolved-items="onResolvedType" />
          </UFormField>
          <USwitch v-model="draft.egcs_fo_isinternal" :label="t('funding_opportunity.internal_only')" :description="t('funding_opportunity.internal_only_help')" :required="false" :disabled="pending" />
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="ghost" :label="t('common.cancel')" :disabled="pending" @click="closeAdd" />
            <CommonSaveButton :label="t('common.add')" :loading="pending" :disabled="pending" />
          </div>
        </UForm>
      </template>
    </UModal>
  </section>
</template>
