<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc, @stylistic/comma-dangle -- local table helpers; generic Vue arrows need parser disambiguation */
import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import type { Ref } from 'vue'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { useGroupedTableExpansion, type GroupedTableRow } from '~/composables/useGroupedTableExpansion'
import { useTableListState } from '~/composables/useTableListState'
import { useDeleteRequestToast } from '~/composables/useDeleteRequestToast'
import { useCrudModal, useCrudModalPending } from '~/composables/useCrudModal'
import { useActionContext } from '~/composables/useActionContext'
import { useFormSession } from '~/composables/useFormSession'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { AgencyFundingTypeBaseSchema, AgencyFundingSubtypeBaseSchema } from '~~/shared/types/schemas/funding-sources'

type FundingType = {
  id: string
  egcs_ay_name_en: string
  egcs_ay_name_fr: string
  egcs_ay_instacking: boolean
  egcs_ay_incostsharing: boolean
  egcs_ay_active: boolean
}
type FundingSubtype = {
  id: string
  egcs_ay_fundingtype: string
  egcs_ay_name_en: string
  egcs_ay_name_fr: string
  egcs_ay_active: boolean
}
type FundingRow = {
  id: string
  typeGroup: string
  typeId: string
  typeNameEn: string
  typeNameFr: string
  stacking: boolean
  costSharing: boolean
  active: boolean
  subtypeId?: string
  subtypeNameEn: string
  subtypeNameFr: string
  subtypeActive?: boolean
  isPlaceholder: boolean
}
type GroupedFundingRow = GroupedTableRow<FundingRow>
type PaginatedList<T> = { items: T[]; total: number }

const GROUP_COLUMN = 'typeGroup'
const PAGE_SIZE = 100
const { agencyId, canCreate, canUpdate, canDelete } = defineProps<{
  agencyId: string
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
}>()

const { t } = useI18n()
const { getBilingualValue } = useBilingualValue()
const { getGroupedDisclosureControlsId, getGroupedDisclosureContentId } = useGroupedDisclosureIds()
const { createValidator } = useZodI18n()
const { showError } = useApiErrorToast()
const { confirmDeleteWithToast } = useDeleteRequestToast()
const toast = useLocalizedToast()
const { search, pagination } = useTableListState()
const types: Ref<FundingType[]> = ref([])
const subtypes: Ref<FundingSubtype[]> = ref([])
const status: Ref<'idle' | 'pending' | 'success' | 'error'> = ref('idle')
const typeModal = useCrudModal<FundingType>({
  createState: () => ({
    egcs_ay_name_en: '', egcs_ay_name_fr: '', egcs_ay_instacking: false,
    egcs_ay_incostsharing: false, egcs_ay_active: true
  }),
  updateState: item => ({ ...item })
})
const subtypeModal = useCrudModal<FundingSubtype>({
  createState: () => ({ egcs_ay_name_en: '', egcs_ay_name_fr: '', egcs_ay_active: true }),
  updateState: item => ({ ...item })
})
const { selected: selectedType, isOpen: typeModalOpen } = typeModal
const { selected: selectedSubtype, isOpen: subtypeModalOpen } = subtypeModal
const selectedSubtypeTypeId: Ref<string | null> = ref(null)
const typePending = useCrudModalPending(typeModal.captureSession)
const subtypePending = useCrudModalPending(subtypeModal.captureSession)
const savingType = typePending.isPending
const savingSubtype = subtypePending.isPending
type PageContext = { kind: 'active'; agencyId: string } | { kind: 'disposed' }
const pageContext: Ref<PageContext> = shallowRef({ kind: 'active', agencyId })
const ownsContext = (context: PageContext) => context.kind === 'active' && pageContext.value === context
let refreshGeneration = 0
const typeCreateContext = useActionContext({
  identity: [() => agencyId],
  authority: () => canCreate
})
const typeUpdateContext = useActionContext({
  identity: [() => agencyId],
  authority: () => canUpdate,
  eligible: () => types.value.some(row => row.id === selectedType.value?.id)
})
const typeActionContext = () => selectedType.value?.id ? typeUpdateContext : typeCreateContext
const subtypeCreateContext = useActionContext({
  identity: [() => agencyId],
  authority: () => canCreate,
  eligible: () => Boolean(selectedSubtypeTypeId.value) && types.value.some(row => row.id === selectedSubtypeTypeId.value)
})
const subtypeUpdateContext = useActionContext({
  identity: [() => agencyId],
  authority: () => canUpdate,
  eligible: () => subtypes.value.some(row => row.id === selectedSubtype.value?.id) && types.value.some(row => row.id === selectedSubtypeTypeId.value)
})
const subtypeActionContext = () => selectedSubtype.value?.id ? subtypeUpdateContext : subtypeCreateContext
const deleteActionContext = useActionContext({ identity: [() => agencyId], authority: () => canDelete })

const columns: TableColumnInput<FundingRow>[] = [
  { id: GROUP_COLUMN, accessorKey: GROUP_COLUMN, headerKey: 'agency.funding_types.type' },
  { id: 'name', accessorKey: 'subtypeNameEn', headerKey: 'agency.funding_types.type' },
  { id: 'stacking', headerKey: 'agency.funding_types.stacking' },
  { id: 'costSharing', headerKey: 'agency.funding_types.cost_sharing' },
  { id: 'status', headerKey: 'common.status' },
  { id: 'actions', headerKey: 'common.actions' }
]

const getJson = async <T,>(url: string): Promise<T> => {
  const response = await fetch(getClientRequestUrl(url))
  if (!response.ok) await throwFetchResponseError(response)
  return await response.json() as T
}

const getAllTypes = async (id: string): Promise<FundingType[]> => {
  const result: FundingType[] = []
  for (let page = 1; ; page += 1) {
    const response = await getJson<PaginatedList<FundingType>>(`/api/agency/${id}/funding-types?page=${page}&limit=${PAGE_SIZE}`)
    result.push(...response.items)
    if (result.length >= response.total || response.items.length < PAGE_SIZE) return result
  }
}

const refreshForOwner = async (shouldReportError: () => boolean) => {
  const context = pageContext.value
  if (context.kind !== 'active' || !ownsContext(context)) return
  const generation = ++refreshGeneration
  const id = context.agencyId
  try {
    status.value = 'pending'
    const [nextTypes, nextSubtypes] = await Promise.all([
      getAllTypes(id),
      getJson<{ items: FundingSubtype[] }>(`/api/agency/${id}/funding-subtypes`)
    ])
    if (!ownsContext(context) || generation !== refreshGeneration || id !== agencyId) return
    types.value = nextTypes
    subtypes.value = nextSubtypes.items
    status.value = 'success'
  } catch (error: unknown) {
    if (!ownsContext(context) || generation !== refreshGeneration || id !== agencyId) return
    status.value = 'error'
    if (shouldReportError()) showError(error)
  }
}
const refresh = () => refreshForOwner(() => true)

const normalizedSearch = computed(() => search.value.trim().toLowerCase())
const matchesName = (nameEn: string, nameFr: string) =>
  nameEn.toLowerCase().includes(normalizedSearch.value) || nameFr.toLowerCase().includes(normalizedSearch.value)
const subtypesByType = computed(() => {
  const groups = new Map<string, FundingSubtype[]>()
  for (const subtype of subtypes.value) {
    groups.set(subtype.egcs_ay_fundingtype, [...(groups.get(subtype.egcs_ay_fundingtype) ?? []), subtype])
  }
  return groups
})
const filteredTypes = computed(() => types.value.filter(type =>
  !normalizedSearch.value || matchesName(type.egcs_ay_name_en, type.egcs_ay_name_fr)
  || (subtypesByType.value.get(type.id) ?? []).some(subtype => matchesName(subtype.egcs_ay_name_en, subtype.egcs_ay_name_fr))
))
const rows = computed<FundingRow[]>(() => filteredTypes.value.flatMap<FundingRow>(type => {
  const typeMatches = !normalizedSearch.value || matchesName(type.egcs_ay_name_en, type.egcs_ay_name_fr)
  const children = (subtypesByType.value.get(type.id) ?? []).filter(subtype =>
    typeMatches || matchesName(subtype.egcs_ay_name_en, subtype.egcs_ay_name_fr))
  const base = {
    typeGroup: type.id, typeId: type.id, typeNameEn: type.egcs_ay_name_en, typeNameFr: type.egcs_ay_name_fr,
    stacking: type.egcs_ay_instacking, costSharing: type.egcs_ay_incostsharing, active: type.egcs_ay_active
  }
  if (!children.length) return [{
    ...base, id: `placeholder:${type.id}`, subtypeNameEn: '', subtypeNameFr: '', isPlaceholder: true
  }]
  return children.map(subtype => ({
    ...base, id: subtype.id, subtypeId: subtype.id,
    subtypeNameEn: subtype.egcs_ay_name_en, subtypeNameFr: subtype.egcs_ay_name_fr,
    subtypeActive: subtype.egcs_ay_active, isPlaceholder: false
  }))
}))
const {
  expandedRows, grouping, columnVisibility, groupingOptions, expandedOptions,
  getGroupRowId, isGroupRow, getGroupedRowCount, updateExpandedRows
} = useGroupedTableExpansion<FundingRow>({
  rows,
  groups: [{ id: GROUP_COLUMN, getValue: row => row.typeId }],
  isPlaceholder: row => row.isPlaceholder,
  defaultExpanded: false
})
const isTypeRow = (row: GroupedFundingRow) => isGroupRow(row, GROUP_COLUMN)
const typeName = (row: FundingRow) => getBilingualValue({ egcs_ay_name_en: row.typeNameEn, egcs_ay_name_fr: row.typeNameFr }, 'egcs_ay_name', row.typeId)
const subtypeName = (row: FundingRow) => getBilingualValue({ egcs_ay_name_en: row.subtypeNameEn, egcs_ay_name_fr: row.subtypeNameFr }, 'egcs_ay_name', row.subtypeId)
const selectedSubtypeTypeName = computed(() => {
  const type = types.value.find(item => item.id === selectedSubtypeTypeId.value)
  return type ? getBilingualValue(type, 'egcs_ay_name', type.id) : ''
})

const closeType = () => {
  typeModal.close()
}
const closeSubtype = () => {
  subtypeModal.close()
  selectedSubtypeTypeId.value = null
}
const createType = () => {
  typeModal.openCreate()
}
const editType = (id: string) => {
  const type = types.value.find(item => item.id === id)
  if (!canUpdate || !type) return
  typeModal.openUpdate(type)
}
const createSubtype = (typeId: string) => {
  selectedSubtypeTypeId.value = typeId
  subtypeModal.openCreate()
}
const expandType = (typeId: string) => {
  const row = rows.value.find(item => item.typeId === typeId)
  if (!row) return
  const groupId = getGroupRowId(row, 0)
  const current = expandedRows.value === true ? {} : expandedRows.value
  updateExpandedRows({ ...current, [groupId]: true })
}
const editSubtype = (id: string) => {
  const subtype = subtypes.value.find(item => item.id === id)
  if (!canUpdate || !subtype) return
  selectedSubtypeTypeId.value = subtype.egcs_ay_fundingtype
  subtypeModal.openUpdate(subtype)
}
watch(() => agencyId, () => {
  pageContext.value = { kind: 'active', agencyId }
  refreshGeneration += 1
  types.value = []
  subtypes.value = []
  closeType()
  closeSubtype()
  void refresh()
}, { immediate: true, flush: 'sync' })
onScopeDispose(() => {
  pageContext.value = { kind: 'disposed' }
  refreshGeneration += 1
  closeType()
  closeSubtype()
})

const saveJson = async (url: string, method: 'POST' | 'PATCH', body: unknown) => {
  const response = await fetch(getClientRequestUrl(url), {
    method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
  })
  if (!response.ok) await throwFetchResponseError(response)
}
const saveType = async () => {
  const operation = typeActionContext().capture()
  if (!operation?.canDispatch()) return
  const context = pageContext.value
  const session = typeModal.captureSession()
  const state = selectedType.value
  if (context.kind !== 'active' || !ownsContext(context) || session === null || !state) return
  const updating = Boolean(state.id)
  if ((updating ? !canUpdate : !canCreate) || !typePending.begin(session)) return
  let committed = false
  let closed = false
  const ownsFeedback = () => operation.isCurrent() && ownsContext(context) && (
    typeModal.isCurrentSession(session) || (closed && typeModal.isLatestSession(session))
  )
  try {
    await saveJson(`/api/agency/${context.agencyId}/funding-types${updating ? `/${state.id}` : ''}`, updating ? 'PATCH' : 'POST', state)
    committed = true
    if (!operation.isCurrent() || !ownsContext(context)) return
    closed = typeModal.closeSession(session)
    if (ownsFeedback()) {
      toast.add({ title: toast.localized('common.success'), description: toast.localized(updating ? 'common.updated_success' : 'common.added_success'), color: 'success' })
    }
    await refreshForOwner(ownsFeedback)
  } catch (error: unknown) {
    if (!committed && ownsFeedback()) showError(error)
  } finally { typePending.end(session) }
}
const saveSubtype = async () => {
  const operation = subtypeActionContext().capture()
  if (!operation?.canDispatch()) return
  const context = pageContext.value
  const session = subtypeModal.captureSession()
  const state = selectedSubtype.value
  const typeId = selectedSubtypeTypeId.value
  if (context.kind !== 'active' || !ownsContext(context) || session === null || !state || !typeId) return
  const updating = Boolean(state.id)
  if ((updating ? !canUpdate : !canCreate) || !subtypePending.begin(session)) return
  let committed = false
  let closed = false
  const ownsFeedback = () => operation.isCurrent() && ownsContext(context) && (
    subtypeModal.isCurrentSession(session) || (closed && subtypeModal.isLatestSession(session))
  )
  try {
    await saveJson(`/api/agency/${context.agencyId}/funding-types/${typeId}/subtypes${updating ? `/${state.id}` : ''}`, updating ? 'PATCH' : 'POST', state)
    committed = true
    if (!operation.isCurrent() || !ownsContext(context)) return
    closed = subtypeModal.closeSession(session)
    if (closed) selectedSubtypeTypeId.value = null
    if (ownsFeedback()) {
      toast.add({ title: toast.localized('common.success'), description: toast.localized(updating ? 'common.updated_success' : 'common.added_success'), color: 'success' })
    }
    await refreshForOwner(ownsFeedback)
    if (ownsFeedback()) expandType(typeId)
  } catch (error: unknown) {
    if (!committed && ownsFeedback()) showError(error)
  } finally { subtypePending.end(session) }
}
const typeFormSession = useFormSession({ owner: typeModal, action: { kind: 'remote', context: typeActionContext }, submit: saveType })
const subtypeFormSession = useFormSession({ owner: subtypeModal, action: { kind: 'remote', context: subtypeActionContext }, submit: saveSubtype })
const deleteType = async (id: string) => {
  const context = pageContext.value
  await confirmDeleteWithToast(`/api/agency/${agencyId}/funding-types/${id}`, {
    operation: deleteActionContext.capture(),
    target: { id: id, resolve: () => types.value.find(row => row.id === id), eligible: () => canDelete },
    refresh, shouldProceed: () => ownsContext(context) && canDelete,
    confirmOptions: { description: t('agency.delete_confirm') }
  })
}
const deleteSubtype = async (typeId: string, id: string) => {
  const context = pageContext.value
  await confirmDeleteWithToast(`/api/agency/${agencyId}/funding-types/${typeId}/subtypes/${id}`, {
    operation: deleteActionContext.capture(),
    target: { id: id, resolve: () => subtypes.value.find(row => row.id === id), eligible: row => canDelete && row.egcs_ay_fundingtype === typeId },
    refresh, shouldProceed: () => ownsContext(context) && canDelete,
    confirmOptions: { description: t('agency.delete_confirm') }
  })
}
</script>

<template>
  <div class="w-full" data-field-scope="agency.funding-types">
    <CommonResourceLayout
      v-model:search="search" v-model:pagination="pagination"
      :data="rows" :columns="columns" :grouping="grouping" :grouping-options="groupingOptions"
      :expanded-options="expandedOptions" :column-visibility="columnVisibility" :expanded="expandedRows"
      :total-records="rows.length" :request-status="status" :loading="status === 'pending'"
      :button-label="t('agency.funding_types.add_type')" :show-button="canCreate"
      @add="createType" @retry="refresh" @update:expanded="updateExpandedRows">
      <template #name-cell="{ row }">
        <div :id="getGroupedDisclosureContentId(row as GroupedFundingRow)" class="contents">
          <div v-if="isTypeRow(row as GroupedFundingRow)" class="flex items-center gap-3 py-1">
            <CommonGroupedDisclosureButton
              class="group flex min-w-0 items-center gap-3 text-left"
              :expanded="row.getIsExpanded?.() === true"
              :controls="getGroupedDisclosureControlsId(row.id)"
              :label-en="row.original.typeNameEn" :label-fr="row.original.typeNameFr"
              @toggle="row.toggleExpanded?.()">
              <UIcon :name="row.getIsExpanded?.() ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-4 text-zinc-400" />
              <CommonBilingualName :name-en="row.original.typeNameEn" :name-fr="row.original.typeNameFr" />
              <CommonStatusBadge variant="count" size="sm" :label="String(getGroupedRowCount(row as GroupedFundingRow))" />
            </CommonGroupedDisclosureButton>
          </div>
          <div v-else-if="row.original.isPlaceholder" class="flex items-center gap-3 py-3 pl-8 text-sm text-muted">
            <UIcon name="i-lucide-corner-down-right" class="size-4" />
            <span>{{ t('common.no_records') }}</span>
          </div>
          <div v-else class="flex items-center gap-3 py-1 pl-8">
            <UIcon name="i-lucide-corner-down-right" class="size-4 text-zinc-400" />
            <CommonBilingualName :name-en="row.original.subtypeNameEn" :name-fr="row.original.subtypeNameFr" />
          </div>
        </div>
      </template>
      <template #stacking-cell="{ row }">
        <span v-if="isTypeRow(row as GroupedFundingRow)">{{ row.original.stacking ? t('common.yes') : t('common.no') }}</span>
      </template>
      <template #costSharing-cell="{ row }">
        <span v-if="isTypeRow(row as GroupedFundingRow)">{{ row.original.costSharing ? t('common.yes') : t('common.no') }}</span>
      </template>
      <template #status-cell="{ row }">
        <CommonStatusBadge
          v-if="isTypeRow(row as GroupedFundingRow) || !row.original.isPlaceholder"
          :variant="row.original.active && (isTypeRow(row as GroupedFundingRow) || row.original.subtypeActive !== false) ? 'enabled' : 'disabled'" />
      </template>
      <template #actions-cell="{ row }">
        <div class="flex items-center justify-end gap-2">
          <template v-if="isTypeRow(row as GroupedFundingRow)">
            <CommonActionButton
              v-if="canCreate" icon="i-lucide-plus" color="primary" variant="ghost" size="sm"
              :aria-label="t('agency.funding_types.add_subtype_for', { name: typeName(row.original) })"
              @click="createSubtype(row.original.typeId)" />
            <CommonActionButton
              v-if="canUpdate" icon="i-lucide-edit-3" color="neutral" variant="ghost" size="sm"
              :aria-label="t('common.edit')" @click="editType(row.original.typeId)" />
            <CommonActionButton
              v-if="canDelete" icon="i-lucide-trash" color="error" variant="ghost" size="sm"
              :aria-label="t('common.delete_named', { name: typeName(row.original) })" @click="deleteType(row.original.typeId)" />
          </template>
          <template v-else-if="!row.original.isPlaceholder && row.original.subtypeId">
            <CommonActionButton
              v-if="canUpdate" icon="i-lucide-edit-3" color="neutral" variant="ghost" size="sm"
              :aria-label="t('common.edit')" @click="editSubtype(row.original.subtypeId)" />
            <CommonActionButton
              v-if="canDelete" icon="i-lucide-trash" color="error" variant="ghost" size="sm"
              :aria-label="t('common.delete_named', { name: subtypeName(row.original) })"
              @click="deleteSubtype(row.original.typeId, row.original.subtypeId)" />
          </template>
        </div>
      </template>
      <template #footer-left>
        {{ types.length }} {{ t('common.records') }}
        <span class="mx-2 text-zinc-300 dark:text-zinc-700">/</span>
        {{ subtypes.length }} {{ t('agency.funding_types.subtypes') }}
      </template>
    </CommonResourceLayout>

    <UModal v-if="selectedType" v-model:open="typeModalOpen" :title="t('agency.funding_types.type')">
      <template #body>
        <UForm v-bind="typeFormSession" data-field-scope="agency.funding-type" :state="selectedType" :validate="createValidator(AgencyFundingTypeBaseSchema)" :validate-on="[]" class="space-y-4">
          <UFormField :label="t('agency.name_en')" name="egcs_ay_name_en" required>
            <UInput v-model="selectedType.egcs_ay_name_en" />
          </UFormField>
          <UFormField :label="t('agency.name_fr')" name="egcs_ay_name_fr" required>
            <UInput v-model="selectedType.egcs_ay_name_fr" />
          </UFormField>
          <UFormField name="egcs_ay_instacking">
            <USwitch v-model="selectedType.egcs_ay_instacking" :label="t('agency.funding_types.stacking')" />
          </UFormField>
          <UFormField name="egcs_ay_incostsharing">
            <USwitch v-model="selectedType.egcs_ay_incostsharing" :label="t('agency.funding_types.cost_sharing')" />
          </UFormField>
          <div class="flex justify-end gap-2 pt-4">
            <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="closeType" />
            <CommonSaveButton :label="t(selectedType.id ? 'common.update' : 'common.add')" :loading="savingType" :disabled="savingType" />
          </div>
        </UForm>
      </template>
    </UModal>
    <UModal v-if="selectedSubtype" v-model:open="subtypeModalOpen" :title="t('agency.funding_types.subtypes_for', { name: selectedSubtypeTypeName })">
      <template #body>
        <UForm v-bind="subtypeFormSession" data-field-scope="agency.funding-subtype" :state="selectedSubtype" :validate="createValidator(AgencyFundingSubtypeBaseSchema)" :validate-on="[]" class="space-y-4">
          <UFormField :label="t('agency.name_en')" name="egcs_ay_name_en" required>
            <UInput v-model="selectedSubtype.egcs_ay_name_en" />
          </UFormField>
          <UFormField :label="t('agency.name_fr')" name="egcs_ay_name_fr" required>
            <UInput v-model="selectedSubtype.egcs_ay_name_fr" />
          </UFormField>
          <div class="flex justify-end gap-2 pt-4">
            <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="closeSubtype" />
            <CommonSaveButton :label="t(selectedSubtype.id ? 'common.update' : 'common.add')" :loading="savingSubtype" :disabled="savingSubtype" />
          </div>
        </UForm>
      </template>
    </UModal>
  </div>
</template>
