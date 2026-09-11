<script setup lang="ts">
import type { Ref } from 'vue'
import type { AuditDetail, AuditSummary } from '~~/shared/types/schemas/audit'

definePageMeta({ middleware: 'admin-audit', i18n: { paths: { en: '/admin/audit', fr: '/admin/audit' } } })
const { t } = useI18n()
const tab: Ref<string> = ref('events')
const filters = reactive({ actor: '', table: '', recordId: '', operation: '', requestId: '', from: '', to: '' })
const filterKeys = ['actor', 'table', 'recordId', 'operation', 'requestId', 'from', 'to'] as const
const query = computed(() => ({
  ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== '').map(([key, value]) =>
    [key, key === 'from' || key === 'to' ? new Date(value).toISOString() : value]))
}))
const { items: rows, totalRecords, status, refresh, pagination, search } = useResourceTable<AuditSummary>({ fetchUrl: computed(() => `/api/admin/audit/${tab.value}`), query, initialPageSize: 20 })
const { data: retention, error: retentionError, refresh: refreshRetention } = await useFetch<{ auditDays: number; accessDays: number }, Error, string>('/api/admin/audit/config' as string)
const selected: Ref<{ id: string; kind: string } | null> = ref(null)
const detailUrl = computed(() => selected.value?.kind === 'access'
  ? `/api/admin/audit/access/${selected.value.id}`
  : `/api/admin/audit/events/${selected.value?.kind}/${selected.value?.id}`)
const { data: detail, status: detailStatus, execute: loadDetail, clear: clearDetail } = await useFetch<AuditDetail, Error, string>(detailUrl as Ref<string>, { immediate: false, watch: false })
watch([tab, filters], () => {
  pagination.value.pageIndex = 0
  selected.value = null
  clearDetail()
})
/** Loads the selected immutable evidence.
 * @param row - Selected event identity.
 * @param row.id - Event key.
 * @param row.kind - Event category.
 */
const openDetail = async (row: { id: string; kind: string }) => {
  selected.value = row
  clearDetail()
  await loadDetail()
}
const columns = computed(() => [
  { accessorKey: 'created_at', header: t('audit.date') },
  { accessorKey: 'actor_user_id', header: t('audit.actor') },
  { accessorKey: 'table_name', header: t('audit.table') },
  { accessorKey: 'operation', header: t('audit.operation') },
  { accessorKey: 'request_id', header: t('audit.requestId') },
  { id: 'actions', header: t('common.actions') }
])
const displayValue = (value: unknown): string => value === undefined ? '—' : JSON.stringify(value)
const changes = computed(() => {
  const value = detail.value?.delta ?? detail.value?.metadata
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  return Object.entries(value).map(([field, entry]) => {
    const pair = entry && typeof entry === 'object' && !Array.isArray(entry) && 'old' in entry && 'new' in entry ? entry : null
    return { field, old: displayValue(pair ? pair.old : detail.value?.operation === 'delete' ? entry : undefined),
      new: displayValue(pair ? pair.new : detail.value?.operation === 'delete' ? undefined : entry) }
  })
})
const { getHeroCollapsed } = useDashboard()
const isHeroCollapsed = getHeroCollapsed('admin-audit')
</script>

<template>
  <UDashboardPanel id="admin-audit">
    <template #header>
      <UDashboardNavbar :title="t('audit.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton color="neutral" variant="ghost" :icon="isHeroCollapsed ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'" :aria-label="t(isHeroCollapsed ? 'common.expand' : 'common.collapse')" @click="isHeroCollapsed = !isHeroCollapsed" />
          <CommonNavbarSide />
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <div class="flex flex-1 flex-col">
        <CommonEntityHero :is-collapsed="isHeroCollapsed" icon="i-lucide-history" :title="t('audit.title')" :description="t('audit.description')" />
        <CommonEntityEditorWorkspace>
          <template #sidebar>
            <CommonRouteTabs
              v-model="tab"
              :items="[
                { key: 'audit.title', value: 'events', icon: 'i-lucide-history' },
                { key: 'audit.access', value: 'access', icon: 'i-lucide-eye' }
              ]"
              orientation="vertical"
              :ui="{
                root: 'w-full',
                list: 'w-full flex-col items-stretch p-0',
                trigger: 'w-full justify-start'
              }" />
          </template>
          <div class="space-y-4 pb-6">
            <UAlert
              v-if="retention"
              color="info"
              icon="i-lucide-info"
              :title="t('audit.retention', { audit: retention.auditDays, access: retention.accessDays })" />
            <UButton v-if="retentionError" :label="t('audit.retry')" @click="refreshRetention()" />
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <UFormField v-for="key in filterKeys" :key="key" :label="t(`audit.${key}`)">
                <UInput v-model="filters[key]" :type="key === 'from' || key === 'to' ? 'datetime-local' : 'text'" />
              </UFormField>
            </div>
          </div>
          <CommonResourceLayoutPage
            v-model:pagination="pagination"
            v-model:search="search"
            class="min-h-80" :data="rows" :columns="columns" :total-records="totalRecords" :request-status="status" :show-button="false" @retry="refresh()">
            <template #actions-cell="{ row }">
              <div class="flex justify-end gap-2">
                <UButton icon="i-lucide-eye" color="neutral" variant="ghost" :aria-label="t('audit.details')" @click="openDetail(row.original)" />
              </div>
            </template>
          </CommonResourceLayoutPage>
        </CommonEntityEditorWorkspace>
      </div>
      <UModal :open="selected !== null" :title="t('audit.details')" :ui="{ content: 'sm:max-w-2xl' }" @update:open="value => { if (!value) { selected = null; clearDetail() } }">
        <template #body>
          <p v-if="detailStatus === 'pending'">
            {{ t('common.loading_records') }}
          </p>
          <div v-else-if="detailStatus === 'error'">
            <p>{{ t('audit.error') }}</p>
            <UButton :label="t('audit.retry')" @click="loadDetail()" />
          </div>
          <div v-else-if="detail" class="space-y-4">
            <dl class="grid grid-cols-2 gap-2">
              <template v-for="key in ['created_at', 'actor_user_id', 'actor_kind', 'request_id', 'query_id', 'table_name', 'operation']" :key="key">
                <dt>{{ t(`audit.evidence.${key}`) }}</dt><dd class="break-all">
                  {{ detail[key] ?? '—' }}
                </dd>
              </template>
            </dl>
            <template v-if="selected?.kind === 'access'">
              <div v-for="key in ['sql', 'parameters', 'returned_identities', 'limitations', 'outcome', 'transaction_outcome', 'duration_ms', 'row_count']" :key="key">
                <h3 class="font-bold">
                  {{ t(`audit.evidence.${key}`) }}
                </h3>
                <ul v-if="key === 'limitations' && Array.isArray(detail[key])" class="list-disc pl-5">
                  <li v-for="code in detail[key]" :key="String(code)">
                    {{ t(`audit.limitations.${String(code)}`) }}
                  </li>
                </ul>
                <pre v-else class="overflow-auto whitespace-pre-wrap break-all">{{ displayValue(detail[key]) }}</pre>
              </div>
            </template>
            <UTable v-else :data="changes" :columns="[{ accessorKey: 'field', header: t('audit.field') }, { accessorKey: 'old', header: t('audit.old') }, { accessorKey: 'new', header: t('audit.new') }]" />
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
