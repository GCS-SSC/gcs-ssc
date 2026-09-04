<script setup lang="ts">
import { useCrudModalPending } from '~/composables/useCrudModal'
import { useBusinessStatusState } from '~/composables/useBusinessStatusState'
/* eslint-disable jsdoc/require-jsdoc */
import { computed, watch } from 'vue'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { useAgreementOverview } from '~/composables/useAgreementOverview'
import { useGroupedTableExpansion, type GroupedTableRow } from '~/composables/useGroupedTableExpansion'
import { useDeleteRequestToast } from '~/composables/useDeleteRequestToast'
import { useJsonRequest } from '~/composables/useJsonRequest'
import { useTableListState } from '~/composables/useTableListState'
import { appRouteLocations } from '~/utils/route-locations'
import type {
  FundingCaseAgreementClaimForm,
  FundingCaseAgreementClaimOverviewRow,
  FundingCaseAgreementClaimRow
} from '~~/shared/types/funding-case-agreement-ui'
import { FundingCaseAgreementClaimCreateSchema } from '~~/shared/types/schemas'
import { formatMoneyText, sumMoney, type Money } from '~~/shared/utils/money'

type ClaimTableRow = FundingCaseAgreementClaimRow & {
  fiscalYearGroup: string
  lineCount: number
  submittedAmount: Money
  reconciledAmount: Money
}

type ClaimGroupedRow = GroupedTableRow<ClaimTableRow>

type FiscalYearLookupItem = {
  id: string
  label_en?: string | null
  label_fr?: string | null
}

const FISCAL_YEAR_GROUP_COLUMN_ID = 'fiscalYearGroup'
const MONTH_KEYS = ['apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec', 'jan', 'feb', 'mar'] as const

const { agreementId, canCreate, canUpdate, canDelete } = defineProps<{
  agreementId: string
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
const { saveJson } = useJsonRequest()
const { isRecordLocked } = useBusinessStatusState()

const { search, pagination } = useTableListState()
const claimModal = useCrudModal<FundingCaseAgreementClaimRow, FundingCaseAgreementClaimForm>({
  createState: () => ({
    egcs_fc_isfinalforyear: false,
    egcs_fc_periodstart: 0,
    egcs_fc_periodend: 2,
    egcs_fc_receiveddate: new Date().toISOString().slice(0, 10)
  }),
  updateState: claim => ({
    id: claim.id,
    egcs_fc_fiscalyear: claim.egcs_fc_fiscalyear,
    egcs_fc_isfinalforyear: claim.egcs_fc_isfinalforyear,
    egcs_fc_periodstart: claim.egcs_fc_periodstart,
    egcs_fc_periodend: claim.egcs_fc_periodend,
    egcs_fc_receiveddate: new Date(claim.egcs_fc_receiveddate).toISOString().slice(0, 10)
  })
})
const claimPending = useCrudModalPending(claimModal.captureSession)
watch(agreementIdRef, () => claimModal.close(), { flush: 'sync' })
const isSavingClaim = claimPending.isPending

const selectedClaim = claimModal.selected
const isClaimModalOpen = claimModal.isOpen
const validateClaim = createValidator(FundingCaseAgreementClaimCreateSchema)
const {
  overview,
  overviewStatus,
  refreshOverview
} = useAgreementOverview<FundingCaseAgreementClaimOverviewRow>(computed(() => `/api/agreements/${agreementId}/claims-overview`))

const claims = computed<FundingCaseAgreementClaimOverviewRow['claims']>(() => overview.value?.claims ?? [])
const budgetLineItems = computed<FundingCaseAgreementClaimOverviewRow['budgetLineItems']>(() => overview.value?.budgetLineItems ?? [])
const claimLineItems = computed<FundingCaseAgreementClaimOverviewRow['lineItems']>(() => overview.value?.lineItems ?? [])
const reconciles = computed<FundingCaseAgreementClaimOverviewRow['reconciles']>(() => overview.value?.reconciles ?? [])
const reconcileLineItems = computed<FundingCaseAgreementClaimOverviewRow['reconcileLineItems']>(() => overview.value?.reconcileLineItems ?? [])
const positiveReconcileIds = computed(() => new Set(
  reconciles.value
    .filter(reconcile => reconcile.lifecycleTerminus === 'positive')
    .map(reconcile => String(reconcile.id))
))

const columns: TableColumnInput<ClaimTableRow>[] = [
  { id: FISCAL_YEAR_GROUP_COLUMN_ID, accessorKey: FISCAL_YEAR_GROUP_COLUMN_ID, headerKey: 'agreement.claims.fiscal_year' },
  { id: 'claim', accessorKey: 'id', headerKey: 'agreement.claims.claim' },
  { id: 'period', headerKey: 'agreement.claims.period' },
  { id: 'status', accessorKey: 'egcs_fc_status', headerKey: 'common.status' },
  { id: 'submitted', accessorKey: 'submittedAmount', headerKey: 'agreement.claims.submitted_amount' },
  { id: 'reconciled', accessorKey: 'reconciledAmount', headerKey: 'agreement.claims.reconciled_amount' },
  { id: 'actions', headerKey: 'common.actions' }
]

const fiscalYearOptions = computed<FiscalYearLookupItem[]>(() => {
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

const formatMoney = (value: Money) => formatMoneyText(value, locale.value, 'CAD')
const getMonthLabel = (month: number) => t(`agreement.claims.months.${MONTH_KEYS[month]}`)
const getPeriodLabel = (claim: ClaimTableRow) => `${getMonthLabel(claim.egcs_fc_periodstart)} - ${getMonthLabel(claim.egcs_fc_periodend)}`

const tableRows = computed<ClaimTableRow[]>(() => claims.value.map((claim: FundingCaseAgreementClaimRow) => {
  const lines = claimLineItems.value.filter((line: FundingCaseAgreementClaimOverviewRow['lineItems'][number]) => String(line.egcs_fc_fundingagreementclaim) === String(claim.id))
  const reconcileLineIds = new Set(lines.map((line: FundingCaseAgreementClaimOverviewRow['lineItems'][number]) => String(line.id)))
  const reconciledAmount = sumMoney(reconcileLineItems.value
    .filter((line: FundingCaseAgreementClaimOverviewRow['reconcileLineItems'][number]) => (
      reconcileLineIds.has(String(line.egcs_fc_lineitem))
      && positiveReconcileIds.value.has(String(line.egcs_fc_fundingagreementclaimreconcile))
    ))
    .map(line => line.egcs_fc_reconciled))

  return {
    ...claim,
    fiscalYearGroup: claim.fiscal_year_display ?? t('common.unavailable'),
    lineCount: lines.length,
    submittedAmount: sumMoney(lines.map(line => line.egcs_fc_amount)),
    reconciledAmount
  }
}).filter((row: ClaimTableRow) => {
  const normalizedSearch = search.value.trim().toLowerCase()
  if (!normalizedSearch) {
    return true
  }

  return [
    row.fiscalYearGroup,
    row.id,
    getPeriodLabel(row),
    getStatusLabel(row.egcs_fc_status),
    row.submittedAmount,
    row.reconciledAmount
  ].some(value => String(value ?? '').toLowerCase().includes(normalizedSearch))
}))

const {
  expandedRows,
  grouping,
  columnVisibility,
  groupingOptions,
  expandedOptions,
  isGroupRow,
  getGroupedRowCount,
  updateExpandedRows
} = useGroupedTableExpansion<ClaimTableRow>({
  rows: tableRows,
  groups: [{
    id: FISCAL_YEAR_GROUP_COLUMN_ID,
    getValue: row => row.fiscalYearGroup
  }]
})
const isFiscalYearGroupRow = (row: ClaimGroupedRow) => isGroupRow(row, FISCAL_YEAR_GROUP_COLUMN_ID)
const getGroupedRowTotal = (row: ClaimGroupedRow, key: 'submittedAmount' | 'reconciledAmount') =>
  sumMoney((row.leafRows ?? row.subRows ?? []).map(item => item.original[key]))
const getGroupedClaimStatuses = (row: ClaimGroupedRow) => [
  ...new Set((row.leafRows ?? row.subRows ?? []).map(item => item.original.egcs_fc_status))
]

const getClaimById = (claimId: string) => claims.value.find(claim => String(claim.id) === claimId) ?? null
const getClaimRoute = (row: ClaimTableRow) => localePath(appRouteLocations.agreementClaimDetail(agreementId, String(row.id)))

const openCreateClaim = () => claimModal.openCreate()
const openUpdateClaim = (claimId: string) => {
  const claim = getClaimById(claimId)
  if (claim) {
    claimModal.openUpdate(claim)
  }
}

const saveClaim = async () => {
  if (!selectedClaim.value) {
    return
  }
  const claimState = selectedClaim.value
  const isUpdate = Boolean(claimState.id)
  const session = claimModal.captureSession()
  if (!claimPending.begin(session)) return

  try {
    await saveJson(
      isUpdate
        ? `/api/agreements/${agreementId}/claims/${claimState.id}`
        : `/api/agreements/${agreementId}/claims`,
      isUpdate ? 'PATCH' : 'POST',
      claimState
    )

    if (!claimModal.closeSession(session)) return
    if (!await refreshOverview()) return
    toast.add({
      title: t('common.success'),
      description: isUpdate ? t('common.updated_success') : t('common.added_success'),
      color: 'success'
    })
  } catch (error: unknown) {
    showError(error)
  } finally {
    claimPending.end(session)
  }
}

const { confirmDeleteWithToast } = useDeleteRequestToast()

const deleteClaim = async (claimId: string) => {
  await confirmDeleteWithToast(`/api/agreements/${agreementId}/claims/${claimId}`, {
    refresh: async () => { await refreshOverview() }
  })
}
</script>

<template>
  <div class="w-full">
    <CommonResourceLayoutCard
      v-model:search="search"
      v-model:pagination="pagination"
      :data="tableRows"
      :columns="columns"
      :grouping="grouping"
      :grouping-options="groupingOptions"
      :expanded-options="expandedOptions"
      :column-visibility="columnVisibility"
      :expanded="expandedRows"
      :total-records="tableRows.length"
      :loading="overviewStatus === 'pending'"
      :request-status="overviewStatus"
      :button-label="t('agreement.claims.add')"
      :show-button="canCreate"
      :search-placeholder="t('agreement.claims.search')"
      @add="openCreateClaim"
      @retry="refreshOverview"
      @update:expanded="updateExpandedRows">
      <template #claim-cell="{ row }">
        <div :id="getGroupedDisclosureContentId(row as ClaimGroupedRow)" class="contents">
          <div v-if="isFiscalYearGroupRow(row as ClaimGroupedRow)" class="flex w-full items-center gap-3 py-1">
            <CommonGroupedDisclosureButton
              class="group flex min-w-0 items-center gap-3 text-left"
              :expanded="row.getIsExpanded?.() === true"
              :controls="getGroupedDisclosureControlsId(row.id)"
              :label="row.original.fiscalYearGroup"
              @toggle="row.toggleExpanded?.()">
              <UIcon :name="row.getIsExpanded?.() ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-4 text-zinc-400 transition-colors group-hover:text-primary" />
              <span class="text-sm font-semibold text-zinc-900 dark:text-white">{{ row.original.fiscalYearGroup }}</span>
              <CommonStatusBadge variant="count" size="sm" :label="String(getGroupedRowCount(row as ClaimGroupedRow))" />
            </CommonGroupedDisclosureButton>
          </div>
          <NuxtLink v-else :to="getClaimRoute(row.original)" class="group flex w-full items-center gap-3 py-1 pl-6 text-left">
            <UIcon name="i-lucide-corner-down-right" class="size-4 text-zinc-400" />
            <span class="text-sm font-semibold text-zinc-900 transition-colors group-hover:text-primary dark:text-white">
              {{ t('agreement.claims.claim_label', { id: row.original.id }) }}
            </span>
          </NuxtLink>
        </div>
      </template>

      <template #period-cell="{ row }">
        <span v-if="!isFiscalYearGroupRow(row as ClaimGroupedRow)" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">
          {{ getPeriodLabel(row.original) }}
        </span>
      </template>

      <template #status-cell="{ row }">
        <div v-if="isFiscalYearGroupRow(row as ClaimGroupedRow)" class="flex flex-wrap gap-1">
          <CommonStatusBadge
            v-for="status in getGroupedClaimStatuses(row as ClaimGroupedRow)"
            :key="status"
            :status-id="status" />
        </div>
        <CommonRecordState
          v-else
          :status-id="row.original.egcs_fc_status"
          :is-completed="row.original.isCompleted" />
      </template>

      <template #submitted-cell="{ row }">
        <span class="font-medium text-zinc-700 dark:text-zinc-200">
          {{ formatMoney(isFiscalYearGroupRow(row as ClaimGroupedRow) ? getGroupedRowTotal(row as ClaimGroupedRow, 'submittedAmount') : row.original.submittedAmount) }}
        </span>
      </template>

      <template #reconciled-cell="{ row }">
        <span class="font-medium text-zinc-700 dark:text-zinc-200">
          {{ formatMoney(isFiscalYearGroupRow(row as ClaimGroupedRow) ? getGroupedRowTotal(row as ClaimGroupedRow, 'reconciledAmount') : row.original.reconciledAmount) }}
        </span>
      </template>

      <template #actions-cell="{ row }">
        <div class="flex items-center justify-end gap-2">
          <UButton
            v-if="!isFiscalYearGroupRow(row as ClaimGroupedRow) && canUpdate && !isRecordLocked(row.original)"
            icon="i-lucide-pencil"
            color="neutral"
            variant="ghost"
            class="cursor-default"
            :aria-label="`${t('common.edit')}: ${t('agreement.claims.claim_label', { id: row.original.id })}`"
            @click="openUpdateClaim(String(row.original.id))" />
          <UButton
            v-if="!isFiscalYearGroupRow(row as ClaimGroupedRow) && canDelete && !isRecordLocked(row.original)"
            icon="i-lucide-trash"
            color="error"
            variant="ghost"
            class="cursor-default"
            :aria-label="`${t('common.delete')}: ${t('agreement.claims.claim_label', { id: row.original.id })}`"
            @click="deleteClaim(String(row.original.id))" />
          <UButton
            v-if="!isFiscalYearGroupRow(row as ClaimGroupedRow)"
            :to="getClaimRoute(row.original)"
            icon="i-lucide-arrow-right"
            color="neutral"
            variant="ghost"
            class="cursor-default"
            :aria-label="`${t('common.open')}: ${t('agreement.claims.claim_label', { id: row.original.id })}`" />
        </div>
      </template>
    </CommonResourceLayoutCard>

    <UModal v-if="selectedClaim" v-model:open="isClaimModalOpen" :title="selectedClaim.id ? t('agreement.claims.edit') : t('agreement.claims.add')">
      <template #body>
        <UForm :state="selectedClaim" :validate="validateClaim" :validate-on="[]" class="space-y-4" @submit="saveClaim">
          <UFormField :label="t('agreement.claims.fiscal_year')" name="egcs_fc_fiscalyear">
            <CommonBilingualSelectMenu v-model="selectedClaim.egcs_fc_fiscalyear" :items="fiscalYearOptions" value-key="id" label-en-key="label_en" label-fr-key="label_fr" searchable />
          </UFormField>
          <UFormField :label="t('agreement.claims.received_date')" name="egcs_fc_receiveddate">
            <UInput v-model="selectedClaim.egcs_fc_receiveddate" type="date" />
          </UFormField>
          <div class="grid gap-4 md:grid-cols-2">
            <UFormField :label="t('agreement.claims.period_start')" name="egcs_fc_periodstart">
              <USelect v-model="selectedClaim.egcs_fc_periodstart" :items="MONTH_KEYS.map((key, index) => ({ label: t(`agreement.claims.months.${key}`), value: index }))" />
            </UFormField>
            <UFormField :label="t('agreement.claims.period_end')" name="egcs_fc_periodend">
              <USelect v-model="selectedClaim.egcs_fc_periodend" :items="MONTH_KEYS.map((key, index) => ({ label: t(`agreement.claims.months.${key}`), value: index }))" />
            </UFormField>
          </div>
          <UCheckbox v-model="selectedClaim.egcs_fc_isfinalforyear" :label="t('agreement.claims.final_for_year')" />
          <div class="flex justify-end gap-2 pt-4">
            <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="isClaimModalOpen = false" />
            <CommonSaveButton :label="selectedClaim.id ? t('common.update') : t('common.add')" :loading="isSavingClaim" :disabled="isSavingClaim" />
          </div>
        </UForm>
      </template>
    </UModal>
  </div>
</template>
