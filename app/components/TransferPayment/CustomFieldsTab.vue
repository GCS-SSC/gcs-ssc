<script setup lang="ts">
import { computed, ref, watch, type Ref } from 'vue'
import { getGroupedRowModel, type ExpandedState } from '@tanstack/vue-table'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { StreamFieldSectionCreateSchema, type AgreementCustomFieldSection, StreamFieldCreateSchema, StreamFieldOptionCreateSchema, type AgreementCustomFieldDefinition } from '~~/shared/types/schemas/agreement-custom-fields'

const { transferPaymentId, streamId, canUpdateChild, canDeleteChild } = defineProps<{
  transferPaymentId: string, streamId: string, canUpdateChild: boolean, canDeleteChild: boolean
}>()
const { t } = useI18n()
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const { createValidator } = useZodI18n()
const url = computed(() => `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/custom-fields`)
const { data, refresh, status } = await useAsyncData<{ items: AgreementCustomFieldDefinition[], sections: AgreementCustomFieldSection[] }>(url, async () => {
  const response = await fetch(getClientRequestUrl(url.value))
  if (!response.ok) await throwFetchResponseError(response)
  return await response.json() as { items: AgreementCustomFieldDefinition[], sections: AgreementCustomFieldSection[] }
})
type FieldForm = Partial<AgreementCustomFieldDefinition>
type Option = AgreementCustomFieldDefinition['options'][number]
const fieldModal = useCrudModal<FieldForm>({ createState: () => ({ kind: 'text', presentation: 'single_line', active: true, required: false, discriminator: false, display_order: 0 }), updateState: field => ({ ...field }) })
const optionModal = useCrudModal<Partial<Option>>({ createState: () => ({ active: true, display_order: 0, category_en: null, category_fr: null }), updateState: option => ({ ...option }) })
const optionFieldId: Ref<string | null> = ref(null)
const sectionModal = useCrudModal<Partial<AgreementCustomFieldSection>>({ createState: () => ({ display_order: 0 }), updateState: section => ({ ...section }) })
const openField = (sectionId: string) => {
  fieldModal.openCreate()
  if (fieldModal.selected.value) fieldModal.selected.value.section_id = sectionId
}
/**
 *
 */
const saveSection = async () => {
  if (!sectionModal.selected.value || saving.value) return
  const session = sectionModal.captureSession()
  saving.value = true
  try {
    const { id, ...body } = sectionModal.selected.value
    const response = await fetch(getClientRequestUrl(`${url.value}/sections${id ? `/${id}` : ''}`), { method: id ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (!response.ok) await throwFetchResponseError(response)
    sectionModal.closeSession(session)
    await refresh()
  } catch (error) {
    showError(error)
  } finally {
    saving.value = false
  }
}
const saving = ref(false)
const search = ref('')
const pagination = ref({ pageIndex: 0, pageSize: 10 })
const expandedRows: Ref<ExpandedState> = ref({})
const { getGroupedDisclosureControlsId, getGroupedDisclosureContentId } = useGroupedDisclosureIds()
type FieldRow = { id: string, sectionGroup: string, section: AgreementCustomFieldSection, fieldGroup: string, field: AgreementCustomFieldDefinition | null, option: Option | null }
const columns: TableColumnInput<FieldRow>[] = [
  { id: 'sectionGroup', accessorKey: 'sectionGroup', headerKey: 'custom_fields.section' },
  { id: 'fieldGroup', accessorKey: 'fieldGroup', headerKey: 'custom_fields.title' },
  { id: 'name', headerKey: 'common.name' },
  { id: 'type', headerKey: 'common.type' },
  { id: 'configuration', headerKey: 'custom_fields.configuration' },
  { id: 'order', headerKey: 'custom_fields.order' },
  { id: 'status', headerKey: 'common.status' },
  { id: 'actions', headerKey: 'common.actions' }
]
const grouping = ['sectionGroup', 'fieldGroup']
const groupingOptions = { getGroupedRowModel: getGroupedRowModel() }
const expandedOptions = { autoResetExpanded: false }
const columnVisibility = { sectionGroup: false, fieldGroup: false }
const filteredSections = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  return (data.value?.sections ?? []).map(section => {
    const allFields = (data.value?.items ?? []).filter(field => field.section_id === section.id)
    const sectionMatches = [section.name_en, section.name_fr].some(label => label.toLocaleLowerCase().includes(query))
    const fields = allFields.filter(field => sectionMatches || [field.name_en, field.name_fr,
      ...field.options.flatMap(option => [option.name_en, option.name_fr, option.category_en ?? '', option.category_fr ?? ''])]
      .some(label => label.toLocaleLowerCase().includes(query)))
    return { ...section, fields }
  }).filter(section => !query || section.fields.length || [section.name_en, section.name_fr].some(label => label.toLocaleLowerCase().includes(query)))
})
const tableRows = computed<FieldRow[]>(() => filteredSections.value
  .slice(pagination.value.pageIndex * pagination.value.pageSize, (pagination.value.pageIndex + 1) * pagination.value.pageSize)
  .flatMap((section): FieldRow[] => section.fields.length
    ? section.fields.flatMap((field): FieldRow[] => field.options.length
        ? field.options.map(option => ({ id: `option:${option.id}`, sectionGroup: section.id, section, fieldGroup: field.id, field, option }))
        : [{ id: `field:${field.id}`, sectionGroup: section.id, section, fieldGroup: field.id, field, option: null }])
    : [{ id: `section:${section.id}`, sectionGroup: section.id, section, fieldGroup: `empty:${section.id}`, field: null, option: null }]))
watch(search, () => {
  pagination.value.pageIndex = 0
})
watch(filteredSections, sections => {
  pagination.value.pageIndex = Math.min(pagination.value.pageIndex, Math.max(0, Math.ceil(sections.length / pagination.value.pageSize) - 1))
})
/**
 *
 */
const saveField = async () => {
  if (!fieldModal.selected.value || saving.value) return
  const session = fieldModal.captureSession()
  saving.value = true
  try {
    const { id, options: _options, ...body } = fieldModal.selected.value
    const response = await fetch(getClientRequestUrl(`${url.value}${id ? `/${id}` : ''}`), { method: id ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (!response.ok) await throwFetchResponseError(response)
    fieldModal.closeSession(session)
    await refresh()
  } catch (error) {
    showError(error)
  } finally {
    saving.value = false
  }
}
/**
 *
 * @param fieldId - Owning field identity.
 * @param option - Existing option, when editing.
 */
const openOption = (fieldId: string, option?: Option) => {
  optionFieldId.value = fieldId
  if (option) optionModal.openUpdate(option)
  else optionModal.openCreate()
}
/**
 *
 */
const saveOption = async () => {
  if (!optionModal.selected.value || !optionFieldId.value || saving.value) return
  const session = optionModal.captureSession()
  saving.value = true
  try {
    const { id, ...body } = optionModal.selected.value
    const response = await fetch(getClientRequestUrl(`${url.value}/${optionFieldId.value}/options${id ? `/${id}` : ''}`), { method: id ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (!response.ok) await throwFetchResponseError(response)
    optionModal.closeSession(session)
    await refresh()
  } catch (error) {
    showError(error)
  } finally {
    saving.value = false
  }
}
const remove = async (path: string) => {
  if (await confirmDeleteRequest(`${url.value}/${path}`)) await refresh()
}
watch(url, () => {
  search.value = ''
  pagination.value.pageIndex = 0
  expandedRows.value = {}
  sectionModal.close()
  fieldModal.close()
  optionModal.close()
  optionFieldId.value = null
})
</script>

<template>
  <div>
    <CommonResourceLayoutCard
      v-model:search="search"
      v-model:pagination="pagination"
      :data="tableRows"
      :columns="columns"
      :grouping="grouping"
      :grouping-options="groupingOptions"
      :expanded-options="expandedOptions"
      :column-visibility="columnVisibility"
      :expanded="expandedRows"
      :total-records="filteredSections.length"
      :loading="status === 'pending'"
      :request-status="status"
      :button-label="t('custom_fields.add_section')"
      :show-button="canUpdateChild"
      @add="sectionModal.openCreate()"
      @retry="refresh()"
      @update:expanded="expandedRows = $event">
      <template #name-cell="{ row }">
        <div :id="getGroupedDisclosureContentId(row)" class="contents">
          <div v-if="row.groupingColumnId === 'sectionGroup'" class="flex items-center gap-3 py-1">
            <CommonGroupedDisclosureButton class="group flex min-w-0 items-center gap-3 text-left font-bold" :expanded="row.getIsExpanded()" :controls="getGroupedDisclosureControlsId(row.id)" :label-en="row.original.section.name_en" :label-fr="row.original.section.name_fr" @toggle="row.toggleExpanded()">
              <UIcon :name="row.getIsExpanded() ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-4 text-zinc-400" />
              <CommonBilingualName :name-en="row.original.section.name_en" :name-fr="row.original.section.name_fr" />
            </CommonGroupedDisclosureButton>
          </div>
          <div v-else-if="row.getIsGrouped() && row.original.field" class="flex items-center gap-3 py-1 pl-6">
            <CommonGroupedDisclosureButton
              v-if="row.original.field.kind === 'relational'"
              class="group flex min-w-0 items-center gap-3 text-left font-bold text-zinc-900 transition-colors hover:text-primary dark:text-white"
              :expanded="row.getIsExpanded()"
              :controls="getGroupedDisclosureControlsId(row.id)"
              :label-en="row.original.field.name_en"
              :label-fr="row.original.field.name_fr"
              @toggle="row.toggleExpanded()">
              <UIcon :name="row.getIsExpanded() ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-4 text-zinc-400" />
              <CommonBilingualName :name-en="row.original.field.name_en" :name-fr="row.original.field.name_fr" />
              <CommonStatusBadge variant="count" size="sm" :label="String(row.original.field.options.length)" />
            </CommonGroupedDisclosureButton>
            <CommonBilingualName v-else class="pl-7" :name-en="row.original.field.name_en" :name-fr="row.original.field.name_fr" />
          </div>
          <div v-else-if="row.original.option" class="flex items-center gap-3 py-1 pl-12">
            <UIcon name="i-lucide-corner-down-right" class="size-4 text-zinc-400" />
            <CommonBilingualName :name-en="row.original.option.name_en" :name-fr="row.original.option.name_fr" />
          </div>
          <span v-else class="pl-6 text-sm text-muted">{{ t('common.no_data') }}</span>
        </div>
      </template>
      <template #type-cell="{ row }">
        <span v-if="row.groupingColumnId === 'sectionGroup'">{{ t('custom_fields.section') }}</span>
        <span v-else-if="row.getIsGrouped() && row.original.field">{{ t(`custom_fields.${row.original.field.kind === 'relational' ? 'relational' : row.original.field.presentation}`) }}</span>
      </template>
      <template #configuration-cell="{ row }">
        <div v-if="row.groupingColumnId === 'fieldGroup' && row.original.field" class="flex flex-wrap gap-2">
          <UBadge v-if="row.original.field.required" color="neutral" variant="subtle" :label="t('custom_fields.required')" />
          <UBadge v-if="row.original.field.discriminator" color="neutral" variant="subtle" :label="t('custom_fields.discriminator')" />
        </div>
        <CommonBilingualName v-else-if="!row.getIsGrouped() && row.original.option?.category_en" :name-en="row.original.option.category_en" :name-fr="row.original.option.category_fr ?? ''" />
      </template>
      <template #order-cell="{ row }">
        {{ row.groupingColumnId === 'sectionGroup' ? row.original.section.display_order : row.getIsGrouped() ? row.original.field?.display_order : row.original.option?.display_order }}
      </template>
      <template #status-cell="{ row }">
        <UBadge v-if="row.groupingColumnId !== 'sectionGroup' && (row.original.field || row.original.option)" color="neutral" variant="subtle" :label="t((row.getIsGrouped() ? row.original.field?.active : row.original.option?.active) ? 'custom_fields.active' : 'custom_fields.inactive')" />
      </template>
      <template #actions-cell="{ row }">
        <div v-if="row.groupingColumnId === 'sectionGroup'" class="flex items-center gap-2">
          <UButton v-if="canUpdateChild" icon="i-lucide-plus" color="neutral" variant="ghost" size="sm" :aria-label="t('custom_fields.add_field')" @click="openField(row.original.section.id)" />
          <UButton v-if="canUpdateChild" icon="i-lucide-pencil" color="neutral" variant="ghost" size="sm" :aria-label="t('common.edit')" @click="sectionModal.openUpdate(row.original.section)" />
          <UButton v-if="canDeleteChild" icon="i-lucide-trash" color="error" variant="ghost" size="sm" :aria-label="t('common.delete')" @click="remove(`sections/${row.original.section.id}`)" />
        </div>
        <div v-else-if="row.getIsGrouped() && row.original.field" class="flex items-center gap-2">
          <UButton v-if="canUpdateChild && row.original.field.kind === 'relational'" icon="i-lucide-plus" color="neutral" variant="ghost" size="sm" :aria-label="t('custom_fields.add_option')" @click="openOption(row.original.field.id)" />
          <UButton v-if="canUpdateChild" icon="i-lucide-pencil" color="neutral" variant="ghost" size="sm" :aria-label="t('common.edit')" @click="fieldModal.openUpdate(row.original.field)" />
          <UButton v-if="canDeleteChild" icon="i-lucide-trash" color="error" variant="ghost" size="sm" :aria-label="t('common.delete')" @click="remove(row.original.field.id)" />
        </div>
        <div v-else-if="row.original.option && row.original.field" class="flex items-center gap-2">
          <UButton v-if="canUpdateChild" icon="i-lucide-pencil" color="neutral" variant="ghost" size="sm" :aria-label="t('common.edit')" @click="openOption(row.original.field.id, row.original.option)" />
          <UButton v-if="canDeleteChild" icon="i-lucide-trash" color="error" variant="ghost" size="sm" :aria-label="t('common.delete')" @click="remove(`${row.original.field.id}/options/${row.original.option.id}`)" />
        </div>
      </template>
    </CommonResourceLayoutCard>
    <UModal v-model:open="sectionModal.isOpen.value" :title="t('custom_fields.section')">
      <template #body>
        <UForm v-if="sectionModal.selected.value" :state="sectionModal.selected.value" :validate="createValidator(StreamFieldSectionCreateSchema)" class="space-y-4" @submit="saveSection">
          <UFormField :label="t('custom_fields.name_en')" name="name_en">
            <UInput v-model="sectionModal.selected.value.name_en" class="w-full" />
          </UFormField>
          <UFormField :label="t('custom_fields.name_fr')" name="name_fr">
            <UInput v-model="sectionModal.selected.value.name_fr" class="w-full" />
          </UFormField>
          <UFormField :label="t('custom_fields.order')" name="display_order">
            <UInput v-model.number="sectionModal.selected.value.display_order" type="number" min="0" />
          </UFormField>
          <CommonSaveButton :label="t('common.save')" :loading="saving" />
        </UForm>
      </template>
    </UModal>
    <UModal v-model:open="fieldModal.isOpen.value" :title="t('custom_fields.title')">
      <template #body>
        <UForm v-if="fieldModal.selected.value" :state="fieldModal.selected.value" :validate="createValidator(StreamFieldCreateSchema)" class="space-y-4" @submit="saveField">
          <UFormField :label="t('custom_fields.name_en')" name="name_en">
            <UInput v-model="fieldModal.selected.value.name_en" class="w-full" />
          </UFormField>
          <UFormField :label="t('custom_fields.name_fr')" name="name_fr">
            <UInput v-model="fieldModal.selected.value.name_fr" class="w-full" />
          </UFormField>
          <UFormField :label="t('custom_fields.section')" name="section_id">
            <CommonBilingualSelectMenu v-model="fieldModal.selected.value.section_id" :items="data?.sections ?? []" value-key="id" />
          </UFormField>
          <UFormField :label="t('common.type')" name="kind">
            <USelect v-model="fieldModal.selected.value.kind" :disabled="Boolean(fieldModal.selected.value.id)" :items="[{ value: 'text', label: t('custom_fields.text') }, { value: 'relational', label: t('custom_fields.relational') }]" />
          </UFormField>
          <UFormField v-if="fieldModal.selected.value.kind === 'text'" :label="t('custom_fields.presentation')" name="presentation">
            <USelect v-model="fieldModal.selected.value.presentation" :items="[{ value: 'single_line', label: t('custom_fields.single_line') }, { value: 'multiline', label: t('custom_fields.multiline') }]" />
          </UFormField>
          <UCheckbox v-model="fieldModal.selected.value.active" :label="t('custom_fields.active')" />
          <UCheckbox v-model="fieldModal.selected.value.required" :label="t('custom_fields.required')" />
          <UCheckbox v-if="fieldModal.selected.value.kind === 'relational'" v-model="fieldModal.selected.value.discriminator" :label="t('custom_fields.discriminator')" />
          <UFormField :label="t('custom_fields.order')" name="display_order">
            <UInput v-model.number="fieldModal.selected.value.display_order" type="number" min="0" />
          </UFormField>
          <CommonSaveButton :label="t('common.save')" :loading="saving" />
        </UForm>
      </template>
    </UModal>
    <UModal v-model:open="optionModal.isOpen.value" :title="t('custom_fields.add_option')">
      <template #body>
        <UForm v-if="optionModal.selected.value" :state="optionModal.selected.value" :validate="createValidator(StreamFieldOptionCreateSchema)" class="space-y-4" @submit="saveOption">
          <UFormField :label="t('custom_fields.name_en')" name="name_en">
            <UInput v-model="optionModal.selected.value.name_en" />
          </UFormField>
          <UFormField :label="t('custom_fields.name_fr')" name="name_fr">
            <UInput v-model="optionModal.selected.value.name_fr" />
          </UFormField>
          <UFormField :label="t('custom_fields.category_en')" name="category_en">
            <UInput v-model="optionModal.selected.value.category_en" />
          </UFormField>
          <UFormField :label="t('custom_fields.category_fr')" name="category_fr">
            <UInput v-model="optionModal.selected.value.category_fr" />
          </UFormField>
          <UCheckbox v-model="optionModal.selected.value.active" :label="t('custom_fields.active')" />
          <UFormField :label="t('custom_fields.order')" name="display_order">
            <UInput v-model.number="optionModal.selected.value.display_order" type="number" min="0" />
          </UFormField>
          <CommonSaveButton :label="t('common.save')" :loading="saving" />
        </UForm>
      </template>
    </UModal>
  </div>
</template>
