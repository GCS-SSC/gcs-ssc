<script setup lang="ts">
import { appRouteLocations } from '~/utils/route-locations'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'
import type { OpportunityForm } from '~/components/FundingOpportunity/OpportunityModal.vue'
import { useExtensionEntityTabs } from '~/composables/useExtensionEntityTabs'

definePageMeta({ key: route => route.path, i18n: { paths: { en: '/funding-opportunities/[id]', fr: '/possibilites-de-financement/[id]' } } })

type Opportunity = OpportunityForm & {
  id: string; agency_id: string; program_id: string
  program_name_en: string; program_name_fr: string
  egcs_fo_status: string
  egcs_fo_reviewsetups: string[]
  egcs_fo_workflowsetups: string[]
  streams: Array<{ id: string; name_en: string; name_fr: string }>
  review_setups: Array<{ id: string; name_en: string; name_fr: string }>
  workflow_setups: Array<{ id: string; name_en: string; name_fr: string }>
  egcs_fo_attachmenttypes: Array<{ id: string; name_en: string; name_fr: string; egcs_fo_isinternal: boolean }>
}
const route = useRoute()
const id = String(route.params.id)
const { t } = useI18n()
const localePath = useLocalePath()
const { can } = useCan()
const { getBilingualValue } = useBilingualValue()
const { toDateInput } = useDateHelpers()
const { getHeroCollapsed } = useDashboard()
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const statusCatalog = useStatusCatalog()
void statusCatalog.load()
const { data: profile, error, status, refresh } = await useFetch<Opportunity, Error, string>(`/api/funding-opportunities/${id}`)
const isHeroCollapsed = getHeroCollapsed('funding-opportunity-detail')
const selectedTab = ref('general')
const { tabs: extensionTabs, getExtensionTabItem } = useExtensionEntityTabs({ target: 'opportunity', opportunityId: id })
const tabs = computed(() => [
  { key: 'agency.tabs.general', value: 'general', icon: 'i-lucide-info' },
  { key: 'workflow.title', value: 'workflows', icon: 'i-lucide-workflow' },
  { key: 'reviews.title', value: 'reviews', icon: 'i-lucide-clipboard-check' },
  { key: 'attachments.title', value: 'attachments', icon: 'i-lucide-paperclip' },
  ...extensionTabs.value
])
const selectedExtensionTab = computed(() => getExtensionTabItem(selectedTab.value))
const scope = computed(() => profile.value && ({
  type: 'entity' as const, agencyId: String(profile.value.agency_id),
  path: [{ type: 'transfer_payment' as const, id: String(profile.value.program_id) }]
}))
const statusDefinition = computed(() => statusCatalog.getById(profile.value?.egcs_fo_status))
const isWritable = computed(() => Boolean(statusDefinition.value && !statusDefinition.value.deleted
  && !statusDefinition.value.readOnly && !statusDefinition.value.terminal))
const canEdit = computed(() => Boolean(scope.value && isWritable.value && can('transfer_payment', 'update', scope.value)))
const canDelete = computed(() => Boolean(scope.value && isWritable.value && can('transfer_payment', 'delete', scope.value)))
const isWithinIntakeWindow = computed(() => {
  if (!profile.value) return false
  const today = new Date().toISOString().slice(0, 10)
  return toDateInput(profile.value.egcs_fo_datestart) <= today
    && toDateInput(profile.value.egcs_fo_dateend) >= today
})
const canCreateIntake = computed(() => Boolean(scope.value && isWritable.value && !statusDefinition.value?.isDraft
  && isWithinIntakeWindow.value && can('funding_case', 'create', scope.value)))
const modalOpen = ref(false)
const pending = ref(false)
const form = ref<OpportunityForm>({ egcs_fo_transferpaymentstreams: [], egcs_fo_applicationschema: null })
/**
 *
 */
const edit = () => {
  if (!profile.value) return
  form.value = {
    id: profile.value.id,
    program_id: profile.value.program_id,
    egcs_fo_transferpaymentstreams: profile.value.egcs_fo_transferpaymentstreams,
    egcs_fo_datestart: toDateInput(profile.value.egcs_fo_datestart),
    egcs_fo_dateend: toDateInput(profile.value.egcs_fo_dateend),
    egcs_fo_name_en: profile.value.egcs_fo_name_en,
    egcs_fo_name_fr: profile.value.egcs_fo_name_fr,
    egcs_fo_objective_en: profile.value.egcs_fo_objective_en,
    egcs_fo_objective_fr: profile.value.egcs_fo_objective_fr,
    egcs_fo_applicationschema: profile.value.egcs_fo_applicationschema
  }
  modalOpen.value = true
}
/**
 *
 */
const submit = async () => {
  if (pending.value || !profile.value) return
  pending.value = true
  try {
    const body = {
      egcs_fo_transferpaymentstreams: form.value.egcs_fo_transferpaymentstreams,
      egcs_fo_datestart: form.value.egcs_fo_datestart,
      egcs_fo_dateend: form.value.egcs_fo_dateend,
      egcs_fo_name_en: form.value.egcs_fo_name_en,
      egcs_fo_name_fr: form.value.egcs_fo_name_fr,
      egcs_fo_objective_en: form.value.egcs_fo_objective_en,
      egcs_fo_objective_fr: form.value.egcs_fo_objective_fr,
      egcs_fo_applicationschema: form.value.egcs_fo_applicationschema
    }
    const response = await fetch(getClientRequestUrl(`/api/funding-opportunities/${id}`), {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
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
    if (!await confirmDeleteRequest(`/api/funding-opportunities/${id}`)) return
    await navigateTo(localePath(appRouteLocations.fundingOpportunities()))
  } catch (cause: unknown) {
    showError(cause)
  }
}
const breadcrumbs = computed(() => [
  { label: t('funding_opportunity.title'), to: localePath(appRouteLocations.fundingOpportunities()) },
  { label: profile.value ? getBilingualValue(profile.value, 'egcs_fo_name', id) : id }
])
</script>

<template>
  <UDashboardPanel id="funding-opportunity-detail">
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
        <CommonEntityHero :is-collapsed="isHeroCollapsed" icon="i-lucide-megaphone" :title="getBilingualValue(profile, 'egcs_fo_name', id)" :description="getBilingualValue(profile, 'egcs_fo_objective', '')" :badges="[{ statusId: String(profile.egcs_fo_status) }]" :actions="[{ label: t('funding_case_intake.create'), icon: 'i-lucide-plus', visible: canCreateIntake, to: localePath({ ...appRouteLocations.fundingCaseIntakes(), query: { opportunity_id: id } }) }, { label: t('common.edit'), icon: 'i-lucide-edit-3', visible: canEdit, onClick: edit }, { label: t('common.delete'), icon: 'i-lucide-trash', visible: canDelete, onClick: remove }]" />
        <CommonEntityEditorWorkspace content-test-id="funding-opportunity-detail-content">
          <template #sidebar>
            <CommonRouteTabs v-model="selectedTab" :items="tabs" orientation="vertical" :ui="{ root: 'w-full', list: 'w-full flex-col items-stretch p-0', trigger: 'w-full justify-start' }" />
          </template>
          <CommonSection v-if="selectedTab === 'general'" :title="t('funding_opportunity.details')" :grid-cols="1">
            <dl class="grid gap-4 md:grid-cols-2">
              <div>
                <dt class="text-sm text-muted">
                  {{ t('funding_opportunity.program') }}
                </dt><dd>{{ getBilingualValue(profile, 'program_name', profile.program_id) }}</dd>
              </div>
              <div>
                <dt class="text-sm text-muted">
                  {{ t('funding_opportunity.streams') }}
                </dt>
                <dd v-for="stream in profile.streams" :key="stream.id">
                  {{ getBilingualValue(stream, 'name', stream.id) }}
                </dd>
              </div>
              <div>
                <dt class="text-sm text-muted">
                  {{ t('funding_opportunity.name_en') }}
                </dt><dd>{{ profile.egcs_fo_name_en }}</dd>
              </div>
              <div>
                <dt class="text-sm text-muted">
                  {{ t('funding_opportunity.name_fr') }}
                </dt><dd>{{ profile.egcs_fo_name_fr }}</dd>
              </div>
              <div>
                <dt class="text-sm text-muted">
                  {{ t('funding_opportunity.start_date') }}
                </dt><dd>{{ toDateInput(profile.egcs_fo_datestart) }}</dd>
              </div>
              <div>
                <dt class="text-sm text-muted">
                  {{ t('funding_opportunity.end_date') }}
                </dt><dd>{{ toDateInput(profile.egcs_fo_dateend) }}</dd>
              </div>
              <div>
                <dt class="text-sm text-muted">
                  {{ t('funding_opportunity.objective_en') }}
                </dt>
                <dd class="whitespace-pre-wrap">
                  {{ profile.egcs_fo_objective_en }}
                </dd>
              </div>
              <div>
                <dt class="text-sm text-muted">
                  {{ t('funding_opportunity.objective_fr') }}
                </dt>
                <dd class="whitespace-pre-wrap">
                  {{ profile.egcs_fo_objective_fr }}
                </dd>
              </div>
            </dl>
          </CommonSection>
          <FundingOpportunitySetupRelationshipsTab v-else-if="selectedTab === 'workflows'" :opportunity-id="id" :stream-ids="profile.egcs_fo_transferpaymentstreams" :linked-setups="profile.workflow_setups" kind="workflow" :can-edit="canEdit" @refresh="refresh" />
          <FundingOpportunitySetupRelationshipsTab v-else-if="selectedTab === 'reviews'" :opportunity-id="id" :stream-ids="profile.egcs_fo_transferpaymentstreams" :linked-setups="profile.review_setups" kind="review" :can-edit="canEdit" @refresh="refresh" />
          <FundingOpportunityAttachmentTypesTab v-else-if="selectedTab === 'attachments'" :opportunity-id="id" :attachment-types="profile.egcs_fo_attachmenttypes" :can-edit="canEdit" @updated="refresh" />
          <ExtensionEntityTabPanel v-else-if="selectedExtensionTab" :item="selectedExtensionTab" />
        </CommonEntityEditorWorkspace>
      </div>
      <FundingOpportunityModal v-model:open="modalOpen" v-model:state="form" :pending="pending" @submit="submit" />
    </template>
  </UDashboardPanel>
</template>
