<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- Retained Claim reconciliation follows the AR's draft and stale-request boundaries. */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { z } from 'zod'
import { AccountReceivableClaimReductionSchema } from '~~/shared/types/schemas/account-receivable'
import { NonNegativeMoneySchema } from '~~/shared/types/schemas/money'
import type { AccountReceivableClaimReduction, AccountReceivableClaimReductionChoice } from '~~/shared/types/account-receivable'
import { moneyToCents, parseMoneyText, subtractMoney, sumMoney } from '~~/shared/utils/money'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { formatAccountReceivableAmount } from '~/utils/account-receivable-display'
import { useGroupedTableExpansion, type GroupedTableRow } from '~/composables/useGroupedTableExpansion'
import { useGroupedDisclosureIds } from '~/composables/useGroupedDisclosureIds'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { useLoadRecoveryFocus } from '~/composables/useLoadRecoveryFocus'
import { useCrudModal, useCrudModalPending } from '~/composables/useCrudModal'

const { accountReceivableId, currency, declaredAmount, reductions, canEdit, canUpdate, readOnly = false } = defineProps<{
  accountReceivableId: string
  currency: string
  declaredAmount: string
  reductions: AccountReceivableClaimReduction[]
  canEdit: boolean
  canUpdate: boolean
  readOnly?: boolean
}>()
const emit = defineEmits<{ changed: [] }>()
const { t, locale } = useI18n()
const { createValidator } = useZodI18n()
const { sendJson } = useJsonRequest()
const { showError } = useApiErrorToast()
const toast = useToast()
const { recoveryFocusTarget, focusRecoveredContent } = useLoadRecoveryFocus()
type Choice = AccountReceivableClaimReductionChoice
type DraftLine = { egcs_fc_claimline: string, egcs_fc_amount: string }
const choices: Ref<Choice[]> = ref([])
const state: Ref<{ egcs_fc_lines: DraftLine[] } | null> = ref(null)
const loadStatus: Ref<'pending' | 'success' | 'error'> = ref('pending')
const loadError: Ref<unknown | null> = ref(null)
const draftSchema = z.object({ egcs_fc_claimline: z.string(), egcs_fc_amount: NonNegativeMoneySchema })
const lineModal = useCrudModal<Choice, DraftLine>({
  updateState: choice => ({ egcs_fc_claimline: choice.id, egcs_fc_amount: state.value?.egcs_fc_lines.find(line => line.egcs_fc_claimline === choice.id)?.egcs_fc_amount ?? '0.00' })
})
const selectedLine = lineModal.selected
const isModalOpen = lineModal.isOpen
const modalPending = useCrudModalPending(lineModal.captureSession)
const pending = modalPending.isPending
const selectedChoice = computed(() => choices.value.find(choice => choice.id === selectedLine.value?.egcs_fc_claimline) ?? null)
const pagination = ref({ pageIndex: 0, pageSize: 50 })
const planRequirementError = computed(() => {
  if (readOnly || loadStatus.value !== 'success') return null
  const amounts = reductions.map(reduction => NonNegativeMoneySchema.safeParse(reduction.egcs_fc_amount))
  if (!amounts.length) return 'claim_reduction_required'
  if (amounts.some(amount => !amount.success)) return 'claim_reduction_total'
  const total = sumMoney(amounts.flatMap(amount => amount.success ? [amount.data] : []))
  if (moneyToCents(total) <= BigInt(0)) return 'claim_reduction_required'
  const declared = NonNegativeMoneySchema.safeParse(declaredAmount)
  return !declared.success || moneyToCents(total) !== moneyToCents(declared.data) ? 'claim_reduction_total' : null
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
    return parseMoneyText(state.value?.egcs_fc_lines[row.index]?.egcs_fc_amount ?? '0.00')
  } catch {
    return null
  }
}
const rowAmount = (row: GroupedRow, field: 'reconciled' | 'reduction' | 'balance'): string | null => {
  const lines = isGroupedRow(row) ? getLeafRows(row).map(leaf => leaf.original) : [row.original]
  const values = lines.map(line => {
    if (field === 'reconciled') return line.egcs_fc_reconciledamount
    const reduction = lineReduction(line)
    return reduction === null ? null : field === 'reduction' ? reduction : subtractMoney(line.egcs_fc_reconciledamount, reduction)
  })
  return values.some(value => value === null) ? null : sumMoney(values.filter(value => value !== null))
}
let generation = 0
let disposed = false
const load = async () => {
  const requestGeneration = ++generation
  const owner = accountReceivableId
  loadStatus.value = 'pending'
  loadError.value = null
  try {
    const response = await fetch(getClientRequestUrl(`/api/account-receivables/${owner}/claim-reductions`))
    if (!response.ok) await throwFetchResponseError(response)
    const result = await response.json() as { items: Choice[] }
    if (disposed || requestGeneration !== generation || owner !== accountReceivableId) return
    choices.value = result.items
    state.value = { egcs_fc_lines: result.items.map(choice => ({ egcs_fc_claimline: choice.id,
      egcs_fc_amount: reductions.find(row => row.egcs_fc_claimline === choice.id)?.egcs_fc_amount ?? '0.00' })) }
    if (selectedLine.value && !selectedChoice.value) lineModal.close()
    loadStatus.value = 'success'
  } catch (failure) {
    if (!disposed && requestGeneration === generation && owner === accountReceivableId) {
      loadError.value = failure
      loadStatus.value = 'error'
    }
  }
}
const retryLoad = async () => {
  await load()
  if (!disposed && loadStatus.value === 'success') await focusRecoveredContent()
}
watch(() => accountReceivableId, () => {
  choices.value = []
  state.value = null
  lineModal.close()
  expandedRows.value = true
  pagination.value.pageIndex = 0
  void load()
}, { immediate: true, flush: 'sync' })
watch(() => reductions, () => {
  if (state.value) void load()
})
watch(() => readOnly || !canUpdate || !canEdit, blocked => {
  if (blocked) lineModal.close()
}, { flush: 'sync' })
onBeforeUnmount(() => {
  lineModal.close()
  disposed = true
  generation += 1
})
const format = (amount: string) => formatAccountReceivableAmount(amount, locale.value, currency)
const totalAmount = (field: 'reconciled' | 'reduction' | 'balance') => {
  const values = tableRows.value.map(row => rowAmount({ id: row.id, original: row }, field))
  return values.some(value => value === null) ? t('common.unavailable') : format(sumMoney(values.filter(value => value !== null).map(parseMoneyText)))
}
const formattedAmount = (row: GroupedRow, field: 'reconciled' | 'reduction' | 'balance') => {
  const amount = rowAmount(row, field)
  return amount === null ? t('common.unavailable') : format(amount)
}
const openEdit = (choice: Choice) => {
  if (readOnly || !canUpdate || loadStatus.value !== 'success' || pending.value) return
  if (!canEdit) {
    toast.add({ title: t('common.warning'), description: t('account_receivable.work_prerequisite'), color: 'warning' })
    return
  }
  lineModal.openUpdate(choice)
}
const save = async () => {
  if (!state.value || !selectedLine.value || readOnly || !canUpdate || loadStatus.value !== 'success') return
  if (!canEdit) {
    toast.add({ title: t('common.warning'), description: t('account_receivable.work_prerequisite'), color: 'warning' })
    return
  }
  const session = lineModal.captureSession()
  const owner = accountReceivableId
  if (!modalPending.begin(session)) return
  try {
    const draft = draftSchema.parse(selectedLine.value)
    const lines = state.value.egcs_fc_lines.map(line => line.egcs_fc_claimline === draft.egcs_fc_claimline ? draft : line)
    await sendJson(`/api/account-receivables/${owner}/claim-reductions`, 'PATCH', AccountReceivableClaimReductionSchema.parse({ egcs_fc_lines: lines.filter(line => moneyToCents(NonNegativeMoneySchema.parse(line.egcs_fc_amount)) > BigInt(0)) }))
    if (!disposed && owner === accountReceivableId && lineModal.closeSession(session)) {
      state.value = { egcs_fc_lines: lines }
      emit('changed')
    }
  } catch (failure) {
    if (!disposed && owner === accountReceivableId && lineModal.isCurrentSession(session)) showError(failure)
  } finally {
    modalPending.end(session)
  }
}
</script>

<template>
  <div class="min-w-0">
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
      <CommonResourceLayoutCard
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
      </CommonResourceLayoutCard>
    </div>
    <UModal
      v-if="selectedLine && selectedChoice" v-model:open="isModalOpen"
      :title="t('account_receivable.edit_claim_reduction')" :description="t('common.form_dialog_description')"
      :dismissible="!pending">
      <template #body>
        <p v-if="loadStatus === 'pending'" role="status" aria-live="polite" class="text-sm text-muted">
          {{ t('common.loading_records') }}
        </p>
        <UAlert v-if="loadError" color="error" :title="t('common.resource_table_load_failed')" :description="t('common.resource_table_load_failed_description')">
          <template #actions>
            <UButton :label="t('common.retry')" @click="load" />
          </template>
        </UAlert>
        <UForm :state="selectedLine" :validate="createValidator(draftSchema)" class="space-y-4" @submit="save">
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
            <UButton type="button" :label="t('common.cancel')" color="neutral" variant="ghost" :disabled="pending" @click="lineModal.close()" />
            <CommonSaveButton :label="t('common.save')" :loading="pending" :disabled="pending || loadStatus !== 'success'" />
          </div>
        </UForm>
      </template>
    </UModal>
  </div>
</template>
