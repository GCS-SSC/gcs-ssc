<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param-description, jsdoc/require-returns -- page-local callbacks use self-descriptive signatures */
import type { FetchError } from 'ofetch'
import { useBusinessStatusState } from '~/composables/useBusinessStatusState'
import { computed, ref, shallowReactive, watch, watchEffect } from 'vue'
import type { Ref } from 'vue'
import CommonCompletionPanel from '~/components/Common/Completions/Panel.vue'
import { useExtensionEntityTabs } from '~/composables/useExtensionEntityTabs'
import type { CrudModalSession } from '~/composables/useCrudModal'
import {
  buildAgreementMonitorResourceSaveRequest,
  type AgreementMonitorResourcePath
} from '~/utils/agreement-monitor-resource-save'
import { appRouteLocations, authorizedRouteLocation } from '~/utils/route-locations'
import type { EntityAssignmentContext } from '~~/shared/types/schemas/entity-assignment'
import type {
  FundingCaseAgreementMonitorDetailRow,
  FundingCaseAgreementMonitorFindingForm,
  FundingCaseAgreementMonitorFindingRow,
  FundingCaseAgreementMonitorFollowupForm,
  FundingCaseAgreementMonitorFollowupRow,
  FundingCaseAgreementMonitorFollowupUpdateForm,
  FundingCaseAgreementMonitorFollowupUpdateRow,
  FundingCaseAgreementMonitorForm,
  FundingCaseAgreementMonitorItemsForm,
  FundingCaseAgreementMonitorItemsRow,
  FundingCaseAgreementMonitorPlanningForm,
  FundingCaseAgreementMonitorPlanningRow,
  FundingCaseAgreementMonitorPromisingPracticeForm,
  FundingCaseAgreementMonitorPromisingPracticeRow
} from '~~/shared/types/funding-case-agreement-ui'
import {
  FundingCaseAgreementMonitorFindingCreateSchema,
  FundingCaseAgreementMonitorFollowupCreateSchema,
  FundingCaseAgreementMonitorFollowupUpdateCreateSchema,
  FundingCaseAgreementMonitorItemsCreateSchema,
  FundingCaseAgreementMonitorPatchSchema,
  FundingCaseAgreementMonitorPlanningCreateSchema,
  FundingCaseAgreementMonitorPromisingPracticeCreateSchema
} from '~~/shared/types/schemas'

definePageMeta({
  key: route => route.fullPath,
  i18n: {
    paths: {
      en: '/agreements/[id]/monitors/[monitorId]',
      fr: '/ententes/[id]/surveillances/[monitorId]'
    }
  }
})

const { t } = useI18n()
const route = useRoute()
const localePath = useLocalePath()
const toast = useToast()
const { getHeroCollapsed } = useDashboard()
const { createValidator } = useZodI18n()
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const { getBilingualValue } = useBilingualValue()
const { formatDate, toDateInput } = useDateHelpers()
const { saveJson } = useJsonRequest()
const { isRecordLocked } = useBusinessStatusState()

const agreementId = route.params.id as string
const monitorId = route.params.monitorId as string
const { isAssigned } = useEntityAssignmentRoster('fundingcasemonitor', monitorId)
const isHeroCollapsed = getHeroCollapsed('agreement-monitor-detail')
const itemSearch: Ref<string> = ref('')
const planningSearch: Ref<string> = ref('')
const findingSearch: Ref<string> = ref('')
const followupSearch: Ref<string> = ref('')
const practiceSearch: Ref<string> = ref('')
const planningPagination: Ref<{ pageIndex: number, pageSize: number }> = ref({ pageIndex: 0, pageSize: 25 })
const itemPagination: Ref<{ pageIndex: number, pageSize: number }> = ref({ pageIndex: 0, pageSize: 25 })
const findingPagination: Ref<{ pageIndex: number, pageSize: number }> = ref({ pageIndex: 0, pageSize: 25 })
const followupPagination: Ref<{ pageIndex: number, pageSize: number }> = ref({ pageIndex: 0, pageSize: 25 })
const practicePagination: Ref<{ pageIndex: number, pageSize: number }> = ref({ pageIndex: 0, pageSize: 25 })
const selectedMonitorTab: Ref<string> = ref('planning')
const {
  tabs: extensionTabs,
  getExtensionTabItem
} = useExtensionEntityTabs({
  target: 'monitor',
  monitorId
})
const monitorMetadata: Ref<FundingCaseAgreementMonitorForm | null> = ref(null)
const isSavingMonitorMetadata: Ref<boolean> = ref(false)
const approvalsRefreshKey: Ref<number> = ref(0)

const {
  data: profile,
  error: profileError,
  status: profileStatus,
  refresh: refreshProfile
} = useFetch<EntityAssignmentContext, FetchError, string>(`/api/entity-assignments/fundingcasemonitor/${monitorId}/context`)
const {
  data: monitor,
  error: monitorError,
  status: monitorStatus,
  refresh: refreshMonitor
} = useFetch<FundingCaseAgreementMonitorDetailRow, FetchError, string>(
  `/api/agreements/${agreementId}/monitors/${monitorId}`
)
const hasLoadError = computed(() => Boolean(profileError.value) || Boolean(monitorError.value) || profileStatus.value === 'error' || monitorStatus.value === 'error')
const isLoadingDetail = computed(() => profileStatus.value === 'pending' || monitorStatus.value === 'pending')
const retryLoad = async () => {
  await Promise.all([refreshProfile(), refreshMonitor()])
}

const planningModal = useCrudModal<FundingCaseAgreementMonitorPlanningRow, FundingCaseAgreementMonitorPlanningForm>({
  createState: () => ({ egcs_fc_fundingagreementmonitor: monitorId }),
  updateState: item => ({ id: item.id, egcs_fc_fundingagreementmonitor: item.egcs_fc_fundingagreementmonitor, egcs_fc_objective: item.egcs_fc_objective })
})
const itemModal = useCrudModal<FundingCaseAgreementMonitorItemsRow, FundingCaseAgreementMonitorItemsForm>({
  createState: () => ({ egcs_fc_fundingagreementmonitor: monitorId, egcs_fc_monitored: false }),
  /**
   *
   * @param item
   */
  updateState: item => ({
    id: item.id,
    egcs_fc_fundingagreementmonitor: item.egcs_fc_fundingagreementmonitor,
    egcs_fc_item: item.egcs_fc_item,
    egcs_fc_plannedstart: toDateInput(item.egcs_fc_plannedstart),
    egcs_fc_plannedend: toDateInput(item.egcs_fc_plannedend),
    egcs_fc_detail: item.egcs_fc_detail,
    egcs_fc_monitored: item.egcs_fc_monitored,
    egcs_fc_actualstart: item.egcs_fc_actualstart ? toDateInput(item.egcs_fc_actualstart) : null,
    egcs_fc_actualend: item.egcs_fc_actualend ? toDateInput(item.egcs_fc_actualend) : null
  })
})
const findingModal = useCrudModal<FundingCaseAgreementMonitorFindingRow, FundingCaseAgreementMonitorFindingForm>({
  createState: () => ({ egcs_fc_fundingagreementmonitor: monitorId }),
  updateState: item => ({ ...item })
})
const followupModal = useCrudModal<FundingCaseAgreementMonitorFollowupRow, FundingCaseAgreementMonitorFollowupForm>({
  createState: () => ({ egcs_fc_fundingagreementmonitor: monitorId }),
  /**
   *
   * @param item
   */
  updateState: item => ({
    id: item.id,
    egcs_fc_fundingagreementmonitor: item.egcs_fc_fundingagreementmonitor,
    egcs_fc_followupname: item.egcs_fc_followupname,
    egcs_fc_responsibleparty: item.egcs_fc_responsibleparty,
    egcs_fc_duedate: toDateInput(item.egcs_fc_duedate)
  })
})
const updateModal = useCrudModal<FundingCaseAgreementMonitorFollowupUpdateRow, FundingCaseAgreementMonitorFollowupUpdateForm>({
  createState: () => ({ egcs_fc_status: 'open', egcs_fc_updatedate: toDateInput(new Date().toISOString()) }),
  updateState: item => ({ ...item, egcs_fc_updatedate: toDateInput(item.egcs_fc_updatedate) })
})
const practiceModal = useCrudModal<FundingCaseAgreementMonitorPromisingPracticeRow, FundingCaseAgreementMonitorPromisingPracticeForm>({
  createState: () => ({ egcs_fc_fundingagreementmonitor: monitorId }),
  updateState: item => ({ ...item })
})

const selectedPlanning = planningModal.selected
const selectedItem = itemModal.selected
const selectedFinding = findingModal.selected
const selectedFollowup = followupModal.selected
const selectedUpdate = updateModal.selected
const selectedPractice = practiceModal.selected
const isPlanningModalOpen = planningModal.isOpen
const isItemModalOpen = itemModal.isOpen
const isFindingModalOpen = findingModal.isOpen
const isFollowupModalOpen = followupModal.isOpen
const isUpdateModalOpen = updateModal.isOpen
const isPracticeModalOpen = practiceModal.isOpen
const pendingResourceSessions = shallowReactive(new Set<string>())
const pendingResourceDeletes = shallowReactive(new Set<string>())
const viewedFollowup: Ref<FundingCaseAgreementMonitorFollowupRow | null> = ref(null)
const isUpdatesViewModalOpen: Ref<boolean> = ref(false)

const validatePlanning = createValidator(FundingCaseAgreementMonitorPlanningCreateSchema)
const validateItem = createValidator(FundingCaseAgreementMonitorItemsCreateSchema)
const validateFinding = createValidator(FundingCaseAgreementMonitorFindingCreateSchema)
const validateFollowup = createValidator(FundingCaseAgreementMonitorFollowupCreateSchema)
const validateUpdate = createValidator(FundingCaseAgreementMonitorFollowupUpdateCreateSchema)
const validatePractice = createValidator(FundingCaseAgreementMonitorPromisingPracticeCreateSchema)
const validateMonitorMetadata = createValidator(FundingCaseAgreementMonitorPatchSchema)

const isMonitorLocked = computed(() => isRecordLocked(monitor.value))
const canUpdateMonitor = computed(() =>
  isAssigned.value
  && !isMonitorLocked.value
)
const canCreateMonitorResource = computed(() =>
  isAssigned.value
  && !isMonitorLocked.value
)
const canDeleteMonitorResource = computed(() =>
  isAssigned.value
  && !isMonitorLocked.value
)
const planningRows = computed<FundingCaseAgreementMonitorPlanningRow[]>(() => monitor.value?.planning ?? [])
const itemRows = computed<FundingCaseAgreementMonitorItemsRow[]>(() => monitor.value?.items ?? [])
const findingRows = computed<FundingCaseAgreementMonitorFindingRow[]>(() => monitor.value?.findings ?? [])
const followupRows = computed<FundingCaseAgreementMonitorFollowupRow[]>(() => monitor.value?.followups ?? [])
const practiceRows = computed<FundingCaseAgreementMonitorPromisingPracticeRow[]>(() => monitor.value?.promisingPractices ?? [])
const followupUpdateRows = computed<FundingCaseAgreementMonitorFollowupUpdateRow[]>(() => monitor.value?.followupUpdates ?? [])
const breadcrumbItems = computed(() => [
  { label: t('agreement.title'), to: localePath(appRouteLocations.agreements()) },
  { label: getBilingualValue(profile.value, 'egcs_fc_title', agreementId), to: authorizedRouteLocation(profile.value?.can_read_agreement, localePath(appRouteLocations.agreementDetail(agreementId))) },
  { label: monitor.value ? getBilingualValue(monitor.value, 'monitor_type_name', monitorId) : monitorId }
])
const monitorTabs = computed(() => [
  {
    key: 'agreement.monitors.planning.title',
    value: 'planning',
    icon: 'i-lucide-target'
  },
  {
    key: 'agreement.monitors.items.title',
    value: 'items',
    icon: 'i-lucide-list-checks'
  },
  {
    key: 'agreement.monitors.findings.title',
    value: 'findings',
    icon: 'i-lucide-search-check'
  },
  {
    key: 'agreement.monitors.followups.title',
    value: 'followups',
    icon: 'i-lucide-message-square-more'
  },
  {
    key: 'agreement.monitors.promising_practices.title',
    value: 'promising-practices',
    icon: 'i-lucide-sparkles'
  },
  {
    key: 'agreement.monitors.workflow.title',
    value: 'workflow',
    icon: 'i-lucide-circle-check-big'
  },
  {
    key: 'workflow.title',
    value: 'workflows',
    icon: 'i-lucide-workflow'
  },
  {
    key: 'attachments.title',
    value: 'attachments',
    icon: 'i-lucide-paperclip'
  },
  {
    key: 'assignments.title',
    value: 'assignments',
    icon: 'i-lucide-users'
  },
  ...extensionTabs.value
])
const selectedExtensionTab = computed(() => getExtensionTabItem(selectedMonitorTab.value))

watch(
  [profileError, monitorError, profileStatus, monitorStatus],
  ([agreementError, detailError, agreementStatus, detailStatus]) => {
    if (agreementError || detailError || agreementStatus === 'error' || detailStatus === 'error') {
      showError(agreementError ?? detailError)
    }
  },
  { immediate: true }
)

watchEffect(() => {
  if (!monitor.value) {
    monitorMetadata.value = null
    return
  }

  monitorMetadata.value = {
    egcs_fc_type: monitor.value.egcs_fc_type,
    egcs_fc_onsite: monitor.value.egcs_fc_onsite,
    egcs_fc_tentativefiscalyear: monitor.value.egcs_fc_tentativefiscalyear,
    egcs_fc_tentativequarter: monitor.value.egcs_fc_tentativequarter
  }
})

const saveResource = async <T extends { id?: string | number }>(
  key: string,
  path: AgreementMonitorResourcePath,
  selected: Ref<T | null>,
  modal: {
    captureSession: () => CrudModalSession | null
    closeSession: (session: CrudModalSession | null) => boolean
  }
) => {
  if (!selected.value) return
  const resourceState = selected.value
  const isUpdate = Boolean(resourceState.id)
  const session = modal.captureSession()
  const pendingKey = `${key}:${session}`
  if (pendingResourceSessions.has(pendingKey)) return
  pendingResourceSessions.add(pendingKey)
  try {
    const request = buildAgreementMonitorResourceSaveRequest(agreementId, path, resourceState.id)
    await saveJson(
      request.url,
      request.method,
      resourceState
    )
    modal.closeSession(session)
    await refreshMonitor()
    toast.add({ title: t('common.success'), description: isUpdate ? t('common.updated_success') : t('common.added_success'), color: 'success' })
  } catch (error: unknown) {
    showError(error)
  } finally {
    pendingResourceSessions.delete(pendingKey)
  }
}

const isResourceSaving = (key: string, modal: { captureSession: () => CrudModalSession | null }) => (
  pendingResourceSessions.has(`${key}:${modal.captureSession()}`)
)

const savePlanning = async () => await saveResource('planning', 'monitor-planning', selectedPlanning, planningModal)
const saveItem = async () => await saveResource('item', 'monitor-items', selectedItem, itemModal)
const saveFinding = async () => await saveResource('finding', 'monitor-findings', selectedFinding, findingModal)
const saveFollowup = async () => await saveResource('followup', 'monitor-followups', selectedFollowup, followupModal)
const saveUpdate = async () => await saveResource('update', 'monitor-followup-updates', selectedUpdate, updateModal)
const savePractice = async () => await saveResource('practice', 'monitor-promising-practices', selectedPractice, practiceModal)

/**
 *
 */
const saveMonitorMetadata = async () => {
  if (!monitorMetadata.value || isSavingMonitorMetadata.value) {
    return
  }

  try {
    isSavingMonitorMetadata.value = true
    await saveJson(`/api/agreements/${agreementId}/monitors/${monitorId}`, 'PATCH', monitorMetadata.value)
    await refreshMonitor()
    toast.add({ title: t('common.success'), description: t('common.updated_success'), color: 'success' })
  } catch (error: unknown) {
    showError(error)
  } finally {
    isSavingMonitorMetadata.value = false
  }
}

/**
 *
 * @param path
 * @param id
 */
const deleteResource = async (path: AgreementMonitorResourcePath, id: string) => {
  const pendingKey = `${path}:${id}`
  if (pendingResourceDeletes.has(pendingKey)) return
  pendingResourceDeletes.add(pendingKey)
  try {
    const ok = await confirmDeleteRequest(`/api/agreements/${agreementId}/${path}/${id}`)
    if (!ok) return
    await refreshMonitor()
    toast.add({ title: t('common.success'), description: t('common.deleted_success'), color: 'success' })
  } catch (error: unknown) {
    showError(error)
  } finally {
    pendingResourceDeletes.delete(pendingKey)
  }
}

const isResourceDeleting = (path: AgreementMonitorResourcePath, id: string | number) => (
  pendingResourceDeletes.has(`${path}:${id}`)
)

/**
 *
 * @param start
 * @param end
 */
const formatMonitorDateRange = (start?: string | null, end?: string | null) => {
  const startLabel = start ? formatDate(start) : t('common.none')
  const endLabel = end ? formatDate(end) : t('common.none')

  return `${startLabel}${t('common.to')}${endLabel}`
}

const getFollowupUpdates = (followupId: string | number) =>
  followupUpdateRows.value.filter((item: FundingCaseAgreementMonitorFollowupUpdateRow) => String(item.egcs_fc_fundingagreementmonitorfollowup) === String(followupId))

const viewedFollowupUpdates = computed(() =>
  viewedFollowup.value ? getFollowupUpdates(viewedFollowup.value.id) : []
)

const asPlanningRow = (value: unknown) => value as FundingCaseAgreementMonitorPlanningRow
const asItemRow = (value: unknown) => value as FundingCaseAgreementMonitorItemsRow
const asFindingRow = (value: unknown) => value as FundingCaseAgreementMonitorFindingRow
const asFollowupRow = (value: unknown) => value as FundingCaseAgreementMonitorFollowupRow
const asPracticeRow = (value: unknown) => value as FundingCaseAgreementMonitorPromisingPracticeRow

const openViewUpdates = (followup: FundingCaseAgreementMonitorFollowupRow) => {
  viewedFollowup.value = followup
  isUpdatesViewModalOpen.value = true
}

/**
 *
 * @param followup
 */
const openCreateUpdate = (followup: FundingCaseAgreementMonitorFollowupRow) => {
  updateModal.openCreate()
  if (selectedUpdate.value) {
    selectedUpdate.value.egcs_fc_fundingagreementmonitorfollowup = String(followup.id)
    selectedUpdate.value.egcs_fc_status = followup.egcs_fc_status
  }
}

const handleCompleted = async () => {
  await refreshMonitor()
  approvalsRefreshKey.value += 1
}
</script>

<template>
  <div class="flex w-full flex-col">
    <UAlert v-if="hasLoadError" color="error" icon="i-lucide-circle-alert" :title="t('common.resource_table_load_failed')" :description="t('common.resource_table_load_failed_description')">
      <template #actions>
        <UButton color="error" variant="soft" icon="i-lucide-refresh-cw" :label="t('common.retry')" :loading="isLoadingDetail" @click="retryLoad" />
      </template>
    </UAlert>
    <div v-else-if="isLoadingDetail && (!profile || !monitor)" role="status" aria-live="polite" class="flex min-h-32 items-center justify-center gap-2 text-sm text-muted">
      <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" aria-hidden="true" /><span>{{ t('common.loading_records') }}</span>
    </div>
    <UDashboardPanel v-if="monitor" id="agreement-monitor-detail" class="w-full">
      <template #header>
        <UDashboardNavbar>
          <template #leading>
            <UDashboardSidebarCollapse />
            <UBreadcrumb :items="breadcrumbItems" class="ml-2" />
          </template>
          <template #right>
            <div class="flex items-center gap-2">
              <UButton
                color="neutral" variant="ghost" :icon="isHeroCollapsed ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'"
                :aria-label="t(isHeroCollapsed ? 'common.expand' : 'common.collapse')" @click="isHeroCollapsed = !isHeroCollapsed" />
              <CommonNavbarSide />
            </div>
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <div class="flex flex-1 flex-col">
          <CommonEntityHero
            :is-collapsed="isHeroCollapsed"
            icon="i-lucide-clipboard-check"
            :title="getBilingualValue(monitor, 'monitor_type_name', monitorId)"
            :meta-items="[monitor.agreement_number, monitor.agreement_financial_system_number, getBilingualValue(monitor, 'stream_name', '-')]"
            :badges="[{
              statusId: monitor.egcs_fc_status,
              isCompleted: monitor.isCompleted
            }]" />

          <CommonEntityEditorWorkspace content-test-id="agreement-monitor-detail-content">
            <template #sidebar>
              <CommonRouteTabs
                v-model="selectedMonitorTab"
                :items="monitorTabs"
                orientation="vertical"
                :ui="{
                  root: 'w-full',
                  list: 'w-full flex-col items-stretch p-0',
                  trigger: 'w-full justify-start'
                }" />
            </template>

            <div v-if="selectedMonitorTab === 'planning'" class="w-full min-w-0">
              <div class="space-y-6">
                <UForm
                  v-if="monitorMetadata"
                  :state="monitorMetadata"
                  :validate="validateMonitorMetadata"
                  :validate-on="[]"
                  class="space-y-4"
                  @submit="saveMonitorMetadata">
                  <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <UFormField :label="t('agreement.monitors.type')" name="egcs_fc_type">
                      <CommonServerLookupSelect
                        v-if="canUpdateMonitor"
                        v-model="monitorMetadata.egcs_fc_type"
                        :fetch-url="`/api/agreements/${agreementId}/monitors/lookups/monitor-types`"
                        :query="{ permission_action: 'update', monitorId }"
                        value-key="id"
                        label-en-key="label_en"
                        label-fr-key="label_fr"
                        searchable />
                      <p v-else data-testid="monitor-type-readonly" class="text-sm text-default">
                        {{ getBilingualValue(monitor, 'monitor_type_name', monitorId) }}
                      </p>
                    </UFormField>
                    <UFormField :label="t('agreement.monitors.tentative_fiscal_year')" name="egcs_fc_tentativefiscalyear">
                      <CommonServerLookupSelect
                        v-if="canUpdateMonitor"
                        v-model="monitorMetadata.egcs_fc_tentativefiscalyear"
                        :fetch-url="`/api/agreements/${agreementId}/monitors/lookups/fiscal-years`"
                        :query="{ permission_action: 'update', monitorId }"
                        value-key="id"
                        label-en-key="label_en"
                        label-fr-key="label_fr"
                        searchable />
                      <p v-else data-testid="monitor-fiscal-year-readonly" class="text-sm text-default">
                        {{ monitor.fiscal_year_display || t('common.not_available') }}
                      </p>
                    </UFormField>
                    <UFormField :label="t('agreement.monitors.tentative_quarter')" name="egcs_fc_tentativequarter">
                      <UInputNumber v-if="canUpdateMonitor" v-model="monitorMetadata.egcs_fc_tentativequarter" :min="1" :max="4" class="w-full" />
                      <p v-else data-testid="monitor-quarter-readonly" class="text-sm text-default">
                        {{ monitor.egcs_fc_tentativequarter }}
                      </p>
                    </UFormField>
                    <UFormField :label="t('agreement.monitors.onsite')" name="egcs_fc_onsite">
                      <USwitch v-if="canUpdateMonitor" v-model="monitorMetadata.egcs_fc_onsite" />
                      <p v-else data-testid="monitor-onsite-readonly" class="text-sm text-default">
                        {{ t(monitor.egcs_fc_onsite ? 'common.yes' : 'common.no') }}
                      </p>
                    </UFormField>
                  </div>
                  <div class="flex justify-end">
                    <CommonSaveButton
                      v-if="canUpdateMonitor"
                      :label="t('common.save')"
                      :loading="isSavingMonitorMetadata"
                      :disabled="isSavingMonitorMetadata" />
                  </div>
                </UForm>

                <CommonResourceLayoutCard
                  v-model:search="planningSearch"
                  v-model:pagination="planningPagination"
                  :data="planningRows"
                  :columns="[
                    { id: 'objective', accessorKey: 'egcs_fc_objective', headerKey: 'agreement.monitors.planning.objective' },
                    { id: 'actions', headerKey: 'common.actions' }
                  ]"
                  :total-records="planningRows.length"
                  :button-label="t('agreement.monitors.planning.add')"
                  :show-button="canCreateMonitorResource"
                  @add="planningModal.openCreate">
                  <template #actions-cell="{ row }">
                    <div v-if="canUpdateMonitor || canDeleteMonitorResource" class="flex justify-end gap-2">
                      <UButton v-if="canUpdateMonitor" icon="i-lucide-pencil" color="neutral" variant="ghost" :aria-label="`${t('common.edit')}: ${asPlanningRow(row.original).id}`" @click="planningModal.openUpdate(asPlanningRow(row.original))" />
                      <UButton v-if="canDeleteMonitorResource" icon="i-lucide-trash" color="error" variant="ghost" :disabled="isResourceDeleting('monitor-planning', asPlanningRow(row.original).id)" :aria-label="`${t('common.delete')}: ${asPlanningRow(row.original).id}`" @click="deleteResource('monitor-planning', String(asPlanningRow(row.original).id))" />
                    </div>
                  </template>
                </CommonResourceLayoutCard>
              </div>
            </div>

            <div v-else-if="selectedMonitorTab === 'items'" class="w-full min-w-0">
              <div class="space-y-3">
                <div class="flex justify-end">
                  <UButton v-if="canCreateMonitorResource" icon="i-lucide-plus" :label="t('agreement.monitors.items.add')" @click="itemModal.openCreate" />
                </div>
                <CommonResourceLayoutCard
                  v-model:search="itemSearch"
                  v-model:pagination="itemPagination"
                  :data="itemRows"
                  :columns="[
                    { id: 'item', accessorKey: 'egcs_fc_item', headerKey: 'agreement.monitors.items.item' },
                    { id: 'planned', headerKey: 'agreement.monitors.items.planned' },
                    { id: 'actual', headerKey: 'agreement.monitors.items.actual' },
                    { id: 'monitored', accessorKey: 'egcs_fc_monitored', headerKey: 'agreement.monitors.items.monitored' },
                    { id: 'actions', headerKey: 'common.actions' }
                  ]" :total-records="itemRows.length" :show-button="false">
                  <template #planned-cell="{ row }">
                    {{ formatMonitorDateRange(asItemRow(row.original).egcs_fc_plannedstart, asItemRow(row.original).egcs_fc_plannedend) }}
                  </template>
                  <template #actual-cell="{ row }">
                    {{ formatMonitorDateRange(asItemRow(row.original).egcs_fc_actualstart, asItemRow(row.original).egcs_fc_actualend) }}
                  </template>
                  <template #monitored-cell="{ row }">
                    {{ asItemRow(row.original).egcs_fc_monitored ? t('common.yes') : t('common.no') }}
                  </template>
                  <template #actions-cell="{ row }">
                    <div v-if="canUpdateMonitor || canDeleteMonitorResource" class="flex justify-end gap-2">
                      <UButton v-if="canUpdateMonitor" icon="i-lucide-pencil" color="neutral" variant="ghost" :aria-label="`${t('common.edit')}: ${asItemRow(row.original).id}`" @click="itemModal.openUpdate(asItemRow(row.original))" />
                      <UButton v-if="canDeleteMonitorResource" icon="i-lucide-trash" color="error" variant="ghost" :disabled="isResourceDeleting('monitor-items', asItemRow(row.original).id)" :aria-label="`${t('common.delete')}: ${asItemRow(row.original).id}`" @click="deleteResource('monitor-items', String(asItemRow(row.original).id))" />
                    </div>
                  </template>
                </CommonResourceLayoutCard>
              </div>
            </div>

            <div v-else-if="selectedMonitorTab === 'findings'" class="w-full min-w-0">
              <div class="space-y-3">
                <div class="flex justify-end">
                  <UButton v-if="canCreateMonitorResource" icon="i-lucide-plus" :label="t('agreement.monitors.findings.add')" @click="findingModal.openCreate" />
                </div>
                <CommonResourceLayoutCard
                  v-model:search="findingSearch"
                  v-model:pagination="findingPagination"
                  :data="findingRows"
                  :columns="[
                    { id: 'name', accessorKey: 'egcs_fc_findingname', headerKey: 'agreement.monitors.findings.name' },
                    { id: 'type', accessorKey: 'egcs_fc_recommendationtype', headerKey: 'agreement.monitors.findings.recommendation_type' },
                    { id: 'responsible', accessorKey: 'egcs_fc_responsibleparty', headerKey: 'agreement.monitors.responsible_party' },
                    { id: 'actions', headerKey: 'common.actions' }
                  ]" :total-records="findingRows.length" :show-button="false">
                  <template #type-cell="{ row }">
                    {{ t(`enums.monitor_action_type.${asFindingRow(row.original).egcs_fc_recommendationtype}`) }}
                  </template>
                  <template #responsible-cell="{ row }">
                    {{ t(`enums.monitor_responsible_party.${asFindingRow(row.original).egcs_fc_responsibleparty}`) }}
                  </template>
                  <template #actions-cell="{ row }">
                    <div v-if="canUpdateMonitor || canDeleteMonitorResource" class="flex justify-end gap-2">
                      <UButton v-if="canUpdateMonitor" icon="i-lucide-pencil" color="neutral" variant="ghost" :aria-label="`${t('common.edit')}: ${asFindingRow(row.original).id}`" @click="findingModal.openUpdate(asFindingRow(row.original))" />
                      <UButton v-if="canDeleteMonitorResource" icon="i-lucide-trash" color="error" variant="ghost" :disabled="isResourceDeleting('monitor-findings', asFindingRow(row.original).id)" :aria-label="`${t('common.delete')}: ${asFindingRow(row.original).id}`" @click="deleteResource('monitor-findings', String(asFindingRow(row.original).id))" />
                    </div>
                  </template>
                </CommonResourceLayoutCard>
              </div>
            </div>

            <div v-else-if="selectedMonitorTab === 'followups'" class="w-full min-w-0">
              <div class="space-y-3">
                <div class="flex justify-end">
                  <UButton v-if="canCreateMonitorResource" icon="i-lucide-plus" :label="t('agreement.monitors.followups.add')" @click="followupModal.openCreate" />
                </div>
                <CommonResourceLayoutCard
                  v-model:search="followupSearch"
                  v-model:pagination="followupPagination"
                  :data="followupRows"
                  :columns="[
                    { id: 'name', accessorKey: 'egcs_fc_followupname', headerKey: 'agreement.monitors.followups.name' },
                    { id: 'responsible', accessorKey: 'egcs_fc_responsibleparty', headerKey: 'agreement.monitors.responsible_party' },
                    { id: 'status', accessorKey: 'egcs_fc_status', headerKey: 'common.status' },
                    { id: 'dueDate', accessorKey: 'egcs_fc_duedate', headerKey: 'agreement.monitors.followups.due_date' },
                    { id: 'updates', headerKey: 'agreement.monitors.followups.updates' },
                    { id: 'actions', headerKey: 'common.actions' }
                  ]" :total-records="followupRows.length" :show-button="false">
                  <template #responsible-cell="{ row }">
                    {{ t(`enums.monitor_responsible_party.${asFollowupRow(row.original).egcs_fc_responsibleparty}`) }}
                  </template>
                  <template #status-cell="{ row }">
                    <CommonStatusBadge
                      enum-name="follow_up_status"
                      :status="asFollowupRow(row.original).egcs_fc_status"
                      class="w-fit cursor-default" />
                  </template>
                  <template #dueDate-cell="{ row }">
                    {{ formatDate(asFollowupRow(row.original).egcs_fc_duedate) }}
                  </template>
                  <template #updates-cell="{ row }">
                    <CommonStatusBadge variant="message" :label="t('agreement.monitors.followups.updates_count', { count: getFollowupUpdates(asFollowupRow(row.original).id).length })" />
                  </template>
                  <template #actions-cell="{ row }">
                    <div class="flex justify-end gap-2">
                      <UButton icon="i-lucide-eye" color="neutral" variant="ghost" :aria-label="t('agreement.monitors.followups.view_updates')" @click="openViewUpdates(asFollowupRow(row.original))" />
                      <UButton v-if="canCreateMonitorResource" icon="i-lucide-message-square-plus" color="neutral" variant="ghost" :aria-label="`${t('agreement.monitors.followups.add_update')}: ${asFollowupRow(row.original).id}`" @click="openCreateUpdate(asFollowupRow(row.original))" />
                      <UButton v-if="canUpdateMonitor" icon="i-lucide-pencil" color="neutral" variant="ghost" :aria-label="`${t('common.edit')}: ${asFollowupRow(row.original).id}`" @click="followupModal.openUpdate(asFollowupRow(row.original))" />
                      <UButton v-if="canDeleteMonitorResource" icon="i-lucide-trash" color="error" variant="ghost" :disabled="isResourceDeleting('monitor-followups', asFollowupRow(row.original).id)" :aria-label="`${t('common.delete')}: ${asFollowupRow(row.original).id}`" @click="deleteResource('monitor-followups', String(asFollowupRow(row.original).id))" />
                    </div>
                  </template>
                </CommonResourceLayoutCard>
              </div>
            </div>

            <div v-else-if="selectedMonitorTab === 'promising-practices'" class="w-full min-w-0">
              <div class="space-y-3">
                <CommonResourceLayoutCard
                  v-model:search="practiceSearch"
                  v-model:pagination="practicePagination"
                  :data="practiceRows"
                  :columns="[
                    { id: 'practice', accessorKey: 'egcs_fc_practice', headerKey: 'agreement.monitors.promising_practices.practice' },
                    { id: 'actions', headerKey: 'common.actions' }
                  ]"
                  :total-records="practiceRows.length"
                  :button-label="t('agreement.monitors.promising_practices.add')"
                  :show-button="canCreateMonitorResource"
                  @add="practiceModal.openCreate">
                  <template #actions-cell="{ row }">
                    <div v-if="canUpdateMonitor || canDeleteMonitorResource" class="flex justify-end gap-2">
                      <UButton v-if="canUpdateMonitor" icon="i-lucide-pencil" color="neutral" variant="ghost" :aria-label="`${t('common.edit')}: ${asPracticeRow(row.original).id}`" @click="practiceModal.openUpdate(asPracticeRow(row.original))" />
                      <UButton v-if="canDeleteMonitorResource" icon="i-lucide-trash" color="error" variant="ghost" :disabled="isResourceDeleting('monitor-promising-practices', asPracticeRow(row.original).id)" :aria-label="`${t('common.delete')}: ${asPracticeRow(row.original).id}`" @click="deleteResource('monitor-promising-practices', String(asPracticeRow(row.original).id))" />
                    </div>
                  </template>
                </CommonResourceLayoutCard>
              </div>
            </div>

            <section v-else-if="selectedMonitorTab === 'workflow'" class="w-full min-w-0 space-y-6">
              <CommonCompletionPanel
                entity-type="fundingcasemonitor"
                :entity-id="monitorId"
                :can-complete="canUpdateMonitor"
                :can-work-workflow="isAssigned"
                :hide-title="false"
                :show-divider="false"
                title-key="agreement.monitors.completion.title"
                description-key="agreement.monitors.completion.description"
                status-complete-key="agreement.monitors.completion.status_complete"
                status-locked-key="agreement.monitors.completion.status_locked"
                comment-placeholder-key="agreement.monitors.completion.comment_placeholder"
                complete-action-key="agreement.monitors.completion.complete"
                completed-success-key="agreement.monitors.completion.completed_success"
                :refresh-key="approvalsRefreshKey"
                @changed="handleCompleted" />
            </section>

            <CommonWorkflowSection
              v-else-if="selectedMonitorTab === 'workflows'"
              entity-type="fundingcasemonitor"
              :entity-id="monitorId"
              purpose="standard"
              :can-edit="isAssigned"
              :refresh-key="approvalsRefreshKey"
              @changed="handleCompleted" />

            <CommonAssignedUsers
              v-else-if="selectedMonitorTab === 'assignments'"
              entity-type="fundingcasemonitor"
              :entity-id="monitorId" />

            <CommonAttachmentsTab
              v-else-if="selectedMonitorTab === 'attachments'"
              entity-type="fundingcasemonitor"
              :entity-id="monitorId" />

            <ExtensionEntityTabPanel
              v-else-if="selectedExtensionTab"
              :item="selectedExtensionTab" />
          </CommonEntityEditorWorkspace>
        </div>
      </template>
    </UDashboardPanel>

    <UModal v-if="selectedPlanning" v-model:open="isPlanningModalOpen" :title="selectedPlanning.id ? t('agreement.monitors.planning.edit') : t('agreement.monitors.planning.add')" :description="t('common.form_dialog_description')">
      <template #body>
        <UForm :state="selectedPlanning" :validate="validatePlanning" :validate-on="[]" class="space-y-4" @submit="savePlanning">
          <UFormField :label="t('agreement.monitors.planning.objective')" name="egcs_fc_objective">
            <UTextarea v-model="selectedPlanning.egcs_fc_objective" class="w-full" />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="isPlanningModalOpen = false" /><CommonSaveButton :label="t('common.save')" :loading="isResourceSaving('planning', planningModal)" />
          </div>
        </UForm>
      </template>
    </UModal>

    <UModal v-if="selectedItem" v-model:open="isItemModalOpen" :title="selectedItem.id ? t('agreement.monitors.items.edit') : t('agreement.monitors.items.add')" :description="t('common.form_dialog_description')">
      <template #body>
        <UForm :state="selectedItem" :validate="validateItem" :validate-on="[]" class="space-y-4" @submit="saveItem">
          <UFormField :label="t('agreement.monitors.items.item')" name="egcs_fc_item">
            <UInput v-model="selectedItem.egcs_fc_item" class="w-full" />
          </UFormField>
          <UFormField :label="t('common.description')" name="egcs_fc_detail">
            <UTextarea v-model="selectedItem.egcs_fc_detail" class="w-full" />
          </UFormField>
          <div class="grid gap-4 md:grid-cols-2">
            <UFormField :label="t('agreement.monitors.items.planned_start')" name="egcs_fc_plannedstart">
              <UInput v-model="selectedItem.egcs_fc_plannedstart" type="date" />
            </UFormField>
            <UFormField :label="t('agreement.monitors.items.planned_end')" name="egcs_fc_plannedend">
              <UInput v-model="selectedItem.egcs_fc_plannedend" type="date" />
            </UFormField>
            <UFormField :label="t('agreement.monitors.items.actual_start')" name="egcs_fc_actualstart">
              <UInput v-model="selectedItem.egcs_fc_actualstart" type="date" />
            </UFormField>
            <UFormField :label="t('agreement.monitors.items.actual_end')" name="egcs_fc_actualend">
              <UInput v-model="selectedItem.egcs_fc_actualend" type="date" />
            </UFormField>
          </div>
          <UFormField :label="t('agreement.monitors.items.monitored')" name="egcs_fc_monitored">
            <USwitch v-model="selectedItem.egcs_fc_monitored" />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="isItemModalOpen = false" /><CommonSaveButton :label="t('common.save')" :loading="isResourceSaving('item', itemModal)" />
          </div>
        </UForm>
      </template>
    </UModal>

    <UModal v-if="selectedFinding" v-model:open="isFindingModalOpen" :title="selectedFinding.id ? t('agreement.monitors.findings.edit') : t('agreement.monitors.findings.add')" :description="t('common.form_dialog_description')">
      <template #body>
        <UForm :state="selectedFinding" :validate="validateFinding" :validate-on="[]" class="space-y-4" @submit="saveFinding">
          <UFormField :label="t('agreement.monitors.findings.name')" name="egcs_fc_findingname">
            <UInput v-model="selectedFinding.egcs_fc_findingname" />
          </UFormField>
          <UFormField :label="t('agreement.monitors.findings.recommendation_type')" name="egcs_fc_recommendationtype">
            <CommonEnumSelect v-model="selectedFinding.egcs_fc_recommendationtype" name="monitor_action_type" />
          </UFormField>
          <UFormField :label="t('agreement.monitors.responsible_party')" name="egcs_fc_responsibleparty">
            <CommonEnumSelect v-model="selectedFinding.egcs_fc_responsibleparty" name="monitor_responsible_party" />
          </UFormField>
          <UFormField :label="t('common.description')" name="egcs_fc_detail">
            <UTextarea v-model="selectedFinding.egcs_fc_detail" />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="isFindingModalOpen = false" /><CommonSaveButton :label="t('common.save')" :loading="isResourceSaving('finding', findingModal)" />
          </div>
        </UForm>
      </template>
    </UModal>

    <UModal v-if="selectedFollowup" v-model:open="isFollowupModalOpen" :title="selectedFollowup.id ? t('agreement.monitors.followups.edit') : t('agreement.monitors.followups.add')" :description="t('common.form_dialog_description')">
      <template #body>
        <UForm :state="selectedFollowup" :validate="validateFollowup" :validate-on="[]" class="space-y-4" @submit="saveFollowup">
          <UFormField :label="t('agreement.monitors.followups.name')" name="egcs_fc_followupname">
            <UInput v-model="selectedFollowup.egcs_fc_followupname" />
          </UFormField>
          <UFormField :label="t('agreement.monitors.responsible_party')" name="egcs_fc_responsibleparty">
            <CommonEnumSelect v-model="selectedFollowup.egcs_fc_responsibleparty" name="monitor_responsible_party" />
          </UFormField>
          <UFormField :label="t('agreement.monitors.followups.due_date')" name="egcs_fc_duedate">
            <UInput v-model="selectedFollowup.egcs_fc_duedate" type="date" />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="isFollowupModalOpen = false" /><CommonSaveButton :label="t('common.save')" :loading="isResourceSaving('followup', followupModal)" />
          </div>
        </UForm>
      </template>
    </UModal>

    <UModal v-if="selectedUpdate" v-model:open="isUpdateModalOpen" :title="selectedUpdate.id ? t('agreement.monitors.followups.edit_update') : t('agreement.monitors.followups.add_update')" :description="t('common.form_dialog_description')">
      <template #body>
        <UForm :state="selectedUpdate" :validate="validateUpdate" :validate-on="[]" class="space-y-4" @submit="saveUpdate">
          <UFormField :label="t('agreement.monitors.followups.update')" name="egcs_fc_update">
            <UTextarea v-model="selectedUpdate.egcs_fc_update" />
          </UFormField>
          <UFormField :label="t('common.status')" name="egcs_fc_status">
            <CommonEnumSelect v-model="selectedUpdate.egcs_fc_status" name="follow_up_status" />
          </UFormField>
          <UFormField :label="t('agreement.monitors.followups.update_date')" name="egcs_fc_updatedate">
            <CommonDatePicker v-model="selectedUpdate.egcs_fc_updatedate" />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="isUpdateModalOpen = false" /><CommonSaveButton :label="t('common.save')" :loading="isResourceSaving('update', updateModal)" />
          </div>
        </UForm>
      </template>
    </UModal>

    <UModal v-if="viewedFollowup" v-model:open="isUpdatesViewModalOpen" :title="t('agreement.monitors.followups.updates_for', { name: viewedFollowup.egcs_fc_followupname })" :description="t('common.view_dialog_description')">
      <template #body>
        <div class="space-y-3">
          <div v-if="viewedFollowupUpdates.length === 0" class="text-sm text-muted">
            {{ t('agreement.monitors.followups.no_updates') }}
          </div>

          <div
            v-for="update in viewedFollowupUpdates"
            :key="update.id"
            class="border-default flex items-start justify-between gap-4 border-b pb-3">
            <div class="min-w-0 space-y-2">
              <div class="flex flex-wrap items-center gap-2">
                <CommonStatusBadge
                  enum-name="follow_up_status"
                  :status="update.egcs_fc_status"
                  class="w-fit cursor-default" />
                <span class="text-xs font-medium text-muted">
                  {{ formatDate(update.egcs_fc_updatedate) }}
                </span>
              </div>
              <p class="text-sm">
                {{ update.egcs_fc_update }}
              </p>
            </div>
            <div v-if="canUpdateMonitor || canDeleteMonitorResource" class="flex shrink-0 gap-2">
              <UButton v-if="canUpdateMonitor" icon="i-lucide-pencil" color="neutral" variant="ghost" size="xs" :aria-label="`${t('common.edit')}: ${update.id}`" @click="updateModal.openUpdate(update)" />
              <UButton v-if="canDeleteMonitorResource" icon="i-lucide-trash" color="error" variant="ghost" size="xs" :disabled="isResourceDeleting('monitor-followup-updates', update.id)" :aria-label="`${t('common.delete')}: ${update.id}`" @click="deleteResource('monitor-followup-updates', String(update.id))" />
            </div>
          </div>
        </div>
      </template>
    </UModal>

    <UModal v-if="selectedPractice" v-model:open="isPracticeModalOpen" :title="selectedPractice.id ? t('agreement.monitors.promising_practices.edit') : t('agreement.monitors.promising_practices.add')" :description="t('common.form_dialog_description')">
      <template #body>
        <UForm :state="selectedPractice" :validate="validatePractice" :validate-on="[]" class="space-y-4" @submit="savePractice">
          <UFormField :label="t('agreement.monitors.promising_practices.practice')" name="egcs_fc_practice">
            <UTextarea v-model="selectedPractice.egcs_fc_practice" />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="isPracticeModalOpen = false" /><CommonSaveButton :label="t('common.save')" :loading="isResourceSaving('practice', practiceModal)" />
          </div>
        </UForm>
      </template>
    </UModal>
  </div>
</template>
