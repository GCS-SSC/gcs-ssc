<script setup lang="ts">
import { useActionContext } from '~/composables/useActionContext'
import { useCrudModalPending } from '~/composables/useCrudModal'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { computed, onScopeDispose, watch } from 'vue'
import { useFormSession } from '~/composables/useFormSession'
import type { Ref } from 'vue'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { TransferPaymentBudgetSchema } from '~~/shared/types/schemas'
import type { TransferPaymentBudgetForm, TransferPaymentBudgetRow } from '~~/shared/types/transfer-payment-ui'
import { formatMoneyText } from '~~/shared/utils/money'

const { programId, agencyId, canUpdateChild, canDeleteChild } = defineProps<{
  programId: string
  agencyId?: string | null
  canUpdateChild: boolean
  canDeleteChild: boolean
}>()

const { t, n, locale } = useI18n()
const toast = useLocalizedToast()
const { createValidator } = useZodI18n()
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()

const deleteContext = useActionContext({
  identity: [() => programId, () => agencyId],
  authority: () => canDeleteChild
})
const getBudgetName = (budget: TransferPaymentBudgetRow) =>
  `${budget.fiscal_year_display || String(budget.egcs_tp_fiscalyear)} [${budget.id}]`

const {
  search: budgetSearch,
  pagination: budgetPagination,
  items: budgets,
  totalRecords: budgetTotal,
  refresh: refreshBudgets,
  status: budgetStatusState
} = useResourceTable<TransferPaymentBudgetRow>({
  fetchUrl: computed(() => `/api/transfer-payments/${programId}/budgets`)
})

const budgetColumns: TableColumnInput<TransferPaymentBudgetRow>[] = [
  { id: 'fiscal_year', headerKey: 'transfer_payment.fiscal_year' },
  { accessorKey: 'egcs_tp_currency', headerKey: 'common.currency' },
  { accessorKey: 'egcs_tp_totalbudget', headerKey: 'transfer_payment.total_budget' },
  { accessorKey: 'egcs_tp_overcommitthreshold', headerKey: 'transfer_payment.overcommit_threshold' },
  { id: 'actions', headerKey: 'common.actions' }
]

const editingTarget = ref<string | null>(null)
const budgetModal = useCrudModal<TransferPaymentBudgetRow, TransferPaymentBudgetForm>({
  createState: () => {
    editingTarget.value = null
    return { egcs_tp_currency: 'cad' }
  },
  updateState: budget => {
    editingTarget.value = budget.id
    return { ...budget }
  }
})
const writeContext = useActionContext({
  identity: [() => programId, () => agencyId],
  authority: () => canUpdateChild,
  eligible: () => Boolean(agencyId) && (editingTarget.value === null || budgets.value.some(row => row.id === editingTarget.value))
})

const isBudgetModalOpen: Ref<boolean> = budgetModal.isOpen
const selectedBudget: Ref<TransferPaymentBudgetForm | null> = budgetModal.selected
const validateBudget = createValidator(TransferPaymentBudgetSchema)
const budgetPending = useCrudModalPending(budgetModal.captureSession)
const isSavingBudget = budgetPending.isPending
const selectedFiscalYearFetchUrl = computed<string | undefined>(() => {
  const fiscalYearId = selectedBudget.value?.egcs_tp_fiscalyear
  if (!fiscalYearId) {
    return undefined
  }

  return `/api/transfer-payments/${programId}/lookups/fiscal-years/${fiscalYearId}`
})

const openCreateBudget = () => {
  if (!agencyId || !canUpdateChild) return
  budgetModal.openCreate()
}

const openUpdateBudget = (budget: TransferPaymentBudgetRow) => {
  if (!agencyId || !canUpdateChild) return
  budgetModal.openUpdate(budget)
}

let contextGeneration = 0
let disposed = false
const isCurrentContext = (generation: number) => !disposed && generation === contextGeneration
watch([() => programId, () => agencyId, () => canUpdateChild], () => {
  contextGeneration += 1
  budgetModal.close()
}, { flush: 'sync' })
onScopeDispose(() => {
  disposed = true
  contextGeneration += 1
  budgetModal.close()
})

/**
 * Saves the currently selected budget record.
 * Performs a PATCH if the record has an ID (update), or a POST if it doesn't (new).
 * Closes the modal, refreshes the budget data, and provides success feedback to the user.
 */
const saveBudget = async () => {
  if (disposed || !selectedBudget.value || !agencyId || !canUpdateChild) return
  const targetId = editingTarget.value
  const operation = writeContext.capture()
  if (!operation) return
  const session = budgetModal.captureSession()
  if (!budgetPending.begin(session)) return
  const generation = contextGeneration
  const isUpdate = targetId !== null
  let closedCurrentSession = false
  try {
    const response = await fetch(getClientRequestUrl(targetId
      ? `/api/transfer-payments/${programId}/budgets/${targetId}`
      : `/api/transfer-payments/${programId}/budgets`), {
      method: targetId ? 'PATCH' : 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(selectedBudget.value)
    })
    if (!response.ok) {
      await throwFetchResponseError(response)
    }
    if (!operation.isCurrent() || !isCurrentContext(generation)) return
    closedCurrentSession = budgetModal.closeSession(session)
  } catch (error: unknown) {
    if (operation.isCurrent() && isCurrentContext(generation) && budgetModal.isCurrentSession(session)) showError(error)
    return
  } finally {
    budgetPending.end(session)
  }

  if (closedCurrentSession) {
    toast.add({
      title: toast.localized('common.success'),
      description: toast.localized(isUpdate ? 'common.updated_success' : 'common.added_success'),
      color: 'success'
    })
  }
  try {
    await refreshBudgets()
  } catch (error: unknown) {
    if (operation.isCurrent() && isCurrentContext(generation) && (budgetModal.isCurrentSession(session) || (closedCurrentSession && budgetModal.isLatestSession(session)))) showError(error)
  }
}

/**
 * Initiates the deletion process for a specific budget record.
 * Displays a confirmation dialog before calling the deletion API.
 * Refreshes the budget dataset and providing feedback on successful deletion.
 *
 * @param {TransferPaymentBudgetRow} budget - The budget record to be deleted.
 */
const deleteBudget = async (budget: TransferPaymentBudgetRow) => {
  if (disposed || !canDeleteChild) return
  const operation = deleteContext.capture()
  if (!operation) return
  const targetId = budget.id
  try {
    const ok = await confirmDeleteRequest(`/api/transfer-payments/${programId}/budgets/${budget.id}`, {
      operation,
      target: {
        id: targetId,
        resolve: () => budgets.value.find(current => current.id === targetId),
        eligible: () => canDeleteChild
      }
    })
    if (!ok || !operation.isCurrent()) return
    toast.add({ title: toast.localized('common.success'), description: toast.localized('common.deleted_success'), color: 'success' })
    await refreshBudgets()
  } catch (error: unknown) {
    if (operation.isCurrent()) showError(error)
  }
}
const formSession = useFormSession({ owner: budgetModal, action: { kind: 'remote', context: writeContext }, submit: saveBudget })
</script>

<template>
  <div class="space-y-6" data-field-scope="transfer-payment.budgets-tab">
    <CommonResourceLayout
      v-model:search="budgetSearch"
      v-model:pagination="budgetPagination"
      :data="budgets"
      :columns="budgetColumns"
      :total-records="budgetTotal"
      :loading="budgetStatusState === 'pending'"
      :request-status="budgetStatusState"
      :button-label="t('common.add')"
      :show-button="Boolean(agencyId) && canUpdateChild"
      @add="openCreateBudget"
      @retry="refreshBudgets">
      <template #fiscal_year-cell="{ row }">
        <span class="font-semibold text-zinc-700 dark:text-zinc-300">
          {{ row.original.fiscal_year_display || row.original.egcs_tp_fiscalyear }}
        </span>
      </template>
      <template #egcs_tp_currency-cell="{ row }">
        {{ row.original.egcs_tp_currency.toUpperCase() }}
      </template>
      <template #egcs_tp_totalbudget-cell="{ row }">
        <span class="font-semibold text-zinc-700 dark:text-zinc-300">
          {{ formatMoneyText(row.original.egcs_tp_totalbudget, locale) }}
        </span>
      </template>
      <template #egcs_tp_overcommitthreshold-cell="{ row }">
        <span class="font-semibold text-zinc-700 dark:text-zinc-300">
          {{ n(row.original.egcs_tp_overcommitthreshold, { style: 'percent' }) }}
        </span>
      </template>

      <template #actions-cell="{ row }">
        <div class="flex items-center gap-2">
          <CommonActionButton
            v-if="canUpdateChild"
            icon="i-lucide-pencil"
            color="neutral"
            variant="ghost"
            size="sm"
            :disabled="!agencyId"
            :aria-label="t('common.edit_named', { name: getBudgetName(row.original) })"
            @click="openUpdateBudget(row.original)" />
          <CommonActionButton
            v-if="canDeleteChild"
            icon="i-lucide-trash"
            color="error"
            variant="ghost"
            size="sm"
            :aria-label="t('common.delete_named', { name: getBudgetName(row.original) })"
            @click="deleteBudget(row.original)" />
        </div>
      </template>
    </CommonResourceLayout>

    <UModal
      v-if="selectedBudget && agencyId"
      v-model:open="isBudgetModalOpen"
      :title="selectedBudget?.id ? t('common.update') : t('common.add')">
      <template #body>
        <UForm v-bind="formSession" :state="selectedBudget" :validate="validateBudget" class="space-y-4">
          <UFormField :label="t('transfer_payment.fiscal_year')" name="egcs_tp_fiscalyear">
            <CommonServerLookupSelect
              v-model="selectedBudget.egcs_tp_fiscalyear"
              :fetch-url="`/api/transfer-payments/${programId}/lookups/fiscal-years`"
              value-key="id"
              label-en-key="egcs_ay_fiscalyeardisplay"
              label-fr-key="egcs_ay_fiscalyeardisplay"
              :show-value-in-label="false"
              :selected-fetch-url="selectedFiscalYearFetchUrl" />
          </UFormField>
          <UFormField :label="t('common.currency')" name="egcs_tp_currency">
            <CommonEnumSelect v-model="selectedBudget.egcs_tp_currency" name="currency_codes" :disabled="Boolean(selectedBudget.id)" />
          </UFormField>
          <UFormField :label="t('transfer_payment.total_budget')" name="egcs_tp_totalbudget">
            <CommonCurrencyInput
              v-model="selectedBudget.egcs_tp_totalbudget"
              :currency="selectedBudget.egcs_tp_currency" />
          </UFormField>
          <UFormField :label="t('transfer_payment.overcommit_threshold')" name="egcs_tp_overcommitthreshold" required>
            <UInputNumber
              v-model="selectedBudget.egcs_tp_overcommitthreshold"
              :step="0.01"
              :format-options="{ style: 'percent' }" />
          </UFormField>
          <div class="flex justify-end gap-2 pt-4">
            <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="isBudgetModalOpen = false" />
            <CommonSaveButton
              :label="selectedBudget?.id ? t('common.update') : t('common.add')"
              :loading="isSavingBudget"
              :disabled="isSavingBudget" />
          </div>
        </UForm>
      </template>
    </UModal>
  </div>
</template>
