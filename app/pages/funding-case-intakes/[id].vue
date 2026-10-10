<script setup lang="ts">
import { usePageResourceError } from '~/composables/usePageResourceError'
import CommonSubmittedApplication from '~/components/Common/Submitted/Application.vue'
import { appRouteLocations } from '~/utils/route-locations'

definePageMeta({ i18n: { paths: { en: '/funding-case-intakes/[id]', fr: '/dossiers-de-financement/[id]' } } })

type Intake = {
  egcs_fi_application: unknown; egcs_fi_sourceexport: unknown
  id: string; egcs_fi_externalsourceid: string | null; egcs_fi_fundingopportunity: string
  egcs_fi_applicantrecipient: string
  egcs_fi_status: string; agency_id: string; program_id: string
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
usePageResourceError({ identity: () => route.path, errors: [error], pending: () => status.value === 'pending', hasContent: () => Boolean(profile.value) })
const { isAssigned } = useEntityAssignmentRoster('fundingcaseintake', id)
const isHeroCollapsed = getHeroCollapsed('funding-case-intake-detail')

const tabs = computed(() => [
  { key: 'funding_case_intake.details', value: 'general', icon: 'i-lucide-file-text' },
  { key: 'submitted_application.menu', value: 'application', icon: 'i-lucide-file-check' },
  { key: 'attachments.title', value: 'attachments', icon: 'i-lucide-paperclip' },
  { key: 'reviews.title', value: 'reviews', icon: 'i-lucide-list-checks' },
  { key: 'workflow.title', value: 'workflows', icon: 'i-lucide-workflow' },
  { key: 'supplementary_information.title', value: 'supplementary-information', icon: 'i-lucide-clipboard-list' },
  { key: 'funding_case_intake.approval_submission', value: 'approval', icon: 'i-lucide-send' },
  { key: 'assignments.title', value: 'assignments', icon: 'i-lucide-users-round' }
])
const { selectedTab } = useUrlTabState({
  tabs,
  defaultKey: tabs.value.find(tab => tab.value === String(route.query.tab ?? 'general'))?.key
})
const scope = computed(() => profile.value && ({
  type: 'entity' as const, agencyId: String(profile.value.agency_id),
  path: [{ type: 'transfer_payment' as const, id: String(profile.value.program_id) }]
}))
const isLocked = computed(() => isStatusLocked(profile.value?.egcs_fi_status))
const canEdit = computed(() => Boolean(scope.value && isAssigned.value && !isLocked.value && can('funding_case', 'update', scope.value)))
const canDelete = computed(() => Boolean(scope.value && isAssigned.value && !isLocked.value && can('funding_case', 'delete', scope.value)))
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
  { label: profile.value ? String(profile.value.id) : id }
])
</script>

<template>
  <CommonDetailPage id="funding-case-intake-detail" v-model:collapsed="isHeroCollapsed" :breadcrumb-items="breadcrumbs">
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
        <CommonEntityHero :is-collapsed="isHeroCollapsed" icon="i-lucide-inbox" :title="`${t('funding_case_intake.singular')} ${profile.id}`" :meta-items="[`${t('funding_case_intake.opportunity')}: ${getBilingualValue(profile, 'opportunity_name', profile.egcs_fi_fundingopportunity)}`, `${t('funding_case_intake.proponent')}: ${getBilingualValue(profile, 'proponent_name', profile.egcs_fi_applicantrecipient)}`]" :badges="[{ statusId: profile.egcs_fi_status }]" :actions="[{ label: t('common.delete'), icon: 'i-lucide-trash', visible: canDelete, onClick: remove }]" />
        <CommonDetailWorkspace v-model="selectedTab" content-test-id="funding-case-intake-detail-content" :items="tabs">
          <CommonSection v-if="selectedTab === 'general'" :show-header="false" :title="t('funding_case_intake.details')" :grid-cols="1">
            <dl class="grid gap-4 md:grid-cols-2">
              <div>
                <dt class="text-sm text-muted">
                  {{ t('funding_case_intake.application_id') }}
                </dt><dd>{{ profile.id }}</dd>
              </div>
              <div v-if="profile.egcs_fi_externalsourceid">
                <dt class="text-sm text-muted">
                  {{ t('funding_case_intake.external_source_id') }}
                </dt><dd>{{ profile.egcs_fi_externalsourceid }}</dd>
              </div>
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
          </CommonSection>
          <CommonSubmittedApplication v-else-if="selectedTab === 'application'" :snapshot="profile.egcs_fi_sourceexport ?? profile.egcs_fi_application" :external-source-id="profile.egcs_fi_externalsourceid" />
          <CommonAttachmentsTab v-else-if="selectedTab === 'attachments'" entity-type="fundingcaseintake" :entity-id="id" />
          <CommonReviewsTab v-else-if="selectedTab === 'reviews'" entity-type="fundingcaseintake" :entity-id="id" :can-update="canEdit" @changed="refresh" />
          <CommonWorkflowSection v-else-if="selectedTab === 'workflows'" entity-type="fundingcaseintake" :entity-id="id" purpose="standard" :can-edit="canEdit" @changed="refresh" />
          <CommonWorkflowSupplementaryInformation v-else-if="selectedTab === 'supplementary-information'" :show-header="false" entity-type="fundingcaseintake" :entity-id="id" />
          <CommonWorkflowSection v-else-if="selectedTab === 'approval'" entity-type="fundingcaseintake" :entity-id="id" purpose="approval_submission" :can-edit="canEdit" @changed="refresh" />
          <CommonAssignedUsers v-else-if="selectedTab === 'assignments'" :show-header="false" entity-type="fundingcaseintake" :entity-id="id" />
        </CommonDetailWorkspace>
      </div>
    </template>
  </CommonDetailPage>
</template>
