<script setup lang="ts">
import { useActionContext } from '~/composables/useActionContext'
import { computed, onScopeDispose, watch } from 'vue'
import type { TransferPaymentStreamChartOfAccountItem } from '~~/shared/types/schemas/transfer-payment'

const { profileId, streamId, canUpdateChild, canDeleteChild } = defineProps<{
  profileId: string
  streamId: string
  canUpdateChild: boolean
  canDeleteChild: boolean
}>()

const writeContext = useActionContext({
  identity: [() => profileId, () => streamId],
  authority: () => canUpdateChild
})
const deleteActionContext = useActionContext({
  identity: [() => profileId, () => streamId],
  authority: () => canDeleteChild
})
const { t, locale } = useI18n()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const {
  items,
  totalRecords,
  refresh,
  status,
  search,
  pagination
} = useResourceTable<TransferPaymentStreamChartOfAccountItem & { fiscal_year_display: string }>({
  fetchUrl: computed(() => `/api/transfer-payments/${profileId}/streams/${streamId}/chart-of-accounts`)
})

const columns = [
  { id: 'egcs_ay_kind', accessorKey: 'egcs_ay_kind', header: t('transfer_payment.chart_of_accounts.kind') },
  { id: 'fiscal_year_display', accessorKey: 'fiscal_year_display', header: t('transfer_payment.chart_of_accounts.fiscal_year') },
  { id: 'egcs_ay_currency', accessorKey: 'egcs_ay_currency', header: t('common.currency') },
  { id: 'egcs_ay_accountingdimensions', accessorKey: 'egcs_ay_accountingdimensions', header: t('transfer_payment.chart_of_accounts.accounting_fields') },
  { id: 'agency_definition_deleted', accessorKey: 'agency_definition_deleted', header: t('common.status') },
  { id: 'actions', header: '' }
]

const { isOpen, openCreate, close, captureSession, closeSession } = useCrudModal<
  TransferPaymentStreamChartOfAccountItem,
  TransferPaymentStreamChartOfAccountItem | null
>({
  createState: () => null,
  updateState: item => ({ ...item })
})

watch(() => [profileId, streamId], close, { flush: 'sync' })

let deletionContext: { kind: 'active' } | { kind: 'disposed' } = { kind: 'active' }
watch(() => [profileId, streamId, canDeleteChild], () => {
  deletionContext = { kind: 'active' }
}, { flush: 'sync' })
onScopeDispose(() => {
  deletionContext = { kind: 'disposed' }
})

const getActionTarget = (item: TransferPaymentStreamChartOfAccountItem & { fiscal_year_display: string }) =>
  `${item.fiscal_year_display || String(item.egcs_ay_fiscalyear)} [${item.id}]`

/**
 * Soft-deletes a chart of accounts entry after confirmation.
 *
 * @param id - Chart of accounts entry identifier.
 */
const onDelete = async (id: string) => {
  const operation = deleteActionContext.capture()
  if (!operation) return
  const requestedContext = deletionContext
  const isCurrent = () => deletionContext.kind === 'active' && deletionContext === requestedContext && canDeleteChild
  if (!isCurrent()) return
  const success = await confirmDeleteRequest(
    `/api/transfer-payments/${profileId}/streams/${streamId}/chart-of-accounts/${id}`,
    { operation, target: { id, resolve: () => items.value.find(current => current.id === id), eligible: current => current.id === id }, shouldProceed: isCurrent }
  )
  if (success && operation.isCurrent() && isCurrent()) await refresh()
}
</script>

<template>
  <div class="space-y-4">
    <CommonResourceLayout
      v-model:search="search"
      v-model:pagination="pagination"
      :title="t('transfer_payment.chart_of_accounts.title')"
      :data="items"
      :total-records="totalRecords"
      :columns="columns"
      :loading="status === 'pending'"
      :request-status="status"
      :button-label="t('common.add')"
      :show-button="canUpdateChild"
      @add="openCreate"
      @retry="refresh">
      <template #egcs_ay_kind-cell="{ row }">
        {{ t(`enums.agency_chart_of_account_kind.${row.original.egcs_ay_kind}`) }}
      </template>
      <template #egcs_ay_currency-cell="{ row }">
        {{ row.original.egcs_ay_currency.toUpperCase() }}
      </template>
      <template #egcs_ay_accountingdimensions-cell="{ row }">
        <div class="flex min-w-64 flex-wrap gap-1.5 py-1">
          <CommonStatusBadge
            v-for="dimension in row.original.egcs_ay_accountingdimensions"
            :key="`${dimension.label_en}:${dimension.label_fr}`"
            variant="meta"
            size="sm"
            :label="`${locale === 'fr' ? dimension.label_fr : dimension.label_en}: ${dimension.value}`" />
        </div>
      </template>

      <template #agency_definition_deleted-cell="{ row }">
        <CommonStatusBadge :variant="row.original.agency_definition_deleted ? 'inactive' : 'active'" />
      </template>

      <template #actions-cell="{ row }">
        <div class="flex justify-end gap-2">
          <CommonActionButton
            v-if="canDeleteChild"
            :aria-label="t('common.delete_named', { name: getActionTarget(row.original) })"
            icon="i-lucide-trash"
            color="error"
            variant="ghost"
            @click="onDelete(row.original.id)" />
        </div>
      </template>
    </CommonResourceLayout>

    <TransferPaymentStreamChartOfAccountModal
      v-if="canUpdateChild"
      v-model="isOpen"
      :action-context="writeContext"
      data-field-container="Composite editor; its individual field declarations own their identities."
      :stream-id="streamId"
      :profile-id="profileId"
      :capture-session="captureSession"
      :close-session="closeSession"
      :refresh-collection="refresh" />
  </div>
</template>
