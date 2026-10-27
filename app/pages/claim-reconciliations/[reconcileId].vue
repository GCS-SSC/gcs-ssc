<script setup lang="ts">
import { useFieldTooltipProvider } from '~/composables/useFieldTooltipProvider'
import type { LocalizedToastText } from '~/composables/useLocalizedToast'
import { usePageResourceError } from '~/composables/usePageResourceError'
import CommonCompletionSection from '~/components/Common/Completions/Section.vue'
/* eslint-disable jsdoc/require-jsdoc -- concise page-local interaction handlers are self-documenting */
import { computed, onScopeDispose, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { appRouteLocations, authorizedRouteLocation } from '~/utils/route-locations'
import type { BusinessRecordStateFields } from '~~/shared/types/business-record-state'
import type { AgreementClaimReconciliationTableLine } from '~~/shared/types/agreement-claim-reconciliation-ui'
import { parseMoney, sumMoney, type Money } from '~~/shared/utils/money'

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
type ReconciliationLineDraft = {
  reconciled: string
  sampled: string | null
  rationale: string
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
const { t } = useI18n()
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
usePageResourceError({ identity: () => route.path, errors: [error], pending: () => status.value === 'pending', hasContent: () => Boolean(data.value) })

const drafts: Ref<Record<string, ReconciliationLineDraft>> = ref({})
const isSaving: Ref<boolean> = ref(false)
const isSavingFinal: Ref<boolean> = ref(false)
const isCancelling: Ref<boolean> = ref(false)
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
const isMutationPending = computed(() => isSaving.value || isSavingFinal.value || isCancelling.value)
const workflowPrerequisiteWarning = computed(() => {
  if (!data.value?.is_assigned) return toast.localized('assignments.read_only_description')
  if (!data.value.can_cancel) return toast.localized('agreement.claims.action_unavailable')
  return undefined
})
const editPrerequisiteWarning = computed(() => workflowPrerequisiteWarning.value
  ?? (!data.value?.can_update ? toast.localized('agreement.claims.action_unavailable') : undefined))
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

const retryLoad = async () => {
  if (isRetryingLoad.value) return
  isRetryingLoad.value = true
  try {
    await refresh()
    if (isCurrentPage()) await focusRecoveredContent()
  } finally {
    isRetryingLoad.value = false
  }
}

watch([() => data.value?.lines, () => data.value?.reconciliation.isCompleted], ([lines, isCompleted], [previousLines]) => {
  const previousById = new Map((previousLines ?? []).map(line => [line.claim_line_id, line]))
  drafts.value = Object.fromEntries((lines ?? []).map(line => {
    const previous = previousById.get(line.claim_line_id)
    const draft = drafts.value[line.claim_line_id]
    const hasUnsavedChanges = !isCompleted && previous && draft && (
      draft.reconciled !== (previous.egcs_fc_reconciled ?? '0.00')
      || draft.sampled !== previous.egcs_fc_sampled
      || draft.rationale !== (previous.egcs_fc_rationale ?? '')
    )
    const nextDraft = hasUnsavedChanges
      ? draft
      : {
          reconciled: line.egcs_fc_reconciled ?? '0.00',
          sampled: line.egcs_fc_sampled,
          rationale: line.egcs_fc_rationale ?? ''
        }
    return [line.claim_line_id, nextDraft]
  }))
}, { immediate: true })

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
const tryParseMoney = (value: string | null | undefined): Money | null => {
  try {
    return value == null || value === '' ? null : parseMoney(value)
  } catch {
    return null
  }
}
const totalSubmitted = computed(() => sumMoney(data.value?.lines.map(line => line.submitted_amount) ?? []))
const totalReconciled = computed(() => sumMoney(data.value?.lines.flatMap(line => {
  const amount = tryParseMoney(drafts.value[line.claim_line_id]?.reconciled)
  return amount === null ? [] : [amount]
}) ?? []))
const totalSampled = computed(() => sumMoney(data.value?.lines.flatMap(line => {
  const amount = tryParseMoney(drafts.value[line.claim_line_id]?.sampled)
  return amount === null ? [] : [amount]
}) ?? []))
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
  reconciledAmount: drafts.value[line.claim_line_id]?.reconciled ?? line.egcs_fc_reconciled ?? '0.00',
  sampledAmount: Object.hasOwn(drafts.value, line.claim_line_id)
    ? drafts.value[line.claim_line_id]?.sampled ?? null
    : line.egcs_fc_sampled,
  rationale: drafts.value[line.claim_line_id]?.rationale ?? line.egcs_fc_rationale ?? '',
  editable: data.value?.can_update === true && !data.value.reconciliation.isCompleted
    && Boolean(drafts.value[line.claim_line_id])
})))
const updateDraftReconciled = (id: string, value: string | null | undefined) => {
  const draft = drafts.value[id]
  if (draft) draft.reconciled = value ?? ''
}
const updateDraftSampled = (id: string, value: string | null | undefined) => {
  const draft = drafts.value[id]
  if (draft) draft.sampled = value ?? null
}
const updateDraftRationale = (id: string, value: string) => {
  const draft = drafts.value[id]
  if (draft) draft.rationale = value
}

const saveFinalState = async (value: boolean | 'indeterminate') => {
  if (value === 'indeterminate' || isMutationPending.value || !guardAction(editPrerequisiteWarning.value)) return
  isSavingFinal.value = true
  try {
    const draftsSaved = await saveLines(false, value)
    if (!draftsSaved || !isCurrentPage()) return
    await refresh()
    if (!isCurrentPage()) return
    toast.add({
      title: toast.localized('common.success'),
      description: toast.localized('agreement.claims.final_reconcile_saved'),
      color: 'success'
    })
  } catch (caughtError: unknown) {
    if (isCurrentPage()) showError(caughtError)
  } finally {
    isSavingFinal.value = false
  }
}

const saveLines = async (showSuccess = true, desiredIsFinal?: boolean): Promise<boolean> => {
  if (!data.value || isSaving.value || isCancelling.value || (isSavingFinal.value && desiredIsFinal === undefined)
    || !guardAction(editPrerequisiteWarning.value)) return false
  isSaving.value = true
  try {
    const validatedLines = data.value.lines.map(line => {
      const draft = drafts.value[line.claim_line_id]
      if (!draft) return null
      return {
        line,
        draft,
        reconciled: parseMoney(draft.reconciled),
        sampled: draft.sampled == null || draft.sampled === '' ? null : parseMoney(draft.sampled)
      }
    }).filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    await mutateReconciliation(`/api/claim-reconciliations/${reconcileId}/lines/bulk`, {
      method: 'PATCH',
      body: {
        lines: validatedLines.map(({ line, draft, reconciled, sampled }) => ({
          claim_line_id: line.claim_line_id,
          reconcile_line_id: line.reconcile_line_id,
          egcs_fc_reconciled: reconciled,
          egcs_fc_sampled: sampled,
          egcs_fc_rationale: draft.rationale || null
        })),
        ...(desiredIsFinal === undefined ? {} : { egcs_fc_isfinal: desiredIsFinal })
      }
    })
    if (!isCurrentPage()) return false
    await refresh()
    if (!isCurrentPage()) return false
    if (showSuccess) {
      toast.add({
        title: toast.localized('common.success'),
        description: toast.localized('agreement.claims.saved_reconcile'),
        color: 'success'
      })
    }
    return true
  } catch (caughtError: unknown) {
    if (isCurrentPage()) showError(caughtError)
    return false
  } finally {
    isSaving.value = false
  }
}

const handleRuntimeChanged = async () => {
  if (!isCurrentPage()) return
  await refresh()
  if (!isCurrentPage()) return
  approvalsRefreshKey.value += 1
}

const cancelReconciliation = async () => {
  if (!data.value || isMutationPending.value || !guardAction(workflowPrerequisiteWarning.value)) return
  if (!window.confirm(t('agreement.claims.cancel_reconcile_confirmation'))) return
  try {
    isCancelling.value = true
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
    isCancelling.value = false
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
                  <CommonSaveButton
                    v-if="canUpdateRole"
                    data-help-target="casework.claim-reconciliations.detail.claims-save-reconcile"
                    type="button"
                    :label="t('agreement.claims.save_reconcile')"
                    :loading="isSaving"
                    :disabled="status !== 'success' || isMutationPending"
                    @click="saveLines" />
                  <UButton
                    v-if="canUpdateRole"
                    data-help-target="casework.claim-reconciliations.detail.claims-cancel-reconcile"
                    color="error"
                    variant="outline"
                    icon="i-lucide-ban"
                    :label="t('agreement.claims.cancel_reconcile')"
                    :loading="isCancelling"
                    :disabled="status !== 'success' || isMutationPending"
                    @click="cancelReconciliation" />
                </div>

                <AgreementClaimReconciliationLinesTable
                  :lines="reconciliationTableLines"
                  :currency="data.reconciliation.egcs_fc_currency"
                  :total-submitted="totalSubmitted"
                  :total-reconciled="totalReconciled"
                  :total-sampled="totalSampled"
                  @update:reconciled="updateDraftReconciled"
                  @update:sampled="updateDraftSampled"
                  @update:rationale="updateDraftRationale" />
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
    </template>
  </CommonDetailPage>
</template>
