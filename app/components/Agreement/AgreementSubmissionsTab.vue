<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { $Fetch } from 'ofetch'
import { agreementSubmissionLocation } from '~/utils/agreement-submission-location'
import type { useAgreementSubmissionCollection } from '~/composables/useAgreementSubmissionCollection'
import { useGroupedTableExpansion } from '~/composables/useGroupedTableExpansion'
import { useTableListState } from '~/composables/useTableListState'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { useResourceRequest } from '~/composables/useResourceRequest'
import { PositivePostgresBigintIdSchema } from '~~/shared/types/schemas/common'
import type {
  AgreementSubmissionDetail,
  AgreementSubmissionListItem, AgreementSubmissionState, SubmissionEventSummary
} from '~~/shared/types/agreement-submission'

const { agreementId, owner } = defineProps<{
  agreementId: string
  owner: ReturnType<typeof useAgreementSubmissionCollection>
}>()
const route = useRoute()
const localePath = useLocalePath()
const { t, locale } = useI18n()
const eventDate = computed(() => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }))
const fetchJson: $Fetch = $fetch as $Fetch
const { collection, identity, apiPath } = owner
const { search, pagination } = useTableListState()
const TARGET_GROUP = 'target'
const ITEM_GROUP = 'item'
type SubmissionTableRow = {
  id: string
  target: AgreementSubmissionListItem['egcs_fc_target']
  item: string
  submission: AgreementSubmissionListItem
  event: SubmissionEventSummary | null
}
const FISCAL_MONTHS = ['apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec', 'jan', 'feb', 'mar'] as const
const { getGroupedDisclosureControlsId, getGroupedDisclosureContentId } = useGroupedDisclosureIds()
const columns: TableColumnInput<SubmissionTableRow>[] = [
  { id: TARGET_GROUP, accessorKey: TARGET_GROUP, headerKey: 'submission.destination', enableHiding: false },
  { id: ITEM_GROUP, accessorKey: ITEM_GROUP, headerKey: 'submission.record', enableHiding: false },
  { id: 'record', headerKey: 'submission.record', enableHiding: false },
  { id: 'reference', headerKey: 'submission.reference' },
  { id: 'status', headerKey: 'submission.status' },
  { id: 'actions', headerKey: 'common.actions' }
]
/**
 * Formats the recorded Claim period using the Agreement fiscal month order.
 * @param item - Submission list record.
 * @returns The localized period, or null when it does not apply.
 */
const periodLabel = (item: AgreementSubmissionListItem) => {
  if (!item.claimPeriod) return null
  const { start, end } = item.claimPeriod
  return `${t(`agreement.claims.months.${FISCAL_MONTHS[start]}`)} – ${t(`agreement.claims.months.${FISCAL_MONTHS[end]}`)}`
}
/**
 * Labels the native record with its ID, fiscal year, and applicable period.
 * @param item - Submission linked to the native record.
 * @returns The record label.
 */
const recordLabel = (item: AgreementSubmissionListItem) => [
  item.egcs_fc_result ? `#${item.egcs_fc_result}` : t('common.unavailable'),
  item.fiscalYearDisplay,
  periodLabel(item)
].filter(Boolean).join(' · ')
const filteredItems = computed(() => {
  const query = search.value.trim().toLowerCase()
  return (collection.data.value?.items ?? []).filter(item => [
    item.egcs_fc_sourceid,
    item.egcs_fc_sourcesystem,
    item.egcs_fc_result ?? '',
    item.fiscalYearDisplay ?? '',
    periodLabel(item) ?? '',
    t(`submission.target.${item.egcs_fc_target}`),
    t(`submission.state.${item.egcs_fc_state}`),
    ...item.events.flatMap(event => [
      t(`submission.event.${event.egcs_fc_kind}`),
      event.egcs_fc_sourcerevision
    ])
  ].some(value => value.toLowerCase().includes(query)))
})
const pageItems = computed(() => {
  const { pageIndex, pageSize } = pagination.value
  return filteredItems.value.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize)
    .flatMap((submission): SubmissionTableRow[] => {
      const item = submission.egcs_fc_result ?? submission.id
      const events = submission.events.length ? submission.events : [null]
      return events.map(event => ({
        id: event ? `event-${event.id}` : `submission-${submission.id}`,
        target: submission.egcs_fc_target,
        item,
        submission,
        event
      }))
    })
})
const {
  expandedRows,
  grouping,
  columnVisibility,
  groupingOptions,
  expandedOptions,
  getGroupedRowCount,
  updateExpandedRows
} = useGroupedTableExpansion({
  rows: pageItems,
  defaultExpanded: false,
  isPlaceholder: row => row.event === null,
  groups: [
    { id: TARGET_GROUP, getValue: row => row.target },
    { id: ITEM_GROUP, getValue: row => row.item }
  ]
})
watch(search, () => {
  pagination.value = { ...pagination.value, pageIndex: 0 }
})
watch(() => filteredItems.value.length, count => {
  const lastPage = Math.max(0, Math.ceil(count / pagination.value.pageSize) - 1)
  if (pagination.value.pageIndex > lastPage) {
    pagination.value = { ...pagination.value, pageIndex: lastPage }
  }
})
const selectedId = computed(() => {
  const id = PositivePostgresBigintIdSchema.safeParse(route.query.submission)
  return id.success ? id.data : null
})
const workspace = ref<HTMLElement | null>(null)
const listLocation = computed(() => ({
  path: route.path,
  query: Object.fromEntries(Object.entries(route.query).filter(([key]) => key !== 'submission'))
}))
watch(selectedId, async (selection, previous) => {
  if (!selection && !previous) return
  await nextTick()
  if (selectedId.value === selection) workspace.value?.focus()
}, { immediate: true, flush: 'post' })

const states: Record<AgreementSubmissionState, 'neutral' | 'info' | 'warning' | 'success'> = {
  submitted: 'neutral', reviewing: 'info', returned: 'warning', proponent_editing: 'warning', accepted: 'success'
}
const selectionIdentity = computed(() => JSON.stringify([identity.value, selectedId.value]))

/**
 * Resolves the link to the financial record or saved submission history.
 * @param item Selected Submission.
 * @returns The localized destination.
 */
const destination = (item: AgreementSubmissionListItem) => localePath(agreementSubmissionLocation({
  id: item.id, agreementId, targetId: item.targetAvailable ? item.egcs_fc_result : null, target: item.egcs_fc_target
}))
type Selection =
  | { kind: 'list' }
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'history' }
  | { kind: 'linked'; item: AgreementSubmissionListItem }
const selection = computed<Selection>(() => {
  const id = selectedId.value
  if (!id) return { kind: 'list' }
  const item = collection.data.value?.items.find(item => item.id === id)
  if (!item) return { kind: collection.status.value === 'success' ? 'missing' : 'loading' }
  return item.targetAvailable ? { kind: 'linked', item } : { kind: 'history' }
})
const evidence = useResourceRequest<AgreementSubmissionDetail>({
  identity: selectionIdentity,
  enabled: () => selection.value.kind === 'history',
  load: signal => fetchJson<AgreementSubmissionDetail>(`${apiPath.value}/${selectedId.value}`, { signal })
})
watch(selection, current => {
  if (current.kind === 'linked' && collection.status.value === 'success') {
    void navigateTo(destination(current.item), { replace: true })
  }
}, { immediate: true })

/**
 * Refreshes the collection after a committed review or via the retry button.
 * @returns Whether the request established current results.
 */
const refresh = () => collection.refresh()
</script>

<template>
  <section ref="workspace" tabindex="-1" :aria-label="t('submission.title')" class="w-full min-w-0 scroll-mt-20 space-y-8">
    <template v-if="selection.kind === 'list'">
      <CommonLoadingState v-if="collection.status.value === 'pending' && !collection.data.value" :label="t('common.loading')" />
      <CommonErrorNotice v-if="collection.error.value" :title="t('submission.list_failed')">
        <template #actions>
          <UButton color="error" variant="outline" @click="refresh">
            {{ t('common.retry') }}
          </UButton>
        </template>
      </CommonErrorNotice>
      <CommonResourceLayout
        v-if="collection.data.value"
        v-model:search="search"
        v-model:pagination="pagination"
        table-id="agreement.submissions"
        :data="pageItems"
        :columns="columns"
        :grouping="grouping"
        :grouping-options="groupingOptions"
        :column-visibility="columnVisibility"
        :expanded="expandedRows"
        :expanded-options="expandedOptions"
        :total-records="filteredItems.length"
        :show-button="false"
        @update:expanded="updateExpandedRows">
        <template #record-cell="{ row }">
          <div :id="getGroupedDisclosureContentId(row)" class="contents">
            <CommonGroupedDisclosureButton
              v-if="row.getIsGrouped()"
              class="group flex min-w-0 items-center gap-3 py-1 text-left"
              :class="{ 'pl-6': row.depth === 1 }"
              :expanded="row.getIsExpanded()"
              :controls="getGroupedDisclosureControlsId(row.id)"
              :label="row.depth === 0 ? t(`submission.target.${row.original.target}`) : recordLabel(row.original.submission)"
              @toggle="row.toggleExpanded()">
              <UIcon
                :name="row.getIsExpanded() ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                class="size-4 shrink-0 text-zinc-400 transition-colors group-hover:text-primary" />
              <CommonEntityTypeBadge
                v-if="row.depth === 0"
                :type="row.original.submission.egcs_fc_resulttype"
                :label-en="t(`submission.target.${row.original.target}`)"
                :label-fr="t(`submission.target.${row.original.target}`)"
                :icon="row.original.target === 'claim' ? 'i-lucide-receipt-text' : 'i-lucide-chart-column'"
                interactive />
              <span v-else class="text-sm font-semibold">{{ recordLabel(row.original.submission) }}</span>
              <CommonStatusBadge
                variant="count"
                size="sm"
                :label="String(row.depth === 0 ? row.subRows.length : getGroupedRowCount(row))" />
            </CommonGroupedDisclosureButton>
            <div v-else-if="row.original.event" class="flex items-start gap-3 py-1 pl-12">
              <UIcon name="i-lucide-corner-down-right" class="size-4 shrink-0 text-zinc-400" />
              <div class="min-w-0 [overflow-wrap:anywhere]">
                <span class="font-medium">{{ t(`submission.event.${row.original.event.egcs_fc_kind}`) }}</span>
                <div class="flex flex-wrap gap-x-2 text-xs text-muted">
                  <span v-if="row.original.event.egcs_fc_kind === 'received'">
                    {{ t('submission.source_revision', { revision: row.original.event.egcs_fc_sourcerevision }) }}
                  </span>
                  <span v-else-if="row.original.event.actorName">{{ row.original.event.actorName }}</span>
                  <time :datetime="row.original.event.egcs_fc_createdat">
                    {{ eventDate.format(new Date(row.original.event.egcs_fc_createdat)) }}
                  </time>
                </div>
                <p v-if="row.original.event.egcs_fc_description" class="text-xs text-muted">
                  {{ row.original.event.egcs_fc_description }}
                </p>
              </div>
            </div>
            <span v-else class="pl-12 text-sm text-muted">{{ t('common.no_data') }}</span>
          </div>
        </template>
        <template #reference-cell="{ row }">
          <div v-if="row.depth === 1" class="[overflow-wrap:anywhere]">
            <span class="font-medium">{{ row.original.submission.egcs_fc_sourceid }}</span>
            <span class="block text-xs text-muted">{{ row.original.submission.egcs_fc_sourcesystem }}</span>
          </div>
        </template>
        <template #status-cell="{ row }">
          <UBadge v-if="row.depth === 1" :color="states[row.original.submission.egcs_fc_state]" variant="subtle">
            {{ t(`submission.state.${row.original.submission.egcs_fc_state}`) }}
          </UBadge>
        </template>
        <template #actions-cell="{ row }">
          <div v-if="row.depth === 1" class="flex items-center justify-end">
            <CommonActionButton
              :to="destination(row.original.submission)"
              record-action="open"
              color="neutral"
              variant="ghost"
              :aria-label="t('submission.open_named', { name: row.original.submission.egcs_fc_sourceid })" />
          </div>
        </template>
        <template v-if="collection.data.value.items.length === 0" #empty>
          {{ t('submission.empty') }}
        </template>
      </CommonResourceLayout>
    </template>
    <div v-else class="space-y-6">
      <UButton :to="listLocation" variant="ghost" color="neutral" icon="i-lucide-arrow-left">
        {{ t('submission.back_to_list') }}
      </UButton>
      <CommonErrorNotice v-if="collection.error.value" :title="t('submission.list_failed')">
        <template #actions>
          <UButton color="error" variant="outline" @click="refresh">
            {{ t('common.retry') }}
          </UButton>
        </template>
      </CommonErrorNotice>
      <template v-if="selection.kind === 'history' && !collection.error.value">
        <CommonErrorNotice v-if="evidence.error.value" :title="t('submission.detail_failed')">
          <template #actions>
            <UButton color="error" variant="outline" @click="evidence.refresh">
              {{ t('common.retry') }}
            </UButton>
          </template>
        </CommonErrorNotice>
        <CommonLoadingState v-else-if="!evidence.data.value" :label="t('common.loading')" />
        <AgreementSubmissionHistory
          v-else
          :events="evidence.data.value.events"
          :target="evidence.data.value.submission.egcs_fc_target"
          :source="evidence.data.value.submission.egcs_fc_sourcesystem" />
      </template>
      <p v-else-if="selection.kind === 'missing'" role="status" class="text-sm text-muted">
        {{ t('submission.errors.not_found') }}
      </p>
      <CommonLoadingState v-else-if="!collection.error.value" :label="t('common.loading')" />
    </div>
  </section>
</template>
