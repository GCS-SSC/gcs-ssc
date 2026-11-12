<script setup lang="ts">
import { useCommittedSettlement } from '~/composables/useCommittedSettlement'
import { useFormSession } from '~/composables/useFormSession'
import { useActionContext } from '~/composables/useActionContext'
import type { CapturedActionContext } from '~/composables/useActionContext'
import { moneyMatchesSearch } from '~/utils/money-search'
import { useCrudModalPending } from '~/composables/useCrudModal'
/* eslint-disable jsdoc/require-jsdoc */
import { computed, onScopeDispose, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { useGroupedTableExpansion, type GroupedTableRow } from '~/composables/useGroupedTableExpansion'
import { useBusinessStatusState } from '~/composables/useBusinessStatusState'
import { useJsonRequest } from '~/composables/useJsonRequest'
import { useTableListState } from '~/composables/useTableListState'
import { appRouteLocations } from '~/utils/route-locations'
import type {
  FundingCaseAgreementProfileRow,
  FundingCaseAgreementForecastForm,
  FundingCaseAgreementForecastLineItemRow,
  FundingCaseAgreementForecastOverviewRow,
  FundingCaseAgreementForecastRow
} from '~~/shared/types/funding-case-agreement-ui'
import type { BusinessRecordStateFields } from '~~/shared/types/business-record-state'
import { FundingCaseAgreementForecastCreateSchema } from '~~/shared/types/schemas'
import { formatMoneyText, isCanonicalMoney, zeroMoney, sumMoney, type Money } from '~~/shared/utils/money'

type ForecastVersionRow = Omit<BusinessRecordStateFields, 'approvalRuntimeId' | 'approvalRuntimeState' | 'routingSlipId'> & {
  id: string
  fiscalYearGroup: string
  fiscalYearDisplay: string
  forecastId: string
  forecastFiscalYearId: string
  isActive: boolean
  version: string
  status: FundingCaseAgreementForecastRow['egcs_fc_status']
  lineCount: number
  totalAmount: Money
}

type ForecastGroupedRow = GroupedTableRow<ForecastVersionRow>

type FiscalYearLookupItem = {
  id: string
  label_en?: string | null
  label_fr?: string | null
}

const FISCAL_YEAR_GROUP_COLUMN_ID = 'fiscalYearGroup'

const { agreementId, currency, canCreateRole, canDeleteRole } = defineProps<{
  agreementId: string
  currency: string
  canCreateRole: boolean
  canDeleteRole: boolean
}>()
const agreementIdRef = computed(() => agreementId)

const { t, locale } = useI18n()
const { getGroupedDisclosureControlsId, getGroupedDisclosureContentId } = useGroupedDisclosureIds()
const statusCatalog = useStatusCatalog()
void statusCatalog.load()
const getStatusLabel = (statusId: string) => {
  const definition = statusCatalog.getById(statusId)
  return definition ? (locale.value === 'fr' ? definition.nameFr : definition.nameEn) : ''
}
const localePath = useLocalePath()
const toast = useLocalizedToast()
const { createValidator } = useZodI18n()
const { showError } = useApiErrorToast()
const { sendJson } = useJsonRequest()
const { isRecordLocked } = useBusinessStatusState()
const isCreatingVersion: Ref<boolean> = ref(false)
const pendingAction: Ref<symbol | null> = ref(null)
let actionGeneration = 0
let isScopeActive = true
onScopeDispose(() => {
  isScopeActive = false
})

const { search, pagination } = useTableListState()
const forecastModal = useCrudModal<FundingCaseAgreementForecastRow, FundingCaseAgreementForecastForm>({
  createState: () => ({}),
  updateState: forecast => ({
    id: forecast.id,
    egcs_fc_fiscalyear: forecast.egcs_fc_fiscalyear
  })
})
const forecastPending = useCrudModalPending(forecastModal.captureSession)
const isSavingForecast = forecastPending.isPending
watch(agreementIdRef, () => {
  actionGeneration += 1
  pendingAction.value = null
  isCreatingVersion.value = false
  forecastModal.close()
}, { flush: 'sync' })

const selectedForecast = forecastModal.selected
const isForecastModalOpen = forecastModal.isOpen
const validateForecast = createValidator(FundingCaseAgreementForecastCreateSchema)
const useOverviewFetch = useFetch as unknown as (url: Ref<string>) => {
  data: Ref<FundingCaseAgreementForecastOverviewRow | null>
  refresh: () => Promise<void>
  error: Ref<unknown>
  status: Ref<'idle' | 'pending' | 'success' | 'error'>
}
const {
  data: overview,
  refresh: refreshOverview,
  error: overviewError,
  status: overviewStatus
} = useOverviewFetch(computed(() => `/api/agreements/${agreementId}/forecasts-overview`))

const forecasts = computed<FundingCaseAgreementForecastOverviewRow['forecasts']>(() => overview.value?.forecasts ?? [])
const createContext = useActionContext({ identity: [agreementIdRef], authority: () => canCreateRole })
const deleteContext = useActionContext({ identity: [agreementIdRef], authority: () => canDeleteRole })
const captureCommitted = useCommittedSettlement({
  context: createContext,
  settle: async () => {
    await refreshOverview()
    return overviewStatus.value === 'success'
      ? { kind: 'available' }
      : { kind: 'unavailable', error: overviewError.value }
  }
})
const forecastsRequiringRevision = computed(() => forecasts.value.filter(forecast =>
  forecast.egcs_fc_active && forecast.forecast_revision_required
))
const budgetLineItems = computed<FundingCaseAgreementForecastOverviewRow['budgetLineItems']>(() => overview.value?.budgetLineItems ?? [])
const forecastLineItems = computed<FundingCaseAgreementForecastOverviewRow['lineItems']>(() => overview.value?.lineItems ?? [])

const columns: TableColumnInput<ForecastVersionRow>[] = [
  { id: FISCAL_YEAR_GROUP_COLUMN_ID, accessorKey: FISCAL_YEAR_GROUP_COLUMN_ID, headerKey: 'agreement.forecasts.fiscal_year' },
  { id: 'version', accessorKey: 'version', headerKey: 'agreement.forecasts.version' },
  { id: 'status', accessorKey: 'status', headerKey: 'common.status' },
  { id: 'lines', accessorKey: 'lineCount', headerKey: 'agreement.forecasts.lines' },
  { id: 'total', accessorKey: 'totalAmount', headerKey: 'agreement.forecasts.total_forecasted' },
  { id: 'actions', headerKey: 'common.actions' }
]

const formatMoney = (value: Money) => formatMoneyText(value, locale.value)

const forecastFiscalYearOptions = computed<FiscalYearLookupItem[]>(() => {
  const byId = new Map<string, FiscalYearLookupItem>()

  for (const lineItem of budgetLineItems.value) {
    const id = String(lineItem.fiscal_year_id)
    byId.set(id, {
      id,
      label_en: lineItem.fiscal_year_display ?? t('common.unavailable'),
      label_fr: lineItem.fiscal_year_display ?? t('common.unavailable')
    })
  }

  return [...byId.values()]
})

const versionRows = computed<ForecastVersionRow[]>(() => {
  const rows: ForecastVersionRow[] = []

  for (const forecast of forecasts.value as FundingCaseAgreementForecastRow[]) {
    const lines = forecastLineItems.value.filter((lineItem: FundingCaseAgreementForecastLineItemRow) =>
      String(lineItem.egcs_fc_agreementforecast) === String(forecast.id)
    )
    rows.push({
      id: String(forecast.id),
      fiscalYearGroup: forecast.fiscal_year_display ?? t('common.unavailable'),
      fiscalYearDisplay: forecast.fiscal_year_display ?? t('common.unavailable'),
      forecastId: String(forecast.id),
      forecastFiscalYearId: String(forecast.egcs_fc_fiscalyear),
      version: forecast.egcs_fc_version,
      isActive: forecast.egcs_fc_active,
      status: forecast.egcs_fc_status,
      isCompleted: forecast.isCompleted,
      completionDisposition: forecast.completionDisposition,
      workflowRuntimeId: forecast.workflowRuntimeId,
      workflowRuntimeState: forecast.workflowRuntimeState,
      lifecycleTerminus: forecast.lifecycleTerminus,
      lineCount: lines.length,
      totalAmount: sumMoney(lines.map(line => line.egcs_fc_amount), currency)
    })
  }

  return rows
    .filter((row: ForecastVersionRow) => {
      const normalizedSearch = search.value.trim().toLowerCase()
      if (!normalizedSearch) {
        return true
      }

      return [
        row.fiscalYearDisplay,
        row.version,
        getStatusLabel(row.status),
        row.lineCount,
        row.totalAmount
      ].some(value => isCanonicalMoney(value) ? moneyMatchesSearch(value, normalizedSearch, locale.value) : String(value ?? '').toLowerCase().includes(normalizedSearch))
    })
    .sort((a, b) => {
      const fiscalYearCompare = a.fiscalYearDisplay.localeCompare(b.fiscalYearDisplay)
      if (fiscalYearCompare !== 0) {
        return fiscalYearCompare
      }

      return BigInt(a.version) < BigInt(b.version) ? -1 : BigInt(a.version) > BigInt(b.version) ? 1 : 0
    })
})

const {
  expandedRows,
  grouping,
  columnVisibility,
  groupingOptions,
  expandedOptions,
  isGroupRow,
  getGroupedRowCount,
  updateExpandedRows
} = useGroupedTableExpansion<ForecastVersionRow>({
  rows: versionRows,
  groups: [{
    id: FISCAL_YEAR_GROUP_COLUMN_ID,
    getValue: row => row.fiscalYearGroup
  }]
})
const isFiscalYearGroupRow = (row: ForecastGroupedRow) => isGroupRow(row, FISCAL_YEAR_GROUP_COLUMN_ID)
const getRepresentativeGroupedRow = (row: ForecastGroupedRow) => {
  const records = (row.leafRows ?? row.subRows ?? []).map(item => item.original)
  return records.find(item => item.isActive)
    ?? records.reduce<ForecastVersionRow | null>((latest, item) =>
      !latest || BigInt(item.version) > BigInt(latest.version) ? item : latest, null)
}
const getGroupedRowTotal = (row: ForecastGroupedRow) => getRepresentativeGroupedRow(row)?.totalAmount ?? zeroMoney(currency)
const getGroupedForecastStatus = (row: ForecastGroupedRow) =>
  getRepresentativeGroupedRow(row)?.status ?? row.original.status
const getForecastRoute = (row: ForecastVersionRow) =>
  localePath(appRouteLocations.agreementForecastDetail(agreementId, row.forecastId))

const warnPrerequisite = (key: string) => toast.add({ title: toast.localized('common.warning'), description: toast.localized(key), color: 'warning' })
const captureAction = () => {
  const owner = agreementId
  const generation = actionGeneration
  return () => isScopeActive && agreementId === owner && actionGeneration === generation
}
const checkPrerequisites = async (isCurrent: () => boolean, recordId?: string): Promise<boolean> => {
  if (!isCurrent()) return false
  const owner = agreementId
  try {
    const [parent, roster, freshOverview] = await Promise.all([
      $fetch<FundingCaseAgreementProfileRow, string>(`/api/agreements/${owner}`),
      $fetch<{ is_assigned: boolean }, string>(`/api/entity-assignments/${recordId ? 'fundingcaseforecast' : 'fundingcaseagreement'}/${recordId ?? owner}`),
      recordId ? $fetch<FundingCaseAgreementForecastOverviewRow, string>(`/api/agreements/${owner}/forecasts-overview?forecastId=${recordId}`) : Promise.resolve(null)
    ])
    if (!isCurrent()) return false
    const record = freshOverview?.forecasts.find(item => String(item.id) === recordId)
    if (!statusCatalog.getById(parent.egcs_fc_status) || (record && !statusCatalog.getById(record.egcs_fc_status))) await statusCatalog.load()
    if (!isCurrent()) return false
    const roleAllowed = recordId ? parent.can_delete_child_records_role : parent.can_create_child_records_role
    if (roleAllowed !== true || isRecordLocked(parent) || (recordId && (!record || isRecordLocked(record)))) {
      warnPrerequisite(recordId ? 'agreement.child_records.work_prerequisite' : 'agreement.child_records.create_prerequisite')
      return false
    }
    if (record?.egcs_fc_active && record.forecast_revision_required) {
      warnPrerequisite('agreement.budget_controls.forecast_revision_required')
      return false
    }
    if (!roster.is_assigned) {
      warnPrerequisite('assignments.read_only_description')
      return false
    }
    if (!recordId && parent.can_create_child_records !== true) {
      warnPrerequisite('agreement.child_records.create_prerequisite')
      return false
    }
    return true
  } catch {
    if (isCurrent()) warnPrerequisite(recordId ? 'agreement.child_records.work_prerequisite' : 'agreement.child_records.create_prerequisite')
    return false
  }
}
const runAction = async (action: 'create' | 'delete', work: (isCurrent: () => boolean, operation: CapturedActionContext) => Promise<void>) => {
  if (pendingAction.value || overviewStatus.value === 'pending') return
  const operation = (action === 'create' ? createContext : deleteContext).capture()
  if (!operation) return
  const token = Symbol('forecast-action')
  const ownsScope = captureAction()
  const isCurrent = () => operation.isCurrent() && ownsScope()
  pendingAction.value = token
  try {
    await work(isCurrent, operation)
  } catch (error: unknown) {
    if (isCurrent()) showError(error)
  } finally {
    if (pendingAction.value === token) pendingAction.value = null
  }
}
const createForecastVersion = (row: ForecastGroupedRow) => runAction('create', async (isCurrent, operation) => {
  const forecast = getRepresentativeGroupedRow(row)
  if (!forecast || !await checkPrerequisites(() => isCurrent() && operation.canDispatch()) || !operation.canDispatch()) return
  const owner = agreementId
  isCreatingVersion.value = true
  try {
    const created = await sendJson<{ id: string }>(`/api/agreements/${owner}/forecasts`, 'POST', {
      egcs_fc_fiscalyear: forecast.forecastFiscalYearId,
      egcs_fc_copyfromactive: !forecastsRequiringRevision.value.some(item => String(item.egcs_fc_fiscalyear) === forecast.forecastFiscalYearId)
    })
    if (isCurrent()) await navigateTo(localePath(appRouteLocations.agreementForecastDetail(owner, String(created.id))))
  } finally { if (isCurrent()) isCreatingVersion.value = false }
})
const openCreateForecast = () => runAction('create', async (isCurrent, operation) => {
  const session = forecastModal.captureSession()
  if (await checkPrerequisites(() => isCurrent() && operation.canDispatch()) && operation.canDispatch() && isCurrent() && forecastModal.captureSession() === session) forecastModal.openCreate()
})

const saveForecast = async () => {
  if (!selectedForecast.value) return
  const operation = createContext.capture()
  const committed = captureCommitted()
  if (!operation || !committed) return
  const forecastState = selectedForecast.value
  const session = forecastModal.captureSession()
  const isCurrentScope = captureAction()
  const isCurrent = () => operation.isCurrent() && isCurrentScope() && forecastModal.isCurrentSession(session)
  if (!forecastPending.begin(session)) return
  try {
    try {
      if (!await checkPrerequisites(() => isCurrent() && operation.canDispatch()) || !isCurrent() || !operation.canDispatch() || !committed.canDispatch()) return
      await sendJson(`/api/agreements/${agreementId}/forecasts`, 'POST', forecastState)
    } catch (error: unknown) {
      if (isCurrent()) showError(error)
      return
    }
    const closesInitiatingSession = operation.isCurrent() && isCurrentScope() && forecastModal.closeSession(session)
    const settlement = await committed.settle()
    if (settlement.kind !== 'refreshed' || !forecastModal.isLatestSession(session) || !closesInitiatingSession) return
    toast.add({ title: toast.localized('common.success'), description: toast.localized('common.added_success'), color: 'success' })
  } finally { forecastPending.end(session) }
}

const { confirmDeleteRequest } = useConfirmDeleteRequest()
const confirmDelete = useDeleteConfirm()
const deleteForecast = (forecastId: string) => runAction('delete', async (isCurrent, operation) => {
  const current = forecasts.value.find(forecast => String(forecast.id) === forecastId)
  if (current && isRecordLocked(current)) {
    warnPrerequisite('agreement.child_records.work_prerequisite')
    return
  }
  if (current?.egcs_fc_active && current.forecast_revision_required) {
    warnPrerequisite('agreement.budget_controls.forecast_revision_required')
    return
  }
  const owner = agreementId
  const deleted = await confirmDeleteRequest(`/api/agreements/${owner}/forecasts/${forecastId}`, {
    operation,
    target: {
      id: forecastId,
      resolve: () => forecasts.value.find(forecast => String(forecast.id) === forecastId),
      eligible: forecast => !isRecordLocked(forecast) && !(forecast.egcs_fc_active && forecast.forecast_revision_required)
    },
    shouldProceed: isCurrent,
    confirm: async () => await checkPrerequisites(() => isCurrent() && operation.canDispatch(), forecastId)
      && Boolean(await confirmDelete()) && operation.canDispatch()
      && await checkPrerequisites(() => isCurrent() && operation.canDispatch(), forecastId)
  })
  if (!deleted || !isCurrent()) return
  await refreshOverview()
  if (isCurrent()) toast.add({ title: toast.localized('common.success'), description: toast.localized('common.deleted_success'), color: 'success' })
})
const formSession = useFormSession({ owner: forecastModal, action: { kind: 'remote', context: createContext }, submit: saveForecast })
</script>

<template>
  <div class="w-full" data-field-tooltip-context="agreement" data-field-scope="agreement.forecasts-tab" data-scope-label-en="Agreements > Forecasts" data-scope-label-fr="Ententes > Prévisions" data-help-view="agreement.forecasts" data-help-label-en="Agreements — Forecasts" data-help-label-fr="Ententes — Prévisions" data-help-target="agreement.forecasts.content" data-help-kind="section">
    <UAlert
      v-for="forecast in forecastsRequiringRevision"
      :key="forecast.id"
      class="mb-4"
      color="warning"
      icon="i-lucide-triangle-alert"
      :title="`${forecast.fiscal_year_display ?? t('common.unavailable')}, ${t('agreement.forecasts.version_label', { version: forecast.egcs_fc_version })}`"
      :description="t('agreement.budget_controls.forecast_revision_required')" />
    <CommonResourceLayout
      v-model:search="search"
      v-model:pagination="pagination"
      :data="versionRows"
      :columns="columns"
      :grouping="grouping"
      :grouping-options="groupingOptions"
      :expanded-options="expandedOptions"
      :column-visibility="columnVisibility"
      :expanded="expandedRows"
      :total-records="versionRows.length"
      :loading="overviewStatus === 'pending'"
      :request-status="overviewStatus"
      :button-label="t('agreement.forecasts.add')"
      :show-button="canCreateRole"
      :button-disabled="Boolean(pendingAction)"
      :search-placeholder="t('agreement.forecasts.search')"
      help-add-target="agreement.forecasts.add"
      help-search-target="agreement.forecasts.search"
      @add="openCreateForecast" @retry="refreshOverview" @update:expanded="updateExpandedRows">
      <template #version-cell="{ row }">
        <div :id="getGroupedDisclosureContentId(row as ForecastGroupedRow)" class="contents">
          <div v-if="isFiscalYearGroupRow(row as ForecastGroupedRow)" class="flex w-full items-center gap-3 py-1">
            <CommonGroupedDisclosureButton
              class="group flex min-w-0 items-center gap-3 text-left"
              :expanded="row.getIsExpanded?.() === true"
              :controls="getGroupedDisclosureControlsId(row.id)"
              :label="row.original.fiscalYearDisplay"
              @toggle="row.toggleExpanded?.()">
              <UIcon
                :name="row.getIsExpanded?.() ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                class="size-4 text-zinc-400 transition-colors group-hover:text-primary" />
              <span class="text-sm font-semibold text-zinc-900 dark:text-white">
                {{ row.original.fiscalYearDisplay }}
              </span>
              <CommonStatusBadge variant="count" size="sm" :label="String(getGroupedRowCount(row as ForecastGroupedRow))" />
            </CommonGroupedDisclosureButton>
          </div>

          <NuxtLink
            v-else
            :to="getForecastRoute(row.original)"
            class="group flex w-full items-center gap-3 py-1 pl-6 text-left">
            <UIcon name="i-lucide-corner-down-right" class="size-4 text-zinc-400" />
            <span class="text-sm font-semibold text-zinc-900 transition-colors group-hover:text-primary dark:text-white">
              {{ t('agreement.forecasts.version_label', { version: row.original.version }) }}
            </span>
            <UBadge v-if="row.original.isActive" color="success" variant="subtle">{{ t('agreement.forecasts.active') }}</UBadge>
          </NuxtLink>
        </div>
      </template>

      <template #status-cell="{ row }">
        <CommonStatusBadge
          v-if="isFiscalYearGroupRow(row as ForecastGroupedRow)"
          :status-id="getGroupedForecastStatus(row as ForecastGroupedRow)" />
        <CommonRecordState
          v-else
          :status-id="row.original.status"
          :is-completed="row.original.isCompleted" />
      </template>

      <template #lines-cell="{ row }">
        <span v-if="isFiscalYearGroupRow(row as ForecastGroupedRow)" class="font-medium text-zinc-700 dark:text-zinc-200">
          {{ getGroupedRowCount(row as ForecastGroupedRow) }}
        </span>
        <span v-else class="font-medium text-zinc-700 dark:text-zinc-200">
          {{ row.original.lineCount }}
        </span>
      </template>

      <template #total-cell="{ row }">
        <span class="font-medium text-zinc-700 dark:text-zinc-200">
          {{ formatMoney(isFiscalYearGroupRow(row as ForecastGroupedRow) ? getGroupedRowTotal(row as ForecastGroupedRow) : row.original.totalAmount) }}
        </span>
      </template>

      <template #actions-cell="{ row }">
        <div class="flex items-center justify-end gap-2">
          <CommonActionButton
            v-if="isFiscalYearGroupRow(row as ForecastGroupedRow) && canCreateRole"
            :loading="isCreatingVersion"
            :disabled="Boolean(pendingAction)"
            icon="i-lucide-plus"
            color="neutral"
            variant="ghost"
            class="cursor-default"
            :aria-label="t('agreement.forecasts.add_version')"
            @click="createForecastVersion(row as ForecastGroupedRow)" />
          <CommonActionButton
            v-if="!isFiscalYearGroupRow(row as ForecastGroupedRow) && canDeleteRole"
            icon="i-lucide-trash"
            color="error"
            variant="ghost"
            class="cursor-default"
            :aria-label="`${t('common.delete')}: ${row.original.fiscalYearDisplay}, ${t('agreement.forecasts.version_label', { version: row.original.version })}`"
            @click="deleteForecast(row.original.forecastId)" />
          <CommonActionButton
            v-if="!isFiscalYearGroupRow(row as ForecastGroupedRow)"
            :to="getForecastRoute(row.original)"
            icon="i-lucide-arrow-right"
            color="neutral"
            variant="ghost"
            class="cursor-default"
            :aria-label="`${t('common.open')}: ${row.original.fiscalYearDisplay}, ${t('agreement.forecasts.version')} ${row.original.version}`" />
        </div>
      </template>
    </CommonResourceLayout>

    <UModal
      v-if="selectedForecast"
      v-model:open="isForecastModalOpen"
      :title="t('agreement.forecasts.add')">
      <template #body>
        <UForm v-bind="formSession" :state="selectedForecast" :validate="validateForecast" :validate-on="[]" class="space-y-4" data-help-view="agreement.forecasts.forecast-dialog" data-help-label-en="Agreements — Forecast editor" data-help-label-fr="Ententes — Éditeur de prévision">
          <UFormField :label="t('agreement.forecasts.fiscal_year')" name="egcs_fc_fiscalyear" required>
            <CommonBilingualSelectMenu
              v-model="selectedForecast.egcs_fc_fiscalyear"
              :items="forecastFiscalYearOptions"
              value-key="id"
              label-en-key="label_en"
              label-fr-key="label_fr"
              required
              aria-required="true"
              searchable />
          </UFormField>
          <div class="flex justify-end gap-2 pt-4">
            <UButton :label="t('common.cancel')" color="neutral" variant="ghost" data-help-target="agreement.forecasts.forecast-dialog.cancel" data-help-kind="button" data-help-label-en="Cancel" data-help-label-fr="Annuler" @click="isForecastModalOpen = false" />
            <CommonSaveButton
              :label="t('common.add')"
              :loading="isSavingForecast"
              :disabled="isSavingForecast" data-help-target="agreement.forecasts.forecast-dialog.save" data-help-kind="button" data-help-label-en="Save" data-help-label-fr="Enregistrer" />
          </div>
        </UForm>
      </template>
    </UModal>
  </div>
</template>
