<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { appRouteLocations } from '~/utils/route-locations'
import { ASSIGNABLE_ENTITY_TYPE_ENUM } from '~~/shared/constants/enums'
import type { AssignableEntityType } from '~~/shared/types/schemas'
import type { BusinessRecordStateFields } from '~~/shared/types/business-record-state'

type AssignedWorkItem = BusinessRecordStateFields & {
  entity_id: string
  entity_type: AssignableEntityType
  status: string
  identifier_en: string
  identifier_fr: string
  is_primary: boolean
  agreement_id: string | null
  variant: string | null
}

type AssignedWorkLocationBuilder = (item: AssignedWorkItem) => RouteLocationRaw

const requireAgreementId = (item: AssignedWorkItem): string => {
  if (!item.agreement_id) throw new Error(`Missing Agreement context for ${item.entity_type}`)
  return item.agreement_id
}

const getReviewLocation = (item: AssignedWorkItem): RouteLocationRaw => {
  if (item.variant === 'checklist') return appRouteLocations.checklistDetail(item.entity_id)
  return appRouteLocations.assessmentDetail(item.entity_id)
}

const assignedWorkLocationBuilders = {
  applicantrecipient: item => appRouteLocations.proponentEdit(item.entity_id),
  fundingcaseagreement: item => appRouteLocations.agreementDetail(item.entity_id),
  fundingcaseagreementcloseout: item => appRouteLocations.agreementCloseoutDetail(requireAgreementId(item), item.entity_id),
  commonreview: getReviewLocation,
  commonrecommendation: item => appRouteLocations.recommendationDetail(item.entity_id),
  fundingcaseagreementclaim: item => appRouteLocations.agreementClaimDetail(requireAgreementId(item), item.entity_id),
  fundingclaimreconcile: item => appRouteLocations.claimReconciliationDetail(item.entity_id),
  fundingcasepayment: item => appRouteLocations.agreementPaymentDetail(requireAgreementId(item), item.entity_id),
  fundingcaseforecast: item => appRouteLocations.agreementForecastDetail(requireAgreementId(item), item.entity_id),
  fundingcasemonitor: item => appRouteLocations.agreementMonitorDetail(requireAgreementId(item), item.entity_id),
  fundingcaseamendment: item => appRouteLocations.agreementAmendmentDetail(requireAgreementId(item), item.entity_id),
  fundingcaseagreementcommitment: item => appRouteLocations.agreementCommitmentDetail(requireAgreementId(item), item.entity_id)
} satisfies Record<AssignableEntityType, AssignedWorkLocationBuilder>

const getAssignedWorkLocation = (item: AssignedWorkItem) => assignedWorkLocationBuilders[item.entity_type](item)

const { t } = useI18n()
const localePath = useLocalePath()
const { canAny } = useCan()
const { getBilingualValue } = useBilingualValue()
const { getHeroCollapsed } = useDashboard()
const isHeroCollapsed = getHeroCollapsed('home')
const entityTypeFilter: Ref<'all' | AssignableEntityType> = ref('all')
const assignedWorkQuery = computed(() => entityTypeFilter.value === 'all'
  ? {}
  : { entityType: entityTypeFilter.value })
const {
  search,
  pagination,
  items,
  totalRecords,
  status,
  error,
  refresh
} = useResourceTable<AssignedWorkItem>({
  fetchUrl: '/api/assigned-work',
  query: assignedWorkQuery,
  initialPageSize: 10
})

const homeHeroActions = computed(() => canAny('agency', 'read')
  ? [{
      label: t('home.view_agencies'),
      icon: 'i-lucide-building-2',
      to: localePath(appRouteLocations.agencies())
    }]
  : [])
const homeHeroBadges = computed(() => [{
  variant: 'active',
  labelKey: 'home.system_operational'
}])
const columns: TableColumnInput<AssignedWorkItem>[] = [
  { id: 'item', accessorKey: 'identifier_en', headerKey: 'common.item' },
  { id: 'type', accessorKey: 'entity_type', headerKey: 'home.item_type' },
  { id: 'status', accessorKey: 'status', headerKey: 'common.status' },
  { id: 'primary', accessorKey: 'is_primary', headerKey: 'home.primary' },
  { id: 'actions', headerKey: 'common.actions' }
]
const typeOptions = computed(() => [
  { label: t('home.all_item_types'), value: 'all' },
  ...ASSIGNABLE_ENTITY_TYPE_ENUM.map(entityType => ({
    label: t(`assignments.entity_types.${entityType}`),
    value: entityType
  }))
])
const getIdentifier = (item: AssignedWorkItem) => getBilingualValue(item, 'identifier', item.entity_id)
</script>

<template>
  <UDashboardPanel id="home">
    <template #header>
      <UDashboardNavbar :title="t('nav.home')" :ui="{ right: 'gap-3' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <div class="flex items-center gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              :icon="isHeroCollapsed ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'"
              :aria-label="t(isHeroCollapsed ? 'common.expand' : 'common.collapse')"
              @click="isHeroCollapsed = !isHeroCollapsed" />
            <CommonNavbarSide />
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex-1 overflow-y-auto">
        <CommonEntityHero
          :is-collapsed="isHeroCollapsed"
          icon="i-lucide-house"
          :title="`${t('home.welcome')} GCS-SSC.`"
          :description="t('home.description')"
          :badges="homeHeroBadges"
          :actions="homeHeroActions" />

        <div class="p-8">
          <div class="mb-8 flex items-center justify-between">
            <h2 class="text-xs font-black tracking-[0.3em] text-zinc-400 uppercase">
              {{ t('home.system_overview') }}
            </h2>
          </div>

          <HomeStats />

          <div class="mt-12 grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
            <CommonInfoCard
              :title="t('home.recent_activity.title')"
              :description="t('home.recent_activity.description')"
              icon="i-lucide-history"
              icon-color="blue" />

            <CommonInfoCard
              :title="t('home.pending_approvals.title')"
              :description="t('home.pending_approvals.description')"
              icon="i-lucide-alert-circle"
              icon-color="red" />

            <CommonInfoCard
              :title="t('home.system_settings.title')"
              :description="t('home.system_settings.description')"
              icon="i-lucide-settings"
              icon-color="zinc" />
          </div>

          <section class="mt-12 space-y-5" aria-labelledby="assigned-work-heading">
            <div class="flex flex-wrap items-end justify-between gap-4">
              <div class="space-y-1">
                <div class="flex items-center gap-2">
                  <h2 id="assigned-work-heading" class="text-xl font-semibold text-highlighted">
                    {{ t('home.assigned_work') }}
                  </h2>
                  <CommonStatusBadge v-if="status === 'success'" variant="count" :label="String(totalRecords)" />
                </div>
                <p class="text-sm text-muted">
                  {{ t('home.assigned_work_description') }}
                </p>
              </div>
            </div>

            <UAlert
              v-if="error && items.length === 0"
              color="error"
              variant="soft"
              icon="i-lucide-circle-alert"
              :title="t('home.assigned_work_load_failed')"
              :description="t('home.assigned_work_load_failed_description')">
              <template #actions>
                <UButton color="error" variant="soft" size="sm" icon="i-lucide-refresh-cw" :label="t('common.retry')" @click="refresh" />
              </template>
            </UAlert>

            <CommonResourceLayoutCard
              v-else
              v-model:search="search"
              v-model:pagination="pagination"
              :data="items"
              :columns="columns"
              :total-records="totalRecords"
              :loading="status === 'pending'"
              :show-button="false"
              :show-column-toggle="false"
              :search-placeholder="t('home.search_assigned_work')"
              :empty="t('home.no_assigned_work')">
              <template #filters>
                <USelect
                  v-model="entityTypeFilter"
                  :items="typeOptions"
                  value-key="value"
                  label-key="label"
                  class="min-w-52"
                  :aria-label="t('home.filter_by_item_type')" />
              </template>

              <template #item-cell="{ row }">
                <NuxtLink
                  class="group flex min-w-0 items-center gap-3 text-left"
                  :to="localePath(getAssignedWorkLocation(row.original))">
                  <span class="flex size-9 shrink-0 items-center justify-center rounded-sm bg-primary/10 text-primary">
                    <UIcon name="i-lucide-briefcase-business" class="size-4" />
                  </span>
                  <span class="min-w-0">
                    <span class="block truncate font-semibold text-highlighted transition-colors group-hover:text-primary">
                      {{ getIdentifier(row.original) }}
                    </span>
                    <span class="block text-xs text-muted">
                      {{ t(`assignments.entity_types.${row.original.entity_type}`) }}
                    </span>
                  </span>
                </NuxtLink>
              </template>

              <template #type-cell="{ row }">
                {{ t(`assignments.entity_types.${row.original.entity_type}`) }}
              </template>

              <template #status-cell="{ row }">
                <CommonAssignedWorkStatusBadge
                  :entity-type="row.original.entity_type"
                  :status="row.original.status"
                  :is-completed="row.original.isCompleted" />
              </template>

              <template #primary-cell="{ row }">
                <UBadge v-if="row.original.is_primary" color="primary" variant="subtle" icon="i-lucide-star">
                  {{ t('assignments.primary') }}
                </UBadge>
                <span v-else class="text-sm text-muted">{{ t('assignments.assignee') }}</span>
              </template>

              <template #actions-cell="{ row }">
                <div class="flex justify-end">
                  <UButton
                    :to="localePath(getAssignedWorkLocation(row.original))"
                    color="neutral"
                    variant="ghost"
                    size="sm"
                    icon="i-lucide-arrow-up-right"
                    :label="t('home.open_item')" />
                </div>
              </template>
            </CommonResourceLayoutCard>
          </section>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
