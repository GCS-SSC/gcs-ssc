<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- Manual creditMemo uses the same independent Payment/Correction detail shell. */
import { computed, nextTick, ref, watch } from 'vue'
import type { Ref } from 'vue'
import CommonCompletionPanel from '~/components/Common/Completions/Panel.vue'
import type { AccountReceivableCreditMemoDetail } from '~~/shared/types/account-receivable'
import { AccountReceivableCreditMemoEditSchema } from '~~/shared/types/schemas/account-receivable'
import { appRouteLocations, authorizedRouteLocation } from '~/utils/route-locations'
import { formatAccountReceivableAmount } from '~/utils/account-receivable-display'
import { AppFetchResponseError } from '~/utils/fetch-error'

definePageMeta({ key: route => route.path, i18n: { paths: { en: '/agreements/[id]/account-receivable-credit-memos/[creditMemoId]', fr: '/ententes/[id]/notes-de-credit/[creditMemoId]' } } })
const route = useRoute()
const localePath = useLocalePath()
const { t, locale } = useI18n()
const { getHeroCollapsed } = useDashboard()
const { createValidator } = useZodI18n()
const { sendJson } = useJsonRequest()
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const toast = useToast()
const agreementId = computed(() => String(route.params.id))
const creditMemoId = computed(() => String(route.params.creditMemoId))
const { data: creditMemo, status, error: detailError, refresh } = useAccountReceivableCreditMemoDetail(agreementId, creditMemoId)
const approvalOnly = computed(() => !creditMemo.value && status.value === 'error' && detailError.value instanceof AppFetchResponseError && detailError.value.response.status === 403)
const isHeroCollapsed = getHeroCollapsed('agreement-account-receivable-credit-memo-detail')
const selectedTab: Ref<string> = ref('allocations')
const saving: Ref<boolean> = ref(false)
const cancelOpen: Ref<boolean> = ref(false)
const refreshKey: Ref<number> = ref(0)
const content: Ref<HTMLElement | null> = ref(null)
type FormState = {
  egcs_fc_applicantrecipient: string
  egcs_fc_receiveddate: string | Date | null
  egcs_fc_amount: string
  egcs_fc_receiptreference: string | null
  egcs_fc_narrative_en: string
  egcs_fc_narrative_fr: string
  egcs_fc_allocations: Array<{ egcs_fc_receivableline: string, egcs_fc_amount: string }>
}
const state: Ref<FormState | null> = ref(null)
const saved: Ref<string> = ref('')
const dirty = computed(() => state.value !== null && JSON.stringify(state.value) !== saved.value)
const hydrate = (record: AccountReceivableCreditMemoDetail) => {
  state.value = {
    egcs_fc_applicantrecipient: record.egcs_fc_applicantrecipient,
    egcs_fc_receiveddate: record.egcs_fc_receiveddate.slice(0, 10),
    egcs_fc_amount: record.egcs_fc_amount,
    egcs_fc_receiptreference: record.egcs_fc_receiptreference,
    egcs_fc_narrative_en: record.egcs_fc_narrative_en,
    egcs_fc_narrative_fr: record.egcs_fc_narrative_fr,
    egcs_fc_allocations: record.egcs_fc_allocations.map(line => ({ egcs_fc_receivableline: line.egcs_fc_receivableline, egcs_fc_amount: line.egcs_fc_amount }))
  }
  saved.value = JSON.stringify(state.value)
}
watch(creditMemo, record => {
  if (!record) {
    state.value = null
    saved.value = ''
    return
  }
  if (!dirty.value || !record.egcs_fc_canedit) hydrate(record)
}, { immediate: true })
watch([agreementId, creditMemoId], () => {
  state.value = null
  saved.value = ''
  saving.value = false
  cancelOpen.value = false
}, { flush: 'sync' })
const reference = computed(() => creditMemo.value ? creditMemo.value.egcs_fc_creditmemoreference : '')
const tabs = [
  { key: 'account_receivable.credit_memo_allocations', value: 'allocations', icon: 'i-lucide-list' },
  { key: 'account_receivable.credit_memo_completion.title', value: 'completion', icon: 'i-lucide-circle-check-big' },
  { key: 'reviews.title', value: 'reviews', icon: 'i-lucide-clipboard-check' },
  { key: 'workflow.title', value: 'workflows', icon: 'i-lucide-workflow' },
  { key: 'attachments.title', value: 'attachments', icon: 'i-lucide-paperclip' },
  { key: 'assignments.title', value: 'assignments', icon: 'i-lucide-users' }
]
const breadcrumbs = computed(() => [
  { label: t('agreement.title'), to: authorizedRouteLocation(creditMemo.value?.egcs_fc_agreementreadable, localePath(appRouteLocations.agreements())) },
  { label: creditMemo.value?.egcs_fc_agreementnumber ?? '', to: authorizedRouteLocation(creditMemo.value?.egcs_fc_agreementreadable, localePath(appRouteLocations.agreementDetail(agreementId.value))) },
  { label: t('account_receivable.title'), to: authorizedRouteLocation(creditMemo.value?.egcs_fc_agreementreadable, localePath(appRouteLocations.agreementAccountReceivableCollection(agreementId.value))) },
  { label: reference.value }
])
const amount = (value: string) => formatAccountReceivableAmount(value, locale.value, creditMemo.value?.egcs_fc_currency ?? 'cad') ?? t('common.not_available')
const refreshPage = async () => {
  await refresh()
  refreshKey.value += 1
}
const retry = async () => {
  if (await refresh()) {
    await nextTick()
    content.value?.focus()
  }
}
const save = async () => {
  if (!state.value || !creditMemo.value?.egcs_fc_canedit || saving.value) return
  const owner = creditMemoId.value
  const submitted = JSON.stringify(state.value)
  saving.value = true
  try {
    await sendJson(`/api/account-receivable-credit-memos/${owner}`, 'PATCH', AccountReceivableCreditMemoEditSchema.parse(state.value))
    if (owner !== creditMemoId.value) return
    if (await refresh() && creditMemo.value && submitted === JSON.stringify(state.value)) hydrate(creditMemo.value)
    refreshKey.value += 1
    toast.add({ title: t('common.success'), description: t('common.updated_success'), color: 'success' })
  } catch (failure) {
    if (owner === creditMemoId.value) showError(failure)
  } finally {
    if (owner === creditMemoId.value) saving.value = false
  }
}
const deleteDraft = async () => {
  const owner = creditMemoId.value
  if (await confirmDeleteRequest(`/api/account-receivable-credit-memos/${owner}`) && owner === creditMemoId.value) await navigateTo(localePath(appRouteLocations.agreementAccountReceivableCollection(agreementId.value)))
}
const actions = computed(() => [
  { label: t('account_receivable.cancel'), color: 'neutral' as const, variant: 'outline' as const, visible: creditMemo.value?.egcs_fc_cancancel === true, onClick: () => {
    cancelOpen.value = true
  } },
  { label: t('common.delete'), color: 'error' as const, variant: 'ghost' as const, icon: 'i-lucide-trash', visible: creditMemo.value?.egcs_fc_candelete === true, onClick: deleteDraft }
])
</script>

<template>
  <div ref="content" tabindex="-1" class="flex w-full min-w-0 flex-col">
    <AccountReceivableCreditMemoApprovalWorkspace v-if="approvalOnly" :agreement-id="agreementId" :credit-memo-id="creditMemoId" />
    <UAlert v-else-if="status === 'error'" color="error" :title="t('common.resource_table_load_failed')" :description="t('common.resource_table_load_failed_description')">
      <template #actions>
        <UButton :label="t('common.retry')" color="error" variant="soft" @click="retry" />
      </template>
    </UAlert>
    <div v-else-if="!creditMemo && status === 'pending'" role="status" aria-live="polite" class="flex min-h-32 items-center justify-center gap-2 text-sm text-muted">
      <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" aria-hidden="true" /><span>{{ t('common.loading_records') }}</span>
    </div>
    <UDashboardPanel v-if="creditMemo && state" id="agreement-account-receivable-credit-memo-detail" class="min-w-0 flex-1">
      <template #header>
        <UDashboardNavbar>
          <template #leading>
            <UDashboardSidebarCollapse /><UBreadcrumb :items="breadcrumbs" class="ml-2" />
          </template><template #right>
            <div class="flex items-center gap-2">
              <UButton color="neutral" variant="ghost" :icon="isHeroCollapsed ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'" :aria-label="t(isHeroCollapsed ? 'common.expand' : 'common.collapse')" @click="isHeroCollapsed = !isHeroCollapsed" /><CommonNavbarSide />
            </div>
          </template>
        </UDashboardNavbar>
      </template>
      <template #body>
        <CommonEntityHero :is-collapsed="isHeroCollapsed" icon="i-lucide-banknote-arrow-down" :title="reference" :meta-items="[creditMemo.egcs_fc_agreementnumber, locale === 'fr' ? creditMemo.egcs_fc_debtorname_fr : creditMemo.egcs_fc_debtorname_en, creditMemo.egcs_fc_currency.toUpperCase(), amount(creditMemo.egcs_fc_amount)]" :badges="[{ statusId: creditMemo.egcs_fc_status }]" :actions="actions" />
        <CommonEntityEditorWorkspace content-test-id="agreement-account-receivable-credit-memo-detail-content">
          <template #sidebar>
            <CommonRouteTabs v-model="selectedTab" :items="tabs" orientation="vertical" :ui="{ root: 'w-full', list: 'w-full flex-col items-stretch p-0', trigger: 'w-full justify-start' }" />
          </template>
          <UForm v-if="selectedTab === 'allocations'" :state="state" :validate="createValidator(AccountReceivableCreditMemoEditSchema)" class="space-y-8" @submit="save">
            <CommonSection :title="t('account_receivable.credit_memo_allocations')" :grid-cols="1">
              <p class="text-sm text-muted">
                {{ t('account_receivable.allocation_instruction') }}
              </p>
              <div class="grid gap-4 md:grid-cols-2">
                <UFormField name="egcs_fc_receiveddate" :label="t('account_receivable.received_date')">
                  <CommonDatePicker v-model="state.egcs_fc_receiveddate" :disabled="saving || !creditMemo.egcs_fc_canedit" />
                </UFormField><UFormField name="egcs_fc_amount" :label="t('account_receivable.received_amount')">
                  <UInput v-model="state.egcs_fc_amount" :readonly="!creditMemo.egcs_fc_canedit" :disabled="saving" type="text" inputmode="decimal" class="w-full" />
                </UFormField>
              </div>
              <UFormField name="egcs_fc_receiptreference" :label="t('account_receivable.receipt_reference')">
                <UInput v-model="state.egcs_fc_receiptreference" :readonly="!creditMemo.egcs_fc_canedit" :disabled="saving" class="w-full" />
              </UFormField>
              <div v-for="(allocation, index) in creditMemo.egcs_fc_allocations" :key="allocation.id" class="space-y-2 border-t border-default pt-4">
                <p class="text-sm font-semibold">
                  {{ t('account_receivable.allocation_reference', { agreement: allocation.egcs_fc_agreementnumber, number: allocation.egcs_fc_number }) }}
                </p><UFormField v-if="creditMemo.egcs_fc_canedit" :name="`egcs_fc_allocations.${index}.egcs_fc_amount`" :label="t('account_receivable.allocation_line', { number: index + 1 })">
                  <UInput v-model="state.egcs_fc_allocations[index]!.egcs_fc_amount" type="text" inputmode="decimal" :disabled="saving" class="w-full" />
                </UFormField><p v-else class="text-sm">
                  {{ amount(allocation.egcs_fc_amount) }}
                </p>
              </div>
              <div class="grid gap-4 md:grid-cols-2">
                <UFormField name="egcs_fc_narrative_en" :label="t('account_receivable.narrative_en')">
                  <UTextarea v-model="state.egcs_fc_narrative_en" :readonly="!creditMemo.egcs_fc_canedit" :disabled="saving" class="w-full" />
                </UFormField><UFormField name="egcs_fc_narrative_fr" :label="t('account_receivable.narrative_fr')">
                  <UTextarea v-model="state.egcs_fc_narrative_fr" :readonly="!creditMemo.egcs_fc_canedit" :disabled="saving" class="w-full" />
                </UFormField>
              </div>
              <p class="text-sm text-muted">
                {{ t('account_receivable.credit_memo_evidence_instruction') }}
              </p>
              <div v-if="creditMemo.egcs_fc_canedit" class="flex justify-end">
                <CommonSaveButton :label="t('common.save')" :loading="saving" :disabled="saving || status !== 'success'" />
              </div>
            </CommonSection>
          </UForm>
          <section v-else-if="selectedTab === 'completion'" class="space-y-6">
            <UAlert v-if="dirty" color="warning" :title="t('account_receivable.save_before_completion')" /><CommonCompletionPanel entity-type="fundingcaseaccountreceivablecreditmemo" :entity-id="creditMemoId" :can-complete="creditMemo.egcs_fc_canedit && !dirty && !saving && status === 'success'" :can-work-workflow="creditMemo.egcs_fc_canwork" :hide-title="false" :show-divider="false" title-key="account_receivable.credit_memo_completion.title" description-key="account_receivable.credit_memo_completion.description" status-complete-key="account_receivable.credit_memo_completion.status_complete" status-locked-key="account_receivable.credit_memo_completion.status_locked" comment-placeholder-key="account_receivable.credit_memo_completion.comment_placeholder" complete-action-key="account_receivable.credit_memo_completion.complete" completed-success-key="account_receivable.credit_memo_completion.completed_success" :refresh-key="refreshKey" @changed="refreshPage" />
          </section>
          <CommonReviewsTab v-else-if="selectedTab === 'reviews'" entity-type="fundingcaseaccountreceivablecreditmemo" :entity-id="creditMemoId" :can-update="creditMemo.egcs_fc_canedit" @changed="refreshPage" />
          <CommonWorkflowSection v-else-if="selectedTab === 'workflows'" entity-type="fundingcaseaccountreceivablecreditmemo" :entity-id="creditMemoId" purpose="standard" :can-edit="creditMemo.egcs_fc_canwork" :refresh-key="refreshKey" @changed="refreshPage" />
          <CommonAttachmentsTab v-else-if="selectedTab === 'attachments'" entity-type="fundingcaseaccountreceivablecreditmemo" :entity-id="creditMemoId" />
          <CommonAssignedUsers v-else-if="selectedTab === 'assignments'" entity-type="fundingcaseaccountreceivablecreditmemo" :entity-id="creditMemoId" />
        </CommonEntityEditorWorkspace>
      </template>
    </UDashboardPanel>
    <AccountReceivableCancelModal v-model:open="cancelOpen" :record-id="creditMemoId" credit-memo @cancelled="refreshPage" />
  </div>
</template>
