<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue'
import type { Ref } from 'vue'
import type { TableColumnInput } from '~/composables/useTableColumns'
import type { FetchError } from 'ofetch'
import { QueueSnapshotSchema } from '~~/shared/types/queues'
import type { QueueHandlerStatus, QueueSnapshot } from '~~/shared/types/queues'

definePageMeta({
  middleware: 'admin-system',
  i18n: { paths: { en: '/admin/queues', fr: '/admin/files' } }
})

const { t, locale } = useI18n()
const { getHeroCollapsed } = useDashboard()
const { permissionRevision, permissionsReady, authorize } = useAuth()
const canRead = computed(() => permissionsReady.value && authorize('system', 'read', { type: 'global' }))
const isHeroCollapsed = getHeroCollapsed('admin-queues')
const search: Ref<string> = ref('')
const owner: Ref<string> = ref('all')
const state: Ref<string> = ref('all')
const level: Ref<string> = ref('all')
const expanded: Ref<string[]> = ref([])
const pagination = ref({ pageIndex: 0, pageSize: 10 })
/** Clears local filters without changing the server snapshot. */
const clearFilters = () => {
  search.value = ''
  owner.value = 'all'
  state.value = 'all'
  level.value = 'all'
}
const columns: TableColumnInput<QueueHandlerStatus>[] = [
  { accessorKey: 'id', headerKey: 'queues.handler', enableHiding: false },
  { id: 'registration', headerKey: 'queues.registration' },
  { id: 'execution', headerKey: 'queues.execution' },
  { id: 'queueLevel', headerKey: 'queues.level' },
  { id: 'nextRun', headerKey: 'queues.next_run' }
]
const snapshot: Ref<QueueSnapshot | null> = ref(null)
const { data: latestSnapshot, status, error, refresh, clear } = await useFetch<QueueSnapshot, FetchError, string>('/api/admin/queues', {
  key: `admin-queues:${useId()}`,
  immediate: false,
  watch: false,
  getCachedData: () => undefined,
  transform: value => QueueSnapshotSchema.parse(value)
})
const accessDenied = computed(() => (status.value === 'error' && (error.value?.statusCode === 401 || error.value?.statusCode === 403))
  || (permissionsReady.value && !canRead.value))
watch([error, status], ([requestError, requestStatus]) => {
  if (requestStatus === 'error' && (requestError?.statusCode === 401 || requestError?.statusCode === 403)) {
    latestSnapshot.value = undefined
    snapshot.value = null
    expanded.value = []
    clearFilters()
  }
}, { immediate: true, flush: 'sync' })
// Nuxt can publish new data before clearing an earlier request error.
watch([latestSnapshot, error, status], ([value, requestError, requestStatus]) => {
  if (value && !requestError && requestStatus === 'success' && canRead.value) snapshot.value = value
}, { immediate: true, flush: 'sync' })
const handlers = computed(() => snapshot.value?.handlers ?? [])
const levels = computed(() => snapshot.value?.levels ?? [])
const levelItems = computed(() => [
  { label: t('queues.all_levels'), value: 'all' },
  ...levels.value.map(item => ({ label: t('queues.level_name', { level: item.level }), value: String(item.level) }))
])
const registered = computed(() => handlers.value.filter(handler => handler.registration !== null))
const eligible = computed(() => registered.value.filter(handler => handler.registration?.eligible))
const retained = computed(() => handlers.value.filter(handler => handler.registration === null))
const stats = computed(() => snapshot.value
  ? [
      { label: t('queues.registered'), value: registered.value.length },
      { label: t('queues.eligible'), value: eligible.value.length, accent: true },
      { label: t('queues.retained'), value: retained.value.length }
    ]
  : [])
const ownerItems = computed(() => [
  { label: t('queues.all_owners'), value: 'all' },
  ...[...new Set(registered.value.map(handler => handler.registration?.owner).filter((value): value is string => value !== undefined))]
    .sort().map(value => ({ label: value === 'host' ? t('queues.host') : value, value: `owner:${value}` })),
  ...(retained.value.length ? [{ label: t('queues.unknown_owner'), value: 'retained' }] : [])
])
const stateItems = computed(() => [
  { label: t('queues.all_states'), value: 'all' },
  { label: t('queues.registered'), value: 'registered' },
  { label: t('queues.eligible'), value: 'eligible' },
  { label: t('queues.ineligible'), value: 'ineligible' },
  { label: t('queues.retained'), value: 'retained' }
])
/**
 * Uses the current subscription, falling back to retained scheduling evidence.
 * @param handler - Current registration and retained schedule.
 * @returns Queue level, when either source is available.
 */
const handlerLevel = (handler: QueueHandlerStatus): number | undefined => handler.registration?.queueLevel ?? handler.schedule?.queueLevel
const filteredHandlers = computed(() => {
  const query = search.value.trim().toLocaleLowerCase(locale.value)
  return handlers.value.filter(handler => {
    const registration = handler.registration
    const matchesSearch = !query || `${handler.id} ${registration?.owner ?? ''}`.toLocaleLowerCase(locale.value).includes(query)
    const matchesOwner = owner.value === 'all' || (owner.value === 'retained' ? registration === null : `owner:${registration?.owner}` === owner.value)
    const matchesState = state.value === 'all'
      || (state.value === 'registered' && registration !== null)
      || (state.value === 'eligible' && registration?.eligible === true)
      || (state.value === 'ineligible' && registration?.eligible === false)
      || (state.value === 'retained' && registration === null)
    const matchesLevel = level.value === 'all' || String(handlerLevel(handler)) === level.value
    return matchesSearch && matchesOwner && matchesState && matchesLevel
  })
})
const pagedHandlers = computed(() => filteredHandlers.value.slice(
  pagination.value.pageIndex * pagination.value.pageSize,
  (pagination.value.pageIndex + 1) * pagination.value.pageSize
))
watch([search, owner, state, level, () => pagination.value.pageSize], () => {
  pagination.value.pageIndex = 0
}, { flush: 'sync' })
watch(() => filteredHandlers.value.length, total => {
  pagination.value.pageIndex = Math.min(pagination.value.pageIndex, Math.max(0, Math.ceil(total / pagination.value.pageSize) - 1))
})
/**
 * Formats schedule evidence in the active interface locale.
 * @param value - Persisted timestamp, if available.
 * @returns Localized timestamp or an empty-value marker.
 */
const formatDate = (value: string | null | undefined): string => value
  ? new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(value))
  : t('queues.not_available')
/**
 * Formats the host-defined level cadence without losing sub-second precision.
 * @param cadenceMs - Shared level cadence.
 * @returns Localized compact cadence.
 */
const formatCadence = (cadenceMs: number): string => {
  const unit = cadenceMs % 3600000 === 0 ? 'hours' : cadenceMs % 60000 === 0 ? 'minutes' : 'seconds'
  const divisor = unit === 'hours' ? 3600000 : unit === 'minutes' ? 60000 : 1000
  return t(`queues.${unit}`, { count: new Intl.NumberFormat(locale.value).format(cadenceMs / divisor) })
}
/**
 * Reads the effective handler schedule, including its retry delay.
 * @param handler - Handler whose current or retained level is displayed.
 * @returns Next permitted run, falling back to the shared level when unprepared.
 */
const nextRunAt = (handler: QueueHandlerStatus): string | undefined => {
  const executionScope = handler.registration?.executionScope ?? handler.schedule?.executionScope
  const queueLevel = handlerLevel(handler)
  if (handler.schedule && handler.schedule.queueLevel === queueLevel && handler.schedule.executionScope === executionScope) return handler.schedule.nextRunAt
  if (executionScope === 'process') return undefined
  return levels.value.find(item => item.level === queueLevel)?.schedule?.nextRunAt
}
/**
 * Classifies the persisted lease at snapshot time, independently of run failures.
 * @param handler - Handler and its persisted schedule.
 * @returns Localized lease-state message key.
 */
const leaseState = (handler: QueueHandlerStatus): string => {
  const lease = handler.schedule
  if (!lease?.leaseOwner || !lease.leaseExpiresAt || !snapshot.value) return 'queues.no_lease'
  return Date.parse(lease.leaseExpiresAt) > Date.parse(snapshot.value.observedAt)
    ? 'queues.lease_active'
    : 'queues.lease_expired'
}
/**
 * Toggles the selected handler's scheduling evidence.
 * @param id - Stable handler identity.
 */
const toggleDetails = (id: string) => {
  expanded.value = expanded.value.includes(id) ? expanded.value.filter(value => value !== id) : [...expanded.value, id]
}
/**
 * Retrieves fresh evidence only while the current actor may read global system data.
 * @returns Refresh completion when a request is permitted.
 */
const refreshSnapshot = () => {
  if (canRead.value && status.value !== 'pending') return refresh()
}
// Clear privileged evidence and cancel old requests before loading a new authorization context.
watch(permissionRevision, () => {
  snapshot.value = null
  clear()
  clearFilters()
  expanded.value = []
  if (canRead.value) void refresh()
}, { immediate: true, flush: 'sync' })
onBeforeUnmount(clear)
</script>

<template>
  <UDashboardPanel id="admin-queues">
    <template #header>
      <UDashboardNavbar :title="t('queues.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <CommonActionButton
            color="neutral" variant="ghost"
            :icon="isHeroCollapsed ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'"
            :aria-label="t(isHeroCollapsed ? 'common.expand' : 'common.collapse')"
            @click="isHeroCollapsed = !isHeroCollapsed" />
          <CommonNavbarSide />
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <div class="flex min-w-0 flex-1 flex-col overflow-hidden">
        <CommonEntityHero
          :is-collapsed="isHeroCollapsed" icon="i-lucide-list-restart"
          :title="t('queues.title')" :description="t('queues.description')" :stats="stats" />
        <section class="min-h-0 flex-1 overflow-auto" :aria-busy="status === 'pending'" :aria-label="t('queues.handlers')">
          <UAlert v-if="accessDenied" class="m-6" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="t('queues.access_denied')" :description="t('queues.access_denied_help')">
            <template v-if="canRead" #actions>
              <UButton color="error" variant="outline" :label="t('queues.retry')" :loading="status === 'pending'" @click="refreshSnapshot()" />
            </template>
          </UAlert>
          <CommonResourceLayoutPage
            v-if="!accessDenied"
            v-model:search="search"
            v-model:pagination="pagination"
            :data="snapshot ? pagedHandlers : []"
            :columns="columns"
            :total-records="filteredHandlers.length"
            :loading="status === 'pending'"
            :request-status="snapshot || error ? status : 'pending'"
            :show-button="false"
            :search-placeholder="t('queues.search')"
            :get-row-id="(handler: QueueHandlerStatus) => handler.id"
            :expanded="Object.fromEntries(expanded.map(id => [id, true]))"
            @retry="refreshSnapshot">
            <template #filters>
              <USelect v-model="owner" :required="false" :aria-label="t('queues.owner')" :aria-required="false" :items="ownerItems" class="min-w-40" />
              <USelect v-model="state" :required="false" :aria-label="t('queues.state')" :aria-required="false" :items="stateItems" class="min-w-40" />
              <USelect v-model="level" :required="false" :aria-label="t('queues.level')" :aria-required="false" :items="levelItems" class="min-w-40" />
            </template>
            <template #actions>
              <UButton color="neutral" variant="outline" icon="i-lucide-refresh-cw" :label="t('queues.refresh')" :loading="status === 'pending'" @click="refreshSnapshot()" />
              <UPopover>
                <CommonActionButton color="neutral" variant="outline" icon="i-lucide-info" :aria-label="t('queues.about')" />
                <template #content>
                  <div
                    role="region" tabindex="0" :aria-label="t('queues.about')"
                    class="max-h-[min(calc(100dvh-2rem),var(--reka-popover-content-available-height))] w-[calc(100vw-2rem)] max-w-sm space-y-3 overflow-y-auto overscroll-contain p-4 text-sm text-muted">
                    <p v-if="snapshot" role="status" aria-live="polite">
                      {{ t('queues.observed_at', { date: formatDate(snapshot.observedAt) }) }}
                    </p>
                    <dl v-if="levels.length" class="space-y-3" :aria-label="t('queues.levels')">
                      <div v-for="item in levels" :key="item.level">
                        <dt class="font-semibold text-default">
                          {{ t('queues.level_name', { level: item.level }) }}
                        </dt>
                        <dd class="mt-1 space-y-1">
                          <p>{{ t('queues.cadence_value', { cadence: formatCadence(item.cadenceMs) }) }}</p>
                          <p>{{ item.retry ? t('queues.retry_policy', { initial: formatCadence(item.retry.initialDelayMs), maximum: formatCadence(item.retry.maximumDelayMs) }) : t('queues.retry_normal_cycle') }}</p>
                          <p>{{ t('queues.current_cycle_value', { date: formatDate(item.schedule?.currentCycleAt) }) }}</p>
                          <p>{{ t('queues.next_run_value', { date: formatDate(item.schedule?.nextRunAt) }) }}</p>
                        </dd>
                      </div>
                    </dl>
                    <p>{{ t('queues.runtime_notice') }}</p>
                    <p>{{ t('queues.activation_notice') }}</p>
                  </div>
                </template>
              </UPopover>
            </template>
            <template #id-cell="{ row }">
              <CommonGroupedDisclosureButton
                class="group flex min-w-0 items-center gap-3 text-left"
                :expanded="expanded.includes(row.original.id)"
                :controls="`queue-handler-details-${row.index}`"
                :label="row.original.id"
                @toggle="toggleDetails(row.original.id)">
                <UIcon
                  :name="expanded.includes(row.original.id) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                  class="size-4 shrink-0 text-zinc-400 transition-colors group-hover:text-primary" />
                <span class="min-w-0">
                  <span class="block break-all font-mono text-xs font-bold text-zinc-400 dark:text-zinc-500">{{ row.original.id }}</span>
                  <span class="mt-1 block break-all text-xs text-muted">{{ row.original.registration ? (row.original.registration.owner === 'host' ? t('queues.host') : row.original.registration.owner) : t('queues.unknown_owner') }}</span>
                </span>
              </CommonGroupedDisclosureButton>
            </template>
            <template #registration-cell="{ row }">
              <UBadge :color="row.original.registration ? 'primary' : 'neutral'" variant="subtle" size="sm">
                {{ t(row.original.registration ? 'queues.registered' : 'queues.retained') }}
              </UBadge>
            </template>
            <template #execution-cell="{ row }">
              <span class="inline-flex items-center gap-2" :class="row.original.registration?.eligible ? 'text-default' : 'text-muted'">
                <UIcon :name="row.original.registration?.eligible ? 'i-lucide-circle-check' : 'i-lucide-circle-minus'" class="size-4" :class="row.original.registration?.eligible ? 'text-primary' : ''" />
                {{ t(row.original.registration ? row.original.registration.eligible ? 'queues.eligible' : 'queues.ineligible' : 'queues.not_registered') }}
              </span>
              <span v-if="row.original.registration?.executionScope === 'process'" class="mt-1 block text-xs text-muted">{{ t('queues.process_scope') }}</span>
            </template>
            <template #queueLevel-cell="{ row }">
              {{ handlerLevel(row.original) ?? t('queues.not_available') }}
            </template>
            <template #nextRun-cell="{ row }">
              <span class="block whitespace-nowrap text-xs tabular-nums">{{ formatDate(nextRunAt(row.original)) }}</span>
              <span v-if="row.original.schedule?.retryNotBefore" class="mt-1 block text-xs text-muted">{{ t('queues.retry_scheduled') }}</span>
              <span v-if="row.original.schedule && (row.original.schedule.attemptCount > 0 || row.original.schedule.lastError)" class="mt-1 block text-xs text-error">{{ t('queues.last_run_failed') }}</span>
              <span v-if="row.original.schedule?.executionScope === 'process' && row.original.schedule.running" class="mt-1 block text-xs text-muted">{{ t('queues.process_running') }}</span>
              <span v-if="row.original.schedule?.leaseOwner" class="mt-1 block text-xs text-muted">{{ t(leaseState(row.original)) }}</span>
            </template>
            <template #expanded="{ row }">
              <div :id="`queue-handler-details-${row.index}`" class="p-4">
                <div v-if="row.original.schedule" class="space-y-5">
                  <dl class="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
                    <div>
                      <dt class="text-xs text-muted">
                        {{ t('queues.execution_scope') }}
                      </dt><dd class="mt-1 text-xs">
                        {{ t(row.original.schedule.executionScope === 'process' ? 'queues.process_scope' : 'queues.cluster_scope') }}
                      </dd>
                    </div>
                    <div>
                      <dt class="text-xs text-muted">
                        {{ t('queues.last_cycle') }}
                      </dt><dd class="mt-1 text-xs tabular-nums">
                        {{ formatDate(row.original.schedule.lastCycleAt) }}
                      </dd>
                    </div>
                    <div v-if="row.original.schedule.executionScope === 'cluster'">
                      <dt class="text-xs text-muted">
                        {{ t('queues.lease_cycle') }}
                      </dt><dd class="mt-1 text-xs tabular-nums">
                        {{ formatDate(row.original.schedule.leaseCycleAt) }}
                      </dd>
                    </div>
                    <div v-if="row.original.schedule.executionScope === 'cluster'">
                      <dt class="text-xs text-muted">
                        {{ t('queues.lease_state') }}
                      </dt><dd class="mt-1 text-xs">
                        {{ t(leaseState(row.original)) }}
                      </dd>
                    </div>
                    <div>
                      <dt class="text-xs text-muted">
                        {{ t('queues.failure_count') }}
                      </dt><dd class="mt-1 tabular-nums">
                        {{ row.original.schedule.attemptCount }}
                      </dd>
                    </div>
                    <div>
                      <dt class="text-xs text-muted">
                        {{ t('queues.retry_not_before') }}
                      </dt><dd class="mt-1 text-xs tabular-nums">
                        {{ formatDate(row.original.schedule.retryNotBefore) }}
                      </dd>
                    </div>
                    <div v-if="row.original.schedule.executionScope === 'process'">
                      <dt class="text-xs text-muted">
                        {{ t('queues.process_state') }}
                      </dt><dd class="mt-1 text-xs">
                        {{ t(row.original.schedule.running ? 'queues.process_running' : 'queues.process_idle') }}
                      </dd>
                    </div>
                    <div v-if="row.original.schedule.executionScope === 'cluster'">
                      <dt class="text-xs text-muted">
                        {{ t('queues.lease_owner') }}
                      </dt><dd class="mt-1 break-all font-mono text-xs">
                        {{ row.original.schedule.leaseOwner ?? t('queues.no_lease') }}
                      </dd>
                    </div>
                    <div v-if="row.original.schedule.executionScope === 'cluster'">
                      <dt class="text-xs text-muted">
                        {{ t('queues.lease_expires') }}
                      </dt><dd class="mt-1 text-xs tabular-nums">
                        {{ formatDate(row.original.schedule.leaseExpiresAt) }}
                      </dd>
                    </div>
                    <div>
                      <dt class="text-xs text-muted">
                        {{ t('queues.updated_at') }}
                      </dt><dd class="mt-1 text-xs tabular-nums">
                        {{ formatDate(row.original.schedule.updatedAt) }}
                      </dd>
                    </div>
                  </dl>
                  <div v-if="row.original.schedule.attemptCount > 0 || row.original.schedule.lastError" class="border-l-2 border-error/50 pl-4">
                    <h3 class="text-xs font-semibold text-error">
                      {{ t('queues.last_error') }}
                    </h3>
                    <p class="mt-2 whitespace-pre-wrap break-all font-mono text-xs text-muted">
                      {{ row.original.schedule.lastError?.trim() ? row.original.schedule.lastError : t('queues.no_error_message') }}
                    </p>
                  </div>
                  <p class="text-xs text-muted">
                    {{ t(row.original.schedule.executionScope === 'process' ? 'queues.process_notice' : 'queues.lease_notice') }}
                  </p>
                </div>
                <p v-else class="text-sm text-muted">
                  {{ t('queues.no_schedule') }}
                </p>
              </div>
            </template>
            <template #empty>
              <CommonEmptyState
                :title="t(handlers.length ? 'queues.no_matches' : 'queues.empty')"
                :description="t(handlers.length ? 'queues.no_matches_help' : 'queues.empty_help')">
                <template #actions>
                  <UButton v-if="handlers.length" color="neutral" variant="outline" :label="t('queues.clear_filters')" @click="clearFilters" />
                </template>
              </CommonEmptyState>
            </template>
          </CommonResourceLayoutPage>
        </section>
      </div>
    </template>
  </UDashboardPanel>
</template>
