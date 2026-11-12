<script setup lang="ts">
import { onScopeDispose } from 'vue'
import { useActionContext } from '~/composables/useActionContext'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { useCrudModal, useCrudModalPending } from '~/composables/useCrudModal'
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
let pageLifetime: 'active' | 'disposed' = 'active'
onScopeDispose(() => {
  pageLifetime = 'disposed'
})
const isPageActive = () => pageLifetime === 'active'

const {
  search,
  statusFilter,
  pagination,
  columnFilters,
  columnVisibility,
  items: agencies,
  totalRecords,
  response,
  refresh,
  retry,
  status
} = useResourceTable<AgencyProfileItem>({
  fetchUrl: '/api/agency'
})

const {
  isOpen: isModalOpen,
  selected: selectedAgency,
  openCreate: openAgencyCreate,
  openUpdate: openAgencyUpdate,
  captureSession,
  closeSession
} = useCrudModal<AgencyProfileItem>({
  createState: () => ({}),
  updateState: agency => ({ ...agency })
})
const agencyPending = useCrudModalPending(captureSession)
const isSavingAgency = agencyPending.isPending
const pageContext = useActionContext({ identity: [], authority: true })
const agencyContext = useActionContext({
  identity: [() => selectedAgency.value?.id],
  authority: () => selectedAgency.value?.id
    ? can('agency', 'update', { type: 'agency', agencyId: String(selectedAgency.value.id) })
    : canAny('agency', 'create', ['global']),
  eligible: () => !selectedAgency.value?.id || agencies.value.some(agency => agency.id === selectedAgency.value?.id)
})

/**
 * Persists the selected agency from the create/update modal.
 *
 * @returns Save promise.
 */
const saveAgency = async () => {
  const pageOperation = pageContext.capture()
  return saveAgencyProfile({
    selectedAgency,
    captureSession,
    closeSession,
    isActive: () => isPageActive() && Boolean(pageOperation?.isCurrent()),
    context: agencyContext,
    pending: agencyPending,
    buildRequestUrl: getClientRequestUrl,
    refresh,
    refreshStatusCatalogAgency: statusCatalog.refreshAgency,
    showError
  })
}

/**
 * Initializes the agency state as empty and opens the creation modal.
 */
const openCreateModal = () => {
  if (!isPageActive() || !canCreateAgency.value) return
  openAgencyCreate()
}

/**
 * Loads a specific agency's data into the state and opens the update modal.
 *
 * @param {AgencyProfileItem} agency - The agency record to be edited.
 */
const openUpdateModal = (agency: AgencyProfileItem) => {
  if (!isPageActive() || !canUpdateAgency(agency)) return
  openAgencyUpdate(agency)
}

const { getHeroCollapsed } = useDashboard()
const isHeroCollapsed = getHeroCollapsed('agencies')
const agencyHeroStats = computed(() => buildAgencyHeroStats(response.value, t))
const canCreateAgency = computed(() => canAny('agency', 'create', ['global']))
const canUpdateAgency = (agency: AgencyProfileItem) => can('agency', 'update', { type: 'agency', agencyId: String(agency.id) })
</script>

<template>
  <CommonDetailPage id="agencies" v-model:collapsed="isHeroCollapsed" :title="t('agency.title')">
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
        :action-context="agencyContext"
        @submit="saveAgency" />
    </template>
  </CommonDetailPage>
</template>
