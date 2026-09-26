<script setup lang="ts">
import { appRouteLocations } from '~/utils/route-locations'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'
import type { OpportunityForm } from '~/components/FundingOpportunity/OpportunityModal.vue'

definePageMeta({ i18n: { paths: { en: '/funding-opportunities/[id]', fr: '/possibilites-de-financement/[id]' } } })

type Opportunity = OpportunityForm & {
  id: string; agency_id: string; program_id: string
  stream_name_en: string; stream_name_fr: string
  review_setups: Array<{ id: string; name_en: string; name_fr: string }>
  workflow_setups: Array<{ id: string; name_en: string; name_fr: string }>
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
const { data: profile, error, status, refresh } = await useFetch<Opportunity, Error, string>(`/api/funding-opportunities/${id}`)
const isHeroCollapsed = getHeroCollapsed('funding-opportunity-detail')
const selectedTab = ref('general')
const tabs = computed(() => [
  { key: 'funding_opportunity.details', value: 'general', icon: 'i-lucide-file-text' },
  { key: 'funding_opportunity.eligibility', value: 'eligibility', icon: 'i-lucide-list-checks' }
])
const scope = computed(() => profile.value && ({
  type: 'entity' as const, agencyId: String(profile.value.agency_id),
  path: [
    { type: 'transfer_payment' as const, id: String(profile.value.program_id) },
    { type: 'transfer_payment_stream' as const, id: String(profile.value.egcs_fo_transferpaymentstream) }
  ]
}))
const canEdit = computed(() => Boolean(scope.value && can('transfer_payment', 'update', scope.value)))
const canDelete = computed(() => Boolean(scope.value && can('transfer_payment', 'delete', scope.value)))
const canCreateIntake = computed(() => Boolean(scope.value && profile.value?.egcs_fo_status === 'open'
  && can('funding_case', 'create', scope.value)))
const modalOpen = ref(false)
const pending = ref(false)
const form = ref<OpportunityForm>({ egcs_fo_status: 'draft', egcs_fo_applicationschema: null, egcs_fo_reviewsetups: [], egcs_fo_workflowsetups: [] })
/**
 *
 */
const edit = () => {
  if (!profile.value) return
  form.value = {
    ...profile.value,
    egcs_fo_datestart: toDateInput(profile.value.egcs_fo_datestart),
    egcs_fo_dateend: toDateInput(profile.value.egcs_fo_dateend)
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
      egcs_fo_datestart: form.value.egcs_fo_datestart,
      egcs_fo_dateend: form.value.egcs_fo_dateend,
      egcs_fo_name_en: form.value.egcs_fo_name_en,
      egcs_fo_name_fr: form.value.egcs_fo_name_fr,
      egcs_fo_objective_en: form.value.egcs_fo_objective_en,
      egcs_fo_objective_fr: form.value.egcs_fo_objective_fr,
      egcs_fo_applicationschema: form.value.egcs_fo_applicationschema,
      egcs_fo_status: form.value.egcs_fo_status,
      egcs_fo_reviewsetups: form.value.egcs_fo_reviewsetups,
      egcs_fo_workflowsetups: form.value.egcs_fo_workflowsetups
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
        <CommonEntityHero :is-collapsed="isHeroCollapsed" icon="i-lucide-megaphone" :title="getBilingualValue(profile, 'egcs_fo_name', id)" :description="getBilingualValue(profile, 'egcs_fo_objective', '')" :badges="[{ label: t(`funding_opportunity.${profile.egcs_fo_status}`) }]" :actions="[{ label: t('funding_case_intake.create'), icon: 'i-lucide-plus', visible: canCreateIntake, to: localePath({ ...appRouteLocations.fundingCaseIntakes(), query: { opportunity_id: id } }) }, { label: t('common.edit'), icon: 'i-lucide-edit-3', visible: canEdit, onClick: edit }, { label: t('common.delete'), icon: 'i-lucide-trash', visible: canDelete, onClick: remove }]" />
        <CommonEntityEditorWorkspace content-test-id="funding-opportunity-detail-content">
          <template #sidebar>
            <CommonRouteTabs v-model="selectedTab" :items="tabs" orientation="vertical" :ui="{ root: 'w-full', list: 'w-full flex-col items-stretch p-0', trigger: 'w-full justify-start' }" />
          </template>
          <CommonSection v-if="selectedTab === 'general'" :title="t('funding_opportunity.details')" :grid-cols="1">
            <dl class="grid gap-4 md:grid-cols-2">
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
                  {{ t('funding_opportunity.stream') }}
                </dt><dd>{{ getBilingualValue(profile, 'stream_name', profile.egcs_fo_transferpaymentstream) }}</dd>
              </div>
            </dl>
          </CommonSection>
          <CommonSection v-else :title="t('funding_opportunity.eligibility')" :grid-cols="1">
            <p class="text-sm text-muted">
              {{ t('funding_opportunity.eligibility_help') }}
            </p>
            <dl class="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <dt class="text-sm text-muted">
                  {{ t('funding_opportunity.review_setups') }}
                </dt>
                <dd v-for="setup in profile.review_setups" :key="setup.id">
                  {{ getBilingualValue(setup, 'name', setup.id) }}
                </dd>
                <dd v-if="!profile.review_setups.length">
                  {{ t('common.none') }}
                </dd>
              </div>
              <div>
                <dt class="text-sm text-muted">
                  {{ t('funding_opportunity.workflow_setups') }}
                </dt>
                <dd v-for="setup in profile.workflow_setups" :key="setup.id">
                  {{ getBilingualValue(setup, 'name', setup.id) }}
                </dd>
                <dd v-if="!profile.workflow_setups.length">
                  {{ t('common.none') }}
                </dd>
              </div>
            </dl>
          </CommonSection>
        </CommonEntityEditorWorkspace>
      </div>
      <FundingOpportunityOpportunityModal v-model:open="modalOpen" v-model:state="form" :pending="pending" @submit="submit" />
    </template>
  </UDashboardPanel>
</template>
