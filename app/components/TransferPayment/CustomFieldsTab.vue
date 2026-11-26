<script setup lang="ts">
import { useActionContext } from '~/composables/useActionContext'
import { computed, ref, watch, type Ref } from 'vue'
import type { StreamCustomFieldCatalog } from '~/composables/useStreamCustomFieldSettings'
import { useCrudModalPending } from '~/composables/useCrudModal'
import { useFormSession } from '~/composables/useFormSession'
import { getGroupedRowModel, type ExpandedState } from '@tanstack/vue-table'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'
import {
  StreamFieldSectionCreateSchema, StreamFieldAssignmentCreateSchema,
  type AgreementCustomFieldSection, type AssignedAgencyCustomFieldDefinition
} from '~~/shared/types/schemas/agreement-custom-fields'
import type { StreamFieldAssignmentTarget } from '~~/shared/types/database'

type AssignmentForm = {
  assignmentId?: string
  egcs_tp_agencyfield: string | undefined
  egcs_tp_section: string | null
  egcs_tp_required: boolean
  egcs_tp_active: boolean
  egcs_tp_displayorder: number
}
type Option = AssignedAgencyCustomFieldDefinition['options'][number]
type FieldRow = { id: string, sectionGroup: string, section: AgreementCustomFieldSection | null, fieldGroup: string, categoryGroup: string, field: AssignedAgencyCustomFieldDefinition | null, option: Option | null }

const { transferPaymentId, streamId, canUpdateChild, catalog, target = 'agreement' } = defineProps<{
  transferPaymentId: string, streamId: string, canUpdateChild: boolean, catalog: StreamCustomFieldCatalog, target?: StreamFieldAssignmentTarget
}>()
const { t } = useI18n()
const { showError } = useApiErrorToast()
const { createValidator } = useZodI18n()
const baseUrl = computed(() => `/api/transfer-payments/${transferPaymentId}/streams/${streamId}`)
const hasSections = computed(() => target !== 'activity')
const hasPlacement = computed(() => target === 'claim' || target === 'forecast')
const assignmentUrl = computed(() => `${baseUrl.value}/${target === 'agreement' ? 'custom-fields' : `${target}-custom-fields`}`)
const sectionUrl = (id?: string) => `${baseUrl.value}/custom-fields/sections${id ? `/${id}` : ''}${hasPlacement.value ? `?target=${target}` : ''}`
const data = computed(() => catalog.request.data.value)
const status = computed(() => catalog.request.status.value)
const refresh = () => catalog.request.refresh()
const assignmentModal = useCrudModal<AssignmentForm>({
  createState: () => ({ egcs_tp_agencyfield: undefined, egcs_tp_section: null, egcs_tp_required: false, egcs_tp_active: true, egcs_tp_displayorder: 0 }),
  updateState: field => ({ ...field })
})
const editingAssignmentId = computed(() => assignmentModal.selected.value?.assignmentId)
const sectionModal = useCrudModal<Partial<AgreementCustomFieldSection>>({ createState: () => ({ egcs_tp_displayorder: 0, egcs_tp_beforeentity: false }), updateState: section => ({ ...section }) })
const sectionPending = useCrudModalPending(sectionModal.captureSession)
const assignmentPending = useCrudModalPending(assignmentModal.captureSession)
const assignmentPath = (id?: string) => `${assignmentUrl.value}${id ? `/${id}` : ''}`
const canWritePath = (path: string) => status.value === 'success' && !catalog.writes.isPending(path)
const sectionWriteBlocked = computed(() => !canWritePath(sectionUrl(sectionModal.selected.value?.id)))
const assignmentWriteBlocked = computed(() => !canWritePath(assignmentPath(editingAssignmentId.value)))
const actionIdentity = () => JSON.stringify([assignmentUrl.value, catalog.identity.value])
const writeContext = useActionContext({
  identity: [actionIdentity],
  authority: () => canUpdateChild,
  eligible: () => status.value === 'success'
})
const sectionContext = useActionContext({
  identity: [actionIdentity],
  authority: () => canUpdateChild,
  eligible: () => !sectionWriteBlocked.value
})
const assignmentContext = useActionContext({
  identity: [actionIdentity],
  authority: () => canUpdateChild,
  eligible: () => !assignmentWriteBlocked.value
})
const search: Ref<string> = ref('')
const pagination = ref({ pageIndex: 0, pageSize: 10 })
const expandedRows: Ref<ExpandedState> = ref({})
const { getGroupedDisclosureControlsId, getGroupedDisclosureContentId } = useGroupedDisclosureIds()
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
const grouping = computed(() => hasSections.value ? ['sectionGroup', 'fieldGroup', 'categoryGroup'] : ['fieldGroup', 'categoryGroup'])
const groupingOptions = { getGroupedRowModel: getGroupedRowModel() }
const expandedOptions = { autoResetExpanded: false }
const columnVisibility = { sectionGroup: false, fieldGroup: false, categoryGroup: false }
/**
 * Opens assignment creation in the selected Stream section.
 * @param sectionId - Existing section or null for no section.
 */
const openAssignment = (sectionId: string | null) => {
  assignmentModal.openCreate()
  if (assignmentModal.selected.value) assignmentModal.selected.value.egcs_tp_section = sectionId
}
/**
 * Opens an accepted section after the previous write and readback finish.
 * @param id - Selected Stream section.
 */
const editSection = (id: string) => {
  if (!canWritePath(sectionUrl(id))) return
  const section = data.value?.sections.find(item => item.id === id)
  if (section) sectionModal.openUpdate(section)
}

/**
 * Opens the Stream settings of an assigned Agency field.
 * @param id - Identity of the assignment in the accepted catalog.
 */
const editAssignment = (id: string) => {
  if (!canWritePath(assignmentPath(id))) return
  const field = data.value?.items.find(item => item.assignmentId === id)
  if (!field) return
  assignmentModal.openUpdate({
    assignmentId: field.assignmentId,
    egcs_tp_agencyfield: field.id,
    egcs_tp_section: field.egcs_tp_section, egcs_tp_required: field.egcs_tp_required,
    egcs_tp_active: field.egcs_tp_active, egcs_tp_displayorder: field.egcs_tp_displayorder
  })
}
/**
 * Saves a captured Stream section or assignment and refreshes the owning catalog.
 * @param path - Fixed endpoint for this write.
 * @param id - Persisted identity for a PATCH.
 * @param body - Validated draft properties.
 * @param modal - Session owner of the submitted draft.
 * @param pending - Pending projection for the submitted opening.
 */
const save = async (
  path: string,
  id: string | undefined,
  body: object,
  modal: Pick<typeof sectionModal, 'captureSession' | 'closeSession' | 'isCurrentSession'>,
  pending: typeof sectionPending
) => {
  const owner = catalog
  const operation = writeContext.capture()
  const committed = owner.captureCommitted()
  const session = modal.captureSession()
  if (!operation?.canDispatch() || !committed?.canDispatch() || session === null) return
  const release = owner.writes.acquire(path)
  if (!release) return
  if (!pending.begin(session)) {
    release()
    return
  }
  try {
    const response = await fetch(getClientRequestUrl(path), { method: id ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (!response.ok) await throwFetchResponseError(response)
    if (operation.isCurrent()) modal.closeSession(session)
    await committed.settle()
  } catch (error) {
    if (operation.isCurrent() && modal.isCurrentSession(session)) showError(error)
  } finally {
    release()
    pending.end(session)
  }
}

/** @returns The accepted Stream section save, when admitted. */
const saveSection = () => {
  const selected = sectionModal.selected.value
  if (!selected) return
  const { id, ...body } = selected
  if (id && !data.value?.sections.some(section => section.id === id)) return
  return save(sectionUrl(id), id, body, sectionModal, sectionPending)
}

/** @returns The assignment save, when the selected row and section still exist. */
const saveAssignment = () => {
  const selected = assignmentModal.selected.value
  if (!selected) return
  const { assignmentId, egcs_tp_agencyfield, ...settings } = selected
  if (assignmentId && !data.value?.items.some(field => field.assignmentId === assignmentId)) return
  if (settings.egcs_tp_section && !data.value?.sections.some(section => section.id === settings.egcs_tp_section)) return
  return save(assignmentPath(assignmentId), assignmentId, assignmentId ? settings : { egcs_tp_agencyfield, ...settings }, assignmentModal, assignmentPending)
}

/**
 * Deletes the selected accepted Stream section or field assignment.
 * @param target - Fixed section or assignment identity captured by the control.
 * @param target.kind - Whether this removes a section or its field assignment.
 * @param target.id - Persisted section or assignment identifier.
 */
const remove = async (target: { kind: 'section' | 'assignment'; id: string }) => {
  const operation = writeContext.capture()
  if (!operation) return
  const { kind, id } = target
  const path = kind === 'section' ? sectionUrl(id) : assignmentPath(id)
  const resolve = (): AgreementCustomFieldSection | AssignedAgencyCustomFieldDefinition | undefined => kind === 'section'
    ? data.value?.sections.find(current => current.id === id)
    : data.value?.items.find(current => current.assignmentId === id)
  try {
    await catalog.remove(path, {
      id, resolve, eligible: current => kind === 'section' ? current.id === id : 'assignmentId' in current && current.assignmentId === id
    }, operation.canDispatch)
  } catch (error) {
    if (operation.isCurrent()) showError(error)
  }
}

const filteredSections = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  const sections: Array<AgreementCustomFieldSection | null> = [...(data.value?.sections ?? []), null]
  return sections.map(section => {
    const fields = (data.value?.items ?? []).filter(field => field.egcs_tp_section === (section?.id ?? null))
    const sectionMatches = section ? [section.egcs_tp_name_en, section.egcs_tp_name_fr].some(label => label.toLocaleLowerCase().includes(query)) : false
    const matches = fields.filter(field => sectionMatches || [field.egcs_ay_name_en, field.egcs_ay_name_fr,
      ...field.options.flatMap(option => [option.egcs_ay_name_en, option.egcs_ay_name_fr, option.egcs_ay_category_en ?? '', option.egcs_ay_category_fr ?? ''])]
      .some(label => label.toLocaleLowerCase().includes(query)))
    return { section, fields: matches }
  }).filter(group => group.section ? !query || group.fields.length || [group.section.egcs_tp_name_en, group.section.egcs_tp_name_fr].some(label => label.toLocaleLowerCase().includes(query)) : group.fields.length > 0)
})
const tableGroups = computed(() => hasSections.value
  ? filteredSections.value
  : filteredSections.value.flatMap(({ fields }) => fields.map(field => ({ section: null, fields: [field] }))))
const tableRows = computed<FieldRow[]>(() => tableGroups.value
  .slice(pagination.value.pageIndex * pagination.value.pageSize, (pagination.value.pageIndex + 1) * pagination.value.pageSize)
  .flatMap(({ section, fields }): FieldRow[] => fields.length
    ? fields.flatMap((field): FieldRow[] => field.options.length
        ? field.options.map(option => ({ id: `option:${option.id}`, sectionGroup: section?.id ?? 'unsectioned', section, fieldGroup: field.id, categoryGroup: JSON.stringify([option.egcs_ay_category_en, option.egcs_ay_category_fr]), field, option }))
        : [{ id: `field:${field.id}`, sectionGroup: section?.id ?? 'unsectioned', section, fieldGroup: field.id, categoryGroup: 'empty', field, option: null }])
    : [{ id: `section:${section?.id}`, sectionGroup: section?.id ?? 'unsectioned', section, fieldGroup: `empty:${section?.id}`, categoryGroup: 'empty', field: null, option: null }]))
watch(search, () => {
  pagination.value.pageIndex = 0
})
watch(tableGroups, groups => {
  pagination.value.pageIndex = Math.min(pagination.value.pageIndex, Math.max(0, Math.ceil(groups.length / pagination.value.pageSize) - 1))
})
watch(actionIdentity, () => {
  search.value = ''
  pagination.value.pageIndex = 0
  expandedRows.value = {}
  sectionModal.close()
  assignmentModal.close()
}, { flush: 'sync' })
const sectionFormSession = useFormSession({ owner: sectionModal, action: { kind: 'remote', context: sectionContext }, submit: saveSection })
const assignmentFormSession = useFormSession({ owner: assignmentModal, action: { kind: 'remote', context: assignmentContext }, submit: saveAssignment })
</script>

<template>
  <div data-field-scope="transfer-payment.custom-fields-tab">
    <div v-if="canUpdateChild && hasSections" class="mb-4 flex justify-end">
      <UButton icon="i-lucide-plus" color="neutral" variant="outline" :label="t('custom_fields.assign_field')" @click="openAssignment(null)" />
    </div>
    <CommonResourceLayout
      v-model:search="search"
      v-model:pagination="pagination" table-id="transfer-payment.custom-fields-tab" :data="tableRows" :columns="columns"
      :grouping="grouping" :grouping-options="groupingOptions" :expanded-options="expandedOptions"
      :column-visibility="columnVisibility" :expanded="expandedRows" :total-records="tableGroups.length"
      :loading="status === 'pending'" :request-status="status" :button-label="t(hasSections ? 'custom_fields.add_section' : 'custom_fields.assign_field')"
      :show-button="canUpdateChild" @add="hasSections ? sectionModal.openCreate() : openAssignment(null)" @retry="refresh()" @update:expanded="expandedRows = $event">
      <template #name-cell="{ row }">
        <div :id="getGroupedDisclosureContentId(row)" class="contents">
          <div v-if="row.groupingColumnId === 'sectionGroup'" class="flex items-center gap-3 py-1">
            <CommonGroupedDisclosureButton class="group flex min-w-0 items-center gap-3 text-left font-bold" :expanded="row.getIsExpanded()" :controls="getGroupedDisclosureControlsId(row.id)" :label-en="row.original.section?.egcs_tp_name_en" :label-fr="row.original.section?.egcs_tp_name_fr" :label="row.original.section ? undefined : t('custom_fields.unsectioned')" @toggle="row.toggleExpanded()">
              <UIcon :name="row.getIsExpanded() ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-4 text-zinc-400" />
              <CommonBilingualName v-if="row.original.section" :name-en="row.original.section.egcs_tp_name_en" :name-fr="row.original.section.egcs_tp_name_fr" />
              <span v-else>{{ t('custom_fields.unsectioned') }}</span>
            </CommonGroupedDisclosureButton>
          </div>
          <div v-else-if="row.groupingColumnId === 'fieldGroup' && row.original.field" class="flex items-center gap-3 py-1" :class="{ 'pl-6': hasSections }">
            <CommonGroupedDisclosureButton v-if="row.original.field.egcs_ay_kind === 'relational' && row.original.field.options.length" class="group flex min-w-0 items-center gap-3 text-left font-bold" :expanded="row.getIsExpanded()" :controls="getGroupedDisclosureControlsId(row.id)" :label-en="row.original.field.egcs_ay_name_en" :label-fr="row.original.field.egcs_ay_name_fr" @toggle="row.toggleExpanded()">
              <UIcon :name="row.getIsExpanded() ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-4 text-zinc-400" />
              <CommonBilingualName :name-en="row.original.field.egcs_ay_name_en" :name-fr="row.original.field.egcs_ay_name_fr" />
              <CommonStatusBadge variant="count" size="sm" :label="String(row.original.field.options.length)" />
            </CommonGroupedDisclosureButton>
            <CommonBilingualName v-else class="pl-7" :name-en="row.original.field.egcs_ay_name_en" :name-fr="row.original.field.egcs_ay_name_fr" />
          </div>
          <div v-else-if="row.groupingColumnId === 'categoryGroup' && row.original.option" class="flex items-center gap-3 py-1 pl-12">
            <CommonGroupedDisclosureButton class="group flex min-w-0 items-center gap-3 text-left font-semibold" :expanded="row.getIsExpanded()" :controls="getGroupedDisclosureControlsId(row.id)" :label="row.original.option.egcs_ay_category_en ? undefined : t('custom_fields.uncategorized')" :label-en="row.original.option.egcs_ay_category_en ?? undefined" :label-fr="row.original.option.egcs_ay_category_fr ?? undefined" @toggle="row.toggleExpanded()">
              <UIcon :name="row.getIsExpanded() ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-4 text-zinc-400" />
              <CommonBilingualName v-if="row.original.option.egcs_ay_category_en" :name-en="row.original.option.egcs_ay_category_en" :name-fr="row.original.option.egcs_ay_category_fr ?? ''" />
              <span v-else>{{ t('custom_fields.uncategorized') }}</span>
              <CommonStatusBadge variant="count" size="sm" :label="String(row.subRows.length)" />
            </CommonGroupedDisclosureButton>
          </div>
          <div v-else-if="!row.getIsGrouped() && row.original.option" class="flex items-center gap-3 py-1 pl-18">
            <UIcon name="i-lucide-corner-down-right" class="size-4 text-zinc-400" />
            <CommonBilingualName :name-en="row.original.option.egcs_ay_name_en" :name-fr="row.original.option.egcs_ay_name_fr" />
          </div>
          <span v-else class="pl-6 text-sm text-muted">{{ t('common.no_data') }}</span>
        </div>
      </template>
      <template #type-cell="{ row }">
        <span v-if="row.groupingColumnId === 'sectionGroup'">{{ t('custom_fields.section') }}</span>
        <span v-else-if="row.groupingColumnId === 'categoryGroup'">{{ t('custom_fields.category') }}</span>
        <span v-else-if="row.groupingColumnId === 'fieldGroup' && row.original.field">{{ t(`custom_fields.${row.original.field.egcs_ay_kind === 'text' ? row.original.field.egcs_ay_presentation : row.original.field.egcs_ay_kind === 'relational' ? (row.original.field.egcs_ay_presentation === 'checkboxes' ? 'checkboxes' : row.original.field.egcs_ay_multiple ? 'multiple_selection' : 'single_selection') : row.original.field.egcs_ay_kind}`) }}</span>
      </template>
      <template #configuration-cell="{ row }">
        <UBadge v-if="hasPlacement && row.groupingColumnId === 'sectionGroup' && row.original.section?.egcs_tp_beforeentity" color="neutral" variant="subtle" :label="t('custom_fields.before_entity')" />
        <div v-else-if="row.groupingColumnId === 'fieldGroup' && row.original.field" class="flex flex-wrap gap-2">
          <UBadge v-if="row.original.field.egcs_tp_required" color="neutral" variant="subtle" :label="t('custom_fields.required')" />
          <UBadge v-if="target === 'agreement' && row.original.field.egcs_ay_discriminator" color="neutral" variant="subtle" :label="t('custom_fields.discriminator')" />
        </div>
        <CommonBilingualName v-else-if="!row.getIsGrouped() && row.original.option?.egcs_ay_category_en" :name-en="row.original.option.egcs_ay_category_en" :name-fr="row.original.option.egcs_ay_category_fr ?? ''" />
      </template>
      <template #order-cell="{ row }">
        <span v-if="row.groupingColumnId !== 'categoryGroup'">{{ row.groupingColumnId === 'sectionGroup' ? row.original.section?.egcs_tp_displayorder : row.getIsGrouped() ? row.original.field?.egcs_tp_displayorder : row.original.option?.egcs_ay_displayorder }}</span>
      </template>
      <template #status-cell="{ row }">
        <UBadge v-if="(row.groupingColumnId === 'fieldGroup' || !row.getIsGrouped()) && (row.original.field || row.original.option)" color="neutral" variant="subtle" :label="t((row.original.option && !row.getIsGrouped() ? row.original.option.egcs_ay_active : row.original.field?.egcs_tp_active) ? 'custom_fields.active' : 'custom_fields.inactive')" />
      </template>
      <template #actions-cell="{ row }">
        <div v-if="row.groupingColumnId === 'sectionGroup'" class="flex items-center gap-2">
          <CommonActionButton v-if="canUpdateChild" icon="i-lucide-plus" color="neutral" variant="ghost" size="sm" :aria-label="t('custom_fields.assign_field')" @click="openAssignment(row.original.section?.id ?? null)" />
          <CommonActionButton v-if="canUpdateChild && row.original.section" icon="i-lucide-pencil" color="neutral" variant="ghost" size="sm" :aria-label="t('common.edit')" :disabled="!canWritePath(sectionUrl(row.original.section.id))" @click="editSection(row.original.section.id)" />
          <CommonActionButton v-if="canUpdateChild && row.original.section" icon="i-lucide-trash" color="error" variant="ghost" size="sm" :aria-label="t('common.delete')" @click="remove({ kind: 'section', id: row.original.section.id })" />
        </div>
        <div v-else-if="row.groupingColumnId === 'fieldGroup' && row.original.field" class="flex items-center gap-2">
          <CommonActionButton v-if="canUpdateChild" icon="i-lucide-pencil" color="neutral" variant="ghost" size="sm" :aria-label="t('common.edit')" :disabled="!canWritePath(assignmentPath(row.original.field.assignmentId))" @click="editAssignment(row.original.field.assignmentId)" />
          <CommonActionButton v-if="canUpdateChild" icon="i-lucide-trash" color="error" variant="ghost" size="sm" :aria-label="t('common.delete')" @click="remove({ kind: 'assignment', id: row.original.field.assignmentId })" />
        </div>
      </template>
    </CommonResourceLayout>
    <UModal v-if="hasSections" v-model:open="sectionModal.isOpen.value" :title="t('custom_fields.section')">
      <template #body>
        <UForm v-if="sectionModal.selected.value" v-bind="sectionFormSession" :disabled="sectionPending.isPending.value" data-field-scope="transfer-payment.custom-field-section" :state="sectionModal.selected.value" :validate="createValidator(StreamFieldSectionCreateSchema)" class="space-y-4">
          <fieldset :disabled="sectionPending.isPending.value" class="min-w-0 space-y-4">
            <UFormField :label="t('custom_fields.name_en')" name="egcs_tp_name_en" required>
              <UInput v-model="sectionModal.selected.value.egcs_tp_name_en" class="w-full" />
            </UFormField>
            <UFormField :label="t('custom_fields.name_fr')" name="egcs_tp_name_fr" required>
              <UInput v-model="sectionModal.selected.value.egcs_tp_name_fr" class="w-full" />
            </UFormField>
            <UFormField :label="t('custom_fields.order')" name="egcs_tp_displayorder">
              <UInput v-model.number="sectionModal.selected.value.egcs_tp_displayorder" type="number" min="0" />
            </UFormField>
            <UFormField v-if="hasPlacement" name="egcs_tp_beforeentity">
              <UCheckbox v-model="sectionModal.selected.value.egcs_tp_beforeentity" :label="t('custom_fields.before_entity')" />
            </UFormField>
            <CommonSaveButton :label="t('common.save')" :loading="sectionPending.isPending.value" :disabled="sectionWriteBlocked" />
          </fieldset>
        </UForm>
      </template>
    </UModal>
    <UModal v-model:open="assignmentModal.isOpen.value" :title="t('custom_fields.assign_field')">
      <template #body>
        <UForm v-if="assignmentModal.selected.value" v-bind="assignmentFormSession" :disabled="assignmentPending.isPending.value" data-field-scope="transfer-payment.custom-field-assignment" :state="assignmentModal.selected.value" :validate="createValidator(StreamFieldAssignmentCreateSchema.strip())" class="space-y-4">
          <fieldset :disabled="assignmentPending.isPending.value" class="min-w-0 space-y-4">
            <UFormField :label="t('custom_fields.agency_field')" name="egcs_tp_agencyfield" required>
              <CommonServerLookupSelect v-model="assignmentModal.selected.value.egcs_tp_agencyfield" :fetch-url="`${baseUrl}/lookups/custom-fields`" :query="{ target }" :include-deleted-query="false" selected-values-query-key="ids" :exclude-values="(data?.items ?? []).filter(field => field.id !== assignmentModal.selected.value?.egcs_tp_agencyfield).map(field => field.id)" label-en-key="egcs_ay_name_en" label-fr-key="egcs_ay_name_fr" value-key="id" :disabled="Boolean(editingAssignmentId)" />
            </UFormField>
            <UFormField v-if="hasSections" :label="t('custom_fields.section')" name="egcs_tp_section">
              <CommonBilingualSelectMenu v-model="assignmentModal.selected.value.egcs_tp_section" :items="data?.sections ?? []" :prepend-options="[{ label: t('custom_fields.unsectioned'), value: null }]" label-en-key="egcs_tp_name_en" label-fr-key="egcs_tp_name_fr" value-key="id" />
            </UFormField>
            <USwitch v-model="assignmentModal.selected.value.egcs_tp_active" :label="t('custom_fields.active')" data-ui-target="transfer-payment.custom-field-assignment.egcs_tp_active" />
            <UCheckbox v-model="assignmentModal.selected.value.egcs_tp_required" :label="t('custom_fields.required')" data-ui-target="transfer-payment.custom-field-assignment.egcs_tp_required" />
            <UFormField :label="t('custom_fields.order')" name="egcs_tp_displayorder">
              <UInput v-model.number="assignmentModal.selected.value.egcs_tp_displayorder" type="number" min="0" />
            </UFormField>
            <CommonSaveButton :label="t('common.save')" :loading="assignmentPending.isPending.value" :disabled="assignmentWriteBlocked" />
          </fieldset>
        </UForm>
      </template>
    </UModal>
  </div>
</template>
