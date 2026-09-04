<script setup lang="ts">
import { useCrudModalPending } from '~/composables/useCrudModal'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { computed } from 'vue'
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
const toast = useToast()
const { createValidator } = useZodI18n()
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
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
  { accessorKey: 'egcs_tp_totalbudget', headerKey: 'transfer_payment.total_budget' },
  { accessorKey: 'egcs_tp_overcommitthreshold', headerKey: 'transfer_payment.overcommit_threshold' },
  { id: 'actions', headerKey: 'common.actions' }
]

const budgetModal = useCrudModal<TransferPaymentBudgetRow, TransferPaymentBudgetForm>({
  createState: () => ({}),
  updateState: budget => ({ ...budget })
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

/**
 * Saves the currently selected budget record.
 * Performs a PATCH if the record has an ID (update), or a POST if it doesn't (new).
 * Closes the modal, refreshes the budget data, and provides success feedback to the user.
 */
const saveBudget = async () => {
  if (!selectedBudget.value || !agencyId || !canUpdateChild) return
  const session = budgetModal.captureSession()
  if (!budgetPending.begin(session)) return
  const isUpdate = Boolean(selectedBudget.value.id)
  try {
    const response = await fetch(getClientRequestUrl(selectedBudget.value.id
      ? `/api/transfer-payments/${programId}/budgets/${selectedBudget.value.id}`
      : `/api/transfer-payments/${programId}/budgets`), {
      method: selectedBudget.value.id ? 'PATCH' : 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(selectedBudget.value)
    })
    if (!response.ok) {
      await throwFetchResponseError(response)
    }
    if (!budgetModal.closeSession(session)) return
  } catch (error: unknown) {
    showError(error)
    return
  } finally {
    budgetPending.end(session)
  }

  toast.add({
    title: t('common.success'),
    description: t(isUpdate ? 'common.updated_success' : 'common.added_success'),
    color: 'success'
  })
  try {
    await refreshBudgets()
  } catch (error: unknown) {
    showError(error)
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
  try {
    const ok = await confirmDeleteRequest(`/api/transfer-payments/${programId}/budgets/${budget.id}`)
    if (!ok) return
    toast.add({ title: t('common.success'), description: t('common.deleted_success'), color: 'success' })
  } catch (error: unknown) {
    showError(error)
    return
  }
  try {
    await refreshBudgets()
  } catch (error: unknown) {
    showError(error)
  }
}
</script>

<template>
  <div class="space-y-6">
    <CommonResourceLayoutCard
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
      <template #egcs_tp_totalbudget-cell="{ row }">
        <span class="font-semibold text-zinc-700 dark:text-zinc-300">
          {{ formatMoneyText(row.original.egcs_tp_totalbudget, locale, 'CAD') }}
        </span>
      </template>
      <template #egcs_tp_overcommitthreshold-cell="{ row }">
        <span class="font-semibold text-zinc-700 dark:text-zinc-300">
          {{ n(row.original.egcs_tp_overcommitthreshold, { style: 'percent' }) }}
        </span>
      </template>

      <template #actions-cell="{ row }">
        <div class="flex items-center gap-2">
          <UButton
            icon="i-lucide-pencil"
            color="neutral"
            variant="ghost"
            size="sm"
            :disabled="!canUpdateChild || !agencyId"
            :aria-label="t('common.edit_named', { name: getBudgetName(row.original) })"
            @click="openUpdateBudget(row.original)" />
          <UButton
            icon="i-lucide-trash"
            color="error"
            variant="ghost"
            size="sm"
            :disabled="!canDeleteChild"
            :aria-label="t('common.delete_named', { name: getBudgetName(row.original) })"
            @click="deleteBudget(row.original)" />
        </div>
      </template>
    </CommonResourceLayoutCard>

    <UModal
      v-if="selectedBudget && agencyId"
      v-model:open="isBudgetModalOpen"
      :title="selectedBudget?.id ? t('common.update') : t('common.add')">
      <template #body>
        <UForm :state="selectedBudget" :validate="validateBudget" class="space-y-4" @submit="saveBudget">
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
          <UFormField :label="t('transfer_payment.total_budget')" name="egcs_tp_totalbudget">
            <UInput
              v-model="selectedBudget.egcs_tp_totalbudget"
              inputmode="decimal" />
          </UFormField>
          <UFormField :label="t('transfer_payment.overcommit_threshold')" name="egcs_tp_overcommitthreshold">
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
