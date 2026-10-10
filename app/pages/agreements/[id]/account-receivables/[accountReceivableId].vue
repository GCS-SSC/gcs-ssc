<script setup lang="ts">
import { usePageResourceError } from '~/composables/usePageResourceError'
/* eslint-disable jsdoc/require-jsdoc -- Independent AR casework follows the Correction request and workspace shell. */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { Ref } from 'vue'
import CommonCompletionPanel from '~/components/Common/Completions/Panel.vue'
import { useUrlTabState } from '~/composables/useUrlTabState'
import { useBilingualValue } from '~/composables/useBilingualValue'
import type { AccountReceivableDetail } from '~~/shared/types/account-receivable'
import { AccountReceivableSummaryEditSchema } from '~~/shared/types/schemas/account-receivable'
import { appRouteLocations, authorizedRouteLocation } from '~/utils/route-locations'
import { accountReceivableReference, formatAccountReceivableAmount } from '~/utils/account-receivable-display'
import { AppFetchResponseError } from '~/utils/fetch-error'
import { sumMoney } from '~~/shared/utils/money'

definePageMeta({ key: route => route.path, i18n: { paths: {
  en: '/agreements/[id]/account-receivables/[accountReceivableId]', fr: '/ententes/[id]/comptes-debiteurs/[accountReceivableId]'
} } })
const { t, locale } = useI18n()
const { getBilingualValue } = useBilingualValue()
const { formatDate } = useDateHelpers()
const route = useRoute()
const localePath = useLocalePath()
const toast = useToast()
const { getHeroCollapsed } = useDashboard()
const { createValidator } = useZodI18n()
const { showError } = useApiErrorToast()
const { sendJson } = useJsonRequest()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const agreementId = computed(() => String(route.params.id))
const accountReceivableId = computed(() => String(route.params.accountReceivableId))
const identity = computed(() => `${agreementId.value}:${accountReceivableId.value}`)
let disposed = false
onBeforeUnmount(() => {
  disposed = true
})
const isHeroCollapsed = getHeroCollapsed('agreement-account-receivable-detail')
const { data: receivable, status, error: detailError, refresh } = useAccountReceivableDetail(agreementId, accountReceivableId)

const entityType = computed(() => receivable.value?.egcs_fc_entitytype ?? (route.query.entityType === 'fundingcaseaccountreceivableadjustment' ? 'fundingcaseaccountreceivableadjustment' : 'fundingcaseaccountreceivable'))
const approvalOnly = computed(() => !receivable.value && status.value === 'error'
  && detailError.value instanceof AppFetchResponseError && detailError.value.response.status === 403)
usePageResourceError({
  identity: () => route.path,
  errors: [() => approvalOnly.value ? null : detailError.value],
  pending: () => status.value === 'pending',
  hasContent: () => Boolean(receivable.value)
})
const refreshKey: Ref<number> = ref(0)
const saving: Ref<boolean> = ref(false)
const isEditOpen: Ref<boolean> = ref(false)
let editSession = 0
const cancelOpen: Ref<boolean> = ref(false)
const adjustmentOpen: Ref<boolean> = ref(false)
const creditMemoOpen: Ref<boolean> = ref(false)
const detailContent: Ref<HTMLElement | null> = ref(null)
type FormState = {
  egcs_fc_agencyfinancialid?: string
  egcs_fc_requesteddate: string | Date | null
  egcs_fc_recoverymethod: 'offset' | 'direct_repayment' | undefined
  egcs_fc_narrative_en: string
  egcs_fc_narrative_fr: string
  egcs_fc_recipientpreference: string | undefined
  egcs_fc_preferenceoverride_en: string
  egcs_fc_preferenceoverride_fr: string
}
const state: Ref<FormState | null> = ref(null)
const savedState: Ref<string> = ref('')
const dirty = computed(() => state.value !== null && JSON.stringify(state.value) !== savedState.value)
const hydrate = (detail: AccountReceivableDetail) => {
  state.value = {
    ...(detail.egcs_fc_linkedreceivable ? { egcs_fc_agencyfinancialid: detail.egcs_fc_agencyfinancialid ?? undefined } : {}),
    egcs_fc_requesteddate: detail.egcs_fc_requesteddate.slice(0, 10),
    egcs_fc_recoverymethod: detail.egcs_fc_recoverymethod ?? undefined,
    egcs_fc_narrative_en: detail.egcs_fc_narrative_en,
    egcs_fc_narrative_fr: detail.egcs_fc_narrative_fr,
    egcs_fc_recipientpreference: detail.egcs_fc_recipientpreference ?? undefined,
    egcs_fc_preferenceoverride_en: detail.egcs_fc_preferenceoverride_en,
    egcs_fc_preferenceoverride_fr: detail.egcs_fc_preferenceoverride_fr
  }
  savedState.value = JSON.stringify(state.value)
}
const openEdit = () => {
  if (!receivable.value?.egcs_fc_canedit || status.value !== 'success') {
    toast.add({ title: t('common.warning'), description: t('account_receivable.work_prerequisite'), color: 'warning' })
    return
  }
  if (saving.value) return
  hydrate(receivable.value)
  isEditOpen.value = true
}
watch(isEditOpen, open => {
  editSession += 1
  if (!open && receivable.value && !saving.value) hydrate(receivable.value)
}, { flush: 'sync' })
watch(receivable, detail => {
  if (!detail) {
    state.value = null
    savedState.value = ''
    return
  }
  if (!dirty.value || !detail.egcs_fc_canedit) hydrate(detail)
}, { immediate: true })
watch([agreementId, accountReceivableId], () => {
  isEditOpen.value = false
  state.value = null
  savedState.value = ''
  saving.value = false
  cancelOpen.value = false
  adjustmentOpen.value = false
  creditMemoOpen.value = false
}, { flush: 'sync' })
const tabs = computed(() => [
  { key: 'account_receivable.summary', value: 'summary', icon: 'i-lucide-receipt-text' },
  { key: 'account_receivable.lines', value: 'lines', icon: 'i-lucide-list' },
  ...(receivable.value?.egcs_fc_claimrelated && !receivable.value.egcs_fc_linkedreceivable ? [{ key: 'account_receivable.claim_reductions', value: 'claim-reductions', icon: 'i-lucide-list-minus' }] : []),
  { key: 'account_receivable.receivable_adjustments', value: 'adjustments', icon: 'i-lucide-file-diff' },
  { key: 'account_receivable.completion.title', value: 'completion', icon: 'i-lucide-circle-check-big' },
  { key: 'reviews.title', value: 'reviews', icon: 'i-lucide-clipboard-check' },
  { key: 'workflow.title', value: 'workflows', icon: 'i-lucide-workflow' },
  { key: 'supplementary_information.title', value: 'supplementary-information', icon: 'i-lucide-clipboard-list' },
  { key: 'attachments.title', value: 'attachments', icon: 'i-lucide-paperclip' },
  { key: 'assignments.title', value: 'assignments', icon: 'i-lucide-users' }
])
const { selectedTab } = useUrlTabState({
  tabs, defaultKey: 'account_receivable.summary', enabled: computed(() => status.value === 'success')
})
const amount = (value: string | null | undefined) => formatAccountReceivableAmount(value, locale.value, receivable.value?.egcs_fc_currency ?? 'cad') ?? t('common.not_available')
const heroBadges = computed(() => receivable.value
  ? [{ statusId: receivable.value.egcs_fc_status }]
  : [])
const originalAmount = computed(() => receivable.value ? sumMoney(receivable.value.egcs_fc_lines.map(line => line.egcs_fc_amount)) : null)
const breadcrumbs = computed(() => [
  { label: t('agreement.title'), to: authorizedRouteLocation(receivable.value?.egcs_fc_agreementreadable, localePath(appRouteLocations.agreements())) },
  { label: receivable.value?.egcs_fc_agreementnumber ?? '', to: authorizedRouteLocation(receivable.value?.egcs_fc_agreementreadable, localePath(appRouteLocations.agreementDetail(agreementId.value))) },
  { label: t('account_receivable.title'), to: authorizedRouteLocation(receivable.value?.egcs_fc_agreementreadable, localePath(appRouteLocations.agreementAccountReceivableCollection(agreementId.value))) },
  { label: receivable.value ? accountReceivableReference(receivable.value) : '' }
])
const refreshPage = async () => {
  await refresh()
  refreshKey.value += 1
}
const retryLoad = async () => {
  if (await refresh()) {
    await nextTick()
    detailContent.value?.focus()
  }
}
const save = async () => {
  if (disposed || !isEditOpen.value || !state.value || !receivable.value?.egcs_fc_canedit || saving.value || status.value !== 'success') return
  const owner = accountReceivableId.value
  const requestIdentity = identity.value
  const submitted = JSON.stringify(state.value)
  const session = editSession
  saving.value = true
  try {
    await sendJson(`/api/account-receivables/${owner}`, 'PATCH', AccountReceivableSummaryEditSchema.parse(state.value))
    if (disposed || requestIdentity !== identity.value || session !== editSession) return
    const refreshed = await refresh()
    if (disposed || requestIdentity !== identity.value || session !== editSession) return
    if (refreshed && receivable.value && JSON.stringify(state.value) === submitted) {
      hydrate(receivable.value)
      isEditOpen.value = false
    }
    refreshKey.value += 1
    toast.add({ title: t('common.success'), description: t('common.updated_success'), color: 'success' })
  } catch (failure) {
    if (!disposed && requestIdentity === identity.value && session === editSession) showError(failure)
  } finally {
    if (!disposed && requestIdentity === identity.value) saving.value = false
  }
}
const deleteDraft = async () => {
  const owner = accountReceivableId.value
  const requestIdentity = identity.value
  if (await confirmDeleteRequest(`/api/account-receivables/${owner}`) && !disposed && requestIdentity === identity.value) await navigateTo(localePath(appRouteLocations.agreementAccountReceivableCollection(agreementId.value)))
}
const heroActions = computed(() => [
  { label: t('common.edit'), icon: 'i-lucide-edit-3', visible: receivable.value?.egcs_fc_caneditrole === true, onClick: openEdit },
  { label: t('account_receivable.create_credit_memo'), color: 'primary' as const, icon: 'i-lucide-plus', visible: receivable.value?.egcs_fc_cancreditmemo === true, onClick: () => {
    creditMemoOpen.value = true
  } },
  { label: t('account_receivable.cancel'), color: 'neutral' as const, variant: 'outline' as const, visible: receivable.value?.egcs_fc_cancancel === true, onClick: () => {
    cancelOpen.value = true
  } },
  { label: t('common.delete'), color: 'error' as const, variant: 'ghost' as const, icon: 'i-lucide-trash', visible: receivable.value?.egcs_fc_candelete === true, onClick: deleteDraft }
])
const adjustmentCreated = async (id: string) => {
  await navigateTo(localePath({ ...appRouteLocations.agreementAccountReceivableDetail(agreementId.value, id), query: { entityType: 'fundingcaseaccountreceivableadjustment' } }))
}
const creditMemoCreated = async (id: string, proponentId: string) => {
  await navigateTo(localePath(appRouteLocations.proponentCreditMemoDetail(proponentId, id)))
}
</script>

<template>
  <div ref="detailContent" tabindex="-1" class="flex w-full min-w-0 flex-col">
    <AccountReceivableApprovalWorkspace v-if="approvalOnly" :agreement-id="agreementId" :account-receivable-id="accountReceivableId" :entity-type="entityType" />
    <UAlert v-else-if="status === 'error'" color="error" icon="i-lucide-circle-alert" :title="t('common.resource_table_load_failed')" :description="t('common.resource_table_load_failed_description')">
      <template #actions>
        <UButton color="error" variant="soft" :label="t('common.retry')" icon="i-lucide-refresh-cw" @click="retryLoad" />
      </template>
    </UAlert>
    <div v-else-if="!receivable && status === 'pending'" role="status" aria-live="polite" class="flex min-h-32 items-center justify-center gap-2 text-sm text-muted">
      <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" aria-hidden="true" /><span>{{ t('common.loading_records') }}</span>
    </div>
    <CommonDetailPage v-if="receivable && state" id="agreement-account-receivable-detail" v-model:collapsed="isHeroCollapsed" :breadcrumb-items="breadcrumbs" class="min-w-0 flex-1">
      <template #body>
        <CommonEntityHero :is-collapsed="isHeroCollapsed" icon="i-lucide-hand-coins" :title="accountReceivableReference(receivable)" :meta-items="[getBilingualValue(receivable, 'egcs_fc_debtorname', t('common.not_available')), receivable.egcs_fc_fiscalyeardisplay, receivable.egcs_fc_currency.toUpperCase()]" :badges="heroBadges" :actions="heroActions" />
        <ULink v-if="receivable.egcs_fc_linkedreceivable && receivable.egcs_fc_parentreadable" :to="localePath(appRouteLocations.agreementAccountReceivableDetail(agreementId, receivable.egcs_fc_linkedreceivable))" class="mb-4 text-sm">{{ t('account_receivable.linked_receivable') }}</ULink>
        <CommonDetailWorkspace v-model="selectedTab" :items="tabs" content-test-id="agreement-account-receivable-detail-content">
          <AccountReceivableDetailLines v-if="selectedTab === 'lines'" :account-receivable-id="accountReceivableId" :lines="receivable.egcs_fc_lines" :currency="receivable.egcs_fc_currency" :fiscal-year-id="receivable.egcs_fc_agencyfiscalyear" :is-adjustment="Boolean(receivable.egcs_fc_linkedreceivable)" :can-edit="receivable.egcs_fc_canedit && !saving && status === 'success'" :can-delete="receivable.egcs_fc_candeletelines && !saving && status === 'success'" :can-update="receivable.egcs_fc_caneditrole" @changed="refreshPage" />
          <div v-else-if="selectedTab === 'summary'" class="space-y-8" data-testid="receivable-summary">
            <CommonSection :title="t('account_receivable.financial_summary')" badge="01">
              <CommonValueCard :label="t('account_receivable.type')" :value="getBilingualValue(receivable, 'egcs_fc_typename', t('common.not_available'))" :sub-value="getBilingualValue(receivable, 'egcs_fc_typedescription', '')" />
              <CommonValueCard v-if="receivable.egcs_fc_postedat" :label="t('account_receivable.recovery_kind')" :value="receivable.egcs_fc_effectiverecoverymethod ? t(`enums.account_receivable_recovery_method.${receivable.egcs_fc_effectiverecoverymethod}`) : t('common.none')" />
              <CommonValueCard :label="t('account_receivable.original_amount')" :value="amount(originalAmount)" />
              <CommonValueCard :label="t('account_receivable.approved_amount')" :value="amount(receivable.egcs_fc_approvedamount)" />
              <template v-if="receivable.egcs_fc_outcome === 'posted' && !receivable.egcs_fc_linkedreceivable">
                <CommonValueCard :label="t('account_receivable.recovered')" :value="amount(receivable.egcs_fc_recovered)" />
                <CommonValueCard :label="t('account_receivable.reserved')" :value="amount(receivable.egcs_fc_reserved)" />
                <CommonValueCard :label="t('account_receivable.outstanding')" :value="amount(receivable.egcs_fc_outstanding)" />
              </template>
            </CommonSection>
            <CommonSection :title="t('account_receivable.rationale')" badge="02">
              <CommonValueCard :label="t('account_receivable.financial_id')" :value="(receivable.egcs_fc_linkedreceivable ? receivable.egcs_fc_financialsystemid : receivable.egcs_fc_effectivefinancialsystemid) || t('common.not_available')" />
              <CommonValueCard v-if="!receivable.egcs_fc_linkedreceivable && receivable.egcs_fc_effectiveagencyfinancialid !== receivable.egcs_fc_agencyfinancialid" :label="t('account_receivable.captured_financial_id')" :value="receivable.egcs_fc_financialsystemid || t('common.not_available')" />
              <CommonValueCard :label="t('account_receivable.requested_date')" :value="formatDate(receivable.egcs_fc_requesteddate)" />
              <CommonValueCard :label="t('account_receivable.recovery_method')" :value="receivable.egcs_fc_recoverymethod ? t(`enums.account_receivable_recovery_method.${receivable.egcs_fc_recoverymethod}`) : t('common.none')" />
              <CommonValueCard :label="t('account_receivable.narrative_en')" :value="receivable.egcs_fc_narrative_en || t('common.not_available')" class="min-w-0 [&_p]:break-words [&_p]:whitespace-pre-wrap" />
              <CommonValueCard :label="t('account_receivable.narrative_fr')" :value="receivable.egcs_fc_narrative_fr || t('common.not_available')" class="min-w-0 [&_p]:break-words [&_p]:whitespace-pre-wrap" />
              <CommonValueCard :label="t('account_receivable.recipient_preference')" :value="receivable.egcs_fc_recipientpreference ? t(`enums.account_receivable_recovery_method.${receivable.egcs_fc_recipientpreference}`) : t('common.none')" />
              <template v-if="receivable.egcs_fc_recoverymethod && receivable.egcs_fc_recipientpreference && receivable.egcs_fc_recipientpreference !== receivable.egcs_fc_recoverymethod">
                <CommonValueCard :label="t('account_receivable.override_en')" :value="receivable.egcs_fc_preferenceoverride_en || t('common.not_available')" class="min-w-0 [&_p]:break-words [&_p]:whitespace-pre-wrap" />
                <CommonValueCard :label="t('account_receivable.override_fr')" :value="receivable.egcs_fc_preferenceoverride_fr || t('common.not_available')" class="min-w-0 [&_p]:break-words [&_p]:whitespace-pre-wrap" />
              </template>
            </CommonSection>
          </div>
          <CommonSection v-else-if="selectedTab === 'adjustments'" :show-header="false" :title="t('account_receivable.receivable_adjustments')" :grid-cols="1">
            <p v-if="receivable.egcs_fc_canadjust" class="text-sm text-muted">
              {{ t('account_receivable.adjust_receivable_description') }}
            </p>
            <AccountReceivableDetailActivity :receivable="receivable" :agreement-id="agreementId" @adjust="adjustmentOpen = true" />
            <div v-if="receivable.egcs_fc_creditmemos?.length" class="space-y-3">
              <h3 class="font-semibold">
                {{ t('account_receivable.credit_memos') }}
              </h3>
              <div v-for="memo in receivable.egcs_fc_creditmemos" :key="`${memo.egcs_fc_kind}:${memo.id}`" class="flex items-center justify-between gap-4 text-sm">
                <ULink v-if="memo.egcs_fc_kind === 'cash'" :to="localePath(appRouteLocations.proponentCreditMemoDetail(receivable.egcs_fc_applicantrecipient, memo.id))">{{ memo.egcs_fc_reference }}</ULink>
                <ULink v-else-if="memo.egcs_fc_origin" :to="localePath(appRouteLocations.agreementPaymentDetail(memo.egcs_fc_origin.agreementId, memo.egcs_fc_origin.paymentId))">{{ memo.egcs_fc_reference }}</ULink>
                <span v-else>{{ memo.egcs_fc_reference }}</span>
                <span>{{ amount(memo.egcs_fc_amount) }}</span>
              </div>
            </div>
            <ULink v-if="receivable.egcs_fc_proponentreadable" :to="localePath(appRouteLocations.proponentCreditMemoCollection(receivable.egcs_fc_applicantrecipient))" class="text-sm">{{ t('account_receivable.view_proponent_financial_activity') }}</ULink>
          </CommonSection>
          <section v-else-if="selectedTab === 'completion'" class="space-y-6">
            <UAlert v-if="dirty" color="warning" :title="t('account_receivable.save_before_completion')" /><CommonCompletionPanel :entity-type="entityType" :entity-id="accountReceivableId" :can-complete="receivable.egcs_fc_canedit && !dirty && !saving && status === 'success'" :can-work-workflow="receivable.egcs_fc_canwork" :show-header="false" :show-divider="false" title-key="account_receivable.completion.title" description-key="account_receivable.completion.description" status-complete-key="account_receivable.completion.status_complete" status-locked-key="account_receivable.completion.status_locked" comment-placeholder-key="account_receivable.completion.comment_placeholder" complete-action-key="account_receivable.completion.complete" completed-success-key="account_receivable.completion.completed_success" :refresh-key="refreshKey" @changed="refreshPage" />
          </section>
          <AccountReceivableClaimReductions v-else-if="selectedTab === 'claim-reductions' && receivable.egcs_fc_claimrelated && !receivable.egcs_fc_linkedreceivable" :account-receivable-id="accountReceivableId" :currency="receivable.egcs_fc_currency" :reductions="receivable.egcs_fc_claimreductions ?? []" :can-edit="receivable.egcs_fc_canedit" :can-update="receivable.egcs_fc_caneditrole" @changed="refreshPage" />
          <CommonReviewsTab v-else-if="selectedTab === 'reviews'" :entity-type="entityType" :entity-id="accountReceivableId" :can-update="receivable.egcs_fc_canedit" @changed="refreshPage" />
          <CommonWorkflowSection v-else-if="selectedTab === 'workflows'" :entity-type="entityType" :entity-id="accountReceivableId" purpose="standard" :can-edit="receivable.egcs_fc_canwork" :refresh-key="refreshKey" @changed="refreshPage" />
          <CommonWorkflowSupplementaryInformation v-else-if="selectedTab === 'supplementary-information'" :show-header="false" :entity-type="entityType" :entity-id="accountReceivableId" />
          <CommonAttachmentsTab v-else-if="selectedTab === 'attachments'" :entity-type="entityType" :entity-id="accountReceivableId" />
          <CommonAssignedUsers v-else-if="selectedTab === 'assignments'" :show-header="false" :entity-type="entityType" :entity-id="accountReceivableId" />
        </CommonDetailWorkspace>
      </template>
    </CommonDetailPage>
    <UModal v-if="isEditOpen && receivable && state" v-model:open="isEditOpen" :title="t('common.edit')" :description="t('common.form_dialog_description')" :dismissible="!saving" :close="{ disabled: saving }" :ui="{ content: 'sm:max-w-4xl' }">
      <template #body>
        <UForm :state="state" :validate="createValidator(AccountReceivableSummaryEditSchema)" class="space-y-6" @submit="save">
          <UFormField v-if="receivable.egcs_fc_linkedreceivable" name="egcs_fc_agencyfinancialid" :label="t('account_receivable.financial_id')" required>
            <CommonServerLookupSelect v-model="state.egcs_fc_agencyfinancialid" :fetch-url="`/api/account-receivables/${accountReceivableId}/lookups/financial-ids`" selected-values-query-key="selectedIds" value-key="id" label-en-key="label_en" label-fr-key="label_fr" :disabled="saving || !receivable.egcs_fc_canedit" close-on-select />
          </UFormField>
          <div v-else class="space-y-1 text-sm">
            <p>{{ t('account_receivable.financial_id') }}: {{ receivable.egcs_fc_effectivefinancialsystemid }}</p>
            <p v-if="receivable.egcs_fc_effectiveagencyfinancialid !== receivable.egcs_fc_agencyfinancialid" class="text-muted">
              {{ t('account_receivable.captured_financial_id') }}: {{ receivable.egcs_fc_financialsystemid }}
            </p>
          </div>
          <p id="account-receivable-rationale-instruction" class="text-sm text-muted">
            {{ t('account_receivable.rationale_instruction') }}
          </p>
          <div class="grid gap-4 md:grid-cols-2">
            <UFormField name="egcs_fc_requesteddate" :label="t('account_receivable.requested_date')">
              <CommonDatePicker v-model="state.egcs_fc_requesteddate" :disabled="saving || !receivable.egcs_fc_canedit" />
            </UFormField>
            <UFormField name="egcs_fc_recoverymethod" :label="t('account_receivable.recovery_method')">
              <CommonEnumSelect v-model="state.egcs_fc_recoverymethod" name="account_receivable_recovery_method" :disabled="saving || !receivable.egcs_fc_canedit" class="w-full" />
              <UButton v-if="state.egcs_fc_recoverymethod && receivable.egcs_fc_canedit" type="button" icon="i-lucide-x" color="neutral" variant="ghost" :label="t('account_receivable.clear_recovery_method')" :disabled="saving" @click="state.egcs_fc_recoverymethod = undefined" />
            </UFormField>
            <UFormField name="egcs_fc_narrative_en" :label="t('account_receivable.narrative_en')">
              <UTextarea v-model="state.egcs_fc_narrative_en" :readonly="!receivable.egcs_fc_canedit" :disabled="saving" aria-describedby="account-receivable-rationale-instruction" class="w-full" :rows="4" />
            </UFormField>
            <UFormField name="egcs_fc_narrative_fr" :label="t('account_receivable.narrative_fr')">
              <UTextarea v-model="state.egcs_fc_narrative_fr" :readonly="!receivable.egcs_fc_canedit" :disabled="saving" aria-describedby="account-receivable-rationale-instruction" class="w-full" :rows="4" />
            </UFormField>
          </div>
          <UFormField name="egcs_fc_recipientpreference" :label="t('account_receivable.recipient_preference')" :description="t('account_receivable.preference_description')">
            <CommonEnumSelect v-model="state.egcs_fc_recipientpreference" name="account_receivable_recovery_method" :disabled="saving || !receivable.egcs_fc_canedit" class="w-full" />
            <UButton v-if="state.egcs_fc_recipientpreference && receivable.egcs_fc_canedit" type="button" icon="i-lucide-x" color="neutral" variant="ghost" :label="t('account_receivable.clear_preference')" :disabled="saving" @click="state.egcs_fc_recipientpreference = undefined" />
          </UFormField>
          <template v-if="state.egcs_fc_recoverymethod && state.egcs_fc_recipientpreference && state.egcs_fc_recipientpreference !== state.egcs_fc_recoverymethod">
            <p id="account-receivable-override-instruction" class="text-sm text-muted">
              {{ t('account_receivable.override_instruction') }}
            </p>
            <div class="grid gap-4 md:grid-cols-2">
              <UFormField name="egcs_fc_preferenceoverride_en" :label="t('account_receivable.override_en')">
                <UTextarea v-model="state.egcs_fc_preferenceoverride_en" :readonly="!receivable.egcs_fc_canedit" :disabled="saving" aria-describedby="account-receivable-override-instruction" class="w-full" />
              </UFormField><UFormField name="egcs_fc_preferenceoverride_fr" :label="t('account_receivable.override_fr')">
                <UTextarea v-model="state.egcs_fc_preferenceoverride_fr" :readonly="!receivable.egcs_fc_canedit" :disabled="saving" aria-describedby="account-receivable-override-instruction" class="w-full" />
              </UFormField>
            </div>
          </template>
          <div class="flex justify-end gap-2">
            <UButton :label="t('common.cancel')" color="neutral" variant="ghost" :disabled="saving" @click="isEditOpen = false" />
            <CommonSaveButton :label="t('common.save')" :loading="saving" :disabled="saving || !receivable.egcs_fc_canedit || status !== 'success'" />
          </div>
        </UForm>
      </template>
    </UModal>
    <AccountReceivableCancelModal v-model:open="cancelOpen" :record-id="accountReceivableId" @cancelled="refreshPage" />
    <AccountReceivableCreateModal v-if="receivable" v-model:open="adjustmentOpen" :agreement-id="agreementId" :adjustment="receivable" @created="adjustmentCreated" />
    <AccountReceivableCreditMemoCreateModal v-if="receivable" v-model:open="creditMemoOpen" :context="{ egcs_fc_receivable: accountReceivableId, egcs_fc_applicantrecipient: receivable.egcs_fc_applicantrecipient, egcs_fc_debtorname_en: receivable.egcs_fc_debtorname_en, egcs_fc_debtorname_fr: receivable.egcs_fc_debtorname_fr, egcs_fc_agency: receivable.egcs_fc_statusagency, egcs_fc_currency: receivable.egcs_fc_currency }" @created="creditMemoCreated" />
  </div>
</template>
