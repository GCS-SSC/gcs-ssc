<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- Page-local queue actions are named for their behavior. */
import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { AssignedWorkItem, GroupWorkItem } from '~~/shared/types/assigned-work'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'

type AssignedItem = AssignedWorkItem
type GroupItem = GroupWorkItem
type Section = 'direct' | 'shared' | 'proponents' | 'agreements'
const assignedBatchSize = 100
const sectionPageSize = 5
const groupPageSize = 10
const { t } = useI18n()
const { showError } = useApiErrorToast()
const { getHeroCollapsed } = useDashboard()
const isHeroCollapsed = getHeroCollapsed('home')
const busyGroupItemId: Ref<string | null> = ref(null)
const groupPage: Ref<number> = ref(1)
const sectionPages: Ref<Record<Section, number>> = ref({ direct: 1, shared: 1, proponents: 1, agreements: 1 })
const loadedAssigned: Ref<AssignedItem[]> = ref([])
const assignedTotal: Ref<number> = ref(0)
const nextAssignedBatch: Ref<number> = ref(2)
const loadingAssignedBatch: Ref<boolean> = ref(false)
const { items, totalRecords, status, error, refresh } = useResourceTable<AssignedItem>({
  fetchUrl: '/api/assigned-work',
  initialPageSize: assignedBatchSize
})
watch([items, status, totalRecords], ([nextItems, nextStatus, nextTotal]) => {
  if (nextStatus !== 'success') return
  loadedAssigned.value = [...nextItems]
  assignedTotal.value = nextTotal
  nextAssignedBatch.value = 2
  sectionPages.value = { direct: 1, shared: 1, proponents: 1, agreements: 1 }
}, { immediate: true })
const { data: groupData, status: groupStatus, error: groupError, refresh: refreshGroup } = useAsyncData(
  'home-available-group-work',
  async (): Promise<{ items: GroupItem[], total: number, has_membership: boolean }> => {
    const url = getClientRequestUrl('/api/group-work')
    url.searchParams.set('view', 'available')
    url.searchParams.set('page', String(groupPage.value))
    url.searchParams.set('limit', String(groupPageSize))
    const response = await fetch(url)
    if (!response.ok) await throwFetchResponseError(response)
    return await response.json() as { items: GroupItem[], total: number, has_membership: boolean }
  },
  { watch: [groupPage] }
)
const hasAdministrativeGroups = computed(() => groupStatus.value === 'success' && groupData.value?.has_membership === true)
const { data: agreementCountData, status: agreementCountStatus, error: agreementCountError, refresh: refreshAgreementCount } = useAsyncData(
  'home-assigned-agreement-count',
  async (): Promise<{ total: number }> => {
    const url = getClientRequestUrl('/api/assigned-work')
    url.searchParams.set('entityType', 'fundingcaseagreement')
    url.searchParams.set('page', '1')
    url.searchParams.set('limit', '1')
    const response = await fetch(url)
    if (!response.ok) await throwFetchResponseError(response)
    return await response.json() as { total: number }
  },
  { immediate: false }
)
const groupItems = computed(() => groupStatus.value === 'pending' ? [] : groupData.value?.items ?? [])
const directItems = computed(() => loadedAssigned.value.filter(item => item.entity_type !== 'applicantrecipient' && item.entity_type !== 'fundingcaseagreement' && item.is_primary))
const sharedItems = computed(() => loadedAssigned.value.filter(item => item.entity_type !== 'applicantrecipient' && item.entity_type !== 'fundingcaseagreement' && !item.is_primary))
const proponentItems = computed(() => loadedAssigned.value.filter(item => item.entity_type === 'applicantrecipient'))
const agreementItems = computed(() => loadedAssigned.value.filter(item => item.entity_type === 'fundingcaseagreement'))
const needsAgreementCount = computed(() => groupStatus.value === 'success' && !hasAdministrativeGroups.value
  && status.value === 'success' && loadedAssigned.value.length < assignedTotal.value)
watch(needsAgreementCount, needed => {
  if (needed && agreementCountStatus.value === 'idle') void refreshAgreementCount()
}, { immediate: true })
const sectionItems = (section: Section) => {
  if (section === 'direct') return directItems.value
  if (section === 'shared') return sharedItems.value
  if (section === 'proponents') return proponentItems.value
  return agreementItems.value
}
const visibleItems = (section: Section) => sectionItems(section).slice((sectionPages.value[section] - 1) * sectionPageSize, sectionPages.value[section] * sectionPageSize)
const hasNext = (section: Section) => sectionItems(section).length > sectionPages.value[section] * sectionPageSize
  || (nextAssignedBatch.value - 1) * assignedBatchSize < assignedTotal.value
const loadNextAssignedBatch = async () => {
  if (loadingAssignedBatch.value || (nextAssignedBatch.value - 1) * assignedBatchSize >= assignedTotal.value) return
  loadingAssignedBatch.value = true
  try {
    const url = getClientRequestUrl('/api/assigned-work')
    url.searchParams.set('page', String(nextAssignedBatch.value))
    url.searchParams.set('limit', String(assignedBatchSize))
    const response = await fetch(url)
    if (!response.ok) await throwFetchResponseError(response)
    const batch = await response.json() as { items: AssignedItem[], total: number }
    loadedAssigned.value = [...loadedAssigned.value, ...batch.items]
    assignedTotal.value = batch.total
    nextAssignedBatch.value += 1
  } catch (loadError) {
    showError(loadError)
  } finally {
    loadingAssignedBatch.value = false
  }
}
const nextSectionPage = async (section: Section) => {
  while (sectionItems(section).length <= sectionPages.value[section] * sectionPageSize
    && (nextAssignedBatch.value - 1) * assignedBatchSize < assignedTotal.value) {
    const previousBatch = nextAssignedBatch.value
    await loadNextAssignedBatch()
    if (nextAssignedBatch.value === previousBatch) return
  }
  if (sectionItems(section).length > sectionPages.value[section] * sectionPageSize) sectionPages.value[section] += 1
}
const previousSectionPage = (section: Section) => {
  sectionPages.value[section] = Math.max(1, sectionPages.value[section] - 1)
}
const stats = computed(() => [
  { title: t('home_dashboard.my_open_work'), value: status.value === 'success' ? assignedTotal.value : '—', icon: 'i-lucide-briefcase-business', color: 'primary' },
  ...(groupStatus.value !== 'success'
    ? []
    : hasAdministrativeGroups.value
      ? [{ title: t('home_dashboard.available_to_claim'), value: groupData.value?.total ?? 0, icon: 'i-lucide-inbox', color: 'blue' }]
      : [{ title: t('home_dashboard.assigned_agreements'), value: needsAgreementCount.value
          ? agreementCountStatus.value === 'success' ? agreementCountData.value?.total ?? 0 : '—'
          : status.value === 'success' ? agreementItems.value.length : '—', icon: 'i-lucide-handshake', color: 'blue' }])
])
const claimGroupItem = async (item: GroupItem) => {
  const url = item.kind === 'review'
    ? `/api/reviews/${item.id}/claim`
    : item.kind === 'additional_reviewer'
      ? `/api/additional-reviewers/${item.id}/claim`
      : `/api/approvals/${item.id}/claim`
  try {
    busyGroupItemId.value = item.id
    const response = await fetch(getClientRequestUrl(url), { method: 'POST' })
    if (!response.ok) await throwFetchResponseError(response)
    groupPage.value = 1
    await Promise.all([refreshGroup(), refresh()])
  } catch (claimError) {
    showError(claimError)
  } finally {
    busyGroupItemId.value = null
  }
}
</script>

<template>
  <UDashboardPanel id="home">
    <template #header>
      <UDashboardNavbar :title="t('nav.home')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            color="neutral"
            variant="ghost"
            :icon="isHeroCollapsed ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'"
            :aria-label="t(isHeroCollapsed ? 'common.expand' : 'common.collapse')"
            @click="isHeroCollapsed = !isHeroCollapsed" />
          <CommonNavbarSide />
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <div class="flex-1 overflow-y-auto bg-default">
        <CommonEntityHero
          :is-collapsed="isHeroCollapsed"
          icon="i-lucide-house"
          :title="t('home_dashboard.hero_title')"
          :description="t(groupStatus === 'success' && !hasAdministrativeGroups ? 'home_dashboard.hero_description_no_groups' : 'home_dashboard.hero_description')" />
        <div class="mx-auto max-w-7xl px-5 py-8 sm:px-8">
          <div class="space-y-10">
            <div class="grid gap-5 sm:grid-cols-2">
              <CommonStatCard
                v-for="stat in stats"
                :key="stat.title"
                :title="stat.title"
                :value="stat.value"
                :icon="stat.icon"
                :color="stat.color" />
            </div>
            <p class="text-xs text-muted">
              {{ t('home_dashboard.stat_scope') }}
            </p>
            <div class="grid gap-6 lg:grid-cols-2">
              <section aria-labelledby="direct-work-heading" class="min-w-0 border-t-4 border-primary pt-4">
                <h2 id="direct-work-heading" class="text-xl font-semibold text-highlighted">
                  {{ t('home_dashboard.direct_work') }}
                </h2>
                <p class="mt-1 text-sm text-muted">
                  {{ t('home_dashboard.direct_work_description') }}
                </p>
                <HomeAssignedWorkList v-if="status === 'success' || loadedAssigned.length > 0" :items="visibleItems('direct')" :empty-message="t('home_dashboard.no_direct_work')" />
                <HomeWorkPager v-if="status === 'success' || loadedAssigned.length > 0" :title="t('home_dashboard.direct_work')" :page="sectionPages.direct" :has-next="hasNext('direct')" :loading="loadingAssignedBatch" @previous="previousSectionPage('direct')" @next="nextSectionPage('direct')" />
              </section>
              <section aria-labelledby="shared-work-heading" class="min-w-0 border-t-4 border-primary/35 pt-4">
                <h2 id="shared-work-heading" class="text-xl font-semibold text-highlighted">
                  {{ t('home_dashboard.shared_work') }}
                </h2>
                <p class="mt-1 text-sm text-muted">
                  {{ t('home_dashboard.shared_work_description') }}
                </p>
                <HomeAssignedWorkList v-if="status === 'success' || loadedAssigned.length > 0" :items="visibleItems('shared')" :empty-message="t('home_dashboard.no_shared_work')" />
                <HomeWorkPager v-if="status === 'success' || loadedAssigned.length > 0" :title="t('home_dashboard.shared_work')" :page="sectionPages.shared" :has-next="hasNext('shared')" :loading="loadingAssignedBatch" @previous="previousSectionPage('shared')" @next="nextSectionPage('shared')" />
              </section>
              <section v-if="hasAdministrativeGroups" aria-labelledby="available-work-heading" class="min-w-0 border-t-4 border-primary/35 pt-4 lg:col-span-2">
                <h2 id="available-work-heading" class="text-xl font-semibold text-highlighted">
                  {{ t('groups.available') }}
                </h2>
                <p class="mt-1 text-sm text-muted">
                  {{ t('home_dashboard.available_work_description') }}
                </p>
                <HomeGroupWorkList v-if="groupStatus === 'success'" :items="groupItems" claimable :busy-id="busyGroupItemId" @claim="claimGroupItem" />
                <HomeWorkPager v-if="groupStatus === 'success'" :title="t('groups.available')" :page="groupPage" :has-next="groupPage * groupPageSize < (groupData?.total ?? 0)" @previous="groupPage -= 1" @next="groupPage += 1" />
              </section>
              <section aria-labelledby="assigned-roots-heading" class="min-w-0 border-t-4 border-primary/35 pt-4 lg:col-span-2">
                <h2 id="assigned-roots-heading" class="text-xl font-semibold text-highlighted">
                  {{ t('home_dashboard.assigned_roots') }}
                </h2>
                <p class="mt-1 text-sm text-muted">
                  {{ t('home_dashboard.assigned_roots_description') }}
                </p>
                <div class="mt-4 grid gap-6 lg:grid-cols-2">
                  <div class="min-w-0">
                    <h3 class="text-base font-semibold text-highlighted">
                      {{ t('home_dashboard.assigned_proponents') }}
                    </h3>
                    <HomeAssignedWorkList v-if="status === 'success' || loadedAssigned.length > 0" :items="visibleItems('proponents')" :empty-message="t('home_dashboard.no_assigned_proponents')" />
                    <HomeWorkPager v-if="status === 'success' || loadedAssigned.length > 0" :title="t('home_dashboard.assigned_proponents')" :page="sectionPages.proponents" :has-next="hasNext('proponents')" :loading="loadingAssignedBatch" @previous="previousSectionPage('proponents')" @next="nextSectionPage('proponents')" />
                  </div>
                  <div class="min-w-0">
                    <h3 class="text-base font-semibold text-highlighted">
                      {{ t('home_dashboard.assigned_agreements') }}
                    </h3>
                    <HomeAssignedWorkList v-if="status === 'success' || loadedAssigned.length > 0" :items="visibleItems('agreements')" :empty-message="t('home_dashboard.no_assigned_agreements')" />
                    <HomeWorkPager v-if="status === 'success' || loadedAssigned.length > 0" :title="t('home_dashboard.assigned_agreements')" :page="sectionPages.agreements" :has-next="hasNext('agreements')" :loading="loadingAssignedBatch" @previous="previousSectionPage('agreements')" @next="nextSectionPage('agreements')" />
                  </div>
                </div>
              </section>
            </div>
          </div>
          <CommonLoadingState v-if="status === 'pending' || groupStatus === 'pending'" :label="t('home_dashboard.loading')" />
          <UAlert v-if="error" class="mt-6" color="error" variant="soft" :title="t('home.assigned_work_load_failed')">
            <template #actions>
              <UButton size="sm" :label="t('common.retry')" @click="refresh" />
            </template>
          </UAlert>
          <UAlert v-if="groupError" class="mt-6" color="error" variant="soft" :title="t('home_dashboard.group_load_failed')">
            <template #actions>
              <UButton size="sm" :label="t('common.retry')" @click="() => refreshGroup()" />
            </template>
          </UAlert>
          <UAlert v-if="needsAgreementCount && agreementCountError" class="mt-6" color="error" variant="soft" :title="t('home_dashboard.agreement_count_load_failed')">
            <template #actions>
              <UButton size="sm" :label="t('common.retry')" @click="() => refreshAgreementCount()" />
            </template>
          </UAlert>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
