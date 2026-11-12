<script setup lang="ts">
import { useActionContext } from '~/composables/useActionContext'
import { useFormSession } from '~/composables/useFormSession'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { computed, onBeforeUnmount, watch } from 'vue'
import type { Ref } from 'vue'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { useCrudModalPending } from '~/composables/useCrudModal'
import { TransferPaymentStreamBudgetCreateSchema } from '~~/shared/types/schemas'
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
const toast = useLocalizedToast()
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()

const deleteContext = useActionContext({
  identity: [() => transferPaymentId, () => streamId],
  authority: () => canDeleteChild
})
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
  { accessorKey: 'egcs_tp_currency', headerKey: 'common.currency' },
  { accessorKey: 'egcs_tp_totalbudget', headerKey: 'transfer_payment.total_budget' },
  { accessorKey: 'program_total_budget', headerKey: 'transfer_payment.program_total_budget' },
  { accessorKey: 'egcs_tp_overcommitthreshold', headerKey: 'transfer_payment.overcommit_threshold' },
  { id: 'actions', headerKey: 'common.actions' }
]

const editingTarget = ref<string | null>(null)
const streamBudgetModal = useCrudModal<TransferPaymentStreamBudgetRow, TransferPaymentStreamBudgetForm>({
  createState: () => {
    editingTarget.value = null
    return {}
  },
  updateState: row => {
    editingTarget.value = row.id
    return { ...row }
  }
})
const writeContext = useActionContext({
  identity: [() => transferPaymentId, () => streamId],
  authority: () => canUpdateChild,
  eligible: () => (editingTarget.value === null || streamBudgets.value.some(row => row.id === editingTarget.value))
})

const isStreamBudgetModalOpen: Ref<boolean> = streamBudgetModal.isOpen
const selectedStreamBudget: Ref<TransferPaymentStreamBudgetForm | null> = streamBudgetModal.selected
const openUpdateStreamBudget = streamBudgetModal.openUpdate
const validateStreamBudget = createValidator(TransferPaymentStreamBudgetCreateSchema)
const streamBudgetPending = useCrudModalPending(streamBudgetModal.captureSession)
const isSavingStreamBudget = streamBudgetPending.isPending
const getStreamBudgetActionTarget = (row: TransferPaymentStreamBudgetRow) =>
  `${row.fiscal_year_display || row.fiscal_year || row.id} [${row.id}]`

const deletePending = useCrudModalPending(() => deleteContext.version.value)
const isDeletingStreamBudget = deletePending.isPending
let contextGeneration = 0
let disposed = false
const isCurrentContext = (generation: number) => !disposed && generation === contextGeneration
watch([() => transferPaymentId, () => streamId, () => canUpdateChild], () => {
  contextGeneration += 1
  streamBudgetModal.close()
}, { flush: 'sync' })
onBeforeUnmount(() => {
  disposed = true
  contextGeneration += 1
})

const openCreateStreamBudget = () => {
  if (!canUpdateChild) return
  streamBudgetModal.openCreate()
}

/** Persists the selected stream budget and refreshes the table. */
const saveStreamBudget = async () => {
  if (disposed || !selectedStreamBudget.value || !canUpdateChild) return
  const targetId = editingTarget.value
  const operation = writeContext.capture()
  if (!operation) return
  const session = streamBudgetModal.captureSession()
  if (!streamBudgetPending.begin(session)) return
  const isUpdate = targetId !== null
  const generation = contextGeneration
  let closedSession = false
  try {
    const response = await fetch(getClientRequestUrl(targetId
      ? `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/budgets/${targetId}`
      : `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/budgets`), {
      method: targetId ? 'PATCH' : 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(selectedStreamBudget.value)
    })
    if (!response.ok) {
      await throwFetchResponseError(response)
    }
    if (!operation.isCurrent() || !isCurrentContext(generation)) return
    closedSession = streamBudgetModal.closeSession(session)
  } catch (error: unknown) {
    if (operation.isCurrent() && isCurrentContext(generation) && streamBudgetModal.captureSession() === session) showError(error)
    return
  } finally {
    streamBudgetPending.end(session)
  }

  try {
    await refreshStreamBudgets()
    if (!operation.isCurrent() || !isCurrentContext(generation) || !closedSession || !streamBudgetModal.isLatestSession(session) || streamBudgetStatusState.value !== 'success') return
    toast.add({
      title: toast.localized('common.success'),
      description: toast.localized(isUpdate ? 'common.updated_success' : 'common.added_success'),
      color: 'success'
    })
  } catch (error: unknown) {
    if (operation.isCurrent() && isCurrentContext(generation)) showError(error)
  }
}

/**
 * Confirms and deletes a stream budget, then refreshes the table.
 *
 * @param row - The stream budget to delete.
 */
const deleteStreamBudget = async (row: TransferPaymentStreamBudgetRow) => {
  if (disposed || !canDeleteChild || isDeletingStreamBudget.value) return
  const operation = deleteContext.capture()
  if (!operation) return
  const targetId = row.id
  const deleteSession = deleteContext.version.value
  if (!deletePending.begin(deleteSession)) return
  try {
    const ok = await confirmDeleteRequest(
      `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/budgets/${row.id}`,
      {
        operation,
        target: {
          id: targetId,
          resolve: () => streamBudgets.value.find(current => current.id === targetId),
          eligible: () => canDeleteChild
        }
      }
    )
    if (!ok || !operation.isCurrent()) return
    await refreshStreamBudgets()
    if (!operation.isCurrent() || streamBudgetStatusState.value !== 'success') return
    toast.add({ title: toast.localized('common.success'), description: toast.localized('common.deleted_success'), color: 'success' })
  } catch (error: unknown) {
    if (operation.isCurrent()) showError(error)
  } finally {
    deletePending.end(deleteSession)
  }
}
const formSession = useFormSession({ owner: streamBudgetModal, action: { kind: 'remote', context: writeContext }, submit: saveStreamBudget })
</script>

<template>
  <CommonResourceLayout
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
    <template #egcs_tp_currency-cell="{ row }">
      {{ row.original.egcs_tp_currency.toUpperCase() }}
    </template>
    <template #egcs_tp_totalbudget-cell="{ row }">
      <span class="font-semibold text-zinc-700 dark:text-zinc-300">
        {{ formatMoneyText(row.original.egcs_tp_totalbudget, locale) }}
      </span>
    </template>
    <template #program_total_budget-cell="{ row }">
      <span class="font-semibold text-zinc-700 dark:text-zinc-300">
        {{ row.original.program_total_budget ? formatMoneyText(row.original.program_total_budget, locale) : t('common.none') }}
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
          :aria-label="t('common.edit_named', { name: getStreamBudgetActionTarget(row.original) })"
          @click="openUpdateStreamBudget(row.original)" />
        <CommonActionButton
          v-if="canDeleteChild"
          icon="i-lucide-trash"
          color="error"
          variant="ghost"
          size="sm"
          :aria-label="t('common.delete_named', { name: getStreamBudgetActionTarget(row.original) })"
          :disabled="isDeletingStreamBudget"
          @click="deleteStreamBudget(row.original)" />
      </div>
    </template>
  </CommonResourceLayout>

  <UModal
    v-if="selectedStreamBudget"
    v-model:open="isStreamBudgetModalOpen"
    :title="selectedStreamBudget?.id ? t('common.update') : t('common.add')">
    <template #body>
      <UForm v-bind="formSession" :state="selectedStreamBudget" :validate="validateStreamBudget" class="space-y-4">
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
