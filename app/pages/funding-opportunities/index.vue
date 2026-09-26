<script setup lang="ts">
import { appRouteLocations } from '~/utils/route-locations'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'
import type { TableColumnInput } from '~/composables/useTableColumns'
import type { OpportunityForm } from '~/components/FundingOpportunity/OpportunityModal.vue'

definePageMeta({ i18n: { paths: { en: '/funding-opportunities', fr: '/possibilites-de-financement' } } })

type Row = OpportunityForm & { id: string }
const { t } = useI18n()
const localePath = useLocalePath()
const { canAny } = useCan()
const { showError } = useApiErrorToast()
const { getHeroCollapsed } = useDashboard()
const { search, pagination, items, totalRecords, refresh, retry, status } = useResourceTable<Row>({ fetchUrl: '/api/funding-opportunities' })
const isHeroCollapsed = getHeroCollapsed('funding-opportunities')
const canCreate = computed(() => canAny('transfer_payment', 'create'))
const columns: TableColumnInput<Row>[] = [
  { accessorKey: 'egcs_fo_name_en', headerKey: 'funding_opportunity.name_en' },
  { accessorKey: 'egcs_fo_datestart', headerKey: 'funding_opportunity.start_date' },
  { accessorKey: 'egcs_fo_dateend', headerKey: 'funding_opportunity.end_date' },
  { accessorKey: 'egcs_fo_status', headerKey: 'funding_opportunity.status' }
]
const modalOpen = ref(false)
const pending = ref(false)
const form = ref<OpportunityForm>({ egcs_fo_status: 'draft', egcs_fo_applicationschema: null, egcs_fo_reviewsetups: [], egcs_fo_workflowsetups: [] })
const openCreate = () => {
  form.value = { egcs_fo_status: 'draft', egcs_fo_applicationschema: null, egcs_fo_reviewsetups: [], egcs_fo_workflowsetups: [] }
  modalOpen.value = true
}
/**
 *
 */
const submit = async () => {
  if (pending.value) return
  pending.value = true
  try {
    const response = await fetch(getClientRequestUrl('/api/funding-opportunities'), {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form.value)
    })
    if (!response.ok) await throwFetchResponseError(response)
    const created = await response.json() as { id: string }
    modalOpen.value = false
    await refresh()
    await navigateTo(localePath(appRouteLocations.fundingOpportunityDetail(String(created.id))))
  } catch (error: unknown) {
    showError(error)
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="funding-opportunities">
    <template #header>
      <UDashboardNavbar :title="t('funding_opportunity.title')">
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
      <CommonEntityHero :is-collapsed="isHeroCollapsed" icon="i-lucide-megaphone" :title="t('funding_opportunity.title')" :description="t('funding_opportunity.description')" />
      <CommonResourceLayoutPage v-model:search="search" v-model:pagination="pagination" :data="items" :columns="columns" :total-records="totalRecords" :request-status="status" :show-button="canCreate" :button-label="t('funding_opportunity.create')" @add="openCreate" @retry="retry">
        <template #egcs_fo_name_en-cell="{ row }">
          <CommonBilingualName :name-en="row.original.egcs_fo_name_en" :name-fr="row.original.egcs_fo_name_fr" :to="localePath(appRouteLocations.fundingOpportunityDetail(String(row.original.id)))" />
        </template>
        <template #egcs_fo_status-cell="{ row }">
          <UBadge color="neutral" variant="soft">
            {{ t(`funding_opportunity.${row.original.egcs_fo_status}`) }}
          </UBadge>
        </template>
      </CommonResourceLayoutPage>
      <FundingOpportunityOpportunityModal v-model:open="modalOpen" v-model:state="form" :pending="pending" @submit="submit" />
    </template>
  </UDashboardPanel>
</template>
