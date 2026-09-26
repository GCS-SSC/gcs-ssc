<script setup lang="ts">
import { appRouteLocations } from '~/utils/route-locations'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'
import type { TableColumnInput } from '~/composables/useTableColumns'
import type { OpportunityForm } from '~/components/FundingOpportunity/OpportunityModal.vue'

definePageMeta({ i18n: { paths: { en: '/funding-opportunities', fr: '/possibilites-de-financement' } } })

type Row = OpportunityForm & {
  id: string
  egcs_fo_status: 'draft' | 'open' | 'closed'
  streams: Array<{ id: string; name_en: string; name_fr: string }>
}
const { t, locale } = useI18n()
const localePath = useLocalePath()
const { canAny } = useCan()
const { showError } = useApiErrorToast()
const { getHeroCollapsed } = useDashboard()
const { search, pagination, items, totalRecords, refresh, retry, status } = useResourceTable<Row>({ fetchUrl: '/api/funding-opportunities' })
const isHeroCollapsed = getHeroCollapsed('funding-opportunities')
const canCreate = computed(() => canAny('transfer_payment', 'create'))
const columns: TableColumnInput<Row>[] = [
  { accessorKey: 'egcs_fo_name_en', headerKey: 'funding_opportunity.name_en' },
  { id: 'streams', headerKey: 'funding_opportunity.streams' },
  { accessorKey: 'egcs_fo_datestart', headerKey: 'funding_opportunity.start_date' },
  { accessorKey: 'egcs_fo_dateend', headerKey: 'funding_opportunity.end_date' },
  { accessorKey: 'egcs_fo_status', headerKey: 'funding_opportunity.status' },
  { id: 'actions', headerKey: 'common.actions' }
]
const modalOpen = ref(false)
const pending = ref(false)
/**
 * Builds a complete, empty create form so every controlled text field has an initial value.
 *
 * @returns Empty Opportunity form values.
 */
const emptyForm = (): OpportunityForm => ({
  egcs_fo_transferpaymentstreams: [],
  egcs_fo_name_en: '',
  egcs_fo_name_fr: '',
  egcs_fo_objective_en: '',
  egcs_fo_objective_fr: '',
  egcs_fo_applicationschema: null
})
const form = ref<OpportunityForm>(emptyForm())
const openCreate = () => {
  form.value = emptyForm()
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
        <template #streams-cell="{ row }">
          <div class="flex flex-wrap gap-1">
            <UBadge v-for="stream in row.original.streams" :key="stream.id" color="neutral" variant="soft">
              {{ locale === 'fr' ? stream.name_fr : stream.name_en }}
            </UBadge>
          </div>
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end gap-2">
            <UButton icon="i-lucide-eye" color="neutral" variant="ghost" :aria-label="t('funding_opportunity.view_details')" :to="localePath(appRouteLocations.fundingOpportunityDetail(String(row.original.id)))" />
          </div>
        </template>
      </CommonResourceLayoutPage>
      <FundingOpportunityModal v-model:open="modalOpen" v-model:state="form" :pending="pending" @submit="submit" />
    </template>
  </UDashboardPanel>
</template>
