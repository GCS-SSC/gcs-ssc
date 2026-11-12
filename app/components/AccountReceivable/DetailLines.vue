<script setup lang="ts">
import { useActionContext } from '~/composables/useActionContext'
import type { CaptureCommittedSettlement, CommittedSettlementResult } from '~/composables/useCommittedSettlement'
import { useFormSession } from '~/composables/useFormSession'
import { moneyMatchesSearch } from '~/utils/money-search'
/* eslint-disable jsdoc/require-jsdoc -- Receivable line modal follows the established Commitment authoring pattern. */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { AdminCommonLookupResponseItem } from '~~/shared/types/admin-common-ui'
import type { AccountReceivableLine } from '~~/shared/types/account-receivable'
import { AccountReceivableLineCreateSchema, AccountReceivableLinePatchSchema, AccountReceivableRecodeSchema } from '~~/shared/types/schemas/account-receivable'
import { TransferPaymentStreamChartOfAccountDimensionSchema } from '~~/shared/types/schemas/transfer-payment'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { useCrudModal, useCrudModalPending } from '~/composables/useCrudModal'
import { formatAccountingDimensions, getAccountingDimensionSearchValues } from '~~/shared/utils/accounting-dimensions'
import { compareMoney, parseMoney, zeroMoney, sumMoney, type MoneyInput } from '~~/shared/utils/money'
import { formatAccountReceivableAmount } from '~/utils/account-receivable-display'

const { accountReceivableId, lines, currency, fiscalYearId, isAdjustment, canEdit, canDelete, canUpdate, resourcePending = false, captureCommitted, removeLine } = defineProps<{
  accountReceivableId: string
  fiscalYearId: string
  isAdjustment: boolean
  lines: AccountReceivableLine[]
  currency: string
  canEdit: boolean
  canDelete: boolean
  captureCommitted: CaptureCommittedSettlement
  removeLine: (lineId: string, shouldProceed: () => boolean) => Promise<CommittedSettlementResult | null>
  canUpdate: boolean
  resourcePending?: boolean
}>()
const { canAny } = useAuth()
const { t, locale } = useI18n()
const { createValidator } = useZodI18n()
const { sendJson } = useJsonRequest()
const { showError } = useApiErrorToast()
const toast = useLocalizedToast()
const { search, pagination } = useTableListState()
type LineForm = {
  egcs_fc_sourcekey: string | undefined
  egcs_fc_originalline: string | undefined
  egcs_fc_accountreceivablechartofaccount: string | undefined
  egcs_fc_amount: MoneyInput
}
const modal = useCrudModal<AccountReceivableLine, LineForm>({
  createState: () => ({
    egcs_fc_sourcekey: undefined,
    egcs_fc_originalline: undefined,
    egcs_fc_accountreceivablechartofaccount: undefined,
    egcs_fc_amount: undefined
  }),
  updateState: line => ({
    egcs_fc_sourcekey: line.egcs_fc_sourcekey,
    egcs_fc_originalline: line.egcs_fc_originalline ?? undefined,
    egcs_fc_accountreceivablechartofaccount: line.egcs_fc_accountreceivablechartofaccount ?? undefined,
    egcs_fc_amount: line.egcs_fc_amount
  })
})
const { selected, isOpen } = modal
type LineOperation = { kind: 'create' } | { kind: 'edit' | 'recode'; lineId: string }
const operation: Ref<LineOperation> = ref({ kind: 'create' })
const selectedLineId = computed(() => operation.value.kind === 'create' ? null : operation.value.lineId)
const recodeMode = computed(() => operation.value.kind === 'recode')
const lineValidator = computed(() => createValidator(recodeMode.value ? AccountReceivableRecodeSchema.passthrough() : AccountReceivableLineCreateSchema))
const pending = useCrudModalPending(modal.captureSession)
const { isPending } = pending
const removePending: Ref<Set<string>> = ref(new Set())
const removeKey = (line: AccountReceivableLine) => `${accountReceivableId}:${line.id}`
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
  return lines.filter(line => !query || moneyMatchesSearch(line.egcs_fc_amount, query, locale.value) || [line.egcs_fc_sourcekey,
    ...getAccountingDimensionSearchValues(dimensions(line))]
    .some(value => String(value).toLowerCase().includes(query)))
})
watch(() => filtered.value.length, count => {
  pagination.value.pageIndex = Math.min(pagination.value.pageIndex, Math.max(0, Math.ceil(count / pagination.value.pageSize) - 1))
})
const codingRequired = computed(() => {
  if (recodeMode.value) return true
  try {
    return compareMoney(parseMoney(selected.value?.egcs_fc_amount), zeroMoney(currency)) !== 0
  } catch {
    return false
  }
})
const total = computed(() => sumMoney(lines.map(line => line.egcs_fc_amount), currency))
const columns: TableColumnInput<AccountReceivableLine>[] = [
  { id: 'lineNumber', headerKey: 'account_receivable.line_number' },
  { id: 'coding', headerKey: 'account_receivable.receivable_account' },
  { id: 'amount', headerKey: 'account_receivable.established_amount' },
  { id: 'actions', headerKey: 'common.actions' }
]
const lineNumber = (line: AccountReceivableLine) => lines.findIndex(item => item.id === line.id) + 1
const openCreate = () => {
  if (!canEdit || resourcePending) return
  operation.value = { kind: 'create' }
  modal.openCreate()
}
const openEdit = (line: AccountReceivableLine) => {
  if (!canEdit || resourcePending) return
  operation.value = { kind: 'edit', lineId: line.id }
  modal.openUpdate(line)
}
const openRecode = (line: AccountReceivableLine) => {
  if (!canUpdate || !isAdjustment || !line.egcs_fc_accountreceivablechartofaccount || resourcePending) return
  if (!canEdit) {
    toast.add({ title: toast.localized('common.warning'), description: toast.localized('account_receivable.work_prerequisite'), color: 'warning' })
    return
  }
  operation.value = { kind: 'recode', lineId: line.id }
  modal.openUpdate(line)
  selected.value!.egcs_fc_accountreceivablechartofaccount = undefined
}
const resolveSource = (items: AdminCommonLookupResponseItem[]) => {
  if (!selected.value || selectedLineId.value || !isAdjustment) return
  const source = items.find(item => item.id === selected.value?.egcs_fc_originalline)
  selected.value.egcs_fc_sourcekey = typeof source?.egcs_fc_sourcekey === 'string' ? source.egcs_fc_sourcekey : undefined
  selected.value.egcs_fc_accountreceivablechartofaccount = typeof source?.egcs_fc_accountreceivablechartofaccount === 'string' ? source.egcs_fc_accountreceivablechartofaccount : undefined
}
const actionContext = useActionContext({
  identity: [() => accountReceivableId, () => fiscalYearId, () => currency, () => isAdjustment],
  authority: () => canAny('account_receivable', 'update'),
  eligible: () => canEdit && canUpdate
})
const save = async () => {
  const capturedAction = actionContext.capture()
  const committed = captureCommitted()
  if (!capturedAction?.canDispatch() || !committed?.canDispatch()) return
  if (!selected.value || !canEdit || disposed || resourcePending) return
  const session = modal.captureSession()
  if (!pending.begin(session)) return
  const owner = accountReceivableId
  const line = selected.value
  const lineId = selectedLineId.value
  const updating = lineId !== null
  const recoding = recodeMode.value
  try {
    try {
      const payload = recoding
        ? AccountReceivableRecodeSchema.parse({ egcs_fc_accountreceivablechartofaccount: line.egcs_fc_accountreceivablechartofaccount })
        : (updating ? AccountReceivableLinePatchSchema : AccountReceivableLineCreateSchema).parse({
            ...(updating ? {} : { egcs_fc_sourcekey: line.egcs_fc_sourcekey, ...(isAdjustment ? { egcs_fc_originalline: line.egcs_fc_originalline } : {}) }),
            egcs_fc_accountreceivablechartofaccount: line.egcs_fc_accountreceivablechartofaccount ?? undefined,
            egcs_fc_amount: line.egcs_fc_amount
          })
      if (!capturedAction.canDispatch() || !committed.canDispatch()) return
      await sendJson(`/api/account-receivables/${owner}/lines${lineId ? `/${lineId}` : ''}${recoding ? '/recode' : ''}`, recoding || !updating ? 'POST' : 'PATCH', payload)
    } catch (failure) {
      if (capturedAction.isCurrent() && !disposed && modal.isCurrentSession(session)) showError(failure)
      return
    }
    const closed = capturedAction.isCurrent() && !disposed && modal.closeSession(session)
    const settlement = await committed.settle()
    if (!closed || settlement.kind !== 'refreshed' || !capturedAction.isCurrent() || disposed || !modal.isLatestSession(session)) return
    toast.add({ title: toast.localized('common.success'), description: toast.localized(updating ? 'common.updated_success' : 'common.added_success'), color: 'success' })
  } finally {
    pending.end(session)
  }
}
const removeCoding = async (line: AccountReceivableLine) => {
  if (!canUpdate || !isAdjustment || disposed || resourcePending) return
  if (!canEdit) {
    toast.add({ title: toast.localized('common.warning'), description: toast.localized('account_receivable.work_prerequisite'), color: 'warning' })
    return
  }
  const capturedAction = actionContext.capture()
  const committed = captureCommitted()
  if (!capturedAction?.canDispatch() || !committed?.canDispatch()) return
  const owner = accountReceivableId
  const requestKey = removeKey(line)
  if (removePending.value.has(requestKey)) return
  removePending.value.add(requestKey)
  try {
    try {
      if (!capturedAction.canDispatch() || !committed.canDispatch()) return
      await sendJson(`/api/account-receivables/${owner}/lines/${line.id}/remove-coding`, 'POST', {})
    } catch (failure) {
      if (capturedAction.isCurrent() && !disposed && owner === accountReceivableId) showError(failure)
      return
    }
    await committed.settle()
  } finally {
    removePending.value.delete(requestKey)
  }
}
const deleteLine = async (line: AccountReceivableLine) => {
  if (!canDelete || disposed || resourcePending) return
  const owner = accountReceivableId
  try {
    const settlement = await removeLine(line.id, () => !disposed && owner === accountReceivableId && !resourcePending)
    if (settlement?.kind !== 'refreshed' || disposed || owner !== accountReceivableId) return
    toast.add({ title: toast.localized('common.success'), description: toast.localized('common.deleted_success'), color: 'success' })
  } catch (failure) {
    if (!disposed && owner === accountReceivableId) showError(failure)
  }
}
const formSession = useFormSession({ owner: modal, action: { kind: 'remote', context: actionContext }, submit: save })
</script>

<template>
  <div class="min-w-0 space-y-4" data-testid="account-receivable-lines" data-field-tooltip-context="agreement" data-field-scope="account-receivable.detail-lines" data-scope-label-en="Agreements > Receivables > Lines" data-scope-label-fr="Ententes > Créances > Lignes">
    <CommonResourceLayout
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
        <span class="font-semibold tabular-nums">{{ formatAccountReceivableAmount(row.original.egcs_fc_amount, locale) ?? t('common.not_available') }}</span>
      </template>
      <template #actions-cell="{ row }">
        <div class="flex justify-end gap-2">
          <CommonActionButton v-if="canEdit" icon="i-lucide-pencil" color="neutral" variant="ghost" :aria-label="`${t('common.edit')}: ${t('account_receivable.line_number')} ${lineNumber(row.original)}`" @click="openEdit(row.original)" />
          <CommonActionButton v-if="canUpdate && isAdjustment && row.original.egcs_fc_accountreceivablechartofaccount" icon="i-lucide-arrow-right-left" color="neutral" variant="ghost" :aria-label="`${t('account_receivable.move_coding')}: ${t('account_receivable.line_number')} ${lineNumber(row.original)}`" @click="openRecode(row.original)" />
          <CommonActionButton v-if="canUpdate && isAdjustment && row.original.egcs_fc_accountreceivablechartofaccount" icon="i-lucide-minus" color="neutral" variant="ghost" :loading="removePending.has(removeKey(row.original))" :disabled="removePending.has(removeKey(row.original))" :aria-label="`${t('account_receivable.remove_coding_line')}: ${t('account_receivable.line_number')} ${lineNumber(row.original)}`" @click="removeCoding(row.original)" />
          <CommonActionButton v-if="canDelete" icon="i-lucide-trash" color="error" variant="ghost" :aria-label="`${t('common.delete')}: ${t('account_receivable.line_number')} ${lineNumber(row.original)}`" @click="deleteLine(row.original)" />
        </div>
      </template>
    </CommonResourceLayout>
    <dl class="flex items-baseline justify-end gap-4 text-sm" data-testid="account-receivable-lines-total">
      <dt class="text-muted">
        {{ t('account_receivable.established_amount') }}
      </dt>
      <dd class="font-semibold tabular-nums">
        {{ formatAccountReceivableAmount(total, locale) ?? t('common.not_available') }}
      </dd>
    </dl>
    <UModal v-model:open="isOpen" data-help-view="casework.account-receivable.detail-lines.is-open" :title="t(recodeMode ? 'account_receivable.move_coding' : selectedLineId ? 'account_receivable.edit_line' : 'account_receivable.add_line')" :ui="{ content: 'sm:max-w-2xl' }">
      <template #body>
        <UForm v-if="selected" v-bind="formSession" :state="selected" :validate="lineValidator" :disabled="resourcePending || isPending" class="space-y-4">
          <p v-if="recodeMode" class="text-sm text-muted">
            {{ t('account_receivable.move_coding_instruction') }}
          </p>
          <UFormField v-if="!selectedLineId && isAdjustment" name="egcs_fc_originalline" data-field-scope="account-receivable.detail-lines" data-scope-label-en="Agreements > Receivables > Adjustment lines" data-scope-label-fr="Ententes > Créances > Lignes d’ajustement" :label="t('account_receivable.source')" required>
            <CommonServerLookupSelect v-model="selected.egcs_fc_originalline" :fetch-url="`/api/account-receivables/${accountReceivableId}/lookups/sources`" selected-values-query-key="selectedIds" value-key="id" label-en-key="label_en" label-fr-key="label_fr" :show-value-in-label="false" :disabled="isPending" close-on-select @resolved-items="resolveSource" />
          </UFormField>
          <UFormField v-else-if="!selectedLineId" name="egcs_fc_sourcekey" :label="t('account_receivable.source')" required>
            <CommonServerLookupSelect v-model="selected.egcs_fc_sourcekey" :fetch-url="`/api/account-receivables/${accountReceivableId}/lookups/sources`" selected-values-query-key="selectedIds" value-key="id" label-en-key="label_en" label-fr-key="label_fr" :show-value-in-label="false" :disabled="isPending" close-on-select />
          </UFormField>
          <UFormField name="egcs_fc_accountreceivablechartofaccount" :label="t('account_receivable.receivable_account')" :required="codingRequired">
            <CommonServerLookupSelect
              v-model="selected.egcs_fc_accountreceivablechartofaccount" :fetch-url="`/api/account-receivables/${accountReceivableId}/lookups/charts`"
              :query="{ egcs_fc_agencyfiscalyear: fiscalYearId }" selected-values-query-key="selectedIds"
              value-key="id" label-en-key="label_en" label-fr-key="label_fr" :show-value-in-label="false" :disabled="isPending" close-on-select />
          </UFormField>
          <UFormField v-if="!recodeMode" name="egcs_fc_amount" :label="t('common.amount')">
            <CommonCurrencyInput v-model="selected.egcs_fc_amount" :currency="currency" :disabled="isPending" class="w-full" />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton data-help-target="casework.account-receivable.detail-lines.is-open.common-cancel" type="button" color="neutral" variant="ghost" :label="t('common.cancel')" :disabled="isPending" @click="modal.close()" />
            <CommonSaveButton data-help-target="casework.account-receivable.detail-lines.is-open.save" :label="t(recodeMode ? 'account_receivable.move_coding' : selectedLineId ? 'common.update' : 'common.add')" :loading="isPending" :disabled="isPending || !canEdit" />
          </div>
        </UForm>
      </template>
    </UModal>
  </div>
</template>
