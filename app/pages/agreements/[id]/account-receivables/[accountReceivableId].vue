<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- Independent AR casework follows the Correction request and workspace shell. */
import { computed, nextTick, ref, watch } from 'vue'
import type { Ref } from 'vue'
import CommonCompletionPanel from '~/components/Common/Completions/Panel.vue'
import type { AccountReceivableDetail } from '~~/shared/types/account-receivable'
import { AccountReceivableEditSchema } from '~~/shared/types/schemas/account-receivable'
import { appRouteLocations, authorizedRouteLocation } from '~/utils/route-locations'
import { accountReceivableReference, formatAccountReceivableAmount } from '~/utils/account-receivable-display'
import { AppFetchResponseError } from '~/utils/fetch-error'
import { parseMoneyText, moneyToCents } from '~~/shared/utils/money'

definePageMeta({ key: route => route.path, i18n: { paths: {
  en: '/agreements/[id]/account-receivables/[accountReceivableId]', fr: '/ententes/[id]/comptes-debiteurs/[accountReceivableId]'
} } })
const { t, locale } = useI18n()
const route = useRoute()
const localePath = useLocalePath()
const toast = useToast()
const { getHeroCollapsed } = useDashboard()
const { createValidator } = useZodI18n()
const { showError } = useApiErrorToast()
const { sendJson } = useJsonRequest()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const { formatDate } = useDateHelpers()
const agreementId = computed(() => String(route.params.id))
const accountReceivableId = computed(() => String(route.params.accountReceivableId))
const isHeroCollapsed = getHeroCollapsed('agreement-account-receivable-detail')
const { data: receivable, status, error: detailError, refresh } = useAccountReceivableDetail(agreementId, accountReceivableId)
const approvalOnly = computed(() => !receivable.value && status.value === 'error'
  && detailError.value instanceof AppFetchResponseError && detailError.value.response.status === 403)
const selectedTab: Ref<string> = ref('lines')
const refreshKey: Ref<number> = ref(0)
const saving: Ref<boolean> = ref(false)
const cancelOpen: Ref<boolean> = ref(false)
const adjustmentOpen: Ref<boolean> = ref(false)
const creditMemoOpen: Ref<boolean> = ref(false)
const detailContent: Ref<HTMLElement | null> = ref(null)
type FormState = {
  egcs_fc_requesteddate: string | Date | null
  egcs_fc_recoverymethod: 'offset' | 'direct_repayment' | undefined
  egcs_fc_narrative_en: string
  egcs_fc_narrative_fr: string
  egcs_fc_recipientpreference: string | undefined
  egcs_fc_preferenceoverride_en: string
  egcs_fc_preferenceoverride_fr: string
  egcs_fc_lines: Array<{ id: string, egcs_fc_amount: string, egcs_fc_accountreceivablechartofaccount: string | undefined }>
}
const state: Ref<FormState | null> = ref(null)
const savedState: Ref<string> = ref('')
const dirty = computed(() => state.value !== null && JSON.stringify(state.value) !== savedState.value)
const hydrate = (detail: AccountReceivableDetail) => {
  state.value = {
    egcs_fc_requesteddate: detail.egcs_fc_requesteddate.slice(0, 10),
    egcs_fc_recoverymethod: detail.egcs_fc_recoverymethod ?? undefined,
    egcs_fc_narrative_en: detail.egcs_fc_narrative_en,
    egcs_fc_narrative_fr: detail.egcs_fc_narrative_fr,
    egcs_fc_recipientpreference: detail.egcs_fc_recipientpreference ?? undefined,
    egcs_fc_preferenceoverride_en: detail.egcs_fc_preferenceoverride_en,
    egcs_fc_preferenceoverride_fr: detail.egcs_fc_preferenceoverride_fr,
    egcs_fc_lines: detail.egcs_fc_lines.map(line => ({ id: line.id, egcs_fc_amount: line.egcs_fc_amount, egcs_fc_accountreceivablechartofaccount: line.egcs_fc_accountreceivablechartofaccount ?? undefined }))
  }
  savedState.value = JSON.stringify(state.value)
}
watch(receivable, detail => {
  if (!detail) {
    state.value = null
    savedState.value = ''
    return
  }
  if (!dirty.value || !detail.egcs_fc_canedit) hydrate(detail)
}, { immediate: true })
watch([agreementId, accountReceivableId], () => {
  state.value = null
  savedState.value = ''
  saving.value = false
  cancelOpen.value = false
  adjustmentOpen.value = false
  creditMemoOpen.value = false
}, { flush: 'sync' })
const tabs = [
  { key: 'account_receivable.financial_lines', value: 'lines', icon: 'i-lucide-list' },
  { key: 'account_receivable.financial_basis', value: 'basis', icon: 'i-lucide-history' },
  { key: 'account_receivable.recoveries', value: 'recoveries', icon: 'i-lucide-banknote-arrow-down' },
  { key: 'account_receivable.completion.title', value: 'completion', icon: 'i-lucide-circle-check-big' },
  { key: 'reviews.title', value: 'reviews', icon: 'i-lucide-clipboard-check' },
  { key: 'workflow.title', value: 'workflows', icon: 'i-lucide-workflow' },
  { key: 'attachments.title', value: 'attachments', icon: 'i-lucide-paperclip' },
  { key: 'assignments.title', value: 'assignments', icon: 'i-lucide-users' }
]
const amount = (value: string | null | undefined) => formatAccountReceivableAmount(value, locale.value, receivable.value?.egcs_fc_currency ?? 'cad') ?? t('common.not_available')
const chartRequired = (index: number) => {
  try {
    return moneyToCents(parseMoneyText(state.value?.egcs_fc_lines[index]?.egcs_fc_amount ?? '')) !== BigInt(0)
  } catch {
    return false
  }
}
const canEditLineAmount = (index: number) => receivable.value?.egcs_fc_canedit === true
  && (!receivable.value.egcs_fc_linkedreceivable || Boolean(receivable.value.egcs_fc_lines[index]?.egcs_fc_accountreceivablechartofaccount))
const showCollectionState = computed(() => receivable.value?.egcs_fc_outcome === 'posted')
const heroBadges = computed(() => receivable.value
  ? [{ statusId: receivable.value.egcs_fc_status }, ...(showCollectionState.value
      ? [{ label: t(`account_receivable.collection_states.${receivable.value.egcs_fc_collectionstate}`), prefixLabel: t('account_receivable.collection_state'), uiVariant: 'outline' as const }]
      : [])]
  : [])
const balances = computed(() => receivable.value
  ? [
      { key: 'principal', value: receivable.value.egcs_fc_principal },
      { key: 'recovered', value: receivable.value.egcs_fc_recovered },
      { key: 'reserved', value: receivable.value.egcs_fc_reserved },
      { key: 'outstanding', value: receivable.value.egcs_fc_outstanding }
    ]
  : [])
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
  if (!state.value || !receivable.value?.egcs_fc_canedit || saving.value) return
  const owner = accountReceivableId.value
  const submitted = JSON.stringify(state.value)
  saving.value = true
  try {
    await sendJson(`/api/account-receivables/${owner}`, 'PATCH', AccountReceivableEditSchema.parse(state.value))
    if (accountReceivableId.value !== owner) return
    if (await refresh() && receivable.value && JSON.stringify(state.value) === submitted) hydrate(receivable.value)
    refreshKey.value += 1
    toast.add({ title: t('common.success'), description: t('common.updated_success'), color: 'success' })
  } catch (failure) {
    if (accountReceivableId.value === owner) showError(failure)
  } finally {
    if (accountReceivableId.value === owner) saving.value = false
  }
}
const deleteDraft = async () => {
  const owner = accountReceivableId.value
  if (await confirmDeleteRequest(`/api/account-receivables/${owner}`) && owner === accountReceivableId.value) await navigateTo(localePath(appRouteLocations.agreementAccountReceivableCollection(agreementId.value)))
}
const heroActions = computed(() => [
  { label: t('account_receivable.create_adjustment'), color: 'neutral' as const, variant: 'outline' as const, icon: 'i-lucide-file-plus-2', visible: receivable.value?.egcs_fc_canadjust === true, onClick: () => {
    adjustmentOpen.value = true
  } },
  { label: t('account_receivable.record_credit_memo'), color: 'neutral' as const, variant: 'outline' as const, icon: 'i-lucide-banknote-arrow-down', visible: receivable.value?.egcs_fc_cancreditmemo === true, onClick: () => {
    creditMemoOpen.value = true
  } },
  { label: t('account_receivable.cancel'), color: 'neutral' as const, variant: 'outline' as const, visible: receivable.value?.egcs_fc_cancancel === true, onClick: () => {
    cancelOpen.value = true
  } },
  { label: t('common.delete'), color: 'error' as const, variant: 'ghost' as const, icon: 'i-lucide-trash', visible: receivable.value?.egcs_fc_candelete === true, onClick: deleteDraft }
])
const adjustmentCreated = async (id: string) => {
  await navigateTo(localePath(appRouteLocations.agreementAccountReceivableDetail(agreementId.value, id)))
}
const creditMemoCreated = async (id: string, ownerAgreement: string) => {
  await navigateTo(localePath(appRouteLocations.agreementAccountReceivableCreditMemoDetail(ownerAgreement, id)))
}
</script>

<template>
  <div ref="detailContent" tabindex="-1" class="flex w-full min-w-0 flex-col">
    <AccountReceivableApprovalWorkspace v-if="approvalOnly" :agreement-id="agreementId" :account-receivable-id="accountReceivableId" />
    <UAlert v-else-if="status === 'error'" color="error" icon="i-lucide-circle-alert" :title="t('common.resource_table_load_failed')" :description="t('common.resource_table_load_failed_description')">
      <template #actions>
        <UButton color="error" variant="soft" :label="t('common.retry')" icon="i-lucide-refresh-cw" @click="retryLoad" />
      </template>
    </UAlert>
    <div v-else-if="!receivable && status === 'pending'" role="status" aria-live="polite" class="flex min-h-32 items-center justify-center gap-2 text-sm text-muted">
      <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" aria-hidden="true" /><span>{{ t('common.loading_records') }}</span>
    </div>
    <UDashboardPanel v-if="receivable && state" id="agreement-account-receivable-detail" class="min-w-0 flex-1">
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
        <CommonEntityHero :is-collapsed="isHeroCollapsed" icon="i-lucide-hand-coins" :title="accountReceivableReference(receivable)" :meta-items="[`${t('account_receivable.agreement')}: ${receivable.egcs_fc_agreementnumber}`, locale === 'fr' ? receivable.egcs_fc_debtorname_fr : receivable.egcs_fc_debtorname_en, locale === 'fr' ? receivable.egcs_fc_typename_fr : receivable.egcs_fc_typename_en, receivable.egcs_fc_fiscalyeardisplay, receivable.egcs_fc_currency.toUpperCase()]" :badges="heroBadges" :actions="heroActions" />
        <ULink v-if="receivable.egcs_fc_linkedreceivable" :to="localePath(appRouteLocations.agreementAccountReceivableDetail(agreementId, receivable.egcs_fc_linkedreceivable))" class="mb-4 text-sm">{{ t('account_receivable.linked_receivable') }}</ULink>
        <CommonEntityEditorWorkspace content-test-id="agreement-account-receivable-detail-content">
          <template #sidebar>
            <CommonRouteTabs v-model="selectedTab" :items="tabs" orientation="vertical" :ui="{ root: 'w-full', list: 'w-full flex-col items-stretch p-0', trigger: 'w-full justify-start' }" />
          </template>
          <UForm v-if="selectedTab === 'lines'" :state="state" :validate="createValidator(AccountReceivableEditSchema)" class="space-y-8" @submit="save">
            <CommonSection :title="t('account_receivable.financial_lines')" :grid-cols="1">
              <p class="text-sm text-muted">
                {{ locale === 'fr' ? receivable.egcs_fc_typedescription_fr : receivable.egcs_fc_typedescription_en }}
              </p>
              <p v-if="receivable.egcs_fc_postedat" class="text-sm">
                <span class="text-muted">{{ t('account_receivable.current_recovery_method') }}:</span>
                {{ t(`enums.account_receivable_recovery_method.${receivable.egcs_fc_effectiverecoverymethod}`) }}
              </p>
              <dl :aria-label="t('account_receivable.balance')" class="grid gap-4 border-y border-default py-4 text-sm sm:grid-cols-2 2xl:grid-cols-4">
                <div v-for="balance in balances" :key="balance.key">
                  <dt class="text-muted">
                    {{ t(`account_receivable.${balance.key}`) }}
                  </dt><dd class="mt-1 font-semibold">
                    {{ amount(balance.value) }}
                  </dd>
                </div>
              </dl>
              <p v-if="showCollectionState" class="text-sm text-muted">
                {{ t(`account_receivable.collection_states.${receivable.egcs_fc_collectionstate}`) }}
              </p>
              <p id="account-receivable-amount-instruction" class="text-sm text-muted">
                {{ t(receivable.egcs_fc_linkedreceivable ? 'account_receivable.adjustment_instruction' : 'account_receivable.amount_instruction') }}
              </p>
              <AccountReceivableSourceLines :lines="receivable.egcs_fc_lines" :currency="receivable.egcs_fc_currency">
                <template v-if="receivable.egcs_fc_canedit" #coding="{ line, index }">
                  <UFormField v-if="!receivable.egcs_fc_linkedreceivable" :name="`egcs_fc_lines.${index}.egcs_fc_accountreceivablechartofaccount`" :label="t('account_receivable.receivable_account')" :description="t('account_receivable.receivable_account_description')" :required="chartRequired(index)">
                    <CommonServerLookupSelect v-model="state.egcs_fc_lines[index]!.egcs_fc_accountreceivablechartofaccount" :fetch-url="`/api/account-receivables/${accountReceivableId}/lookups/charts`" :query="{ egcs_fc_agencyfiscalyear: receivable.egcs_fc_agencyfiscalyear }" selected-values-query-key="selectedIds" value-key="id" label-en-key="label_en" label-fr-key="label_fr" :show-value-in-label="false" :disabled="saving" close-on-select />
                  </UFormField>
                  <CorrectionAccountingDimensions v-else-if="line.egcs_fc_accountreceivablechartofaccount" :dimensions="line.egcs_fc_accountreceivableaccountingdimensions" />
                  <p v-else class="text-sm text-muted">
                    {{ t('account_receivable.adjustment_source_unavailable') }}
                  </p>
                </template>
                <template #amount="{ line, index }">
                  <UFormField v-if="canEditLineAmount(index)" :name="`egcs_fc_lines.${index}.egcs_fc_amount`" :label="t('account_receivable.source_amount', { number: index + 1 })">
                    <UInput v-model="state.egcs_fc_lines[index]!.egcs_fc_amount" type="text" inputmode="decimal" aria-describedby="account-receivable-amount-instruction" :disabled="saving" class="w-full" />
                  </UFormField>
                  <p v-else class="text-sm font-semibold">
                    {{ t('account_receivable.established_amount') }}: {{ amount(line.egcs_fc_amount) }}
                  </p>
                </template>
              </AccountReceivableSourceLines>
            </CommonSection>
            <CommonSection :title="t('account_receivable.rationale')" :grid-cols="1">
              <p id="account-receivable-rationale-instruction" class="text-sm text-muted">
                {{ t('account_receivable.rationale_instruction') }}
              </p>
              <div class="grid gap-4 md:grid-cols-2">
                <UFormField name="egcs_fc_requesteddate" :label="t('account_receivable.requested_date')">
                  <CommonDatePicker v-model="state.egcs_fc_requesteddate" :disabled="saving || !receivable.egcs_fc_canedit" />
                </UFormField>
                <UFormField name="egcs_fc_recoverymethod" :label="t('account_receivable.recovery_method')" :description="receivable.egcs_fc_canedit ? t('account_receivable.recovery_method_instruction') : undefined">
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
              <div v-if="receivable.egcs_fc_canedit" class="flex justify-end gap-2">
                <CommonSaveButton :label="t('common.save')" :loading="saving" :disabled="saving || status !== 'success'" />
              </div>
            </CommonSection>
          </UForm>
          <CommonSection v-else-if="selectedTab === 'basis'" :title="t('account_receivable.financial_basis')" :grid-cols="1">
            <p class="text-sm text-muted">
              {{ t('account_receivable.basis_provenance') }}
            </p><AccountReceivableSourceLines :lines="receivable.egcs_fc_lines" :currency="receivable.egcs_fc_currency" />
          </CommonSection>
          <CommonSection v-else-if="selectedTab === 'recoveries'" :title="t('account_receivable.recoveries')" :grid-cols="1">
            <p v-if="!receivable.egcs_fc_recoveries.length" class="text-sm text-muted">
              {{ t('common.none') }}
            </p>
            <dl v-for="recovery in receivable.egcs_fc_recoveries" :key="recovery.id" class="grid gap-4 border-t border-default py-4 text-sm sm:grid-cols-3">
              <div>
                <dt class="text-muted">
                  {{ t('account_receivable.recovery_kind') }}
                </dt><dd>{{ t(recovery.egcs_fc_payment ? 'account_receivable.automatic_offset' : 'account_receivable.manual_credit_memo') }} · {{ recovery.egcs_fc_creditmemoreference }}</dd>
              </div><div>
                <dt class="text-muted">
                  {{ t('account_receivable.recovery_outcome') }}
                </dt><dd>{{ t(`account_receivable.recovery_outcomes.${recovery.egcs_fc_outcome}`) }}</dd>
              </div><div>
                <dt class="text-muted">
                  {{ t('account_receivable.recovery_amount') }}
                </dt><dd>{{ amount(recovery.egcs_fc_amount) }}</dd>
              </div><div>
                <dt class="text-muted">
                  {{ t('account_receivable.created_at') }}
                </dt><dd>{{ formatDate(recovery.egcs_fc_createdat) }}</dd>
              </div>
            </dl>
            <div v-if="receivable.egcs_fc_adjustments.length" class="space-y-2">
              <h3 class="text-sm font-semibold">
                {{ t('account_receivable.adjustments') }}
              </h3><ULink v-for="adjustment in receivable.egcs_fc_adjustments" :key="adjustment.id" :to="localePath(appRouteLocations.agreementAccountReceivableDetail(agreementId, adjustment.id))" class="block text-sm">{{ accountReceivableReference(adjustment) }}</ULink>
            </div>
          </CommonSection>
          <section v-else-if="selectedTab === 'completion'" class="space-y-6">
            <UAlert v-if="dirty" color="warning" :title="t('account_receivable.save_before_completion')" /><CommonCompletionPanel entity-type="fundingcaseaccountreceivable" :entity-id="accountReceivableId" :can-complete="receivable.egcs_fc_canedit && !dirty && !saving && status === 'success'" :can-work-workflow="receivable.egcs_fc_canwork" :hide-title="false" :show-divider="false" title-key="account_receivable.completion.title" description-key="account_receivable.completion.description" status-complete-key="account_receivable.completion.status_complete" status-locked-key="account_receivable.completion.status_locked" comment-placeholder-key="account_receivable.completion.comment_placeholder" complete-action-key="account_receivable.completion.complete" completed-success-key="account_receivable.completion.completed_success" :refresh-key="refreshKey" @changed="refreshPage" />
          </section>
          <CommonReviewsTab v-else-if="selectedTab === 'reviews'" entity-type="fundingcaseaccountreceivable" :entity-id="accountReceivableId" :can-update="receivable.egcs_fc_canedit" @changed="refreshPage" />
          <CommonWorkflowSection v-else-if="selectedTab === 'workflows'" entity-type="fundingcaseaccountreceivable" :entity-id="accountReceivableId" purpose="standard" :can-edit="receivable.egcs_fc_canwork" :refresh-key="refreshKey" @changed="refreshPage" />
          <CommonAttachmentsTab v-else-if="selectedTab === 'attachments'" entity-type="fundingcaseaccountreceivable" :entity-id="accountReceivableId" />
          <CommonAssignedUsers v-else-if="selectedTab === 'assignments'" entity-type="fundingcaseaccountreceivable" :entity-id="accountReceivableId" />
        </CommonEntityEditorWorkspace>
      </template>
    </UDashboardPanel>
    <AccountReceivableCancelModal v-model:open="cancelOpen" :record-id="accountReceivableId" @cancelled="refreshPage" />
    <AccountReceivableCreateModal v-if="receivable" v-model:open="adjustmentOpen" :agreement-id="agreementId" :adjustment="receivable" @created="adjustmentCreated" />
    <AccountReceivableCreditMemoCreateModal v-if="receivable" v-model:open="creditMemoOpen" :receivable="receivable" @created="creditMemoCreated" />
  </div>
</template>
