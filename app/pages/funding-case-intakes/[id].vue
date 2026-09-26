<script setup lang="ts">
import { appRouteLocations } from '~/utils/route-locations'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'
import type { IntakeForm } from '~/components/FundingCaseIntake/IntakeModal.vue'
import type { JsonValue } from '~~/shared/types/database'

definePageMeta({ i18n: { paths: { en: '/funding-case-intakes/[id]', fr: '/dossiers-de-financement/[id]' } } })

type Intake = {
  id: string; egcs_fi_applicationid: string; egcs_fi_fundingopportunity: string
  egcs_fi_applicantrecipient: string; egcs_fi_application: Record<string, JsonValue>
  egcs_fi_status: string; agency_id: string; program_id: string; stream_id: string
  opportunity_name_en: string; opportunity_name_fr: string
  proponent_name_en: string | null; proponent_name_fr: string | null
}
const route = useRoute()
const id = String(route.params.id)
const { t } = useI18n()
const { getBilingualValue } = useBilingualValue()
const localePath = useLocalePath()
const { can } = useCan()
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const { getHeroCollapsed } = useDashboard()
const { isStatusLocked } = useBusinessStatusState()
const { data: profile, error, status, refresh } = await useFetch<Intake, Error, string>(`/api/funding-case-intakes/${id}`)
const { isAssigned } = useEntityAssignmentRoster('fundingcaseintake', id)
const isHeroCollapsed = getHeroCollapsed('funding-case-intake-detail')
const selectedTab = ref('general')
const tabs = computed(() => [
  { key: 'funding_case_intake.details', value: 'general', icon: 'i-lucide-file-text' },
  { key: 'reviews.title', value: 'reviews', icon: 'i-lucide-list-checks' },
  { key: 'workflow.title', value: 'workflows', icon: 'i-lucide-workflow' },
  { key: 'funding_case_intake.approval_submission', value: 'approval', icon: 'i-lucide-send' },
  { key: 'assignments.title', value: 'assignments', icon: 'i-lucide-users-round' }
])
const scope = computed(() => profile.value && ({
  type: 'entity' as const, agencyId: String(profile.value.agency_id),
  path: [
    { type: 'transfer_payment' as const, id: String(profile.value.program_id) },
    { type: 'transfer_payment_stream' as const, id: String(profile.value.stream_id) }
  ]
}))
const isLocked = computed(() => isStatusLocked(profile.value?.egcs_fi_status))
const canEdit = computed(() => Boolean(scope.value && isAssigned.value && !isLocked.value && can('funding_case', 'update', scope.value)))
const canDelete = computed(() => Boolean(scope.value && isAssigned.value && !isLocked.value && can('funding_case', 'delete', scope.value)))
const modalOpen = ref(false)
const pending = ref(false)
const form = ref<IntakeForm>({ egcs_fi_application: '{}' })
/**
 *
 */
const edit = () => {
  if (!profile.value) return
  form.value = { ...profile.value, egcs_fi_application: JSON.stringify(profile.value.egcs_fi_application, null, 2) }
  modalOpen.value = true
}
/**
 *
 */
const submit = async () => {
  if (pending.value || !profile.value) return
  pending.value = true
  try {
    const response = await fetch(getClientRequestUrl(`/api/funding-case-intakes/${id}`), {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ egcs_fi_application: JSON.parse(form.value.egcs_fi_application) })
    })
    if (!response.ok) await throwFetchResponseError(response)
    modalOpen.value = false
    await refresh()
  } catch (cause: unknown) {
    showError(cause)
  } finally {
    pending.value = false
  }
}
/**
 *
 */
const remove = async () => {
  try {
    if (!await confirmDeleteRequest(`/api/funding-case-intakes/${id}`)) return
    await navigateTo(localePath(appRouteLocations.fundingCaseIntakes()))
  } catch (cause: unknown) {
    showError(cause)
  }
}
const breadcrumbs = computed(() => [
  { label: t('funding_case_intake.title'), to: localePath(appRouteLocations.fundingCaseIntakes()) },
  { label: profile.value ? String(profile.value.egcs_fi_applicationid) : id }
])
</script>

<template>
  <UDashboardPanel id="funding-case-intake-detail">
    <template #header>
      <UDashboardNavbar>
        <template #leading>
          <UDashboardSidebarCollapse /><UBreadcrumb :items="breadcrumbs" class="ml-2" />
        </template>
        <template #right>
          <div class="flex items-center gap-2">
            <UButton color="neutral" variant="ghost" :icon="isHeroCollapsed ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'" :aria-label="t(isHeroCollapsed ? 'common.expand' : 'common.collapse')" @click="isHeroCollapsed = !isHeroCollapsed" />
            <CommonNavbarSide />
          </div>
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <div v-if="status === 'pending' && !profile" role="status" class="p-6">
        {{ t('common.loading_records') }}
      </div>
      <UAlert v-else-if="error" color="error" icon="i-lucide-circle-alert" :title="t('common.resource_table_load_failed')">
        <template #actions>
          <UButton :label="t('common.retry')" @click="() => refresh()" />
        </template>
      </UAlert>
      <div v-else-if="profile" class="flex flex-1 flex-col">
        <CommonEntityHero :is-collapsed="isHeroCollapsed" icon="i-lucide-inbox" :title="`${t('funding_case_intake.application_id')} ${profile.egcs_fi_applicationid}`" :description="t('funding_case_intake.description')" :badges="[{ statusId: profile.egcs_fi_status }]" :actions="[{ label: t('common.edit'), icon: 'i-lucide-edit-3', visible: canEdit, onClick: edit }, { label: t('common.delete'), icon: 'i-lucide-trash', visible: canDelete, onClick: remove }]" />
        <CommonEntityEditorWorkspace content-test-id="funding-case-intake-detail-content">
          <template #sidebar>
            <CommonRouteTabs v-model="selectedTab" :items="tabs" orientation="vertical" :ui="{ root: 'w-full', list: 'w-full flex-col items-stretch p-0', trigger: 'w-full justify-start' }" />
          </template>
          <CommonSection v-if="selectedTab === 'general'" :title="t('funding_case_intake.details')" :grid-cols="1">
            <dl class="grid gap-4 md:grid-cols-2">
              <div>
                <dt class="text-sm text-muted">
                  {{ t('funding_case_intake.opportunity') }}
                </dt><dd><UButton variant="link" :label="getBilingualValue(profile, 'opportunity_name', profile.egcs_fi_fundingopportunity)" :to="localePath(appRouteLocations.fundingOpportunityDetail(profile.egcs_fi_fundingopportunity))" /></dd>
              </div>
              <div>
                <dt class="text-sm text-muted">
                  {{ t('funding_case_intake.proponent') }}
                </dt><dd>{{ getBilingualValue(profile, 'proponent_name', profile.egcs_fi_applicantrecipient) }}</dd>
              </div>
            </dl>
            <pre class="mt-5 overflow-auto rounded-md bg-muted p-4 text-sm">{{ JSON.stringify(profile.egcs_fi_application, null, 2) }}</pre>
          </CommonSection>
          <CommonReviewsTab v-else-if="selectedTab === 'reviews'" entity-type="fundingcaseintake" :entity-id="id" :can-update="canEdit" @changed="refresh" />
          <CommonWorkflowSection v-else-if="selectedTab === 'workflows'" entity-type="fundingcaseintake" :entity-id="id" purpose="standard" :can-edit="canEdit" @changed="refresh" />
          <CommonWorkflowSection v-else-if="selectedTab === 'approval'" entity-type="fundingcaseintake" :entity-id="id" purpose="approval_submission" :can-edit="canEdit" @changed="refresh" />
          <CommonAssignedUsers v-else-if="selectedTab === 'assignments'" entity-type="fundingcaseintake" :entity-id="id" />
        </CommonEntityEditorWorkspace>
      </div>
      <FundingCaseIntakeIntakeModal v-model:open="modalOpen" v-model:state="form" :pending="pending" @submit="submit" />
    </template>
  </UDashboardPanel>
</template>
