<script setup lang="ts">
import { computed, ref, toRaw, watch, type Ref } from 'vue'
import { useCrudModalPending } from '~/composables/useCrudModal'
import { useActionContext } from '~/composables/useActionContext'
import type { DeleteTarget } from '~/composables/useConfirmDeleteRequest'
import type { CaptureCommittedSettlement } from '~/composables/useCommittedSettlement'
import type { useOperationLane } from '~/composables/useOperationLane'
import type { useResourceRequest } from '~/composables/useResourceRequest'
import { useFormSession } from '~/composables/useFormSession'
import { getGroupedRowModel, type ExpandedState } from '@tanstack/vue-table'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { AgencyCustomFieldCreateSchema, AgencyCustomFieldOptionCreateSchema } from '~~/shared/types/schemas/agreement-custom-fields'
import type { AgencyCustomFieldDefinition, CustomFieldStructure } from '~~/shared/types/schemas/agreement-custom-fields'
import AgencyCustomFieldStructure from './AgencyCustomFieldStructure.vue'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'

type AgencyOption = AgencyField['options'][number] & { egcs_ay_field?: string }
type AgencyField = AgencyCustomFieldDefinition
type Column = Extract<CustomFieldStructure, { kind: 'table' }>['columns'][number]
type ChildField = Extract<CustomFieldStructure, { kind: 'repeating' }>['fields'][number]
type ChildOption = NonNullable<ChildField['options']>[number]
type FieldRow = {
  id: string
  fieldGroup: string
  categoryGroup: string
  field: AgencyField
  option: AgencyOption | null
  item?: Column | ChildField
  childOption?: ChildOption
}

const { agencyId, canCreate, canUpdate, canDelete, catalog, fieldWrites, captureCommitted, removeCommitted, showHeader = true } = defineProps<{
  agencyId: string
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
  catalog: Pick<ReturnType<typeof useResourceRequest<{ items: AgencyField[] }>>, 'data' | 'status' | 'refresh'>
  fieldWrites: ReturnType<typeof useOperationLane<string>>
  captureCommitted: CaptureCommittedSettlement
  removeCommitted: <Row>(path: string, target: DeleteTarget<Row>, shouldProceed: () => boolean) => Promise<void>
  showHeader?: boolean
}>()
const { t, locale } = useI18n()
const { showError } = useApiErrorToast()
const { user, permissionRevision } = useAuth()
const { createValidator } = useZodI18n()
const url = computed(() => `/api/agency/${agencyId}/custom-fields`)
const data = computed(() => catalog.data.value)
const status = computed(() => catalog.status.value)
const refresh = () => catalog.refresh()

const fieldModal = useCrudModal<Partial<AgencyField>>({
  createState: () => ({ egcs_ay_kind: 'text', egcs_ay_multiple: false, egcs_ay_presentation: 'single_line', egcs_ay_discriminator: false }),
  updateState: field => ({
    ...field,
    egcs_ay_structure: field.egcs_ay_structure ? structuredClone(toRaw(field.egcs_ay_structure)) : field.egcs_ay_structure
  })
})
const optionModal = useCrudModal<Partial<AgencyOption>>({
  createState: () => ({ egcs_ay_category_en: null, egcs_ay_category_fr: null, egcs_ay_active: true, egcs_ay_displayorder: 0 }),
  updateState: option => ({ ...option })
})
const optionFieldId: Ref<string | null> = ref(null)
const optionPath = (fieldId: string, id?: string) => `${url.value}/${fieldId}/options${id ? `/${id}` : ''}`
const canOpenOption = (fieldId: string, id?: string) =>
  status.value === 'success' && !fieldWrites.isPending(optionPath(fieldId, id))
const canOpenField = (id: string) => canUpdate && status.value === 'success'
  && !fieldWrites.isPending(`${url.value}/${id}`)
/**
 * Opens from the currently accepted catalog after any same-field write has settled.
 * @param id - Field identity in the accepted Agency catalog.
 */
const openField = (id: string) => {
  if (!canOpenField(id)) return
  const field = data.value?.items.find(row => row.id === id)
  if (field) fieldModal.openUpdate(field)
}
const fieldCreateContext = useActionContext({ identity: [() => agencyId], authority: () => canCreate })
const fieldUpdateContext = useActionContext({ identity: [() => agencyId], authority: () => canUpdate, eligible: () => {
  const id = fieldModal.selected.value?.id
  return Boolean(id && canOpenField(id) && data.value?.items.some(row => row.id === id))
} })
const fieldActionContext = () => fieldModal.selected.value?.id ? fieldUpdateContext : fieldCreateContext
const canCreateOption = () => {
  const fieldId = optionFieldId.value
  return Boolean(fieldId && canOpenOption(fieldId) && data.value?.items.some(field => field.id === fieldId))
}
/** @returns Whether the accepted option still admits a save. */
const canUpdateOption = () => {
  const fieldId = optionFieldId.value
  const id = optionModal.selected.value?.id
  return Boolean(fieldId && id && canOpenOption(fieldId, id)
    && data.value?.items.find(field => field.id === fieldId)?.options.some(row => row.id === id))
}
const optionCreateContext = useActionContext({ identity: [() => agencyId], authority: () => canCreate, eligible: canCreateOption })
const optionUpdateContext = useActionContext({ identity: [() => agencyId], authority: () => canUpdate, eligible: canUpdateOption })
const optionActionContext = () => optionModal.selected.value?.id ? optionUpdateContext : optionCreateContext
const deleteActionContext = useActionContext({ identity: [() => agencyId], authority: () => canDelete, eligible: () => status.value === 'success' })
const fieldPending = useCrudModalPending(fieldModal.captureSession)
const optionPending = useCrudModalPending(optionModal.captureSession)
watch([() => canCreate, () => canUpdate], () => {
  if (fieldModal.selected.value && (fieldModal.selected.value.id ? !canUpdate : !canCreate)) fieldModal.close()
  if (optionModal.selected.value && (optionModal.selected.value.id ? !canUpdate : !canCreate)) optionModal.close()
}, { flush: 'sync' })
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
const typeLabel = (field: AgencyField) => t(`custom_fields.${field.egcs_ay_kind === 'text' ? field.egcs_ay_presentation : field.egcs_ay_kind === 'relational' ? (field.egcs_ay_presentation === 'checkboxes' ? 'checkboxes' : field.egcs_ay_multiple ? 'multiple_selection' : 'single_selection') : field.egcs_ay_kind}`)
/**
 * @param item - A Table column or Repeating set child.
 * @returns The localized type displayed in the catalog.
 */
const itemTypeLabel = (item: Column | ChildField) => {
  if (item.kind === 'relational') return t(`custom_fields.${item.presentation === 'checkboxes' ? 'checkboxes' : item.multiple ? 'multiple_selection' : 'single_selection'}`)
  if (item.kind === 'text' && 'presentation' in item && item.presentation === 'multiline') return t('custom_fields.multiline')
  return t(`custom_fields.${item.kind}`)
}
const structureItems = (structure: CustomFieldStructure | null | undefined) =>
  structure?.kind === 'table' ? structure.columns : structure?.fields ?? []
const choiceItems = (item: Column | ChildField) => item.kind === 'relational' ? item.options ?? [] : []
/**
 * @param field - The catalog definition owning the child-field and option groups.
 * @returns Groupable rows for that field's columns or child questions and choices.
 */
const structureRows = (field: AgencyField): FieldRow[] => structureItems(field.egcs_ay_structure).flatMap((item): FieldRow[] => {
  const categoryGroup = `field-item:${item.id}`
  const row = { id: `${field.id}:${categoryGroup}`, fieldGroup: field.id, categoryGroup, field, option: null, item }
  const options = choiceItems(item)
  return options.length ? options.map(childOption => ({ ...row, id: `${row.id}:${childOption.id}`, childOption })) : [row]
})
const filteredFields = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  if (!query) return data.value?.items ?? []
  return (data.value?.items ?? []).filter(field => [field.egcs_ay_name_en, field.egcs_ay_name_fr,
    ...field.options.flatMap(option => [option.egcs_ay_name_en, option.egcs_ay_name_fr, option.egcs_ay_category_en ?? '', option.egcs_ay_category_fr ?? '']),
    ...structureItems(field.egcs_ay_structure).flatMap(item => [item.labelEn, item.labelFr,
      ...choiceItems(item).flatMap(option => [option.labelEn, option.labelFr])])]
    .some(value => value.toLocaleLowerCase().includes(query)))
})
const tableRows = computed<FieldRow[]>(() => filteredFields.value
  .slice(pagination.value.pageIndex * pagination.value.pageSize, (pagination.value.pageIndex + 1) * pagination.value.pageSize)
  .flatMap((field): FieldRow[] => {
    if (field.egcs_ay_structure) return structureRows(field)
    if (field.options.length) return field.options.map(option => ({
      id: `option:${option.id}`, fieldGroup: field.id, categoryGroup: JSON.stringify([option.egcs_ay_category_en, option.egcs_ay_category_fr]), field, option
    }))
    return [{ id: `field:${field.id}`, fieldGroup: field.id, categoryGroup: 'empty', field, option: null }]
  }))
const fieldKindOptions = computed(() => (['text', 'number', 'relational', 'checkboxes', 'email', 'date', 'currency', 'table', 'repeating'] as const)
  .map(value => ({ value, label: t(`custom_fields.${value}`) })))
const textPresentations = computed(() => (['single_line', 'multiline'] as const)
  .map(value => ({ value, label: t(`custom_fields.${value}`) })))
const choicePresentations = computed(() => [
  { value: 'single_line' as const, label: t('custom_fields.multiple_selection') },
  { value: 'checkboxes' as const, label: t('custom_fields.checkboxes') }
])
const selectedFieldKind = computed(() => {
  const field = fieldModal.selected.value
  return field?.egcs_ay_presentation === 'checkboxes' ? 'checkboxes' : field?.egcs_ay_kind
})
/** @param kind - Selected field type, including the Checkboxes presentation shortcut. */
const changeFieldKind = (kind: AgencyField['egcs_ay_kind'] | 'checkboxes') => {
  const field = fieldModal.selected.value
  if (!field || fieldPending.isPending.value) return
  if (kind === 'checkboxes') {
    field.egcs_ay_kind = 'relational'
    field.egcs_ay_multiple = true
    field.egcs_ay_presentation = 'checkboxes'
  } else {
    if (field.egcs_ay_presentation === 'checkboxes') field.egcs_ay_presentation = 'single_line'
    field.egcs_ay_kind = kind
  }
}

watch(search, () => {
  pagination.value.pageIndex = 0
})
watch(filteredFields, fields => {
  pagination.value.pageIndex = Math.min(pagination.value.pageIndex, Math.max(0, Math.ceil(fields.length / pagination.value.pageSize) - 1))
})

watch(() => fieldModal.selected.value?.egcs_ay_kind, kind => {
  const selected = fieldModal.selected.value
  if (!selected) return
  if (kind !== 'text' && kind !== 'relational') selected.egcs_ay_presentation = 'single_line'
  if (kind === 'relational' && selected.egcs_ay_presentation !== 'checkboxes') selected.egcs_ay_presentation = 'single_line'
  if (kind !== 'number') {
    selected.egcs_ay_minimum = null
    selected.egcs_ay_maximum = null
    selected.egcs_ay_decimalplaces = null
  }
  if (kind !== 'relational') {
    selected.egcs_ay_multiple = false
    selected.egcs_ay_discriminator = false
  }
  if (kind === 'table') {
    if (selected.egcs_ay_structure?.kind !== kind) selected.egcs_ay_structure = { kind, maxRows: 20, totals: 'none', columns: [] }
  } else if (kind === 'repeating') {
    if (selected.egcs_ay_structure?.kind !== kind) selected.egcs_ay_structure = { kind, maxRows: 20, fields: [] }
  } else if (selected.egcs_ay_structure) {
    selected.egcs_ay_structure = null
  }
})
watch(() => fieldModal.selected.value?.egcs_ay_multiple, multiple => {
  const selected = fieldModal.selected.value
  if (!multiple && selected?.egcs_ay_presentation === 'checkboxes') selected.egcs_ay_presentation = 'single_line'
})
watch([url, () => user.value?.id, permissionRevision], () => {
  search.value = ''
  pagination.value.pageIndex = 0
  expandedRows.value = {}
  fieldModal.close()
  optionModal.close()
  optionFieldId.value = null
}, { flush: 'sync' })
/**
 * Opens a relational option editor for one Agency field.
 * @param fieldId - Parent field identity.
 * @param option - Existing option when editing.
 */
const openOption = (fieldId: string, option?: AgencyOption) => {
  if (!canOpenOption(fieldId, option?.id)) return
  const field = data.value?.items.find(row => row.id === fieldId)
  if (!field) return
  const accepted = option && field.options.find(row => row.id === option.id)
  if (option && !accepted) return
  optionFieldId.value = fieldId
  if (accepted) optionModal.openUpdate(accepted)
  else optionModal.openCreate()
}

/**
 * Saves an Agency field definition.
 */
const saveField = async () => {
  const operation = fieldActionContext().capture()
  const committed = captureCommitted()
  if (!operation?.canDispatch() || !committed?.canDispatch()) return
  const selected = fieldModal.selected.value
  const session = fieldModal.captureSession()
  if (!selected || session === null
    || (selected.id ? !canUpdate : !canCreate) || !fieldPending.begin(session)) return
  const { id } = selected
  const path = `${url.value}${id ? `/${id}` : ''}`
  const release = id ? fieldWrites.acquire(path) : null
  if (id && !release) {
    fieldPending.end(session)
    return
  }
  const body = {
    egcs_ay_name_en: selected.egcs_ay_name_en,
    egcs_ay_name_fr: selected.egcs_ay_name_fr,
    egcs_ay_kind: selected.egcs_ay_kind,
    egcs_ay_multiple: selected.egcs_ay_multiple,
    egcs_ay_presentation: selected.egcs_ay_presentation,
    egcs_ay_minimum: selected.egcs_ay_kind === 'number' ? selected.egcs_ay_minimum ?? null : undefined,
    egcs_ay_maximum: selected.egcs_ay_kind === 'number' ? selected.egcs_ay_maximum ?? null : undefined,
    egcs_ay_decimalplaces: selected.egcs_ay_kind === 'number' ? selected.egcs_ay_decimalplaces ?? null : undefined,
    egcs_ay_discriminator: selected.egcs_ay_discriminator,
    egcs_ay_structure: selected.egcs_ay_structure
  }
  let closedSession = false
  const ownsFeedback = () => operation.isCurrent() && (
    fieldModal.isCurrentSession(session) || (closedSession && fieldModal.isLatestSession(session))
  )
  try {
    const response = await fetch(getClientRequestUrl(path), {
      method: id ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
    })
    if (!response.ok) await throwFetchResponseError(response)
    if (operation.isCurrent()) closedSession = fieldModal.closeSession(session)
    const result = await committed.settle()
    if (result.kind === 'unavailable' && result.error && ownsFeedback()) showError(result.error)
  } catch (saveError) {
    if (ownsFeedback()) showError(saveError)
  } finally {
    release?.()
    fieldPending.end(session)
  }
}

/**
 * Saves a relational field option.
 */
const saveOption = async () => {
  const operation = optionActionContext().capture()
  const committed = captureCommitted()
  if (!operation?.canDispatch() || !committed?.canDispatch()) return
  const selected = optionModal.selected.value
  const session = optionModal.captureSession()
  const fieldId = optionFieldId.value
  if (!selected || !fieldId || session === null) return
  const { id, egcs_ay_field: _field, ...body } = selected
  const path = optionPath(fieldId, id)
  if (!optionPending.begin(session)) return
  const release = fieldWrites.acquire(path)
  if (!release) {
    optionPending.end(session)
    return
  }
  const ownsFeedback = () => operation.isCurrent() && optionModal.isCurrentSession(session)
  try {
    const response = await fetch(getClientRequestUrl(path), {
      method: id ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
    })
    if (!response.ok) await throwFetchResponseError(response)
    if (ownsFeedback()) optionModal.closeSession(session)
    await committed.settle()
  } catch (saveError) {
    if (ownsFeedback()) showError(saveError)
  } finally {
    release()
    optionPending.end(session)
  }
}

/**
 * Soft-deletes an Agency field or option after confirmation and refreshes the catalog.
 * @param fieldId - Accepted parent field identity.
 * @param optionId - Accepted option identity when deleting a child.
 */
const remove = async (fieldId: string, optionId?: string) => {
  const operation = deleteActionContext.capture()
  if (!operation) return
  const id = optionId ?? fieldId
  const path = `${url.value}/${fieldId}${optionId ? `/options/${optionId}` : ''}`
  const resolve = () => {
    const field = data.value?.items.find(row => row.id === fieldId)
    return optionId ? field?.options.find(row => row.id === optionId) : field
  }
  try {
    await removeCommitted(path, { id, resolve, eligible: () => canDelete }, operation.canDispatch)
  } catch (deleteError) {
    if (operation.isCurrent()) showError(deleteError)
  }
}
const fieldFormSession = useFormSession({ owner: fieldModal, action: { kind: 'remote', context: fieldActionContext }, submit: saveField })
const optionFormSession = useFormSession({ owner: optionModal, action: { kind: 'remote', context: optionActionContext }, submit: saveOption })
</script>

<template>
  <section class="space-y-4" data-field-scope="agency.custom-fields">
    <h2 v-if="showHeader" class="text-xl font-semibold">
      {{ t('custom_fields.title') }}
    </h2>
    <CommonResourceLayout
      v-model:search="search"
      v-model:pagination="pagination" table-id="agency.custom-fields" :data="tableRows" :columns="columns"
      :grouping="grouping" :grouping-options="groupingOptions" :expanded-options="expandedOptions"
      :column-visibility="columnVisibility" :expanded="expandedRows" :total-records="filteredFields.length"
      :loading="status === 'pending'" :request-status="status" :show-button="canCreate"
      :button-label="t('custom_fields.add_field')"
      @add="fieldModal.openCreate()" @retry="refresh()" @update:expanded="expandedRows = $event">
      <template #name-cell="{ row }">
        <div :id="getGroupedDisclosureContentId(row)" class="contents">
          <div v-if="row.groupingColumnId === 'fieldGroup'" class="flex items-center gap-3 py-1">
            <CommonGroupedDisclosureButton
              v-if="row.original.field.options.length || structureItems(row.original.field.egcs_ay_structure).length"
              class="group flex min-w-0 items-center gap-3 text-left font-bold"
              :expanded="row.getIsExpanded()" :controls="getGroupedDisclosureControlsId(row.id)"
              :label-en="row.original.field.egcs_ay_name_en" :label-fr="row.original.field.egcs_ay_name_fr"
              @toggle="row.toggleExpanded()">
              <UIcon :name="row.getIsExpanded() ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-4 text-zinc-400" />
              <CommonBilingualName :name-en="row.original.field.egcs_ay_name_en" :name-fr="row.original.field.egcs_ay_name_fr" />
              <CommonStatusBadge variant="count" size="sm" :label="String(row.original.field.options.length || structureItems(row.original.field.egcs_ay_structure).length)" />
            </CommonGroupedDisclosureButton>
            <CommonBilingualName v-else class="pl-7" :name-en="row.original.field.egcs_ay_name_en" :name-fr="row.original.field.egcs_ay_name_fr" />
          </div>
          <div v-else-if="row.groupingColumnId === 'categoryGroup' && row.original.item" class="flex items-center gap-3 py-1 pl-6">
            <CommonGroupedDisclosureButton
              v-if="row.original.childOption"
              class="group flex min-w-0 items-center gap-3 text-left font-semibold"
              :expanded="row.getIsExpanded()" :controls="getGroupedDisclosureControlsId(row.id)"
              :label-en="row.original.item.labelEn" :label-fr="row.original.item.labelFr"
              @toggle="row.toggleExpanded()">
              <UIcon :name="row.getIsExpanded() ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-4 text-zinc-400" />
              <CommonBilingualName :name-en="row.original.item.labelEn" :name-fr="row.original.item.labelFr" />
              <CommonStatusBadge variant="count" size="sm" :label="String(row.subRows.length)" />
            </CommonGroupedDisclosureButton>
            <CommonBilingualName v-else class="pl-7" :name-en="row.original.item.labelEn" :name-fr="row.original.item.labelFr" />
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
          <div v-else-if="!row.getIsGrouped() && row.original.childOption" class="flex items-center gap-3 py-1 pl-12">
            <UIcon name="i-lucide-corner-down-right" class="size-4 text-zinc-400" />
            <CommonBilingualName :name-en="row.original.childOption.labelEn" :name-fr="row.original.childOption.labelFr" />
          </div>
          <div v-else-if="!row.getIsGrouped() && row.original.option" class="flex items-center gap-3 py-1 pl-12">
            <UIcon name="i-lucide-corner-down-right" class="size-4 text-zinc-400" />
            <CommonBilingualName :name-en="row.original.option.egcs_ay_name_en" :name-fr="row.original.option.egcs_ay_name_fr" />
          </div>
        </div>
      </template>
      <template #type-cell="{ row }">
        <span v-if="row.groupingColumnId === 'fieldGroup'">{{ typeLabel(row.original.field) }}</span>
        <span v-else-if="row.groupingColumnId === 'categoryGroup' && row.original.item">{{ itemTypeLabel(row.original.item) }}</span>
        <span v-else-if="row.groupingColumnId === 'categoryGroup'">{{ t('custom_fields.category') }}</span>
      </template>
      <template #configuration-cell="{ row }">
        <UBadge v-if="row.groupingColumnId === 'fieldGroup' && row.original.field.egcs_ay_discriminator" color="neutral" variant="subtle" :label="t('custom_fields.discriminator')" />
        <UBadge v-else-if="row.groupingColumnId === 'categoryGroup' && row.original.item?.required" color="neutral" variant="subtle" :label="t('custom_fields.required')" />
      </template>
      <template #order-cell="{ row }">
        <span v-if="!row.getIsGrouped() && row.original.option">{{ row.original.option.egcs_ay_displayorder }}</span>
      </template>
      <template #status-cell="{ row }">
        <UBadge v-if="!row.getIsGrouped() && row.original.option" color="neutral" variant="subtle" :label="t(row.original.option.egcs_ay_active ? 'custom_fields.active' : 'custom_fields.inactive')" />
      </template>
      <template #actions-cell="{ row }">
        <div v-if="row.groupingColumnId === 'fieldGroup'" class="flex justify-end gap-2">
          <CommonActionButton v-if="canCreate && row.original.field.egcs_ay_kind === 'relational'" icon="i-lucide-plus" color="neutral" variant="ghost" size="sm" :aria-label="`${t('custom_fields.add_option')}: ${label(row.original.field)}`" :disabled="!canOpenOption(row.original.field.id)" @click="openOption(row.original.field.id)" />
          <CommonActionButton v-if="canUpdate" icon="i-lucide-pencil" color="neutral" variant="ghost" size="sm" :aria-label="`${t('common.edit')}: ${label(row.original.field)}`" :disabled="!canOpenField(row.original.field.id)" @click="openField(row.original.field.id)" />
          <CommonActionButton v-if="canDelete" icon="i-lucide-trash" color="error" variant="ghost" size="sm" :aria-label="`${t('common.delete')}: ${label(row.original.field)}`" @click="remove(row.original.field.id)" />
        </div>
        <div v-else-if="!row.getIsGrouped() && row.original.option" class="flex justify-end gap-2">
          <CommonActionButton v-if="canUpdate" icon="i-lucide-pencil" color="neutral" variant="ghost" size="sm" :aria-label="`${t('common.edit')}: ${label(row.original.option)}`" :disabled="!canOpenOption(row.original.field.id, row.original.option.id)" @click="openOption(row.original.field.id, row.original.option)" />
          <CommonActionButton v-if="canDelete" icon="i-lucide-trash" color="error" variant="ghost" size="sm" :aria-label="`${t('common.delete')}: ${label(row.original.option)}`" @click="remove(row.original.field.id, row.original.option.id)" />
        </div>
      </template>
    </CommonResourceLayout>

    <UModal v-model:open="fieldModal.isOpen.value" :title="t('custom_fields.title')" :ui="{ content: 'sm:max-w-2xl' }">
      <template #body>
        <UForm v-if="fieldModal.selected.value" v-bind="fieldFormSession" :disabled="fieldPending.isPending.value" data-field-scope="agency.custom-field" :state="fieldModal.selected.value" :validate="createValidator(AgencyCustomFieldCreateSchema.strip())" class="space-y-4">
          <fieldset :disabled="fieldPending.isPending.value" class="min-w-0 space-y-4">
            <UFormField :label="t('custom_fields.name_en')" name="egcs_ay_name_en" required>
              <UInput v-model="fieldModal.selected.value.egcs_ay_name_en" class="w-full" />
            </UFormField>
            <UFormField :label="t('custom_fields.name_fr')" name="egcs_ay_name_fr" required>
              <UInput v-model="fieldModal.selected.value.egcs_ay_name_fr" class="w-full" />
            </UFormField>
            <UFormField :label="t('common.type')" name="egcs_ay_kind" required>
              <USelect :model-value="selectedFieldKind" :disabled="Boolean(fieldModal.selected.value.id)" :items="fieldKindOptions" @update:model-value="changeFieldKind" />
            </UFormField>
            <UFormField
              v-if="fieldModal.selected.value.egcs_ay_kind === 'text' || (fieldModal.selected.value.egcs_ay_kind === 'relational' && fieldModal.selected.value.egcs_ay_multiple)"
              :label="t(fieldModal.selected.value.egcs_ay_kind === 'text' ? 'custom_fields.presentation' : 'custom_fields.choice_presentation')"
              data-field-label-en="Field presentation" data-field-label-fr="Présentation du champ"
              name="egcs_ay_presentation">
              <USelect v-model="fieldModal.selected.value.egcs_ay_presentation" :items="fieldModal.selected.value.egcs_ay_kind === 'text' ? textPresentations : choicePresentations" />
            </UFormField>
            <div v-if="fieldModal.selected.value.egcs_ay_kind === 'number'" class="grid gap-4 sm:grid-cols-3">
              <UFormField :label="t('custom_fields.minimum')" name="egcs_ay_minimum">
                <UInput v-model.number.nullable="fieldModal.selected.value.egcs_ay_minimum" type="number" step="any" class="w-full" />
              </UFormField>
              <UFormField :label="t('custom_fields.maximum')" name="egcs_ay_maximum">
                <UInput v-model.number.nullable="fieldModal.selected.value.egcs_ay_maximum" type="number" step="any" class="w-full" />
              </UFormField>
              <UFormField :label="t('custom_fields.decimal_places')" name="egcs_ay_decimalplaces">
                <UInput v-model.number.nullable="fieldModal.selected.value.egcs_ay_decimalplaces" type="number" min="0" max="324" step="1" class="w-full" />
              </UFormField>
            </div>
            <UCheckbox v-if="fieldModal.selected.value.egcs_ay_kind === 'relational'" v-model="fieldModal.selected.value.egcs_ay_multiple" :disabled="multipleSelectionLocked" :label="t('custom_fields.allow_multiple')" :description="t('custom_fields.multiple_help')" data-ui-target="agency.custom-field.egcs_ay_multiple" />
            <UCheckbox v-if="fieldModal.selected.value.egcs_ay_kind === 'relational'" v-model="fieldModal.selected.value.egcs_ay_discriminator" :label="t('custom_fields.discriminator')" data-ui-target="agency.custom-field.egcs_ay_discriminator" />
            <AgencyCustomFieldStructure
              v-if="fieldModal.selected.value.egcs_ay_structure"
              v-model="fieldModal.selected.value.egcs_ay_structure"
              :disabled="fieldPending.isPending.value"
              data-field-container="Claim-only composite definition editor; its controls provide individual names." />
          </fieldset>
          <CommonSaveButton :label="t('common.save')" :loading="fieldPending.isPending.value" />
        </UForm>
      </template>
    </UModal>
    <UModal v-model:open="optionModal.isOpen.value" :title="t('custom_fields.add_option')" :ui="{ content: 'sm:max-w-2xl' }">
      <template #body>
        <UForm v-if="optionModal.selected.value" v-bind="optionFormSession" :disabled="optionPending.isPending.value" data-field-scope="agency.custom-field-option" :state="optionModal.selected.value" :validate="createValidator(AgencyCustomFieldOptionCreateSchema.strip())" class="space-y-4">
          <fieldset :disabled="optionPending.isPending.value" class="min-w-0 space-y-4">
            <UFormField :label="t('custom_fields.name_en')" name="egcs_ay_name_en" required>
              <UInput v-model="optionModal.selected.value.egcs_ay_name_en" class="w-full" />
            </UFormField>
            <UFormField :label="t('custom_fields.name_fr')" name="egcs_ay_name_fr" required>
              <UInput v-model="optionModal.selected.value.egcs_ay_name_fr" class="w-full" />
            </UFormField>
            <UFormField :label="t('custom_fields.category_en')" name="egcs_ay_category_en" :required="Boolean(optionModal.selected.value.egcs_ay_category_fr)">
              <UInput v-model.nullable="optionModal.selected.value.egcs_ay_category_en" class="w-full" />
            </UFormField>
            <UFormField :label="t('custom_fields.category_fr')" name="egcs_ay_category_fr" :required="Boolean(optionModal.selected.value.egcs_ay_category_en)">
              <UInput v-model.nullable="optionModal.selected.value.egcs_ay_category_fr" class="w-full" />
            </UFormField>
            <USwitch v-model="optionModal.selected.value.egcs_ay_active" :label="t('custom_fields.active')" data-ui-target="agency.custom-field-option.egcs_ay_active" />
            <UFormField :label="t('custom_fields.order')" name="egcs_ay_displayorder">
              <UInput v-model.number="optionModal.selected.value.egcs_ay_displayorder" type="number" min="0" />
            </UFormField>
            <CommonSaveButton :label="t('common.save')" :loading="optionPending.isPending.value" />
          </fieldset>
        </UForm>
      </template>
    </UModal>
  </section>
</template>
