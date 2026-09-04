<script setup lang="ts">
import { useCrudModalPending } from '~/composables/useCrudModal'
import { useBusinessStatusState } from '~/composables/useBusinessStatusState'
/* eslint-disable jsdoc/require-param-description, jsdoc/require-returns -- legacy page callbacks remain concise during request isolation */
import type { FetchError } from 'ofetch'
import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import type { TableColumnInput } from '~/composables/useTableColumns'
import CommonCompletionPanel from '~/components/Common/Completions/Panel.vue'
import { appRouteLocations, authorizedRouteLocation } from '~/utils/route-locations'
import type { EntityAssignmentContext } from '~~/shared/types/schemas/entity-assignment'
import type {
  FundingCaseAgreementPaymentDetailRow,
  FundingCaseAgreementPaymentLineForm,
  FundingCaseAgreementPaymentLineRow
} from '~~/shared/types/funding-case-agreement-ui'
import { FundingCaseAgreementPaymentLineCreateSchema } from '~~/shared/types/schemas'
import { formatAccountingDimension, getAccountingDimensionSearchValues } from '~~/shared/utils/accounting-dimensions'
import { formatMoneyText, sumMoney, type Money } from '~~/shared/utils/money'

definePageMeta({
  key: route => route.fullPath,
  i18n: {
    paths: {
      en: '/agreements/[id]/payments/[paymentId]',
      fr: '/ententes/[id]/paiements/[paymentId]'
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
const paymentId = route.params.paymentId as string
const isHeroCollapsed = getHeroCollapsed('agreement-payment-detail')
const search: Ref<string> = ref('')
const pagination: Ref<{ pageIndex: number, pageSize: number }> = ref({
  pageIndex: 0,
  pageSize: 25
})
const approvalsRefreshKey: Ref<number> = ref(0)
const selectedTab: Ref<string> = ref('lines')
const tabs = [
  { key: 'agreement.payments.lines_title', value: 'lines', icon: 'i-lucide-list' },
  { key: 'agreement.payments.completion.title', value: 'completion', icon: 'i-lucide-circle-check-big' },
  { key: 'workflow.title', value: 'workflows', icon: 'i-lucide-workflow' },
  { key: 'attachments.title', value: 'attachments', icon: 'i-lucide-paperclip' },
  { key: 'assignments.title', value: 'assignments', icon: 'i-lucide-users' }
]

const lineModal = useCrudModal<FundingCaseAgreementPaymentLineRow, FundingCaseAgreementPaymentLineForm>({
  createState: () => ({ egcs_fc_fundingagreementpayment: paymentId }),
  /**
   *
   * @param line
   */
  updateState: line => ({
    id: line.id,
    egcs_fc_fundingagreementpayment: line.egcs_fc_fundingagreementpayment,
    egcs_fc_fundingagreementcommitmentline: line.egcs_fc_fundingagreementcommitmentline,
    egcs_fc_amount: line.egcs_fc_amount
  })
})

const selectedLine = lineModal.selected
const isLineModalOpen = lineModal.isOpen
const validateLine = createValidator(FundingCaseAgreementPaymentLineCreateSchema)
const linePending = useCrudModalPending(lineModal.captureSession)
const isSavingLine = linePending.isPending

const {
  data: profile,
  error: profileError,
  status: profileStatus,
  refresh: refreshProfile
} = useFetch<EntityAssignmentContext, FetchError, string>(`/api/entity-assignments/fundingcasepayment/${paymentId}/context`)
const { isAssigned } = useEntityAssignmentRoster('fundingcasepayment', paymentId)
const {
  data: payment,
  error: paymentError,
  status: paymentStatus,
  refresh: refreshPayment
} = useFetch<FundingCaseAgreementPaymentDetailRow, FetchError, string>(
  `/api/agreements/${agreementId}/payments/${paymentId}`
)

const hasLoadError = computed(() =>
  Boolean(profileError.value) || Boolean(paymentError.value) || profileStatus.value === 'error' || paymentStatus.value === 'error'
)
const isLoadingDetail = computed(() => profileStatus.value === 'pending' || paymentStatus.value === 'pending')
const retryLoad = async () => {
  await Promise.all([refreshProfile(), refreshPayment()])
}
const canUpdatePayment = computed(() =>
  isAssigned.value
  && !isRecordLocked(payment.value)
)
const canEditWorkflow = computed(() => isAssigned.value)
const canCreatePaymentLine = computed(() =>
  isAssigned.value
  && !isRecordLocked(payment.value)
)
const canDeletePaymentLine = computed(() =>
  isAssigned.value
  && !isRecordLocked(payment.value)
)
const breadcrumbItems = computed(() => [
  { label: t('agreement.title'), to: localePath(appRouteLocations.agreements()) },
  { label: getBilingualValue(profile.value, 'egcs_fc_title', agreementId), to: authorizedRouteLocation(profile.value?.can_read_agreement, localePath(appRouteLocations.agreementDetail(agreementId))) },
  { label: payment.value ? t(`enums.payment_type.${payment.value.egcs_fc_paymenttype}`) : paymentId }
])
const columns: TableColumnInput<FundingCaseAgreementPaymentLineRow>[] = [
  { id: 'lineNumber', accessorKey: 'commitment_line_number', headerKey: 'agreement.commitments.line_number_short' },
  { id: 'fiscalYear', accessorKey: 'fiscal_year_display', headerKey: 'agreement.payments.fiscal_year' },
  { id: 'coding', headerKey: 'agreement.commitments.coding' },
  { id: 'amount', accessorKey: 'egcs_fc_amount', headerKey: 'agreement.payments.amount' },
  { id: 'actions', headerKey: 'common.actions' }
]
const normalizedSearch = computed(() => search.value.trim().toLowerCase())
const lines = computed<FundingCaseAgreementPaymentLineRow[]>(() => {
  const allLines = payment.value?.lines ?? []
  if (!normalizedSearch.value) {
    return allLines
  }

  return allLines.filter((line: FundingCaseAgreementPaymentLineRow) => [
    line.commitment_line_number,
    line.fiscal_year_display,
    ...getAccountingDimensionSearchValues(line.accounting_dimensions),
    line.egcs_fc_amount
  ].some(value => String(value ?? '').toLowerCase().includes(normalizedSearch.value)))
})
const totalAmount = computed(() =>
  sumMoney((payment.value?.lines ?? []).map((line: FundingCaseAgreementPaymentLineRow) => line.egcs_fc_amount))
)

const formatMoney = (value: Money) => formatMoneyText(value, locale.value, 'CAD')

/**
 *
 * @param labelKey
 * @param value
 */
/**
 *
 * @param line
 */
const getCodingSecondaryText = (line: FundingCaseAgreementPaymentLineRow) => {
  const activeLocale = locale.value === 'fr' ? 'fr' : 'en'
  return line.accounting_dimensions.slice(1)
    .map(dimension => formatAccountingDimension(dimension, activeLocale))
    .join(' | ')
}

/**
 * Formats the first configured dimension as the coding cell's primary text.
 *
 * @param line - Payment line carrying ordered accounting dimensions.
 */
const getCodingPrimaryText = (line: FundingCaseAgreementPaymentLineRow) => {
  const dimension = line.accounting_dimensions[0]
  if (!dimension) return '-'
  return formatAccountingDimension(dimension, locale.value === 'fr' ? 'fr' : 'en')
}

const openCreateLine = () => {
  lineModal.openCreate()
}

const openUpdateLine = (line: FundingCaseAgreementPaymentLineRow) => {
  lineModal.openUpdate(line)
}

const refreshPage = async () => {
  await refreshPayment()
  approvalsRefreshKey.value += 1
}

/** Creates or updates a payment coding line, then refreshes detail and approvals. */
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
        ? `/api/agreements/${agreementId}/payment-lines/${lineState.id}`
        : `/api/agreements/${agreementId}/payment-lines`,
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

/**
 *
 * @param lineId
 */
const deleteLine = async (lineId: string) => {
  try {
    const ok = await confirmDeleteRequest(`/api/agreements/${agreementId}/payment-lines/${lineId}`)
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
    <div v-else-if="isLoadingDetail && (!profile || !payment)" role="status" aria-live="polite" class="flex min-h-32 items-center justify-center gap-2 text-sm text-muted">
      <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" aria-hidden="true" />
      <span>{{ t('common.loading_records') }}</span>
    </div>
    <UDashboardPanel v-if="payment" id="agreement-payment-detail" class="w-full">
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
            icon="i-lucide-wallet-cards"
            :title="t(`enums.payment_type.${payment.egcs_fc_paymenttype}`)"
            :meta-items="[payment.agreement_number, getBilingualValue(payment, 'agreement_title', agreementId)]"
            :badges="[{
              variant: 'amount',
              label: formatMoney(payment.egcs_fc_paymentamount)
            }, {
              variant: 'period',
              label: `${t('agreement.payments.period')} ${payment.egcs_fc_periodstart}${t('common.separator')}${payment.egcs_fc_periodend}`
            }, {
              statusId: payment.egcs_fc_status,
              isCompleted: payment.isCompleted
            }]" />

          <CommonEntityEditorWorkspace content-test-id="agreement-payment-detail-content">
            <template #sidebar>
              <CommonRouteTabs v-model="selectedTab" :items="tabs" orientation="vertical" :ui="{ root: 'w-full', list: 'w-full flex-col items-stretch p-0', trigger: 'w-full justify-start' }" />
            </template>
            <CommonSection v-if="selectedTab === 'lines'" :title="t('agreement.payments.lines_title')" :grid-cols="1">
              <div class="space-y-4">
                <div class="flex justify-end">
                  <UButton
                    v-if="canCreatePaymentLine"
                    color="primary"
                    icon="i-lucide-plus"
                    class="cursor-default"
                    @click="openCreateLine">
                    {{ t('agreement.payments.add_line') }}
                  </UButton>
                </div>

                <CommonResourceLayoutCard
                  v-model:search="search"
                  v-model:pagination="pagination"
                  :data="lines"
                  :columns="columns"
                  :total-records="lines.length"
                  :button-label="t('agreement.payments.add_line')"
                  :show-button="false"
                  :search-placeholder="t('agreement.payments.search_lines')">
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
                    <div v-if="canUpdatePayment || canDeletePaymentLine" class="flex items-center justify-end gap-2">
                      <UButton v-if="canUpdatePayment" icon="i-lucide-pencil" color="neutral" variant="ghost" class="cursor-default" :aria-label="`${t('common.edit')}: ${row.original.commitment_line_number ?? row.original.id}`" @click="openUpdateLine(row.original)" />
                      <UButton v-if="canDeletePaymentLine" icon="i-lucide-trash" color="error" variant="ghost" class="cursor-default" :aria-label="`${t('common.delete')}: ${row.original.commitment_line_number ?? row.original.id}`" @click="deleteLine(String(row.original.id))" />
                    </div>
                  </template>
                </CommonResourceLayoutCard>

                <div class="flex justify-end">
                  <div class="rounded-sm border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white">
                    {{ t('agreement.payments.line_total') }}: {{ formatMoney(totalAmount) }} / {{ formatMoney(payment.egcs_fc_paymentamount) }}
                  </div>
                </div>
              </div>
            </CommonSection>

            <section v-else-if="selectedTab === 'completion'" id="payment-completion" class="space-y-6">
              <CommonCompletionPanel
                entity-type="fundingcasepayment"
                :entity-id="paymentId"
                :can-complete="canUpdatePayment"
                :can-work-workflow="canEditWorkflow"
                :hide-title="false"
                :show-divider="false"
                title-key="agreement.payments.completion.title"
                description-key="agreement.payments.completion.description"
                status-complete-key="agreement.payments.completion.status_complete"
                status-locked-key="agreement.payments.completion.status_locked"
                comment-placeholder-key="agreement.payments.completion.comment_placeholder"
                complete-action-key="agreement.payments.completion.complete"
                completed-success-key="agreement.payments.completion.completed_success"
                :refresh-key="approvalsRefreshKey"
                @changed="handleCompleted" />
            </section>

            <CommonWorkflowSection v-else-if="selectedTab === 'workflows'" entity-type="fundingcasepayment" :entity-id="paymentId" purpose="standard" :can-edit="canEditWorkflow" :refresh-key="approvalsRefreshKey" @changed="refreshPage" />
            <CommonAttachmentsTab v-else-if="selectedTab === 'attachments'" entity-type="fundingcasepayment" :entity-id="paymentId" />
            <CommonAssignedUsers v-else-if="selectedTab === 'assignments'" entity-type="fundingcasepayment" :entity-id="paymentId" />
          </CommonEntityEditorWorkspace>
        </div>
      </template>
    </UDashboardPanel>

    <UModal v-if="selectedLine" v-model:open="isLineModalOpen" :title="selectedLine.id ? t('agreement.payments.edit_line') : t('agreement.payments.add_line')" :description="t('common.form_dialog_description')">
      <template #body>
        <UForm :state="selectedLine" :validate="validateLine" :validate-on="[]" class="space-y-4" @submit="saveLine">
          <UFormField :label="t('agreement.payments.commitment_line')" name="egcs_fc_fundingagreementcommitmentline">
            <CommonServerLookupSelect
              v-model="selectedLine.egcs_fc_fundingagreementcommitmentline"
              :fetch-url="`/api/agreements/${agreementId}/payment-lines/lookups/commitment-lines`"
              value-key="id"
              label-en-key="label_en"
              label-fr-key="label_fr"
              :limit="100"
              :query="{ paymentId, permission_action: selectedLine.id ? 'update' : 'create' }" />
          </UFormField>

          <UFormField :label="t('agreement.payments.amount')" name="egcs_fc_amount">
            <UInput v-model="selectedLine.egcs_fc_amount" type="text" inputmode="decimal" />
          </UFormField>

          <div class="flex justify-end gap-2 pt-4">
            <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="isLineModalOpen = false" />
            <CommonSaveButton :label="selectedLine.id ? t('common.update') : t('common.add')" :loading="isSavingLine" :disabled="isSavingLine" />
          </div>
        </UForm>
      </template>
    </UModal>
  </div>
</template>
