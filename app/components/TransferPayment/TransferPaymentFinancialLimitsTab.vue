<script setup lang="ts">
import { TransferPaymentFinancialLimitsSchema } from '~~/shared/types/schemas/transfer-payment'
import { useCrudModalPending } from '~/composables/useCrudModal'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import type { Ref } from 'vue'
import type { TransferPaymentFinancialLimitsForm, TransferPaymentFinancialLimitsRow } from '~~/shared/types/transfer-payment-ui'
import { formatMoneyText } from '~~/shared/utils/money'

const { profileId, streamId, canUpdateChild, canDeleteChild } = defineProps<{
  profileId: string
  streamId: string
  canUpdateChild: boolean
  canDeleteChild: boolean
}>()

const { t, n, locale } = useI18n()
const toast = useLocalizedToast()
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()

const { items, totalRecords, refresh, status, pagination } = useResourceTable<TransferPaymentFinancialLimitsRow>({
  fetchUrl: `/api/transfer-payments/${profileId}/streams/${streamId}/financial-limits`
})

const columns = [
  {
    id: 'egcs_tp_maxallowableperrecipient',
    accessorKey: 'egcs_tp_maxallowableperrecipient',
    header: t('transfer_payment.financial_limit_max_allowable_per_recipient')
  },
  {
    id: 'egcs_tp_maxpercentofsupportavailableperrecipient',
    accessorKey: 'egcs_tp_maxpercentofsupportavailableperrecipient',
    header: t('transfer_payment.financial_limit_max_percent_support_per_recipient')
  },
  {
    id: 'egcs_tp_maxpercentofretroactivecostsallowable',
    accessorKey: 'egcs_tp_maxpercentofretroactivecostsallowable',
    header: t('transfer_payment.financial_limit_max_percent_retroactive_costs')
  },
  {
    id: 'egcs_tp_stackinglimit',
    accessorKey: 'egcs_tp_stackinglimit',
    header: t('transfer_payment.financial_limit_stacking_limit')
  },
  { id: 'egcs_tp_active', accessorKey: 'egcs_tp_active', header: t('common.status') },
  { id: 'actions', header: '' }
]

const { isOpen, selected, openCreate, openUpdate, captureSession, closeSession } = useCrudModal<
  TransferPaymentFinancialLimitsRow,
  TransferPaymentFinancialLimitsForm
>({
  /**
   * Factory function that creates a new financial limits form state with default values.
   *
   * @returns A partial transfer payment financial limits object.
   */
  createState: () => ({
    egcs_tp_transferpaymentstream: streamId,
    egcs_tp_active: true,
    egcs_tp_maxallowableperrecipient: '0',
    egcs_tp_maxpercentofsupportavailableperrecipient: 0,
    egcs_tp_stackinglimit: 0
  }),
  /**
   * Hydrates only supported editable fields from the persisted read model.
   * @param row Persisted financial-limit read model.
   * @returns Supported financial-limit form fields.
   */
  updateState: row => ({
    id: row.id,
    egcs_tp_transferpaymentstream: row.egcs_tp_transferpaymentstream,
    egcs_tp_maxallowableperrecipient: row.egcs_tp_maxallowableperrecipient,
    egcs_tp_maxpercentofsupportavailableperrecipient: row.egcs_tp_maxpercentofsupportavailableperrecipient,
    egcs_tp_stackinglimit: row.egcs_tp_stackinglimit,
    egcs_tp_active: row.egcs_tp_active
  })
})

const isModalOpen: Ref<boolean> = isOpen
const selectedLimit: Ref<TransferPaymentFinancialLimitsForm | null> = selected
const financialLimitPending = useCrudModalPending(captureSession)
const isSavingFinancialLimit = financialLimitPending.isPending

const canAdd = computed(() => canUpdateChild && status.value === 'success' && totalRecords.value === 0)

/**
 * Saves the currently selected financial limit record.
 * Performs a PATCH for an existing record, or a POST for a new record.
 * Closes the modal, refreshes the table data, and provides user feedback via toasts.
 */
const saveFinancialLimit = async () => {
  if (!selectedLimit.value) return
  const session = captureSession()
  if (!financialLimitPending.begin(session)) return
  try {
    const isUpdate = !!selectedLimit.value.id
    const url = isUpdate
      ? `/api/transfer-payments/${profileId}/streams/${streamId}/financial-limits/${selectedLimit.value.id}`
      : `/api/transfer-payments/${profileId}/streams/${streamId}/financial-limits`
    const method = isUpdate ? 'PATCH' : 'POST'

    const response = await fetch(getClientRequestUrl(url), {
      method,
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(selectedLimit.value)
    })
    if (!response.ok) {
      await throwFetchResponseError(response)
    }

    closeSession(session)
    await refresh()
    toast.add({ title: toast.localized('common.success'), description: toast.localized('common.updated_success'), color: 'success' })
  } catch (error: unknown) {
    showError(error)
  } finally {
    financialLimitPending.end(session)
  }
}

/**
 * Initiates the deletion process for a specific financial limit record.
 * Displays a confirmation dialog before calling the deletion API.
 * Refreshes the dataset if the deletion is confirmed and successful.
 *
 * @param {string} id - The unique identifier of the financial limit to be deleted.
 */
const onDelete = async (id: string) => {
  const success = await confirmDeleteRequest(
    `/api/transfer-payments/${profileId}/streams/${streamId}/financial-limits/${id}`
  )
  if (success) refresh()
}
</script>

<template>
  <div class="space-y-4">
    <CommonResourceLayout
      v-model:pagination="pagination"
      :title="t('transfer_payment.financial_limits')"
      :data="items"
      :total-records="totalRecords"
      :columns="columns"
      :loading="status === 'pending'"
      :button-label="t('common.add')"
      :show-button="canAdd"
      @add="openCreate">
      <template #egcs_tp_active-cell="{ row }">
        <CommonStatusBadge :variant="row.original.egcs_tp_active ? 'active' : 'inactive'" />
      </template>
      <template #egcs_tp_maxallowableperrecipient-cell="{ row }">
        <span class="font-semibold text-zinc-700 dark:text-zinc-300">
          {{ formatMoneyText(row.original.egcs_tp_maxallowableperrecipient, locale, null) }}
        </span>
      </template>
      <template #egcs_tp_maxpercentofsupportavailableperrecipient-cell="{ row }">
        <span class="font-semibold text-zinc-700 dark:text-zinc-300">
          {{ n(row.original.egcs_tp_maxpercentofsupportavailableperrecipient, { style: 'percent' }) }}
        </span>
      </template>
      <template #egcs_tp_maxpercentofretroactivecostsallowable-cell="{ row }">
        <span class="font-semibold text-zinc-700 dark:text-zinc-300">
          {{ n(row.original.egcs_tp_maxpercentofretroactivecostsallowable, { style: 'percent' }) }}
        </span>
      </template>
      <template #egcs_tp_stackinglimit-cell="{ row }">
        <span class="font-semibold text-zinc-700 dark:text-zinc-300">
          {{ n(row.original.egcs_tp_stackinglimit, { style: 'percent' }) }}
        </span>
      </template>

      <template #actions-cell="{ row }">
        <div class="flex justify-end gap-2">
          <CommonActionButton
            v-if="canUpdateChild"
            :aria-label="t('common.edit')"
            icon="i-lucide-pencil"
            color="neutral"
            variant="ghost"
            @click="openUpdate(row.original as TransferPaymentFinancialLimitsRow)" />
          <CommonActionButton
            v-if="canDeleteChild"
            :aria-label="t('common.delete')"
            icon="i-lucide-trash"
            color="error"
            variant="ghost"
            @click="onDelete(row.original.id)" />
        </div>
      </template>
    </CommonResourceLayout>

    <CommonFormDialog
      v-if="selectedLimit"
      v-model:open="isModalOpen"
      :state="selectedLimit"
      :schema="TransferPaymentFinancialLimitsSchema"
      :title="selectedLimit.id ? t('transfer_payment.financial_limit_update') : t('transfer_payment.financial_limit_create')"
      :submit-label="selectedLimit.id ? t('common.update') : t('common.save')"
      footer-class=""
      :pending="isSavingFinancialLimit"
      @submit="saveFinancialLimit">
      <template #default="{ state }">
        <TransferPaymentFieldsTransferPaymentFinancialLimitFields :model="state" />
      </template>
    </CommonFormDialog>
  </div>
</template>
