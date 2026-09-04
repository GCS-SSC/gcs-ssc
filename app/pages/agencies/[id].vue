<script setup lang="ts">
import { useCrudModalPending } from '~/composables/useCrudModal'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { appRouteLocations } from '~/utils/route-locations'
import { useRouteTabMap } from '~/composables/useRouteTabMap'
import AgencyAddressTypes from '~/components/Agency/AgencyAddressTypes.vue'
import AgencyAttachmentTypes from '~/components/Agency/AgencyAttachmentTypes.vue'
import AgencyAgreementTypes from '~/components/Agency/AgencyAgreementTypes.vue'
import AgencyApplicantRecipientSubtypes from '~/components/Agency/AgencyApplicantRecipientSubtypes.vue'
import AgencyApprovalBehalfTypes from '~/components/Agency/AgencyApprovalBehalfTypes.vue'
import AgencyCostCategories from '~/components/Agency/AgencyCostCategories.vue'
import AgencyDetailGeneralTab from '~/components/Agency/AgencyDetailGeneralTab.vue'
import AgencyFiscalYears from '~/components/Agency/AgencyFiscalYears.vue'
import AgencyHoldbackBases from '~/components/Agency/AgencyHoldbackBases.vue'
import AgencyTransferPayments from '~/components/Agency/AgencyTransferPayments.vue'
import AgencyStatuses from '~/components/Agency/AgencyStatuses.vue'
import AgencyExtensionsTab from '~/components/Extension/AgencyExtensionsTab.vue'
import CommonLoadingState from '~/components/Common/LoadingState.vue'
import type { AgencyProfileItem } from '~~/shared/types/schemas'

definePageMeta({
  i18n: {
    paths: {
      en: '/agencies/[id]',
      fr: '/agences/[id]'
    }
  }
})

type BreadcrumbItem = {
  label: string
  to?: string
}

const { t } = useI18n()
const { getBilingualValue } = useBilingualValue()
const toast = useToast()
const localePath = useLocalePath()
const { showError } = useApiErrorToast()
const route = useRoute()
const id = route.params.id as string
const { can } = useCan()
const agencyScope = { type: 'agency' as const, agencyId: id }
const canUpdateAgency = computed(() => can('agency', 'update', agencyScope))
const canDeleteAgency = computed(() => can('agency', 'delete', agencyScope))
/**
 * Returns the Agency-owned configuration capabilities for the active detail route.
 *
 * @returns Explicit create, update, and delete capability props.
 */
const agencyResourceCapabilities = () => ({
  agencyId: id,
  canCreate: canUpdateAgency.value,
  canUpdate: canUpdateAgency.value,
  canDelete: canDeleteAgency.value
})

const tabMap: TabMap = new Map([
  ['general', { key: 'agency.tabs.general', icon: 'i-lucide-info', component: AgencyDetailGeneralTab, getProps: () => ({ agency: agency.value }) }],
  ['statuses', { key: 'agency.tabs.statuses', icon: 'i-lucide-tags', component: AgencyStatuses, getProps: agencyResourceCapabilities }],
  ['programs', { key: 'agency.tabs.programs', icon: 'i-lucide-banknote', component: AgencyTransferPayments, getProps: () => ({ agencyId: id }) }],
  ['costCategories', { key: 'agency.tabs.cost_categories', icon: 'i-lucide-layers', component: AgencyCostCategories, getProps: agencyResourceCapabilities }],
  ['fiscalYears', { key: 'agency.tabs.fiscal_years', icon: 'i-lucide-calendar', component: AgencyFiscalYears, getProps: agencyResourceCapabilities }],
  ['holdbackBases', { key: 'agency.tabs.holdback_bases', icon: 'i-lucide-percent', component: AgencyHoldbackBases, getProps: agencyResourceCapabilities }],
  ['addressTypes', { key: 'agency.tabs.address_types', icon: 'i-lucide-map-pin', component: AgencyAddressTypes, getProps: agencyResourceCapabilities }],
  ['attachmentTypes', { key: 'agency.tabs.attachment_types', icon: 'i-lucide-paperclip', component: AgencyAttachmentTypes, getProps: agencyResourceCapabilities }],
  [
    'applicantRecipientSubtypes',
    {
      key: 'agency.tabs.applicant_recipient_subtypes',
      icon: 'i-lucide-users',
      component: AgencyApplicantRecipientSubtypes,
      getProps: agencyResourceCapabilities
    }
  ],
  [
    'approvalBehalf',
    { key: 'agency.tabs.approval_behalf', icon: 'i-lucide-check-square', component: AgencyApprovalBehalfTypes, getProps: agencyResourceCapabilities }
  ],
  [
    'agreementTypes',
    { key: 'agency.tabs.agreement_types', icon: 'i-lucide-file-text', component: AgencyAgreementTypes, getProps: agencyResourceCapabilities }
  ],
  [
    'extensions',
    { key: 'extensions.tab', icon: 'i-lucide-puzzle', component: AgencyExtensionsTab, getProps: agencyResourceCapabilities }
  ]
])

const agency: Ref<AgencyProfileItem | null> = ref(null)
const isLoadingAgency = ref(false)
const agencyLoadError = ref<unknown>(null)
/**
 *
 */
const refresh = async () => {
  isLoadingAgency.value = true
  agencyLoadError.value = null
  try {
    const response = await fetch(getClientRequestUrl(`/api/agency/${id}`))
    if (!response.ok) await throwFetchResponseError(response)
    agency.value = await response.json() as AgencyProfileItem
  } catch (error: unknown) {
    agencyLoadError.value = error
    showError(error)
  } finally {
    isLoadingAgency.value = false
  }
}
void refresh()

const {
  isOpen: isAgencyModalOpen,
  selected: selectedAgency,
  openUpdate: openAgencyUpdate,
  captureSession: captureAgencySession,
  closeSession: closeAgencySession
} = useCrudModal<AgencyProfileItem, AgencyProfileItem>({
  updateState: agencyItem => ({ ...agencyItem })
})
const agencyPending = useCrudModalPending(captureAgencySession)
const isSavingAgency = agencyPending.isPending

/**
 * Opens the update modal for the agency profile.
 * Pre-populates the modal state with the current agency data.
 */
const openUpdateModal = () => {
  if (!agency.value || !canUpdateAgency.value) return
  openAgencyUpdate(agency.value)
}

/**
 * Persists changes to the agency profile via an API PATCH request.
 * Closes the modal, refreshes the agency data, and provides success feedback.
 */
const updateAgency = async () => {
  if (!selectedAgency.value || !canUpdateAgency.value) return
  const session = captureAgencySession()
  if (!agencyPending.begin(session)) return
  try {
    const response = await fetch(getClientRequestUrl(`/api/agency/${id}`), {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(selectedAgency.value)
    })
    if (!response.ok) await throwFetchResponseError(response)
    closeAgencySession(session)
    toast.add({
      title: t('common.success'),
      description: t('common.updated_success') || 'Agency updated successfully',
      color: 'success'
    })
    try {
      await refresh()
    } catch (refreshError) {
      showError(refreshError)
    }
  } catch (error: unknown) {
    showError(error)
  } finally {
    agencyPending.end(session)
  }
}

const breadcrumbItems: ComputedRef<BreadcrumbItem[]> = computed(() => [
  {
    label: t('nav.agencies'),
    to: localePath(appRouteLocations.agencies())
  },
  {
    label: getBilingualValue(agency.value, 'egcs_ay_name')
  }
])

const {
  tabs: routeTabs,
  selectedTab,
  activeTabComponent,
  activeTabProps
} = useRouteTabMap({
  tabMap,
  defaultTabId: 'general'
})

const { getHeroCollapsed } = useDashboard()
const isHeroCollapsed = getHeroCollapsed('agency-detail')
</script>

<template>
  <UDashboardPanel id="agency-detail">
    <template #header>
      <UDashboardNavbar>
        <template #leading>
          <UDashboardSidebarCollapse />
          <UBreadcrumb :items="breadcrumbItems" class="ml-2" />
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
      <CommonLoadingState v-if="isLoadingAgency && !agency" :label="t('common.loading')" />
      <UAlert
        v-else-if="agencyLoadError && !agency"
        color="error"
        icon="i-lucide-circle-alert"
        :title="t('common.load_failed')"
        :description="t('common.try_again')">
        <template #actions>
          <UButton :label="t('common.retry')" color="error" variant="soft" @click="() => refresh()" />
        </template>
      </UAlert>
      <div v-else-if="agency" class="flex flex-1 flex-col">
        <AgencyDetailHero :agency="agency" :is-collapsed="isHeroCollapsed" :can-update="canUpdateAgency" @edit="openUpdateModal" />

        <div class="flex min-h-0 flex-1 flex-col gap-6 overflow-visible px-6 pt-0 pb-6 lg:flex-row lg:gap-0">
          <aside class="w-full shrink-0 lg:w-72 lg:border-r lg:border-zinc-200 lg:pr-4 dark:lg:border-zinc-800">
            <div class="pt-6">
              <CommonRouteTabs
                v-model="selectedTab"
                :items="routeTabs"
                orientation="vertical"
                :ui="{
                  root: 'w-full',
                  list: 'w-full flex-col items-stretch p-0',
                  trigger: 'w-full justify-start'
                }" />
            </div>
          </aside>

          <div class="min-h-0 min-w-0 flex-1 pt-6 lg:pl-6">
            <component :is="activeTabComponent" v-if="activeTabComponent" v-bind="activeTabProps" />
          </div>
        </div>
      </div>

      <!-- Update Modal -->
      <AgencyModal
        v-if="selectedAgency"
        v-model:open="isAgencyModalOpen"
        v-model:state="selectedAgency"
        :title="t('agency.update_title')"
        :submit-label="t('common.update')"
        :pending="isSavingAgency"
        @submit="updateAgency" />
    </template>
  </UDashboardPanel>
</template>
