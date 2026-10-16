<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { getGroupedRowModel } from '@tanstack/vue-table'
import type { ExpandedState } from '@tanstack/vue-table'
import type { GuideDraft } from '@gcs-ssc/guided-help/contracts'
import type { HelpCatalog, HelpGuide } from '~/utils/guided-help-client'
import type { PublisherGroup } from '~/utils/guided-help-publisher'
import type { PublicationState } from '~~/shared/constants/system-lifecycle'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { guidedHelpLedger } from '~~/shared/guided-help/catalog'

const { groups, pending } = defineProps<{ groups: PublisherGroup[], pending: boolean }>()
const emit = defineEmits<{ expand: [context: string], create: [context: string], open: [context: string, id: string], catalog: [context: string, guideId: string, catalogId?: string], clone: [context: string, versionId: string], preview: [context: string, document: GuideDraft] }>()
const { t, locale } = useI18n()
const { getGroupedDisclosureControlsId, getGroupedDisclosureContentId } = useGroupedDisclosureIds()
const search = ref('')
const pagination = ref({ pageIndex: 0, pageSize: 10 })
const expanded = ref<ExpandedState>({})
const ownerName = (row: GuideRow) => row.context === 'system' ? t('guided_help.system') : label({ en: row.ownerNameEn, fr: row.ownerNameFr })
const label = (value: { en: string, fr: string }) => value[locale.value === 'fr' ? 'fr' : 'en']
type GuideRow = { id: string, context: string, ownerNameEn: string, ownerNameFr: string, name: string, document: GuideDraft, state: PublicationState, version: number, guide?: HelpGuide, catalog?: HelpCatalog, offered: boolean, placeholder: boolean, canEdit: boolean }
const searchedGroups = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  return groups.filter(group => !query || !group.loaded || [group.id === 'system' ? t('guided_help.system') : group.name.en, group.name.fr, ...[...group.guides, ...group.shared].flatMap(guide => [guide.egcs_cn_document.title.en, guide.egcs_cn_document.title.fr]), ...group.catalogs.flatMap(catalog => [catalog.sourceVersionDocument?.title.en ?? '', catalog.sourceVersionDocument?.title.fr ?? ''])].some(value => value.toLocaleLowerCase().includes(query)))
})
const visibleGroups = computed(() => searchedGroups.value.slice(pagination.value.pageIndex * pagination.value.pageSize, (pagination.value.pageIndex + 1) * pagination.value.pageSize))
const rows = computed<GuideRow[]>(() => visibleGroups.value.flatMap(group => {
  const sourceIds = [...new Set([...group.guides.map(guide => guide.id), ...group.catalogs.map(catalog => catalog.egcs_ay_guide), ...group.shared.map(guide => guide.id)])]
  return (sourceIds.length ? sourceIds : ['']).map(id => {
    const guide = group.guides.find(item => item.id === id)
    const catalog = group.catalogs.find(item => item.egcs_ay_guide === id)
    const offer = group.shared.find(item => item.id === id)
    const document = guide?.egcs_cn_document ?? catalog?.sourceVersionDocument ?? offer?.egcs_cn_document ?? { formatVersion: 1 as const, title: { en: '', fr: '' }, description: { en: '', fr: '' }, steps: [] }
    return { id: `${group.id}:${id || 'empty'}`, context: group.id, ownerNameEn: group.name.en, ownerNameFr: group.name.fr, name: label(document.title) || t('guided_help.untitled'), document, state: catalog?.publicationState ?? guide?.publicationState ?? 'draft', version: Math.max(0, ...(guide?.versions ?? offer?.versions ?? []).map(version => version.version)), guide, catalog, offered: Boolean(offer), placeholder: !id, canEdit: group.canEdit }
  })
}))
// Retain owner groups while searching and reveal their matching guide rows.
const filtered = computed(() => rows.value.filter(row => row.placeholder || !search.value.trim() || [row.context === 'system' ? t('guided_help.system') : row.ownerNameEn, row.name, row.document.title.en, row.document.title.fr, row.ownerNameEn, row.ownerNameFr].some(value => value.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase()))))
const columns: TableColumnInput<GuideRow>[] = [{ id: 'context', accessorKey: 'context', headerKey: 'guided_help.owner' }, { id: 'name', accessorKey: 'name', headerKey: 'common.name' }, { id: 'state', headerKey: 'common.status' }, { id: 'availability', headerKey: 'guided_help.availability' }, { id: 'actions', headerKey: 'common.actions' }]
const groupFor = (row: GuideRow) => groups.find(group => group.id === row.context)
const newest = (guide: HelpGuide) => [...guide.versions].sort((left, right) => right.version - left.version)[0]
const viewName = (key: string) => label(guidedHelpLedger.views.find(view => view.key === key)?.label ?? { en: key, fr: key })
const toggle = (row: { original: GuideRow, toggleExpanded: () => void, getIsExpanded: () => boolean }) => {
  if (!row.getIsExpanded()) emit('expand', row.original.context)
  row.toggleExpanded()
}
watch(search, value => {
  pagination.value.pageIndex = 0
  if (value.trim()) {
    for (const group of groups) emit('expand', group.id)
    expanded.value = Object.fromEntries(groups.map(group => [`context:${group.id}`, true]))
  }
})
</script>

<template>
  <div class="px-6 pb-6">
    <CommonResourceLayoutCard
      v-model:search="search" v-model:pagination="pagination" v-model:expanded="expanded"
      :data="filtered" :columns="columns" :total-records="searchedGroups.length" :show-button="false"
      :grouping="['context']" :grouping-options="{ getGroupedRowModel: getGroupedRowModel() }"
      :column-visibility="{ context: false }" :get-row-id="(row: GuideRow) => row.id"
      :expanded-options="{ autoResetExpanded: false }">
      <template #name-cell="{ row }">
        <div :id="getGroupedDisclosureContentId(row)" class="contents">
          <CommonGroupedDisclosureButton v-if="row.getIsGrouped()" class="group flex min-w-0 items-center gap-3 py-1 text-left" :expanded="row.getIsExpanded()" :controls="getGroupedDisclosureControlsId(row.id)" :label="row.original.context === 'system' ? t('guided_help.system') : undefined" :label-en="row.original.ownerNameEn" :label-fr="row.original.ownerNameFr" @toggle="toggle(row)">
            <UIcon :name="row.getIsExpanded() ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-4 shrink-0 text-zinc-400 transition-colors group-hover:text-primary group-focus-visible:text-primary" />
            <CommonEntityTypeBadge
              :type="row.original.context === 'system' ? 'system' : 'agency'"
              :icon="row.original.context === 'system' ? 'i-lucide-globe' : 'i-lucide-building-2'"
              :label-en="row.original.context === 'system' ? t('guided_help.system') : row.original.ownerNameEn"
              :label-fr="row.original.context === 'system' ? t('guided_help.system') : row.original.ownerNameFr"
              class="group-hover:border-primary/30 group-hover:bg-primary/10 group-hover:text-primary group-focus-visible:border-primary/30 group-focus-visible:bg-primary/10 group-focus-visible:text-primary dark:group-hover:border-primary/40 dark:group-hover:bg-primary/15 dark:group-focus-visible:border-primary/40 dark:group-focus-visible:bg-primary/15"
              interactive />
            <CommonStatusBadge v-if="groupFor(row.original)?.loaded" variant="count" size="sm" :label="String(row.subRows?.filter((item: { original: GuideRow }) => !item.original.placeholder).length ?? 0)" />
            <UIcon v-if="groupFor(row.original)?.loading" name="i-lucide-loader-circle" class="size-4 animate-spin text-muted" />
          </CommonGroupedDisclosureButton>
          <div v-else-if="!row.original.placeholder" class="flex items-start gap-3 pl-6">
            <UIcon name="i-lucide-corner-down-right" class="mt-1 size-4 shrink-0 text-muted" /><div>
              <CommonBilingualName v-if="row.original.document.title.en || row.original.document.title.fr" :name-en="row.original.document.title.en" :name-fr="row.original.document.title.fr" />
              <span v-else class="font-semibold">{{ t('guided_help.untitled') }}</span>
              <p v-if="row.original.catalog?.sourceAttribution || row.original.guide?.sourceAttribution" class="mt-1 text-xs text-muted">
                {{ t('guided_help.owner') }}: {{ (row.original.catalog?.sourceAttribution ?? row.original.guide?.sourceAttribution)?.ownerType === 'system' ? t('guided_help.system') : label((row.original.catalog?.sourceAttribution ?? row.original.guide?.sourceAttribution)!.agencyName) }}
              </p>
            </div>
          </div>
          <p v-else class="pl-12 text-sm text-muted">
            {{ t(groupFor(row.original)?.loading ? 'common.loading' : groupFor(row.original)?.error ? 'common.load_failed' : 'guided_help.no_owned_guides') }}
          </p>
        </div>
      </template>
      <template #state-cell="{ row }">
        <div v-if="!row.getIsGrouped() && !row.original.placeholder" class="space-y-2">
          <div v-if="row.original.guide" class="flex flex-wrap items-center gap-2">
            <span v-if="row.original.catalog" class="text-xs text-muted">{{ t('guided_help.source') }}</span><CommonLifecycleBadge engine="publication" :state="row.original.guide.publicationState ?? 'draft'" />
          </div>
          <div v-if="row.original.catalog" class="flex flex-wrap items-center gap-2">
            <span v-if="row.original.guide" class="text-xs text-muted">{{ t('guided_help.catalog') }}</span><CommonLifecycleBadge engine="publication" :state="row.original.catalog.publicationState ?? 'draft'" />
          </div>
        </div>
      </template>
      <template #availability-cell="{ row }">
        <div v-if="!row.getIsGrouped() && !row.original.placeholder" class="max-w-sm space-y-1 whitespace-normal text-sm">
          <template v-if="row.original.catalog">
            <p>{{ t(row.original.catalog.publicationState === 'published' ? 'guided_help.available_in_agency' : 'guided_help.not_published_locally') }}</p>
            <p class="text-muted">
              {{ t('guided_help.configured_screens') }}: {{ row.original.catalog.egcs_ay_discoveryscreens.map(viewName).join(', ') }}
            </p>
            <p v-if="row.original.catalog.hasUnpublishedChanges" class="text-xs text-warning">
              {{ t('transfer_payment.unpublished_changes') }}
            </p>
            <p class="text-xs text-muted">
              {{ t('guided_help.role_count', { count: row.original.catalog.egcs_ay_roles.length }) }}
            </p>
          </template>
          <p v-else>
            {{ t(row.original.offered ? 'guided_help.available_to_adopt' : row.original.guide?.egcs_cn_shared && row.original.guide.versions.length ? 'guided_help.offered_all_agencies' : 'guided_help.not_published_locally') }}
          </p>
          <UBadge v-if="row.original.catalog?.latestSourceVersionId && row.original.catalog.latestSourceVersionId !== row.original.catalog.egcs_ay_sourceversion" color="info" variant="soft">
            {{ t('guided_help.new_version') }}
          </UBadge>
        </div>
      </template>
      <template #actions-cell="{ row }">
        <div class="flex items-center justify-end gap-2">
          <template v-if="row.getIsGrouped()">
            <UButton v-if="row.original.canEdit" icon="i-lucide-plus" color="primary" variant="ghost" size="sm" :aria-label="t('guided_help.create_in', { name: ownerName(row.original) })" :disabled="pending" @click="emit('create', row.original.context)" />
            <UButton v-if="groupFor(row.original)?.error" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" size="sm" :aria-label="t('common.retry')" @click="emit('expand', row.original.context)" />
          </template>
          <template v-else-if="!row.original.placeholder">
            <UButton v-if="row.original.guide" icon="i-lucide-arrow-right" color="neutral" variant="ghost" size="sm" :aria-label="t('common.open')" :disabled="pending" @click="emit('open', row.original.context, row.original.guide.id)" />
            <UButton v-if="row.original.catalog" :icon="row.original.guide ? 'i-lucide-settings-2' : 'i-lucide-arrow-right'" color="neutral" variant="ghost" size="sm" :aria-label="t(row.original.guide ? 'guided_help.distribution' : 'common.open')" :disabled="pending" @click="emit('catalog', row.original.context, row.original.catalog.egcs_ay_guide, row.original.catalog.id)" />
            <UButton v-else-if="row.original.context !== 'system' && row.original.canEdit && (row.original.guide?.versions.length || row.original.offered)" icon="i-lucide-plus" color="neutral" variant="ghost" size="sm" :aria-label="t('guided_help.adopt')" :disabled="pending" @click="emit('catalog', row.original.context, (row.original.guide ?? groupFor(row.original)!.shared.find(guide => `${row.original.context}:${guide.id}` === row.original.id))!.id)" />
            <template v-if="row.original.context !== 'system' && row.original.offered">
              <UButton v-if="row.original.canEdit" icon="i-lucide-copy" color="neutral" variant="ghost" size="sm" :aria-label="t('guided_help.clone')" :disabled="pending" @click="emit('clone', row.original.context, newest(groupFor(row.original)!.shared.find(guide => `${row.original.context}:${guide.id}` === row.original.id)!)!.id)" />
              <UButton icon="i-lucide-play" color="neutral" variant="ghost" size="sm" :aria-label="t('guided_help.preview')" @click="emit('preview', row.original.context, row.original.document)" />
            </template>
          </template>
        </div>
      </template>
      <template #footer-left>
        {{ groups.length }} {{ t('guided_help.owners') }}
      </template>
    </CommonResourceLayoutCard>
  </div>
</template>
