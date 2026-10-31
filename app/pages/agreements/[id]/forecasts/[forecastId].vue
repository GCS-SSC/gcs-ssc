<script setup lang="ts">
import { useFieldTooltipProvider } from '~/composables/useFieldTooltipProvider'
import type { LocalizedToastText } from '~/composables/useLocalizedToast'
import { usePageResourceError } from '~/composables/usePageResourceError'
import type { FetchError } from 'ofetch'
import { useStatusCatalog } from '~/composables/useStatusCatalog'
import { useBusinessStatusState } from '~/composables/useBusinessStatusState'
/* eslint-disable jsdoc/require-jsdoc -- page-local callbacks use self-descriptive signatures */
import { computed, nextTick, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { ExpandedState, Updater } from '@tanstack/vue-table'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { useGroupedTableExpansion, type GroupedTableRow } from '~/composables/useGroupedTableExpansion'
import CommonCompletionPanel from '~/components/Common/Completions/Panel.vue'
import { appRouteLocations, authorizedRouteLocation } from '~/utils/route-locations'
import type { EntityAssignmentContext } from '~~/shared/types/schemas/entity-assignment'
import type { FundingCaseAgreementForecastBreakdownPatch } from '~~/shared/types/schemas'
import type {
  FundingCaseAgreementBudgetLineItemRow,
  FundingCaseAgreementForecastLineItemRow,
  FundingCaseAgreementForecastOverviewRow
} from '~~/shared/types/funding-case-agreement-ui'
import { compareMoney, formatMoneyText, parseMoney, sumMoney, type Money } from '~~/shared/utils/money'

definePageMeta({
  key: route => route.path,
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
  historical: boolean
  periodTotals: Record<string, Money>
  total: Money
  funding?: { kind: 'program' } | { kind: 'other', subtype: string }
  fundingRows?: ForecastBreakdownTableRow[]
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
const toast = useLocalizedToast()
const { getHeroCollapsed } = useDashboard()
const { showError } = useApiErrorToast()
const { getBilingualValue } = useBilingualValue()
const { saveJson } = useJsonRequest()
const { isRecordLocked, isTerminalStatus } = useBusinessStatusState()
const statusCatalog = useStatusCatalog()

const agreementId = route.params.id as string
const forecastId = route.params.forecastId as string
const { isAssigned, status: assignmentStatus } = useEntityAssignmentRoster('fundingcaseforecast', forecastId)

const expandedQuarters: Ref<QuarterKey[]> = ref([])
const breakdownSearch: Ref<string> = ref('')
const breakdownPagination: Ref<{ pageIndex: number, pageSize: number }> = ref({
  pageIndex: 0,
  pageSize: 50
})
const draftAmounts: Ref<Record<string, string>> = ref({})
const draftFundingAmounts: Ref<Record<string, Money>> = ref({})
const monthlyEditorRow: Ref<ForecastBreakdownTableRow | null> = ref(null)
const monthlyEditorOpen = ref(false)
const monthlyEditorAmounts: Ref<Record<number, string>> = ref({})
const isSavingBreakdown: Ref<boolean> = ref(false)
const breakdownReloadRequired = ref(false)
const approvalsRefreshKey: Ref<number> = ref(0)

const tabs = [
  { key: 'agreement.forecasts.breakdown_title', value: 'breakdown', icon: 'i-lucide-chart-no-axes-column-increasing' },
  { key: 'agreement.forecasts.completion.title', value: 'completion', icon: 'i-lucide-circle-check-big' },
  { key: 'reviews.title', value: 'reviews', icon: 'i-lucide-clipboard-check' },
  { key: 'workflow.title', value: 'workflows', icon: 'i-lucide-workflow' },
  { key: 'supplementary_information.title', value: 'supplementary-information', icon: 'i-lucide-clipboard-list' },
  { key: 'attachments.title', value: 'attachments', icon: 'i-lucide-paperclip' },
  { key: 'assignments.title', value: 'assignments', icon: 'i-lucide-users' }
]
const { selectedTab } = useUrlTabState({ tabs, defaultTab: 'breakdown' })
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

usePageResourceError({
  identity: () => route.path,
  errors: [profileError, overviewError],
  pending: () => profileStatus.value === 'pending' || overviewStatus.value === 'pending',
  hasContent: () => Boolean(profile.value && overview.value)
})

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
const getStableBudgetLineId = (line: FundingCaseAgreementForecastLineItemRow) => line.budget_line_stable_id
type ForecastDisplayBudgetLine = {
  id: string
  egcs_fc_description: string
  egcs_fc_costsubsection?: string | null
  organization_cost_category_name_en?: string | null
  organization_cost_category_name_fr?: string | null
  line_item_name_en?: string | null
  line_item_name_fr?: string | null
  historical: boolean
}
const displayedBudgetLineItems = computed(() => {
  const rows: ForecastDisplayBudgetLine[] = activeBudgetLineItems.value.map(line => ({
    id: String(line.id), egcs_fc_description: line.egcs_fc_description,
    egcs_fc_costsubsection: line.egcs_fc_costsubsection,
    organization_cost_category_name_en: line.organization_cost_category_name_en,
    organization_cost_category_name_fr: line.organization_cost_category_name_fr,
    line_item_name_en: line.line_item_name_en, line_item_name_fr: line.line_item_name_fr,
    historical: false
  }))
  const ids = new Set(rows.map(line => line.id))
  for (const saved of activeForecastLineItems.value) {
    const id = getStableBudgetLineId(saved)
    if (ids.has(id)) continue
    ids.add(id)
    rows.push({ id, egcs_fc_description: saved.budget_line_description ?? '',
      egcs_fc_costsubsection: saved.egcs_fc_costsubsection,
      organization_cost_category_name_en: saved.organization_cost_category_name_en,
      organization_cost_category_name_fr: saved.organization_cost_category_name_fr,
      line_item_name_en: saved.line_item_name_en, line_item_name_fr: saved.line_item_name_fr,
      historical: true })
  }
  return rows
})
const activeForecastIsLocked = computed(() => isRecordLocked(activeForecast.value))
const canCreateForecastLineItems = computed(() => profile.value?.can_create_agreement_role === true)
const canUpdateForecast = computed(() => profile.value?.can_update_agreement_role === true)
const canEditForecastBreakdown = computed(() => canCreateForecastLineItems.value || canUpdateForecast.value)
const workflowPrerequisiteWarning = computed(() => {
  if (!isAssigned.value) return toast.localized('assignments.read_only_description')
  if (!activeForecast.value || isTerminalStatus(activeForecast.value.egcs_fc_status)) return toast.localized('apiErrors.request.invalid_status')
  return undefined
})
const completionPrerequisiteWarning = computed(() => workflowPrerequisiteWarning.value
  ?? (activeForecastIsLocked.value ? toast.localized('apiErrors.request.invalid_status') : undefined))
const warnPrerequisite = (warning: LocalizedToastText | undefined): boolean => {
  if (!warning) return false
  toast.add({ title: toast.localized('common.warning'), description: warning, color: 'warning' })
  return true
}
const canMutateForecast = (roleAllowed: boolean): boolean => !isLoadingDetail.value && roleAllowed
  && !warnPrerequisite(completionPrerequisiteWarning.value)
const hasLoadError = computed(() =>
  Boolean(profileError.value)
  || Boolean(overviewError.value)
  || profileStatus.value === 'error'
  || overviewStatus.value === 'error'
)
const isLoadingDetail = computed(() => profileStatus.value === 'pending' || overviewStatus.value === 'pending'
  || assignmentStatus.value === 'pending'
  || (statusCatalog.state.value.status === 'pending' && !statusCatalog.getById(activeForecast.value?.egcs_fc_status)))
const retryLoad = async () => {
  await Promise.all([refreshProfile(), refreshOverview()])
}

const getDraftKey = (budgetLineId: string, month: number) => `${budgetLineId}:${month}`

const lineItemByBudgetMonth = computed(() => {
  const byKey = new Map<string, FundingCaseAgreementForecastLineItemRow>()

  for (const line of activeForecastLineItems.value) {
    byKey.set(getDraftKey(getStableBudgetLineId(line), line.egcs_fc_month), line)
  }

  return byKey
})

const canEditForecastAmount = (budgetLineId: string, month: number): boolean => {
  const existing = lineItemByBudgetMonth.value.get(getDraftKey(budgetLineId, month))
  return activeBudgetLineItems.value.some(line => String(line.id) === budgetLineId)
    && (!existing || existing.budget_line_available) && isAssigned.value && !activeForecastIsLocked.value
    && (existing ? canUpdateForecast.value : canCreateForecastLineItems.value)
}

const openMonthlyEditor = (row: ForecastBreakdownTableRow) => {
  if (isSavingBreakdown.value || !canMutateForecast(canEditForecastBreakdown.value)) return
  if (row.historical || !activeBudgetLineItems.value.some(line => String(line.id) === row.budgetLineId)) {
    warnPrerequisite(toast.localized('agreement.forecasts.historical_budget_line_read_only'))
    return
  }
  monthlyEditorRow.value = row
  monthlyEditorAmounts.value = Object.fromEntries(MONTH_KEYS.map((_key, month) => [month, row.funding?.kind === 'other' ? getDraftFundingAmount(row.budgetLineId, row.funding.subtype, month) : getDraftAmount(row.budgetLineId, month)]))
  monthlyEditorOpen.value = true
}
const isMonthlyEditorAmountInvalid = (month: number) => {
  try {
    return compareMoney(parseMoney(monthlyEditorAmounts.value[month] ?? ''), ZERO_MONEY) < 0
  } catch {
    return true
  }
}
const selectMonthlyAmount = async (event: FocusEvent) => {
  const input = event.target
  if (!(input instanceof HTMLInputElement)) return
  await nextTick()
  requestAnimationFrame(() => {
    if (document.activeElement === input) input.select()
  })
}
const applyMonthlyEditor = () => {
  const row = monthlyEditorRow.value
  if (!row || isSavingBreakdown.value || !canMutateForecast(canEditForecastBreakdown.value)) return
  if (!activeBudgetLineItems.value.some(line => String(line.id) === row.budgetLineId)) {
    warnPrerequisite(toast.localized('agreement.forecasts.historical_budget_line_read_only'))
    return
  }
  if (MONTH_KEYS.some((_key, month) => isMonthlyEditorAmountInvalid(month))) return
  MONTH_KEYS.forEach((_key, month) => {
    if (!canEditForecastAmount(row.budgetLineId, month)) return
    if (row.funding?.kind === 'other') {
      setDraftFundingAmount(row.budgetLineId, row.funding.subtype, month, parseMoney(monthlyEditorAmounts.value[month] ?? ''))
    } else {
      setDraftAmount(row.budgetLineId, month, monthlyEditorAmounts.value[month])
    }
  })
  monthlyEditorOpen.value = false
}

const forecastHeroTitle = computed(() => activeForecast.value
  ? t('agreement.forecasts.detail_title', { fiscalYear: activeForecast.value.fiscal_year_display ?? t('common.unavailable') })
  : ''
)
const forecastHeroMetaItems = computed(() => [
  displayValue(profile.value?.egcs_fc_agreementnumber),
  profile.value?.egcs_fc_currency?.toUpperCase() ?? '',
  getBilingualValue(profile.value, 'egcs_fc_title', agreementId)
])
const forecastHeroBadges = computed(() => [
  ...(activeForecast.value?.egcs_fc_active ? [{ variant: 'code', label: t('agreement.forecasts.active') }] : []),
  { variant: 'code', label: String(activeForecast.value?.egcs_fc_version ?? ''), prefixLabel: t('agreement.forecasts.version') },
  {
    statusId: activeForecast.value?.egcs_fc_status,
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
          version: activeForecast.value?.egcs_fc_version
        })
      : forecastId
  }
])

const visiblePeriods = computed<BreakdownPeriod[]>(() =>
  QUARTERS.flatMap((quarter): BreakdownPeriod[] => {
    if (expandedQuarters.value.includes(quarter.key)) {
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
      ? !expandedQuarters.value.includes(period.quarter)
      : expandedQuarters.value.includes(period.quarter)
  ])
))

watch(activeForecastLineItems, () => {
  if (!breakdownReloadRequired.value) draftAmounts.value = {}
}, { immediate: true })

const displayValue = (value: string | number | null | undefined) => {
  if (value === undefined || value === null || value === '') {
    return '-'
  }

  return String(value)
}

const ZERO_MONEY = '0.00' as Money
const formatMoney = (value: Money) => profile.value?.egcs_fc_currency
  ? formatMoneyText(value, locale.value, profile.value.egcs_fc_currency.toUpperCase())
  : value

const getDraftAmount = (budgetLineId: string, month: number) => {
  if (!activeBudgetLineItems.value.some(line => String(line.id) === budgetLineId)) {
    return lineItemByBudgetMonth.value.get(getDraftKey(budgetLineId, month))?.egcs_fc_amount ?? ZERO_MONEY
  }
  const key = getDraftKey(budgetLineId, month)
  return draftAmounts.value[key] ?? lineItemByBudgetMonth.value.get(key)?.egcs_fc_amount ?? ZERO_MONEY
}

const getDraftMoney = (budgetLineId: string, month: number): Money | null => {
  try {
    return parseMoney(getDraftAmount(budgetLineId, month))
  } catch {
    return null
  }
}

const hasInvalidDraftAmounts = computed(() => activeBudgetLineItems.value.some(line =>
  MONTH_KEYS.some((_month, month) => getDraftMoney(String(line.id), month) === null)
))

const setDraftAmount = (budgetLineId: string, month: number, value: string | number | null | undefined) => {
  const key = getDraftKey(budgetLineId, month)
  const draft = String(value ?? '')
  draftAmounts.value = draft === (lineItemByBudgetMonth.value.get(key)?.egcs_fc_amount ?? ZERO_MONEY)
    ? Object.fromEntries(Object.entries(draftAmounts.value).filter(([draftKey]) => draftKey !== key))
    : { ...draftAmounts.value, [key]: draft }
}

const getFundingDraftKey = (budgetLineId: string, subtype: string, month: number) => `${budgetLineId}:${month}:${subtype}`
const getSavedFundingAmount = (budgetLineId: string, subtype: string, month: number) =>
  lineItemByBudgetMonth.value.get(getDraftKey(budgetLineId, month))?.egcs_fc_fundingsources
    .find(source => source.egcs_fc_fundingsubtype === subtype)?.egcs_fc_amount ?? ZERO_MONEY
const getDraftFundingAmount = (budgetLineId: string, subtype: string, month: number) =>
  draftFundingAmounts.value[getFundingDraftKey(budgetLineId, subtype, month)] ?? getSavedFundingAmount(budgetLineId, subtype, month)
const setDraftFundingAmount = (budgetLineId: string, subtype: string, month: number, amount: Money) => {
  const key = getFundingDraftKey(budgetLineId, subtype, month)
  if (amount === getSavedFundingAmount(budgetLineId, subtype, month)) {
    draftFundingAmounts.value = Object.fromEntries(Object.entries(draftFundingAmounts.value).filter(([draftKey]) => draftKey !== key))
  } else draftFundingAmounts.value[key] = amount
}
const getProposedFundingSources = (budgetLineId: string, month: number) => {
  const sources = new Map((lineItemByBudgetMonth.value.get(getDraftKey(budgetLineId, month))?.egcs_fc_fundingsources ?? [])
    .map(source => [source.egcs_fc_fundingsubtype, { egcs_fc_fundingsubtype: source.egcs_fc_fundingsubtype, egcs_fc_amount: source.egcs_fc_amount }]))
  const prefix = `${budgetLineId}:${month}:`
  for (const [key, amount] of Object.entries(draftFundingAmounts.value)) {
    if (key.startsWith(prefix)) sources.set(key.slice(prefix.length), { egcs_fc_fundingsubtype: key.slice(prefix.length), egcs_fc_amount: amount })
  }
  return [...sources.values()]
}

const getPeriodTotal = (budgetLineId: string, months: number[]) =>
  sumMoney(months.map((month: number) => getDraftMoney(budgetLineId, month) ?? ZERO_MONEY))

const getColumnTotal = (months: number[]) =>
  sumMoney(displayedBudgetLineItems.value.map(line => getPeriodTotal(String(line.id), months)))

const getLineTotal = (budgetLineId: string) =>
  sumMoney(MONTH_KEYS.map((_month, index: number) => getDraftMoney(budgetLineId, index) ?? ZERO_MONEY))

const getGrandDraftTotal = () =>
  sumMoney(displayedBudgetLineItems.value.map(line => getLineTotal(String(line.id))))

const getCostCategoryLabel = (line: { organization_cost_category_name_en?: string | null, organization_cost_category_name_fr?: string | null }) =>
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
  { id: 'total', accessorKey: 'total', headerKey: 'agreement.forecasts.total' },
  ...(activeBudgetLineItems.value.some(line => MONTH_KEYS.some((_key, month) => canEditForecastAmount(String(line.id), month)))
    ? [{ id: 'actions', headerKey: 'common.actions' }]
    : [])
])

const normalizedBreakdownSearch = computed(() => breakdownSearch.value.trim().toLowerCase())
const breakdownRows = computed<ForecastBreakdownTableRow[]>(() => displayedBudgetLineItems.value.map(line => {
  const budgetLineId = String(line.id)
  const costCategoryLabel = getCostCategoryLabel(line)
  const costSubsectionLabel = getCostSubsectionLabel(line.egcs_fc_costsubsection)
  const periodTotals = Object.fromEntries(allBreakdownPeriods.value.map(period => [
    period.columnId,
    getPeriodTotal(budgetLineId, period.months)
  ]))

  const row: ForecastBreakdownTableRow = {
    id: budgetLineId,
    costCategoryGroup: costCategoryLabel,
    costSubsectionGroup: costSubsectionLabel,
    costCategoryLabel,
    costSubsectionLabel,
    lineItemNameEn: line.line_item_name_en ?? line.egcs_fc_description,
    lineItemNameFr: line.line_item_name_fr ?? line.egcs_fc_description,
    description: line.egcs_fc_description,
    budgetLineId,
    historical: line.historical,
    periodTotals,
    total: getLineTotal(budgetLineId)
  }
  const sourceDefinitions = new Map([
    ...(activeBudgetLineItems.value.find(item => String(item.id) === budgetLineId)?.egcs_fc_fundingsources ?? []),
    ...activeForecastLineItems.value.filter(item => getStableBudgetLineId(item) === budgetLineId).flatMap(item => item.egcs_fc_fundingsources)
  ].map(source => [source.egcs_fc_fundingsubtype, source]))
  row.fundingRows = [{
    ...row, id: `${row.id}:program`, funding: { kind: 'program' },
    lineItemNameEn: t('agreement.budget.program_funding'), lineItemNameFr: t('agreement.budget.program_funding'), description: ''
  }, ...[...sourceDefinitions.values()].map((source): ForecastBreakdownTableRow => {
    const subtype = source.egcs_fc_fundingsubtype
    return {
      ...row, id: `${row.id}:source:${subtype}`, funding: { kind: 'other', subtype }, description: '',
      lineItemNameEn: [source.funding_type_name_en, source.funding_subtype_name_en].filter(Boolean).join(' / ') || subtype,
      lineItemNameFr: [source.funding_type_name_fr, source.funding_subtype_name_fr].filter(Boolean).join(' / ') || subtype,
      periodTotals: Object.fromEntries(allBreakdownPeriods.value.map(period => [period.columnId,
        sumMoney(period.months.map(month => getDraftFundingAmount(budgetLineId, subtype, month)))])),
      total: sumMoney(MONTH_KEYS.map((_key, month) => getDraftFundingAmount(budgetLineId, subtype, month)))
    }
  })]
  return row
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
  groupingOptions: baseBreakdownGroupingOptions,
  getGroupRowId: getBreakdownGroupRowId,
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
  defaultExpanded: true,
  isPlaceholder: row => Boolean(row.funding)
})
const breakdownGroupingOptions = { ...baseBreakdownGroupingOptions, getSubRows: (row: ForecastBreakdownTableRow) => row.fundingRows }
const expandedFundingRows: Ref<Record<string, boolean>> = ref({})
const breakdownTableExpanded = computed<ExpandedState>(() => ({
  ...(breakdownExpandedRows.value === true
    ? Object.fromEntries(filteredBreakdownRows.value.flatMap(row => [0, 1].map(index => [getBreakdownGroupRowId(row, index), true])))
    : breakdownExpandedRows.value),
  ...expandedFundingRows.value
}))
const updateBreakdownTableExpanded = (value: Updater<ExpandedState>) => {
  const next = typeof value === 'function' ? value(breakdownTableExpanded.value) : value
  updateBreakdownExpandedRows(next)
  expandedFundingRows.value = Object.fromEntries(filteredBreakdownRows.value.map(row => [row.id, next === true || next[row.id] === true]))
}
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
  expandedQuarters.value = expandedQuarters.value.includes(quarter)
    ? expandedQuarters.value.filter(key => key !== quarter)
    : [...expandedQuarters.value, quarter]
}

const refreshPage = async () => {
  await refreshOverview()
  approvalsRefreshKey.value += 1
}

const reloadForecastBreakdown = async () => {
  let pendingDrafts = { ...draftAmounts.value }
  let pendingFundingDrafts = { ...draftFundingAmounts.value }
  breakdownReloadRequired.value = true
  try {
    await refreshPage()
    if (overviewError.value || overviewStatus.value === 'error') {
      throw overviewError.value ?? new Error(t('common.resource_table_load_failed'))
    }
    pendingDrafts = Object.fromEntries(Object.entries(pendingDrafts).filter(([key, value]) => {
      try {
        return parseMoney(value) !== (lineItemByBudgetMonth.value.get(key)?.egcs_fc_amount ?? ZERO_MONEY)
      } catch {
        return true
      }
    }))
    pendingFundingDrafts = Object.fromEntries(Object.entries(pendingFundingDrafts).filter(([key, value]) => {
      const [budgetLineId, month, subtype] = key.split(':')
      return value !== getSavedFundingAmount(budgetLineId ?? '', subtype ?? '', Number(month))
    }))
    breakdownReloadRequired.value = false
    return true
  } catch (error: unknown) {
    showError(error)
    return false
  } finally {
    draftAmounts.value = pendingDrafts
    draftFundingAmounts.value = pendingFundingDrafts
  }
}

const saveForecastBreakdown = async () => {
  if (!activeForecast.value || isSavingBreakdown.value || !canMutateForecast(canEditForecastBreakdown.value)) {
    return
  }

  try {
    isSavingBreakdown.value = true
    if (breakdownReloadRequired.value && !await reloadForecastBreakdown()) return
    const cells: FundingCaseAgreementForecastBreakdownPatch['cells'] = []

    for (const budgetLine of activeBudgetLineItems.value) {
      const budgetLineId = String(budgetLine.id)
      for (let month = 0; month < MONTH_KEYS.length; month += 1) {
        const amount = getDraftMoney(budgetLineId, month)
        if (amount === null) {
          toast.add({
            title: toast.localized('common.error'),
            description: toast.localized('validation.invalid_number'),
            color: 'error'
          })
          return
        }
        const existing = lineItemByBudgetMonth.value.get(getDraftKey(budgetLineId, month))
        const fundingChanged = Object.keys(draftFundingAmounts.value).some(key => key.startsWith(`${budgetLineId}:${month}:`))
        if (!fundingChanged && (existing ? existing.egcs_fc_amount === amount : amount === ZERO_MONEY)) continue
        if (!(existing ? canUpdateForecast.value : canCreateForecastLineItems.value)) {
          warnPrerequisite(t('apiErrors.request.invalid_status'))
          return
        }
        cells.push({
          egcs_fc_fundingagreementbudgetlineitem: budgetLineId,
          egcs_fc_month: month,
          egcs_fc_amount: amount,
          ...(fundingChanged ? { egcs_fc_fundingsources: getProposedFundingSources(budgetLineId, month) } : {}),
          expected: existing
            ? {
                id: existing.id, egcs_fc_amount: existing.egcs_fc_amount,
                ...(fundingChanged
                  ? { egcs_fc_fundingsources: existing.egcs_fc_fundingsources.map(source => ({
                      egcs_fc_fundingsubtype: source.egcs_fc_fundingsubtype, egcs_fc_amount: source.egcs_fc_amount
                    })) }
                  : {})
              }
            : null
        })
      }
    }

    if (cells.length > 0) {
      // A failed response may follow a committed save; reload before any retry.
      breakdownReloadRequired.value = true
      await saveJson(`/api/agreements/${agreementId}/forecasts/${forecastId}/breakdown`, 'PATCH', { cells })
      const savedKeys = new Set(cells.map(cell => getDraftKey(cell.egcs_fc_fundingagreementbudgetlineitem, cell.egcs_fc_month)))
      draftAmounts.value = Object.fromEntries(Object.entries(draftAmounts.value).filter(([key]) => !savedKeys.has(key)))
      draftFundingAmounts.value = Object.fromEntries(Object.entries(draftFundingAmounts.value).filter(([key]) => !savedKeys.has(key.slice(0, key.lastIndexOf(':')))))
    }
    if (!await reloadForecastBreakdown()) return
    toast.add({
      title: toast.localized('common.success'),
      description: toast.localized('agreement.forecasts.saved_breakdown'),
      color: 'success'
    })
  } catch (error: unknown) {
    showError(error)
    if (breakdownReloadRequired.value) await reloadForecastBreakdown()
  } finally {
    isSavingBreakdown.value = false
  }
}

useFieldTooltipProvider(() => activeForecast.value && String(activeForecast.value.id) === String(route.params.forecastId) ? { entityType: 'fundingcaseforecast', entityId: activeForecast.value.id } : null)
</script>

<template>
  <div data-field-tooltip-context="agreement" data-field-scope="agreements.forecasts" data-scope-label-en="Agreements > Forecasts > Breakdown" data-scope-label-fr="Ententes > Prévisions > Ventilation" class="flex w-full flex-col">
    <UAlert v-if="hasLoadError" color="error" icon="i-lucide-circle-alert" :title="t('common.resource_table_load_failed')" :description="t('common.resource_table_load_failed_description')">
      <template #actions>
        <UButton color="error" variant="soft" icon="i-lucide-refresh-cw" :label="t('common.retry')" :loading="isLoadingDetail" @click="retryLoad" />
      </template>
    </UAlert>
    <div v-else-if="isLoadingDetail && (!profile || !activeForecast)" role="status" aria-live="polite" class="sr-only">
      <span>{{ t('common.loading_records') }}</span>
    </div>
    <CommonDetailPage v-if="profile && activeForecast" id="agreement-forecast-detail" v-model:collapsed="isHeroCollapsed" data-help-view="casework.forecasts.detail" :breadcrumb-items="breadcrumbItems" class="w-full">
      <template #body>
        <div class="flex flex-1 flex-col">
          <CommonEntityHero
            :is-collapsed="isHeroCollapsed"
            icon="i-lucide-chart-no-axes-column-increasing"
            :title="forecastHeroTitle"
            :meta-items="forecastHeroMetaItems"
            :badges="forecastHeroBadges" />

          <CommonDetailWorkspace v-model="selectedTab" help-navigation-group-target="casework.forecasts.detail.section-navigation" data-field-container="Page navigation state, not a business input field." :items="tabs" content-test-id="agreement-forecast-detail-content">
            <CommonSection v-if="selectedTab === 'breakdown'" data-help-view="casework.forecasts.breakdown" :show-header="false" :title="t('agreement.forecasts.breakdown_title')" :grid-cols="1">
              <div class="space-y-4">
                <div class="flex flex-wrap items-end justify-between gap-3">
                  <CommonSaveButton
                    v-if="canEditForecastBreakdown"
                    data-help-target="casework.forecasts.detail.forecasts-save-breakdown"
                    type="button"
                    :label="t('agreement.forecasts.save_breakdown')"
                    :loading="isSavingBreakdown"
                    :disabled="isLoadingDetail || isSavingBreakdown || hasInvalidDraftAmounts"
                    @click="saveForecastBreakdown" />
                </div>

                <section data-help-target="casework.forecasts.breakdown.records">
                  <CommonResourceLayoutCard
                    v-model:search="breakdownSearch"
                    v-model:pagination="breakdownPagination"
                    help-search-target="casework.forecasts.breakdown.search"
                    :data="filteredBreakdownRows"
                    :columns="breakdownColumns"
                    :grouping="breakdownGrouping"
                    :grouping-options="breakdownGroupingOptions"
                    :expanded-options="breakdownExpandedOptions"
                    :column-visibility="breakdownTableColumnVisibility"
                    :expanded="breakdownTableExpanded"
                    :total-records="filteredBreakdownRows.length"
                    :loading="overviewStatus === 'pending'"
                    table-class="agreement-forecast-breakdown-table"
                    :show-button="false"
                    :show-column-toggle="false"
                    :search-placeholder="t('agreement.budget.search')"
                    @update:expanded="updateBreakdownTableExpanded">
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

                        <div v-else-if="row.original.funding" class="pl-20 text-sm text-zinc-700 dark:text-zinc-200">
                          {{ row.original.funding.kind === 'program' ? t('agreement.budget.program_funding') : getBilingualValue({ name_en: row.original.lineItemNameEn, name_fr: row.original.lineItemNameFr }, 'name', '') }}
                        </div>
                        <div v-else class="flex min-w-0 max-w-full items-start gap-3 pl-12">
                          <CommonGroupedDisclosureButton
                            class="mt-0.5 shrink-0"
                            :expanded="row.getIsExpanded?.() === true"
                            :controls="getGroupedDisclosureControlsId(row.id)"
                            :label="getBilingualValue({ name_en: row.original.lineItemNameEn, name_fr: row.original.lineItemNameFr }, 'name', '')"
                            @toggle="row.toggleExpanded?.()">
                            <UIcon :name="row.getIsExpanded?.() ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-4 text-zinc-400" />
                          </CommonGroupedDisclosureButton>
                          <div class="flex min-w-0 flex-col gap-1">
                            <CommonBilingualName
                              :name-en="row.original.lineItemNameEn"
                              :name-fr="row.original.lineItemNameFr" />
                            <p v-if="row.original.description" class="min-w-0 max-w-full whitespace-normal break-words text-sm text-zinc-500 dark:text-zinc-400">
                              {{ row.original.description }}
                            </p>
                            <p v-if="row.original.historical" class="text-sm text-muted">
                              {{ t('agreement.forecasts.historical_budget_line_read_only') }}
                            </p>
                          </div>
                        </div>
                      </div>
                    </template>

                    <template v-for="period in allBreakdownPeriods" :key="period.columnId" #[`${period.columnId}-header`]>
                      <button
                        v-if="period.type === 'quarter'"
                        type="button"
                        class="inline-flex cursor-default items-center gap-2 rounded-sm bg-primary px-3 py-1.5 text-sm font-semibold text-white"
                        :aria-label="`${period.label} ${t('common.expand')}`"
                        :aria-expanded="false"
                        @click.stop="toggleQuarter(period.quarter)">
                        {{ period.label }}
                        <UIcon name="i-lucide-between-horizontal-start" class="size-4" />
                      </button>
                      <button
                        v-else
                        type="button"
                        class="group inline-flex cursor-default items-center gap-2 rounded-sm border border-transparent px-2 py-1 text-xs font-semibold tracking-wide text-zinc-500 uppercase transition-colors hover:border-primary/30 hover:text-primary dark:text-zinc-400"
                        :aria-label="`${period.label} ${t('common.collapse')}`"
                        :aria-expanded="true"
                        @click.stop="toggleQuarter(period.quarter)">
                        {{ period.label }}
                        <UIcon name="i-lucide-between-horizontal-end" class="size-4 text-zinc-400 transition-colors group-hover:text-primary" />
                      </button>
                    </template>

                    <template v-for="period in allBreakdownPeriods" :key="`${period.columnId}:cell`" #[`${period.columnId}-cell`]="{ row }">
                      <span v-if="isGroupedBreakdownRow(row as GroupedForecastBreakdownRow)" class="font-medium text-zinc-700 dark:text-zinc-200">
                        {{ formatMoney(getBreakdownGroupedTotal(row as GroupedForecastBreakdownRow, period.columnId)) }}
                      </span>
                      <span v-else class="font-medium text-zinc-700 dark:text-zinc-200">
                        {{ formatMoney(row.original.periodTotals[period.columnId] ?? ZERO_MONEY) }}
                      </span>
                    </template>

                    <template #total-cell="{ row }">
                      <span class="font-bold text-primary">
                        {{ formatMoney(isGroupedBreakdownRow(row as GroupedForecastBreakdownRow) ? getBreakdownGroupedTotal(row as GroupedForecastBreakdownRow, 'total') : row.original.total) }}
                      </span>
                    </template>

                    <template #actions-cell="{ row }">
                      <CommonActionButton
                        v-if="!isGroupedBreakdownRow(row as GroupedForecastBreakdownRow) && row.original.funding?.kind !== 'program' && MONTH_KEYS.some((_key, month) => canEditForecastAmount(row.original.budgetLineId, month))"
                        :data-help-instance="row.original.id"
                        icon="i-lucide-pencil"
                        color="neutral"
                        variant="ghost"
                        size="sm"
                        :disabled="isLoadingDetail || isSavingBreakdown"
                        :aria-label="`${t('common.edit')}: ${getBilingualValue({ name_en: row.original.lineItemNameEn, name_fr: row.original.lineItemNameFr }, 'name', '')}`"
                        @click="openMonthlyEditor(row.original)" />
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
                </section>
              </div>
            </CommonSection>

            <section v-else-if="selectedTab === 'completion'" data-help-view="casework.forecasts.completion" data-help-target="casework.forecasts.detail.completion" data-help-kind="section" class="space-y-6">
              <CommonCompletionPanel
                entity-type="fundingcaseforecast"
                :entity-id="forecastId"
                :can-complete="canUpdateForecast"
                :can-work-workflow="isAssigned"
                :action-role-allowed="canUpdateForecast"
                :completion-prerequisite-warning="completionPrerequisiteWarning"
                :workflow-prerequisite-warning="workflowPrerequisiteWarning"
                :show-header="false"
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

            <CommonReviewsTab
              v-else-if="selectedTab === 'reviews'"
              data-help-view="casework.forecasts.reviews"
              entity-type="fundingcaseforecast"
              :entity-id="forecastId"
              :can-update="canUpdateForecast && isAssigned && !activeForecastIsLocked"
              @changed="refreshPage" />

            <CommonWorkflowSection v-else-if="selectedTab === 'workflows'" data-help-view="casework.forecasts.workflows" entity-type="fundingcaseforecast" :entity-id="forecastId" purpose="standard" :can-edit="isAssigned" :action-role-allowed="canUpdateForecast" :action-prerequisite-warning="workflowPrerequisiteWarning" :refresh-key="approvalsRefreshKey" @changed="refreshPage" />
            <section v-else-if="selectedTab === 'supplementary-information'" data-help-view="casework.forecasts.supplementary-information" data-help-target="casework.forecasts.supplementary-information.content">
              <CommonWorkflowSupplementaryInformation :show-header="false" entity-type="fundingcaseforecast" :entity-id="forecastId" />
            </section>
            <CommonAttachmentsTab v-else-if="selectedTab === 'attachments'" data-help-view="casework.forecasts.attachments" entity-type="fundingcaseforecast" :entity-id="forecastId" />
            <CommonAssignedUsers v-else-if="selectedTab === 'assignments'" data-help-view="casework.forecasts.assignments" :show-header="false" entity-type="fundingcaseforecast" :entity-id="forecastId" />
          </CommonDetailWorkspace>
        </div>
      </template>
    </CommonDetailPage>
    <UModal
      v-if="monthlyEditorRow"
      v-model:open="monthlyEditorOpen"
      data-help-view="casework.forecasts.detail.monthly-editor-open"
      :title="`${t('common.edit')}: ${getBilingualValue({ name_en: monthlyEditorRow.lineItemNameEn, name_fr: monthlyEditorRow.lineItemNameFr }, 'name', '')}`"
      :ui="{ content: 'sm:max-w-2xl', body: 'max-h-[75vh] overflow-y-auto' }">
      <template #body>
        <div class="space-y-6">
          <div class="space-y-4" @focusin="selectMonthlyAmount">
            <fieldset v-for="quarter in QUARTERS" :key="quarter.key" class="min-w-0 rounded-lg border border-default bg-muted/20 px-4 pb-4">
              <legend class="px-2">
                <span class="inline-flex rounded-md bg-primary/10 px-2.5 py-1 text-xs font-bold tracking-wide text-primary">
                  {{ t(`agreement.forecasts.quarters.${quarter.key}`) }}
                </span>
              </legend>
              <div class="grid grid-cols-1 gap-4 pt-3 sm:grid-cols-3">
                <UFormField v-for="month in quarter.months" :key="month" data-field-label-en="Monthly amount" data-field-label-fr="Montant mensuel" data-ui-target="agreements.forecasts.month-amount" :label="t(`agreement.forecasts.months.${MONTH_KEYS[month]}`)" :name="`month-${month}`" required>
                  <CommonCurrencyInput
                    :model-value="monthlyEditorAmounts[month]"
                    :currency="profile?.egcs_fc_currency"
                    :disabled="!canEditForecastAmount(monthlyEditorRow.budgetLineId, month)"
                    required
                    aria-required="true"
                    :aria-label="`${t(`agreement.forecasts.months.${MONTH_KEYS[month]}`)} ${locale === 'fr' ? monthlyEditorRow.lineItemNameFr : monthlyEditorRow.lineItemNameEn}`"
                    :aria-invalid="isMonthlyEditorAmountInvalid(month)"
                    :aria-describedby="isMonthlyEditorAmountInvalid(month) ? `forecast-month-error-${month}` : undefined"
                    @update:model-value="value => monthlyEditorAmounts[month] = String(value ?? '')" />
                  <p v-if="isMonthlyEditorAmountInvalid(month)" :id="`forecast-month-error-${month}`" class="mt-1 text-xs text-error">
                    {{ t('validation.invalid_number') }}
                  </p>
                </UFormField>
              </div>
            </fieldset>
          </div>
          <div class="flex justify-end gap-2">
            <UButton data-help-target="casework.forecasts.detail.monthly-editor-open.common-cancel" :label="t('common.cancel')" color="neutral" variant="ghost" @click="monthlyEditorOpen = false" />
            <UButton
              data-help-target="casework.forecasts.detail.monthly-editor-open.common-update"
              data-testid="apply-forecast-months"
              :label="t('common.update')"
              :disabled="isLoadingDetail || isSavingBreakdown || MONTH_KEYS.some((_key, month) => isMonthlyEditorAmountInvalid(month))"
              @click="applyMonthlyEditor" />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
