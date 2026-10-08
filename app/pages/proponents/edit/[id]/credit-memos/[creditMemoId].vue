<script setup lang="ts">
import { usePageResourceError } from '~/composables/usePageResourceError'
/* eslint-disable jsdoc/require-jsdoc -- Independent Proponent credit uses the financial operational-child shell. */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { Ref } from 'vue'
import CommonCompletionPanel from '~/components/Common/Completions/Panel.vue'
import type { AccountReceivableCreditMemoDetail } from '~~/shared/types/account-receivable'
import { AccountReceivableCreditMemoEditSchema } from '~~/shared/types/schemas/account-receivable'
import { appRouteLocations, authorizedRouteLocation } from '~/utils/route-locations'
import { AppFetchResponseError } from '~/utils/fetch-error'
import { useUrlTabState } from '~/composables/useUrlTabState'
import { useProponentCreditMemoDetail } from '~/composables/useProponentCreditMemoDetail'
import { useBilingualValue } from '~/composables/useBilingualValue'

definePageMeta({ key: route => route.path, i18n: { paths: { en: '/proponents/edit/[id]/credit-memos/[creditMemoId]', fr: '/promoteurs/modifier/[id]/notes-de-credit/[creditMemoId]' } } })
const route = useRoute()
const localePath = useLocalePath()
const { t } = useI18n()
const { getBilingualValue } = useBilingualValue()
const { getHeroCollapsed } = useDashboard()
const { createValidator } = useZodI18n()
const { sendJson } = useJsonRequest()
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const toast = useToast()
const proponentId = computed(() => String(route.params.id))
const creditMemoId = computed(() => String(route.params.creditMemoId))
const identity = computed(() => `${proponentId.value}:${creditMemoId.value}`)
let disposed = false
onBeforeUnmount(() => {
  disposed = true
})
const { data: creditMemo, status, error: detailError, refresh } = useProponentCreditMemoDetail(proponentId, creditMemoId)

const approvalOnly = computed(() => !creditMemo.value && status.value === 'error' && detailError.value instanceof AppFetchResponseError && detailError.value.response.status === 403)
usePageResourceError({
  identity: () => route.path,
  errors: [() => approvalOnly.value ? null : detailError.value],
  pending: () => status.value === 'pending',
  hasContent: () => Boolean(creditMemo.value)
})
const isHeroCollapsed = getHeroCollapsed('proponent-credit-memo-detail')
const saving: Ref<boolean> = ref(false)
const cancelOpen: Ref<boolean> = ref(false)
const refreshKey: Ref<number> = ref(0)
const content: Ref<HTMLElement | null> = ref(null)
type FormState = {
  egcs_fc_applicantrecipient: string
  egcs_fc_receivable: string
  egcs_fc_agency: string
  egcs_fc_currency: AccountReceivableCreditMemoDetail['egcs_fc_currency']
  egcs_fc_receiveddate: string | Date | null
  egcs_fc_reason: string
}
const state: Ref<FormState | null> = ref(null)
const saved: Ref<string> = ref('')
const dirty = computed(() => state.value !== null && JSON.stringify(state.value) !== saved.value)
const hydrate = (record: AccountReceivableCreditMemoDetail) => {
  state.value = {
    egcs_fc_applicantrecipient: record.egcs_fc_applicantrecipient,
    egcs_fc_receivable: record.egcs_fc_receivable,
    egcs_fc_agency: record.egcs_fc_agency,
    egcs_fc_currency: record.egcs_fc_currency,
    egcs_fc_receiveddate: record.egcs_fc_receiveddate.slice(0, 10),
    egcs_fc_reason: record.egcs_fc_reason
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
watch([proponentId, creditMemoId], () => {
  state.value = null
  saved.value = ''
  saving.value = false
  cancelOpen.value = false
}, { flush: 'sync' })
const reference = computed(() => creditMemo.value ? creditMemo.value.egcs_fc_creditmemoreference : '')
const tabs = [
  { key: 'account_receivable.credit_memo_summary', value: 'summary', icon: 'i-lucide-receipt-text' },
  { key: 'account_receivable.credit_memo_lines', value: 'lines', icon: 'i-lucide-list' },
  { key: 'account_receivable.credit_memo_completion.title', value: 'completion', icon: 'i-lucide-circle-check-big' },
  { key: 'reviews.title', value: 'reviews', icon: 'i-lucide-clipboard-check' },
  { key: 'workflow.title', value: 'workflows', icon: 'i-lucide-workflow' },
  { key: 'attachments.title', value: 'attachments', icon: 'i-lucide-paperclip' },
  { key: 'assignments.title', value: 'assignments', icon: 'i-lucide-users' }
]
const { selectedTab } = useUrlTabState({ tabs, defaultKey: 'account_receivable.credit_memo_summary' })
const breadcrumbs = computed(() => [
  { label: t('applicant_recipient.title'), to: authorizedRouteLocation(creditMemo.value?.egcs_fc_proponentreadable, localePath(appRouteLocations.proponents())) },
  { label: getBilingualValue(creditMemo.value, 'egcs_fc_debtorname', ''), to: authorizedRouteLocation(creditMemo.value?.egcs_fc_proponentreadable, localePath(appRouteLocations.proponentEdit(proponentId.value))) },
  { label: t('account_receivable.credit_memos_title'), to: authorizedRouteLocation(creditMemo.value?.egcs_fc_proponentreadable, localePath(appRouteLocations.proponentCreditMemoCollection(proponentId.value))) },
  { label: reference.value }
])
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
  if (disposed || !state.value || !creditMemo.value?.egcs_fc_canedit || saving.value || status.value !== 'success') return
  const owner = creditMemoId.value
  const requestIdentity = identity.value
  const submitted = JSON.stringify(state.value)
  saving.value = true
  try {
    await sendJson(`/api/account-receivable-credit-memos/${owner}`, 'PATCH', AccountReceivableCreditMemoEditSchema.parse(state.value))
    if (disposed || requestIdentity !== identity.value) return
    const refreshed = await refresh()
    if (disposed || requestIdentity !== identity.value) return
    if (refreshed && creditMemo.value && submitted === JSON.stringify(state.value)) hydrate(creditMemo.value)
    refreshKey.value += 1
    toast.add({ title: t('common.success'), description: t('common.updated_success'), color: 'success' })
  } catch (failure) {
    if (!disposed && requestIdentity === identity.value) showError(failure)
  } finally {
    if (!disposed && requestIdentity === identity.value) saving.value = false
  }
}
const deleteDraft = async () => {
  const owner = creditMemoId.value
  const requestIdentity = identity.value
  if (await confirmDeleteRequest(`/api/account-receivable-credit-memos/${owner}`) && !disposed && requestIdentity === identity.value) await navigateTo(localePath(creditMemo.value?.egcs_fc_proponentreadable ? appRouteLocations.proponentCreditMemoCollection(proponentId.value) : appRouteLocations.home()))
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
    <AccountReceivableCreditMemoApprovalWorkspace v-if="approvalOnly" :proponent-id="proponentId" :credit-memo-id="creditMemoId" />
    <UAlert v-else-if="status === 'error'" color="error" :title="t('common.resource_table_load_failed')" :description="t('common.resource_table_load_failed_description')">
      <template #actions>
        <UButton :label="t('common.retry')" color="error" variant="soft" @click="retry" />
      </template>
    </UAlert>
    <div v-else-if="!creditMemo && status === 'pending'" role="status" aria-live="polite" class="flex min-h-32 items-center justify-center gap-2 text-sm text-muted">
      <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" aria-hidden="true" /><span>{{ t('common.loading_records') }}</span>
    </div>
    <UDashboardPanel v-if="creditMemo && state" id="proponent-credit-memo-detail" class="min-w-0 flex-1">
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
        <CommonEntityHero :is-collapsed="isHeroCollapsed" icon="i-lucide-banknote-arrow-down" :title="reference" :meta-items="[getBilingualValue(creditMemo, 'egcs_fc_debtorname', t('common.not_available')), getBilingualValue(creditMemo, 'egcs_fc_agencyname', t('common.not_available')), creditMemo.egcs_fc_currency.toUpperCase()]" :badges="[{ statusId: creditMemo.egcs_fc_status }]" :actions="actions" />
        <CommonEntityEditorWorkspace content-test-id="proponent-credit-memo-detail-content">
          <template #sidebar>
            <CommonRouteTabs v-model="selectedTab" :items="tabs" orientation="vertical" :ui="{ root: 'w-full', list: 'w-full flex-col items-stretch p-0', trigger: 'w-full justify-start' }" />
          </template>
          <UForm v-if="selectedTab === 'summary'" :state="state" :validate="createValidator(AccountReceivableCreditMemoEditSchema)" class="space-y-8" @submit="save">
            <CommonSection :title="t('account_receivable.credit_memo_summary')" :grid-cols="1">
              <UFormField name="egcs_fc_receiveddate" :label="t('account_receivable.received_date')">
                <CommonDatePicker v-model="state.egcs_fc_receiveddate" :disabled="saving || !creditMemo.egcs_fc_canedit" />
              </UFormField>
              <dl class="text-sm">
                <dt class="text-muted">
                  {{ t('account_receivable.credit_memo_receivable') }}
                </dt>
                <dd>
                  <ULink v-if="creditMemo.egcs_fc_receivablereadable" :to="localePath(appRouteLocations.agreementAccountReceivableDetail(creditMemo.egcs_fc_fundingagreement, creditMemo.egcs_fc_receivable))" class="text-primary hover:underline">
                    {{ creditMemo.egcs_fc_receivablereference }}
                  </ULink>
                  <span v-else>{{ creditMemo.egcs_fc_receivablereference }}</span>
                </dd>
              </dl>
              <UFormField name="egcs_fc_reason" :label="t('account_receivable.reason')">
                <UTextarea v-model="state.egcs_fc_reason" :readonly="!creditMemo.egcs_fc_canedit" :disabled="saving" class="w-full" />
              </UFormField>
              <div v-if="creditMemo.egcs_fc_canedit" class="flex justify-end">
                <CommonSaveButton :label="t('common.save')" :loading="saving" :disabled="saving || status !== 'success'" />
              </div>
            </CommonSection>
          </UForm>
          <AccountReceivableCreditMemoLines
            v-else-if="selectedTab === 'lines'" :credit-memo-id="creditMemoId" :receivable-id="creditMemo.egcs_fc_receivable"
            :lines="creditMemo.egcs_fc_lines" :currency="creditMemo.egcs_fc_currency"
            :can-edit="creditMemo.egcs_fc_canedit && status === 'success' && !saving" :can-delete="creditMemo.egcs_fc_candeletelines && status === 'success' && !saving"
            @changed="refreshPage" />
          <section v-else-if="selectedTab === 'completion'" class="space-y-6">
            <UAlert v-if="dirty" color="warning" :title="t('account_receivable.save_before_completion')" /><CommonCompletionPanel entity-type="fundingcaseaccountreceivablecreditmemo" :entity-id="creditMemoId" :can-complete="creditMemo.egcs_fc_cancomplete && !dirty && !saving && status === 'success'" :can-work-workflow="creditMemo.egcs_fc_canwork" :hide-title="false" :show-divider="false" title-key="account_receivable.credit_memo_completion.title" description-key="account_receivable.credit_memo_completion.description" status-complete-key="account_receivable.credit_memo_completion.status_complete" status-locked-key="account_receivable.credit_memo_completion.status_locked" comment-placeholder-key="account_receivable.credit_memo_completion.comment_placeholder" complete-action-key="account_receivable.credit_memo_completion.complete" completed-success-key="account_receivable.credit_memo_completion.completed_success" :refresh-key="refreshKey" @changed="refreshPage" />
          </section>
          <CommonReviewsTab v-else-if="selectedTab === 'reviews'" entity-type="fundingcaseaccountreceivablecreditmemo" :entity-id="creditMemoId" :can-update="creditMemo.egcs_fc_canwork" @changed="refreshPage" />
          <CommonWorkflowSection v-else-if="selectedTab === 'workflows'" entity-type="fundingcaseaccountreceivablecreditmemo" :entity-id="creditMemoId" purpose="standard" :can-edit="creditMemo.egcs_fc_canwork" :refresh-key="refreshKey" @changed="refreshPage" />
          <CommonAttachmentsTab v-else-if="selectedTab === 'attachments'" entity-type="fundingcaseaccountreceivablecreditmemo" :entity-id="creditMemoId" />
          <CommonAssignedUsers v-else-if="selectedTab === 'assignments'" entity-type="fundingcaseaccountreceivablecreditmemo" :entity-id="creditMemoId" />
        </CommonEntityEditorWorkspace>
      </template>
    </UDashboardPanel>
    <AccountReceivableCancelModal v-model:open="cancelOpen" :record-id="creditMemoId" credit-memo @cancelled="refreshPage" />
  </div>
</template>
