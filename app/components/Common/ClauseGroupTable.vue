<script setup lang="ts" generic="T extends Pick<AgencyClauseItem, 'id' | 'egcs_ay_name_en' | 'egcs_ay_name_fr' | 'egcs_ay_languageindependentcode' | 'rows'> & Partial<Pick<AgencyClauseItem, 'egcs_ay_active' | 'publicationState' | 'hasUnpublishedChanges'>> & { outOfDate?: boolean }">
import { computed, watch } from 'vue'
import type { AgencyClauseItem, AgencyClauseText } from '~~/shared/types/schemas/agency-clause'
import type { ResourceTableStatus } from '~~/shared/types/resource-table'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { useGroupedDisclosureIds } from '~/composables/useGroupedDisclosureIds'

const { items, tableId, status, canAdd, busy, totalRecords, buttonLabel } = defineProps<{
  items: T[]
  tableId: string
  status: ResourceTableStatus
  canAdd: boolean
  busy: boolean
  totalRecords?: number
  buttonLabel?: string
}>()
const emit = defineEmits<{ add: [], retry: [] }>()
const expanded = defineModel<Record<string, boolean>>('expanded', { default: () => ({}) })
const { t } = useI18n()
const { getBilingualValue } = useBilingualValue()
const name = (group: T) => getBilingualValue(group, 'egcs_ay_name') || group.egcs_ay_languageindependentcode
const search = defineModel<string>('search', { default: '' })
const { getGroupedDisclosureControlsId, getGroupedDisclosureContentId } = useGroupedDisclosureIds()
const pagination = defineModel<{ pageIndex: number, pageSize: number }>('pagination', {
  default: () => ({ pageIndex: 0, pageSize: 10 })
})
const filtered = computed(() => {
  if (totalRecords !== undefined) return items
  const query = search.value.trim().toLocaleLowerCase()
  return items.filter(clause => [
    clause.egcs_ay_languageindependentcode, clause.egcs_ay_name_en, clause.egcs_ay_name_fr
  ].some(value => value.toLocaleLowerCase().includes(query)))
})
type CatalogRow =
  | { kind: 'group', id: string, group: T, children: CatalogRow[] }
  | { kind: 'clause', id: string, group: T, clause: AgencyClauseText }

defineSlots<{ actions(props: { item: CatalogRow }): unknown }>()

const tableRows = computed<CatalogRow[]>(() => (totalRecords !== undefined
  ? items
  : filtered.value.slice(
      pagination.value.pageIndex * pagination.value.pageSize,
      (pagination.value.pageIndex + 1) * pagination.value.pageSize
    )).map(group => ({
  kind: 'group',
  id: group.id,
  group,
  children: [...group.rows].sort((left, right) => left.egcs_ay_displayorder - right.egcs_ay_displayorder)
    .map((clause, index) => ({ kind: 'clause', id: `${group.id}-clause-${clause.id ?? index}`, group, clause }))
})))
const getRowId = (row: CatalogRow) => row.id
const getSubRows = (row: CatalogRow) => row.kind === 'group' ? row.children : undefined
const columns: TableColumnInput<CatalogRow>[] = [
  { id: 'name', headerKey: 'common.name', meta: { class: { td: 'min-w-28 whitespace-normal' } } },
  { id: 'flags', headerKey: 'common.flags', meta: { class: { th: 'w-px whitespace-nowrap', td: 'w-px' } } },
  { id: 'actions', headerKey: 'common.actions', meta: { class: { th: 'w-px whitespace-nowrap', td: 'w-px' } } }
]

watch(search, () => {
  if (totalRecords === undefined) pagination.value.pageIndex = 0
})
watch(filtered, rows => {
  if (totalRecords !== undefined) return
  pagination.value.pageIndex = Math.min(pagination.value.pageIndex, Math.max(0, Math.ceil(rows.length / pagination.value.pageSize) - 1))
})
</script>

<template>
  <CommonResourceLayout
    v-model:search="search"
    v-model:pagination="pagination"
    v-model:expanded="expanded"
    :table-id="tableId"
    :data="tableRows"
    :columns="columns"
    :total-records="totalRecords ?? filtered.length"
    :request-status="status"
    :loading="status === 'pending'"
    :show-button="canAdd"
    :button-label="buttonLabel ?? t('common.add')"
    :button-disabled="busy"
    :get-row-id="getRowId"
    :get-sub-rows="getSubRows"
    :expanded-options="{ autoResetExpanded: false }"
    @add="emit('add')"
    @retry="emit('retry')">
    <template #name-cell="{ row }">
      <div :id="getGroupedDisclosureContentId(row)" class="contents">
        <div v-if="row.original.kind === 'group'" class="flex min-w-0 items-center py-1">
          <CommonGroupedDisclosureButton
            v-if="row.getCanExpand()"
            class="group flex min-w-0 items-center gap-3 text-left"
            :expanded="row.getIsExpanded()"
            :controls="getGroupedDisclosureControlsId(row.id)"
            :label="name(row.original.group)"
            @toggle="row.toggleExpanded()">
            <UIcon :name="row.getIsExpanded() ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-4 shrink-0 text-zinc-400 transition-colors group-hover:text-primary" />
            <CommonBilingualName :name-en="row.original.group.egcs_ay_name_en || name(row.original.group)" :name-fr="row.original.group.egcs_ay_name_fr" />
            <CommonStatusBadge variant="count" size="sm" :label="String(row.subRows.length)" />
          </CommonGroupedDisclosureButton>
          <div v-else class="flex min-w-0 items-center gap-3 pl-7">
            <CommonBilingualName :name-en="row.original.group.egcs_ay_name_en || name(row.original.group)" :name-fr="row.original.group.egcs_ay_name_fr" />
            <CommonStatusBadge variant="count" size="sm" label="0" />
          </div>
        </div>
        <div v-else class="flex min-w-0 items-center gap-3 py-1 pl-7">
          <UIcon name="i-lucide-corner-down-right" class="size-4 shrink-0 text-zinc-400" />
          <CommonBilingualName
            v-if="row.original.clause.egcs_ay_clause_en || row.original.clause.egcs_ay_clause_fr"
            class="min-w-0 whitespace-pre-wrap wrap-anywhere"
            :name-en="row.original.clause.egcs_ay_clause_en"
            :name-fr="row.original.clause.egcs_ay_clause_fr" />
          <span v-else class="text-sm text-muted">{{ t('clauses.clause') }}</span>
        </div>
      </div>
    </template>

    <template #flags-cell="{ row }">
      <div v-if="row.original.kind === 'group'" class="flex flex-wrap items-center gap-1">
        <CommonLifecycleBadge v-if="row.original.group.publicationState" engine="publication" :state="row.original.group.publicationState" />
        <CommonStatusBadge v-if="row.original.group.egcs_ay_active === false" variant="meta" :label="t('clauses.inactive')" />
        <CommonStatusBadge v-if="row.original.group.outOfDate" variant="warning" :label="t('agreement.clauses.out_of_date')" />
        <CommonStatusBadge v-if="row.original.group.publicationState === 'published' && row.original.group.hasUnpublishedChanges" variant="warning" :label="t('clauses.unpublished_changes')" />
      </div>
    </template>

    <template #actions-cell="{ row }">
      <slot name="actions" :item="row.original" />
    </template>
  </CommonResourceLayout>
</template>
