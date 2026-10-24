<script setup lang="ts">
import type { Ref } from 'vue'
import type { AuditLogFilters } from '~/components/Admin/AuditLogFilters.vue'
import type { AuditDetail, AuditSummary } from '~~/shared/types/schemas/audit'

const { kind } = defineProps<{ kind: 'events' | 'access' }>()
const { t } = useI18n()
const title = computed(() => t(kind === 'events' ? 'audit.title' : 'audit.access'))
const description = computed(() => t(kind === 'events' ? 'audit.description' : 'audit.accessDescription'))
const panelId = computed(() => kind === 'events' ? 'admin-audit' : 'admin-access')
const filters: Ref<AuditLogFilters> = ref({ actor: '', table: '', recordId: '', operation: '', requestId: '', from: '', to: '' })
const query = computed(() => ({
  ...Object.fromEntries(Object.entries(filters.value).filter(([, value]) => value !== '').map(([key, value]) =>
    [key, key === 'from' || key === 'to' ? new Date(value).toISOString() : value]))
}))
const { permissionRevision } = useAuth()
const { items: rows, totalRecords, status, refresh, pagination } = useResourceTable<AuditSummary>({ fetchUrl: '/api/admin/audit/events', enabled: computed(() => kind === 'events'), query, contextKey: permissionRevision, initialPageSize: 20 })
const { data: retention, error: retentionError, refresh: refreshRetention } = await useFetch<{ auditDays: number; accessDays: number }, Error, string>('/api/admin/audit/config' as string)
const selected: Ref<{ id: string; kind: string } | null> = ref(null)
const detail: Ref<AuditDetail | null> = ref(null)
const detailStatus: Ref<'idle' | 'pending' | 'success' | 'error'> = ref('idle')
let detailGeneration = 0
let detailAbort: AbortController | null = null
/** Cancels requests and clears evidence when its view or authorization changes. */
const clearDetail = () => {
  detailGeneration++
  detailAbort?.abort()
  detailAbort = null
  detail.value = null
  detailStatus.value = 'idle'
}
/** Accepts evidence only for the current selection and request generation. */
const loadDetail = async () => {
  clearDetail()
  const selection = selected.value
  if (!selection) return
  const generation = detailGeneration
  detailAbort = new AbortController()
  detailStatus.value = 'pending'
  const url = selection.kind === 'access'
    ? `/api/admin/audit/access/${selection.id}`
    : `/api/admin/audit/events/${selection.kind}/${selection.id}`
  try {
    const response = await $fetch<AuditDetail, string>(url, { signal: detailAbort.signal })
    if (generation !== detailGeneration) return
    detail.value = response
    detailStatus.value = 'success'
  } catch {
    if (generation === detailGeneration) detailStatus.value = 'error'
  }
}
watch([() => kind, filters, permissionRevision], () => {
  pagination.value.pageIndex = 0
  selected.value = null
  clearDetail()
}, { flush: 'sync', deep: true })
onBeforeUnmount(clearDetail)
/** Loads the selected immutable evidence.
 * @param row - Selected event identity.
 * @param row.id - Event key.
 * @param row.kind - Event category.
 */
const openDetail = async (row: { id: string; kind: string }) => {
  selected.value = row
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
    return { field, old: displayValue(pair ? pair.old : ['delete', 'departure'].includes(String(detail.value?.operation)) ? entry : undefined),
      new: displayValue(pair ? pair.new : ['delete', 'departure'].includes(String(detail.value?.operation)) ? undefined : entry) }
  })
})
const { getHeroCollapsed } = useDashboard()
const isHeroCollapsed = getHeroCollapsed(panelId.value)
</script>

<template>
  <UDashboardPanel :id="panelId">
    <template #header>
      <UDashboardNavbar :title="title">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <CommonActionButton color="neutral" variant="ghost" :icon="isHeroCollapsed ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'" :aria-label="t(isHeroCollapsed ? 'common.expand' : 'common.collapse')" @click="isHeroCollapsed = !isHeroCollapsed" />
          <CommonNavbarSide />
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <CommonEntityHero :is-collapsed="isHeroCollapsed" :icon="kind === 'events' ? 'i-lucide-history' : 'i-lucide-eye'" :title="title" :description="description" />
      <div class="space-y-3 px-6 py-4">
        <UAlert
          v-if="retention"
          color="info"
          icon="i-lucide-info"
          :title="t('audit.retention', { audit: retention.auditDays, access: retention.accessDays })"
          :description="kind === 'access' ? t('audit.accessWindow') : undefined" />
        <UButton v-if="retentionError" :label="t('audit.retry')" @click="refreshRetention()" />
      </div>
      <AdminAuditAccessHistory v-if="kind === 'access'" :query="query" :context-key="permissionRevision" @select="openDetail">
        <template #filters>
          <AdminAuditLogFilters v-model="filters" :kind="kind" />
        </template>
      </AdminAuditAccessHistory>
      <CommonResourceLayoutPage
        v-else
        v-model:pagination="pagination"
        :data="rows" :columns="columns" :total-records="totalRecords" :request-status="status" :show-search="false" :show-button="false" @retry="refresh()">
        <template #filters>
          <AdminAuditLogFilters v-model="filters" :kind="kind" />
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end gap-2">
            <CommonActionButton icon="i-lucide-eye" color="neutral" variant="ghost" :aria-label="t('audit.details')" @click="openDetail(row.original)" />
          </div>
        </template>
      </CommonResourceLayoutPage>
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
              <template v-for="key in ['created_at', 'actor_user_id', 'actor_kind', 'request_id', 'query_id', 'table_name', 'operation', 'scope_type', 'agency_ids', 'transaction_id']" :key="key">
                <dt>{{ t(`audit.evidence.${key}`) }}</dt><dd class="break-all">
                  {{ key === 'scope_type' ? t(`audit.scopes.${String(detail[key])}`) : detail[key] ?? '—' }}
                </dd>
              </template>
            </dl>
            <section>
              <h3 class="font-bold">
                {{ t('audit.inputs') }}
              </h3>
              <p>{{ t(`audit.inputVisibility.${String(detail.input_visibility)}`) }}</p>
              <pre v-if="detail.inputs" class="overflow-auto whitespace-pre-wrap break-all">{{ displayValue(detail.inputs) }}</pre>
            </section>
            <template v-if="selected?.kind === 'access'">
              <div v-for="key in ['sql', 'returned_identities', 'limitations', 'outcome', 'transaction_outcome', 'duration_ms', 'row_count']" :key="key">
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
            <CommonCompactTable v-else :data="changes" :columns="[{ accessorKey: 'field', header: t('audit.field') }, { accessorKey: 'old', header: t('audit.old') }, { accessorKey: 'new', header: t('audit.new') }]" />
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
