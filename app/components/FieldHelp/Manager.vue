<script setup lang="ts">
import { useActionContext } from '~/composables/useActionContext'
import { useGuidedHelpRequestOwner } from '~/composables/useGuidedHelpRequestOwner'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getGroupedRowModel } from '@tanstack/vue-table'
import type { ExpandedState } from '@tanstack/vue-table'
import type { FieldTooltipItem, FieldTooltipList } from '~~/shared/types/schemas/field-tooltip'
import type { HelpOption } from '~/utils/guided-help-client'
import { helpRequest } from '~/utils/guided-help-client'
import type { TableColumnInput } from '~/composables/useTableColumns'

type AgencyGroup = HelpOption & { catalog: FieldTooltipList | null; status: 'idle' | 'pending' | 'success' | 'error' }
type FieldRow = { id: string; agency: string; name: HelpOption['name']; item: FieldTooltipItem | null }
type FieldEditor = { agencyId: string; edit: (item: FieldTooltipItem | null) => void; remove: (item: FieldTooltipItem) => Promise<void> }
const { t, locale } = useI18n()
const { can } = useCan()
const actorContext = useActionContext({ identity: [], authority: true })
const { showError } = useApiErrorToast()
const { getGroupedDisclosureControlsId, getGroupedDisclosureContentId } = useGroupedDisclosureIds()
const groups = ref<AgencyGroup[]>([])
const initialization = useGuidedHelpRequestOwner<'initialize'>()
const editorSelection = useGuidedHelpRequestOwner<'select'>()
const loading = initialization.pending
const failed = computed(() => initialization.status.value === 'error')
const search = ref('')
const agencyFilter = ref('all')
const screenFilter = ref('all')
const statusFilter = ref('all')
const pagination = ref({ pageIndex: 0, pageSize: 10 })
const expanded = ref<ExpandedState>({})
const editor = ref<FieldEditor[]>([])
const openedEditors = ref<AgencyGroup[]>([])
const groupRequests = new Map<string, ReturnType<typeof useGuidedHelpRequestOwner<'load'>>>()
const catalogRequests = new Map<string, Promise<void>>()
const label = (name: HelpOption['name']) => name[locale.value === 'fr' ? 'fr' : 'en']
const fieldNames = (group: AgencyGroup, item: FieldTooltipItem) => group.catalog?.targets.find(target => target.key === item.egcs_ay_targetkey)?.label ?? { en: item.egcs_ay_label_en, fr: item.egcs_ay_label_fr }
const screenNames = (group: AgencyGroup, item: FieldTooltipItem) => group.catalog?.targets.find(target => target.key === item.egcs_ay_targetkey)?.viewLabel ?? { en: item.egcs_ay_screen_en, fr: item.egcs_ay_screen_fr }
const status = (item: FieldTooltipItem) => item.availability === 'available' ? item.egcs_ay_enabled ? 'enabled' : 'disabled' : item.availability
const groupFor = (row: FieldRow) => groups.value.find(group => group.id === row.agency)!
const screenKey = (group: AgencyGroup, item: FieldTooltipItem) => JSON.stringify(screenNames(group, item))
const agencyOptions = computed(() => [{ value: 'all', label: t('field_tooltips.all_agencies') }, ...groups.value.map(group => ({ value: group.id, label: label(group.name) }))])
const screenOptions = computed(() => {
  const screens = groups.value.flatMap(group => (group.catalog?.items ?? []).map(item => [
    screenKey(group, item), { value: screenKey(group, item), label: label(screenNames(group, item)) }
  ] as const))
  return [
    { value: 'all', label: t('field_tooltips.all_screens') },
    ...Array.from(new Map(screens).values()).sort((left, right) => left.label.localeCompare(right.label, locale.value))
  ]
})
const statusOptions = computed(() => [
  { value: 'all', label: t('common.all_statuses') },
  ...['enabled', 'disabled', 'unavailable', 'extension_disabled'].map(value => ({ value, label: t(`field_tooltips.status.${value}`) }))
])
/**
 * Filters an owner’s current catalog using the shared toolbar.
 * @param group - Explicit Agency owner.
 * @returns Matching tooltip entries.
 */
const matchingItems = (group: AgencyGroup) => {
  const query = search.value.trim().toLocaleLowerCase()
  return (group.catalog?.items ?? []).filter(item =>
    (screenFilter.value === 'all' || screenFilter.value === screenKey(group, item)) &&
    (statusFilter.value === 'all' || statusFilter.value === status(item)) &&
    (!query || [...Object.values(group.name), ...Object.values(fieldNames(group, item)), ...Object.values(screenNames(group, item))]
      .some(value => value.toLocaleLowerCase().includes(query)))
  )
}
const filteredGroups = computed(() => groups.value.filter(group => {
  if (agencyFilter.value !== 'all' && group.id !== agencyFilter.value) return false
  const query = search.value.trim().toLocaleLowerCase()
  if (!query && screenFilter.value === 'all' && statusFilter.value === 'all') return true
  if (!group.catalog || matchingItems(group).length) return true
  return screenFilter.value === 'all' && statusFilter.value === 'all' &&
    Object.values(group.name).some(value => value.toLocaleLowerCase().includes(query))
}))
const rows = computed<FieldRow[]>(() => filteredGroups.value.slice(pagination.value.pageIndex * pagination.value.pageSize, (pagination.value.pageIndex + 1) * pagination.value.pageSize).flatMap(group => {
  const items = matchingItems(group)
  return (items.length ? items : [null]).map(item => ({ id: `${group.id}:${item?.id ?? 'empty'}`, agency: group.id, name: group.name, item }))
}))
const columns: TableColumnInput<FieldRow>[] = [{ id: 'agency', accessorKey: 'agency', headerKey: 'field_tooltips.agency' }, { id: 'field', headerKey: 'field_tooltips.field' }, { id: 'screen', headerKey: 'field_tooltips.screen' }, { id: 'status', headerKey: 'common.status' }, { id: 'actions', headerKey: 'common.actions' }]
/**
 * Loads each owner's catalog independently so one failure can be retried.
 * @param group - Explicit Agency owner.
 */
const fetchGroup = async (group: AgencyGroup) => {
  const operation = actorContext.capture()
  if (!operation?.canDispatch()) return
  const owner = useGuidedHelpRequestOwner<'load'>()
  groupRequests.set(group.id, owner)
  const request = owner.begin('load')
  if (!request) return
  group.status = 'pending'
  try {
    const catalog = await helpRequest<FieldTooltipList>(`/api/agency/${group.id}/tooltips`)
    if (operation.isCurrent() && owner.succeed(request)) {
      group.catalog = catalog
      group.status = 'success'
    }
  } catch (error) {
    if (operation.isCurrent() && owner.fail(request, error)) {
      group.status = 'error'
      showError(error)
    }
  }
}
/**
 * Reuses an in-flight load when expansion and editing request the same owner.
 * @param group - Explicit Agency owner.
 * @returns Catalog load completion.
 */
const loadGroup = (group: AgencyGroup): Promise<void> => {
  if (initialization.status.value === 'disposed' || !groups.value.includes(group)) return Promise.resolve()
  if (group.catalog && group.status !== 'error') return Promise.resolve()
  const pending = catalogRequests.get(group.id)
  if (pending) return pending
  const request = fetchGroup(group).finally(() => {
    if (catalogRequests.get(group.id) === request) catalogRequests.delete(group.id)
  })
  catalogRequests.set(group.id, request)
  return request
}
/** Loads only authorized Help owner groups. */
const initialize = async () => {
  const operation = actorContext.capture()
  if (!operation?.canDispatch()) return
  const request = initialization.begin('initialize')
  if (!request) return
  editorSelection.reset()
  openedEditors.value = []
  for (const owner of groupRequests.values()) owner.dispose()
  groupRequests.clear()
  catalogRequests.clear()
  groups.value = []
  try {
    const result = await helpRequest<{ items: HelpOption[] }>('/api/guided-help/contexts')
    if (operation.isCurrent() && initialization.succeed(request)) {
      groups.value = result.items.map(group => ({ ...group, catalog: null, status: 'idle' }))
      loadFilteredGroups()
    }
  } catch (error) {
    if (operation.isCurrent() && initialization.fail(request, error)) showError(error)
  }
}
/**
 * Retires collection reads superseded by a committed editor readback.
 * @param group - Agency whose catalog the editor owns.
 */
const retireGroupRead = (group: AgencyGroup) => {
  groupRequests.get(group.id)?.dispose()
  groupRequests.delete(group.id)
  catalogRequests.delete(group.id)
}
/**
 * Accepts committed editor evidence ahead of older collection reads.
 * @param group - Agency owning the readback.
 * @param catalog - Current readback evidence.
 */
const acceptCatalog = (group: AgencyGroup, catalog: FieldTooltipList) => {
  retireGroupRead(group)
  group.catalog = catalog
  group.status = 'success'
}
/**
 * Keeps failed readback recovery visible until a new explicit GET settles.
 * @param group - Agency owning the readback failure.
 */
const failCatalog = (group: AgencyGroup) => {
  retireGroupRead(group)
  group.status = 'error'
}
const toggle = (row: { original: FieldRow; getIsExpanded: () => boolean; toggleExpanded: () => void }) => {
  if (!row.getIsExpanded()) void loadGroup(groupFor(row.original))
  row.toggleExpanded()
}
/**
 * Opens the existing editor at the row's explicit Agency owner.
 * @param row - Owner and optional tooltip.
 */
const edit = async (row: FieldRow) => {
  const request = editorSelection.begin('select')
  if (!request) return
  const group = groupFor(row)
  await loadGroup(group)
  if (!group.catalog || !editorSelection.isCurrent(request)) return
  if (!openedEditors.value.includes(group)) openedEditors.value.push(group)
  await nextTick()
  if (editorSelection.isCurrent(request)) editor.value.find(instance => instance.agencyId === group.id)?.edit(row.item)
}
/**
 * Deletes through the existing owner-scoped confirmation.
 * @param row - Tooltip owner and identity.
 */
const remove = async (row: FieldRow) => {
  if (!row.item) return
  const request = editorSelection.begin('select')
  if (!request) return
  const group = groupFor(row)
  if (!openedEditors.value.includes(group)) openedEditors.value.push(group)
  await nextTick()
  if (editorSelection.isCurrent(request)) await editor.value.find(instance => instance.agencyId === group.id)?.remove(row.item)
}
/** Loads unopened owners when the shared filters need their entries. */
const loadFilteredGroups = () => {
  if (search.value.trim() || screenFilter.value !== 'all' || statusFilter.value !== 'all') {
    for (const group of groups.value) void loadGroup(group)
    expanded.value = Object.fromEntries(groups.value.map(group => [`agency:${group.id}`, true]))
  }
}
watch([search, agencyFilter, screenFilter, statusFilter], () => {
  pagination.value.pageIndex = 0
  loadFilteredGroups()
})
watch(() => [filteredGroups.value.length, pagination.value.pageSize], () => {
  pagination.value.pageIndex = Math.min(pagination.value.pageIndex, Math.max(0, Math.ceil(filteredGroups.value.length / pagination.value.pageSize) - 1))
})
watch(actorContext.version, () => {
  void initialize()
}, { flush: 'sync' })
onMounted(initialize)
onBeforeUnmount(() => {
  for (const owner of groupRequests.values()) owner.dispose()
  groupRequests.clear()
  catalogRequests.clear()
})
</script>

<template>
  <CommonResourceLayout
    v-model:search="search" v-model:pagination="pagination" v-model:expanded="expanded" layout="page"
    :data="rows" :columns="columns" :total-records="filteredGroups.length" :loading="loading" :show-button="false"
    :request-status="loading ? 'pending' : failed ? 'error' : 'success'" :grouping="['agency']" :grouping-options="{ getGroupedRowModel: getGroupedRowModel() }"
    :column-visibility="{ agency: false }" :get-row-id="(row: FieldRow) => row.id" :expanded-options="{ autoResetExpanded: false }" @retry="initialize">
    <template #filters>
      <USelect v-model="agencyFilter" :items="agencyOptions" :required="false" :aria-required="false" :aria-label="t('field_tooltips.agency')" data-field-exclude="Help administration agency quick filter" class="w-full sm:w-64" />
      <USelect v-model="screenFilter" :items="screenOptions" :required="false" :aria-required="false" :aria-label="t('field_tooltips.screen')" data-field-exclude="Help administration screen quick filter" class="w-full sm:w-48" />
      <USelect v-model="statusFilter" :items="statusOptions" :required="false" :aria-required="false" :aria-label="t('common.status')" data-field-exclude="Help administration status quick filter" class="w-full sm:w-48" />
    </template>
    <template #field-cell="{ row }">
      <div :id="getGroupedDisclosureContentId(row)" class="contents">
        <CommonGroupedDisclosureButton v-if="row.getIsGrouped()" class="group flex min-w-0 items-center gap-3 py-1 text-left" :expanded="row.getIsExpanded()" :controls="getGroupedDisclosureControlsId(row.id)" :label-en="row.original.name.en" :label-fr="row.original.name.fr" @toggle="toggle(row)">
          <UIcon :name="row.getIsExpanded() ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-4 shrink-0 text-zinc-400" />
          <CommonEntityTypeBadge type="agency" icon="i-lucide-building-2" :label-en="row.original.name.en" :label-fr="row.original.name.fr" interactive />
          <CommonStatusBadge v-if="groupFor(row.original).catalog" variant="count" size="sm" :label="String(row.subRows.filter((item: { original: FieldRow }) => item.original.item).length)" />
          <UIcon v-if="groupFor(row.original).status === 'pending'" name="i-lucide-loader-circle" class="size-4 animate-spin text-muted" />
        </CommonGroupedDisclosureButton>
        <span v-else-if="row.original.item" class="pl-6">{{ label(fieldNames(groupFor(row.original), row.original.item)) }}</span>
        <p v-else class="pl-12 text-sm text-muted">
          {{ t(groupFor(row.original).status === 'pending' ? 'common.loading' : groupFor(row.original).status === 'error' ? 'common.load_failed' : 'common.no_records') }}
        </p>
      </div>
    </template>
    <template #screen-cell="{ row }">
      <span v-if="!row.getIsGrouped() && row.original.item">{{ label(screenNames(groupFor(row.original), row.original.item)) }}</span>
    </template>
    <template #status-cell="{ row }">
      <UBadge v-if="!row.getIsGrouped() && row.original.item" :color="row.original.item.availability === 'available' ? 'neutral' : 'warning'" variant="subtle" :label="t(`field_tooltips.status.${status(row.original.item)}`)" />
    </template>
    <template #actions-cell="{ row }">
      <div class="flex justify-end gap-2">
        <template v-if="row.getIsGrouped()">
          <CommonActionButton v-if="can('help', 'create', { type: 'agency', agencyId: row.original.agency })" icon="i-lucide-plus" color="primary" variant="ghost" :aria-label="t('field_tooltips.add_in', { name: label(row.original.name) })" @click="edit({ ...row.original, item: null })" />
          <CommonActionButton v-if="groupFor(row.original).status === 'error'" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :aria-label="t('common.retry')" @click="loadGroup(groupFor(row.original))" />
        </template>
        <template v-else-if="row.original.item">
          <CommonActionButton icon="i-lucide-pencil" color="neutral" variant="ghost" :aria-label="`${t(groupFor(row.original).catalog?.capabilities.canEdit ? 'common.edit' : 'field_tooltips.inspect')}: ${label(fieldNames(groupFor(row.original), row.original.item))}`" @click="edit(row.original)" />
          <CommonActionButton v-if="groupFor(row.original).catalog?.capabilities.canDelete" icon="i-lucide-trash" color="error" variant="ghost" :aria-label="`${t('common.delete')}: ${label(fieldNames(groupFor(row.original), row.original.item))}`" @click="remove(row.original)" />
        </template>
      </div>
    </template>
    <template #footer-left>
      {{ t('field_tooltips.agencies', filteredGroups.length) }}
    </template>
  </CommonResourceLayout>
  <AgencyFieldHelp v-for="group in openedEditors" :key="group.id" ref="editor" :agency-id="group.id" editor-only :initial-catalog="group.catalog ?? undefined" @loaded="catalog => acceptCatalog(group, catalog)" @load-failed="failCatalog(group)" />
</template>

<style scoped>
:deep(td[data-slot='td'][colspan]) { padding-top: 0; padding-bottom: 0; }
</style>
