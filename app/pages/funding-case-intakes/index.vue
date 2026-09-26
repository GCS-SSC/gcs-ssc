<script setup lang="ts">
import { appRouteLocations } from '~/utils/route-locations'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'
import type { TableColumnInput } from '~/composables/useTableColumns'
import type { IntakeForm } from '~/components/FundingCaseIntake/IntakeModal.vue'

definePageMeta({ i18n: { paths: { en: '/funding-case-intakes', fr: '/dossiers-de-financement' } } })

type Row = {
  id: string; egcs_fi_applicationid: string; egcs_fi_fundingopportunity: string
  egcs_fi_applicantrecipient: string; egcs_fi_status: string
  opportunity_name_en: string; opportunity_name_fr: string
  proponent_name_en: string | null; proponent_name_fr: string | null
}
const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const { canAny } = useCan()
const { getBilingualValue } = useBilingualValue()
const { showError } = useApiErrorToast()
const { getHeroCollapsed } = useDashboard()
const { search, pagination, items, totalRecords, refresh, retry, status } = useResourceTable<Row>({ fetchUrl: '/api/funding-case-intakes' })
const isHeroCollapsed = getHeroCollapsed('funding-case-intakes')
const canCreate = computed(() => canAny('funding_case', 'create'))
const columns: TableColumnInput<Row>[] = [
  { accessorKey: 'egcs_fi_applicationid', headerKey: 'funding_case_intake.application_id' },
  { id: 'opportunity', headerKey: 'funding_case_intake.opportunity' },
  { id: 'proponent', headerKey: 'funding_case_intake.proponent' },
  { id: 'status', headerKey: 'funding_opportunity.status' },
  { id: 'actions', headerKey: 'common.actions' }
]
const modalOpen = ref(false)
const pending = ref(false)
const form = ref<IntakeForm>({ egcs_fi_applicationid: '', egcs_fi_application: '{}' })
/**
 *
 */
const openCreate = () => {
  form.value = {
    egcs_fi_applicationid: '',
    egcs_fi_application: '{}',
    egcs_fi_fundingopportunity: typeof route.query.opportunity_id === 'string' ? route.query.opportunity_id : undefined
  }
  modalOpen.value = true
}
watch([() => route.query.opportunity_id, canCreate], ([value, allowed]) => {
  if (typeof value === 'string' && allowed && !modalOpen.value) openCreate()
}, { immediate: true })
/**
 *
 */
const submit = async () => {
  if (pending.value) return
  pending.value = true
  try {
    const response = await fetch(getClientRequestUrl('/api/funding-case-intakes'), {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...form.value, egcs_fi_application: JSON.parse(form.value.egcs_fi_application) })
    })
    if (!response.ok) await throwFetchResponseError(response)
    const created = await response.json() as { id: string }
    modalOpen.value = false
    await refresh()
    await navigateTo(localePath(appRouteLocations.fundingCaseIntakeDetail(String(created.id))))
  } catch (error: unknown) {
    showError(error)
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="funding-case-intakes">
    <template #header>
      <UDashboardNavbar :title="t('funding_case_intake.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
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
      <CommonEntityHero :is-collapsed="isHeroCollapsed" icon="i-lucide-inbox" :title="t('funding_case_intake.title')" :description="t('funding_case_intake.description')" />
      <CommonResourceLayoutPage v-model:search="search" v-model:pagination="pagination" :data="items" :columns="columns" :total-records="totalRecords" :request-status="status" :show-button="canCreate" :button-label="t('funding_case_intake.create')" @add="openCreate" @retry="retry">
        <template #egcs_fi_applicationid-cell="{ row }">
          <UButton variant="link" :label="String(row.original.egcs_fi_applicationid)" :to="localePath(appRouteLocations.fundingCaseIntakeDetail(String(row.original.id)))" />
        </template>
        <template #opportunity-cell="{ row }">
          {{ getBilingualValue(row.original, 'opportunity_name', row.original.egcs_fi_fundingopportunity) }}
        </template>
        <template #proponent-cell="{ row }">
          {{ getBilingualValue(row.original, 'proponent_name', row.original.egcs_fi_applicantrecipient) }}
        </template>
        <template #status-cell="{ row }">
          <CommonStatusBadge :status-id="row.original.egcs_fi_status" />
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end gap-2">
            <UButton icon="i-lucide-eye" color="neutral" variant="ghost" :aria-label="t('funding_case_intake.view_details')" :to="localePath(appRouteLocations.fundingCaseIntakeDetail(String(row.original.id)))" />
          </div>
        </template>
      </CommonResourceLayoutPage>
      <FundingCaseIntakeModal v-model:open="modalOpen" v-model:state="form" :pending="pending" @submit="submit" />
    </template>
  </UDashboardPanel>
</template>
