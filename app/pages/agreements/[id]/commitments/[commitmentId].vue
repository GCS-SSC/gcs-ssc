<script setup lang="ts">
import { useCrudModalPending } from '~/composables/useCrudModal'
import { useBusinessStatusState } from '~/composables/useBusinessStatusState'
import type { FetchError } from 'ofetch'
/* eslint-disable jsdoc/require-jsdoc -- page-local callbacks use self-descriptive signatures */
import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import type { TableColumnInput } from '~/composables/useTableColumns'
import CommonCompletionPanel from '~/components/Common/Completions/Panel.vue'
import { appRouteLocations, authorizedRouteLocation } from '~/utils/route-locations'
import type { EntityAssignmentContext } from '~~/shared/types/schemas/entity-assignment'
import type {
  FundingCaseAgreementCommitmentDetailRow,
  FundingCaseAgreementCommitmentLineForm,
  FundingCaseAgreementCommitmentLineRow
} from '~~/shared/types/funding-case-agreement-ui'
import { FundingCaseAgreementCommitmentLineCreateSchema } from '~~/shared/types/schemas'
import { formatAccountingDimension, getAccountingDimensionSearchValues } from '~~/shared/utils/accounting-dimensions'
import { formatMoneyText, sumMoney, type Money } from '~~/shared/utils/money'

definePageMeta({
  key: route => route.fullPath,
  i18n: {
    paths: {
      en: '/agreements/[id]/commitments/[commitmentId]',
      fr: '/ententes/[id]/engagements/[commitmentId]'
    }
  }
})

const { t, locale } = useI18n()
const route = useRoute()
const localePath = useLocalePath()
const toast = useToast()
const { getHeroCollapsed } = useDashboard()
const { createValidator } = useZodI18n()
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const { getBilingualValue } = useBilingualValue()
const { saveJson } = useJsonRequest()
const { isRecordLocked } = useBusinessStatusState()

const agreementId = route.params.id as string
const commitmentId = route.params.commitmentId as string

const search: Ref<string> = ref('')
const pagination: Ref<{ pageIndex: number, pageSize: number }> = ref({
  pageIndex: 0,
  pageSize: 25
})
const approvalsRefreshKey: Ref<number> = ref(0)
const selectedTab: Ref<string> = ref('lines')
const tabs = [
  { key: 'agreement.commitments.lines_title', value: 'lines', icon: 'i-lucide-list' },
  { key: 'agreement.commitments.completion.title', value: 'completion', icon: 'i-lucide-circle-check-big' },
  { key: 'workflow.title', value: 'workflows', icon: 'i-lucide-workflow' },
  { key: 'attachments.title', value: 'attachments', icon: 'i-lucide-paperclip' },
  { key: 'assignments.title', value: 'assignments', icon: 'i-lucide-users' }
]
const isHeroCollapsed = getHeroCollapsed('agreement-commitment-detail')

const lineModal = useCrudModal<FundingCaseAgreementCommitmentLineRow, FundingCaseAgreementCommitmentLineForm>({
  createState: () => ({
    egcs_fc_commitment: commitmentId
  }),
  updateState: line => ({
    id: line.id,
    egcs_fc_commitment: line.egcs_fc_commitment,
    egcs_fc_commitmentlinenumber: line.egcs_fc_commitmentlinenumber,
    egcs_fc_transferpaymentstreamchartofaccount: line.egcs_fc_transferpaymentstreamchartofaccount,
    egcs_fc_amount: line.egcs_fc_amount
  })
})

const selectedLine = lineModal.selected
const isLineModalOpen = lineModal.isOpen
const validateLine = createValidator(FundingCaseAgreementCommitmentLineCreateSchema)
const linePending = useCrudModalPending(lineModal.captureSession)
const isSavingLine = linePending.isPending

const {
  data: profile,
  error: profileError,
  status: profileStatus,
  refresh: refreshProfile
} = useFetch<EntityAssignmentContext, FetchError, string>(`/api/entity-assignments/fundingcaseagreementcommitment/${commitmentId}/context`)
const { isAssigned } = useEntityAssignmentRoster('fundingcaseagreementcommitment', commitmentId)
const {
  data: commitment,
  error: commitmentError,
  status: commitmentStatus,
  refresh: refreshCommitment
} = useFetch<FundingCaseAgreementCommitmentDetailRow & { lines: FundingCaseAgreementCommitmentLineRow[] }, FetchError, string>(
  `/api/agreements/${agreementId}/commitments/${commitmentId}`
)

const hasLoadError = computed(() =>
  Boolean(profileError.value)
  || Boolean(commitmentError.value)
  || profileStatus.value === 'error'
  || commitmentStatus.value === 'error'
)
const isLoadingDetail = computed(() => profileStatus.value === 'pending' || commitmentStatus.value === 'pending')
const retryLoad = async () => {
  await Promise.all([refreshProfile(), refreshCommitment()])
}

const canUpdateCommitment = computed(() =>
  isAssigned.value
  && !isRecordLocked(commitment.value)
)
const canCreateCommitmentLine = computed(() =>
  isAssigned.value
  && !isRecordLocked(commitment.value)
)
const canDeleteCommitmentLine = computed(() =>
  isAssigned.value
  && !isRecordLocked(commitment.value)
)

const breadcrumbItems = computed(() => [
  { label: t('agreement.title'), to: localePath(appRouteLocations.agreements()) },
  {
    label: getBilingualValue(profile.value, 'egcs_fc_title', agreementId),
    to: authorizedRouteLocation(profile.value?.can_read_agreement, localePath(appRouteLocations.agreementDetail(agreementId)))
  },
  {
    label: commitment.value ? getBilingualValue(commitment.value, 'commitment_type_name', commitmentId) : commitmentId
  }
])

const columns: TableColumnInput<FundingCaseAgreementCommitmentLineRow>[] = [
  { id: 'lineNumber', accessorKey: 'egcs_fc_commitmentlinenumber', headerKey: 'agreement.commitments.line_number_short' },
  { id: 'fiscalYear', accessorKey: 'fiscal_year_display', headerKey: 'agreement.commitments.fiscal_year' },
  { id: 'coding', headerKey: 'agreement.commitments.coding' },
  { id: 'amount', accessorKey: 'egcs_fc_amount', headerKey: 'agreement.commitments.amount' },
  { id: 'actions', headerKey: 'common.actions' }
]

const normalizedSearch = computed(() => search.value.trim().toLowerCase())
const lines = computed<FundingCaseAgreementCommitmentLineRow[]>(() => {
  const allLines = commitment.value?.lines ?? []
  if (!normalizedSearch.value) {
    return allLines
  }

  return allLines.filter((line: FundingCaseAgreementCommitmentLineRow) => [
    line.egcs_fc_commitmentlinenumber,
    line.fiscal_year_display,
    ...getAccountingDimensionSearchValues(line.accounting_dimensions),
    line.egcs_fc_amount
  ].some(value => String(value ?? '').toLowerCase().includes(normalizedSearch.value)))
})

const totalAmount = computed(() =>
  sumMoney((commitment.value?.lines ?? []).map((line: FundingCaseAgreementCommitmentLineRow) => line.egcs_fc_amount))
)

const displayValue = (value: string | number | null | undefined) => {
  if (value === undefined || value === null || value === '') {
    return '-'
  }

  return String(value)
}

const formatMoney = (value: Money) => formatMoneyText(value, locale.value, 'CAD')

const getCodingSecondaryText = (line: FundingCaseAgreementCommitmentLineRow) => {
  const activeLocale = locale.value === 'fr' ? 'fr' : 'en'
  return line.accounting_dimensions.slice(1)
    .map(dimension => formatAccountingDimension(dimension, activeLocale))
    .join(' | ')
}

const getCodingPrimaryText = (line: FundingCaseAgreementCommitmentLineRow) => {
  const dimension = line.accounting_dimensions[0]
  if (!dimension) return '-'
  return formatAccountingDimension(dimension, locale.value === 'fr' ? 'fr' : 'en')
}

const openCreateLine = () => {
  lineModal.openCreate()
  if (selectedLine.value) {
    selectedLine.value.egcs_fc_commitment = commitmentId
  }
}

const openUpdateLine = (line: FundingCaseAgreementCommitmentLineRow) => {
  lineModal.openUpdate(line)
}

const refreshPage = async () => {
  await refreshCommitment()
  approvalsRefreshKey.value += 1
}

const saveLine = async () => {
  if (!selectedLine.value) {
    return
  }
  const lineState = selectedLine.value
  const isUpdate = Boolean(lineState.id)
  const session = lineModal.captureSession()
  if (!linePending.begin(session)) return

  try {
    await saveJson(
      isUpdate
        ? `/api/agreements/${agreementId}/commitment-lines/${lineState.id}`
        : `/api/agreements/${agreementId}/commitment-lines`,
      isUpdate ? 'PATCH' : 'POST',
      lineState
    )

    lineModal.closeSession(session)
    await refreshPage()
    toast.add({
      title: t('common.success'),
      description: isUpdate ? t('common.updated_success') : t('common.added_success'),
      color: 'success'
    })
  } catch (error: unknown) {
    showError(error)
  } finally {
    linePending.end(session)
  }
}

const deleteLine = async (lineId: string) => {
  try {
    const ok = await confirmDeleteRequest(`/api/agreements/${agreementId}/commitment-lines/${lineId}`)
    if (!ok) {
      return
    }

    await refreshPage()
    toast.add({
      title: t('common.success'),
      description: t('common.deleted_success'),
      color: 'success'
    })
  } catch (error: unknown) {
    showError(error)
  }
}

const handleCompleted = async () => {
  await refreshPage()
}
</script>

<template>
  <div class="flex w-full flex-col">
    <UAlert v-if="hasLoadError" color="error" icon="i-lucide-circle-alert" :title="t('common.resource_table_load_failed')" :description="t('common.resource_table_load_failed_description')">
      <template #actions>
        <UButton color="error" variant="soft" icon="i-lucide-refresh-cw" :label="t('common.retry')" :loading="isLoadingDetail" @click="retryLoad" />
      </template>
    </UAlert>
    <div v-else-if="isLoadingDetail && (!profile || !commitment)" role="status" aria-live="polite" class="flex min-h-32 items-center justify-center gap-2 text-sm text-muted">
      <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" aria-hidden="true" />
      <span>{{ t('common.loading_records') }}</span>
    </div>
    <UDashboardPanel v-if="profile && commitment" id="agreement-commitment-detail" class="w-full">
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
            icon="i-lucide-file-check-2"
            :title="getBilingualValue(commitment, 'commitment_type_name', commitmentId)"
            :meta-items="[displayValue(profile.egcs_fc_agreementnumber), getBilingualValue(profile, 'egcs_fc_title', agreementId)]"
            :badges="[{
              statusId: commitment.egcs_fc_status,
              isCompleted: commitment.isCompleted,
              prefixLabel: t('common.status')
            }]" />

          <CommonEntityEditorWorkspace content-test-id="agreement-commitment-detail-content">
            <template #sidebar>
              <CommonRouteTabs v-model="selectedTab" :items="tabs" orientation="vertical" :ui="{ root: 'w-full', list: 'w-full flex-col items-stretch p-0', trigger: 'w-full justify-start' }" />
            </template>
            <CommonSection v-if="selectedTab === 'lines'" :title="t('agreement.commitments.lines_title')" :grid-cols="1">
              <div class="space-y-4">
                <div class="flex justify-end">
                  <UButton
                    v-if="canCreateCommitmentLine"
                    color="primary"
                    icon="i-lucide-plus"
                    class="cursor-default"
                    @click="openCreateLine">
                    {{ t('agreement.commitments.add_line') }}
                  </UButton>
                </div>

                <CommonResourceLayoutCard
                  v-model:search="search"
                  v-model:pagination="pagination"
                  :data="lines"
                  :columns="columns"
                  :total-records="lines.length"
                  :button-label="t('agreement.commitments.add_line')"
                  :show-button="false"
                  :search-placeholder="t('agreement.commitments.search_lines')">
                  <template #coding-cell="{ row }">
                    <div class="flex min-w-0 max-w-full flex-col gap-1">
                      <span class="text-sm font-semibold text-zinc-900 dark:text-white">
                        {{ getCodingPrimaryText(row.original) }}
                      </span>
                      <span class="truncate text-xs text-zinc-500 dark:text-zinc-400">
                        {{ getCodingSecondaryText(row.original) }}
                      </span>
                    </div>
                  </template>

                  <template #amount-cell="{ row }">
                    <span class="font-medium text-zinc-700 dark:text-zinc-200">
                      {{ formatMoney(row.original.egcs_fc_amount) }}
                    </span>
                  </template>

                  <template #actions-cell="{ row }">
                    <div v-if="canUpdateCommitment || canDeleteCommitmentLine" class="flex items-center justify-end gap-2">
                      <UButton
                        v-if="canUpdateCommitment"
                        icon="i-lucide-pencil"
                        color="neutral"
                        variant="ghost"
                        class="cursor-default"
                        :aria-label="`${t('common.edit')}: ${row.original.egcs_fc_commitmentlinenumber ?? row.original.id}`"
                        @click="openUpdateLine(row.original)" />
                      <UButton
                        v-if="canDeleteCommitmentLine"
                        icon="i-lucide-trash"
                        color="error"
                        variant="ghost"
                        class="cursor-default"
                        :aria-label="`${t('common.delete')}: ${row.original.egcs_fc_commitmentlinenumber ?? row.original.id}`"
                        @click="deleteLine(String(row.original.id))" />
                    </div>
                  </template>
                </CommonResourceLayoutCard>

                <div class="flex justify-end">
                  <div class="rounded-sm border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white">
                    {{ t('agreement.commitments.total_amount') }}: {{ formatMoney(totalAmount) }}
                  </div>
                </div>
              </div>
            </CommonSection>

            <section v-else-if="selectedTab === 'completion'" class="space-y-6">
              <CommonCompletionPanel
                entity-type="fundingcaseagreementcommitment"
                :entity-id="commitmentId"
                :can-complete="canUpdateCommitment"
                :can-work-workflow="isAssigned"
                :hide-title="false"
                :show-divider="false"
                title-key="agreement.commitments.completion.title"
                description-key="agreement.commitments.completion.description"
                status-complete-key="agreement.commitments.completion.status_complete"
                status-locked-key="agreement.commitments.completion.status_locked"
                comment-placeholder-key="agreement.commitments.completion.comment_placeholder"
                complete-action-key="agreement.commitments.completion.complete"
                completed-success-key="agreement.commitments.completion.completed_success"
                :refresh-key="approvalsRefreshKey"
                @changed="handleCompleted" />
            </section>

            <CommonWorkflowSection v-else-if="selectedTab === 'workflows'" entity-type="fundingcaseagreementcommitment" :entity-id="commitmentId" purpose="standard" :can-edit="isAssigned" :refresh-key="approvalsRefreshKey" @changed="refreshPage" />
            <CommonAttachmentsTab v-else-if="selectedTab === 'attachments'" entity-type="fundingcaseagreementcommitment" :entity-id="commitmentId" />
            <CommonAssignedUsers v-else-if="selectedTab === 'assignments'" entity-type="fundingcaseagreementcommitment" :entity-id="commitmentId" />
          </CommonEntityEditorWorkspace>
        </div>
      </template>
    </UDashboardPanel>

    <UModal
      v-if="selectedLine"
      v-model:open="isLineModalOpen"
      :title="selectedLine.id ? t('agreement.commitments.edit_line') : t('agreement.commitments.add_line')"
      :description="t('common.form_dialog_description')">
      <template #body>
        <UForm :state="selectedLine" :validate="validateLine" :validate-on="[]" class="space-y-4" @submit="saveLine">
          <UFormField :label="t('agreement.commitments.line_number')" name="egcs_fc_commitmentlinenumber">
            <UInputNumber v-model="selectedLine.egcs_fc_commitmentlinenumber" :min="1" :max="32767" />
          </UFormField>

          <UFormField :label="t('agreement.commitments.stream_commitment')" name="egcs_fc_transferpaymentstreamchartofaccount">
            <CommonServerLookupSelect
              v-model="selectedLine.egcs_fc_transferpaymentstreamchartofaccount"
              :fetch-url="`/api/agreements/${agreementId}/commitment-lines/lookups/chart-of-accounts`"
              :query="{ permission_action: 'update', commitmentId }"
              value-key="id"
              label-en-key="label_en"
              label-fr-key="label_fr"
              :limit="100" />
          </UFormField>

          <UFormField :label="t('agreement.commitments.amount')" name="egcs_fc_amount">
            <UInput
              v-model="selectedLine.egcs_fc_amount"
              type="text"
              inputmode="decimal" />
          </UFormField>

          <div class="flex justify-end gap-2 pt-4">
            <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="isLineModalOpen = false" />
            <CommonSaveButton
              :label="selectedLine.id ? t('common.update') : t('common.add')"
              :loading="isSavingLine"
              :disabled="isSavingLine" />
          </div>
        </UForm>
      </template>
    </UModal>
  </div>
</template>
