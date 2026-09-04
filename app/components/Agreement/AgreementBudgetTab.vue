<script setup lang="ts">
import { useCrudModalPending } from '~/composables/useCrudModal'
/* eslint-disable jsdoc/require-jsdoc -- Budget table callbacks are exercised by focused component tests. */
import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { BilingualColumnConfig, TableColumnInput } from '~/composables/useTableColumns'
import { useGroupedTableExpansion, type GroupedTableRow } from '~/composables/useGroupedTableExpansion'
import { useDeleteRequestToast } from '~/composables/useDeleteRequestToast'
import type {
  FundingCaseAgreementBudgetFiscalYearForm,
  FundingCaseAgreementBudgetFiscalYearRow,
  FundingCaseAgreementBudgetLineItemForm,
  FundingCaseAgreementBudgetLineItemRow,
  FundingCaseAgreementBudgetOverviewRow
} from '~~/shared/types/funding-case-agreement-ui'
import {
  FundingCaseAgreementBudgetFiscalYearCreateSchema,
  FundingCaseAgreementBudgetLineItemCreateSchema
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
  costCategoryId?: string
  costCategoryNameEn: string
  costCategoryNameFr: string
  costCategoryLabel: string
  costSubsectionLabel: string
  lineItemId?: string
  lineItemNameEn: string
  lineItemNameFr: string
  description: string
  totalAmount?: Money
  programFunding?: Money
  otherFederalFunding?: Money | null
  otherGovFunding?: Money | null
  otherFunding?: Money | null
  currency?: string
  isPlaceholder: boolean
}

type GroupedBudgetRow = GroupedTableRow<BudgetLeafRow>

const FISCAL_YEAR_GROUP_COLUMN_ID = 'fiscalYearGroup'
const COST_CATEGORY_GROUP_COLUMN_ID = 'costCategoryGroup'
const COST_SUBSECTION_GROUP_COLUMN_ID = 'costSubsectionGroup'

const {
  agreementId,
  canCreate,
  canUpdate,
  canDelete,
  canCreateFiscalYear,
  canUpdateFiscalYear,
  canDeleteFiscalYear,
  allowDeleteFiscalYearWithLines = false,
  apiBase,
  fiscalYearLookupUrl,
  snapshotOverview,
  staticMode = false,
  embedded = false
} = defineProps<{
  agreementId: string
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
  canCreateFiscalYear: boolean
  canUpdateFiscalYear: boolean
  canDeleteFiscalYear: boolean
  allowDeleteFiscalYearWithLines?: boolean
  apiBase?: string
  fiscalYearLookupUrl?: string
  snapshotOverview?: FundingCaseAgreementBudgetOverviewRow
  staticMode?: boolean
  embedded?: boolean
}>()
const agreementIdRef = computed(() => agreementId)

const { t, locale } = useI18n()
const { getGroupedDisclosureControlsId, getGroupedDisclosureContentId } = useGroupedDisclosureIds()
const toast = useToast()
const { createValidator } = useZodI18n()
const { showError } = useApiErrorToast()

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
    egcs_fc_currency: 'cad'
  }),
  updateState: lineItem => ({
    id: lineItem.id,
    egcs_fc_fundingagreementbudgetfiscalyear: lineItem.egcs_fc_fundingagreementbudgetfiscalyear,
    egcs_fc_organizationcostcategory: lineItem.egcs_fc_organizationcostcategory,
    egcs_fc_costsubsection: lineItem.egcs_fc_costsubsection,
    egcs_fc_description: lineItem.egcs_fc_description,
    egcs_fc_totalamount: lineItem.egcs_fc_totalamount,
    egcs_fc_programfunding: lineItem.egcs_fc_programfunding,
    egcs_fc_otherfederalfunding: lineItem.egcs_fc_otherfederalfunding,
    egcs_fc_othergovfunding: lineItem.egcs_fc_othergovfunding,
    egcs_fc_otherfunding: lineItem.egcs_fc_otherfunding,
    egcs_fc_currency: lineItem.egcs_fc_currency
  })
})

const selectedFiscalYear = fiscalYearModal.selected
const isFiscalYearModalOpen = fiscalYearModal.isOpen
const selectedLineItem = lineItemModal.selected
const isLineItemModalOpen = lineItemModal.isOpen
const validateFiscalYear = createValidator(FundingCaseAgreementBudgetFiscalYearCreateSchema)
const validateLineItem = createValidator(FundingCaseAgreementBudgetLineItemCreateSchema)
const fiscalYearPending = useCrudModalPending(fiscalYearModal.captureSession)
const lineItemPending = useCrudModalPending(lineItemModal.captureSession)
const isSavingFiscalYear = fiscalYearPending.isPending
const isSavingLineItem = lineItemPending.isPending
watch(agreementIdRef, () => {
  fiscalYearModal.close()
  lineItemModal.close()
}, { flush: 'sync' })
const isLineItemCostCategoryLocked: Ref<boolean> = ref(false)
const isLineItemCostSubsectionLocked: Ref<boolean> = ref(false)
const resourceBase = computed<string>(() => apiBase ?? `/api/agreements/${agreementId}`)
const overviewEndpoint = computed<string>(() => `${resourceBase.value}/budget-overview`)
const fiscalYearLookupEndpoint = computed<string>(() => fiscalYearLookupUrl ?? `/api/agreements/${agreementId}/budget-fiscal-years/lookups/fiscal-years`)
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
const fiscalYearDisplayById = computed(() => new Map(
  (fiscalYearLookupResponse.value?.items ?? []).map((item: LookupItem) => [
    String(item.id),
    String(item.label_en ?? item.id)
  ])
))
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
    costCategoryNameEn: lineItem.organization_cost_category_name_en ?? '',
    costCategoryNameFr: lineItem.organization_cost_category_name_fr ?? '',
    costCategoryLabel: getCostCategoryDisplay(lineItem),
    costSubsectionLabel: lineItem.egcs_fc_costsubsection.trim().length > 0
      ? lineItem.egcs_fc_costsubsection.trim()
      : t('common.all'),
    lineItemId: lineItem.id,
    lineItemNameEn: lineItem.line_item_name_en ?? '',
    lineItemNameFr: lineItem.line_item_name_fr ?? '',
    description: lineItem.egcs_fc_description,
    totalAmount: lineItem.egcs_fc_totalamount,
    programFunding: lineItem.egcs_fc_programfunding,
    otherFederalFunding: lineItem.egcs_fc_otherfederalfunding,
    otherGovFunding: lineItem.egcs_fc_othergovfunding,
    otherFunding: lineItem.egcs_fc_otherfunding,
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
  groupingOptions,
  expandedOptions,
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
  isPlaceholder: row => row.isPlaceholder
})
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

const openCreateFiscalYear = () => {
  fiscalYearModal.openCreate()
}

const openUpdateFiscalYear = (fiscalYear: FundingCaseAgreementBudgetFiscalYearRow) => {
  fiscalYearModal.openUpdate(fiscalYear)
}

const openCreateLineItem = (fiscalYearId?: string, organizationCostCategoryId?: string, costSubsection?: string) => {
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
}

const openUpdateLineItem = (lineItem: FundingCaseAgreementBudgetLineItemRow) => {
  lineItemModal.openUpdate(lineItem)
  isLineItemCostCategoryLocked.value = false
  isLineItemCostSubsectionLocked.value = false
}

const saveJson = async (url: string, method: 'PATCH' | 'POST', body: Record<string, unknown>) => {
  const fetchJson = $fetch as JsonFetch
  await fetchJson(url, {
    method,
    body
  })
}

const saveFiscalYear = async () => {
  if (!selectedFiscalYear.value) {
    return
  }
  const fiscalYearState = selectedFiscalYear.value
  const isUpdate = Boolean(fiscalYearState.id)
  const session = fiscalYearModal.captureSession()
  if (!fiscalYearPending.begin(session)) return

  try {
    await saveJson(
      isUpdate
        ? `${resourceBase.value}/budget-fiscal-years/${fiscalYearState.id}`
        : `${resourceBase.value}/budget-fiscal-years`,
      isUpdate ? 'PATCH' : 'POST',
      fiscalYearState
    )

    if (!fiscalYearModal.closeSession(session)) return
    await refreshOverview()
    if (overviewStatus.value === 'error') return
    toast.add({
      title: t('common.success'),
      description: isUpdate ? t('common.updated_success') : t('common.added_success'),
      color: 'success'
    })
  } catch (error: unknown) {
    showError(error)
  } finally {
    fiscalYearPending.end(session)
  }
}

const saveLineItem = async () => {
  if (!selectedLineItem.value) {
    return
  }
  const lineItemState = selectedLineItem.value
  const isUpdate = Boolean(lineItemState.id)
  const session = lineItemModal.captureSession()
  if (!lineItemPending.begin(session)) return

  try {
    await saveJson(
      isUpdate
        ? `${resourceBase.value}/budget-line-items/${lineItemState.id}`
        : `${resourceBase.value}/budget-line-items`,
      isUpdate ? 'PATCH' : 'POST',
      lineItemState
    )

    if (!lineItemModal.closeSession(session)) return
    await refreshOverview()
    if (overviewStatus.value === 'error') return
    toast.add({
      title: t('common.success'),
      description: isUpdate ? t('common.updated_success') : t('common.added_success'),
      color: 'success'
    })
  } catch (error: unknown) {
    showError(error)
  } finally {
    lineItemPending.end(session)
  }
}

const { confirmDeleteWithToast } = useDeleteRequestToast()

const deleteFiscalYear = async (fiscalYearId: string) => {
  await confirmDeleteWithToast(`${resourceBase.value}/budget-fiscal-years/${fiscalYearId}`, {
    refresh: refreshOverview
  })
}

const deleteLineItem = async (lineItemId: string) => {
  await confirmDeleteWithToast(`${resourceBase.value}/budget-line-items/${lineItemId}`, {
    refresh: refreshOverview
  })
}

const getOtherFundingTotal = (row: BudgetLeafRow) => sumMoney([
  row.otherFederalFunding ?? ZERO_MONEY,
  row.otherGovFunding ?? ZERO_MONEY,
  row.otherFunding ?? ZERO_MONEY
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
      :expanded="expandedRows"
      :total-records="totalRecords"
      :loading="overviewStatus === 'pending'"
      :request-status="overviewStatus"
      table-class="agreement-budget-table"
      :button-label="t('agreement.budget.add_fiscal_year')"
      :show-button="canCreateFiscalYear"
      :search-placeholder="t('agreement.budget.search')"
      @add="openCreateFiscalYear"
      @retry="refreshOverview"
      @update:expanded="updateExpandedRows">
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

          <div v-else class="flex min-w-0 max-w-full flex-col gap-1 pl-16">
            <CommonBilingualName
              :name-en="row.original.lineItemNameEn"
              :name-fr="row.original.lineItemNameFr" />
            <p class="min-w-0 max-w-full whitespace-normal break-words text-sm text-zinc-500 dark:text-zinc-400">
              {{ row.original.description }}
            </p>
          </div>
        </div>
      </template>

      <template #totalAmount-cell="{ row }">
        <span v-if="isGroupedRow(row as GroupedBudgetRow)" class="font-medium text-zinc-700 dark:text-zinc-200">
          {{ formatGroupedMoney(row as GroupedBudgetRow, 'totalAmount') }}
        </span>
        <span v-else-if="!row.original.isPlaceholder" class="font-medium text-zinc-700 dark:text-zinc-200">
          {{ formatMoney(row.original.totalAmount, row.original.currency) }}
        </span>
        <span v-else>&nbsp;</span>
      </template>

      <template #programFunding-cell="{ row }">
        <span v-if="isGroupedRow(row as GroupedBudgetRow)" class="font-medium text-zinc-700 dark:text-zinc-200">
          {{ formatGroupedMoney(row as GroupedBudgetRow, 'programFunding') }}
        </span>
        <span v-else-if="!row.original.isPlaceholder" class="font-medium text-zinc-700 dark:text-zinc-200">
          {{ formatMoney(row.original.programFunding, row.original.currency) }}
        </span>
        <span v-else>&nbsp;</span>
      </template>

      <template #otherFunding-cell="{ row }">
        <span v-if="isGroupedRow(row as GroupedBudgetRow)" class="font-medium text-zinc-700 dark:text-zinc-200">
          {{ formatGroupedMoney(row as GroupedBudgetRow, 'otherFunding') }}
        </span>
        <span v-else-if="!row.original.isPlaceholder" class="font-medium text-zinc-700 dark:text-zinc-200">
          {{ formatMoney(getOtherFundingTotal(row.original), row.original.currency) }}
        </span>
        <span v-else>&nbsp;</span>
      </template>

      <template #actions-cell="{ row }">
        <div v-if="isFiscalYearGroupRow(row as GroupedBudgetRow)" class="flex items-center gap-2">
          <UButton
            v-if="canCreate"
            icon="i-lucide-plus"
            color="primary"
            variant="ghost"
            size="sm"
            class="cursor-default"
            :aria-label="t('agreement.budget.add_line_item')"
            @click="openCreateLineItem(row.original.fiscalYearId)" />
          <UButton
            v-if="canUpdateFiscalYear && getFiscalYearById(row.original.fiscalYearId)"
            icon="i-lucide-pencil"
            color="neutral"
            variant="ghost"
            size="sm"
            class="cursor-default"
            :aria-label="`${t('common.edit')}: ${row.original.fiscalYearDisplay}`"
            @click="openUpdateFiscalYear(getFiscalYearById(row.original.fiscalYearId)!)" />
          <UButton
            v-if="canDeleteFiscalYear && (allowDeleteFiscalYearWithLines || getGroupedRowCount(row as GroupedBudgetRow) === 0)"
            icon="i-lucide-trash"
            color="error"
            variant="ghost"
            size="sm"
            class="cursor-default"
            :aria-label="`${t('common.delete')}: ${row.original.fiscalYearDisplay}`"
            @click="deleteFiscalYear(row.original.fiscalYearId)" />
        </div>

        <div v-else-if="isCostCategoryGroupRow(row as GroupedBudgetRow)" class="flex items-center gap-2">
          <UButton
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
          <UButton
            v-if="canCreate"
            icon="i-lucide-plus"
            color="primary"
            variant="ghost"
            size="sm"
            class="cursor-default"
            :aria-label="t('agreement.budget.add_line_item')"
            @click="openCreateLineItem(row.original.fiscalYearId, row.original.costCategoryId, row.original.costSubsectionGroup === '__all__' ? '' : row.original.costSubsectionLabel)" />
        </div>

        <div v-else-if="!row.original.isPlaceholder" class="flex items-center gap-2">
          <UButton
            v-if="canUpdate && row.original.lineItemId && getLineItemById(row.original.lineItemId)"
            icon="i-lucide-pencil"
            color="neutral"
            variant="ghost"
            size="sm"
            class="cursor-default"
            :aria-label="`${t('common.edit')}: ${locale === 'fr' ? row.original.lineItemNameFr : row.original.lineItemNameEn}`"
            @click="openUpdateLineItem(getLineItemById(row.original.lineItemId)!)" />
          <UButton
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
              :disabled="isSavingFiscalYear" />
          </div>
        </UForm>
      </template>
    </UModal>

    <UModal
      v-if="selectedLineItem"
      v-model:open="isLineItemModalOpen"
      :title="selectedLineItem.id ? t('agreement.budget.edit_line_item') : t('agreement.budget.add_line_item')"
      fullscreen
      :ui="{ content: 'rounded-none shadow-none ring-0' }">
      <template #body>
        <UForm
          :state="selectedLineItem"
          :validate="validateLineItem"
          :validate-on="[]"
          class="flex h-full flex-col"
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

            <UFormField :label="t('agreement.budget.line_item')" name="egcs_fc_organizationcostcategory">
              <CommonServerLookupSelect
                v-model="selectedLineItem.egcs_fc_organizationcostcategory"
                :fetch-url="`/api/agreements/${agreementId}/budget-line-items/lookups/organization-cost-categories`"
                value-key="id"
                label-en-key="label_en"
                label-fr-key="label_fr"
                :query="{ page: 1, limit: 100, permission_action: selectedLineItem.id ? 'update' : 'create' }"
                :disabled="isLineItemCostCategoryLocked" />
            </UFormField>

            <UFormField :label="t('agreement.budget.cost_subsection')" name="egcs_fc_costsubsection">
              <UInput
                v-model="selectedLineItem.egcs_fc_costsubsection"
                :placeholder="t('agreement.budget.cost_subsection_placeholder')"
                :readonly="isLineItemCostSubsectionLocked" />
            </UFormField>

            <UFormField :label="t('agreement.budget.currency')" name="egcs_fc_currency">
              <CommonEnumSelect
                v-model="selectedLineItem.egcs_fc_currency"
                name="currency_codes"
                class="w-full" />
            </UFormField>

            <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:col-span-2 xl:grid-cols-5">
              <UFormField :label="t('agreement.budget.total_amount')" name="egcs_fc_totalamount">
                <UInput
                  v-model="selectedLineItem.egcs_fc_totalamount"
                  inputmode="decimal" />
              </UFormField>

              <UFormField :label="t('agreement.budget.program_funding')" name="egcs_fc_programfunding">
                <UInput
                  v-model="selectedLineItem.egcs_fc_programfunding"
                  inputmode="decimal" />
              </UFormField>

              <UFormField :label="t('agreement.budget.other_federal_funding')" name="egcs_fc_otherfederalfunding">
                <UInput
                  v-model="selectedLineItem.egcs_fc_otherfederalfunding"
                  inputmode="decimal" />
              </UFormField>

              <UFormField :label="t('agreement.budget.other_gov_funding')" name="egcs_fc_othergovfunding">
                <UInput
                  v-model="selectedLineItem.egcs_fc_othergovfunding"
                  inputmode="decimal" />
              </UFormField>

              <UFormField :label="t('agreement.budget.other_funding')" name="egcs_fc_otherfunding">
                <UInput
                  v-model="selectedLineItem.egcs_fc_otherfunding"
                  inputmode="decimal" />
              </UFormField>
            </div>

            <UFormField :label="t('common.description')" name="egcs_fc_description" class="lg:col-span-2">
              <CommonTextarea
                v-model="selectedLineItem.egcs_fc_description"
                :rows="5"
                :placeholder="t('agreement.budget.description_placeholder')" />
            </UFormField>
          </div>

          <div class="mt-auto flex justify-end gap-2 pt-6">
            <UButton class="cursor-default" :label="t('common.cancel')" color="neutral" variant="ghost" @click="isLineItemModalOpen = false" />
            <CommonSaveButton
              :label="selectedLineItem.id ? t('common.update') : t('common.add')"
              :loading="isSavingLineItem"
              :disabled="isSavingLineItem" />
          </div>
        </UForm>
      </template>
    </UModal>
  </div>
</template>

<style scoped>
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
  width: 48%;
}

:deep(.agreement-budget-table th:nth-child(2)),
:deep(.agreement-budget-table th:nth-child(3)),
:deep(.agreement-budget-table th:nth-child(4)) {
  width: 14%;
}

:deep(.agreement-budget-table th:nth-child(5)) {
  width: 10%;
}
</style>
