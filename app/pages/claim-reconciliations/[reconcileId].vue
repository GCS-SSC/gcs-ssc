<script setup lang="ts">
import { useActionContext } from '~/composables/useActionContext'
import { useFormSession } from '~/composables/useFormSession'
import { useCrudModal } from '~/composables/useCrudModal'
import { useReconcileAllAmounts } from '~/composables/useReconcileAllAmounts'
import { useFieldTooltipProvider } from '~/composables/useFieldTooltipProvider'
import type { LocalizedToastText } from '~/composables/useLocalizedToast'
import { usePageResourceError } from '~/composables/usePageResourceError'
import CommonCompletionSection from '~/components/Common/Completions/Section.vue'
/* eslint-disable jsdoc/require-jsdoc -- concise page-local interaction handlers are self-documenting */
import { computed, onScopeDispose, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { parseOptionalMoneyInput } from '~/utils/optional-money-input'
import { appRouteLocations, authorizedRouteLocation } from '~/utils/route-locations'
import { FundingCaseAgreementClaimReconcileLineItemBaseSchema } from '~~/shared/types/schemas/funding-case-agreement'
import type { BusinessRecordStateFields } from '~~/shared/types/business-record-state'
import type { AgreementClaimReconciliationTableLine } from '~~/shared/types/agreement-claim-reconciliation-ui'
import { formatMoneyText, parseMoney, zeroMoney, sumMoney, type Money, type MoneyInput } from '~~/shared/utils/money'

type ReconciliationLine = {
  claim_line_id: string
  reconcile_line_id: string | null
  description: string
  organization_cost_category_name_en?: string | null
  organization_cost_category_name_fr?: string | null
  egcs_fc_costsubsection?: string | null
  submitted_cost_category?: string | null
  submitted_cost_subsection?: string | null
  submitted_line_item: string | null
  submitted_amount: Money
  egcs_fc_reconciled: Money | null
  egcs_fc_sampled: Money | null
  egcs_fc_rationale: string | null
}
type ReconciliationDetail = {
  reconciliation: BusinessRecordStateFields & {
    id: string
    egcs_fc_fundingagreementclaim: string
    egcs_fc_status: string
    egcs_fc_isfinal: boolean
    egcs_fc_isopen: boolean
    agreement_id: string
    agreement_number: string | null
    egcs_fc_currency: string
    agreement_title_en: string | null
    agreement_title_fr: string | null
    claim_status: string
    egcs_tp_hidecostcategory?: boolean
    egcs_tp_hidecostsubsection?: boolean
  }
  lines: ReconciliationLine[]
  can_read: boolean
  can_update_role: boolean
  can_update: boolean
  can_cancel: boolean
  can_read_agreement: boolean
  can_read_claim: boolean
  can_manage_assignments: boolean
  is_assigned: boolean
  is_primary: boolean
}
const fetchReconciliationDetail = $fetch as unknown as (url: string) => Promise<ReconciliationDetail>
const mutateReconciliation = $fetch as unknown as (
  url: string,
  options: { method: 'POST' | 'PATCH'; body?: unknown }
) => Promise<unknown>

definePageMeta({
  key: route => route.path,
  i18n: {
    paths: {
      en: '/claim-reconciliations/[reconcileId]',
      fr: '/rapprochements-de-demandes/[reconcileId]'
    }
  }
})

const route = useRoute()
const { locale, t } = useI18n()
const { getBilingualValue } = useBilingualValue()
const localePath = useLocalePath()
const toast = useLocalizedToast()
const { showError } = useApiErrorToast()
const { getHeroCollapsed } = useDashboard()
const reconcileId = String(route.params.reconcileId)
const isHeroCollapsed = getHeroCollapsed('claim-reconciliation-detail')
const {
  data,
  error,
  status,
  refresh
} = await useAsyncData(
  `claim-reconciliation-${reconcileId}`,
  () => fetchReconciliationDetail(`/api/claim-reconciliations/${reconcileId}`)
)
const getCurrency = (): string => {
  const currency = data.value?.reconciliation.egcs_fc_currency
  if (!currency) throw new Error('Agreement currency is unavailable.')
  return currency
}
const zeroAmount = () => zeroMoney(getCurrency())
usePageResourceError({ identity: () => route.path, errors: [error], pending: () => status.value === 'pending', hasContent: () => Boolean(data.value) })

type ReconciliationWrite = 'line' | 'all' | 'final' | 'cancel'
const pendingWrite: Ref<ReconciliationWrite | null> = ref(null)
const reconcileAll = useReconcileAllAmounts()
type LineDraft = AgreementClaimReconciliationTableLine & {
  egcs_fc_reconciled: MoneyInput
  egcs_fc_sampled: MoneyInput
  egcs_fc_rationale: string
}
const lineModal = useCrudModal<AgreementClaimReconciliationTableLine, LineDraft>({
  updateState: line => ({
    ...line,
    egcs_fc_reconciled: line.reconciledAmount,
    egcs_fc_sampled: line.sampledAmount,
    egcs_fc_rationale: line.rationale
  })
})
const { createValidator } = useZodI18n()
const validateReconcileLine = createValidator(FundingCaseAgreementClaimReconcileLineItemBaseSchema.pick({
  egcs_fc_reconciled: true,
  egcs_fc_sampled: true,
  egcs_fc_rationale: true
}))
const selectedLine = lineModal.selected
const isLineModalOpen = lineModal.isOpen
const readbackFailed = ref(false)
const isRetryingLoad: Ref<boolean> = ref(false)
const { recoveryFocusTarget, focusRecoveredContent } = useLoadRecoveryFocus()
const approvalsRefreshKey: Ref<number> = ref(0)
let isDisposed = false
onScopeDispose(() => {
  isDisposed = true
})
const isCurrentPage = () => !isDisposed && String(route.params.reconcileId) === reconcileId
  && data.value?.reconciliation.id === reconcileId
const canUpdateRole = computed(() => data.value?.can_update_role === true)
const isMutationPending = computed(() => pendingWrite.value !== null)
const workflowPrerequisiteWarning = computed(() => {
  if (!data.value?.is_assigned) return toast.localized('assignments.read_only_description')
  if (!data.value.can_cancel) return toast.localized('agreement.claims.action_unavailable')
  return undefined
})
const editPrerequisiteWarning = computed(() => workflowPrerequisiteWarning.value
  ?? (!data.value?.can_update ? toast.localized('agreement.claims.action_unavailable') : undefined))
const actionContext = useActionContext({
  identity: [() => route.params.reconcileId, () => data.value?.reconciliation.id],
  authority: canUpdateRole,
  eligible: () => isCurrentPage() && status.value === 'success' && !editPrerequisiteWarning.value
})
const guardAction = (warning: LocalizedToastText | undefined): boolean => {
  if (!isCurrentPage() || status.value !== 'success') return false
  if (!canUpdateRole.value || warning) {
    toast.add({ title: toast.localized('common.warning'), description: warning ?? toast.localized('agreement.claims.action_unavailable'), color: 'warning' })
    return false
  }
  return true
}

const tabs = [
  { key: 'agreement.claims.reconcile_selected_title', value: 'reconciliation', icon: 'i-lucide-list-checks' },
  { key: 'agreement.claims.reconcile_completion.title', value: 'completion', icon: 'i-lucide-circle-check-big' },
  { key: 'reviews.title', value: 'reviews', icon: 'i-lucide-clipboard-check' },
  { key: 'workflow.title', value: 'workflows', icon: 'i-lucide-workflow' },
  { key: 'supplementary_information.title', value: 'supplementary-information', icon: 'i-lucide-clipboard-list' },
  { key: 'attachments.title', value: 'attachments', icon: 'i-lucide-paperclip' },
  { key: 'assignments.title', value: 'assignments', icon: 'i-lucide-users' }
]
const { selectedTab } = useUrlTabState({ tabs, defaultTab: 'reconciliation' })
watch([() => data.value?.can_update, selectedTab], ([canUpdate, tab]) => {
  if (tab !== 'reconciliation' || (selectedLine.value?.editable && !canUpdate)) lineModal.close()
})

const retryLoad = async () => {
  if (isRetryingLoad.value) return
  isRetryingLoad.value = true
  try {
    await refreshWorkspace()
    if (isCurrentPage() && !readbackFailed.value) await focusRecoveredContent()
  } finally {
    isRetryingLoad.value = false
  }
}

const refreshWorkspace = async () => {
  const previous = data.value
  await refresh()
  if (isDisposed || String(route.params.reconcileId) !== reconcileId) return
  readbackFailed.value = status.value === 'error'
  if (readbackFailed.value && !data.value && previous) data.value = previous
}

const breadcrumbItems = computed(() => {
  const agreementsItem = { label: t('agreement.title'), to: localePath(appRouteLocations.agreements()) }
  if (!data.value) return [agreementsItem]

  return [
    agreementsItem,
    {
      label: getBilingualValue(data.value?.reconciliation, 'agreement_title', data.value?.reconciliation.agreement_number ?? '-'),
      to: authorizedRouteLocation(
        data.value.can_read_agreement,
        localePath(appRouteLocations.agreementDetail(data.value.reconciliation.agreement_id))
      )
    },
    {
      label: t('agreement.claims.claim_label', { id: data.value.reconciliation.egcs_fc_fundingagreementclaim }),
      to: authorizedRouteLocation(
        data.value.can_read_claim,
        localePath(appRouteLocations.agreementClaimDetail(
          data.value.reconciliation.agreement_id,
          data.value.reconciliation.egcs_fc_fundingagreementclaim
        ))
      )
    },
    { label: t('agreement.claims.reconcile_label_with_id', { id: reconcileId }) }
  ]
})
const getLineName = (line: ReconciliationLine) => line.submitted_line_item || line.description || t('agreement.claims.line_label', { id: line.claim_line_id })
const totalSubmitted = computed(() => sumMoney(data.value?.lines.map(line => line.submitted_amount) ?? [], getCurrency()))
const totalReconciled = computed(() => sumMoney(data.value?.lines.flatMap(line => line.egcs_fc_reconciled ?? []) ?? [], getCurrency()))
const totalSampled = computed(() => sumMoney(data.value?.lines.flatMap(line => line.egcs_fc_sampled ?? []) ?? [], getCurrency()))
const reconciliationTableLines = computed<AgreementClaimReconciliationTableLine[]>(() => (data.value?.lines ?? []).map(line => ({
  id: line.claim_line_id,
  name: getLineName(line),
  description: line.description,
  costCategory: line.submitted_cost_category?.trim()
    || getBilingualValue(line, 'organization_cost_category_name', t('common.all')),
  costSubsection: line.submitted_cost_subsection?.trim()
    || line.egcs_fc_costsubsection
    || t('common.all'),
  submittedAmount: line.submitted_amount,
  reconciledAmount: line.egcs_fc_reconciled ?? zeroAmount(),
  sampledAmount: line.egcs_fc_sampled,
  rationale: line.egcs_fc_rationale ?? '',
  editable: data.value?.can_update === true && !data.value.reconciliation.isCompleted
})))

const openLineEditor = (line: AgreementClaimReconciliationTableLine) => {
  if (!isCurrentPage() || isMutationPending.value) return
  if (line.editable && !guardAction(editPrerequisiteWarning.value)) return
  lineModal.openUpdate(line)
}

const saveLine = async () => {
  const line = selectedLine.value
  const session = lineModal.captureSession()
  const detail = data.value?.lines.find(item => item.claim_line_id === line?.id)
  if (!line?.editable || !detail || isMutationPending.value || !guardAction(editPrerequisiteWarning.value)) return

  const context = actionContext.capture()
  if (!context?.canDispatch()) return
  pendingWrite.value = 'line'
  try {
    const body = {
      egcs_fc_reconciled: parseMoney(line.egcs_fc_reconciled),
      egcs_fc_sampled: parseOptionalMoneyInput(line.egcs_fc_sampled),
      egcs_fc_rationale: line.egcs_fc_rationale.trim() || null
    }
    const base = `/api/claim-reconciliations/${reconcileId}/lines`
    if (detail.reconcile_line_id) {
      await mutateReconciliation(`${base}/${detail.reconcile_line_id}`, { method: 'PATCH', body })
    } else {
      await mutateReconciliation(base, {
        method: 'POST',
        body: { ...body, egcs_fc_fundingagreementclaimreconcile: reconcileId, egcs_fc_lineitem: detail.claim_line_id }
      })
    }
    if (!isCurrentPage()) return
    if (context.isCurrent() && lineModal.closeSession(session)) {
      toast.add({ title: toast.localized('common.success'), description: toast.localized('agreement.claims.saved_reconcile_line'), color: 'success' })
    }
    await refreshWorkspace()
  } catch (caughtError: unknown) {
    if (context.isCurrent() && lineModal.isCurrentSession(session)) showError(caughtError)
  } finally {
    pendingWrite.value = null
  }
}

const reconcileLineFormSession = useFormSession({
  owner: lineModal,
  action: { kind: 'remote', context: actionContext },
  submit: saveLine,
  onDenied: () => guardAction(editPrerequisiteWarning.value)
})

const saveFinalState = async (value: boolean | 'indeterminate') => {
  if (value === 'indeterminate' || value === data.value?.reconciliation.egcs_fc_isfinal
    || isMutationPending.value || !guardAction(editPrerequisiteWarning.value)) return
  const context = actionContext.capture()
  if (!context?.canDispatch()) return
  pendingWrite.value = 'final'
  try {
    await mutateReconciliation(`/api/claim-reconciliations/${reconcileId}`, {
      method: 'PATCH',
      body: { egcs_fc_isfinal: value }
    })
    if (!isCurrentPage() || !data.value) return
    data.value = { ...data.value, reconciliation: { ...data.value.reconciliation, egcs_fc_isfinal: value } }
    if (context.isCurrent()) {
      toast.add({ title: toast.localized('common.success'), description: toast.localized('agreement.claims.final_reconcile_saved'), color: 'success' })
    }
    await refreshWorkspace()
  } catch (caughtError: unknown) {
    if (context.isCurrent()) showError(caughtError)
  } finally {
    pendingWrite.value = null
  }
}

const reconcileAllLines = async () => {
  if (isMutationPending.value || isLineModalOpen.value || !guardAction(editPrerequisiteWarning.value)) return
  const context = actionContext.capture()
  if (!context?.canDispatch()) return
  pendingWrite.value = 'all'
  try {
    const saved = await reconcileAll(reconcileId, context.canDispatch)
    if (!saved || !isCurrentPage()) return
    if (context.isCurrent()) {
      toast.add({ title: toast.localized('common.success'), description: toast.localized('agreement.claims.saved_reconcile'), color: 'success' })
    }
    await refreshWorkspace()
  } catch (caughtError: unknown) {
    if (context.isCurrent()) showError(caughtError)
  } finally {
    pendingWrite.value = null
  }
}

const handleRuntimeChanged = async () => {
  if (!isCurrentPage()) return
  await refreshWorkspace()
  if (!isCurrentPage()) return
  approvalsRefreshKey.value += 1
}

const cancelReconciliation = async () => {
  if (!data.value || isMutationPending.value || !guardAction(workflowPrerequisiteWarning.value)) return
  if (!window.confirm(t('agreement.claims.cancel_reconcile_confirmation'))) return
  try {
    pendingWrite.value = 'cancel'
    await mutateReconciliation(`/api/agreements/${data.value.reconciliation.agreement_id}/claim-reconciles/${reconcileId}/cancel`, {
      method: 'POST'
    })
    if (!isCurrentPage()) return
    await handleRuntimeChanged()
    if (!isCurrentPage()) return
    toast.add({
      title: toast.localized('common.success'),
      description: toast.localized('agreement.claims.cancel_reconcile_success'),
      color: 'success'
    })
  } catch (caughtError: unknown) {
    if (isCurrentPage()) showError(caughtError)
  } finally {
    pendingWrite.value = null
  }
}

useFieldTooltipProvider(() => data.value && String(data.value.reconciliation.id) === String(route.params.reconcileId) ? { entityType: 'fundingclaimreconcile', entityId: data.value.reconciliation.id } : null)
</script>

<template>
  <CommonDetailPage id="claim-reconciliation-detail" v-model:collapsed="isHeroCollapsed" data-field-tooltip-context="agreement" data-field-scope="claim-reconciliations" data-scope-label-en="Agreements > Claim reconciliations > General" data-scope-label-fr="Ententes > Rapprochements des demandes de remboursement > Général" :breadcrumb-items="breadcrumbItems">
    <template #body>
      <div v-if="data" ref="recoveryFocusTarget" data-help-target="casework.claim-reconciliations.detail.content" data-help-kind="section" data-help-view="casework.claim-reconciliations.detail" tabindex="-1" class="flex flex-1 flex-col outline-none">
        <CommonEntityHero
          :is-collapsed="isHeroCollapsed"
          icon="i-lucide-scale"
          :title="t('agreement.claims.reconcile_label_with_id', { id: reconcileId })"
          :meta-items="[
            data.reconciliation.agreement_number || getBilingualValue(data.reconciliation, 'agreement_title', data.reconciliation.agreement_id),
            t('agreement.claims.claim_label', { id: data.reconciliation.egcs_fc_fundingagreementclaim })
          ]"
          :badges="[
            {
              statusId: data.reconciliation.egcs_fc_status,
              isCompleted: data.reconciliation.isCompleted
            },
            ...(data.reconciliation.egcs_fc_isfinal ? [{ variant: 'final' as const, label: t('agreement.claims.final') }] : []),
            ...(data.is_primary ? [{ variant: 'meta' as const, label: t('assignments.primary') }] : [])
          ]" />

        <CommonDetailWorkspace v-model="selectedTab" help-navigation-group-target="casework.claim-reconciliations.detail.section-navigation" data-field-container="Page navigation state, not a business input field." :items="tabs" content-test-id="claim-reconciliation-detail-content">
          <UAlert
            v-if="readbackFailed"
            color="error"
            variant="soft"
            :title="t('agreement.claims.reconcile_load_failed')"
            :description="t('common.resource_table_load_failed_description')">
            <template #actions>
              <UButton :label="t('common.retry')" :loading="isRetryingLoad" :disabled="isRetryingLoad || isMutationPending" @click="retryLoad" />
            </template>
          </UAlert>
          <UAlert
            v-if="selectedTab === 'reconciliation' && !data.can_update"
            color="neutral"
            variant="soft"
            icon="i-lucide-eye"
            :title="t('assignments.read_only_title')"
            :description="t(data.is_assigned ? 'agreement.claims.reconcile_locked_description' : 'assignments.read_only_description')" />

          <section v-if="selectedTab === 'reconciliation'" data-help-view="casework.claim-reconciliations.reconciliation" data-help-target="casework.claim-reconciliations.reconciliation.content">
            <CommonSection :show-header="false" :title="t('agreement.claims.reconcile_selected_title')" :grid-cols="1">
              <div class="space-y-5">
                <div class="flex flex-wrap items-center justify-between gap-4 rounded-sm border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
                  <UCheckbox
                    data-ui-target="claim-reconciliations.claims.mark_reconcile_final"
                    :model-value="data.reconciliation.egcs_fc_isfinal"
                    :label="t('agreement.claims.mark_reconcile_final')"
                    :description="t('agreement.claims.mark_reconcile_final_description')"
                    :disabled="!canUpdateRole || status !== 'success' || isMutationPending"
                    @update:model-value="saveFinalState" />
                  <UButton
                    v-if="canUpdateRole"
                    icon="i-lucide-list-checks"
                    :label="t('agreement.claims.reconcile_all_amounts')"
                    :loading="pendingWrite === 'all'"
                    :disabled="status !== 'success' || isMutationPending || isLineModalOpen"
                    @click="reconcileAllLines" />
                  <UButton
                    v-if="canUpdateRole"
                    data-help-target="casework.claim-reconciliations.detail.claims-cancel-reconcile"
                    color="error"
                    variant="outline"
                    icon="i-lucide-ban"
                    :label="t('agreement.claims.cancel_reconcile')"
                    :loading="pendingWrite === 'cancel'"
                    :disabled="status !== 'success' || isMutationPending"
                    @click="cancelReconciliation" />
                </div>

                <AgreementClaimReconciliationLinesTable
                  :lines="reconciliationTableLines"
                  :hide-cost-category="!data.reconciliation.isCompleted && data.reconciliation.egcs_tp_hidecostcategory"
                  :hide-cost-subsection="!data.reconciliation.isCompleted && data.reconciliation.egcs_tp_hidecostsubsection"
                  :currency="data.reconciliation.egcs_fc_currency"
                  :total-submitted="totalSubmitted"
                  :total-reconciled="totalReconciled"
                  :total-sampled="totalSampled"
                  edit-mode="action"
                  :action-pending="isMutationPending"
                  @edit="openLineEditor" />
              </div>
            </CommonSection>
          </section>
          <CommonSection v-else-if="selectedTab === 'completion'" data-help-view="casework.claim-reconciliations.completion" :show-header="false" :title="t('agreement.claims.reconcile_completion.title')" :grid-cols="1">
            <fieldset :disabled="status !== 'success' || isMutationPending" class="space-y-8">
              <CommonCompletionSection
                entity-type="fundingclaimreconcile"
                :entity-id="reconcileId"
                :is-locked="!data.can_update || status !== 'success'" :show-header="false"
                :action-role-allowed="canUpdateRole"
                :action-prerequisite-warning="editPrerequisiteWarning"
                title-key="agreement.claims.reconcile_completion.title"
                description-key="agreement.claims.reconcile_completion.description"
                status-complete-key="agreement.claims.reconcile_completion.status_complete"
                status-locked-key="agreement.claims.reconcile_completion.status_locked"
                comment-placeholder-key="agreement.claims.reconcile_completion.comment_placeholder"
                complete-action-key="agreement.claims.reconcile_completion.complete"
                completed-success-key="agreement.claims.reconcile_completion.completed_success"
                :confirmation-message-key="data.reconciliation.egcs_fc_isfinal ? 'agreement.claims.final_reconcile_completion_confirmation' : undefined"
                @completed="handleRuntimeChanged" />
              <CommonWorkflowSection
                entity-type="fundingclaimreconcile"
                :entity-id="reconcileId"
                purpose="approval_submission"
                hide-when-unconfigured
                :can-edit="canUpdateRole && data.is_assigned && status === 'success'"
                :action-role-allowed="canUpdateRole"
                :mutation-role-allowed="canUpdateRole"
                :action-prerequisite-warning="workflowPrerequisiteWarning"
                :refresh-key="approvalsRefreshKey"
                @changed="handleRuntimeChanged" />
            </fieldset>
          </CommonSection>

          <CommonReviewsTab
            v-else-if="selectedTab === 'reviews'"
            data-help-view="casework.claim-reconciliations.reviews"
            entity-type="fundingclaimreconcile"
            :entity-id="reconcileId"
            :can-update="data.can_update"
            @changed="handleRuntimeChanged" />

          <fieldset v-else-if="selectedTab === 'workflows'" data-help-view="casework.claim-reconciliations.workflows" data-help-target="casework.claim-reconciliations.detail.workflows" data-help-kind="section" :disabled="status !== 'success' || isMutationPending">
            <CommonWorkflowSection
              entity-type="fundingclaimreconcile"
              :entity-id="reconcileId"
              purpose="standard"
              :can-edit="canUpdateRole && data.is_assigned && status === 'success'"
              :action-role-allowed="canUpdateRole"
              :mutation-role-allowed="canUpdateRole"
              :action-prerequisite-warning="workflowPrerequisiteWarning"
              :refresh-key="approvalsRefreshKey"
              @changed="handleRuntimeChanged" />
          </fieldset>
          <section v-else-if="selectedTab === 'supplementary-information'" data-help-view="casework.claim-reconciliations.supplementary-information" data-help-target="casework.claim-reconciliations.supplementary-information.content">
            <CommonWorkflowSupplementaryInformation :show-header="false" entity-type="fundingclaimreconcile" :entity-id="reconcileId" />
          </section>
          <CommonAttachmentsTab v-else-if="selectedTab === 'attachments'" data-help-view="casework.claim-reconciliations.attachments" entity-type="fundingclaimreconcile" :entity-id="reconcileId" />
          <CommonAssignedUsers v-else-if="selectedTab === 'assignments'" data-help-view="casework.claim-reconciliations.assignments" :show-header="false" entity-type="fundingclaimreconcile" :entity-id="reconcileId" />
        </CommonDetailWorkspace>
      </div>

      <div v-else-if="status === 'pending'" class="flex flex-1 items-center justify-center p-8">
        <CommonLoadingState :label="t('common.loading_records')" />
      </div>

      <div v-else class="p-6">
        <UAlert
          color="error"
          variant="soft"
          icon="i-lucide-circle-alert"
          :title="t('agreement.claims.reconcile_load_failed')"
          :description="t('common.resource_table_load_failed_description')">
          <template #actions>
            <UButton
              color="error"
              variant="soft"
              icon="i-lucide-refresh-cw"
              :label="t('common.retry')"
              :loading="isRetryingLoad"
              :disabled="isRetryingLoad"
              @click="retryLoad" />
          </template>
        </UAlert>
      </div>

      <UModal
        v-if="selectedLine"
        v-model:open="isLineModalOpen"
        :dismissible="pendingWrite !== 'line'"
        :title="t('agreement.claims.reconcile_line_details')"
        :description="selectedLine.name"
        :ui="{ content: 'sm:max-w-2xl' }">
        <template #body>
          <UForm
            v-bind="reconcileLineFormSession"
            data-testid="reconcile-line-form"
            :state="selectedLine"
            :validate="validateReconcileLine"
            class="space-y-5">
            <p v-if="selectedLine.description && selectedLine.description !== selectedLine.name" class="text-sm text-muted">
              {{ selectedLine.description }}
            </p>
            <UFormField data-ui-target="claim-reconciliations.line.submitted_amount" :label="t('agreement.claims.submitted_amount')">
              {{ formatMoneyText(selectedLine.submittedAmount, locale) }}
            </UFormField>
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField data-ui-target="claim-reconciliations.line.reconciled_amount" name="egcs_fc_reconciled" :label="t('agreement.claims.reconciled_amount')" required>
                <CommonCurrencyInput
                  v-model="selectedLine.egcs_fc_reconciled"
                  required
                  aria-required="true"
                  :currency="selectedLine.submittedAmount.currency"
                  :disabled="!selectedLine.editable || isMutationPending"
                  class="w-full" />
              </UFormField>
              <UFormField data-ui-target="claim-reconciliations.line.sampled_amount" name="egcs_fc_sampled" :label="t('agreement.claims.sampled_amount')">
                <CommonCurrencyInput
                  v-model="selectedLine.egcs_fc_sampled"
                  :currency="selectedLine.submittedAmount.currency"
                  :disabled="!selectedLine.editable || isMutationPending"
                  class="w-full" />
              </UFormField>
            </div>
            <UFormField data-ui-target="claim-reconciliations.line.rationale" name="egcs_fc_rationale" :label="t('agreement.claims.rationale')">
              <CommonTextarea
                v-model="selectedLine.egcs_fc_rationale"
                :rows="6"
                :readonly="!selectedLine.editable"
                :disabled="isMutationPending"
                class="w-full" />
            </UFormField>
            <div class="flex justify-end gap-2 pt-2">
              <UButton
                type="button"
                color="neutral"
                variant="ghost"
                :label="t('common.cancel')"
                :disabled="pendingWrite === 'line'"
                @click="lineModal.close" />
              <CommonSaveButton
                v-if="selectedLine.editable"
                type="submit"
                :label="t('common.save')"
                :loading="pendingWrite === 'line'"
                :disabled="isMutationPending" />
            </div>
          </UForm>
        </template>
      </UModal>
    </template>
  </CommonDetailPage>
</template>
