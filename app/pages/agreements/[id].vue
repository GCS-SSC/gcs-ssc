<script setup lang="ts">
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { appRouteLocations } from '~/utils/route-locations'
import type { FundingCaseAgreementProfileForm, FundingCaseAgreementProfileRow } from '~~/shared/types/funding-case-agreement-ui'
import type { RuntimeState } from '~~/shared/constants/system-lifecycle'
import AgreementActivitiesTab from '~/components/Agreement/AgreementActivitiesTab.vue'
import AgreementAddressesTab from '~/components/Agreement/AgreementAddressesTab.vue'
import AgreementApplicantRecipientsTab from '~/components/Agreement/AgreementApplicantRecipientsTab.vue'
import AgreementBudgetTab from '~/components/Agreement/AgreementBudgetTab.vue'
import AgreementCommitmentsTab from '~/components/Agreement/AgreementCommitmentsTab.vue'
import AgreementPaymentsTab from '~/components/Agreement/AgreementPaymentsTab.vue'
import AgreementForecastsTab from '~/components/Agreement/AgreementForecastsTab.vue'
import AgreementMonitorsTab from '~/components/Agreement/AgreementMonitorsTab.vue'
import AgreementClaimsTab from '~/components/Agreement/AgreementClaimsTab.vue'
import AgreementDocumentsTab from '~/components/Agreement/AgreementDocumentsTab.vue'
import AgreementAmendmentsTab from '~/components/Agreement/AgreementAmendmentsTab.vue'
import AgreementCloseoutsTab from '~/components/Agreement/AgreementCloseoutsTab.vue'
import { useExtensionEntityTabs } from '~/composables/useExtensionEntityTabs'
import { useBusinessStatusState } from '~/composables/useBusinessStatusState'
import { useAgreementSimilarityConfirmation } from '~/composables/useAgreementSimilarityConfirmation'

definePageMeta({
  key: route => route.fullPath,
  i18n: {
    paths: {
      en: '/agreements/[id]',
      fr: '/ententes/[id]'
    }
  }
})

type AgreementDetailForm = FundingCaseAgreementProfileForm & {
  egcs_fc_status?: FundingCaseAgreementProfileRow['egcs_fc_status']
  can_update?: boolean
  can_delete?: boolean
  can_create_child_records?: boolean
  can_update_child_records?: boolean
  can_delete_child_records?: boolean
}

type AgreementDetailProfile = FundingCaseAgreementProfileRow & {
  risk_workflow_managed?: boolean
  has_risk_rating_runs?: boolean
  latest_risk_rating_run?: {
    runtimeId: string
    status: RuntimeState
    completedAt: string | null
    workflowName: { en: string, fr: string }
    assessmentScore: number | null
    mappedRating: { id: string, score: number, label: { en: string, fr: string } } | null
  } | null
  can_create_child_records?: boolean
  can_update_child_records?: boolean
  can_delete_child_records?: boolean
}

const { t, n } = useI18n()
const toast = useToast()
const route = useRoute()
const localePath = useLocalePath()
const { showError } = useApiErrorToast()
const { getBilingualValue } = useBilingualValue()
const { getHeroCollapsed } = useDashboard()
const { formatDate, toDateInput } = useDateHelpers()
const { isRecordLocked } = useBusinessStatusState()
const {
  warnings: similarityWarnings,
  isWarningOpen: isSimilarityWarningOpen,
  requestPreview: requestSimilarityPreview,
  handleMutationError: handleSimilarityMutationError,
  confirmWarnings: confirmSimilarityWarnings,
  cancelWarnings: cancelSimilarityWarnings,
  getConfirmations: getSimilarityConfirmations
} = useAgreementSimilarityConfirmation()
const id = route.params.id as string
const isChildDetailRoute = computed(() =>
  typeof route.params.commitmentId === 'string'
  || typeof route.params.paymentId === 'string'
  || typeof route.params.forecastId === 'string'
  || typeof route.params.monitorId === 'string'
  || typeof route.params.claimId === 'string'
  || typeof route.params.amendmentId === 'string'
  || typeof route.params.closeoutId === 'string'
)

const profile: Ref<AgreementDetailProfile | null> = ref(null)
const error: Ref<unknown | null> = ref(null)
const status: Ref<'idle' | 'pending' | 'success' | 'error'> = ref('idle')
/**
 *
 */
const refreshProfile = async () => {
  try {
    status.value = 'pending'
    error.value = null
    const response = await fetch(getClientRequestUrl(`/api/agreements/${id}`))
    if (!response.ok) await throwFetchResponseError(response)
    profile.value = await response.json() as AgreementDetailProfile
    status.value = 'success'
  } catch (fetchError: unknown) {
    error.value = fetchError
    status.value = 'error'
  }
}
if (!isChildDetailRoute.value) void refreshProfile()
const {
  tabs: extensionTabs,
  getExtensionTabItem
} = useExtensionEntityTabs({
  target: 'agreement',
  agreementId: computed(() => isChildDetailRoute.value ? undefined : id)
})

const selectedProfile: Ref<AgreementDetailForm | null> = ref(null)
const isSaving: Ref<boolean> = ref(false)
const selectedTab = ref('general')
const isBusinessLocked = computed(() => isRecordLocked(profile.value))
const canCreateChildRecords = computed(() => Boolean(profile.value?.can_create_child_records) && !isBusinessLocked.value)
const canUpdateBusinessRecord = computed(() => Boolean(profile.value?.can_update) && !isBusinessLocked.value)
const canUpdateChildRecords = computed(() => Boolean(profile.value?.can_update_child_records) && !isBusinessLocked.value)
const canDeleteChildRecords = computed(() => Boolean(profile.value?.can_delete_child_records) && !isBusinessLocked.value)
const isHeroCollapsed = getHeroCollapsed('agreement-detail')
const getLocalizedWorkflowName = (name: { en: string, fr: string }): string => getBilingualValue({
  workflow_name_en: name.en,
  workflow_name_fr: name.fr
}, 'workflow_name', t('common.not_available'))
const formatRiskScore = (score: number | null | undefined): string => score === null || score === undefined
  ? t('common.not_available')
  : n(score)

const tabs = computed(() => {
  const nextTabs = [
    {
      key: 'agency.tabs.general',
      value: 'general',
      icon: 'i-lucide-info'
    }
  ]

  if (profile.value) {
    nextTabs.push({
      key: 'agreement.addresses.title',
      value: 'addresses',
      icon: 'i-lucide-map-pinned'
    })
    nextTabs.push({
      key: 'agreement.applicant_recipients.title',
      value: 'applicant-recipients',
      icon: 'i-lucide-users-round'
    })
    nextTabs.push({
      key: 'agreement.budget.title',
      value: 'budget',
      icon: 'i-lucide-banknote'
    })
    nextTabs.push({
      key: 'agreement.amendments.recommendation',
      value: 'recommendation',
      icon: 'i-lucide-git-pull-request-arrow'
    })
    nextTabs.push({
      key: 'agreement.risk_rating_workflow',
      value: 'risk-rating',
      icon: 'i-lucide-gauge'
    })
    nextTabs.push({
      key: 'workflow.title',
      value: 'workflows',
      icon: 'i-lucide-workflow'
    })
    nextTabs.push({
      key: 'agreement.commitments.title',
      value: 'commitments',
      icon: 'i-lucide-file-check-2'
    })
    nextTabs.push({
      key: 'agreement.payments.title',
      value: 'payments',
      icon: 'i-lucide-wallet-cards'
    })
    nextTabs.push({
      key: 'agreement.forecasts.title',
      value: 'forecasts',
      icon: 'i-lucide-chart-no-axes-column-increasing'
    })
    nextTabs.push({
      key: 'agreement.claims.title',
      value: 'claims',
      icon: 'i-lucide-receipt-text'
    })
    nextTabs.push({
      key: 'agreement.monitors.title',
      value: 'monitors',
      icon: 'i-lucide-clipboard-check'
    })
    nextTabs.push({
      key: 'agreement.documents.title',
      value: 'documents',
      icon: 'i-lucide-files'
    })
    nextTabs.push({
      key: 'attachments.title',
      value: 'attachments',
      icon: 'i-lucide-paperclip'
    })
    nextTabs.push({
      key: 'agreement.activities.title',
      value: 'activities',
      icon: 'i-lucide-list-todo'
    })
    nextTabs.push({
      key: 'agreement.amendments.title',
      value: 'amendments',
      icon: 'i-lucide-file-pen-line'
    })
    nextTabs.push({
      key: 'assignments.title',
      value: 'assignments',
      icon: 'i-lucide-users'
    })
    nextTabs.push({
      key: 'agreement.closeout.title',
      value: 'closeout',
      icon: 'i-lucide-package-check'
    })
  }

  return [
    ...nextTabs,
    ...extensionTabs.value
  ]
})

const selectedExtensionTab = computed(() => getExtensionTabItem(selectedTab.value))

const breadcrumbItems = computed(() => [
  { label: t('agreement.title'), to: localePath(appRouteLocations.agreements()) },
  { label: getBilingualValue(profile.value, 'egcs_fc_title', id) }
])

watch(profile, value => {
  if (!value) {
    selectedProfile.value = null
    return
  }

  selectedProfile.value = {
    ...value,
    egcs_fc_authorizedassistancestartdate: toDateInput(value.egcs_fc_authorizedassistancestartdate),
    egcs_fc_authorizedassistanceenddate: toDateInput(value.egcs_fc_authorizedassistanceenddate)
  }
}, { immediate: true })

watch([error, status], ([loadError, loadStatus]) => {
  if (loadError || loadStatus === 'error') showError(loadError)
}, { immediate: true })

/**
 * Saves agreement changes from the inline edit view and refreshes the detail page.
 */
const submit = async () => {
  if (!selectedProfile.value || isSaving.value) {
    return
  }

  try {
    isSaving.value = true
    const {
      egcs_fc_status: _status,
      can_delete: _canDelete,
      can_update: _canUpdate,
      can_create_child_records: _canCreateChildRecords,
      can_update_child_records: _canUpdateChildRecords,
      can_delete_child_records: _canDeleteChildRecords,
      ...body
    } = selectedProfile.value
    const streamId = body.egcs_fc_transferpaymentstream
    const agreementNumber = body.egcs_fc_agreementnumber
    if (streamId === undefined || typeof agreementNumber !== 'string') return
    const canContinue = await requestSimilarityPreview({
      streamId,
      agreementNumber,
      excludeAgreementId: id
    })
    if (!canContinue) return

    const response = await fetch(getClientRequestUrl(`/api/agreements/${id}`), {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...body,
        confirmations: getSimilarityConfirmations()
      })
    })
    if (!response.ok) await throwFetchResponseError(response)

    await refreshProfile()

    toast.add({
      title: t('common.success'),
      description: t('common.updated_success'),
      color: 'success'
    })
  } catch (caughtError: unknown) {
    if (handleSimilarityMutationError(caughtError)) return
    showError(caughtError)
  } finally {
    isSaving.value = false
  }
}

/** Confirms the visible fingerprints and retries the complete preview-and-update path. */
const confirmSimilarityAndSubmit = async () => {
  if (isSaving.value) return
  confirmSimilarityWarnings()
  await submit()
}

/**
 * Resets unsaved inline edits back to the last loaded agreement state.
 */
const cancel = () => {
  if (!profile.value) {
    selectedProfile.value = null
    return
  }

  selectedProfile.value = {
    ...profile.value,
    egcs_fc_authorizedassistancestartdate: toDateInput(profile.value.egcs_fc_authorizedassistancestartdate),
    egcs_fc_authorizedassistanceenddate: toDateInput(profile.value.egcs_fc_authorizedassistanceenddate)
  }
}
</script>

<template>
  <NuxtPage v-if="isChildDetailRoute" />
  <div v-else class="flex w-full flex-col">
    <div v-if="status === 'pending' && !profile" role="status" aria-live="polite" class="flex min-h-32 items-center justify-center gap-2 text-sm text-muted">
      <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" aria-hidden="true" />
      <span>{{ t('common.loading_records') }}</span>
    </div>
    <UAlert v-else-if="status === 'error'" color="error" icon="i-lucide-circle-alert" :title="t('common.resource_table_load_failed')" :description="t('common.resource_table_load_failed_description')">
      <template #actions>
        <UButton color="error" variant="soft" icon="i-lucide-refresh-cw" :label="t('common.retry')" @click="refreshProfile" />
      </template>
    </UAlert>
    <UDashboardPanel v-if="profile" id="agreement-detail" class="w-full">
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
        <div class="flex flex-1 flex-col">
          <AgreementProfileHero
            :profile="profile"
            :is-collapsed="isHeroCollapsed"
            :title="getBilingualValue(profile, 'egcs_fc_title', id)"
            :subtitle="t('agreement.update_title')"
            show-context />

          <CommonEntityEditorWorkspace content-test-id="agreement-detail-content">
            <template #sidebar>
              <CommonRouteTabs
                v-model="selectedTab"
                :items="tabs"
                orientation="vertical"
                :ui="{
                  root: 'w-full',
                  list: 'w-full flex-col items-stretch p-0',
                  trigger: 'w-full justify-start'
                }" />
            </template>

            <AgreementProfileFormPage
              v-if="selectedTab === 'general' && selectedProfile && canUpdateBusinessRecord"
              v-model:model="selectedProfile"
              :submit-label="t('common.update')"
              :cancel-label="t('common.cancel')"
              permission-action="update"
              :agreement-id="id"
              :pending="isSaving"
              @submit="submit"
              @cancel="cancel" />

            <AgreementGeneralTab
              v-else-if="selectedTab === 'general'"
              :profile="profile" />

            <AgreementAddressesTab
              v-else-if="selectedTab === 'addresses'"
              :agreement-id="id"
              :can-create="canCreateChildRecords"
              :can-update="canUpdateChildRecords"
              :can-delete="canDeleteChildRecords" />

            <AgreementApplicantRecipientsTab
              v-else-if="selectedTab === 'applicant-recipients'"
              :agreement-id="id"
              :can-create="canCreateChildRecords"
              :can-update="canUpdateChildRecords"
              :can-delete="canDeleteChildRecords" />

            <AgreementBudgetTab
              v-else-if="selectedTab === 'budget'"
              :agreement-id="id"
              :can-create="canCreateChildRecords"
              :can-update="canUpdateChildRecords"
              :can-delete="canDeleteChildRecords"
              :can-create-fiscal-year="canCreateChildRecords"
              :can-update-fiscal-year="canUpdateChildRecords"
              :can-delete-fiscal-year="canDeleteChildRecords" />

            <CommonWorkflowSection
              v-else-if="selectedTab === 'recommendation'"
              entity-type="fundingcaseagreement"
              :entity-id="id"
              purpose="approval_submission"
              :can-edit="Boolean(profile.can_update)"
              @changed="refreshProfile" />

            <div v-else-if="selectedTab === 'risk-rating'" class="space-y-4">
              <UAlert
                :title="t('agreement.risk_rating_workflow')"
                :description="profile.risk_workflow_managed ? t('agreement.risk_rating_managed_help') : t('agreement.risk_rating_manual_help')"
                :icon="profile.risk_workflow_managed ? 'i-lucide-workflow' : 'i-lucide-pencil'" />
              <CommonSection :title="t('agreement.risk_rating_workflow')" :grid-cols="1">
                <dl class="grid gap-3 md:grid-cols-2">
                  <div>
                    <dt class="text-sm text-muted">
                      {{ t('agreement.risk_score') }}
                    </dt><dd>{{ formatRiskScore(profile.egcs_fc_riskscore) }}</dd>
                  </div>
                  <div>
                    <dt class="text-sm text-muted">
                      {{ t('common.status') }}
                    </dt><dd>{{ profile.risk_workflow_managed ? t('agreement.risk_rating_managed') : t('agreement.risk_rating_manual') }}</dd>
                  </div>
                  <template v-if="profile.latest_risk_rating_run">
                    <div>
                      <dt class="text-sm text-muted">
                        {{ t('agreement.risk_rating_workflow_name') }}
                      </dt><dd>{{ getLocalizedWorkflowName(profile.latest_risk_rating_run.workflowName) }}</dd>
                    </div>
                    <div>
                      <dt class="text-sm text-muted">
                        {{ t('agreement.risk_rating_run_status') }}
                      </dt><dd><CommonLifecycleBadge engine="runtime" :state="profile.latest_risk_rating_run.status" /></dd>
                    </div>
                    <div>
                      <dt class="text-sm text-muted">
                        {{ t('agreement.risk_rating_assessment_score') }}
                      </dt><dd>{{ formatRiskScore(profile.latest_risk_rating_run.assessmentScore) }}</dd>
                    </div>
                    <div>
                      <dt class="text-sm text-muted">
                        {{ t('agreement.risk_rating_mapped_score') }}
                      </dt><dd>{{ formatRiskScore(profile.latest_risk_rating_run.mappedRating?.score) }}</dd>
                    </div>
                    <div>
                      <dt class="text-sm text-muted">
                        {{ t('agreement.risk_rating_completed') }}
                      </dt><dd>{{ formatDate(profile.latest_risk_rating_run.completedAt) }}</dd>
                    </div>
                  </template>
                </dl>
              </CommonSection>
              <CommonWorkflowSection
                v-if="profile.risk_workflow_managed || profile.has_risk_rating_runs"
                entity-type="fundingcaseagreement"
                :entity-id="id"
                purpose="risk_rating"
                :can-edit="Boolean(profile.can_update)"
                @changed="refreshProfile" />
            </div>

            <CommonWorkflowSection
              v-else-if="selectedTab === 'workflows'"
              entity-type="fundingcaseagreement"
              :entity-id="id"
              purpose="standard"
              :can-edit="Boolean(profile.can_update)"
              @changed="refreshProfile" />

            <AgreementCommitmentsTab
              v-else-if="selectedTab === 'commitments'"
              :agreement-id="id"
              :can-create="canCreateChildRecords"
              :can-update="canUpdateChildRecords"
              :can-delete="canDeleteChildRecords" />

            <AgreementPaymentsTab
              v-else-if="selectedTab === 'payments'"
              :agreement-id="id"
              :can-create="canCreateChildRecords"
              :can-update="canUpdateChildRecords"
              :can-delete="canDeleteChildRecords" />

            <AgreementForecastsTab
              v-else-if="selectedTab === 'forecasts'"
              :agreement-id="id"
              :can-create="canCreateChildRecords"
              :can-update="canUpdateChildRecords"
              :can-delete="canDeleteChildRecords" />

            <AgreementClaimsTab
              v-else-if="selectedTab === 'claims'"
              :agreement-id="id"
              :can-create="canCreateChildRecords"
              :can-update="canUpdateChildRecords"
              :can-delete="canDeleteChildRecords" />

            <AgreementMonitorsTab
              v-else-if="selectedTab === 'monitors'"
              :agreement-id="id"
              :can-create="canCreateChildRecords"
              :can-update="canUpdateChildRecords"
              :can-delete="canDeleteChildRecords" />

            <AgreementActivitiesTab
              v-else-if="selectedTab === 'activities'"
              :agreement-id="id"
              :can-create="canCreateChildRecords"
              :can-update="canUpdateChildRecords"
              :can-delete="canDeleteChildRecords" />

            <AgreementAmendmentsTab
              v-else-if="selectedTab === 'amendments'"
              :agreement-id="id"
              :can-create="canCreateChildRecords" />

            <AgreementDocumentsTab
              v-else-if="selectedTab === 'documents'"
              :agreement-id="id"
              :can-create="canCreateChildRecords"
              :can-delete="canDeleteChildRecords" />

            <CommonAttachmentsTab
              v-else-if="selectedTab === 'attachments'"
              entity-type="fundingcaseagreement"
              :entity-id="id" />

            <AgreementCloseoutsTab
              v-else-if="selectedTab === 'closeout'"
              :agreement-id="id"
              :can-create="canCreateChildRecords" />

            <CommonAssignedUsers
              v-else-if="selectedTab === 'assignments'"
              entity-type="fundingcaseagreement"
              :entity-id="id" />

            <ExtensionEntityTabPanel
              v-else-if="selectedExtensionTab"
              :item="selectedExtensionTab" />
          </CommonEntityEditorWorkspace>
        </div>
      </template>
    </UDashboardPanel>
    <ApplicantRecipientFundingHistorySimilarityDialog
      v-model:open="isSimilarityWarningOpen"
      :warnings="similarityWarnings"
      @confirm="confirmSimilarityAndSubmit"
      @back="cancelSimilarityWarnings" />
  </div>
</template>
