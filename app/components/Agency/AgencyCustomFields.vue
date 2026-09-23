<script setup lang="ts">
import { computed, ref, watch, type Ref } from 'vue'
import { getGroupedRowModel, type ExpandedState } from '@tanstack/vue-table'
import type { z } from 'zod'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { AgencyCustomFieldCreateSchema, AgencyCustomFieldOptionCreateSchema } from '~~/shared/types/schemas/agreement-custom-fields'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'

type AgencyOption = z.infer<typeof AgencyCustomFieldOptionCreateSchema> & { id: string, egcs_ay_field: string }
type AgencyField = z.infer<typeof AgencyCustomFieldCreateSchema> & { id: string, options: AgencyOption[] }
type FieldRow = { id: string, fieldGroup: string, categoryGroup: string, field: AgencyField, option: AgencyOption | null }

const { agencyId, canCreate, canUpdate, canDelete } = defineProps<{ agencyId: string, canCreate: boolean, canUpdate: boolean, canDelete: boolean }>()
const { t, locale } = useI18n()
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const { createValidator } = useZodI18n()
const url = computed(() => `/api/agency/${agencyId}/custom-fields`)
const { data, status, refresh } = await useAsyncData<{ items: AgencyField[] }>(url, async () => {
  const response = await fetch(getClientRequestUrl(url.value))
  if (!response.ok) await throwFetchResponseError(response)
  return await response.json() as { items: AgencyField[] }
})

const fieldModal = useCrudModal<Partial<AgencyField>>({
  createState: () => ({ egcs_ay_kind: 'text', egcs_ay_multiple: false, egcs_ay_presentation: 'single_line', egcs_ay_discriminator: false }),
  updateState: field => ({ ...field })
})
const optionModal = useCrudModal<Partial<AgencyOption>>({
  createState: () => ({ egcs_ay_category_en: null, egcs_ay_category_fr: null, egcs_ay_active: true, egcs_ay_displayorder: 0 }),
  updateState: option => ({ ...option })
})
const optionFieldId: Ref<string | null> = ref(null)
const saving = ref(false)
const search: Ref<string> = ref('')
const pagination = ref({ pageIndex: 0, pageSize: 10 })
const expandedRows: Ref<ExpandedState> = ref({})
const { getGroupedDisclosureControlsId, getGroupedDisclosureContentId } = useGroupedDisclosureIds()
const columns: TableColumnInput<FieldRow>[] = [
  { id: 'fieldGroup', accessorKey: 'fieldGroup', headerKey: 'custom_fields.title' },
  { id: 'categoryGroup', accessorKey: 'categoryGroup', headerKey: 'custom_fields.category' },
  { id: 'name', headerKey: 'common.name' },
  { id: 'type', headerKey: 'common.type' },
  { id: 'configuration', headerKey: 'custom_fields.configuration' },
  { id: 'order', headerKey: 'custom_fields.order' },
  { id: 'status', headerKey: 'common.status' },
  { id: 'actions', headerKey: 'common.actions' }
]
const grouping = ['fieldGroup', 'categoryGroup']
const groupingOptions = { getGroupedRowModel: getGroupedRowModel() }
const expandedOptions = { autoResetExpanded: false }
const columnVisibility = { fieldGroup: false, categoryGroup: false }
const multipleSelectionLocked = computed(() => Boolean(data.value?.items.find(field => field.id === fieldModal.selected.value?.id)?.egcs_ay_multiple))
const label = (item: { egcs_ay_name_en: string, egcs_ay_name_fr: string }) => locale.value === 'fr' ? item.egcs_ay_name_fr : item.egcs_ay_name_en
const typeLabel = (field: AgencyField) => t(`custom_fields.${field.egcs_ay_kind === 'text' ? field.egcs_ay_presentation : field.egcs_ay_kind === 'relational' ? (field.egcs_ay_multiple ? 'multiple_selection' : 'single_selection') : 'number'}`)
const filteredFields = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  if (!query) return data.value?.items ?? []
  return (data.value?.items ?? []).filter(field => [field.egcs_ay_name_en, field.egcs_ay_name_fr,
    ...field.options.flatMap(option => [option.egcs_ay_name_en, option.egcs_ay_name_fr, option.egcs_ay_category_en ?? '', option.egcs_ay_category_fr ?? ''])]
    .some(value => value.toLocaleLowerCase().includes(query)))
})
const tableRows = computed<FieldRow[]>(() => filteredFields.value
  .slice(pagination.value.pageIndex * pagination.value.pageSize, (pagination.value.pageIndex + 1) * pagination.value.pageSize)
  .flatMap((field): FieldRow[] => field.options.length
    ? field.options.map(option => ({ id: `option:${option.id}`, fieldGroup: field.id, categoryGroup: JSON.stringify([option.egcs_ay_category_en, option.egcs_ay_category_fr]), field, option }))
    : [{ id: `field:${field.id}`, fieldGroup: field.id, categoryGroup: 'empty', field, option: null }]))

watch(search, () => {
  pagination.value.pageIndex = 0
})
watch(filteredFields, fields => {
  pagination.value.pageIndex = Math.min(pagination.value.pageIndex, Math.max(0, Math.ceil(fields.length / pagination.value.pageSize) - 1))
})

watch(() => fieldModal.selected.value?.egcs_ay_kind, kind => {
  const selected = fieldModal.selected.value
  if (!selected) return
  if (kind !== 'text') selected.egcs_ay_presentation = 'single_line'
  if (kind !== 'relational') {
    selected.egcs_ay_multiple = false
    selected.egcs_ay_discriminator = false
  }
})
watch(url, () => {
  search.value = ''
  pagination.value.pageIndex = 0
  expandedRows.value = {}
  fieldModal.close()
  optionModal.close()
  optionFieldId.value = null
})

/**
 * Opens a relational option editor for one Agency field.
 * @param fieldId - Parent field identity.
 * @param option - Existing option when editing.
 */
const openOption = (fieldId: string, option?: AgencyOption) => {
  optionFieldId.value = fieldId
  if (option) optionModal.openUpdate(option)
  else optionModal.openCreate()
}

/**
 * Saves an Agency field definition.
 */
const saveField = async () => {
  const selected = fieldModal.selected.value
  if (!selected || saving.value) return
  const session = fieldModal.captureSession()
  const { id } = selected
  const body = {
    egcs_ay_name_en: selected.egcs_ay_name_en,
    egcs_ay_name_fr: selected.egcs_ay_name_fr,
    egcs_ay_kind: selected.egcs_ay_kind,
    egcs_ay_multiple: selected.egcs_ay_multiple,
    egcs_ay_presentation: selected.egcs_ay_presentation,
    egcs_ay_discriminator: selected.egcs_ay_discriminator
  }
  saving.value = true
  try {
    const response = await fetch(getClientRequestUrl(`${url.value}${id ? `/${id}` : ''}`), {
      method: id ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
    })
    if (!response.ok) await throwFetchResponseError(response)
    fieldModal.closeSession(session)
    await refresh()
  } catch (saveError) {
    showError(saveError)
  } finally {
    saving.value = false
  }
}

/**
 * Saves a relational field option.
 */
const saveOption = async () => {
  const selected = optionModal.selected.value
  if (!selected || !optionFieldId.value || saving.value) return
  const session = optionModal.captureSession()
  const { id, egcs_ay_field: _field, ...body } = selected
  saving.value = true
  try {
    const response = await fetch(getClientRequestUrl(`${url.value}/${optionFieldId.value}/options${id ? `/${id}` : ''}`), {
      method: id ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
    })
    if (!response.ok) await throwFetchResponseError(response)
    optionModal.closeSession(session)
    await refresh()
  } catch (saveError) {
    showError(saveError)
  } finally {
    saving.value = false
  }
}

/**
 * Soft-deletes an Agency field or option after confirmation and refreshes the catalog.
 * @param path - Agency catalog resource path.
 */
const remove = async (path: string) => {
  if (await confirmDeleteRequest(path)) await refresh()
}
</script>

<template>
  <section class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2 class="text-xl font-semibold">
        {{ t('custom_fields.title') }}
      </h2>
      <UButton v-if="canCreate" icon="i-lucide-plus" :label="t('custom_fields.add_field')" @click="fieldModal.openCreate()" />
    </div>
    <CommonResourceLayoutCard
      v-model:search="search" v-model:pagination="pagination" :data="tableRows" :columns="columns"
      :grouping="grouping" :grouping-options="groupingOptions" :expanded-options="expandedOptions"
      :column-visibility="columnVisibility" :expanded="expandedRows" :total-records="filteredFields.length"
      :loading="status === 'pending'" :request-status="status" :show-button="false"
      @retry="refresh()" @update:expanded="expandedRows = $event">
      <template #name-cell="{ row }">
        <div :id="getGroupedDisclosureContentId(row)" class="contents">
          <div v-if="row.groupingColumnId === 'fieldGroup'" class="flex items-center gap-3 py-1">
            <CommonGroupedDisclosureButton
              v-if="row.original.field.egcs_ay_kind === 'relational' && row.original.field.options.length"
              class="group flex min-w-0 items-center gap-3 text-left font-bold"
              :expanded="row.getIsExpanded()" :controls="getGroupedDisclosureControlsId(row.id)"
              :label-en="row.original.field.egcs_ay_name_en" :label-fr="row.original.field.egcs_ay_name_fr"
              @toggle="row.toggleExpanded()">
              <UIcon :name="row.getIsExpanded() ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-4 text-zinc-400" />
              <CommonBilingualName :name-en="row.original.field.egcs_ay_name_en" :name-fr="row.original.field.egcs_ay_name_fr" />
              <CommonStatusBadge variant="count" size="sm" :label="String(row.original.field.options.length)" />
            </CommonGroupedDisclosureButton>
            <CommonBilingualName v-else class="pl-7" :name-en="row.original.field.egcs_ay_name_en" :name-fr="row.original.field.egcs_ay_name_fr" />
          </div>
          <div v-else-if="row.groupingColumnId === 'categoryGroup' && row.original.option" class="flex items-center gap-3 py-1 pl-6">
            <CommonGroupedDisclosureButton
              class="group flex min-w-0 items-center gap-3 text-left font-semibold"
              :expanded="row.getIsExpanded()" :controls="getGroupedDisclosureControlsId(row.id)"
              :label="row.original.option.egcs_ay_category_en ? undefined : t('custom_fields.uncategorized')"
              :label-en="row.original.option.egcs_ay_category_en ?? undefined"
              :label-fr="row.original.option.egcs_ay_category_fr ?? undefined"
              @toggle="row.toggleExpanded()">
              <UIcon :name="row.getIsExpanded() ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-4 text-zinc-400" />
              <CommonBilingualName v-if="row.original.option.egcs_ay_category_en" :name-en="row.original.option.egcs_ay_category_en" :name-fr="row.original.option.egcs_ay_category_fr ?? ''" />
              <span v-else>{{ t('custom_fields.uncategorized') }}</span>
              <CommonStatusBadge variant="count" size="sm" :label="String(row.subRows.length)" />
            </CommonGroupedDisclosureButton>
          </div>
          <div v-else-if="!row.getIsGrouped() && row.original.option" class="flex items-center gap-3 py-1 pl-12">
            <UIcon name="i-lucide-corner-down-right" class="size-4 text-zinc-400" />
            <CommonBilingualName :name-en="row.original.option.egcs_ay_name_en" :name-fr="row.original.option.egcs_ay_name_fr" />
          </div>
        </div>
      </template>
      <template #type-cell="{ row }">
        <span v-if="row.groupingColumnId === 'fieldGroup'">{{ typeLabel(row.original.field) }}</span>
        <span v-else-if="row.groupingColumnId === 'categoryGroup'">{{ t('custom_fields.category') }}</span>
      </template>
      <template #configuration-cell="{ row }">
        <UBadge v-if="row.groupingColumnId === 'fieldGroup' && row.original.field.egcs_ay_discriminator" color="neutral" variant="subtle" :label="t('custom_fields.discriminator')" />
      </template>
      <template #order-cell="{ row }">
        <span v-if="!row.getIsGrouped() && row.original.option">{{ row.original.option.egcs_ay_displayorder }}</span>
      </template>
      <template #status-cell="{ row }">
        <UBadge v-if="!row.getIsGrouped() && row.original.option" color="neutral" variant="subtle" :label="t(row.original.option.egcs_ay_active ? 'custom_fields.active' : 'custom_fields.inactive')" />
      </template>
      <template #actions-cell="{ row }">
        <div v-if="row.groupingColumnId === 'fieldGroup'" class="flex justify-end gap-2">
          <UButton v-if="canCreate && row.original.field.egcs_ay_kind === 'relational'" icon="i-lucide-plus" color="neutral" variant="ghost" size="sm" :aria-label="`${t('custom_fields.add_option')}: ${label(row.original.field)}`" @click="openOption(row.original.field.id)" />
          <UButton v-if="canUpdate" icon="i-lucide-pencil" color="neutral" variant="ghost" size="sm" :aria-label="`${t('common.edit')}: ${label(row.original.field)}`" @click="fieldModal.openUpdate(row.original.field)" />
          <UButton v-if="canDelete" icon="i-lucide-trash" color="error" variant="ghost" size="sm" :aria-label="`${t('common.delete')}: ${label(row.original.field)}`" @click="remove(`${url}/${row.original.field.id}`)" />
        </div>
        <div v-else-if="!row.getIsGrouped() && row.original.option" class="flex justify-end gap-2">
          <UButton v-if="canUpdate" icon="i-lucide-pencil" color="neutral" variant="ghost" size="sm" :aria-label="`${t('common.edit')}: ${label(row.original.option)}`" @click="openOption(row.original.field.id, row.original.option)" />
          <UButton v-if="canDelete" icon="i-lucide-trash" color="error" variant="ghost" size="sm" :aria-label="`${t('common.delete')}: ${label(row.original.option)}`" @click="remove(`${url}/${row.original.field.id}/options/${row.original.option.id}`)" />
        </div>
      </template>
    </CommonResourceLayoutCard>

    <UModal v-model:open="fieldModal.isOpen.value" :title="t('custom_fields.title')" :ui="{ content: 'sm:max-w-2xl' }">
      <template #body>
        <UForm v-if="fieldModal.selected.value" :state="fieldModal.selected.value" :validate="createValidator(AgencyCustomFieldCreateSchema)" class="space-y-4" @submit="saveField">
          <UFormField :label="t('custom_fields.name_en')" name="egcs_ay_name_en" required>
            <UInput v-model="fieldModal.selected.value.egcs_ay_name_en" class="w-full" />
          </UFormField>
          <UFormField :label="t('custom_fields.name_fr')" name="egcs_ay_name_fr" required>
            <UInput v-model="fieldModal.selected.value.egcs_ay_name_fr" class="w-full" />
          </UFormField>
          <UFormField :label="t('common.type')" name="egcs_ay_kind" required>
            <USelect v-model="fieldModal.selected.value.egcs_ay_kind" :disabled="Boolean(fieldModal.selected.value.id)" :items="[{ value: 'text', label: t('custom_fields.text') }, { value: 'number', label: t('custom_fields.number') }, { value: 'relational', label: t('custom_fields.relational') }]" />
          </UFormField>
          <UFormField v-if="fieldModal.selected.value.egcs_ay_kind === 'text'" :label="t('custom_fields.presentation')" name="egcs_ay_presentation">
            <USelect v-model="fieldModal.selected.value.egcs_ay_presentation" :items="[{ value: 'single_line', label: t('custom_fields.single_line') }, { value: 'multiline', label: t('custom_fields.multiline') }]" />
          </UFormField>
          <UCheckbox v-if="fieldModal.selected.value.egcs_ay_kind === 'relational'" v-model="fieldModal.selected.value.egcs_ay_multiple" :disabled="multipleSelectionLocked" :label="t('custom_fields.allow_multiple')" :description="t('custom_fields.multiple_help')" />
          <UCheckbox v-if="fieldModal.selected.value.egcs_ay_kind === 'relational'" v-model="fieldModal.selected.value.egcs_ay_discriminator" :label="t('custom_fields.discriminator')" />
          <CommonSaveButton :label="t('common.save')" :loading="saving" />
        </UForm>
      </template>
    </UModal>
    <UModal v-model:open="optionModal.isOpen.value" :title="t('custom_fields.add_option')" :ui="{ content: 'sm:max-w-2xl' }">
      <template #body>
        <UForm v-if="optionModal.selected.value" :state="optionModal.selected.value" :validate="createValidator(AgencyCustomFieldOptionCreateSchema)" class="space-y-4" @submit="saveOption">
          <UFormField :label="t('custom_fields.name_en')" name="egcs_ay_name_en" required>
            <UInput v-model="optionModal.selected.value.egcs_ay_name_en" class="w-full" />
          </UFormField>
          <UFormField :label="t('custom_fields.name_fr')" name="egcs_ay_name_fr" required>
            <UInput v-model="optionModal.selected.value.egcs_ay_name_fr" class="w-full" />
          </UFormField>
          <UFormField :label="t('custom_fields.category_en')" name="egcs_ay_category_en" :required="Boolean(optionModal.selected.value.egcs_ay_category_fr)">
            <UInput v-model="optionModal.selected.value.egcs_ay_category_en" class="w-full" />
          </UFormField>
          <UFormField :label="t('custom_fields.category_fr')" name="egcs_ay_category_fr" :required="Boolean(optionModal.selected.value.egcs_ay_category_en)">
            <UInput v-model="optionModal.selected.value.egcs_ay_category_fr" class="w-full" />
          </UFormField>
          <UCheckbox v-model="optionModal.selected.value.egcs_ay_active" :label="t('custom_fields.active')" />
          <UFormField :label="t('custom_fields.order')" name="egcs_ay_displayorder">
            <UInput v-model.number="optionModal.selected.value.egcs_ay_displayorder" type="number" min="0" />
          </UFormField>
          <CommonSaveButton :label="t('common.save')" :loading="saving" />
        </UForm>
      </template>
    </UModal>
  </section>
</template>
