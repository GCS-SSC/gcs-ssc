<script setup lang="ts">
import { useCrudModalPending } from '~/composables/useCrudModal'
/* eslint-disable jsdoc/require-jsdoc */
import { computed, onScopeDispose, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { useGroupedTableExpansion, type GroupedTableRow } from '~/composables/useGroupedTableExpansion'
import { useDeleteRequestToast } from '~/composables/useDeleteRequestToast'
import { useJsonRequest } from '~/composables/useJsonRequest'
import { useTableListState } from '~/composables/useTableListState'
import { appRouteLocations } from '~/utils/route-locations'
import type {
  FundingCaseAgreementForecastForm,
  FundingCaseAgreementForecastLineItemRow,
  FundingCaseAgreementForecastOverviewRow,
  FundingCaseAgreementForecastRow
} from '~~/shared/types/funding-case-agreement-ui'
import type { BusinessRecordStateFields } from '~~/shared/types/business-record-state'
import { FundingCaseAgreementForecastCreateSchema } from '~~/shared/types/schemas'
import { formatMoneyText, sumMoney, type Money } from '~~/shared/utils/money'

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

const { agreementId, currency, canCreate, canDelete } = defineProps<{
  agreementId: string
  currency: string
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
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
const toast = useToast()
const { createValidator } = useZodI18n()
const { showError } = useApiErrorToast()
const { sendJson } = useJsonRequest()
const isCreatingVersion: Ref<boolean> = ref(false)
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
watch(agreementIdRef, () => forecastModal.close(), { flush: 'sync' })

const selectedForecast = forecastModal.selected
const isForecastModalOpen = forecastModal.isOpen
const validateForecast = createValidator(FundingCaseAgreementForecastCreateSchema)
const useOverviewFetch = useFetch as unknown as (url: Ref<string>) => {
  data: Ref<FundingCaseAgreementForecastOverviewRow | null>
  refresh: () => Promise<void>
  status: Ref<'idle' | 'pending' | 'success' | 'error'>
}
const {
  data: overview,
  refresh: refreshOverview,
  status: overviewStatus
} = useOverviewFetch(computed(() => `/api/agreements/${agreementId}/forecasts-overview`))

const forecasts = computed<FundingCaseAgreementForecastOverviewRow['forecasts']>(() => overview.value?.forecasts ?? [])
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

const ZERO_MONEY = '0.00' as Money
const formatMoney = (value: Money) => formatMoneyText(value, locale.value, currency)

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
      totalAmount: sumMoney(lines.map(line => line.egcs_fc_amount))
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
      ].some(value => String(value ?? '').toLowerCase().includes(normalizedSearch))
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
const getGroupedRowTotal = (row: ForecastGroupedRow) => getRepresentativeGroupedRow(row)?.totalAmount ?? ZERO_MONEY
const getGroupedForecastStatus = (row: ForecastGroupedRow) =>
  getRepresentativeGroupedRow(row)?.status ?? row.original.status
const getForecastRoute = (row: ForecastVersionRow) =>
  localePath(appRouteLocations.agreementForecastDetail(agreementId, row.forecastId))

const createForecastVersion = async (row: ForecastGroupedRow) => {
  const forecast = getRepresentativeGroupedRow(row)
  if (!forecast || isCreatingVersion.value) return
  const requestAgreementId = agreementId
  try {
    isCreatingVersion.value = true
    const created = await sendJson<{ id: string }>(`/api/agreements/${requestAgreementId}/forecasts`, 'POST', {
      egcs_fc_fiscalyear: forecast.forecastFiscalYearId,
      egcs_fc_copyfromactive: true
    })
    if (!isScopeActive || agreementId !== requestAgreementId) return
    await navigateTo(localePath(appRouteLocations.agreementForecastDetail(requestAgreementId, String(created.id))))
  } catch (error: unknown) {
    if (isScopeActive && agreementId === requestAgreementId) showError(error)
  } finally {
    isCreatingVersion.value = false
  }
}

const openCreateForecast = () => {
  forecastModal.openCreate()
}

const saveForecast = async () => {
  if (!selectedForecast.value) {
    return
  }
  const forecastState = selectedForecast.value
  const session = forecastModal.captureSession()
  if (!forecastPending.begin(session)) return

  try {
    await sendJson(`/api/agreements/${agreementId}/forecasts`, 'POST', forecastState)

    if (!forecastModal.closeSession(session)) return
    await refreshOverview()
    if (overviewStatus.value === 'error') return
    toast.add({
      title: t('common.success'),
      description: t('common.added_success'),
      color: 'success'
    })
  } catch (error: unknown) {
    showError(error)
  } finally {
    forecastPending.end(session)
  }
}

const { confirmDeleteWithToast } = useDeleteRequestToast()

const deleteForecast = async (forecastId: string) => {
  await confirmDeleteWithToast(`/api/agreements/${agreementId}/forecasts/${forecastId}`, {
    refresh: refreshOverview
  })
}
</script>

<template>
  <div class="w-full">
    <CommonResourceLayoutCard
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
      :show-button="canCreate"
      :search-placeholder="t('agreement.forecasts.search')"
      @add="openCreateForecast"
      @retry="refreshOverview"
      @update:expanded="updateExpandedRows">
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
          <UButton
            v-if="isFiscalYearGroupRow(row as ForecastGroupedRow) && canCreate"
            :loading="isCreatingVersion"
            :disabled="isCreatingVersion"
            icon="i-lucide-plus"
            color="neutral"
            variant="ghost"
            class="cursor-default"
            :aria-label="t('agreement.forecasts.add_version')"
            @click="createForecastVersion(row as ForecastGroupedRow)" />
          <UButton
            v-if="!isFiscalYearGroupRow(row as ForecastGroupedRow) && canDelete"
            icon="i-lucide-trash"
            color="error"
            variant="ghost"
            class="cursor-default"
            :aria-label="`${t('common.delete')}: ${row.original.fiscalYearDisplay}, ${t('agreement.forecasts.version_label', { version: row.original.version })}`"
            @click="deleteForecast(row.original.forecastId)" />
          <UButton
            v-if="!isFiscalYearGroupRow(row as ForecastGroupedRow)"
            :to="getForecastRoute(row.original)"
            icon="i-lucide-arrow-right"
            color="neutral"
            variant="ghost"
            class="cursor-default"
            :aria-label="`${t('common.open')}: ${row.original.fiscalYearDisplay}, ${t('agreement.forecasts.version')} ${row.original.version}`" />
        </div>
      </template>
    </CommonResourceLayoutCard>

    <UModal
      v-if="selectedForecast"
      v-model:open="isForecastModalOpen"
      :title="t('agreement.forecasts.add')">
      <template #body>
        <UForm :state="selectedForecast" :validate="validateForecast" :validate-on="[]" class="space-y-4" @submit="saveForecast">
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
            <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="isForecastModalOpen = false" />
            <CommonSaveButton
              :label="t('common.add')"
              :loading="isSavingForecast"
              :disabled="isSavingForecast" />
          </div>
        </UForm>
      </template>
    </UModal>
  </div>
</template>
