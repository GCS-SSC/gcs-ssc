<script setup lang="ts">
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { computed, watch } from 'vue'
import type { Ref } from 'vue'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { useCrudModalPending } from '~/composables/useCrudModal'
import { TransferPaymentStreamBudgetSchema } from '~~/shared/types/schemas'
import type { TransferPaymentStreamBudgetForm, TransferPaymentStreamBudgetRow } from '~~/shared/types/transfer-payment-ui'
import { formatMoneyText } from '~~/shared/utils/money'

const {
  transferPaymentId,
  streamId,
  canUpdateChild,
  canDeleteChild
} = defineProps<{
  transferPaymentId: string
  streamId: string
  canUpdateChild: boolean
  canDeleteChild: boolean
}>()

const { t, n, locale } = useI18n()
const toast = useToast()
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const { createValidator } = useZodI18n()

const {
  search: streamBudgetSearch,
  pagination: streamBudgetPagination,
  items: streamBudgets,
  totalRecords: streamBudgetTotal,
  refresh: refreshStreamBudgets,
  status: streamBudgetStatusState
} = useResourceTable<TransferPaymentStreamBudgetRow>({
  fetchUrl: computed(() => `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/budgets`)
})

const streamBudgetColumns: TableColumnInput<TransferPaymentStreamBudgetRow>[] = [
  { id: 'fiscal_year', headerKey: 'transfer_payment.fiscal_year' },
  { accessorKey: 'egcs_tp_totalbudget', headerKey: 'transfer_payment.total_budget' },
  { accessorKey: 'program_total_budget', headerKey: 'transfer_payment.program_total_budget' },
  { accessorKey: 'egcs_tp_overcommitthreshold', headerKey: 'transfer_payment.overcommit_threshold' },
  { id: 'actions', headerKey: 'common.actions' }
]

const streamBudgetModal = useCrudModal<TransferPaymentStreamBudgetRow, TransferPaymentStreamBudgetForm>({
  createState: () => ({}),
  updateState: row => ({ ...row })
})

const isStreamBudgetModalOpen: Ref<boolean> = streamBudgetModal.isOpen
const selectedStreamBudget: Ref<TransferPaymentStreamBudgetForm | null> = streamBudgetModal.selected
const openUpdateStreamBudget = streamBudgetModal.openUpdate
const validateStreamBudget = createValidator(TransferPaymentStreamBudgetSchema)
const streamBudgetPending = useCrudModalPending(streamBudgetModal.captureSession)
const isSavingStreamBudget = streamBudgetPending.isPending
const getStreamBudgetActionTarget = (row: TransferPaymentStreamBudgetRow) =>
  `${row.fiscal_year_display || row.fiscal_year || row.id} [${row.id}]`

watch([() => transferPaymentId, () => streamId], () => streamBudgetModal.close())

const openCreateStreamBudget = () => {
  if (!canUpdateChild) return
  streamBudgetModal.openCreate()
}

/** Persists the selected stream budget and refreshes the table. */
const saveStreamBudget = async () => {
  if (!selectedStreamBudget.value || !canUpdateChild) return
  const session = streamBudgetModal.captureSession()
  if (!streamBudgetPending.begin(session)) return
  const isUpdate = Boolean(selectedStreamBudget.value.id)
  try {
    const response = await fetch(getClientRequestUrl(selectedStreamBudget.value.id
      ? `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/budgets/${selectedStreamBudget.value.id}`
      : `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/budgets`), {
      method: selectedStreamBudget.value.id ? 'PATCH' : 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(selectedStreamBudget.value)
    })
    if (!response.ok) {
      await throwFetchResponseError(response)
    }
    if (!streamBudgetModal.closeSession(session)) return
  } catch (error: unknown) {
    if (streamBudgetModal.captureSession() === session) showError(error)
    return
  } finally {
    streamBudgetPending.end(session)
  }

  toast.add({
    title: t('common.success'),
    description: t(isUpdate ? 'common.updated_success' : 'common.added_success'),
    color: 'success'
  })
  try {
    await refreshStreamBudgets()
  } catch (error: unknown) {
    showError(error)
  }
}

/**
 * Confirms and deletes a stream budget, then refreshes the table.
 *
 * @param row - The stream budget to delete.
 */
const deleteStreamBudget = async (row: TransferPaymentStreamBudgetRow) => {
  try {
    const ok = await confirmDeleteRequest(
      `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/budgets/${row.id}`
    )
    if (!ok) return
    toast.add({ title: t('common.success'), description: t('common.deleted_success'), color: 'success' })
  } catch (error: unknown) {
    showError(error)
    return
  }
  try {
    await refreshStreamBudgets()
  } catch (error: unknown) {
    showError(error)
  }
}
</script>

<template>
  <CommonResourceLayoutCard
    v-model:search="streamBudgetSearch"
    v-model:pagination="streamBudgetPagination"
    :data="streamBudgets"
    :columns="streamBudgetColumns"
    :total-records="streamBudgetTotal"
    :loading="streamBudgetStatusState === 'pending'"
    :request-status="streamBudgetStatusState"
    :button-label="t('common.add')"
    :show-button="canUpdateChild"
    @add="openCreateStreamBudget"
    @retry="refreshStreamBudgets">
    <template #fiscal_year-cell="{ row }">
      <span class="font-semibold text-zinc-700 dark:text-zinc-300">
        {{ row.original.fiscal_year_display || row.original.fiscal_year }}
      </span>
    </template>
    <template #egcs_tp_totalbudget-cell="{ row }">
      <span class="font-semibold text-zinc-700 dark:text-zinc-300">
        {{ formatMoneyText(row.original.egcs_tp_totalbudget, locale, 'CAD') }}
      </span>
    </template>
    <template #program_total_budget-cell="{ row }">
      <span class="font-semibold text-zinc-700 dark:text-zinc-300">
        {{ row.original.program_total_budget ? formatMoneyText(row.original.program_total_budget, locale, 'CAD') : t('common.none') }}
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
          :aria-label="t('common.edit_named', { name: getStreamBudgetActionTarget(row.original) })"
          :disabled="!canUpdateChild"
          @click="openUpdateStreamBudget(row.original)" />
        <UButton
          icon="i-lucide-trash"
          color="error"
          variant="ghost"
          size="sm"
          :aria-label="t('common.delete_named', { name: getStreamBudgetActionTarget(row.original) })"
          :disabled="!canDeleteChild"
          @click="deleteStreamBudget(row.original)" />
      </div>
    </template>
  </CommonResourceLayoutCard>

  <UModal
    v-if="selectedStreamBudget"
    v-model:open="isStreamBudgetModalOpen"
    :title="selectedStreamBudget?.id ? t('common.update') : t('common.add')">
    <template #body>
      <UForm :state="selectedStreamBudget" :validate="validateStreamBudget" class="space-y-4" @submit="saveStreamBudget">
        <TransferPaymentFieldsTransferPaymentStreamBudgetFields
          v-model:model="selectedStreamBudget"
          :transfer-payment-id="transferPaymentId" />
        <div class="flex justify-end gap-2 pt-4">
          <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="isStreamBudgetModalOpen = false" />
          <CommonSaveButton
            :label="selectedStreamBudget?.id ? t('common.update') : t('common.add')"
            :loading="isSavingStreamBudget"
            :disabled="isSavingStreamBudget" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
