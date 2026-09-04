<script setup lang="ts">
import type { FetchError } from 'ofetch'
import { useBusinessStatusState } from '~/composables/useBusinessStatusState'
/* eslint-disable jsdoc/require-jsdoc -- page-local callbacks use self-descriptive signatures */
import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { useGroupedTableExpansion, type GroupedTableRow } from '~/composables/useGroupedTableExpansion'
import CommonCompletionPanel from '~/components/Common/Completions/Panel.vue'
import { appRouteLocations, authorizedRouteLocation } from '~/utils/route-locations'
import type { EntityAssignmentContext } from '~~/shared/types/schemas/entity-assignment'
import type {
  FundingCaseAgreementBudgetLineItemRow,
  FundingCaseAgreementForecastLineItemRow,
  FundingCaseAgreementForecastOverviewRow
} from '~~/shared/types/funding-case-agreement-ui'
import { formatMoneyText, parseMoney, sumMoney, type Money } from '~~/shared/utils/money'

definePageMeta({
  key: route => route.fullPath,
  i18n: {
    paths: {
      en: '/agreements/[id]/forecasts/[forecastId]',
      fr: '/ententes/[id]/previsions/[forecastId]'
    }
  }
})

type QuarterKey = 'q1' | 'q2' | 'q3' | 'q4'
type BreakdownPeriod = {
  id: string
  columnId: string
  label: string
  type: 'quarter' | 'month'
  quarter: QuarterKey
  months: number[]
}
type ForecastBreakdownTableRow = {
  id: string
  costCategoryGroup: string
  costSubsectionGroup: string
  costCategoryLabel: string
  costSubsectionLabel: string
  lineItemNameEn: string
  lineItemNameFr: string
  description: string
  budgetLineId: string
  periodTotals: Record<string, Money>
  total: Money
}
type GroupedForecastBreakdownRow = GroupedTableRow<ForecastBreakdownTableRow>

const COST_CATEGORY_GROUP_COLUMN_ID = 'costCategoryGroup'
const COST_SUBSECTION_GROUP_COLUMN_ID = 'costSubsectionGroup'
const MONTH_KEYS = [
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
  'jan',
  'feb',
  'mar'
] as const
const QUARTERS: Array<{ key: QuarterKey, months: number[] }> = [
  { key: 'q1', months: [0, 1, 2] },
  { key: 'q2', months: [3, 4, 5] },
  { key: 'q3', months: [6, 7, 8] },
  { key: 'q4', months: [9, 10, 11] }
]
const MONTH_QUARTERS: QuarterKey[] = MONTH_KEYS.map((_monthKey, month) => (
  QUARTERS.find(candidate => candidate.months.includes(month))?.key ?? 'q1'
))

const { t, locale } = useI18n()
const { getGroupedDisclosureControlsId, getGroupedDisclosureContentId } = useGroupedDisclosureIds()
const route = useRoute()
const localePath = useLocalePath()
const toast = useToast()
const { getHeroCollapsed } = useDashboard()
const { showError } = useApiErrorToast()
const { getBilingualValue } = useBilingualValue()
const { saveJson } = useJsonRequest()
const { isRecordLocked } = useBusinessStatusState()

const agreementId = route.params.id as string
const forecastId = route.params.forecastId as string
const { isAssigned } = useEntityAssignmentRoster('fundingcaseforecast', forecastId)

const selectedVersion: Ref<string> = ref(String(route.query.version ?? '0'))
const expandedQuarter: Ref<QuarterKey | null> = ref(null)
const breakdownSearch: Ref<string> = ref('')
const breakdownPagination: Ref<{ pageIndex: number, pageSize: number }> = ref({
  pageIndex: 0,
  pageSize: 50
})
const draftAmounts: Ref<Record<string, string>> = ref({})
const isSavingBreakdown: Ref<boolean> = ref(false)
const approvalsRefreshKey: Ref<number> = ref(0)
const selectedTab: Ref<string> = ref('breakdown')
const tabs = [
  { key: 'agreement.forecasts.breakdown_title', value: 'breakdown', icon: 'i-lucide-chart-no-axes-column-increasing' },
  { key: 'agreement.forecasts.completion.title', value: 'completion', icon: 'i-lucide-circle-check-big' },
  { key: 'workflow.title', value: 'workflows', icon: 'i-lucide-workflow' },
  { key: 'attachments.title', value: 'attachments', icon: 'i-lucide-paperclip' },
  { key: 'assignments.title', value: 'assignments', icon: 'i-lucide-users' }
]
const isHeroCollapsed = getHeroCollapsed('agreement-forecast-detail')

const {
  data: profile,
  error: profileError,
  status: profileStatus,
  refresh: refreshProfile
} = useFetch<EntityAssignmentContext, FetchError, string>(`/api/entity-assignments/fundingcaseforecast/${forecastId}/context`)
const {
  data: overview,
  error: overviewError,
  status: overviewStatus,
  refresh: refreshOverview
} = useFetch<FundingCaseAgreementForecastOverviewRow, FetchError, string>(`/api/agreements/${agreementId}/forecasts-overview?forecastId=${forecastId}`)

const forecasts = computed<FundingCaseAgreementForecastOverviewRow['forecasts']>(() => overview.value?.forecasts ?? [])
const budgetLineItems = computed<FundingCaseAgreementForecastOverviewRow['budgetLineItems']>(() => overview.value?.budgetLineItems ?? [])
const forecastLineItems = computed<FundingCaseAgreementForecastOverviewRow['lineItems']>(() => overview.value?.lineItems ?? [])
const activeForecast = computed(() =>
  forecasts.value.find((forecast: FundingCaseAgreementForecastOverviewRow['forecasts'][number]) => String(forecast.id) === forecastId) ?? null
)
const activeBudgetLineItems = computed(() => {
  if (!activeForecast.value) {
    return []
  }

  return budgetLineItems.value.filter((line: FundingCaseAgreementBudgetLineItemRow) =>
    String(line.fiscal_year_id) === String(activeForecast.value?.egcs_fc_fiscalyear)
  )
})
const activeForecastLineItems = computed(() => forecastLineItems.value.filter((line: FundingCaseAgreementForecastLineItemRow) =>
  String(line.egcs_fc_agreementforecast) === forecastId
))
const activeVersionLineItems = computed(() => activeForecastLineItems.value.filter((line: FundingCaseAgreementForecastLineItemRow) =>
  String(line.egcs_fc_version) === selectedVersion.value
))
const versions = computed(() => {
  const values = new Set(activeForecastLineItems.value.map((line: FundingCaseAgreementForecastLineItemRow) => String(line.egcs_fc_version)))

  const requestedVersion = String(route.query.version ?? '')
  if (/^\d+$/.test(requestedVersion)) {
    values.add(requestedVersion)
  }

  if (values.size === 0) {
    values.add('0')
  }

  return [...values].sort((a, b) => Number(a) - Number(b))
})
const activeForecastIsLocked = computed(() => isRecordLocked(activeForecast.value))
const canCreateForecastLineItems = computed(() =>
  isAssigned.value && !activeForecastIsLocked.value
)
const canUpdateForecast = computed(() =>
  isAssigned.value && !activeForecastIsLocked.value
)
const canEditForecastBreakdown = computed(() =>
  canCreateForecastLineItems.value || canUpdateForecast.value
)
const hasLoadError = computed(() =>
  Boolean(profileError.value)
  || Boolean(overviewError.value)
  || profileStatus.value === 'error'
  || overviewStatus.value === 'error'
)
const isLoadingDetail = computed(() => profileStatus.value === 'pending' || overviewStatus.value === 'pending')
const retryLoad = async () => {
  await Promise.all([refreshProfile(), refreshOverview()])
}

const getDraftKey = (budgetLineId: string, month: number) => `${budgetLineId}:${month}`

const lineItemByBudgetMonth = computed(() => {
  const byKey = new Map<string, FundingCaseAgreementForecastLineItemRow>()

  for (const line of activeVersionLineItems.value) {
    byKey.set(getDraftKey(String(line.egcs_fc_fundingagreementbudgetlineitem), line.egcs_fc_month), line)
  }

  return byKey
})

const canEditForecastAmount = (budgetLineId: string, month: number): boolean => {
  const existing = lineItemByBudgetMonth.value.get(getDraftKey(budgetLineId, month))
  return existing ? canUpdateForecast.value : canCreateForecastLineItems.value
}

const selectedVersionStatus = computed(() => activeForecast.value?.egcs_fc_status)
const forecastHeroTitle = computed(() => activeForecast.value
  ? t('agreement.forecasts.detail_title', { fiscalYear: activeForecast.value.fiscal_year_display ?? t('common.unavailable') })
  : ''
)
const forecastHeroMetaItems = computed(() => [
  displayValue(profile.value?.egcs_fc_agreementnumber),
  getBilingualValue(profile.value, 'egcs_fc_title', agreementId)
])
const forecastHeroBadges = computed(() => [
  { variant: 'code', label: String(selectedVersion.value), prefixLabel: t('agreement.forecasts.version') },
  {
    statusId: selectedVersionStatus.value,
    isCompleted: activeForecast.value?.isCompleted ?? false,
    prefixLabel: t('common.status')
  }
])
const breadcrumbItems = computed(() => [
  { label: t('agreement.title'), to: localePath(appRouteLocations.agreements()) },
  {
    label: getBilingualValue(profile.value, 'egcs_fc_title', agreementId),
    to: authorizedRouteLocation(profile.value?.can_read_agreement, localePath(appRouteLocations.agreementDetail(agreementId)))
  },
  {
    label: activeForecast.value
      ? t('agreement.forecasts.detail_breadcrumb', {
          fiscalYear: activeForecast.value.fiscal_year_display ?? t('common.unavailable'),
          version: selectedVersion.value
        })
      : forecastId
  }
])

const visiblePeriods = computed<BreakdownPeriod[]>(() =>
  QUARTERS.flatMap((quarter): BreakdownPeriod[] => {
    if (expandedQuarter.value === quarter.key) {
      return quarter.months.map(month => ({
        id: `month:${month}`,
        columnId: `period-month-${month}`,
        label: t(`agreement.forecasts.months.${MONTH_KEYS[month]}`),
        type: 'month' as const,
        quarter: quarter.key,
        months: [month]
      }))
    }

    return [{
      id: `quarter:${quarter.key}`,
      columnId: `period-quarter-${quarter.key}`,
      label: t(`agreement.forecasts.quarters.${quarter.key}`),
      type: 'quarter' as const,
      quarter: quarter.key,
      months: quarter.months
    }]
  })
)
const allBreakdownPeriods = computed<BreakdownPeriod[]>(() => [
  ...QUARTERS.flatMap(quarter => [
    {
      id: `quarter:${quarter.key}`,
      columnId: `period-quarter-${quarter.key}`,
      label: t(`agreement.forecasts.quarters.${quarter.key}`),
      type: 'quarter' as const,
      quarter: quarter.key,
      months: quarter.months
    },
    ...quarter.months.map(month => ({
      id: `month:${month}`,
      columnId: `period-month-${month}`,
      label: t(`agreement.forecasts.months.${MONTH_KEYS[month]}`),
      type: 'month' as const,
      quarter: MONTH_QUARTERS[month] ?? 'q1',
      months: [month]
    }))
  ])
])
const breakdownPeriodColumnVisibility = computed<Record<string, boolean>>(() => Object.fromEntries(
  allBreakdownPeriods.value.map(period => [
    period.columnId,
    period.type === 'quarter'
      ? expandedQuarter.value !== period.quarter
      : expandedQuarter.value === period.quarter
  ])
))

watch(versions, value => {
  if (value.includes(selectedVersion.value)) {
    return
  }

  selectedVersion.value = value[0] ?? '0'
}, { immediate: true })

watch(activeVersionLineItems, () => {
  const nextDraftAmounts: Record<string, string> = {}

  for (const line of activeVersionLineItems.value) {
    nextDraftAmounts[getDraftKey(String(line.egcs_fc_fundingagreementbudgetlineitem), line.egcs_fc_month)] = line.egcs_fc_amount
  }

  for (const budgetLine of activeBudgetLineItems.value) {
    for (let month = 0; month < MONTH_KEYS.length; month += 1) {
      const key = getDraftKey(String(budgetLine.id), month)
      if (nextDraftAmounts[key] === undefined) {
        nextDraftAmounts[key] = '0.00'
      }
    }
  }

  draftAmounts.value = nextDraftAmounts
}, { immediate: true })

const displayValue = (value: string | number | null | undefined) => {
  if (value === undefined || value === null || value === '') {
    return '-'
  }

  return String(value)
}

const ZERO_MONEY = '0.00' as Money
const formatMoney = (value: Money) => formatMoneyText(value, locale.value, 'CAD')

const getDraftAmount = (budgetLineId: string, month: number) =>
  draftAmounts.value[getDraftKey(budgetLineId, month)] ?? ZERO_MONEY

const getDraftMoney = (budgetLineId: string, month: number): Money | null => {
  try {
    return parseMoney(getDraftAmount(budgetLineId, month))
  } catch {
    return null
  }
}

const isDraftAmountInvalid = (budgetLineId: string, month: number) =>
  getDraftMoney(budgetLineId, month) === null
const hasInvalidDraftAmounts = computed(() => Object.values(draftAmounts.value).some(value => {
  try {
    parseMoney(value)
    return false
  } catch {
    return true
  }
}))

const setDraftAmount = (budgetLineId: string, month: number, value: string | number | null | undefined) => {
  draftAmounts.value = {
    ...draftAmounts.value,
    [getDraftKey(budgetLineId, month)]: String(value ?? '')
  }
}
const getInputValue = (event: Event) => (event.target as HTMLInputElement).value

const getPeriodTotal = (budgetLineId: string, months: number[]) =>
  sumMoney(months.map((month: number) => getDraftMoney(budgetLineId, month) ?? ZERO_MONEY))

const getColumnTotal = (months: number[]) =>
  sumMoney(activeBudgetLineItems.value.map((line: FundingCaseAgreementBudgetLineItemRow) => getPeriodTotal(String(line.id), months)))

const getLineTotal = (budgetLineId: string) =>
  sumMoney(MONTH_KEYS.map((_month, index: number) => getDraftMoney(budgetLineId, index) ?? ZERO_MONEY))

const getGrandDraftTotal = () =>
  sumMoney(activeBudgetLineItems.value.map((line: FundingCaseAgreementBudgetLineItemRow) => getLineTotal(String(line.id))))

const getCostCategoryLabel = (line: FundingCaseAgreementBudgetLineItemRow) =>
  getBilingualValue(line, 'organization_cost_category_name', t('common.all'))

const getCostSubsectionLabel = (value: string | null | undefined) => {
  const trimmed = String(value ?? '').trim()
  return trimmed.length > 0 ? trimmed : t('common.all')
}

const breakdownColumns = computed<TableColumnInput<ForecastBreakdownTableRow>[]>(() => [
  { id: COST_CATEGORY_GROUP_COLUMN_ID, accessorKey: COST_CATEGORY_GROUP_COLUMN_ID, headerKey: 'agreement.forecasts.cost_category' },
  { id: COST_SUBSECTION_GROUP_COLUMN_ID, accessorKey: COST_SUBSECTION_GROUP_COLUMN_ID, headerKey: 'agreement.budget.cost_subsection' },
  { id: 'name', accessorKey: 'lineItemNameEn', headerKey: 'agreement.budget.line_item' },
  ...allBreakdownPeriods.value.map(period => ({
    id: period.columnId,
    accessorKey: period.columnId,
    header: period.label
  })),
  { id: 'total', accessorKey: 'total', headerKey: 'agreement.forecasts.total' }
])

const normalizedBreakdownSearch = computed(() => breakdownSearch.value.trim().toLowerCase())
const breakdownRows = computed<ForecastBreakdownTableRow[]>(() => activeBudgetLineItems.value.map(line => {
  const budgetLineId = String(line.id)
  const costCategoryLabel = getCostCategoryLabel(line)
  const costSubsectionLabel = getCostSubsectionLabel(line.egcs_fc_costsubsection)
  const periodTotals = Object.fromEntries(allBreakdownPeriods.value.map(period => [
    period.columnId,
    getPeriodTotal(budgetLineId, period.months)
  ]))

  return {
    id: budgetLineId,
    costCategoryGroup: costCategoryLabel,
    costSubsectionGroup: costSubsectionLabel,
    costCategoryLabel,
    costSubsectionLabel,
    lineItemNameEn: line.line_item_name_en ?? line.egcs_fc_description,
    lineItemNameFr: line.line_item_name_fr ?? line.egcs_fc_description,
    description: line.egcs_fc_description,
    budgetLineId,
    periodTotals,
    total: getLineTotal(budgetLineId)
  }
}))
const filteredBreakdownRows = computed(() => {
  if (normalizedBreakdownSearch.value.length === 0) {
    return breakdownRows.value
  }

  return breakdownRows.value.filter(row => [
    row.costCategoryLabel,
    row.costSubsectionLabel,
    row.lineItemNameEn,
    row.lineItemNameFr,
    row.description
  ].some(value => value.toLowerCase().includes(normalizedBreakdownSearch.value)))
})

const {
  expandedRows: breakdownExpandedRows,
  grouping: breakdownGrouping,
  columnVisibility: breakdownColumnVisibility,
  groupingOptions: breakdownGroupingOptions,
  expandedOptions: breakdownExpandedOptions,
  isGroupedRow: isGroupedBreakdownRow,
  isGroupRow: isBreakdownGroupRow,
  getLeafRows: getBreakdownLeafRows,
  getGroupedRowCount: getBreakdownGroupedRowCount,
  canExpandGroupedRow: canExpandBreakdownGroupedRow,
  updateExpandedRows: updateBreakdownExpandedRows
} = useGroupedTableExpansion<ForecastBreakdownTableRow>({
  rows: filteredBreakdownRows,
  groups: [
    {
      id: COST_CATEGORY_GROUP_COLUMN_ID,
      getValue: row => row.costCategoryGroup
    },
    {
      id: COST_SUBSECTION_GROUP_COLUMN_ID,
      getValue: row => row.costSubsectionGroup
    }
  ],
  defaultExpanded: true
})
const breakdownTableColumnVisibility = computed(() => ({
  ...breakdownColumnVisibility.value,
  ...breakdownPeriodColumnVisibility.value
}))

const isBreakdownCostCategoryGroupRow = (row: GroupedForecastBreakdownRow) => isBreakdownGroupRow(row, COST_CATEGORY_GROUP_COLUMN_ID)
const isBreakdownCostSubsectionGroupRow = (row: GroupedForecastBreakdownRow) => isBreakdownGroupRow(row, COST_SUBSECTION_GROUP_COLUMN_ID)
const getBreakdownGroupedTotal = (row: GroupedForecastBreakdownRow, key: string) =>
  sumMoney(getBreakdownLeafRows(row).map(leafRow => {
    if (key === 'total') {
      return leafRow.original.total
    }

    return leafRow.original.periodTotals[key] ?? ZERO_MONEY
  }))

const toggleQuarter = (quarter: QuarterKey) => {
  expandedQuarter.value = expandedQuarter.value === quarter ? null : quarter
}

const refreshPage = async () => {
  await refreshOverview()
  approvalsRefreshKey.value += 1
}

const saveForecastBreakdown = async () => {
  if (!activeForecast.value || isSavingBreakdown.value || !canEditForecastBreakdown.value) {
    return
  }

  try {
    isSavingBreakdown.value = true
    const canonicalDraftAmounts = new Map<string, Money>()

    for (const budgetLine of activeBudgetLineItems.value) {
      const budgetLineId = String(budgetLine.id)
      for (let month = 0; month < MONTH_KEYS.length; month += 1) {
        const amount = getDraftMoney(budgetLineId, month)
        if (amount === null) {
          toast.add({
            title: t('common.error'),
            description: t('validation.invalid_number'),
            color: 'error'
          })
          return
        }
        canonicalDraftAmounts.set(getDraftKey(budgetLineId, month), amount)
      }
    }

    for (const budgetLine of activeBudgetLineItems.value) {
      const budgetLineId = String(budgetLine.id)

      for (let month = 0; month < MONTH_KEYS.length; month += 1) {
        const amount = canonicalDraftAmounts.get(getDraftKey(budgetLineId, month)) ?? ZERO_MONEY
        const existing = lineItemByBudgetMonth.value.get(getDraftKey(budgetLineId, month))

        if (existing && existing.egcs_fc_amount !== amount && canUpdateForecast.value) {
          await saveJson(`/api/agreements/${agreementId}/forecast-line-items/${existing.id}`, 'PATCH', { egcs_fc_amount: amount })
        }

        if (!existing && amount !== ZERO_MONEY && canCreateForecastLineItems.value) {
          await saveJson(`/api/agreements/${agreementId}/forecast-line-items`, 'POST', {
            egcs_fc_agreementforecast: forecastId,
            egcs_fc_fundingagreementbudgetlineitem: budgetLineId,
            egcs_fc_month: month,
            egcs_fc_amount: amount,
            egcs_fc_currency: 'cad',
            egcs_fc_version: selectedVersion.value
          })
        }
      }
    }

    await refreshPage()
    toast.add({
      title: t('common.success'),
      description: t('agreement.forecasts.saved_breakdown'),
      color: 'success'
    })
  } catch (error: unknown) {
    showError(error)
  } finally {
    isSavingBreakdown.value = false
  }
}
</script>

<template>
  <div class="flex w-full flex-col">
    <UAlert v-if="hasLoadError" color="error" icon="i-lucide-circle-alert" :title="t('common.resource_table_load_failed')" :description="t('common.resource_table_load_failed_description')">
      <template #actions>
        <UButton color="error" variant="soft" icon="i-lucide-refresh-cw" :label="t('common.retry')" :loading="isLoadingDetail" @click="retryLoad" />
      </template>
    </UAlert>
    <div v-else-if="isLoadingDetail && (!profile || !activeForecast)" role="status" aria-live="polite" class="flex min-h-32 items-center justify-center gap-2 text-sm text-muted">
      <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" aria-hidden="true" /><span>{{ t('common.loading_records') }}</span>
    </div>
    <UDashboardPanel v-if="profile && activeForecast" id="agreement-forecast-detail" class="w-full">
      <template #header>
        <UDashboardNavbar>
          <template #leading>
            <UDashboardSidebarCollapse />
            <UBreadcrumb :items="breadcrumbItems" class="ml-2" />
          </template>
          <template #right>
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
        <div class="flex flex-1 flex-col">
          <CommonEntityHero
            :is-collapsed="isHeroCollapsed"
            icon="i-lucide-chart-no-axes-column-increasing"
            :title="forecastHeroTitle"
            :meta-items="forecastHeroMetaItems"
            :badges="forecastHeroBadges" />

          <CommonEntityEditorWorkspace content-test-id="agreement-forecast-detail-content">
            <template #sidebar>
              <CommonRouteTabs v-model="selectedTab" :items="tabs" orientation="vertical" :ui="{ root: 'w-full', list: 'w-full flex-col items-stretch p-0', trigger: 'w-full justify-start' }" />
            </template>
            <CommonSection v-if="selectedTab === 'breakdown'" :title="t('agreement.forecasts.breakdown_title')" :grid-cols="1">
              <div class="space-y-4">
                <div class="flex flex-wrap items-end justify-between gap-3">
                  <div class="flex items-center gap-2">
                    <UFormField :label="t('agreement.forecasts.version')" name="selectedVersion" class="min-w-40">
                      <USelect
                        v-model="selectedVersion"
                        :items="versions.map(version => ({ label: version, value: version }))"
                        class="w-full" />
                    </UFormField>
                  </div>

                  <CommonSaveButton
                    v-if="canEditForecastBreakdown"
                    type="button"
                    :label="t('agreement.forecasts.save_breakdown')"
                    :loading="isSavingBreakdown"
                    :disabled="isSavingBreakdown || hasInvalidDraftAmounts"
                    @click="saveForecastBreakdown" />
                </div>

                <CommonResourceLayoutCard
                  v-model:search="breakdownSearch"
                  v-model:pagination="breakdownPagination"
                  :data="filteredBreakdownRows"
                  :columns="breakdownColumns"
                  :grouping="breakdownGrouping"
                  :grouping-options="breakdownGroupingOptions"
                  :expanded-options="breakdownExpandedOptions"
                  :column-visibility="breakdownTableColumnVisibility"
                  :expanded="breakdownExpandedRows"
                  :total-records="filteredBreakdownRows.length"
                  :loading="overviewStatus === 'pending'"
                  table-class="agreement-forecast-breakdown-table"
                  :show-button="false"
                  :show-column-toggle="false"
                  :search-placeholder="t('agreement.budget.search')"
                  @update:expanded="updateBreakdownExpandedRows">
                  <template #name-cell="{ row }">
                    <div :id="getGroupedDisclosureContentId(row as GroupedForecastBreakdownRow)" class="contents">
                      <div v-if="isBreakdownCostCategoryGroupRow(row as GroupedForecastBreakdownRow)" class="flex w-full items-center gap-3 py-1">
                        <CommonGroupedDisclosureButton
                          v-if="canExpandBreakdownGroupedRow(row as GroupedForecastBreakdownRow)"
                          class="group flex min-w-0 items-center gap-3 text-left"
                          :expanded="row.getIsExpanded?.() === true"
                          :controls="getGroupedDisclosureControlsId(row.id)"
                          :label="row.original.costCategoryLabel"
                          @toggle="row.toggleExpanded?.()">
                          <UIcon
                            :name="row.getIsExpanded?.() ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                            class="size-4 text-zinc-400 transition-colors group-hover:text-primary" />
                          <span class="text-sm font-semibold text-zinc-900 dark:text-white">
                            {{ row.original.costCategoryLabel }}
                          </span>
                          <CommonStatusBadge variant="count" size="sm" :label="String(getBreakdownGroupedRowCount(row as GroupedForecastBreakdownRow))" />
                        </CommonGroupedDisclosureButton>
                      </div>

                      <div v-else-if="isBreakdownCostSubsectionGroupRow(row as GroupedForecastBreakdownRow)" class="flex w-full items-center gap-3 py-1 pl-6">
                        <CommonGroupedDisclosureButton
                          v-if="canExpandBreakdownGroupedRow(row as GroupedForecastBreakdownRow)"
                          class="group flex min-w-0 items-center gap-3 text-left"
                          :expanded="row.getIsExpanded?.() === true"
                          :controls="getGroupedDisclosureControlsId(row.id)"
                          :label="row.original.costSubsectionLabel"
                          @toggle="row.toggleExpanded?.()">
                          <UIcon
                            :name="row.getIsExpanded?.() ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                            class="size-4 text-zinc-400 transition-colors group-hover:text-primary" />
                          <span class="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                            {{ row.original.costSubsectionLabel }}
                          </span>
                          <CommonStatusBadge variant="count" size="sm" :label="String(getBreakdownGroupedRowCount(row as GroupedForecastBreakdownRow))" />
                        </CommonGroupedDisclosureButton>
                      </div>

                      <div v-else class="flex min-w-0 max-w-full flex-col gap-1 pl-12">
                        <CommonBilingualName
                          :name-en="row.original.lineItemNameEn"
                          :name-fr="row.original.lineItemNameFr" />
                        <p v-if="row.original.description" class="min-w-0 max-w-full whitespace-normal break-words text-sm text-zinc-500 dark:text-zinc-400">
                          {{ row.original.description }}
                        </p>
                      </div>
                    </div>
                  </template>

                  <template v-for="period in allBreakdownPeriods" :key="period.columnId" #[`${period.columnId}-header`]>
                    <button
                      v-if="period.type === 'quarter'"
                      type="button"
                      class="inline-flex cursor-default items-center gap-2 rounded-sm bg-primary px-3 py-1.5 text-sm font-semibold text-white"
                      :aria-label="`${period.label} ${t('common.expand')}`"
                      @click.stop="toggleQuarter(period.quarter)">
                      {{ period.label }}
                      <UIcon name="i-lucide-between-horizontal-start" class="size-4" />
                    </button>
                    <button
                      v-else
                      type="button"
                      class="group inline-flex cursor-default items-center gap-2 rounded-sm border border-transparent px-2 py-1 text-xs font-semibold tracking-wide text-zinc-500 uppercase transition-colors hover:border-primary/30 hover:text-primary dark:text-zinc-400"
                      :aria-label="`${period.label} ${t('common.collapse')}`"
                      @click.stop="toggleQuarter(period.quarter)">
                      {{ period.label }}
                      <UIcon name="i-lucide-between-horizontal-end" class="size-4 text-zinc-400 transition-colors group-hover:text-primary" />
                    </button>
                  </template>

                  <template v-for="period in allBreakdownPeriods" :key="`${period.columnId}:cell`" #[`${period.columnId}-cell`]="{ row }">
                    <span v-if="isGroupedBreakdownRow(row as GroupedForecastBreakdownRow)" class="font-medium text-zinc-700 dark:text-zinc-200">
                      {{ formatMoney(getBreakdownGroupedTotal(row as GroupedForecastBreakdownRow, period.columnId)) }}
                    </span>
                    <div v-else-if="period.type === 'month' && canEditForecastAmount(row.original.budgetLineId, period.months[0] ?? 0)" class="w-40">
                      <input
                        :value="getDraftAmount(row.original.budgetLineId, period.months[0] ?? 0)"
                        :disabled="isSavingBreakdown"
                        type="text"
                        inputmode="decimal"
                        :aria-invalid="isDraftAmountInvalid(row.original.budgetLineId, period.months[0] ?? 0)"
                        :aria-label="`${period.label} ${row.original.lineItemNameEn}`"
                        class="w-full rounded-md border bg-default px-2.5 py-1.5 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-75"
                        :class="isDraftAmountInvalid(row.original.budgetLineId, period.months[0] ?? 0) ? 'border-error focus:ring-2 focus:ring-error/40' : 'border-default focus:ring-2 focus:ring-primary/40'"
                        @input="event => setDraftAmount(row.original.budgetLineId, period.months[0] ?? 0, getInputValue(event))">
                      <p v-if="isDraftAmountInvalid(row.original.budgetLineId, period.months[0] ?? 0)" class="mt-1 text-xs text-error">
                        {{ t('validation.invalid_number') }}
                      </p>
                    </div>
                    <span v-else class="font-medium text-zinc-700 dark:text-zinc-200">
                      {{ formatMoney(row.original.periodTotals[period.columnId] ?? ZERO_MONEY) }}
                    </span>
                  </template>

                  <template #total-cell="{ row }">
                    <span class="font-bold text-primary">
                      {{ formatMoney(isGroupedBreakdownRow(row as GroupedForecastBreakdownRow) ? getBreakdownGroupedTotal(row as GroupedForecastBreakdownRow, 'total') : row.original.total) }}
                    </span>
                  </template>

                  <template #footer-left>
                    <div class="flex flex-wrap gap-x-5 gap-y-1">
                      <span
                        v-for="period in visiblePeriods"
                        :key="`footer:${period.columnId}`">
                        {{ period.label }}: {{ formatMoney(getColumnTotal(period.months)) }}
                      </span>
                      <span class="text-primary">{{ t('agreement.forecasts.total') }}: {{ formatMoney(getGrandDraftTotal()) }}</span>
                    </div>
                  </template>
                </CommonResourceLayoutCard>
              </div>
            </CommonSection>

            <section v-else-if="selectedTab === 'completion'" class="space-y-6">
              <CommonCompletionPanel
                entity-type="fundingcaseforecast"
                :entity-id="forecastId"
                :can-complete="canUpdateForecast"
                :can-work-workflow="isAssigned"
                :hide-title="false"
                :show-divider="false"
                title-key="agreement.forecasts.completion.title"
                description-key="agreement.forecasts.completion.description"
                status-complete-key="agreement.forecasts.completion.status_complete"
                status-locked-key="agreement.forecasts.completion.status_locked"
                comment-placeholder-key="agreement.forecasts.completion.comment_placeholder"
                complete-action-key="agreement.forecasts.completion.complete"
                completed-success-key="agreement.forecasts.completion.completed_success"
                :refresh-key="approvalsRefreshKey"
                @changed="refreshPage" />
            </section>

            <CommonWorkflowSection v-else-if="selectedTab === 'workflows'" entity-type="fundingcaseforecast" :entity-id="forecastId" purpose="standard" :can-edit="isAssigned" :refresh-key="approvalsRefreshKey" @changed="refreshPage" />
            <CommonAttachmentsTab v-else-if="selectedTab === 'attachments'" entity-type="fundingcaseforecast" :entity-id="forecastId" />
            <CommonAssignedUsers v-else-if="selectedTab === 'assignments'" entity-type="fundingcaseforecast" :entity-id="forecastId" />
          </CommonEntityEditorWorkspace>
        </div>
      </template>
    </UDashboardPanel>
  </div>
</template>
