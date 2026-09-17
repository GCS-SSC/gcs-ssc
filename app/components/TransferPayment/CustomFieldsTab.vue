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
const fieldModal = useCrudModal<FieldForm>({ createState: () => ({ egcs_tp_kind: 'text', egcs_tp_multiple: false, egcs_tp_presentation: 'single_line', egcs_tp_active: true, egcs_tp_required: false, egcs_tp_discriminator: false, egcs_tp_displayorder: 0 }), updateState: field => ({ ...field }) })
watch(() => fieldModal.selected.value?.egcs_tp_kind, egcs_tp_kind => {
  const selected = fieldModal.selected.value
  if (!selected) return
  if (egcs_tp_kind !== 'text') selected.egcs_tp_presentation = 'single_line'
  if (egcs_tp_kind !== 'relational') {
    selected.egcs_tp_discriminator = false
    selected.egcs_tp_multiple = false
  }
})
const multipleSelectionLocked = computed(() => Boolean(data.value?.items.find(field => field.id === fieldModal.selected.value?.id)?.egcs_tp_multiple))
const optionModal = useCrudModal<Partial<Option>>({ createState: () => ({ egcs_tp_active: true, egcs_tp_displayorder: 0, egcs_tp_category_en: null, egcs_tp_category_fr: null }), updateState: option => ({ ...option }) })
const optionFieldId: Ref<string | null> = ref(null)
const optionCategoryLocked = ref(false)
const sectionModal = useCrudModal<Partial<AgreementCustomFieldSection>>({ createState: () => ({ egcs_tp_displayorder: 0 }), updateState: section => ({ ...section }) })
const openField = (sectionId: string) => {
  fieldModal.openCreate()
  if (fieldModal.selected.value) fieldModal.selected.value.egcs_tp_section = sectionId
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
type FieldRow = { id: string, sectionGroup: string, section: AgreementCustomFieldSection, fieldGroup: string, categoryGroup: string, field: AgreementCustomFieldDefinition | null, option: Option | null }
const columns: TableColumnInput<FieldRow>[] = [
  { id: 'sectionGroup', accessorKey: 'sectionGroup', headerKey: 'custom_fields.section' },
  { id: 'fieldGroup', accessorKey: 'fieldGroup', headerKey: 'custom_fields.title' },
  { id: 'categoryGroup', accessorKey: 'categoryGroup', headerKey: 'custom_fields.category' },
  { id: 'name', headerKey: 'common.name' },
  { id: 'type', headerKey: 'common.type' },
  { id: 'configuration', headerKey: 'custom_fields.configuration' },
  { id: 'order', headerKey: 'custom_fields.order' },
  { id: 'status', headerKey: 'common.status' },
  { id: 'actions', headerKey: 'common.actions' }
]
const grouping = ['sectionGroup', 'fieldGroup', 'categoryGroup']
const groupingOptions = { getGroupedRowModel: getGroupedRowModel() }
const expandedOptions = { autoResetExpanded: false }
const columnVisibility = { sectionGroup: false, fieldGroup: false, categoryGroup: false }
const filteredSections = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  return (data.value?.sections ?? []).map(section => {
    const allFields = (data.value?.items ?? []).filter(field => field.egcs_tp_section === section.id)
    const sectionMatches = [section.egcs_tp_name_en, section.egcs_tp_name_fr].some(label => label.toLocaleLowerCase().includes(query))
    const fields = allFields.filter(field => sectionMatches || [field.egcs_tp_name_en, field.egcs_tp_name_fr,
      ...field.options.flatMap(option => [option.egcs_tp_name_en, option.egcs_tp_name_fr, option.egcs_tp_category_en ?? '', option.egcs_tp_category_fr ?? ''])]
      .some(label => label.toLocaleLowerCase().includes(query)))
    return { ...section, fields }
  }).filter(section => !query || section.fields.length || [section.egcs_tp_name_en, section.egcs_tp_name_fr].some(label => label.toLocaleLowerCase().includes(query)))
})
const tableRows = computed<FieldRow[]>(() => filteredSections.value
  .slice(pagination.value.pageIndex * pagination.value.pageSize, (pagination.value.pageIndex + 1) * pagination.value.pageSize)
  .flatMap((section): FieldRow[] => section.fields.length
    ? section.fields.flatMap((field): FieldRow[] => field.options.length
        ? field.options.map(option => ({ id: `option:${option.id}`, sectionGroup: section.id, section, fieldGroup: field.id, categoryGroup: JSON.stringify([option.egcs_tp_category_en, option.egcs_tp_category_fr]), field, option }))
        : [{ id: `field:${field.id}`, sectionGroup: section.id, section, fieldGroup: field.id, categoryGroup: 'empty', field, option: null }])
    : [{ id: `section:${section.id}`, sectionGroup: section.id, section, fieldGroup: `empty:${section.id}`, categoryGroup: 'empty', field: null, option: null }]))
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
  optionCategoryLocked.value = false
  if (option) optionModal.openUpdate(option)
  else optionModal.openCreate()
}
/**
 * Opens a new entry within the selected category.
 * @param fieldId - Owning selection field.
 * @param category - Bilingual category labels from an existing entry.
 */
const openCategoryOption = (fieldId: string, category: Option) => {
  openOption(fieldId)
  if (optionModal.selected.value) {
    optionModal.selected.value.egcs_tp_category_en = category.egcs_tp_category_en
    optionModal.selected.value.egcs_tp_category_fr = category.egcs_tp_category_fr
    optionCategoryLocked.value = true
  }
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
  optionCategoryLocked.value = false
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
            <CommonGroupedDisclosureButton class="group flex min-w-0 items-center gap-3 text-left font-bold" :expanded="row.getIsExpanded()" :controls="getGroupedDisclosureControlsId(row.id)" :label-en="row.original.section.egcs_tp_name_en" :label-fr="row.original.section.egcs_tp_name_fr" @toggle="row.toggleExpanded()">
              <UIcon :name="row.getIsExpanded() ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-4 text-zinc-400" />
              <CommonBilingualName :name-en="row.original.section.egcs_tp_name_en" :name-fr="row.original.section.egcs_tp_name_fr" />
            </CommonGroupedDisclosureButton>
          </div>
          <div v-else-if="row.groupingColumnId === 'fieldGroup' && row.original.field" class="flex items-center gap-3 py-1 pl-6">
            <CommonGroupedDisclosureButton
              v-if="row.original.field.egcs_tp_kind === 'relational' && row.original.field.options.length"
              class="group flex min-w-0 items-center gap-3 text-left font-bold text-zinc-900 transition-colors hover:text-primary dark:text-white"
              :expanded="row.getIsExpanded()"
              :controls="getGroupedDisclosureControlsId(row.id)"
              :label-en="row.original.field.egcs_tp_name_en"
              :label-fr="row.original.field.egcs_tp_name_fr"
              @toggle="row.toggleExpanded()">
              <UIcon :name="row.getIsExpanded() ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-4 text-zinc-400" />
              <CommonBilingualName :name-en="row.original.field.egcs_tp_name_en" :name-fr="row.original.field.egcs_tp_name_fr" />
              <CommonStatusBadge variant="count" size="sm" :label="String(row.original.field.options.length)" />
            </CommonGroupedDisclosureButton>
            <CommonBilingualName v-else class="pl-7" :name-en="row.original.field.egcs_tp_name_en" :name-fr="row.original.field.egcs_tp_name_fr" />
          </div>
          <div v-else-if="row.groupingColumnId === 'categoryGroup' && row.original.option" class="flex items-center gap-3 py-1 pl-12">
            <CommonGroupedDisclosureButton
              class="group flex min-w-0 items-center gap-3 text-left font-semibold"
              :expanded="row.getIsExpanded()"
              :controls="getGroupedDisclosureControlsId(row.id)"
              :label="row.original.option.egcs_tp_category_en ? undefined : t('custom_fields.uncategorized')"
              :label-en="row.original.option.egcs_tp_category_en ?? undefined"
              :label-fr="row.original.option.egcs_tp_category_fr ?? undefined"
              @toggle="row.toggleExpanded()">
              <UIcon :name="row.getIsExpanded() ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-4 text-zinc-400" />
              <CommonBilingualName v-if="row.original.option.egcs_tp_category_en" :name-en="row.original.option.egcs_tp_category_en" :name-fr="row.original.option.egcs_tp_category_fr ?? ''" />
              <span v-else>{{ t('custom_fields.uncategorized') }}</span>
              <CommonStatusBadge variant="count" size="sm" :label="String(row.subRows.length)" />
            </CommonGroupedDisclosureButton>
          </div>
          <div v-else-if="!row.getIsGrouped() && row.original.option" class="flex items-center gap-3 py-1 pl-18">
            <UIcon name="i-lucide-corner-down-right" class="size-4 text-zinc-400" />
            <CommonBilingualName :name-en="row.original.option.egcs_tp_name_en" :name-fr="row.original.option.egcs_tp_name_fr" />
          </div>
          <span v-else class="pl-6 text-sm text-muted">{{ t('common.no_data') }}</span>
        </div>
      </template>
      <template #type-cell="{ row }">
        <span v-if="row.groupingColumnId === 'sectionGroup'">{{ t('custom_fields.section') }}</span>
        <span v-else-if="row.groupingColumnId === 'categoryGroup'">{{ t('custom_fields.category') }}</span>
        <span v-else-if="row.groupingColumnId === 'fieldGroup' && row.original.field">{{ t(`custom_fields.${row.original.field.egcs_tp_kind === 'text' ? row.original.field.egcs_tp_presentation : row.original.field.egcs_tp_kind === 'relational' ? (row.original.field.egcs_tp_multiple ? 'multiple_selection' : 'single_selection') : 'number'}`) }}</span>
      </template>
      <template #configuration-cell="{ row }">
        <div v-if="row.groupingColumnId === 'fieldGroup' && row.original.field" class="flex flex-wrap gap-2">
          <UBadge v-if="row.original.field.egcs_tp_required" color="neutral" variant="subtle" :label="t('custom_fields.required')" />
          <UBadge v-if="row.original.field.egcs_tp_discriminator" color="neutral" variant="subtle" :label="t('custom_fields.discriminator')" />
        </div>
        <CommonBilingualName v-else-if="!row.getIsGrouped() && row.original.option?.egcs_tp_category_en" :name-en="row.original.option.egcs_tp_category_en" :name-fr="row.original.option.egcs_tp_category_fr ?? ''" />
      </template>
      <template #order-cell="{ row }">
        <span v-if="row.groupingColumnId !== 'categoryGroup'">{{ row.groupingColumnId === 'sectionGroup' ? row.original.section.egcs_tp_displayorder : row.getIsGrouped() ? row.original.field?.egcs_tp_displayorder : row.original.option?.egcs_tp_displayorder }}</span>
      </template>
      <template #status-cell="{ row }">
        <UBadge v-if="(row.groupingColumnId === 'fieldGroup' || !row.getIsGrouped()) && (row.original.field || row.original.option)" color="neutral" variant="subtle" :label="t((row.getIsGrouped() ? row.original.field?.egcs_tp_active : row.original.option?.egcs_tp_active) ? 'custom_fields.active' : 'custom_fields.inactive')" />
      </template>
      <template #actions-cell="{ row }">
        <div v-if="row.groupingColumnId === 'sectionGroup'" class="flex items-center gap-2">
          <UButton v-if="canUpdateChild" icon="i-lucide-plus" color="neutral" variant="ghost" size="sm" :aria-label="t('custom_fields.add_field')" @click="openField(row.original.section.id)" />
          <UButton v-if="canUpdateChild" icon="i-lucide-pencil" color="neutral" variant="ghost" size="sm" :aria-label="t('common.edit')" @click="sectionModal.openUpdate(row.original.section)" />
          <UButton v-if="canDeleteChild" icon="i-lucide-trash" color="error" variant="ghost" size="sm" :aria-label="t('common.delete')" @click="remove(`sections/${row.original.section.id}`)" />
        </div>
        <div v-else-if="row.groupingColumnId === 'fieldGroup' && row.original.field" class="flex items-center gap-2">
          <UButton v-if="canUpdateChild && row.original.field.egcs_tp_kind === 'relational'" icon="i-lucide-plus" color="neutral" variant="ghost" size="sm" :aria-label="t('custom_fields.add_option')" @click="openOption(row.original.field.id)" />
          <UButton v-if="canUpdateChild" icon="i-lucide-pencil" color="neutral" variant="ghost" size="sm" :aria-label="t('common.edit')" @click="fieldModal.openUpdate(row.original.field)" />
          <UButton v-if="canDeleteChild" icon="i-lucide-trash" color="error" variant="ghost" size="sm" :aria-label="t('common.delete')" @click="remove(row.original.field.id)" />
        </div>
        <div v-else-if="row.groupingColumnId === 'categoryGroup' && row.original.option && row.original.field" class="flex items-center gap-2">
          <UButton v-if="canUpdateChild" icon="i-lucide-plus" color="neutral" variant="ghost" size="sm" :aria-label="t('custom_fields.add_option')" @click="openCategoryOption(row.original.field.id, row.original.option)" />
        </div>
        <div v-else-if="!row.getIsGrouped() && row.original.option && row.original.field" class="flex items-center gap-2">
          <UButton v-if="canUpdateChild" icon="i-lucide-pencil" color="neutral" variant="ghost" size="sm" :aria-label="t('common.edit')" @click="openOption(row.original.field.id, row.original.option)" />
          <UButton v-if="canDeleteChild" icon="i-lucide-trash" color="error" variant="ghost" size="sm" :aria-label="t('common.delete')" @click="remove(`${row.original.field.id}/options/${row.original.option.id}`)" />
        </div>
      </template>
    </CommonResourceLayoutCard>
    <UModal v-model:open="sectionModal.isOpen.value" :title="t('custom_fields.section')">
      <template #body>
        <UForm v-if="sectionModal.selected.value" :state="sectionModal.selected.value" :validate="createValidator(StreamFieldSectionCreateSchema)" class="space-y-4" @submit="saveSection">
          <UFormField :label="t('custom_fields.name_en')" name="egcs_tp_name_en">
            <UInput v-model="sectionModal.selected.value.egcs_tp_name_en" class="w-full" />
          </UFormField>
          <UFormField :label="t('custom_fields.name_fr')" name="egcs_tp_name_fr">
            <UInput v-model="sectionModal.selected.value.egcs_tp_name_fr" class="w-full" />
          </UFormField>
          <UFormField :label="t('custom_fields.order')" name="egcs_tp_displayorder">
            <UInput v-model.number="sectionModal.selected.value.egcs_tp_displayorder" type="number" min="0" />
          </UFormField>
          <CommonSaveButton :label="t('common.save')" :loading="saving" />
        </UForm>
      </template>
    </UModal>
    <UModal v-model:open="fieldModal.isOpen.value" :title="t('custom_fields.title')">
      <template #body>
        <UForm v-if="fieldModal.selected.value" :state="fieldModal.selected.value" :validate="createValidator(StreamFieldCreateSchema)" class="space-y-4" @submit="saveField">
          <UFormField :label="t('custom_fields.name_en')" name="egcs_tp_name_en">
            <UInput v-model="fieldModal.selected.value.egcs_tp_name_en" class="w-full" />
          </UFormField>
          <UFormField :label="t('custom_fields.name_fr')" name="egcs_tp_name_fr">
            <UInput v-model="fieldModal.selected.value.egcs_tp_name_fr" class="w-full" />
          </UFormField>
          <UFormField :label="t('custom_fields.section')" name="egcs_tp_section">
            <CommonBilingualSelectMenu v-model="fieldModal.selected.value.egcs_tp_section" label-en-key="egcs_tp_name_en" label-fr-key="egcs_tp_name_fr" :items="data?.sections ?? []" value-key="id" />
          </UFormField>
          <UFormField :label="t('common.type')" name="egcs_tp_kind">
            <USelect v-model="fieldModal.selected.value.egcs_tp_kind" :disabled="Boolean(fieldModal.selected.value.id)" :items="[{ value: 'text', label: t('custom_fields.text') }, { value: 'number', label: t('custom_fields.number') }, { value: 'relational', label: t('custom_fields.relational') }]" />
          </UFormField>
          <UFormField v-if="fieldModal.selected.value.egcs_tp_kind === 'text'" :label="t('custom_fields.presentation')" name="egcs_tp_presentation">
            <USelect v-model="fieldModal.selected.value.egcs_tp_presentation" :items="[{ value: 'single_line', label: t('custom_fields.single_line') }, { value: 'multiline', label: t('custom_fields.multiline') }]" />
          </UFormField>
          <UCheckbox v-if="fieldModal.selected.value.egcs_tp_kind === 'relational'" v-model="fieldModal.selected.value.egcs_tp_multiple" :disabled="multipleSelectionLocked" :label="t('custom_fields.allow_multiple')" :description="t('custom_fields.multiple_help')" />
          <UCheckbox v-model="fieldModal.selected.value.egcs_tp_active" :label="t('custom_fields.active')" />
          <UCheckbox v-model="fieldModal.selected.value.egcs_tp_required" :label="t('custom_fields.required')" />
          <UCheckbox v-if="fieldModal.selected.value.egcs_tp_kind === 'relational'" v-model="fieldModal.selected.value.egcs_tp_discriminator" :label="t('custom_fields.discriminator')" />
          <UFormField :label="t('custom_fields.order')" name="egcs_tp_displayorder">
            <UInput v-model.number="fieldModal.selected.value.egcs_tp_displayorder" type="number" min="0" />
          </UFormField>
          <CommonSaveButton :label="t('common.save')" :loading="saving" />
        </UForm>
      </template>
    </UModal>
    <UModal v-model:open="optionModal.isOpen.value" :title="t('custom_fields.add_option')">
      <template #body>
        <UForm v-if="optionModal.selected.value" :state="optionModal.selected.value" :validate="createValidator(StreamFieldOptionCreateSchema)" class="space-y-4" @submit="saveOption">
          <UFormField :label="t('custom_fields.name_en')" name="egcs_tp_name_en">
            <UInput v-model="optionModal.selected.value.egcs_tp_name_en" />
          </UFormField>
          <UFormField :label="t('custom_fields.name_fr')" name="egcs_tp_name_fr">
            <UInput v-model="optionModal.selected.value.egcs_tp_name_fr" />
          </UFormField>
          <UFormField :label="t('custom_fields.category_en')" name="egcs_tp_category_en">
            <UInput v-model="optionModal.selected.value.egcs_tp_category_en" :readonly="optionCategoryLocked" />
          </UFormField>
          <UFormField :label="t('custom_fields.category_fr')" name="egcs_tp_category_fr">
            <UInput v-model="optionModal.selected.value.egcs_tp_category_fr" :readonly="optionCategoryLocked" />
          </UFormField>
          <UCheckbox v-model="optionModal.selected.value.egcs_tp_active" :label="t('custom_fields.active')" />
          <UFormField :label="t('custom_fields.order')" name="egcs_tp_displayorder">
            <UInput v-model.number="optionModal.selected.value.egcs_tp_displayorder" type="number" min="0" />
          </UFormField>
          <CommonSaveButton :label="t('common.save')" :loading="saving" />
        </UForm>
      </template>
    </UModal>
  </div>
</template>
