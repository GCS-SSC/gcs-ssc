<script setup lang="ts">
import type { ComputedRef, Ref } from 'vue'
import type { TableColumnInput } from '~/composables/useTableColumns'
import type { AssignableEntityType } from '~~/shared/types/database'
import { ASSIGNABLE_ENTITY_TYPE_ENUM } from '~~/shared/constants/enums'
import type { BusinessRecordStateFields } from '~~/shared/types/business-record-state'

definePageMeta({ i18n: { paths: { en: '/assignment-management', fr: '/gestion-des-affectations' } } })
type Row = BusinessRecordStateFields & {
  entity_id: string; entity_type: AssignableEntityType; stable_reference: string
  label_en: string; label_fr: string; status: string; agency_name_en: string; agency_name_fr: string
  program_name_en: string | null; program_name_fr: string | null
  primary_assignee: string; primary_eligible: boolean; assignee_count: number
}
const { t } = useI18n()
const { getBilingualValue } = useBilingualValue()
const { getHeroCollapsed } = useDashboard()
const isHeroCollapsed = getHeroCollapsed('assignment-management')
const selected: Ref<Row | null> = ref(null)
const entityType: Ref<AssignableEntityType | 'all'> = ref('all')
const resourceQuery: ComputedRef<{ entityType?: AssignableEntityType }> = computed(() => ({
  entityType: entityType.value === 'all' ? undefined : entityType.value
}))
const entityTypeOptions = computed(() => [
  { label: t('common.all'), value: 'all' },
  ...ASSIGNABLE_ENTITY_TYPE_ENUM.map(value => ({
    label: t(`assignments.entity_types.${value}`),
    value
  }))
])
const {
  search,
  pagination,
  items,
  totalRecords,
  response,
  status,
  error,
  retry
} = useResourceTable<Row>({
  fetchUrl: '/api/assignment-management',
  initialPageSize: 20,
  query: resourceQuery
})
const { showError } = useApiErrorToast()
watch(error, requestError => {
  if (requestError) showError(requestError)
})
watch(entityType, () => {
  pagination.value.pageIndex = 0
})
const heroStats = computed(() => [{
  label: t('assignment_management.total'),
  value: response.value?.stats?.total ?? totalRecords.value
}])
const columns: TableColumnInput<Row>[] = [
  { id: 'label', accessorKey: 'label_en', headerKey: 'assignment_management.target' },
  { id: 'status', accessorKey: 'status', headerKey: 'common.status' },
  { id: 'owner', accessorKey: 'agency_name_en', headerKey: 'assignment_management.owner' },
  { id: 'primary', accessorKey: 'primary_assignee', headerKey: 'assignments.primary' },
  { id: 'count', accessorKey: 'assignee_count', headerKey: 'assignment_management.assignee_count' },
  { id: 'actions', headerKey: 'common.actions' }
]
</script>

<template>
  <UDashboardPanel id="assignment-management">
    <template #header>
      <UDashboardNavbar :title="t('assignment_management.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template><template #right>
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
      <div class="flex flex-1 flex-col overflow-hidden">
        <CommonEntityHero
          :is-collapsed="isHeroCollapsed"
          icon="i-lucide-users-round"
          :title="t('assignment_management.title')"
          :description="t('assignment_management.description')"
          :stats="heroStats" />
        <CommonResourceLayoutPage
          v-model:search="search"
          v-model:pagination="pagination"
          :columns="columns"
          :data="items"
          :total-records="totalRecords"
          :loading="status === 'pending'"
          :request-status="status"
          :show-button="false"
          @retry="retry">
          <template #filters>
            <CommonEnumSelect
              v-model="entityType"
              name="entity_type"
              :items="entityTypeOptions"
              icon="i-lucide-layers-3"
              class="min-w-52" />
          </template>
          <template #label-cell="{ row }">
            <div class="space-y-1.5">
              <CommonBilingualName :name-en="row.original.label_en" :name-fr="row.original.label_fr" />
              <div class="flex flex-wrap items-center gap-2">
                <CommonStatusBadge
                  variant="meta"
                  size="sm"
                  :label="t(`assignments.entity_types.${row.original.entity_type}`)" />
                <span class="font-mono text-xs text-muted">{{ row.original.stable_reference }}</span>
              </div>
            </div>
          </template>
          <template #status-cell="{ row }">
            <CommonAssignedWorkStatusBadge
              :entity-type="row.original.entity_type"
              :status="row.original.status"
              :is-completed="row.original.isCompleted" />
          </template>
          <template #owner-cell="{ row }">
            <div class="space-y-1">
              <CommonBilingualName :name-en="row.original.agency_name_en" :name-fr="row.original.agency_name_fr" />
              <p v-if="row.original.program_name_en && row.original.program_name_fr" class="text-xs text-muted">
                {{ getBilingualValue(row.original, 'program', '') }}
              </p>
            </div>
          </template>
          <template #primary-cell="{ row }">
            <span>{{ row.original.primary_assignee }}</span><UBadge v-if="!row.original.primary_eligible" color="warning" variant="subtle" class="ml-2">
              {{ t('assignments.ineligible') }}
            </UBadge>
          </template>
          <template #actions-cell="{ row }">
            <UButton icon="i-lucide-users" variant="soft" :label="`${t('assignments.manage')}: ${getBilingualValue(row.original, 'label', row.original.stable_reference)}`" @click="selected = row.original" />
          </template>
        </CommonResourceLayoutPage>
      </div>
      <UModal
        :open="selected !== null"
        :title="t('assignments.title')"
        :description="t('assignments.description')"
        @update:open="open => { if (!open) selected = null }">
        <template #body>
          <CommonAssignedUsers v-if="selected" :entity-type="selected.entity_type" :entity-id="selected.entity_id" @changed="retry" />
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
