<script setup lang="ts">
import { usePageResourceError } from '~/composables/usePageResourceError'
import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { FetchError } from 'ofetch'
import { nanoid } from 'nanoid'
import type { JournalVoucherAllocationDraft, JournalVoucherDetail } from '~~/shared/types/journal-voucher'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { JournalVoucherAllocationSchema, JournalVoucherEditSchema } from '~~/shared/types/schemas/journal-voucher'
import CommonCompletionPanel from '~/components/Common/Completions/Panel.vue'
import { formatAccountingDimensions } from '~~/shared/utils/accounting-dimensions'
import { formatMoneyText, sumMoney, subtractMoney, parseMoneyText } from '~~/shared/utils/money'
import type { Money } from '~~/shared/utils/money'

definePageMeta({ key: route => route.path, i18n: { paths: { en: '/journal-vouchers/[id]', fr: '/pieces-de-journal/[id]' } } })
const { t, locale } = useI18n()
const route = useRoute()
const localePath = useLocalePath()
const { getHeroCollapsed } = useDashboard()
const { createValidator } = useZodI18n()
const { showError } = useApiErrorToast()
const toast = useToast()
const { sendJson } = useJsonRequest()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const id = String(route.params.id)
const isHeroCollapsed = getHeroCollapsed('journal-voucher-detail')
const selectedTab: Ref<string> = ref('entry')
const refreshKey: Ref<number> = ref(0)
const saving: Ref<boolean> = ref(false)
const { data: voucher, error, status, refresh } = useFetch<JournalVoucherDetail, FetchError, string>(`/api/journal-vouchers/${id}`)
usePageResourceError({ identity: () => route.path, errors: [error], pending: () => status.value === 'pending', hasContent: () => Boolean(voucher.value) })
type FormState = {
  egcs_fc_requesteddate: string | Date | null
  egcs_fc_narrative_en: string
  egcs_fc_narrative_fr: string
  egcs_fc_allocations: JournalVoucherAllocationDraft[]
}
const state: Ref<FormState | null> = ref(null)
watch(voucher, current => {
  if (!current) return
  state.value = {
    egcs_fc_requesteddate: current.egcs_fc_requesteddate.slice(0, 10),
    egcs_fc_narrative_en: current.egcs_fc_narrative_en, egcs_fc_narrative_fr: current.egcs_fc_narrative_fr,
    egcs_fc_allocations: current.egcs_fc_lines.filter(line => line.egcs_fc_kind === 'corrected').map(line => ({
      key: nanoid(), egcs_fc_commitmentline: line.egcs_fc_commitmentline,
      egcs_fc_chartofaccount: line.egcs_fc_chartofaccount, egcs_fc_amount: line.egcs_fc_amount,
      egcs_fc_accountingdimensions: line.egcs_fc_accountingdimensions.map(dimension => ({ ...dimension })),
      egcs_fc_agreementcodingmatched: line.egcs_fc_agreementcodingmatched
    }))
  }
}, { immediate: true })
const tabs = [
  { key: 'journal_voucher.accounting_entry', value: 'entry', icon: 'i-lucide-book-open-check' },
  { key: 'journal_voucher.completion.title', value: 'completion', icon: 'i-lucide-circle-check-big' },
  { key: 'reviews.title', value: 'reviews', icon: 'i-lucide-clipboard-check' },
  { key: 'workflow.title', value: 'workflows', icon: 'i-lucide-workflow' },
  { key: 'attachments.title', value: 'attachments', icon: 'i-lucide-paperclip' },
  { key: 'assignments.title', value: 'assignments', icon: 'i-lucide-users' }
]
const original = computed(() => voucher.value?.egcs_fc_lines.filter(line => line.egcs_fc_kind === 'original') ?? [])
const canEditAllocations = computed(() => Boolean(voucher.value?.egcs_fc_canedit && !voucher.value.egcs_fc_reversalof) && !saving.value)
const allocationModal = useCrudModal<JournalVoucherAllocationDraft, JournalVoucherAllocationDraft>({
  /**
   * Initializes a new split from the retained source allocation.
   * @returns A separate allocation draft for the modal.
   */
  createState: () => ({
    key: nanoid(), egcs_fc_commitmentline: original.value[0]!.egcs_fc_commitmentline,
    egcs_fc_chartofaccount: original.value[0]!.egcs_fc_chartofaccount, egcs_fc_amount: '0.00',
    egcs_fc_accountingdimensions: original.value[0]!.egcs_fc_accountingdimensions.map(dimension => ({ ...dimension })),
    egcs_fc_agreementcodingmatched: original.value[0]!.egcs_fc_agreementcodingmatched
  }),
  updateState: line => ({ ...line, egcs_fc_accountingdimensions: line.egcs_fc_accountingdimensions.map(dimension => ({ ...dimension })) })
})
const isEditingAllocation = computed(() => Boolean(state.value?.egcs_fc_allocations.some(line => line.key === allocationModal.selected.value?.key)))
watch([voucher, selectedTab], () => allocationModal.close())
const formatAmount = (amount: string) => formatMoneyText(parseMoneyText(amount), locale.value, voucher.value?.egcs_fc_currency ?? 'cad')
const balances = computed(() => [...new Set(original.value.map(line => line.egcs_fc_commitmentline))].map(commitmentId => {
  const rows = original.value.filter(line => line.egcs_fc_commitmentline === commitmentId)
  const total = sumMoney(rows.map(line => line.egcs_fc_amount))
  let corrected: Money | null = null
  try {
    corrected = sumMoney((state.value?.egcs_fc_allocations ?? []).filter(line => line.egcs_fc_commitmentline === commitmentId)
      .map(line => JournalVoucherAllocationSchema.shape.egcs_fc_amount.parse(line.egcs_fc_amount)))
  } catch {
    // Keep invalid input visible without rounding.
  }
  return {
    id: commitmentId, number: rows[0]!.egcs_fc_commitmentlinenumber,
    delta: corrected === null ? null : subtractMoney(corrected, total), balanced: total === corrected
  }
}))
type AccountingRow = { key: string; number: number } & (
  | { kind: 'original'; line: JournalVoucherDetail['egcs_fc_lines'][number] }
  | { kind: 'corrected'; line: FormState['egcs_fc_allocations'][number]; index: number }
  | { kind: 'subtotal'; delta: Money | null; balanced: boolean }
)
const accountingRows = computed<AccountingRow[]>(() => balances.value.flatMap(balance => {
  const rows: AccountingRow[] = original.value.filter(line => line.egcs_fc_commitmentline === balance.id)
    .map(line => ({ key: `original-${line.id}`, number: balance.number, kind: 'original', line }))
  state.value?.egcs_fc_allocations.forEach((line, index) => {
    if (line.egcs_fc_commitmentline === balance.id) rows.push({ key: line.key, number: balance.number, kind: 'corrected', line, index })
  })
  if (balances.value.length > 1) rows.push({ key: `subtotal-${balance.id}`, number: balance.number, kind: 'subtotal', delta: balance.delta, balanced: balance.balanced })
  return rows
}))
const balanceTotal = computed(() => balances.value.some(balance => balance.delta === null)
  ? null
  : sumMoney(balances.value.map(balance => balance.delta!)))
const allBalanced = computed(() => balances.value.length > 0 && balances.value.every(balance => balance.balanced))
const originalRowAccent = (cell: { row: { original: AccountingRow } }) => cell.row.original.kind === 'original' ? 'bg-primary/5' : ''
const accountingColumnDefinitions: TableColumnInput<AccountingRow>[] = [
  { id: 'commitment', headerKey: 'journal_voucher.commitment_line', footer: () => t('common.total'),
    meta: { class: { td: cell => `${originalRowAccent(cell)} border-l-2 ${cell.row.original.kind === 'original' ? 'border-l-primary/50' : 'border-l-transparent'}` } } },
  { id: 'coding', headerKey: 'journal_voucher.coding', meta: { class: { td: originalRowAccent } } },
  { id: 'amount', headerKey: 'journal_voucher.amount', meta: { class: { th: 'text-right', td: cell => `${originalRowAccent(cell)} text-right` } } },
  { id: 'actions', headerKey: 'common.actions', meta: { class: { th: 'text-right', td: originalRowAccent } } }
]
const accountingColumns = useTableColumns(accountingColumnDefinitions)
const deleteDraft = async () => {
  if (await confirmDeleteRequest(`/api/journal-vouchers/${id}`)) await navigateTo(localePath('/journal-vouchers'))
}
const breadcrumbs = computed(() => [
  { label: t('journal_voucher.title'), to: localePath('/journal-vouchers') },
  { label: voucher.value?.egcs_fc_agreementnumber ?? '', to: voucher.value?.egcs_fc_sourcereadable ? localePath(`/agreements/${voucher.value.egcs_fc_fundingagreement}`) : undefined },
  { label: `${t('journal_voucher.number')} ${voucher.value?.egcs_fc_number ?? ''}` }
])
const refreshPage = async () => {
  await refresh()
  refreshKey.value += 1
}
/**
 *
 */
const save = async () => {
  if (!state.value || saving.value) return
  saving.value = true
  try {
    const payload = { ...state.value, egcs_fc_allocations: state.value.egcs_fc_allocations.map(line => ({
      egcs_fc_commitmentline: line.egcs_fc_commitmentline, egcs_fc_chartofaccount: line.egcs_fc_chartofaccount, egcs_fc_amount: line.egcs_fc_amount
    })) }
    await sendJson(`/api/journal-vouchers/${id}`, 'PATCH', payload)
    await refreshPage()
    toast.add({ title: t('common.success'), description: t('common.updated_success'), color: 'success' })
  } catch (failure) {
    showError(failure)
  } finally { saving.value = false }
}
/**
 *
 * @param kind Linked correction operation.
 */
const prepareLinked = async (kind: 'reversal' | 'replacement') => {
  if (!voucher.value || saving.value) return
  saving.value = true
  try {
    const header = { egcs_fc_requesteddate: new Date().toISOString().slice(0, 10), egcs_fc_narrative_en: '', egcs_fc_narrative_fr: '' }
    const created = kind === 'reversal'
      ? await sendJson<{ id: string }>(`/api/journal-vouchers/${id}/reversal`, 'POST', header)
      : await sendJson<{ id: string }>('/api/journal-vouchers', 'POST', { ...header, egcs_fc_payment: voucher.value.egcs_fc_payment, egcs_fc_replacementof: id })
    await navigateTo(localePath(`/journal-vouchers/${created.id}`))
  } catch (failure) {
    showError(failure)
  } finally { saving.value = false }
}
/**
 * Applies a validated modal copy to the local entry, without persisting a temporarily unbalanced split.
 * @param line Allocation created or edited in the modal.
 */
const applyAllocation = (line: JournalVoucherAllocationDraft) => {
  if (!state.value || !canEditAllocations.value) return
  const index = state.value.egcs_fc_allocations.findIndex(allocation => allocation.key === line.key)
  if (index === -1) state.value.egcs_fc_allocations.push(line)
  else state.value.egcs_fc_allocations.splice(index, 1, line)
  allocationModal.close()
}
</script>

<template>
  <div class="flex w-full min-w-0 flex-col">
    <UAlert v-if="error" color="error" :title="t('common.resource_table_load_failed')" :description="t('common.resource_table_load_failed_description')">
      <template #actions>
        <UButton :label="t('common.retry')" :loading="status === 'pending'" @click="refresh()" />
      </template>
    </UAlert>
    <div v-else-if="!voucher && status === 'pending'" role="status" aria-live="polite" class="p-6">
      {{ t('common.loading_records') }}
    </div>
    <UDashboardPanel v-if="voucher && !error" id="journal-voucher-detail" class="w-full">
      <template #header>
        <UDashboardNavbar>
          <template #leading>
            <UDashboardSidebarCollapse /><UBreadcrumb :items="breadcrumbs" class="ml-2" />
          </template>
          <template #right>
            <div class="flex items-center gap-2">
              <UButton color="neutral" variant="ghost" :icon="isHeroCollapsed ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'" :aria-label="t(isHeroCollapsed ? 'common.expand' : 'common.collapse')" @click="isHeroCollapsed = !isHeroCollapsed" /><CommonNavbarSide />
            </div>
          </template>
        </UDashboardNavbar>
      </template>
      <template #body>
        <CommonEntityHero :is-collapsed="isHeroCollapsed" icon="i-lucide-book-open-check" :title="`${t('journal_voucher.number')} ${voucher.egcs_fc_number}`" :meta-items="[voucher.egcs_fc_agreementnumber, voucher.egcs_fc_fiscalyeardisplay, voucher.egcs_fc_currency.toUpperCase()]" :badges="[{ statusId: voucher.egcs_fc_status, isCompleted: voucher.isCompleted }]" />
        <CommonEntityEditorWorkspace content-test-id="journal-voucher-detail-content">
          <template #sidebar>
            <CommonRouteTabs v-model="selectedTab" :items="tabs" orientation="vertical" :ui="{ root: 'w-full', list: 'w-full flex-col items-stretch p-0', trigger: 'w-full justify-start' }" />
          </template>
          <UForm
            v-if="selectedTab === 'entry' && state"
            :state="state"
            :validate="createValidator(JournalVoucherEditSchema)"
            :validate-on="[]"
            class="space-y-8"
            @submit="save">
            <CommonSection :title="t('journal_voucher.accounting_entry')" :grid-cols="1">
              <div class="space-y-4">
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <p class="text-sm text-muted">
                    {{ t('journal_voucher.prepared_transaction') }}
                  </p>
                  <div v-if="voucher.egcs_fc_canreverse || voucher.egcs_fc_canreplace" class="flex flex-wrap gap-2">
                    <UButton v-if="voucher.egcs_fc_canreverse" type="button" icon="i-lucide-undo-2" variant="outline" :label="t('journal_voucher.reverse')" :loading="saving" @click="prepareLinked('reversal')" />
                    <UButton v-if="voucher.egcs_fc_canreplace" type="button" icon="i-lucide-copy-plus" variant="outline" :label="t('journal_voucher.replace')" :loading="saving" @click="prepareLinked('replacement')" />
                  </div>
                </div>
                <dl class="grid gap-4 text-sm sm:grid-cols-2">
                  <div class="space-y-1">
                    <dt class="text-xs font-black tracking-widest text-zinc-500 uppercase dark:text-zinc-400">
                      {{ t('journal_voucher.source_payment') }}
                    </dt>
                    <dd>
                      <NuxtLink v-if="voucher.egcs_fc_sourcereadable" class="font-semibold text-primary hover:underline" :to="localePath(`/agreements/${voucher.egcs_fc_fundingagreement}/payments/${voucher.egcs_fc_payment}`)">{{ `${t('assignments.entity_types.fundingcasepayment')} ${voucher.egcs_fc_payment}` }}</NuxtLink>
                      <span v-else class="font-semibold text-highlighted">{{ `${t('assignments.entity_types.fundingcasepayment')} ${voucher.egcs_fc_payment}` }}</span>
                    </dd>
                  </div>
                  <div class="space-y-1">
                    <dt class="text-xs font-black tracking-widest text-zinc-500 uppercase dark:text-zinc-400">
                      {{ t('journal_voucher.fiscal_eligibility') }}
                    </dt>
                    <dd><UBadge :color="voucher.egcs_fc_fiscaleligible ? 'success' : 'neutral'" variant="subtle" :label="t(voucher.egcs_fc_fiscaleligible ? 'common.yes' : 'common.no')" /></dd>
                  </div>
                  <div v-if="voucher.egcs_fc_reversalof" class="space-y-1">
                    <dt class="text-xs font-black tracking-widest text-zinc-500 uppercase dark:text-zinc-400">
                      {{ t('journal_voucher.reversal_of') }}
                    </dt>
                    <dd class="font-semibold text-highlighted">
                      {{ voucher.egcs_fc_reversalof }}
                    </dd>
                  </div>
                  <div v-if="voucher.egcs_fc_replacementof" class="space-y-1">
                    <dt class="text-xs font-black tracking-widest text-zinc-500 uppercase dark:text-zinc-400">
                      {{ t('journal_voucher.replacement_of') }}
                    </dt>
                    <dd class="font-semibold text-highlighted">
                      {{ voucher.egcs_fc_replacementof }}
                    </dd>
                  </div>
                </dl>
                <div class="grid gap-6 md:grid-cols-2">
                  <UFormField name="egcs_fc_requesteddate" :label="t('journal_voucher.requested_date')">
                    <CommonDatePicker v-model="state.egcs_fc_requesteddate" :disabled="!voucher.egcs_fc_canedit" />
                  </UFormField>
                  <div class="grid gap-6 md:col-span-2 md:grid-cols-2">
                    <UFormField name="egcs_fc_narrative_en" :label="t('journal_voucher.narrative_en')">
                      <CommonTextarea v-model="state.egcs_fc_narrative_en" class="w-full" :rows="3" :disabled="!voucher.egcs_fc_canedit" />
                    </UFormField>
                    <UFormField name="egcs_fc_narrative_fr" :label="t('journal_voucher.narrative_fr')">
                      <CommonTextarea v-model="state.egcs_fc_narrative_fr" class="w-full" :rows="3" :disabled="!voucher.egcs_fc_canedit" />
                    </UFormField>
                  </div>
                </div>
              </div>
            </CommonSection>
            <CommonSection :title="t('journal_voucher.allocations')" :grid-cols="1">
              <div class="space-y-4" data-testid="corrected-allocations">
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <p id="allocation-balance-instruction" class="max-w-xl text-sm text-muted">
                    {{ t('journal_voucher.balance_instruction') }}
                  </p>
                  <UButton
                    v-if="canEditAllocations" type="button" icon="i-lucide-plus" variant="outline"
                    :label="t('journal_voucher.add_split')" :aria-label="t('journal_voucher.add_split')"
                    :disabled="!original.length || state.egcs_fc_allocations.length >= 500"
                    @click="allocationModal.openCreate()" />
                </div>
                <CommonCompactTable
                  :data="accountingRows" :columns="accountingColumns"
                  :ui="{ td: 'px-4 py-4 align-top', th: 'px-4 py-3', tfoot: 'bg-zinc-50 dark:bg-zinc-800/50' }">
                  <template #commitment-cell="{ row }">
                    <div
                      role="group" :aria-label="t(`journal_voucher.${row.original.kind}_allocation_label`, { number: row.original.number })"
                      class="space-y-1">
                      <span class="font-semibold text-highlighted">{{ row.original.number }}</span>
                      <p class="flex items-center gap-1 text-xs" :class="row.original.kind === 'original' ? 'text-primary' : 'text-muted'">
                        <UIcon v-if="row.original.kind === 'original'" name="i-lucide-lock-keyhole" aria-hidden="true" class="size-3" />
                        {{ t(`journal_voucher.${row.original.kind}_line`) }}
                      </p>
                    </div>
                  </template>
                  <template #coding-cell="{ row }">
                    <div v-if="row.original.kind !== 'subtotal'" class="flex min-w-48 max-w-md flex-col gap-1 whitespace-normal break-words">
                      <span class="font-semibold text-highlighted">
                        {{ formatAccountingDimensions(row.original.line.egcs_fc_accountingdimensions.slice(0, 1), locale === 'fr' ? 'fr' : 'en') }}
                      </span>
                      <span v-if="row.original.line.egcs_fc_accountingdimensions.length > 1" class="text-xs text-muted">
                        {{ formatAccountingDimensions(row.original.line.egcs_fc_accountingdimensions.slice(1), locale === 'fr' ? 'fr' : 'en') }}
                      </span>
                      <span
                        v-if="row.original.kind === 'corrected' && !row.original.line.egcs_fc_agreementcodingmatched"
                        role="status" class="flex items-start gap-1 text-xs text-amber-800 dark:text-amber-200">
                        <UIcon name="i-lucide-triangle-alert" aria-hidden="true" class="mt-0.5 size-3 shrink-0" />
                        {{ t('journal_voucher.coding_not_on_agreement') }}
                      </span>
                    </div>
                  </template>
                  <template #amount-cell="{ row }">
                    <span v-if="row.original.kind !== 'subtotal'" class="font-medium whitespace-nowrap tabular-nums">
                      {{ row.original.kind === 'original'
                        ? formatAmount(subtractMoney(parseMoneyText('0.00'), row.original.line.egcs_fc_amount))
                        : `+${formatAmount(row.original.line.egcs_fc_amount)}` }}
                    </span>
                    <span v-else class="font-semibold whitespace-nowrap tabular-nums">
                      {{ row.original.delta === null ? t('journal_voucher.invalid_amount') : formatAmount(row.original.delta) }}
                    </span>
                  </template>
                  <template #actions-cell="{ row }">
                    <div class="flex justify-end gap-2">
                      <UBadge
                        v-if="row.original.kind === 'subtotal'" :color="row.original.balanced ? 'success' : 'error'" variant="subtle"
                        :icon="row.original.balanced ? 'i-lucide-check' : 'i-lucide-triangle-alert'"
                        :label="t(row.original.balanced ? 'journal_voucher.balanced' : 'journal_voucher.unbalanced')" />
                      <template v-else-if="row.original.kind === 'corrected' && canEditAllocations">
                        <UButton
                          type="button" icon="i-lucide-pencil" color="neutral" variant="ghost"
                          :aria-label="`${t('common.edit')}: ${t('journal_voucher.commitment_line')} ${row.original.number}, ${row.original.index + 1}`"
                          @click="allocationModal.openUpdate(row.original.line)" />
                        <UButton
                          type="button" icon="i-lucide-trash" color="error" variant="ghost"
                          :aria-label="`${t('common.delete')}: ${t('journal_voucher.commitment_line')} ${row.original.number}, ${row.original.index + 1}`"
                          @click="state.egcs_fc_allocations.splice(row.original.index, 1)" />
                      </template>
                    </div>
                  </template>
                  <template #amount-footer>
                    <span data-testid="journal-voucher-balance-total" aria-live="polite" class="font-semibold whitespace-nowrap tabular-nums">
                      {{ balanceTotal === null ? t('journal_voucher.invalid_amount') : formatAmount(balanceTotal) }}
                    </span>
                  </template>
                  <template #actions-footer>
                    <UBadge
                      data-testid="journal-voucher-balance-status" :color="allBalanced ? 'success' : 'error'" variant="subtle"
                      :icon="allBalanced ? 'i-lucide-check' : 'i-lucide-triangle-alert'"
                      :label="t(allBalanced ? 'journal_voucher.balanced' : 'journal_voucher.unbalanced')" />
                  </template>
                </CommonCompactTable>
              </div>
            </CommonSection>
            <div v-if="voucher.egcs_fc_canedit || voucher.egcs_fc_candelete" class="flex items-center justify-between gap-3 border-t border-default pt-4">
              <div>
                <UButton v-if="voucher.egcs_fc_candelete" type="button" icon="i-lucide-trash" color="error" variant="ghost" :label="t('common.delete')" @click="deleteDraft" />
              </div>
              <CommonSaveButton v-if="voucher.egcs_fc_canedit" :label="t('common.save')" :loading="saving" :disabled="saving" />
            </div>
          </UForm>
          <CommonCompletionPanel v-else-if="selectedTab === 'completion'" entity-type="fundingcasejournalvoucher" :entity-id="id" :can-complete="voucher.egcs_fc_canwork && !voucher.isCompleted" :can-work-workflow="voucher.egcs_fc_canwork" :hide-title="false" :show-divider="false" title-key="journal_voucher.completion.title" description-key="journal_voucher.completion.description" status-complete-key="journal_voucher.completion.status_complete" status-locked-key="journal_voucher.completion.status_locked" comment-placeholder-key="journal_voucher.completion.comment_placeholder" complete-action-key="journal_voucher.completion.complete" completed-success-key="journal_voucher.completion.completed_success" :refresh-key="refreshKey" @changed="refreshPage" />
          <CommonReviewsTab v-else-if="selectedTab === 'reviews'" entity-type="fundingcasejournalvoucher" :entity-id="id" :can-update="voucher.egcs_fc_canwork" @changed="refreshPage" />
          <CommonWorkflowSection v-else-if="selectedTab === 'workflows'" entity-type="fundingcasejournalvoucher" :entity-id="id" purpose="standard" :can-edit="voucher.egcs_fc_canwork" :refresh-key="refreshKey" @changed="refreshPage" />
          <CommonAttachmentsTab v-else-if="selectedTab === 'attachments'" entity-type="fundingcasejournalvoucher" :entity-id="id" />
          <CommonAssignedUsers v-else-if="selectedTab === 'assignments'" entity-type="fundingcasejournalvoucher" :entity-id="id" />
        </CommonEntityEditorWorkspace>
      </template>
    </UDashboardPanel>
    <JournalVoucherAllocationModal
      v-if="voucher && state" v-model:open="allocationModal.isOpen.value" v-model="allocationModal.selected.value"
      :voucher-id="id" :original="original" :editing="isEditingAllocation" @save="applyAllocation" />
  </div>
</template>
