<script setup lang="ts">
import type { CaptureCommittedSettlement } from '~/composables/useCommittedSettlement'
import { useActionContext } from '~/composables/useActionContext'
import { useFormSession } from '~/composables/useFormSession'
/* eslint-disable jsdoc/require-jsdoc -- Retained Claim reconciliation follows the AR's draft and stale-request boundaries. */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { z } from 'zod'
import { AccountReceivableClaimReductionSchema } from '~~/shared/types/schemas/account-receivable'
import { NonNegativeMoneySchema } from '~~/shared/types/schemas/money'
import type { AccountReceivableClaimReduction, AccountReceivableClaimReductionChoice } from '~~/shared/types/account-receivable'
import { compareMoney, parseMoney, zeroMoney, subtractMoney, sumMoney, type Money, type MoneyInput } from '~~/shared/utils/money'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { formatAccountReceivableAmount } from '~/utils/account-receivable-display'
import { useGroupedTableExpansion, type GroupedTableRow } from '~/composables/useGroupedTableExpansion'
import { useGroupedDisclosureIds } from '~/composables/useGroupedDisclosureIds'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { useLoadRecoveryFocus } from '~/composables/useLoadRecoveryFocus'
import { useCrudModal, useCrudModalPending } from '~/composables/useCrudModal'
import { useResourceRequest } from '~/composables/useResourceRequest'

const { accountReceivableId, currency, declaredAmount, reductions, canEdit, canUpdate, captureCommitted, pendingReceivables, resourcePending = false, readOnly = false } = defineProps<{
  accountReceivableId: string
  currency: string
  declaredAmount: Money
  reductions: AccountReceivableClaimReduction[]
  canEdit: boolean
  canUpdate: boolean
  captureCommitted: CaptureCommittedSettlement
  pendingReceivables: Set<string>
  resourcePending?: boolean
  readOnly?: boolean
}>()
const emit = defineEmits<{ changed: [] }>()
const { canAny } = useAuth()
const { t, locale } = useI18n()
const { createValidator } = useZodI18n()
const { sendJson } = useJsonRequest()
const { showError } = useApiErrorToast()
const toast = useLocalizedToast()
const { recoveryFocusTarget, focusRecoveredContent } = useLoadRecoveryFocus()
type Choice = AccountReceivableClaimReductionChoice
type DraftLine = { egcs_fc_claimline: string, egcs_fc_amount: MoneyInput }
const state: Ref<{ egcs_fc_lines: DraftLine[] } | null> = ref(null)
const choiceRequest = useResourceRequest<Choice[]>({
  identity: () => accountReceivableId,
  load: async signal => {
    const response = await fetch(getClientRequestUrl(`/api/account-receivables/${accountReceivableId}/claim-reductions`), { signal })
    if (!response.ok) await throwFetchResponseError(response)
    const result = await response.json() as { items: Choice[] }
    return result.items
  }
})
const choices = computed(() => choiceRequest.data.value ?? [])
const loadStatus = choiceRequest.status
const loadError = choiceRequest.error
const draftSchema = z.object({ egcs_fc_claimline: z.string(), egcs_fc_amount: NonNegativeMoneySchema })
const lineModal = useCrudModal<Choice, DraftLine>({
  updateState: choice => ({ egcs_fc_claimline: choice.id, egcs_fc_amount: state.value?.egcs_fc_lines.find(line => line.egcs_fc_claimline === choice.id)?.egcs_fc_amount ?? zeroMoney(currency) })
})
const selectedLine = lineModal.selected
const isModalOpen = lineModal.isOpen
const planPending = computed(() => pendingReceivables.has(accountReceivableId))
const modalPending = useCrudModalPending(lineModal.captureSession)
const pending = modalPending.isPending
const selectedChoice = computed(() => choices.value.find(choice => choice.id === selectedLine.value?.egcs_fc_claimline) ?? null)
const pagination = ref({ pageIndex: 0, pageSize: 50 })
const planRequirementError = computed(() => {
  if (readOnly || loadStatus.value !== 'success') return null
  const amounts = reductions.map(reduction => NonNegativeMoneySchema.safeParse(reduction.egcs_fc_amount))
  if (!amounts.length) return 'claim_reduction_required'
  if (amounts.some(amount => !amount.success)) return 'claim_reduction_total'
  const total = sumMoney(amounts.flatMap(amount => amount.success ? [amount.data] : []), currency)
  if (compareMoney(total, zeroMoney(currency)) <= 0) return 'claim_reduction_required'
  const declared = NonNegativeMoneySchema.safeParse(declaredAmount)
  return !declared.success || compareMoney(total, declared.data) !== 0 ? 'claim_reduction_total' : null
})
const bilingual = (en: string | null, fr: string | null) => (locale.value === 'fr' ? fr || en : en || fr)
const tableRows = computed(() => choices.value.map((choice, index) => ({
  ...choice, index,
  claimGroup: `${t('account_receivable.claim')} ${choice.egcs_fc_claim}`,
  categoryGroup: bilingual(choice.organization_cost_category_name_en, choice.organization_cost_category_name_fr) || choice.egcs_fc_submittedcostcategory || t('agreement.claims.unallocated'),
  subsectionGroup: choice.egcs_fc_costsubsection || choice.egcs_fc_submittedcostsubsection || t('common.all'),
  name: bilingual(choice.line_item_name_en, choice.line_item_name_fr) || choice.egcs_fc_submittedlineitem || t('agreement.claims.unallocated')
})))
type TableRow = typeof tableRows.value[number]
type GroupedRow = GroupedTableRow<TableRow>
const columns = computed<TableColumnInput<TableRow>[]>(() => [
  { id: 'claimGroup', accessorKey: 'claimGroup' },
  { id: 'categoryGroup', accessorKey: 'categoryGroup' },
  { id: 'subsectionGroup', accessorKey: 'subsectionGroup' },
  { id: 'name', accessorKey: 'name', headerKey: 'agreement.budget.line_item' },
  { id: 'reconciled', headerKey: 'agreement.claims.reconciled_amount' },
  { id: 'reduction', headerKey: 'account_receivable.reduction_amount' },
  { id: 'balance', headerKey: 'agreement.claims.balance' },
  ...(canUpdate && !readOnly ? [{ id: 'actions', headerKey: 'common.actions' }] : [])
])
const { expandedRows, grouping, columnVisibility, groupingOptions, expandedOptions, isGroupedRow, getLeafRows, getGroupedRowCount, updateExpandedRows } = useGroupedTableExpansion<TableRow>({
  rows: tableRows, groups: ['claimGroup', 'categoryGroup', 'subsectionGroup'].map(id => ({ id, getValue: row => row[id as 'claimGroup' | 'categoryGroup' | 'subsectionGroup'] }))
})
const { getGroupedDisclosureControlsId, getGroupedDisclosureContentId } = useGroupedDisclosureIds()
const groupLabel = (row: GroupedRow) => row.original[row.groupingColumnId as 'claimGroup' | 'categoryGroup' | 'subsectionGroup']
const lineReduction = (row: TableRow) => {
  try {
    return parseMoney(state.value?.egcs_fc_lines[row.index]?.egcs_fc_amount)
  } catch {
    return null
  }
}
const rowAmount = (row: GroupedRow, field: 'reconciled' | 'reduction' | 'balance'): Money | null => {
  const lines = isGroupedRow(row) ? getLeafRows(row).map(leaf => leaf.original) : [row.original]
  const values = lines.map(line => {
    if (field === 'reconciled') return line.egcs_fc_reconciledamount
    const reduction = lineReduction(line)
    return reduction === null ? null : field === 'reduction' ? reduction : subtractMoney(line.egcs_fc_reconciledamount, reduction)
  })
  return values.some(value => value === null) ? null : sumMoney(values.filter(value => value !== null), currency)
}
watch(choiceRequest.data, items => {
  if (items) {
    state.value = { egcs_fc_lines: items.map(choice => ({ egcs_fc_claimline: choice.id,
      egcs_fc_amount: reductions.find(row => row.egcs_fc_claimline === choice.id)?.egcs_fc_amount ?? zeroMoney(currency) })) }
    if (selectedLine.value && !selectedChoice.value) lineModal.close()
  } else state.value = null
}, { flush: 'sync' })
const load = choiceRequest.refresh
const retryLoad = async () => {
  if (await load()) await focusRecoveredContent()
}
watch(() => accountReceivableId, () => {
  lineModal.close()
  expandedRows.value = true
  pagination.value.pageIndex = 0
}, { immediate: true, flush: 'sync' })
watch(() => reductions, () => {
  if (state.value) void load()
})
watch(() => readOnly || !canUpdate || !canEdit, blocked => {
  if (blocked) lineModal.close()
}, { flush: 'sync' })
onBeforeUnmount(() => {
  lineModal.close()
})
const format = (amount: Money) => formatAccountReceivableAmount(amount, locale.value)
const totalAmount = (field: 'reconciled' | 'reduction' | 'balance') => {
  const values = tableRows.value.map(row => rowAmount({ id: row.id, original: row }, field))
  return values.some(value => value === null) ? t('common.unavailable') : format(sumMoney(values.filter(value => value !== null), currency))
}
const formattedAmount = (row: GroupedRow, field: 'reconciled' | 'reduction' | 'balance') => {
  const amount = rowAmount(row, field)
  return amount === null ? t('common.unavailable') : format(amount)
}
const openEdit = (choice: Choice) => {
  if (readOnly || !canUpdate || resourcePending || loadStatus.value !== 'success' || pending.value) return
  if (!canEdit) {
    toast.add({ title: toast.localized('common.warning'), description: toast.localized('account_receivable.work_prerequisite'), color: 'warning' })
    return
  }
  lineModal.openUpdate(choice)
}
const actionContext = useActionContext({
  identity: [() => accountReceivableId, () => currency],
  authority: () => canAny('account_receivable', 'update') && canUpdate,
  eligible: () => canEdit && !readOnly && !resourcePending
})
const save = async () => {
  const capturedAction = actionContext.capture()
  const committed = captureCommitted()
  if (!capturedAction?.canDispatch() || !committed?.canDispatch()) return
  if (!state.value || !selectedLine.value || readOnly || !canUpdate || resourcePending || loadStatus.value !== 'success' || planPending.value) return
  if (!canEdit) {
    toast.add({ title: toast.localized('common.warning'), description: toast.localized('account_receivable.work_prerequisite'), color: 'warning' })
    return
  }
  const session = lineModal.captureSession()
  const owner = accountReceivableId
  if (!modalPending.begin(session)) return
  pendingReceivables.add(owner)
  try {
    const draft = draftSchema.parse(selectedLine.value)
    const lines = state.value.egcs_fc_lines.map(line => line.egcs_fc_claimline === draft.egcs_fc_claimline ? draft : line)
    const payload = AccountReceivableClaimReductionSchema.parse({ egcs_fc_lines: lines.filter(line => compareMoney(NonNegativeMoneySchema.parse(line.egcs_fc_amount), zeroMoney(currency)) > 0) })
    if (!capturedAction.canDispatch() || !committed.canDispatch()) return
    await sendJson(`/api/account-receivables/${owner}/claim-reductions`, 'PATCH', payload)
    if (capturedAction.isCurrent() && choiceRequest.state.value.kind !== 'disposed' && owner === accountReceivableId) {
      state.value = { egcs_fc_lines: lines }
      lineModal.closeSession(session)
      emit('changed')
    }
    await committed.settle()
  } catch (failure) {
    if (capturedAction.isCurrent() && choiceRequest.state.value.kind !== 'disposed' && owner === accountReceivableId && lineModal.isCurrentSession(session)) showError(failure)
  } finally {
    pendingReceivables.delete(owner)
    modalPending.end(session)
  }
}
const formSession = useFormSession({ owner: lineModal, action: { kind: 'remote', context: actionContext }, submit: save })
</script>

<template>
  <div class="min-w-0" data-field-tooltip-context="agreement" data-field-scope="account-receivable.claim-reductions" data-scope-label-en="Agreements > Receivables > Claim reductions" data-scope-label-fr="Ententes > Créances > Réductions des demandes">
    <p class="mb-4 text-sm text-muted">
      {{ t('account_receivable.claim_reductions_instruction') }}
    </p>
    <p v-if="!readOnly" class="mb-4 text-sm text-muted">
      {{ t('account_receivable.claim_reduction_requirement') }} ({{ t('common.field_required') }})
    </p>
    <UAlert v-if="planRequirementError" class="mb-4" color="warning" :title="t('common.warning')" :description="t(`apiErrors.account_receivable.${planRequirementError}`)" />
    <p v-if="loadStatus === 'pending'" role="status" aria-live="polite" class="text-sm text-muted">
      {{ t('common.loading_records') }}
    </p>
    <UAlert v-if="loadError" color="error" :title="t('common.resource_table_load_failed')" :description="t('common.resource_table_load_failed_description')">
      <template #actions>
        <UButton :label="t('common.retry')" @click="retryLoad" />
      </template>
    </UAlert>
    <div v-else-if="state" ref="recoveryFocusTarget" tabindex="-1" class="outline-none">
      <CommonResourceLayout
        v-model:pagination="pagination"
        :data="tableRows" :columns="columns" :total-records="tableRows.length"
        :show-toolbar="false" :grouping="grouping" :grouping-options="groupingOptions"
        :expanded-options="expandedOptions" :column-visibility="columnVisibility" :expanded="expandedRows"
        @update:expanded="updateExpandedRows">
        <template #name-cell="{ row }">
          <div :id="getGroupedDisclosureContentId(row as GroupedRow)" :style="{ paddingLeft: `${(row.depth ?? 0) * 1.5}rem` }">
            <CommonGroupedDisclosureButton
              v-if="isGroupedRow(row as GroupedRow)"
              class="flex items-center gap-2 text-left font-semibold"
              :expanded="row.getIsExpanded?.() === true" :controls="getGroupedDisclosureControlsId(row.id)"
              :label="groupLabel(row as GroupedRow)" @toggle="row.toggleExpanded?.()">
              <UIcon :name="row.getIsExpanded?.() ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-4" />
              {{ groupLabel(row as GroupedRow) }}
              <CommonStatusBadge variant="count" size="sm" :label="String(getGroupedRowCount(row as GroupedRow))" />
            </CommonGroupedDisclosureButton>
            <div v-else class="min-w-64 whitespace-normal">
              <CommonBilingualName :name-en="row.original.line_item_name_en || row.original.egcs_fc_submittedlineitem || row.original.name" :name-fr="row.original.line_item_name_fr || row.original.egcs_fc_submittedlineitem || row.original.name" />
              <p class="mt-1 text-sm text-muted">
                {{ row.original.egcs_fc_description }}
              </p>
            </div>
          </div>
        </template>
        <template #reconciled-cell="{ row }">
          <span class="tabular-nums">{{ formattedAmount(row as GroupedRow, 'reconciled') }}</span>
        </template>
        <template #reduction-cell="{ row }">
          <span class="tabular-nums">{{ formattedAmount(row as GroupedRow, 'reduction') }}</span>
        </template>
        <template #balance-cell="{ row }">
          <span class="font-semibold tabular-nums text-primary">{{ formattedAmount(row as GroupedRow, 'balance') }}</span>
        </template>
        <template #actions-cell="{ row }">
          <CommonActionButton
            v-if="canUpdate && !readOnly && !isGroupedRow(row as GroupedRow)"
            icon="i-lucide-pencil" color="neutral" variant="ghost" size="sm"
            :aria-label="`${t('common.edit')}: ${row.original.name}`"
            :disabled="pending || loadStatus !== 'success'" @click="openEdit(row.original)" />
        </template>
        <template #footer-left>
          <div class="flex flex-wrap gap-x-4 gap-y-2">
            <span>{{ t('agreement.claims.reconciled_amount') }}: {{ totalAmount('reconciled') }}</span>
            <span>{{ t('account_receivable.reduction_amount') }}: {{ totalAmount('reduction') }}</span>
            <span class="text-primary">{{ t('agreement.claims.balance') }}: {{ totalAmount('balance') }}</span>
          </div>
        </template>
      </CommonResourceLayout>
    </div>
    <UModal
      v-if="selectedLine && selectedChoice"
      v-model:open="isModalOpen" data-help-view="casework.account-receivable.claim-reductions.is-modal-open"
      :title="t('account_receivable.edit_claim_reduction')" :description="t('common.form_dialog_description')"
      :dismissible="!pending">
      <template #body>
        <p v-if="loadStatus === 'pending'" role="status" aria-live="polite" class="text-sm text-muted">
          {{ t('common.loading_records') }}
        </p>
        <UAlert v-if="loadError" color="error" :title="t('common.resource_table_load_failed')" :description="t('common.resource_table_load_failed_description')">
          <template #actions>
            <UButton data-help-target="casework.account-receivable.claim-reductions.is-modal-open.common-retry" :label="t('common.retry')" @click="load" />
          </template>
        </UAlert>
        <UForm v-bind="formSession" :state="selectedLine" :validate="createValidator(draftSchema)" class="space-y-4">
          <p class="font-semibold">
            {{ t('account_receivable.claim') }} {{ selectedChoice.egcs_fc_claim }}
          </p>
          <CommonBilingualName :name-en="selectedChoice.line_item_name_en || selectedChoice.egcs_fc_submittedlineitem || selectedChoice.egcs_fc_description" :name-fr="selectedChoice.line_item_name_fr || selectedChoice.egcs_fc_submittedlineitem || selectedChoice.egcs_fc_description" />
          <p class="text-sm text-muted">
            {{ selectedChoice.egcs_fc_description }}
          </p>
          <p>{{ t('agreement.claims.reconciled_amount') }}: {{ format(selectedChoice.egcs_fc_reconciledamount) }}</p>
          <UFormField name="egcs_fc_amount" :label="t('account_receivable.reduction_amount')" required>
            <CommonCurrencyInput v-model="selectedLine.egcs_fc_amount" :currency="currency" :disabled="pending" />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton data-help-target="casework.account-receivable.claim-reductions.is-modal-open.common-cancel" type="button" :label="t('common.cancel')" color="neutral" variant="ghost" :disabled="pending" @click="lineModal.close()" />
            <CommonSaveButton data-help-target="casework.account-receivable.claim-reductions.is-modal-open.common-save" :label="t('common.save')" :loading="pending" :disabled="pending || planPending || resourcePending || loadStatus !== 'success'" />
          </div>
        </UForm>
      </template>
    </UModal>
  </div>
</template>
