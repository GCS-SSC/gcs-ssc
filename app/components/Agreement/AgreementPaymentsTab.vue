<script setup lang="ts">
import { useCrudModalPending } from '~/composables/useCrudModal'
import { useBusinessStatusState } from '~/composables/useBusinessStatusState'
/* eslint-disable jsdoc/require-jsdoc -- Payment table callbacks are exercised by focused component tests. */
import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { useDeleteRequestToast } from '~/composables/useDeleteRequestToast'
import { useExtensionCreateActions } from '~/composables/useExtensionCreateActions'
import { useExtensionPaymentAmountCalculators } from '~/composables/useExtensionPaymentAmountCalculators'
import { useJsonRequest } from '~/composables/useJsonRequest'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { appRouteLocations } from '~/utils/route-locations'
import type {
  FundingCaseAgreementPaymentForm,
  FundingCaseAgreementPaymentOverviewRow,
  FundingCaseAgreementPaymentRow
} from '~~/shared/types/funding-case-agreement-ui'
import { FundingCaseAgreementPaymentCreateSchema } from '~~/shared/types/schemas'
import { CURRENCY_CODES_ENUM } from '~~/shared/constants/enums'
import { compareMoney, formatMoneyText, parseMoney, type Money } from '~~/shared/utils/money'
import type { GcsPaymentAmountCalculatorResult } from '@gcs-ssc/extensions/ui'

type PaymentCalculatorResult = GcsPaymentAmountCalculatorResult

type PaymentLookupQuery = {
  permission_action: 'create' | 'update'
  paymentId?: string
}

const buildPaymentLookupQuery = (paymentId?: string): PaymentLookupQuery => {
  if (paymentId) return { permission_action: 'update', paymentId }
  return { permission_action: 'create' }
}

const MONTH_KEYS = ['apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec', 'jan', 'feb', 'mar'] as const
const ZERO_MONEY = parseMoney('0')

const { agreementId, canCreate, canUpdate, canDelete } = defineProps<{
  agreementId: string
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
}>()
const agreementIdRef = computed(() => agreementId)

const { t, locale } = useI18n()
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
const {
  appendActions: extensionAppendCreateActions,
  replacementAction: extensionReplacementCreateAction,
  hasReplacement: hasExtensionCreateReplacement,
  hasConflict: hasExtensionCreateConflict
} = useExtensionCreateActions({
  operation: 'agreement.payments.create',
  agreementId: agreementIdRef
})
const {
  calculator: paymentAmountCalculator,
  hasConflict: hasPaymentAmountCalculatorConflict
} = useExtensionPaymentAmountCalculators({
  agreementId: agreementIdRef
})

const search: Ref<string> = ref('')
const pagination: Ref<{ pageIndex: number, pageSize: number }> = ref({
  pageIndex: 0,
  pageSize: 25
})

const paymentModal = useCrudModal<FundingCaseAgreementPaymentRow, FundingCaseAgreementPaymentForm>({
  createState: () => ({ egcs_fc_currency: 'cad' }),
  updateState: payment => ({
    id: payment.id,
    egcs_fc_commitmenttype: payment.commitment_type ?? undefined,
    egcs_fc_fiscalyear: payment.egcs_fc_fiscalyear,
    egcs_fc_paymenttype: payment.egcs_fc_paymenttype,
    egcs_fc_periodstart: payment.egcs_fc_periodstart,
    egcs_fc_periodend: payment.egcs_fc_periodend,
    egcs_fc_paymentamount: payment.egcs_fc_paymentamount,
    egcs_fc_currency: payment.egcs_fc_currency,
    egcs_fc_comment: payment.egcs_fc_comment
  })
})

const selectedPayment = paymentModal.selected
const isPaymentModalOpen = paymentModal.isOpen
const validatePayment = createValidator(FundingCaseAgreementPaymentCreateSchema)
const paymentPending = useCrudModalPending(paymentModal.captureSession)
const isSavingPayment = paymentPending.isPending
const paymentCalculatorResult: Ref<PaymentCalculatorResult | null> = ref(null)
const deletingPaymentIds: Ref<Set<string>> = ref(new Set())
watch(agreementIdRef, () => {
  paymentModal.close()
  paymentCalculatorResult.value = null
}, { flush: 'sync' })
const useOverviewFetch = useFetch as unknown as (url: Ref<string>) => {
  data: Ref<FundingCaseAgreementPaymentOverviewRow | null>
  refresh: () => Promise<void>
  status: Ref<'idle' | 'pending' | 'success' | 'error'>
}
const {
  data: overview,
  refresh: refreshOverview,
  status: overviewStatus
} = useOverviewFetch(computed(() => `/api/agreements/${agreementId}/payments-overview`))

const columns: TableColumnInput<FundingCaseAgreementPaymentRow>[] = [
  { id: 'type', accessorKey: 'egcs_fc_paymenttype', headerKey: 'agreement.payments.type' },
  { id: 'status', accessorKey: 'egcs_fc_status', headerKey: 'common.status' },
  { id: 'schedule', headerKey: 'agreement.payments.schedule' },
  { id: 'comment', accessorKey: 'egcs_fc_comment', headerKey: 'common.comment' },
  { id: 'amount', accessorKey: 'egcs_fc_paymentamount', headerKey: 'agreement.payments.amount' },
  { id: 'actions', headerKey: 'common.actions' }
]

const normalizedSearch = computed(() => search.value.trim().toLowerCase())
const tableRows = computed<FundingCaseAgreementPaymentRow[]>(() => (overview.value?.payments ?? []).filter((row: FundingCaseAgreementPaymentRow) => {
  if (!normalizedSearch.value) {
    return true
  }

  return [
    t(`enums.payment_type.${row.egcs_fc_paymenttype}`),
    getStatusLabel(row.egcs_fc_status),
    row.fiscal_year_display,
    row.egcs_fc_comment,
    row.egcs_fc_paymentamount,
    row.line_count
  ].some(value => String(value ?? '').toLowerCase().includes(normalizedSearch.value))
}))

const formatMoney = (value: Money, currency = 'CAD') => formatMoneyText(value, locale.value, currency)
const monthOptions = computed(() => MONTH_KEYS.map((key, index) => ({
  label: t(`agreement.payments.months.${key}`),
  value: index
})))
const getMonthLabel = (month: number) => t(`agreement.payments.months.${MONTH_KEYS[month]}`)
const getPeriodLabel = (periodStart: number, periodEnd: number) => `${getMonthLabel(periodStart)} - ${getMonthLabel(periodEnd)}`

const openCreatePayment = () => {
  paymentCalculatorResult.value = null
  paymentModal.openCreate()
}

const handleExtensionCreated = async () => {
  await refreshOverview()
  toast.add({
    title: t('common.success'),
    description: t('common.added_success'),
    color: 'success'
  })
}

const openUpdatePayment = (payment: FundingCaseAgreementPaymentRow) => {
  paymentCalculatorResult.value = null
  paymentModal.openUpdate(payment)
}

const paymentCalculatorModel = computed(() => ({
  agreementId,
  commitmentType: selectedPayment.value?.egcs_fc_commitmenttype,
  fiscalYear: selectedPayment.value?.egcs_fc_fiscalyear,
  paymentType: selectedPayment.value?.egcs_fc_paymenttype,
  periodStart: selectedPayment.value?.egcs_fc_periodstart,
  periodEnd: selectedPayment.value?.egcs_fc_periodend,
  amount: selectedPayment.value?.egcs_fc_paymentamount
}))

const paymentCalculatorCeiling = computed(() => {
  const ceiling = paymentCalculatorResult.value?.ceilingAmount
  if (typeof ceiling !== 'string') {
    return null
  }
  return ceiling
})
const paymentCalculatorCeilingMoney = computed<Money | null>(() => {
  const ceiling = paymentCalculatorCeiling.value
  if (ceiling === null) return null
  try {
    return parseMoney(ceiling)
  } catch {
    return null
  }
})
const calculatorCurrencyCode = computed(() => {
  const currency = paymentCalculatorResult.value?.currency?.toLowerCase() ?? ''
  return CURRENCY_CODES_ENUM.includes(currency as (typeof CURRENCY_CODES_ENUM)[number])
    ? currency as (typeof CURRENCY_CODES_ENUM)[number]
    : null
})
const isCalculatorCurrencyControlled = computed(() => Boolean(
  paymentAmountCalculator.value
  && !selectedPayment.value?.id
  && calculatorCurrencyCode.value
))
const paymentCalculatorCurrency = computed(() => {
  return calculatorCurrencyCode.value
    ? calculatorCurrencyCode.value.toUpperCase()
    : selectedPayment.value?.egcs_fc_currency?.toUpperCase() ?? 'CAD'
})

const isPaymentAboveCalculatorCeiling = computed(() => {
  const ceiling = paymentCalculatorCeilingMoney.value
  const amount = selectedPayment.value?.egcs_fc_paymentamount
  if (!ceiling || typeof amount !== 'string') return false
  try {
    return compareMoney(parseMoney(amount), ceiling) > 0
  } catch {
    return false
  }
})

watch(
  () => paymentCalculatorResult.value?.suggestedAmount,
  suggestedAmount => {
    if (!selectedPayment.value || selectedPayment.value.id) {
      return
    }
    if (typeof suggestedAmount !== 'string') {
      return
    }
    try {
      selectedPayment.value.egcs_fc_paymentamount = parseMoney(suggestedAmount)
    } catch {
      // The extension result remains visible, but invalid money never enters the host form contract.
    }
  }
)

const handlePaymentCalculatorResult = (result: Record<string, unknown>) => {
  paymentCalculatorResult.value = result as PaymentCalculatorResult
  if (
    selectedPayment.value
    && !selectedPayment.value.id
    && calculatorCurrencyCode.value
  ) {
    selectedPayment.value.egcs_fc_currency = calculatorCurrencyCode.value
  }
}

const handlePaymentCalculatorExtensionPayload = (extensionKey: string, value: Record<string, unknown>) => {
  if (!selectedPayment.value) {
    return
  }
  selectedPayment.value.extensions = {
    ...selectedPayment.value.extensions,
    [extensionKey]: value
  }
}

const savePayment = async () => {
  if (!selectedPayment.value) {
    return
  }
  if (isPaymentAboveCalculatorCeiling.value) {
    return
  }
  const paymentState = selectedPayment.value
  const isUpdate = Boolean(paymentState.id)
  const session = paymentModal.captureSession()
  if (!paymentPending.begin(session)) return

  try {
    await saveJson(
      isUpdate
        ? `/api/agreements/${agreementId}/payments/${paymentState.id}`
        : `/api/agreements/${agreementId}/payments`,
      isUpdate ? 'PATCH' : 'POST',
      paymentState
    )

    if (!paymentModal.closeSession(session)) return
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
    paymentPending.end(session)
  }
}

const { confirmDeleteWithToast } = useDeleteRequestToast()

const deletePayment = async (paymentId: string) => {
  if (deletingPaymentIds.value.has(paymentId)) return
  deletingPaymentIds.value = new Set(deletingPaymentIds.value).add(paymentId)
  try {
    await confirmDeleteWithToast(`/api/agreements/${agreementId}/payments/${paymentId}`, {
      refresh: refreshOverview
    })
  } finally {
    const next = new Set(deletingPaymentIds.value)
    next.delete(paymentId)
    deletingPaymentIds.value = next
  }
}
</script>

<template>
  <div class="w-full">
    <CommonResourceLayoutCard
      v-model:search="search"
      v-model:pagination="pagination"
      :data="tableRows"
      :columns="columns"
      :total-records="tableRows.length"
      :loading="overviewStatus === 'pending'"
      :request-status="overviewStatus"
      table-class="w-full max-w-full table-fixed"
      :button-label="t('agreement.payments.add')"
      :show-button="canCreate && !hasExtensionCreateReplacement && !hasExtensionCreateConflict && !hasPaymentAmountCalculatorConflict"
      :search-placeholder="t('agreement.payments.search')"
      @add="openCreatePayment"
      @retry="refreshOverview">
      <template #actions>
        <div
          v-if="canCreate && hasExtensionCreateConflict"
          role="status"
          tabindex="0"
          :aria-label="t('extensions.create_operation_conflict')"
          class="flex max-w-sm items-start gap-2 rounded-md border border-error/30 bg-error/5 px-3 py-2 text-sm text-error">
          <UIcon name="i-lucide-alert-triangle" aria-hidden="true" class="mt-0.5 size-4 shrink-0" />
          <span>{{ t('extensions.create_operation_conflict') }}</span>
        </div>
        <div
          v-if="canCreate && hasPaymentAmountCalculatorConflict"
          role="status"
          tabindex="0"
          :aria-label="t('extensions.payment_amount_calculator_conflict')"
          class="flex max-w-sm items-start gap-2 rounded-md border border-error/30 bg-error/5 px-3 py-2 text-sm text-error">
          <UIcon name="i-lucide-alert-triangle" aria-hidden="true" class="mt-0.5 size-4 shrink-0" />
          <span>{{ t('extensions.payment_amount_calculator_conflict') }}</span>
        </div>
        <ExtensionCreateActionHost
          v-if="canCreate && extensionReplacementCreateAction && !hasExtensionCreateConflict"
          :item="extensionReplacementCreateAction"
          @created="handleExtensionCreated" />
        <template v-if="canCreate">
          <ExtensionCreateActionHost
            v-for="action in extensionAppendCreateActions"
            :key="action.value"
            :item="action"
            @created="handleExtensionCreated" />
        </template>
      </template>

      <template #type-cell="{ row }">
        <div class="flex flex-col gap-1">
          <ULink
            :to="localePath(appRouteLocations.agreementPaymentDetail(agreementId, String(row.original.id)))"
            class="font-bold text-zinc-900 transition-colors hover:text-primary dark:text-white">
            {{ t(`enums.payment_type.${row.original.egcs_fc_paymenttype}`) }}
          </ULink>
          <span class="text-xs font-bold tracking-widest text-zinc-400 uppercase">
            {{ row.original.line_count ?? 0 }} {{ t('agreement.payments.lines') }}
          </span>
        </div>
      </template>

      <template #status-cell="{ row }">
        <CommonRecordState
          :status-id="row.original.egcs_fc_status"
          :is-completed="row.original.isCompleted" />
      </template>

      <template #schedule-cell="{ row }">
        <div class="flex flex-col gap-1">
          <span class="font-medium text-zinc-700 dark:text-zinc-200">
            {{ row.original.fiscal_year_display }}
          </span>
          <span class="text-xs font-bold tracking-widest text-zinc-400 uppercase">
            {{ t('agreement.payments.period') }} {{ getPeriodLabel(row.original.egcs_fc_periodstart, row.original.egcs_fc_periodend) }}
          </span>
        </div>
      </template>

      <template #amount-cell="{ row }">
        <span class="font-medium text-zinc-700 dark:text-zinc-200">
          {{ formatMoney(row.original.egcs_fc_paymentamount, row.original.egcs_fc_currency?.toUpperCase() ?? 'CAD') }}
        </span>
      </template>

      <template #comment-cell="{ row }">
        <p
          v-if="row.original.egcs_fc_comment"
          class="line-clamp-2 max-w-64 text-sm leading-5 text-zinc-600 dark:text-zinc-300">
          {{ row.original.egcs_fc_comment }}
        </p>
        <span v-else class="text-sm text-zinc-400 dark:text-zinc-500">
          {{ t('common.none') }}
        </span>
      </template>

      <template #actions-cell="{ row }">
        <div class="flex items-center justify-end gap-2">
          <UButton
            v-if="canUpdate && !isRecordLocked(row.original)"
            icon="i-lucide-pencil"
            color="neutral"
            variant="ghost"
            class="cursor-default"
            :aria-label="t('common.edit')"
            @click="openUpdatePayment(row.original)" />
          <UButton
            v-if="canDelete && !isRecordLocked(row.original)"
            icon="i-lucide-trash"
            color="error"
            variant="ghost"
            class="cursor-default"
            :aria-label="t('common.delete')"
            :loading="deletingPaymentIds.has(String(row.original.id))"
            :disabled="deletingPaymentIds.has(String(row.original.id))"
            @click="deletePayment(String(row.original.id))" />
        </div>
      </template>
    </CommonResourceLayoutCard>

    <UModal
      v-if="selectedPayment"
      v-model:open="isPaymentModalOpen"
      :title="selectedPayment.id ? t('agreement.payments.edit') : t('agreement.payments.add')">
      <template #body>
        <UForm :state="selectedPayment" :validate="validatePayment" :validate-on="[]" class="space-y-4" @submit="savePayment">
          <UFormField :label="t('agreement.payments.commitment_type')" name="egcs_fc_commitmenttype">
            <CommonServerLookupSelect
              v-model="selectedPayment.egcs_fc_commitmenttype"
              :fetch-url="`/api/agreements/${agreementId}/payments/lookups/commitments`"
              value-key="id"
              label-en-key="label_en"
              label-fr-key="label_fr"
              :show-value-in-label="false"
              :limit="100"
              :query="buildPaymentLookupQuery(selectedPayment.id)" />
          </UFormField>

          <UFormField :label="t('agreement.payments.fiscal_year')" name="egcs_fc_fiscalyear">
            <CommonServerLookupSelect
              v-model="selectedPayment.egcs_fc_fiscalyear"
              :fetch-url="`/api/agreements/${agreementId}/payments/lookups/fiscal-years`"
              value-key="id"
              label-en-key="label_en"
              label-fr-key="label_fr"
              :show-value-in-label="false"
              :limit="100"
              :query="buildPaymentLookupQuery(selectedPayment.id)" />
          </UFormField>

          <UFormField :label="t('agreement.payments.type')" name="egcs_fc_paymenttype">
            <CommonEnumSelect v-model="selectedPayment.egcs_fc_paymenttype" name="payment_type" class="w-full" />
          </UFormField>

          <UFormField :label="t('common.currency')" name="egcs_fc_currency">
            <CommonEnumSelect
              v-model="selectedPayment.egcs_fc_currency"
              name="currency_codes"
              class="w-full"
              :disabled="isCalculatorCurrencyControlled" />
          </UFormField>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField :label="t('agreement.payments.period_start')" name="egcs_fc_periodstart">
              <USelect v-model="selectedPayment.egcs_fc_periodstart" :items="monthOptions" />
            </UFormField>

            <UFormField :label="t('agreement.payments.period_end')" name="egcs_fc_periodend">
              <USelect v-model="selectedPayment.egcs_fc_periodend" :items="monthOptions" />
            </UFormField>
          </div>

          <UFormField :label="t('agreement.payments.amount')" name="egcs_fc_paymentamount">
            <UInput
              v-model="selectedPayment.egcs_fc_paymentamount"
              type="text"
              inputmode="decimal" />
            <p v-if="isPaymentAboveCalculatorCeiling" class="mt-1 text-sm text-error">
              {{ t('agreement.payments.amount_exceeds_calculated_ceiling', { amount: formatMoney(paymentCalculatorCeilingMoney ?? ZERO_MONEY, paymentCalculatorCurrency) }) }}
            </p>
          </UFormField>

          <ExtensionPaymentAmountCalculatorHost
            v-if="paymentAmountCalculator && !selectedPayment.id"
            :item="paymentAmountCalculator"
            :model="paymentCalculatorModel"
            @result="handlePaymentCalculatorResult"
            @extension-payload="handlePaymentCalculatorExtensionPayload" />

          <UFormField :label="t('common.comment')" name="egcs_fc_comment">
            <UTextarea v-model="selectedPayment.egcs_fc_comment" class="w-full" />
          </UFormField>
          <div class="flex justify-end gap-2 pt-4">
            <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="isPaymentModalOpen = false" />
            <CommonSaveButton
              :label="selectedPayment.id ? t('common.update') : t('common.add')"
              :loading="isSavingPayment"
              :disabled="isSavingPayment || isPaymentAboveCalculatorCeiling || paymentCalculatorResult?.loading === true" />
          </div>
        </UForm>
      </template>
    </UModal>
  </div>
</template>
