<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- Receivable line modal follows the established Commitment authoring pattern. */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { AdminCommonLookupResponseItem } from '~~/shared/types/admin-common-ui'
import type { AccountReceivableLine } from '~~/shared/types/account-receivable'
import { AccountReceivableLineCreateSchema, AccountReceivableLinePatchSchema } from '~~/shared/types/schemas/account-receivable'
import { TransferPaymentStreamChartOfAccountDimensionSchema } from '~~/shared/types/schemas/transfer-payment'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { useCrudModal, useCrudModalPending } from '~/composables/useCrudModal'
import { formatAccountingDimensions, getAccountingDimensionSearchValues } from '~~/shared/utils/accounting-dimensions'
import { moneyToCents, parseMoneyText, sumMoney } from '~~/shared/utils/money'
import { formatAccountReceivableAmount } from '~/utils/account-receivable-display'

const { accountReceivableId, lines, currency, fiscalYearId, isAdjustment, canEdit, canDelete } = defineProps<{
  accountReceivableId: string
  fiscalYearId: string
  isAdjustment: boolean
  lines: AccountReceivableLine[]
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
  egcs_fc_sourcekey: string | undefined
  egcs_fc_originalline: string | undefined
  egcs_fc_accountreceivablechartofaccount: string | undefined
  egcs_fc_amount: string
}
const modal = useCrudModal<AccountReceivableLine, LineForm>({
  createState: () => ({
    egcs_fc_sourcekey: undefined,
    egcs_fc_originalline: undefined,
    egcs_fc_accountreceivablechartofaccount: undefined,
    egcs_fc_amount: ''
  }),
  updateState: line => ({
    egcs_fc_sourcekey: line.egcs_fc_sourcekey,
    egcs_fc_originalline: line.egcs_fc_originalline ?? undefined,
    egcs_fc_accountreceivablechartofaccount: line.egcs_fc_accountreceivablechartofaccount ?? undefined,
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
watch(() => accountReceivableId, () => {
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
const dimensions = (line: AccountReceivableLine) => TransferPaymentStreamChartOfAccountDimensionSchema.array().parse(line.egcs_fc_accountreceivableaccountingdimensions)
const filtered = computed(() => {
  const query = search.value.trim().toLowerCase()
  return lines.filter(line => !query || [line.egcs_fc_sourcekey, line.egcs_fc_amount,
    ...getAccountingDimensionSearchValues(dimensions(line))]
    .some(value => String(value).toLowerCase().includes(query)))
})
watch(() => filtered.value.length, count => {
  pagination.value.pageIndex = Math.min(pagination.value.pageIndex, Math.max(0, Math.ceil(count / pagination.value.pageSize) - 1))
})
const codingRequired = computed(() => {
  try {
    return moneyToCents(parseMoneyText(selected.value?.egcs_fc_amount ?? '')) !== BigInt(0)
  } catch {
    return false
  }
})
const total = computed(() => sumMoney(lines.map(line => line.egcs_fc_amount)))
const columns: TableColumnInput<AccountReceivableLine>[] = [
  { id: 'lineNumber', headerKey: 'account_receivable.line_number' },
  { id: 'coding', headerKey: 'account_receivable.receivable_account' },
  { id: 'amount', headerKey: 'account_receivable.established_amount' },
  { id: 'actions', headerKey: 'common.actions' }
]
const lineNumber = (line: AccountReceivableLine) => lines.findIndex(item => item.id === line.id) + 1
const openCreate = () => {
  if (!canEdit) return
  selectedLineId.value = null
  modal.openCreate()
}
const openEdit = (line: AccountReceivableLine) => {
  if (!canEdit) return
  selectedLineId.value = line.id
  modal.openUpdate(line)
}
const resolveSource = (items: AdminCommonLookupResponseItem[]) => {
  if (!selected.value || selectedLineId.value || !isAdjustment) return
  const source = items.find(item => item.id === selected.value?.egcs_fc_originalline)
  selected.value.egcs_fc_sourcekey = typeof source?.egcs_fc_sourcekey === 'string' ? source.egcs_fc_sourcekey : undefined
  selected.value.egcs_fc_accountreceivablechartofaccount = typeof source?.egcs_fc_accountreceivablechartofaccount === 'string' ? source.egcs_fc_accountreceivablechartofaccount : undefined
}
const save = async () => {
  if (!selected.value || !canEdit || disposed) return
  const session = modal.captureSession()
  if (!pending.begin(session)) return
  const owner = accountReceivableId
  const line = selected.value
  const lineId = selectedLineId.value
  const updating = lineId !== null
  try {
    const payload = (updating ? AccountReceivableLinePatchSchema : AccountReceivableLineCreateSchema).parse({
      ...(updating ? {} : { egcs_fc_sourcekey: line.egcs_fc_sourcekey, ...(isAdjustment ? { egcs_fc_originalline: line.egcs_fc_originalline } : {}) }),
      egcs_fc_accountreceivablechartofaccount: line.egcs_fc_accountreceivablechartofaccount ?? undefined,
      egcs_fc_amount: line.egcs_fc_amount
    })
    await sendJson(`/api/account-receivables/${owner}/lines${lineId ? `/${lineId}` : ''}`, updating ? 'PATCH' : 'POST', payload)
    if (disposed || owner !== accountReceivableId || !modal.closeSession(session)) return
    emit('changed')
    toast.add({ title: t('common.success'), description: t(updating ? 'common.updated_success' : 'common.added_success'), color: 'success' })
  } catch (failure) {
    if (!disposed && owner === accountReceivableId && modal.isCurrentSession(session)) showError(failure)
  } finally {
    pending.end(session)
  }
}
const deleteLine = async (line: AccountReceivableLine) => {
  if (!canDelete || disposed) return
  const owner = accountReceivableId
  try {
    if (!await confirmDeleteRequest(`/api/account-receivables/${owner}/lines/${line.id}`)) return
    if (disposed || owner !== accountReceivableId) return
    emit('changed')
    toast.add({ title: t('common.success'), description: t('common.deleted_success'), color: 'success' })
  } catch (failure) {
    if (!disposed && owner === accountReceivableId) showError(failure)
  }
}
</script>

<template>
  <div class="min-w-0 space-y-4" data-testid="account-receivable-lines">
    <CommonResourceLayoutCard
      v-model:search="search" v-model:pagination="pagination" :data="filtered" :columns="columns"
      :total-records="filtered.length" :pagination-options="{ manualPagination: false }"
      :show-button="canEdit" :button-label="t('account_receivable.add_line')"
      :search-placeholder="t('account_receivable.lines_search')" @add="openCreate">
      <template #lineNumber-cell="{ row }">
        <span>{{ lineNumber(row.original) }}</span>
      </template>
      <template #coding-cell="{ row }">
        <span class="text-sm whitespace-normal">{{ formatAccountingDimensions(dimensions(row.original), locale === 'fr' ? 'fr' : 'en') || t('account_receivable.coding_not_selected') }}</span>
      </template>
      <template #amount-cell="{ row }">
        <span class="font-semibold tabular-nums">{{ formatAccountReceivableAmount(row.original.egcs_fc_amount, locale, currency) ?? t('common.not_available') }}</span>
      </template>
      <template #actions-cell="{ row }">
        <div class="flex justify-end gap-2">
          <UButton v-if="canEdit" icon="i-lucide-pencil" color="neutral" variant="ghost" :aria-label="`${t('common.edit')}: ${t('account_receivable.line_number')} ${lineNumber(row.original)}`" @click="openEdit(row.original)" />
          <UButton v-if="canDelete" icon="i-lucide-trash" color="error" variant="ghost" :aria-label="`${t('common.delete')}: ${t('account_receivable.line_number')} ${lineNumber(row.original)}`" @click="deleteLine(row.original)" />
        </div>
      </template>
    </CommonResourceLayoutCard>
    <dl class="flex items-baseline justify-end gap-4 text-sm" data-testid="account-receivable-lines-total">
      <dt class="text-muted">
        {{ t('account_receivable.established_amount') }}
      </dt>
      <dd class="font-semibold tabular-nums">
        {{ formatAccountReceivableAmount(total, locale, currency) ?? t('common.not_available') }}
      </dd>
    </dl>
    <UModal v-model:open="isOpen" :title="t(selectedLineId ? 'account_receivable.edit_line' : 'account_receivable.add_line')" :ui="{ content: 'sm:max-w-2xl' }">
      <template #body>
        <UForm v-if="selected" :state="selected" :validate="createValidator(AccountReceivableLineCreateSchema)" class="space-y-4" @submit="save">
          <UFormField v-if="!selectedLineId && isAdjustment" name="egcs_fc_originalline" :label="t('account_receivable.source')" required>
            <CommonServerLookupSelect v-model="selected.egcs_fc_originalline" :fetch-url="`/api/account-receivables/${accountReceivableId}/lookups/sources`" selected-values-query-key="selectedIds" value-key="id" label-en-key="label_en" label-fr-key="label_fr" :show-value-in-label="false" :disabled="isPending" close-on-select @resolved-items="resolveSource" />
          </UFormField>
          <UFormField v-else-if="!selectedLineId" name="egcs_fc_sourcekey" :label="t('account_receivable.source')" required>
            <CommonServerLookupSelect v-model="selected.egcs_fc_sourcekey" :fetch-url="`/api/account-receivables/${accountReceivableId}/lookups/sources`" selected-values-query-key="selectedIds" value-key="id" label-en-key="label_en" label-fr-key="label_fr" :show-value-in-label="false" :disabled="isPending" close-on-select />
          </UFormField>
          <p v-else class="text-sm text-muted">
            {{ t('account_receivable.source') }}: {{ selected.egcs_fc_sourcekey }}
          </p>
          <UFormField name="egcs_fc_accountreceivablechartofaccount" :label="t('account_receivable.receivable_account')" :required="codingRequired">
            <CommonServerLookupSelect
              v-model="selected.egcs_fc_accountreceivablechartofaccount" :fetch-url="`/api/account-receivables/${accountReceivableId}/lookups/charts`"
              :query="{ egcs_fc_agencyfiscalyear: fiscalYearId }" selected-values-query-key="selectedIds"
              value-key="id" label-en-key="label_en" label-fr-key="label_fr" :show-value-in-label="false" :disabled="isPending || isAdjustment" close-on-select />
          </UFormField>
          <UFormField name="egcs_fc_amount" :label="t('account_receivable.established_amount')">
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
