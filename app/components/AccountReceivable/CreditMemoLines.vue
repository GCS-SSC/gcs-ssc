<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- Credit Memo line modal follows the established Commitment authoring pattern. */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { AccountReceivableCreditMemoLine } from '~~/shared/types/account-receivable'
import { AccountReceivableCreditMemoLineCreateSchema } from '~~/shared/types/schemas/account-receivable'
import { TransferPaymentStreamChartOfAccountDimensionSchema } from '~~/shared/types/schemas/transfer-payment'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { useCrudModal, useCrudModalPending } from '~/composables/useCrudModal'
import { formatAccountingDimensions, getAccountingDimensionSearchValues } from '~~/shared/utils/accounting-dimensions'
import { sumMoney } from '~~/shared/utils/money'
import { formatAccountReceivableAmount } from '~/utils/account-receivable-display'

const { creditMemoId, receivableId, lines, currency, canEdit, canDelete } = defineProps<{
  creditMemoId: string
  receivableId: string
  lines: AccountReceivableCreditMemoLine[]
  currency: string
  canEdit: boolean
  canDelete: boolean
}>()
const emit = defineEmits<{ changed: [] }>()
const { t, locale } = useI18n()
const { createValidator } = useZodI18n()
const { sendJson } = useJsonRequest()
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const toast = useToast()
const { search, pagination } = useTableListState()
type LineForm = {
  egcs_fc_linenumber: number | undefined
  egcs_fc_creditmemochartofaccount: string | undefined
  egcs_fc_amount: string
}
const modal = useCrudModal<AccountReceivableCreditMemoLine, LineForm>({
  createState: () => ({
    egcs_fc_linenumber: Math.max(0, ...lines.map(line => line.egcs_fc_linenumber)) + 1,
    egcs_fc_creditmemochartofaccount: undefined,
    egcs_fc_amount: ''
  }),
  updateState: line => ({
    egcs_fc_linenumber: line.egcs_fc_linenumber,
    egcs_fc_creditmemochartofaccount: line.egcs_fc_creditmemochartofaccount,
    egcs_fc_amount: line.egcs_fc_amount
  })
})
const { selected, isOpen } = modal
const selectedLineId: Ref<string | null> = ref(null)
const pending = useCrudModalPending(modal.captureSession)
const { isPending } = pending
let disposed = false
onBeforeUnmount(() => {
  disposed = true
  modal.close()
})
watch(() => `${creditMemoId}:${receivableId}`, () => {
  modal.close()
  search.value = ''
  pagination.value.pageIndex = 0
}, { flush: 'sync' })
watch(() => canEdit, allowed => {
  if (!allowed) modal.close()
}, { flush: 'sync' })
watch(search, () => {
  pagination.value.pageIndex = 0
})
const dimensions = (line: AccountReceivableCreditMemoLine) => TransferPaymentStreamChartOfAccountDimensionSchema.array().parse(line.egcs_fc_creditmemoaccountingdimensions)
const filtered = computed(() => {
  const query = search.value.trim().toLowerCase()
  return lines.filter(line => !query || [line.egcs_fc_linenumber, line.egcs_fc_amount,
    ...getAccountingDimensionSearchValues(dimensions(line))]
    .some(value => String(value).toLowerCase().includes(query)))
})
watch(() => filtered.value.length, count => {
  pagination.value.pageIndex = Math.min(pagination.value.pageIndex, Math.max(0, Math.ceil(count / pagination.value.pageSize) - 1))
})
const total = computed(() => sumMoney(lines.map(line => line.egcs_fc_amount)))
const columns: TableColumnInput<AccountReceivableCreditMemoLine>[] = [
  { accessorKey: 'egcs_fc_linenumber', headerKey: 'account_receivable.credit_memo_line_number' },
  { id: 'coding', headerKey: 'account_receivable.credit_memo_coding' },
  { id: 'amount', headerKey: 'account_receivable.credit_memo_amount' },
  { id: 'actions', headerKey: 'common.actions' }
]
const openCreate = () => {
  if (!canEdit) return
  selectedLineId.value = null
  modal.openCreate()
}
const openEdit = (line: AccountReceivableCreditMemoLine) => {
  if (!canEdit) return
  selectedLineId.value = line.id
  modal.openUpdate(line)
}
const save = async () => {
  if (!selected.value || !canEdit || disposed) return
  const session = modal.captureSession()
  if (!pending.begin(session)) return
  const owner = creditMemoId
  const line = selected.value
  const lineId = selectedLineId.value
  const updating = lineId !== null
  try {
    const payload = AccountReceivableCreditMemoLineCreateSchema.parse({
      egcs_fc_linenumber: line.egcs_fc_linenumber,
      egcs_fc_creditmemochartofaccount: line.egcs_fc_creditmemochartofaccount,
      egcs_fc_amount: line.egcs_fc_amount
    })
    await sendJson(`/api/account-receivable-credit-memos/${owner}/lines${lineId ? `/${lineId}` : ''}`, updating ? 'PATCH' : 'POST', payload)
    if (disposed || owner !== creditMemoId || !modal.closeSession(session)) return
    emit('changed')
    toast.add({ title: t('common.success'), description: t(updating ? 'common.updated_success' : 'common.added_success'), color: 'success' })
  } catch (failure) {
    if (!disposed && owner === creditMemoId && modal.isCurrentSession(session)) showError(failure)
  } finally {
    pending.end(session)
  }
}
const deleteLine = async (line: AccountReceivableCreditMemoLine) => {
  if (!canDelete || disposed) return
  const owner = creditMemoId
  try {
    if (!await confirmDeleteRequest(`/api/account-receivable-credit-memos/${owner}/lines/${line.id}`)) return
    if (disposed || owner !== creditMemoId) return
    emit('changed')
    toast.add({ title: t('common.success'), description: t('common.deleted_success'), color: 'success' })
  } catch (failure) {
    if (!disposed && owner === creditMemoId) showError(failure)
  }
}
</script>

<template>
  <div class="min-w-0 space-y-4" data-testid="credit-memo-lines">
    <CommonResourceLayoutCard
      v-model:search="search" v-model:pagination="pagination" :data="filtered" :columns="columns"
      :total-records="filtered.length" :pagination-options="{ manualPagination: false }"
      :show-button="canEdit" :button-label="t('account_receivable.credit_memo_add_line')"
      :search-placeholder="t('account_receivable.credit_memo_lines_search')" @add="openCreate">
      <template #coding-cell="{ row }">
        <span class="text-sm whitespace-normal">{{ formatAccountingDimensions(dimensions(row.original), locale === 'fr' ? 'fr' : 'en') || t('account_receivable.coding_not_selected') }}</span>
      </template>
      <template #amount-cell="{ row }">
        <span class="font-semibold tabular-nums">{{ formatAccountReceivableAmount(row.original.egcs_fc_amount, locale, currency) ?? t('common.not_available') }}</span>
      </template>
      <template #actions-cell="{ row }">
        <div class="flex justify-end gap-2">
          <UButton v-if="canEdit" icon="i-lucide-pencil" color="neutral" variant="ghost" :aria-label="`${t('common.edit')}: ${row.original.egcs_fc_linenumber}`" @click="openEdit(row.original)" />
          <UButton v-if="canDelete" icon="i-lucide-trash" color="error" variant="ghost" :aria-label="`${t('common.delete')}: ${row.original.egcs_fc_linenumber}`" @click="deleteLine(row.original)" />
        </div>
      </template>
    </CommonResourceLayoutCard>
    <dl class="flex items-baseline justify-end gap-4 text-sm" data-testid="credit-memo-lines-total">
      <dt class="text-muted">
        {{ t('account_receivable.credit_memo_amount') }}
      </dt>
      <dd class="font-semibold tabular-nums">
        {{ formatAccountReceivableAmount(total, locale, currency) ?? t('common.not_available') }}
      </dd>
    </dl>
    <UModal v-model:open="isOpen" :title="t(selectedLineId ? 'account_receivable.credit_memo_edit_line' : 'account_receivable.credit_memo_add_line')" :ui="{ content: 'sm:max-w-2xl' }">
      <template #body>
        <UForm v-if="selected" :state="selected" :validate="createValidator(AccountReceivableCreditMemoLineCreateSchema)" class="space-y-4" @submit="save">
          <UFormField name="egcs_fc_linenumber" :label="t('account_receivable.credit_memo_line_number')">
            <UInputNumber v-model="selected.egcs_fc_linenumber" :min="1" :max="32767" :step="1" :disabled="isPending" class="w-full" />
          </UFormField>
          <UFormField name="egcs_fc_creditmemochartofaccount" :label="t('account_receivable.credit_memo_coding')">
            <CommonServerLookupSelect
              v-model="selected.egcs_fc_creditmemochartofaccount" fetch-url="/api/account-receivable-credit-memos/lookups/chart-of-accounts"
              :query="{ egcs_fc_receivable: receivableId }" selected-values-query-key="selectedIds"
              value-key="id" label-en-key="label_en" label-fr-key="label_fr" :show-value-in-label="false" :disabled="isPending" close-on-select />
          </UFormField>
          <UFormField name="egcs_fc_amount" :label="t('account_receivable.credit_memo_amount')">
            <UInput v-model="selected.egcs_fc_amount" type="text" inputmode="decimal" :disabled="isPending" class="w-full" />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton type="button" color="neutral" variant="ghost" :label="t('common.cancel')" :disabled="isPending" @click="modal.close()" />
            <CommonSaveButton :label="t(selectedLineId ? 'common.update' : 'common.add')" :loading="isPending" :disabled="isPending || !canEdit" />
          </div>
        </UForm>
      </template>
    </UModal>
  </div>
</template>
