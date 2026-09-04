<script setup lang="ts">
import { getClientRequestUrl } from '~/utils/client-request-url'
import type { Ref } from 'vue'
import type { AgencyProfileItem } from '~~/shared/types/schemas'
import { buildAgencyHeroStats, saveAgencyProfile } from '~/utils/agency-page'

definePageMeta({
  i18n: {
    paths: {
      en: '/agencies',
      fr: '/agences'
    }
  }
})

const { t } = useI18n()
const { can, canAny } = useCan()
const { showError } = useApiErrorToast()
const statusCatalog = useStatusCatalog()

const {
  search,
  statusFilter,
  pagination,
  columnFilters,
  columnVisibility,
  rowSelection,
  items: agencies,
  totalRecords,
  response,
  refresh,
  retry,
  status
} = useResourceTable<AgencyProfileItem>({
  fetchUrl: '/api/agency'
})

const isModalOpen: Ref<boolean> = ref(false)
const selectedAgency: Ref<Partial<AgencyProfileItem> | null> = ref(null)
const isSavingAgency: Ref<boolean> = ref(false)

/**
 * Persists the selected agency from the create/update modal.
 *
 * @returns Save promise.
 */
const saveAgency = async () => saveAgencyProfile({
  selectedAgency,
  isSavingAgency,
  isModalOpen,
  buildRequestUrl: getClientRequestUrl,
  refresh,
  refreshStatusCatalogAgency: statusCatalog.refreshAgency,
  showError
})

/**
 * Initializes the agency state as empty and opens the creation modal.
 */
const openCreateModal = () => {
  if (!canCreateAgency.value) return
  selectedAgency.value = {}
  isModalOpen.value = true
}

/**
 * Loads a specific agency's data into the state and opens the update modal.
 *
 * @param {AgencyProfileItem} agency - The agency record to be edited.
 */
const openUpdateModal = (agency: AgencyProfileItem) => {
  if (!canUpdateAgency(agency)) return
  selectedAgency.value = { ...agency }
  isModalOpen.value = true
}

const { getHeroCollapsed } = useDashboard()
const isHeroCollapsed = getHeroCollapsed('agencies')
const agencyHeroStats = computed(() => buildAgencyHeroStats(response.value, t))
const canCreateAgency = computed(() => canAny('agency', 'create', ['global']))
const canUpdateAgency = (agency: AgencyProfileItem) => can('agency', 'update', { type: 'agency', agencyId: String(agency.id) })
</script>

<template>
  <UDashboardPanel id="agencies">
    <template #header>
      <UDashboardNavbar :title="t('agency.title')">
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
      <div class="flex flex-1 flex-col overflow-hidden">
        <CommonEntityHero
          :is-collapsed="isHeroCollapsed"
          icon="i-lucide-building-2"
          :title="t('agency.title')"
          :description="t('agency.description')"
          :stats="agencyHeroStats" />

        <AgencyProfilesTable
          v-model:search="search"
          v-model:status-filter="statusFilter"
          v-model:pagination="pagination"
          v-model:column-filters="columnFilters"
          v-model:column-visibility="columnVisibility"
          v-model:row-selection="rowSelection"
          :agencies="agencies"
          :total-records="totalRecords"
          :loading="status === 'pending'"
          :request-status="status"
          :can-create="canCreateAgency"
          :can-update="canUpdateAgency"
          @add="openCreateModal"
          @retry="retry"
          @edit="openUpdateModal" />
      </div>

      <!-- Agency Modal (Create/Update) -->
      <AgencyModal
        v-if="selectedAgency"
        v-model:open="isModalOpen"
        v-model:state="selectedAgency"
        :title="selectedAgency.id ? t('agency.update_title') : t('agency.create_title')"
        :submit-label="selectedAgency.id ? t('common.update') : t('common.add')"
        :pending="isSavingAgency"
        @submit="saveAgency" />
    </template>
  </UDashboardPanel>
</template>
