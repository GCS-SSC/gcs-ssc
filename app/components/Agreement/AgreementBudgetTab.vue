<script setup lang="ts">
import { withFormRequirements } from '~~/shared/utils/form-requirements'
import type { Currency_Codes } from '~~/shared/types/database'
import { useBudgetCalculationPreview } from '~/composables/useBudgetCalculationPreview'
import { useBilingualValue } from '~/composables/useBilingualValue'
import { useCrudModalPending } from '~/composables/useCrudModal'
/* eslint-disable jsdoc/require-jsdoc -- Budget table callbacks are exercised by focused component tests. */
import { computed, onUnmounted, ref, watch } from 'vue'
import type { ExpandedState, Updater } from '@tanstack/vue-table'
import type { Ref } from 'vue'
import type { BilingualColumnConfig, TableColumnInput } from '~/composables/useTableColumns'
import { useGroupedTableExpansion, type GroupedTableRow } from '~/composables/useGroupedTableExpansion'
import { useAgreementChildActionPrerequisites, type AgreementChildActionTarget, type AgreementChildAction, type AgreementChildArea } from '~/composables/useAgreementChildActionPrerequisites'
import type {
  FundingCaseAgreementBudgetFiscalYearForm,
  FundingCaseAgreementBudgetFiscalYearRow,
  FundingCaseAgreementBudgetLineItemForm,
  FundingCaseAgreementBudgetLineItemRow,
  FundingCaseAgreementBudgetOverviewRow
} from '~~/shared/types/funding-case-agreement-ui'
import {
  FundingCaseAgreementBudgetFiscalYearCreateSchema,
  FundingCaseAgreementBudgetLineItemCreateSchema,
  FundingCaseAgreementFundingSourceSchema
} from '~~/shared/types/schemas'
import {
  compareMoney,
  formatMoneyText,
  moneyFromCents,
  moneyToCents,
  parseMoney,
  sumMoney,
  type Money
} from '~~/shared/utils/money'

type LookupItem = {
  id: string
  label_en?: string | null
  label_fr?: string | null
}

type JsonFetch = (
  url: string,
  options: {
    method: 'PATCH' | 'POST'
    body: Record<string, unknown>
  }
) => Promise<unknown>

type BudgetLeafRow = {
  id: string
  fiscalYearGroup: string
  costCategoryGroup: string
  costSubsectionGroup: string
  fiscalYearId: string
  fiscalYearDisplay: string
  costCategoryAvailable?: boolean
  costCategoryId?: string
  costCategoryNameEn: string
  costCategoryNameFr: string
  costCategoryLabel: string
  costSubsectionLabel: string
  lineItemId?: string
  lineItemNameEn: string
  lineItemNameFr: string
  proponentNameEn?: string | null
  proponentNameFr?: string | null
  description: string
  totalAmount?: Money
  programFunding?: Money
  fundingSources?: FundingCaseAgreementBudgetLineItemRow['egcs_fc_fundingsources']
  currency?: string
  isPlaceholder: boolean
  fundingKind?: 'program' | 'other'
}

type GroupedBudgetRow = GroupedTableRow<BudgetLeafRow>
type BudgetFundingSource = FundingCaseAgreementBudgetLineItemRow['egcs_fc_fundingsources'][number]
type FundingSourceEdit = { lineId: string, originalSubtype: string | null, source: BudgetFundingSource }

const FISCAL_YEAR_GROUP_COLUMN_ID = 'fiscalYearGroup'
const COST_CATEGORY_GROUP_COLUMN_ID = 'costCategoryGroup'
const COST_SUBSECTION_GROUP_COLUMN_ID = 'costSubsectionGroup'

const {
  agreementId,
  currency: agreementCurrency,
  canCreate,
  canUpdate,
  canDelete,
  canCreateFiscalYear,
  canUpdateFiscalYear,
  canDeleteFiscalYear,
  allowDeleteFiscalYearWithLines = false,
  apiBase,
  actionTarget,
  fiscalYearLookupUrl,
  snapshotOverview,
  agreementProponentCount,
  staticMode = false,
  embedded = false
} = defineProps<{
  agreementId: string
  currency?: Currency_Codes
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
  canCreateFiscalYear: boolean
  canUpdateFiscalYear: boolean
  canDeleteFiscalYear: boolean
  allowDeleteFiscalYearWithLines?: boolean
  actionTarget?: AgreementChildActionTarget
  apiBase?: string
  fiscalYearLookupUrl?: string
  snapshotOverview?: FundingCaseAgreementBudgetOverviewRow
  agreementProponentCount?: number
  staticMode?: boolean
  embedded?: boolean
}>()

const { t, locale } = useI18n()
const { getBilingualValue } = useBilingualValue()
const { getGroupedDisclosureControlsId, getGroupedDisclosureContentId } = useGroupedDisclosureIds()
const toast = useLocalizedToast()
const { createValidator } = useZodI18n()
const { showError } = useApiErrorToast()
const { check } = useAgreementChildActionPrerequisites(() => actionTarget)

const search: Ref<string> = ref('')
const pagination: Ref<{ pageIndex: number, pageSize: number }> = ref({
  pageIndex: 0,
  pageSize: 50
})

const fiscalYearModal = useCrudModal<FundingCaseAgreementBudgetFiscalYearRow, FundingCaseAgreementBudgetFiscalYearForm>({
  createState: () => ({}),
  updateState: fiscalYear => ({
    id: fiscalYear.id,
    egcs_fc_fiscalyear: fiscalYear.egcs_fc_fiscalyear
  })
})
const lineItemModal = useCrudModal<FundingCaseAgreementBudgetLineItemRow, FundingCaseAgreementBudgetLineItemForm>({
  createState: () => ({
    egcs_fc_currency: agreementCurrency,
    egcs_fc_applicantrecipient: proponents.value.length === 1 ? proponents.value[0]?.id : undefined,
    egcs_fc_fundingsources: []
  }),
  updateState: lineItem => ({
    ...lineItem,
    id: lineItem.id,
    egcs_fc_fundingagreementbudgetfiscalyear: lineItem.egcs_fc_fundingagreementbudgetfiscalyear,
    egcs_fc_organizationcostcategory: lineItem.egcs_fc_organizationcostcategory,
    egcs_fc_costsubsection: lineItem.egcs_fc_costsubsection,
    egcs_fc_description: lineItem.egcs_fc_description,
    egcs_fc_totalamount: lineItem.egcs_fc_totalamount,
    egcs_fc_programfunding: lineItem.egcs_fc_programfunding,
    egcs_fc_fundingsources: lineItem.egcs_fc_fundingsources.map(source => ({ ...source })),
    egcs_fc_currency: lineItem.egcs_fc_currency
  })
})

const selectedFiscalYear = fiscalYearModal.selected
const fundingSourceModal = useCrudModal<FundingSourceEdit, FundingSourceEdit>({ updateState: item => ({ ...item, source: { ...item.source } }) })
const selectedFundingSource = fundingSourceModal.selected
const isFundingSourceModalOpen = fundingSourceModal.isOpen
const validateFundingSource = createValidator(FundingCaseAgreementFundingSourceSchema)
const fundingSourcePending = useCrudModalPending(fundingSourceModal.captureSession)
const retainedFundingOption = computed(() => {
  const source = selectedFundingSource.value?.source
  if (!source || source.egcs_fc_fundingsubtype !== selectedFundingSource.value?.originalSubtype) return []
  const typeName = locale.value === 'fr' ? source.funding_type_name_fr : source.funding_type_name_en
  const subtypeName = locale.value === 'fr' ? source.funding_subtype_name_fr : source.funding_subtype_name_en
  return subtypeName ? [{ value: source.egcs_fc_fundingsubtype, label: typeName ? `${typeName} / ${subtypeName}` : subtypeName }] : []
})
const isFiscalYearModalOpen = fiscalYearModal.isOpen
const selectedLineItem = lineItemModal.selected
const isLineItemModalOpen = lineItemModal.isOpen
const validateFiscalYear = createValidator(FundingCaseAgreementBudgetFiscalYearCreateSchema)
const lineItemValidator = createValidator(FundingCaseAgreementBudgetLineItemCreateSchema)
const validateLineItem = withFormRequirements(async (state: FundingCaseAgreementBudgetLineItemForm) => {
  const isManual = !state.egcs_fc_calculationmode || state.egcs_fc_calculationmode === 'manual'
  const errors = await lineItemValidator({
    ...state,
    egcs_fc_percentage: state.egcs_fc_percentage ?? undefined,
    egcs_fc_programfunding: isManual ? state.egcs_fc_programfunding : undefined
  } as Parameters<typeof lineItemValidator>[0])
  if (isManual && state.egcs_fc_programfunding === undefined) {
    errors.push({ name: 'egcs_fc_programfunding', message: t('validation.required') })
  }
  if (!state.egcs_fc_applicantrecipient && !errors.some(error => error.name === 'egcs_fc_applicantrecipient')) {
    errors.push({ name: 'egcs_fc_applicantrecipient', message: t('validation.required') })
  }
  return errors
}, FundingCaseAgreementBudgetLineItemCreateSchema)
const fiscalYearPending = useCrudModalPending(fiscalYearModal.captureSession)
const lineItemPending = useCrudModalPending(lineItemModal.captureSession)
const isSavingFiscalYear = fiscalYearPending.isPending
const isSavingLineItem = lineItemPending.isPending
const isLineItemCostCategoryLocked: Ref<boolean> = ref(false)
const isLineItemCostSubsectionLocked: Ref<boolean> = ref(false)
const resourceBase = computed<string>(() => apiBase ?? `/api/agreements/${agreementId}`)
const overviewEndpoint = computed<string>(() => `${resourceBase.value}/budget-overview`)
const fiscalYearLookupEndpoint = computed<string>(() => fiscalYearLookupUrl ?? `/api/agreements/${agreementId}/budget-fiscal-years/lookups/fiscal-years`)
let fiscalYearContextGeneration = 0
const pendingDeletes = new Map<string, symbol>()
const targetKey = computed(() => actionTarget ? `${actionTarget.kind}:${actionTarget.agreementId}:${actionTarget.kind === 'amendment' ? actionTarget.amendmentId : ''}` : '')
watch([() => agreementId, resourceBase, fiscalYearLookupEndpoint, targetKey, () => staticMode], () => {
  fiscalYearContextGeneration += 1
  pendingDeletes.clear()
  fiscalYearModal.close()
  lineItemModal.close()
  fundingSourceModal.close()
}, { flush: 'sync' })
onUnmounted(() => {
  fiscalYearContextGeneration += 1
  pendingDeletes.clear()
})
const canSaveFiscalYear = computed(() => !staticMode && Boolean(selectedFiscalYear.value)
  && (selectedFiscalYear.value?.id ? canUpdateFiscalYear : canCreateFiscalYear))
const useOverviewFetch = useFetch as unknown as (url: Ref<string>) => {
  data: Ref<FundingCaseAgreementBudgetOverviewRow | null>
  refresh: () => Promise<void>
  status: Ref<'idle' | 'pending' | 'success' | 'error'>
}
const useFiscalYearLookupFetch = useFetch as unknown as (
  url: string,
  options: {
    query: { page: number, limit: number, permission_action: 'create' | 'update' }
    immediate: boolean
  }
) => {
  data: Ref<{ items: LookupItem[] } | null>
  refresh: () => Promise<void>
}
const liveOverview = staticMode ? null : useOverviewFetch(overviewEndpoint)
const {
  data: fetchedOverview,
  refresh: refreshOverview,
  status: overviewStatus
} = liveOverview ?? {
  data: ref(null),
  refresh: async () => undefined,
  status: ref('success' as const)
}
const overview = computed<FundingCaseAgreementBudgetOverviewRow | null>(() => snapshotOverview ?? fetchedOverview.value)
const budgetDifferences = computed(() => overview.value?.budget_differences ?? [])
const {
  data: fiscalYearLookupResponse
} = useFiscalYearLookupFetch(fiscalYearLookupEndpoint.value, {
  query: {
    page: 1,
    limit: 100,
    permission_action: canCreateFiscalYear ? 'create' : 'update'
  },
  immediate: !staticMode && (canCreateFiscalYear || canUpdateFiscalYear)
})
const allColumns: TableColumnInput<BudgetLeafRow>[] = [
  { id: FISCAL_YEAR_GROUP_COLUMN_ID, accessorKey: FISCAL_YEAR_GROUP_COLUMN_ID, headerKey: 'agreement.budget.fiscal_year' },
  { id: COST_CATEGORY_GROUP_COLUMN_ID, accessorKey: COST_CATEGORY_GROUP_COLUMN_ID, headerKey: 'agreement.budget.line_item' },
  { id: COST_SUBSECTION_GROUP_COLUMN_ID, accessorKey: COST_SUBSECTION_GROUP_COLUMN_ID, headerKey: 'agreement.budget.cost_subsection' },
  { id: 'name', accessorKey: 'lineItemNameEn', headerKey: 'agreement.budget.line_item' },
  { id: 'totalAmount', accessorKey: 'totalAmount', headerKey: 'agreement.budget.total_amount' },
  { id: 'programFunding', accessorKey: 'programFunding', headerKey: 'agreement.budget.program_funding' },
  { id: 'otherFunding', headerKey: 'agreement.budget.other_funding_total' },
  { id: 'actions', headerKey: 'common.actions' }
]
const columns = computed<TableColumnInput<BudgetLeafRow>[]>(() =>
  staticMode ? allColumns.filter(column => column.id !== 'actions') : allColumns)

const bilingualColumns: BilingualColumnConfig<BudgetLeafRow>[] = [
  {
    id: 'name',
    accessorKey: {
      en: 'lineItemNameEn',
      fr: 'lineItemNameFr'
    },
    headerKey: 'agreement.budget.line_item'
  }
]

const fiscalYears = computed<FundingCaseAgreementBudgetFiscalYearRow[]>(() => overview.value?.fiscalYears ?? [])
const lineItems = computed<FundingCaseAgreementBudgetLineItemRow[]>(() => overview.value?.lineItems ?? [])
const proponents = computed(() => overview.value?.proponents ?? [])
const hasMultipleProponents = computed(() => (agreementProponentCount ?? proponents.value.length) > 1)
const isSoleProponentSelected = computed(() => proponents.value.length === 1
  && selectedLineItem.value?.egcs_fc_applicantrecipient === proponents.value[0]?.id)
const proponentOptions = computed(() => {
  const current = selectedLineItem.value
  const saved = current?.id ? lineItems.value.find(item => item.id === current.id) : undefined
  if (!saved || current?.egcs_fc_applicantrecipient !== saved.egcs_fc_applicantrecipient
    || proponents.value.some(item => item.id === saved.egcs_fc_applicantrecipient)) return proponents.value
  return [...proponents.value, {
    id: saved.egcs_fc_applicantrecipient,
    label_en: saved.applicant_recipient_name_en,
    label_fr: saved.applicant_recipient_name_fr,
    disabled: true
  }]
})
watch(proponents, items => {
  if (items.length === 1 && selectedLineItem.value && !selectedLineItem.value.id
    && selectedLineItem.value.egcs_fc_applicantrecipient === undefined) {
    selectedLineItem.value.egcs_fc_applicantrecipient = items[0]?.id
  }
})
// Saved labels keep inactive references readable without adding them to new-line lookups.
const retainedCostCategoryOptions = computed(() => {
  const current = selectedLineItem.value
  const saved = current?.id ? lineItems.value.find(item => item.id === current.id) : undefined
  if (!saved || saved.cost_category_available !== false || current?.egcs_fc_organizationcostcategory !== saved.egcs_fc_organizationcostcategory) return []
  const name = locale.value === 'fr' ? saved.line_item_name_fr : saved.line_item_name_en
  return [{ value: saved.egcs_fc_organizationcostcategory, label: `${name ?? saved.egcs_fc_organizationcostcategory} (${t('common.inactive')})` }]
})

const calculationPreview = useBudgetCalculationPreview(selectedLineItem, lineItems)
/**
 * Captures the selected agency defaults for a new budget row.
 * @param items - Selected lookup records.
 */
const hydrateCalculation = (items: Record<string, unknown>[]) => {
  const state = selectedLineItem.value
  if (!state || state.id) return
  const definition = items.find(item => String(item.id) === state.egcs_fc_organizationcostcategory)
  if (!definition) return
  state.egcs_fc_calculationmode = definition.egcs_ay_calculationmode as 'manual' | 'category' | 'all_other'
  state.egcs_fc_sourcecategory = definition.egcs_ay_sourcecategory as string | null
  state.egcs_fc_percentage = definition.egcs_ay_percentage as number | null
  state.egcs_fc_allowpercentageoverride = definition.egcs_ay_allowpercentageoverride as boolean
  state.calculation_source_name_en = definition.calculation_source_name_en as string | null
  state.calculation_source_name_fr = definition.calculation_source_name_fr as string | null
  state.calculation_category_id = definition.calculation_category_id as string
}

const fiscalYearDisplayById = computed(() => new Map(
  (fiscalYearLookupResponse.value?.items ?? []).map((item: LookupItem) => [
    String(item.id),
    String(item.label_en ?? item.id)
  ])
))
const selectedFiscalYearOptions = computed(() => {
  const selected = selectedFiscalYear.value
  if (!selected?.egcs_fc_fiscalyear) return []
  const value = String(selected.egcs_fc_fiscalyear)
  const persisted = fiscalYears.value.find(row => String(row.id) === String(selected.id)
    && String(row.egcs_fc_fiscalyear) === value)
  const candidate = fiscalYearLookupResponse.value?.items.find(item => String(item.id) === value)
  const label = persisted?.fiscal_year_display
    || (locale.value === 'fr' ? candidate?.label_fr : candidate?.label_en)
  return label ? [{ value, label: String(label) }] : []
})
const getFiscalYearDisplay = (fiscalYearId: unknown, display?: string | null) => {
  if (typeof display === 'string' && display.trim().length > 0) {
    return display
  }

  return String(fiscalYearDisplayById.value.get(String(fiscalYearId)) ?? fiscalYearId)
}
const agreementFiscalYearLookupItems = computed<LookupItem[]>(() => fiscalYears.value.map(fiscalYear => ({
  id: String(fiscalYear.id),
  label_en: getFiscalYearDisplay(fiscalYear.egcs_fc_fiscalyear, fiscalYear.fiscal_year_display),
  label_fr: getFiscalYearDisplay(fiscalYear.egcs_fc_fiscalyear, fiscalYear.fiscal_year_display)
})))
const normalizedSearch = computed(() => search.value.trim().toLowerCase())

const filteredLineItems = computed(() => {
  if (normalizedSearch.value.length === 0) {
    return lineItems.value
  }

  return lineItems.value.filter((lineItem: FundingCaseAgreementBudgetLineItemRow) => {
    const searchableValues = [
      lineItem.fiscal_year_display,
      lineItem.organization_cost_category_name_en,
      lineItem.organization_cost_category_name_fr,
      lineItem.egcs_fc_costsubsection,
      lineItem.line_item_name_en,
      lineItem.line_item_name_fr,
      lineItem.applicant_recipient_name_en,
      lineItem.applicant_recipient_name_fr,
      lineItem.egcs_fc_description
    ]

    return searchableValues.some(value => String(value ?? '').toLowerCase().includes(normalizedSearch.value))
  })
})

const getCostCategoryDisplay = (lineItem: FundingCaseAgreementBudgetLineItemRow) => {
  if (locale.value === 'fr') {
    return lineItem.organization_cost_category_name_fr?.trim() || lineItem.organization_cost_category_name_en?.trim() || t('common.all')
  }

  return lineItem.organization_cost_category_name_en?.trim() || lineItem.organization_cost_category_name_fr?.trim() || t('common.all')
}

const filteredFiscalYears = computed(() => {
  if (normalizedSearch.value.length === 0) {
    return fiscalYears.value
  }

  const matchingFiscalYearIds = new Set(filteredLineItems.value.map((lineItem: FundingCaseAgreementBudgetLineItemRow) => String(lineItem.fiscal_year_id)))

  return fiscalYears.value.filter((fiscalYear: FundingCaseAgreementBudgetFiscalYearRow) => (
    matchingFiscalYearIds.has(String(fiscalYear.id))
    || getFiscalYearDisplay(fiscalYear.egcs_fc_fiscalyear, fiscalYear.fiscal_year_display).toLowerCase().includes(normalizedSearch.value)
  ))
})

const tableRows = computed<BudgetLeafRow[]>(() => filteredFiscalYears.value.flatMap<BudgetLeafRow>((fiscalYear: FundingCaseAgreementBudgetFiscalYearRow) => {
  const rowsForFiscalYear = filteredLineItems.value.filter((lineItem: FundingCaseAgreementBudgetLineItemRow) => String(lineItem.fiscal_year_id) === String(fiscalYear.id))

  if (rowsForFiscalYear.length === 0) {
    return [{
      id: `placeholder:${fiscalYear.id}`,
      fiscalYearGroup: fiscalYear.id,
      costCategoryGroup: '__all__',
      costSubsectionGroup: '__all__',
      fiscalYearId: fiscalYear.id,
      fiscalYearDisplay: getFiscalYearDisplay(fiscalYear.egcs_fc_fiscalyear, fiscalYear.fiscal_year_display),
      costCategoryNameEn: t('common.all'),
      costCategoryNameFr: t('common.all'),
      costCategoryLabel: t('common.all'),
      costSubsectionLabel: t('common.all'),
      lineItemNameEn: '',
      lineItemNameFr: '',
      description: '',
      isPlaceholder: true
    }]
  }

  return rowsForFiscalYear.map((lineItem: FundingCaseAgreementBudgetLineItemRow) => ({
    id: lineItem.id,
    fiscalYearGroup: fiscalYear.id,
    costCategoryGroup: lineItem.egcs_fc_organizationcostcategory,
    costSubsectionGroup: lineItem.egcs_fc_costsubsection.trim().length > 0
      ? lineItem.egcs_fc_costsubsection.trim()
      : '__all__',
    fiscalYearId: fiscalYear.id,
    fiscalYearDisplay: getFiscalYearDisplay(fiscalYear.egcs_fc_fiscalyear, fiscalYear.fiscal_year_display),
    costCategoryId: lineItem.egcs_fc_organizationcostcategory,
    costCategoryAvailable: lineItem.cost_category_available,
    costCategoryNameEn: lineItem.organization_cost_category_name_en ?? '',
    costCategoryNameFr: lineItem.organization_cost_category_name_fr ?? '',
    costCategoryLabel: getCostCategoryDisplay(lineItem),
    costSubsectionLabel: lineItem.egcs_fc_costsubsection.trim().length > 0
      ? lineItem.egcs_fc_costsubsection.trim()
      : t('common.all'),
    lineItemId: lineItem.id,
    lineItemNameEn: lineItem.line_item_name_en ?? '',
    lineItemNameFr: lineItem.line_item_name_fr ?? '',
    proponentNameEn: lineItem.applicant_recipient_name_en,
    proponentNameFr: lineItem.applicant_recipient_name_fr,
    description: lineItem.egcs_fc_description,
    totalAmount: lineItem.egcs_fc_totalamount,
    programFunding: lineItem.egcs_fc_programfunding,
    fundingSources: lineItem.egcs_fc_fundingsources,
    currency: lineItem.egcs_fc_currency,
    isPlaceholder: false
  }))
}))

const totalRecords = computed(() => tableRows.value.length)
const realTableRows = computed(() => tableRows.value.filter(row => !row.isPlaceholder))
const getSingleCurrency = (currencies: Array<string | undefined>): string | undefined => {
  const normalizedCurrencies = Array.from(new Set(
    currencies
      .map(currency => currency?.toLowerCase())
      .filter((currency): currency is string => typeof currency === 'string' && currency.length > 0)
  ))

  return normalizedCurrencies.length === 1 ? normalizedCurrencies[0] : undefined
}
const ZERO_MONEY = parseMoney('0')
const getRowAmount = (row: BudgetLeafRow, key: 'totalAmount' | 'programFunding' | 'otherFunding'): Money =>
  key === 'otherFunding' ? getOtherFundingTotal(row) : row[key] ?? ZERO_MONEY
const getTableTotal = (key: 'totalAmount' | 'programFunding' | 'otherFunding') =>
  sumMoney(realTableRows.value.map(row => getRowAmount(row, key)))
const tableTotalCurrency = computed(() => getSingleCurrency(realTableRows.value.map(row => row.currency)))

const {
  expandedRows,
  grouping,
  columnVisibility,
  groupingOptions: groupedBudgetOptions,
  expandedOptions,
  getGroupRowId,
  isGroupedRow,
  isGroupRow,
  getLeafRows: getRealLeafRows,
  getGroupedRowCount,
  canExpandGroupedRow,
  updateExpandedRows
} = useGroupedTableExpansion<BudgetLeafRow>({
  rows: tableRows,
  groups: [
    {
      id: FISCAL_YEAR_GROUP_COLUMN_ID,
      getValue: row => row.fiscalYearId
    },
    {
      id: COST_CATEGORY_GROUP_COLUMN_ID,
      getValue: row => row.costCategoryGroup
    },
    {
      id: COST_SUBSECTION_GROUP_COLUMN_ID,
      getValue: row => row.costSubsectionGroup
    }
  ],
  isPlaceholder: row => row.isPlaceholder || Boolean(row.fundingKind)
})
const groupingOptions = {
  ...groupedBudgetOptions,
  getSubRows: (row: BudgetLeafRow): BudgetLeafRow[] | undefined => {
    if (row.isPlaceholder || row.fundingKind) return undefined
    return [{
      ...row,
      id: `${row.id}:program`,
      fundingKind: 'program',
      lineItemNameEn: t('agreement.budget.program_funding'),
      lineItemNameFr: t('agreement.budget.program_funding'),
      description: '',
      totalAmount: row.programFunding,
      fundingSources: []
    }, ...(row.fundingSources ?? []).map(source => ({
      ...row,
      id: `${row.id}:source:${source.id ?? source.egcs_fc_fundingsubtype}`,
      fundingKind: 'other' as const,
      lineItemNameEn: `${source.funding_type_name_en ?? ''} / ${source.funding_subtype_name_en ?? ''}`,
      lineItemNameFr: `${source.funding_type_name_fr ?? ''} / ${source.funding_subtype_name_fr ?? ''}`,
      description: (locale.value === 'fr' ? source.egcs_fc_description_fr : source.egcs_fc_description_en) ?? '',
      totalAmount: source.egcs_fc_amount,
      programFunding: undefined,
      fundingSources: [source]
    }))]
  }
}
const expandedFundingRows: Ref<Record<string, boolean>> = ref({})
const tableExpandedRows = computed<ExpandedState>(() => ({
  ...(expandedRows.value === true
    ? Object.fromEntries(tableRows.value.flatMap(row => [0, 1, 2].map(index => [getGroupRowId(row, index), true])))
    : expandedRows.value),
  ...expandedFundingRows.value
}))
const updateTableExpandedRows = (value: Updater<ExpandedState>) => {
  const next = typeof value === 'function' ? value(tableExpandedRows.value) : value
  updateExpandedRows(next)
  expandedFundingRows.value = Object.fromEntries(tableRows.value.map(row => [row.id, next === true || next[row.id] === true]))
}
const isFiscalYearGroupRow = (row: GroupedBudgetRow) => isGroupRow(row, FISCAL_YEAR_GROUP_COLUMN_ID)
const isCostCategoryGroupRow = (row: GroupedBudgetRow) => isGroupRow(row, COST_CATEGORY_GROUP_COLUMN_ID)
const isCostSubsectionGroupRow = (row: GroupedBudgetRow) => isGroupRow(row, COST_SUBSECTION_GROUP_COLUMN_ID)
const getGroupedRowSum = (row: GroupedBudgetRow, key: 'totalAmount' | 'programFunding' | 'otherFunding') => {
  return sumMoney(getRealLeafRows(row).map(leafRow => getRowAmount(leafRow.original, key)))
}
const getGroupedRowCurrency = (row: GroupedBudgetRow) =>
  getSingleCurrency(getRealLeafRows(row).map(leafRow => leafRow.original.currency))
const formatGroupedMoney = (row: GroupedBudgetRow, key: 'totalAmount' | 'programFunding' | 'otherFunding') => {
  const leafRows = getRealLeafRows(row)

  if (leafRows.length === 0) {
    return '—'
  }

  const total = getGroupedRowSum(row, key)
  const currency = getGroupedRowCurrency(row)

  if (!currency) {
    return total
  }

  return formatMoney(total, currency)
}
const formatTableTotalMoney = (key: 'totalAmount' | 'programFunding' | 'otherFunding') => {
  const total = getTableTotal(key)

  if (!tableTotalCurrency.value) {
    return total
  }

  return formatMoney(total, tableTotalCurrency.value)
}
const getFiscalYearById = (id: string) => fiscalYears.value.find((fiscalYear: FundingCaseAgreementBudgetFiscalYearRow) => String(fiscalYear.id) === String(id))
const getLineItemById = (id: string) => lineItems.value.find((lineItem: FundingCaseAgreementBudgetLineItemRow) => lineItem.id === id)

const permitted = (action: AgreementChildAction, area: AgreementChildArea) => !staticMode && (area === 'budget-year'
  ? action === 'create' ? canCreateFiscalYear : action === 'update' ? canUpdateFiscalYear : canDeleteFiscalYear
  : action === 'create' ? canCreate : action === 'update' ? canUpdate : canDelete)
let openingIntent = 0
const pendingOpens = new Map<string, { generation: number; token: symbol }>()
const openBudgetAction = (action: 'create' | 'update', area: AgreementChildArea, open: (current: () => boolean) => void | Promise<void>) => {
  if (!permitted(action, area)) return
  const key = `${area}:${action}`
  if (pendingOpens.get(key)?.generation === fiscalYearContextGeneration) return
  const intent = ++openingIntent
  const generation = fiscalYearContextGeneration
  const modal = area === 'budget-year' ? fiscalYearModal : lineItemModal
  const session = modal.captureSession()
  const current = () => intent === openingIntent && generation === fiscalYearContextGeneration && modal.captureSession() === session && permitted(action, area)
  if (!actionTarget) return open(current)
  const token = Symbol(key)
  pendingOpens.set(key, { generation, token })
  return check(action, area, current).then(async ok => {
    if (ok && current()) await open(current)
  }).finally(() => {
    if (pendingOpens.get(key)?.token === token) pendingOpens.delete(key)
  })
}

const openCreateFiscalYear = () => openBudgetAction('create', 'budget-year', () => fiscalYearModal.openCreate())

const openUpdateFiscalYear = (fiscalYear: FundingCaseAgreementBudgetFiscalYearRow) =>
  openBudgetAction('update', 'budget-year', () => fiscalYearModal.openUpdate(fiscalYear))

const openCreateLineItem = (fiscalYearId?: string, organizationCostCategoryId?: string, costSubsection?: string) => openBudgetAction('create', 'budget-line', async current => {
  if (organizationCostCategoryId) {
    let items = lineItems.value
    if (actionTarget) {
      try {
        const fresh = await $fetch<FundingCaseAgreementBudgetOverviewRow, string>(overviewEndpoint.value)
        if (!current()) return
        items = fresh.lineItems
      } catch (error: unknown) {
        if (current()) showError(error)
        return
      }
    }
    // Absence of an existing line is not proof that a category is unavailable.
    if (items.some(item => item.egcs_fc_organizationcostcategory === organizationCostCategoryId && item.cost_category_available === false)) {
      toast.add({ title: toast.localized('common.warning'), description: toast.localized('apiErrors.agreement.invalid_cost_category_line_item'), color: 'warning' })
      return
    }
  }
  lineItemModal.openCreate()
  isLineItemCostCategoryLocked.value = false
  isLineItemCostSubsectionLocked.value = false

  if (!selectedLineItem.value) {
    return
  }

  if (fiscalYearId) {
    selectedLineItem.value.egcs_fc_fundingagreementbudgetfiscalyear = fiscalYearId
  }

  if (organizationCostCategoryId) {
    selectedLineItem.value.egcs_fc_organizationcostcategory = organizationCostCategoryId
    isLineItemCostCategoryLocked.value = true
  }

  if (costSubsection !== undefined && costSubsection.length > 0) {
    selectedLineItem.value.egcs_fc_costsubsection = costSubsection
    isLineItemCostSubsectionLocked.value = true
  }
})

const openUpdateLineItem = (lineItem: FundingCaseAgreementBudgetLineItemRow) => openBudgetAction('update', 'budget-line', () => {
  lineItemModal.openUpdate(lineItem)
  isLineItemCostCategoryLocked.value = false
  isLineItemCostSubsectionLocked.value = false
})

const saveJson = async (url: string, method: 'PATCH' | 'POST', body: Record<string, unknown>) => {
  const fetchJson = $fetch as JsonFetch
  await fetchJson(url, {
    method,
    body
  })
}

const saveFiscalYear = async () => {
  if (!selectedFiscalYear.value || !canSaveFiscalYear.value) {
    return
  }
  const fiscalYearState = selectedFiscalYear.value
  const isUpdate = Boolean(fiscalYearState.id)
  const requestedContextGeneration = fiscalYearContextGeneration
  const requestedBase = resourceBase.value
  const session = fiscalYearModal.captureSession()
  if (!fiscalYearPending.begin(session)) return

  const current = () => requestedContextGeneration === fiscalYearContextGeneration && fiscalYearModal.captureSession() === session && canSaveFiscalYear.value
  try {
    if (!current() || (actionTarget && !await check(isUpdate ? 'update' : 'create', 'budget-year', current)) || !current()) return
    await saveJson(
      isUpdate
        ? `${requestedBase}/budget-fiscal-years/${fiscalYearState.id}`
        : `${requestedBase}/budget-fiscal-years`,
      isUpdate ? 'PATCH' : 'POST',
      fiscalYearState
    )

    if (!current() || !fiscalYearModal.closeSession(session)) return
    await refreshOverview()
    if (requestedContextGeneration !== fiscalYearContextGeneration || overviewStatus.value === 'error') return
    toast.add({
      title: toast.localized('common.success'),
      description: isUpdate ? toast.localized('common.updated_success') : toast.localized('common.added_success'),
      color: 'success'
    })
  } catch (error: unknown) {
    if (requestedContextGeneration === fiscalYearContextGeneration && fiscalYearModal.captureSession() === session) showError(error)
  } finally {
    fiscalYearPending.end(session)
  }
}

const saveLineItem = async () => {
  if (!selectedLineItem.value || !permitted(selectedLineItem.value.id ? 'update' : 'create', 'budget-line')) {
    return
  }
  const lineItemState = selectedLineItem.value
  const isUpdate = Boolean(lineItemState.id)
  const session = lineItemModal.captureSession()
  const requestedContextGeneration = fiscalYearContextGeneration
  const requestedBase = resourceBase.value
  const current = () => requestedContextGeneration === fiscalYearContextGeneration && lineItemModal.captureSession() === session && permitted(isUpdate ? 'update' : 'create', 'budget-line')
  if (!lineItemPending.begin(session)) return

  try {
    if (!current() || (actionTarget && !await check(isUpdate ? 'update' : 'create', 'budget-line', current)) || !current()) return
    await saveJson(
      isUpdate
        ? `${requestedBase}/budget-line-items/${lineItemState.id}`
        : `${requestedBase}/budget-line-items`,
      isUpdate ? 'PATCH' : 'POST',
      {
        ...lineItemState,
        egcs_fc_fundingsources: isUpdate ? undefined : lineItemState.egcs_fc_fundingsources,
        egcs_fc_programfunding: lineItemState.egcs_fc_calculationmode && lineItemState.egcs_fc_calculationmode !== 'manual' ? undefined : lineItemState.egcs_fc_programfunding,
        egcs_fc_percentage: lineItemState.egcs_fc_allowpercentageoverride ? lineItemState.egcs_fc_percentage ?? undefined : undefined
      }
    )

    if (!current() || !lineItemModal.closeSession(session)) return
    await refreshOverview()
    if (requestedContextGeneration !== fiscalYearContextGeneration || overviewStatus.value === 'error') return
    toast.add({
      title: toast.localized('common.success'),
      description: isUpdate ? toast.localized('common.updated_success') : toast.localized('common.added_success'),
      color: 'success'
    })
  } catch (error: unknown) {
    if (current()) showError(error)
  } finally {
    lineItemPending.end(session)
  }
}

const { confirmDeleteRequest } = useConfirmDeleteRequest()
const confirmDelete = useDeleteConfirm()
const checkFiscalYearLines = async (id: string, area: 'budget-year' | 'budget-line', base: string, current: () => boolean) => {
  if (area !== 'budget-year' || allowDeleteFiscalYearWithLines) return current()
  const fresh = actionTarget?.kind === 'agreement'
    ? await $fetch<FundingCaseAgreementBudgetOverviewRow, string>(`${base}/budget-overview`)
    : overview.value
  if (!current()) return false
  if (fresh?.lineItems.some(item => String(item.fiscal_year_id) === id)) {
    toast.add({ title: toast.localized('common.warning'), description: toast.localized('apiErrors.agreement.budget_fiscal_year_in_use'), color: 'warning' })
    return false
  }
  return true
}
const deleteBudgetRecord = async (id: string, area: 'budget-year' | 'budget-line') => {
  const key = `${area}:${id}`
  if (!permitted('delete', area) || pendingDeletes.has(key)) return
  const token = Symbol(key)
  pendingDeletes.set(key, token)
  const generation = fiscalYearContextGeneration
  const base = resourceBase.value
  const current = () => generation === fiscalYearContextGeneration && base === resourceBase.value && pendingDeletes.get(key) === token && permitted('delete', area)
  try {
    if (!await check('delete', area, current) || !current() || !await checkFiscalYearLines(id, area, base, current)) return
    const deleted = await confirmDeleteRequest(`${base}/${area === 'budget-year' ? 'budget-fiscal-years' : 'budget-line-items'}/${id}`, {
      shouldProceed: current,
      confirm: async () => {
        if (!await confirmDelete() || !current()) return false
        return await check('delete', area, current) && current() && await checkFiscalYearLines(id, area, base, current)
      }
    })
    if (!deleted || !current()) return
    await refreshOverview()
    if (!current() || overviewStatus.value === 'error') return
    toast.add({ title: toast.localized('common.success'), description: toast.localized('common.deleted_success'), color: 'success' })
  } catch (error: unknown) {
    if (current()) showError(error)
  } finally {
    if (pendingDeletes.get(key) === token) pendingDeletes.delete(key)
  }
}
const deleteFiscalYear = (id: string) => deleteBudgetRecord(id, 'budget-year')
const deleteLineItem = (id: string) => deleteBudgetRecord(id, 'budget-line')

const openUpdateFundingSource = (row: BudgetLeafRow) => openBudgetAction('update', 'budget-line', () => {
  const source = row.fundingSources?.[0]
  if (row.fundingKind !== 'other' || !row.lineItemId || !source) return
  fundingSourceModal.openUpdate({ lineId: row.lineItemId, originalSubtype: source.egcs_fc_fundingsubtype, source })
})
const openCreateFundingSource = (row: BudgetLeafRow) => openBudgetAction('update', 'budget-line', () => {
  if (row.isPlaceholder || row.fundingKind || !row.lineItemId) return
  fundingSourceModal.openUpdate({
    lineId: row.lineItemId,
    originalSubtype: null,
    source: { egcs_fc_fundingsubtype: '', egcs_fc_amount: ZERO_MONEY, egcs_fc_description_en: '', egcs_fc_description_fr: '' }
  })
})
const persistFundingSource = async (lineId: string, originalSubtype: string | null, replacement: BudgetFundingSource | null, current: () => boolean) => {
  const base = resourceBase.value
  const fresh = await $fetch<FundingCaseAgreementBudgetOverviewRow, string>(`${base}/budget-overview`)
  if (!current()) return false
  const line = fresh.lineItems.find(item => item.id === lineId)
  if (!line || (originalSubtype !== null && !line.egcs_fc_fundingsources.some(source => source.egcs_fc_fundingsubtype === originalSubtype))) {
    throw new Error(t('apiErrors.request.not_found'))
  }
  const sources = line.egcs_fc_fundingsources.flatMap(source => source.egcs_fc_fundingsubtype === originalSubtype
    ? replacement ? [replacement] : []
    : [source])
  if (originalSubtype === null && replacement) sources.push(replacement)
  await saveJson(`${base}/budget-line-items/${lineId}`, 'PATCH', { egcs_fc_fundingsources: sources })
  return current()
}
const saveFundingSource = async () => {
  const selected = selectedFundingSource.value
  if (!selected || !permitted('update', 'budget-line')) return
  const session = fundingSourceModal.captureSession()
  const generation = fiscalYearContextGeneration
  const current = () => generation === fiscalYearContextGeneration && fundingSourceModal.isCurrentSession(session) && permitted('update', 'budget-line')
  if (!fundingSourcePending.begin(session)) return
  try {
    if (!current() || (actionTarget && !await check('update', 'budget-line', current)) || !current()) return
    if (!await persistFundingSource(selected.lineId, selected.originalSubtype, selected.source, current)) return
    if (!fundingSourceModal.closeSession(session)) return
    await refreshOverview()
    if (generation !== fiscalYearContextGeneration || overviewStatus.value === 'error') return
    expandedFundingRows.value[selected.lineId] = true
    toast.add({ title: toast.localized('common.success'), description: toast.localized(selected.originalSubtype === null ? 'common.added_success' : 'common.updated_success'), color: 'success' })
  } catch (error: unknown) {
    if (current()) showError(error)
  } finally {
    fundingSourcePending.end(session)
  }
}
const deleteFundingSource = async (row: BudgetLeafRow) => {
  const source = row.fundingSources?.[0]
  const lineId = row.lineItemId
  if (row.fundingKind !== 'other' || !lineId || !source || !permitted('delete', 'budget-line')) return
  const key = `funding:${row.id}`
  if (pendingDeletes.has(key)) return
  const token = Symbol(key)
  pendingDeletes.set(key, token)
  const generation = fiscalYearContextGeneration
  const current = () => generation === fiscalYearContextGeneration && pendingDeletes.get(key) === token && permitted('delete', 'budget-line')
  try {
    if (!await check('delete', 'budget-line', current) || !current() || !await confirmDelete() || !current()) return
    if (!await check('delete', 'budget-line', current) || !current()) return
    if (!await persistFundingSource(lineId, source.egcs_fc_fundingsubtype, null, current)) return
    await refreshOverview()
    if (!current() || overviewStatus.value === 'error') return
    toast.add({ title: toast.localized('common.success'), description: toast.localized('common.deleted_success'), color: 'success' })
  } catch (error: unknown) {
    if (current()) showError(error)
  } finally {
    if (pendingDeletes.get(key) === token) pendingDeletes.delete(key)
  }
}

const getOtherFundingTotal = (row: BudgetLeafRow) => sumMoney([
  ...(row.fundingSources ?? []).map(source => source.egcs_fc_amount)
])

const formatMoney = (value?: Money, currency?: string) => {
  if (value === undefined || currency === undefined) {
    return '—'
  }

  return formatMoneyText(value, locale.value, currency.toUpperCase())
}
const formatSignedBudgetDifference = (value: Money, currency: string) => {
  const cents = moneyToCents(value)
  const formatted = formatMoney(moneyFromCents(cents < BigInt(0) ? -cents : cents), currency)
  if (compareMoney(value, ZERO_MONEY) > 0) return `+${formatted}`
  if (compareMoney(value, ZERO_MONEY) < 0) return `-${formatted}`
  return formatted
}
</script>

<template>
  <div class="w-full">
    <CommonResourceLayoutCard
      v-model:search="search"
      v-model:pagination="pagination"
      :embedded="embedded"
      :data="tableRows"
      :columns="columns"
      :bilingual-columns="bilingualColumns"
      :grouping="grouping"
      :grouping-options="groupingOptions"
      :expanded-options="expandedOptions"
      :column-visibility="columnVisibility"
      :expanded="tableExpandedRows"
      :total-records="totalRecords"
      :loading="overviewStatus === 'pending'"
      :request-status="overviewStatus"
      table-class="agreement-budget-table"
      :button-label="t('agreement.budget.add_fiscal_year')"
      :show-button="canCreateFiscalYear && !staticMode"
      :search-placeholder="t('agreement.budget.search')"
      @add="openCreateFiscalYear"
      @retry="refreshOverview"
      @update:expanded="updateTableExpandedRows">
      <template #name-cell="{ row }">
        <div :id="getGroupedDisclosureContentId(row as GroupedBudgetRow)" class="contents">
          <div v-if="isFiscalYearGroupRow(row as GroupedBudgetRow)" class="flex w-full items-center gap-3 py-1">
            <CommonGroupedDisclosureButton
              v-if="canExpandGroupedRow(row as GroupedBudgetRow)"
              class="group flex min-w-0 cursor-default items-center gap-3 text-left"
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
              <CommonStatusBadge variant="count" size="sm" :label="String(getGroupedRowCount(row as GroupedBudgetRow))" />
            </CommonGroupedDisclosureButton>
            <div v-else class="flex min-w-0 items-center gap-3">
              <span class="ml-7 text-sm font-semibold text-zinc-900 dark:text-white">
                {{ row.original.fiscalYearDisplay }}
              </span>
              <CommonStatusBadge variant="count" size="sm" :label="String(getGroupedRowCount(row as GroupedBudgetRow))" />
            </div>
          </div>

          <div v-else-if="isCostCategoryGroupRow(row as GroupedBudgetRow)" class="flex w-full items-center gap-3 py-1 pl-6">
            <CommonGroupedDisclosureButton
              v-if="canExpandGroupedRow(row as GroupedBudgetRow)"
              class="group flex min-w-0 cursor-default items-center gap-3 text-left"
              :expanded="row.getIsExpanded?.() === true"
              :controls="getGroupedDisclosureControlsId(row.id)"
              :label="row.original.costCategoryLabel"
              @toggle="row.toggleExpanded?.()">
              <UIcon
                :name="row.getIsExpanded?.() ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                class="size-4 text-zinc-400 transition-colors group-hover:text-primary" />
              <span class="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                {{ row.original.costCategoryLabel }}
              </span>
              <CommonStatusBadge variant="count" size="sm" :label="String(getGroupedRowCount(row as GroupedBudgetRow))" />
            </CommonGroupedDisclosureButton>
            <div v-else class="flex min-w-0 items-center gap-3">
              <span class="ml-7 text-sm font-medium text-zinc-700 dark:text-zinc-200">
                {{ row.original.costCategoryLabel }}
              </span>
              <CommonStatusBadge variant="count" size="sm" :label="String(getGroupedRowCount(row as GroupedBudgetRow))" />
            </div>
            <CommonStatusBadge v-if="row.original.costCategoryAvailable === false" variant="inactive" />
          </div>

          <div v-else-if="isCostSubsectionGroupRow(row as GroupedBudgetRow)" class="flex w-full items-center gap-3 py-1 pl-12">
            <CommonGroupedDisclosureButton
              v-if="canExpandGroupedRow(row as GroupedBudgetRow)"
              class="group flex min-w-0 cursor-default items-center gap-3 text-left"
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
              <CommonStatusBadge variant="count" size="sm" :label="String(getGroupedRowCount(row as GroupedBudgetRow))" />
            </CommonGroupedDisclosureButton>
            <div v-else class="flex min-w-0 items-center gap-3">
              <span class="ml-7 text-sm font-medium text-zinc-700 dark:text-zinc-200">
                {{ row.original.costSubsectionLabel }}
              </span>
              <CommonStatusBadge variant="count" size="sm" :label="String(getGroupedRowCount(row as GroupedBudgetRow))" />
            </div>
          </div>

          <div v-else-if="row.original.isPlaceholder" class="pl-16 text-sm text-zinc-500 dark:text-zinc-400">
            {{ t('agreement.budget.no_line_items') }}
          </div>

          <div v-else-if="row.original.fundingKind" class="space-y-1 pl-28">
            <p :lang="locale" class="text-sm text-zinc-700 dark:text-zinc-200">
              {{ row.original.fundingKind === 'program' ? t('agreement.budget.program_funding') : getBilingualValue({ name_en: row.original.lineItemNameEn, name_fr: row.original.lineItemNameFr }, 'name', '') }}
            </p>
            <p v-if="row.original.description" class="whitespace-normal break-words text-sm text-muted">
              {{ row.original.description }}
            </p>
            <p v-if="row.original.fundingSources?.some(source => source.funding_type_instacking || source.funding_type_incostsharing)" class="text-xs text-muted">
              <span v-if="row.original.fundingSources?.[0]?.funding_type_instacking">{{ t('agreement.funding_sources.in_stacking') }}</span>
              <span v-if="row.original.fundingSources?.[0]?.funding_type_incostsharing"> · {{ t('agreement.funding_sources.in_cost_sharing') }}</span>
            </p>
          </div>

          <div v-else class="flex min-w-0 max-w-full items-start gap-3 pl-16">
            <CommonGroupedDisclosureButton
              class="group mt-0.5 shrink-0 cursor-default"
              :expanded="row.getIsExpanded?.() === true"
              :controls="getGroupedDisclosureControlsId(row.id)"
              :label="getBilingualValue({ name_en: row.original.lineItemNameEn, name_fr: row.original.lineItemNameFr }, 'name', '')"
              @toggle="row.toggleExpanded?.()">
              <UIcon
                :name="row.getIsExpanded?.() ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                class="size-4 text-zinc-400 transition-colors group-hover:text-primary" />
            </CommonGroupedDisclosureButton>
            <div class="flex min-w-0 max-w-full flex-col gap-1">
              <p :lang="locale" class="leading-tight font-bold text-zinc-900 dark:text-white">
                {{ getBilingualValue({ name_en: row.original.lineItemNameEn, name_fr: row.original.lineItemNameFr }, 'name', '') }}
              </p>
              <p class="min-w-0 max-w-full whitespace-normal break-words text-sm text-zinc-500 dark:text-zinc-400">
                {{ row.original.description }}
              </p>
              <p v-if="hasMultipleProponents && (row.original.proponentNameEn || row.original.proponentNameFr)" :lang="locale" class="text-xs text-muted">
                {{ getBilingualValue({ name_en: row.original.proponentNameEn, name_fr: row.original.proponentNameFr }, 'name', '') }}
              </p>
              <p v-if="getLineItemById(row.original.id)?.egcs_fc_calculationmode && getLineItemById(row.original.id)?.egcs_fc_calculationmode !== 'manual'" class="text-xs text-muted">
                {{ t(`budget_calculation.${getLineItemById(row.original.id)?.egcs_fc_calculationmode}`) }}
                {{ getLineItemById(row.original.id)?.egcs_fc_percentage }}{{ t('budget_calculation.percent_symbol') }}
                {{ locale === 'fr' ? getLineItemById(row.original.id)?.calculation_source_name_fr : getLineItemById(row.original.id)?.calculation_source_name_en }}
              </p>
            </div>
          </div>
        </div>
      </template>

      <template #totalAmount-cell="{ row }">
        <span v-if="isGroupedRow(row as GroupedBudgetRow)" class="font-medium text-zinc-700 dark:text-zinc-200">
          {{ formatGroupedMoney(row as GroupedBudgetRow, 'totalAmount') }}
        </span>
        <span v-else-if="!row.original.isPlaceholder && !row.original.fundingKind" class="font-medium text-zinc-700 dark:text-zinc-200">
          {{ formatMoney(row.original.totalAmount, row.original.currency) }}
        </span>
        <span v-else>&nbsp;</span>
      </template>

      <template #programFunding-cell="{ row }">
        <span v-if="isGroupedRow(row as GroupedBudgetRow)" class="font-medium text-zinc-700 dark:text-zinc-200">
          {{ formatGroupedMoney(row as GroupedBudgetRow, 'programFunding') }}
        </span>
        <span v-else-if="!row.original.isPlaceholder && row.original.fundingKind !== 'other'" class="font-medium text-zinc-700 dark:text-zinc-200">
          {{ formatMoney(row.original.programFunding, row.original.currency) }}
        </span>
        <span v-else>&nbsp;</span>
      </template>

      <template #otherFunding-cell="{ row }">
        <span v-if="isGroupedRow(row as GroupedBudgetRow)" class="font-medium text-zinc-700 dark:text-zinc-200">
          {{ formatGroupedMoney(row as GroupedBudgetRow, 'otherFunding') }}
        </span>
        <div v-else-if="!row.original.isPlaceholder && row.original.fundingKind !== 'program'" class="space-y-1">
          <span class="font-medium text-zinc-700 dark:text-zinc-200">
            {{ formatMoney(getOtherFundingTotal(row.original), row.original.currency) }}
          </span>
        </div>
        <span v-else>&nbsp;</span>
      </template>

      <template #actions-cell="{ row }">
        <div v-if="isFiscalYearGroupRow(row as GroupedBudgetRow)" class="flex flex-wrap items-center gap-2">
          <CommonActionButton
            v-if="canCreate"
            icon="i-lucide-plus"
            color="primary"
            variant="ghost"
            size="sm"
            class="cursor-default"
            :aria-label="t('agreement.budget.add_line_item')"
            @click="openCreateLineItem(row.original.fiscalYearId)" />
          <CommonActionButton
            v-if="!staticMode && canUpdateFiscalYear && getFiscalYearById(row.original.fiscalYearId)"
            icon="i-lucide-pencil"
            color="neutral"
            variant="ghost"
            size="sm"
            class="cursor-default"
            :aria-label="`${t('common.edit')}: ${row.original.fiscalYearDisplay}`"
            @click="openUpdateFiscalYear(getFiscalYearById(row.original.fiscalYearId)!)" />
          <CommonActionButton
            v-if="!staticMode && canDeleteFiscalYear"
            icon="i-lucide-trash"
            color="error"
            variant="ghost"
            size="sm"
            class="cursor-default"
            :aria-label="`${t('common.delete')}: ${row.original.fiscalYearDisplay}`"
            @click="deleteFiscalYear(row.original.fiscalYearId)" />
        </div>

        <div v-else-if="isCostCategoryGroupRow(row as GroupedBudgetRow)" class="flex items-center gap-2">
          <CommonActionButton
            v-if="canCreate"
            icon="i-lucide-plus"
            color="primary"
            variant="ghost"
            size="sm"
            class="cursor-default"
            :aria-label="t('agreement.budget.add_line_item')"
            @click="openCreateLineItem(row.original.fiscalYearId, row.original.costCategoryId)" />
        </div>

        <div v-else-if="isCostSubsectionGroupRow(row as GroupedBudgetRow)" class="flex items-center gap-2">
          <CommonActionButton
            v-if="canCreate"
            icon="i-lucide-plus"
            color="primary"
            variant="ghost"
            size="sm"
            class="cursor-default"
            :aria-label="t('agreement.budget.add_line_item')"
            @click="openCreateLineItem(row.original.fiscalYearId, row.original.costCategoryId, row.original.costSubsectionGroup === '__all__' ? '' : row.original.costSubsectionLabel)" />
        </div>

        <div v-else-if="row.original.fundingKind === 'other'" class="flex items-center gap-2">
          <CommonActionButton
            v-if="canUpdate"
            icon="i-lucide-pencil"
            color="neutral"
            variant="ghost"
            size="sm"
            :aria-label="`${t('common.edit')}: ${getBilingualValue({ name_en: row.original.lineItemNameEn, name_fr: row.original.lineItemNameFr }, 'name', '')}`"
            @click="openUpdateFundingSource(row.original)" />
          <CommonActionButton
            v-if="canDelete"
            icon="i-lucide-trash"
            color="error"
            variant="ghost"
            size="sm"
            :aria-label="`${t('common.delete')}: ${getBilingualValue({ name_en: row.original.lineItemNameEn, name_fr: row.original.lineItemNameFr }, 'name', '')}`"
            @click="deleteFundingSource(row.original)" />
        </div>

        <div v-else-if="!row.original.isPlaceholder && !row.original.fundingKind" class="flex items-center gap-2">
          <CommonActionButton
            v-if="canUpdate && row.original.lineItemId"
            icon="i-lucide-plus"
            color="primary"
            variant="ghost"
            size="sm"
            :aria-label="`${t('agreement.funding_sources.add')}: ${getBilingualValue({ name_en: row.original.lineItemNameEn, name_fr: row.original.lineItemNameFr }, 'name', '')}`"
            @click="openCreateFundingSource(row.original)" />
          <CommonActionButton
            v-if="canUpdate && row.original.lineItemId && getLineItemById(row.original.lineItemId)"
            icon="i-lucide-pencil"
            color="neutral"
            variant="ghost"
            size="sm"
            class="cursor-default"
            :aria-label="`${t('common.edit')}: ${locale === 'fr' ? row.original.lineItemNameFr : row.original.lineItemNameEn}`"
            @click="openUpdateLineItem(getLineItemById(row.original.lineItemId)!)" />
          <CommonActionButton
            v-if="canDelete && row.original.lineItemId"
            icon="i-lucide-trash"
            color="error"
            variant="ghost"
            size="sm"
            class="cursor-default"
            :aria-label="`${t('common.delete')}: ${locale === 'fr' ? row.original.lineItemNameFr : row.original.lineItemNameEn}`"
            @click="deleteLineItem(row.original.lineItemId)" />
        </div>

        <div v-else>
          &nbsp;
        </div>
      </template>

      <template #footer-left>
        {{ realTableRows.length }} {{ t('common.records') }}
        <span class="mx-2 text-zinc-300 dark:text-zinc-700">/</span>
        {{ t('agreement.budget.total_amount') }}: {{ formatTableTotalMoney('totalAmount') }}
        <span class="mx-2 text-zinc-300 dark:text-zinc-700">/</span>
        {{ t('agreement.budget.program_funding') }}: {{ formatTableTotalMoney('programFunding') }}
        <span class="mx-2 text-zinc-300 dark:text-zinc-700">/</span>
        {{ t('agreement.budget.other_funding_total') }}: {{ formatTableTotalMoney('otherFunding') }}
      </template>
    </CommonResourceLayoutCard>

    <UAlert
      v-for="budgetDifference in budgetDifferences"
      :key="budgetDifference.currency"
      class="mt-4"
      color="info"
      icon="i-lucide-chart-no-axes-combined"
      :title="t('agreement.amendments.budget_difference_notice', { amount: formatSignedBudgetDifference(budgetDifference.difference, budgetDifference.currency) })" />

    <UModal
      v-if="selectedFiscalYear"
      v-model:open="isFiscalYearModalOpen"
      :title="selectedFiscalYear.id ? t('agreement.budget.edit_fiscal_year') : t('agreement.budget.add_fiscal_year')">
      <template #body>
        <UForm :state="selectedFiscalYear" :validate="validateFiscalYear" :validate-on="[]" class="space-y-4" @submit="saveFiscalYear">
          <UFormField :label="t('agreement.budget.fiscal_year')" name="egcs_fc_fiscalyear">
            <CommonServerLookupSelect
              v-model="selectedFiscalYear.egcs_fc_fiscalyear"
              :fetch-url="fiscalYearLookupEndpoint"
              :prepend-items="selectedFiscalYearOptions"
              value-key="id"
              label-en-key="label_en"
              label-fr-key="label_fr"
              :show-value-in-label="false"
              :query="{ page: 1, limit: 100, permission_action: selectedFiscalYear.id ? 'update' : 'create' }"
              searchable />
          </UFormField>

          <div class="flex justify-end gap-2 pt-4">
            <UButton class="cursor-default" :label="t('common.cancel')" color="neutral" variant="ghost" @click="isFiscalYearModalOpen = false" />
            <CommonSaveButton
              :label="selectedFiscalYear.id ? t('common.update') : t('common.add')"
              :loading="isSavingFiscalYear"
              :disabled="isSavingFiscalYear || !canSaveFiscalYear" />
          </div>
        </UForm>
      </template>
    </UModal>

    <UModal
      v-if="selectedLineItem"
      v-model:open="isLineItemModalOpen"
      :title="selectedLineItem.id ? t('agreement.budget.edit_line_item') : t('agreement.budget.add_line_item')"
      :ui="{ content: 'sm:max-w-4xl', body: 'max-h-[75vh] overflow-y-auto' }">
      <template #body>
        <UForm
          :state="selectedLineItem"
          :validate="validateLineItem"
          :validate-on="[]"
          class="space-y-6"
          @submit="saveLineItem">
          <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <UFormField :label="t('agreement.budget.fiscal_year')" name="egcs_fc_fundingagreementbudgetfiscalyear">
              <CommonBilingualSelectMenu
                v-model="selectedLineItem.egcs_fc_fundingagreementbudgetfiscalyear"
                :items="agreementFiscalYearLookupItems"
                value-key="id"
                label-en-key="label_en"
                label-fr-key="label_fr"
                searchable />
            </UFormField>

            <UFormField
              :label="t('agreement.budget.proponent')"
              name="egcs_fc_applicantrecipient"
              required>
              <CommonBilingualSelectMenu
                v-model="selectedLineItem.egcs_fc_applicantrecipient"
                :items="proponentOptions"
                value-key="id"
                label-en-key="label_en"
                label-fr-key="label_fr"
                :disabled="isSoleProponentSelected"
                searchable />
            </UFormField>

            <UFormField :label="t('agreement.budget.line_item')" name="egcs_fc_organizationcostcategory">
              <CommonServerLookupSelect
                v-model="selectedLineItem.egcs_fc_organizationcostcategory"
                :fetch-url="`/api/agreements/${agreementId}/budget-line-items/lookups/organization-cost-categories`"
                selected-values-query-key="selected_ids"
                :prepend-items="retainedCostCategoryOptions"
                value-key="id"
                label-en-key="label_en"
                label-fr-key="label_fr"
                :query="{ page: 1, limit: 100, permission_action: selectedLineItem.id ? 'update' : 'create', ...(actionTarget?.kind === 'amendment' ? { amendment_id: actionTarget.amendmentId } : {}) }"
                :disabled="isLineItemCostCategoryLocked"
                @resolved-items="hydrateCalculation" />
            </UFormField>

            <UFormField :label="t('agreement.budget.cost_subsection')" name="egcs_fc_costsubsection">
              <UInput
                v-model="selectedLineItem.egcs_fc_costsubsection"
                :placeholder="t('agreement.budget.cost_subsection_placeholder')"
                :readonly="isLineItemCostSubsectionLocked" />
            </UFormField>

            <UFormField :label="t('agreement.budget.currency')" name="egcs_fc_currency" required>
              <CommonEnumSelect
                v-model="selectedLineItem.egcs_fc_currency"
                name="currency_codes"
                disabled
                class="w-full" />
            </UFormField>

            <AgreementBudgetCalculationFields v-model="selectedLineItem" :preview="calculationPreview" />
            <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:col-span-2">
              <UFormField :label="t('agreement.budget.total_amount')" name="egcs_fc_totalamount">
                <CommonCurrencyInput
                  v-model="selectedLineItem.egcs_fc_totalamount"
                  :currency="selectedLineItem.egcs_fc_currency" />
              </UFormField>

              <UFormField :label="t('agreement.budget.program_funding')" name="egcs_fc_programfunding" :required="!selectedLineItem.egcs_fc_calculationmode || selectedLineItem.egcs_fc_calculationmode === 'manual'">
                <CommonCurrencyInput
                  :currency="selectedLineItem.egcs_fc_currency"
                  :model-value="selectedLineItem.egcs_fc_calculationmode && selectedLineItem.egcs_fc_calculationmode !== 'manual' ? calculationPreview : selectedLineItem.egcs_fc_programfunding"
                  :readonly="Boolean(selectedLineItem.egcs_fc_calculationmode && selectedLineItem.egcs_fc_calculationmode !== 'manual')"
                  @update:model-value="selectedLineItem.egcs_fc_programfunding = String($event)" />
              </UFormField>
            </div>
            <AgreementFundingSourcesEditor
              v-if="!selectedLineItem.id"
              :model-value="selectedLineItem.egcs_fc_fundingsources ?? []"
              :agreement-id="agreementId"
              :currency="selectedLineItem.egcs_fc_currency!"
              :identity="`${agreementId}:new:${selectedLineItem.egcs_fc_organizationcostcategory ?? ''}`"
              allow-description
              class="lg:col-span-2"
              @update:model-value="selectedLineItem.egcs_fc_fundingsources = $event" />

            <UFormField :label="t('common.description')" name="egcs_fc_description" class="lg:col-span-2">
              <CommonTextarea
                v-model="selectedLineItem.egcs_fc_description"
                :rows="5"
                :placeholder="t('agreement.budget.description_placeholder')" />
            </UFormField>
          </div>

          <div class="flex justify-end gap-2 pt-4">
            <UButton class="cursor-default" :label="t('common.cancel')" color="neutral" variant="ghost" @click="isLineItemModalOpen = false" />
            <CommonSaveButton
              :label="selectedLineItem.id ? t('common.update') : t('common.add')"
              :loading="isSavingLineItem"
              :disabled="isSavingLineItem" />
          </div>
        </UForm>
      </template>
    </UModal>

    <UModal
      v-if="selectedFundingSource"
      v-model:open="isFundingSourceModalOpen"
      :title="selectedFundingSource.originalSubtype === null ? t('agreement.funding_sources.add') : `${t('common.edit')}: ${t('agreement.funding_sources.title')}`">
      <template #body>
        <UForm :state="selectedFundingSource.source" :validate="validateFundingSource" :validate-on="[]" class="space-y-6" @submit="saveFundingSource">
          <div class="space-y-4">
            <UFormField :label="t('agreement.funding_sources.subtype')" name="egcs_fc_fundingsubtype" required>
              <CommonServerLookupSelect
                v-model="selectedFundingSource.source.egcs_fc_fundingsubtype"
                :fetch-url="`/api/agreements/${agreementId}/funding-subtypes`"
                selected-values-query-key="selected_ids"
                :prepend-items="retainedFundingOption"
                value-key="id"
                label-en-key="label_en"
                label-fr-key="label_fr"
                :show-value-in-label="false"
                close-on-select />
            </UFormField>
            <UFormField :label="t('agreement.funding_sources.amount')" name="egcs_fc_amount" required>
              <CommonCurrencyInput
                v-model="selectedFundingSource.source.egcs_fc_amount"
                :currency="getLineItemById(selectedFundingSource.lineId)?.egcs_fc_currency" />
            </UFormField>
            <UFormField :label="t('agreement.funding_sources.description_en')" name="egcs_fc_description_en">
              <CommonTextarea v-model="selectedFundingSource.source.egcs_fc_description_en" :rows="2" />
            </UFormField>
            <UFormField :label="t('agreement.funding_sources.description_fr')" name="egcs_fc_description_fr">
              <CommonTextarea v-model="selectedFundingSource.source.egcs_fc_description_fr" :rows="2" />
            </UFormField>
          </div>
          <div class="flex justify-end gap-2 pt-4">
            <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="fundingSourceModal.close()" />
            <CommonSaveButton :label="selectedFundingSource.originalSubtype === null ? t('common.add') : t('common.update')" :loading="fundingSourcePending.isPending.value" :disabled="fundingSourcePending.isPending.value || !canUpdate || staticMode" />
          </div>
        </UForm>
      </template>
    </UModal>
  </div>
</template>

<style scoped>
/* Grouping expands data rows, not detail slots. Nuxt UI's empty expanded rows
   span hidden grouping columns too, creating phantom fixed-layout columns. */
:deep(.agreement-budget-table tbody > tr:has(> td[colspan]:empty)) {
  display: none;
}

:deep(.agreement-budget-table) {
  min-width: 64rem;
  width: 100%;
}

:deep(.agreement-budget-table table) {
  table-layout: fixed;
  min-width: 64rem;
  width: 100%;
}

:deep(.agreement-budget-table th),
:deep(.agreement-budget-table td) {
  white-space: normal;
  overflow-wrap: anywhere;
}

:deep(.agreement-budget-table th:nth-child(1)) {
  width: auto;
}

:deep(.agreement-budget-table th:nth-child(2)),
:deep(.agreement-budget-table th:nth-child(3)),
:deep(.agreement-budget-table th:nth-child(4)) {
  width: 14%;
}

:deep(.agreement-budget-table th:nth-child(5)) {
  width: 10rem;
}
</style>
