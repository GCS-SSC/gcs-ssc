<script setup lang="ts">
import { usePageResourceError } from '~/composables/usePageResourceError'
/* eslint-disable jsdoc/require-jsdoc -- Independent Correction page callbacks have focused request and financial tests. */
import { computed, nextTick, ref, watch } from 'vue'
import type { Ref } from 'vue'
import CommonCompletionPanel from '~/components/Common/Completions/Panel.vue'
import type { CorrectionDetail } from '~~/shared/types/correction'
import { formatCorrectionReference } from '~~/shared/utils/correction'
import { CorrectionEditSchema } from '~~/shared/types/schemas/correction'
import { appRouteLocations, authorizedRouteLocation } from '~/utils/route-locations'
import { correctionLineBalance, correctionBalanceTotals } from '~/utils/correction-financials'
import { formatMoneyText, parseMoneyText } from '~~/shared/utils/money'
import { AppFetchResponseError } from '~/utils/fetch-error'

definePageMeta({ key: route => route.path, i18n: { paths: {
  en: '/agreements/[id]/corrections/[correctionId]', fr: '/ententes/[id]/corrections/[correctionId]'
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
const correctionId = computed(() => String(route.params.correctionId))
const isHeroCollapsed = getHeroCollapsed('agreement-correction-detail')
const { data: correction, status, error: detailError, refresh } = useCorrectionDetail(agreementId, correctionId)

const approvalOnly = computed(() => !correction.value && status.value === 'error'
  && detailError.value instanceof AppFetchResponseError && detailError.value.response.status === 403)
usePageResourceError({
  identity: () => route.path,
  errors: [() => approvalOnly.value ? null : detailError.value],
  pending: () => status.value === 'pending',
  hasContent: () => Boolean(correction.value)
})

const refreshKey: Ref<number> = ref(0)
const saving: Ref<boolean> = ref(false)
const cancelOpen: Ref<boolean> = ref(false)
const linkedOpen: Ref<boolean> = ref(false)
const detailContent: Ref<HTMLElement | null> = ref(null)
type FormState = {
  egcs_fc_requesteddate: string | Date | null
  egcs_fc_narrative_en: string
  egcs_fc_narrative_fr: string
  egcs_fc_lines: Array<{ egcs_fc_commitmentline: string, egcs_fc_adjustment: string }>
}
const state: Ref<FormState | null> = ref(null)
const savedState: Ref<string> = ref('')
const dirty = computed(() => state.value !== null && JSON.stringify(state.value) !== savedState.value)
const hydrate = (detail: CorrectionDetail) => {
  state.value = {
    egcs_fc_requesteddate: detail.egcs_fc_requesteddate.slice(0, 10),
    egcs_fc_narrative_en: detail.egcs_fc_narrative_en,
    egcs_fc_narrative_fr: detail.egcs_fc_narrative_fr,
    egcs_fc_lines: detail.egcs_fc_lines.map(line => ({ egcs_fc_commitmentline: line.egcs_fc_commitmentline, egcs_fc_adjustment: line.egcs_fc_adjustment }))
  }
  savedState.value = JSON.stringify(state.value)
}
watch(correction, detail => {
  if (!detail) {
    state.value = null
    savedState.value = ''
    return
  }
  if (!dirty.value || !detail.egcs_fc_canedit) hydrate(detail)
}, { immediate: true })
watch([agreementId, correctionId], () => {
  state.value = null
  savedState.value = ''
  saving.value = false
  cancelOpen.value = false
  linkedOpen.value = false
}, { flush: 'sync' })
const tabs = [
  { key: 'correction.financial_lines', value: 'lines', icon: 'i-lucide-list' },
  { key: 'correction.financial_basis', value: 'basis', icon: 'i-lucide-history' },
  { key: 'correction.completion.title', value: 'completion', icon: 'i-lucide-circle-check-big' },
  { key: 'reviews.title', value: 'reviews', icon: 'i-lucide-clipboard-check' },
  { key: 'workflow.title', value: 'workflows', icon: 'i-lucide-workflow' },
  { key: 'supplementary_information.title', value: 'supplementary-information', icon: 'i-lucide-clipboard-list' },
  { key: 'attachments.title', value: 'attachments', icon: 'i-lucide-paperclip' },
  { key: 'assignments.title', value: 'assignments', icon: 'i-lucide-users' }
]
const { selectedTab } = useUrlTabState({ tabs, defaultTab: 'lines' })
type LineRow = CorrectionDetail['egcs_fc_lines'][number] & { index: number, balance: ReturnType<typeof correctionLineBalance> }
const lineRows = computed<LineRow[]>(() => (correction.value?.egcs_fc_lines ?? []).map((line, index) => ({
  ...line, index, balance: correctionLineBalance(line, state.value?.egcs_fc_lines[index]?.egcs_fc_adjustment ?? line.egcs_fc_adjustment)
})))
const totals = computed(() => correctionBalanceTotals(lineRows.value.map(line => line.balance)))
const completionReady = computed(() => Boolean(
  totals.value?.hasAdjustments
  && lineRows.value.every(line => line.balance?.withinCommitment)
  && (state.value?.egcs_fc_narrative_en.trim() || state.value?.egcs_fc_narrative_fr.trim())
))
const formatAmount = (amount: string | undefined | null) => amount === null || amount === undefined
  ? t('common.not_available')
  : formatMoneyText(parseMoneyText(amount), locale.value, correction.value?.egcs_fc_currency ?? 'cad')
const breadcrumbs = computed(() => [
  { label: t('agreement.title'), to: authorizedRouteLocation(correction.value?.egcs_fc_agreementreadable, localePath(appRouteLocations.agreements())) },
  { label: correction.value?.egcs_fc_agreementnumber ?? '', to: authorizedRouteLocation(correction.value?.egcs_fc_agreementreadable, localePath(appRouteLocations.agreementDetail(agreementId.value))) },
  { label: t('correction.title'), to: localePath(appRouteLocations.agreementCorrectionCollection(agreementId.value)) },
  { label: correction.value ? formatCorrectionReference(correction.value) : '' }
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
  if (!state.value || !correction.value?.egcs_fc_canedit || saving.value) return
  const owner = correctionId.value
  const submitted = JSON.stringify(state.value)
  saving.value = true
  try {
    await sendJson(`/api/corrections/${owner}`, 'PATCH', CorrectionEditSchema.parse(state.value))
    if (correctionId.value !== owner) return
    if (await refresh() && correction.value && JSON.stringify(state.value) === submitted) hydrate(correction.value)
    refreshKey.value += 1
    toast.add({ title: t('common.success'), description: t('common.updated_success'), color: 'success' })
  } catch (failure) {
    if (correctionId.value === owner) showError(failure)
  } finally {
    if (correctionId.value === owner) saving.value = false
  }
}
const deleteDraft = async () => {
  const owner = correctionId.value
  if (await confirmDeleteRequest(`/api/corrections/${owner}`) && owner === correctionId.value) await navigateTo(localePath(appRouteLocations.agreementCorrectionCollection(agreementId.value)))
}
const heroActions = computed(() => [
  { label: t('correction.create_linked'), color: 'neutral' as const, variant: 'outline' as const, icon: 'i-lucide-file-plus-2', visible: correction.value?.egcs_fc_canlink === true, onClick: () => { linkedOpen.value = true } },
  { label: t('correction.cancel'), color: 'neutral' as const, variant: 'outline' as const, visible: correction.value?.egcs_fc_cancancel === true, onClick: () => { cancelOpen.value = true } },
  { label: t('common.delete'), color: 'error' as const, variant: 'ghost' as const, icon: 'i-lucide-trash', visible: correction.value?.egcs_fc_candelete === true, onClick: deleteDraft }
])
const linkedCreated = async (id: string) => {
  await navigateTo(localePath(appRouteLocations.agreementCorrectionDetail(agreementId.value, id)))
}
</script>

<template>
  <div ref="detailContent" tabindex="-1" class="flex w-full min-w-0 flex-col">
    <CorrectionApprovalWorkspace v-if="approvalOnly" :agreement-id="agreementId" :correction-id="correctionId" />
    <UAlert v-else-if="status === 'error'" color="error" icon="i-lucide-circle-alert" :title="t('common.resource_table_load_failed')" :description="t('common.resource_table_load_failed_description')">
      <template #actions>
        <UButton color="error" variant="soft" :label="t('common.retry')" icon="i-lucide-refresh-cw" @click="retryLoad" />
      </template>
    </UAlert>
    <div v-else-if="!correction && status === 'pending'" role="status" aria-live="polite" class="flex min-h-32 items-center justify-center gap-2 text-sm text-muted">
      <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" aria-hidden="true" /><span>{{ t('common.loading_records') }}</span>
    </div>
    <CommonDetailPage v-if="correction && state" id="agreement-correction-detail" v-model:collapsed="isHeroCollapsed" :breadcrumb-items="breadcrumbs" class="min-w-0 flex-1">
      <template #body>
        <CommonEntityHero :is-collapsed="isHeroCollapsed" icon="i-lucide-file-diff" :title="formatCorrectionReference(correction)" :meta-items="[`${t('correction.agreement')}: ${correction.egcs_fc_agreementnumber}`, formatDate(correction.egcs_fc_requesteddate)]" :badges="[{ statusId: correction.egcs_fc_status }]" :actions="heroActions" />
        <ULink v-if="correction.egcs_fc_linkedcorrection" :to="localePath(appRouteLocations.agreementCorrectionDetail(agreementId, correction.egcs_fc_linkedcorrection))" class="mb-4 text-sm">{{ t('correction.linked_correction') }}</ULink>
        <CommonDetailWorkspace v-model="selectedTab" :items="tabs" content-test-id="agreement-correction-detail-content">
          <UForm v-if="selectedTab === 'lines'" :state="state" :validate="createValidator(CorrectionEditSchema)" class="space-y-8" @submit="save">
            <CommonSection :title="t('correction.financial_lines')" :grid-cols="1">
              <p id="correction-line-instruction" class="text-sm text-muted">
                {{ t('correction.lines_instruction') }}
              </p>
              <dl :aria-label="t('correction.financial_summary')" class="grid gap-4 border-y border-default py-4 text-sm sm:grid-cols-2 2xl:grid-cols-4" aria-live="polite" aria-atomic="true">
                <div>
                  <dt class="text-muted">
                    {{ t('correction.recorded_paid') }}
                  </dt><dd class="font-semibold">
                    {{ formatAmount(totals?.recordedPaid) }}
                  </dd>
                </div>
                <div>
                  <dt class="text-muted">
                    {{ t('correction.adjustment_total') }}
                  </dt><dd class="font-semibold">
                    {{ formatAmount(totals?.adjustment) }}
                  </dd>
                </div>
                <div>
                  <dt class="text-muted">
                    {{ t('correction.corrected_paid') }}
                  </dt><dd class="font-semibold">
                    {{ formatAmount(totals?.correctedPaid) }}
                  </dd>
                </div>
                <div>
                  <dt class="text-muted">
                    {{ t('correction.remaining') }}
                  </dt><dd class="font-semibold">
                    {{ formatAmount(totals?.remaining) }}
                  </dd>
                </div>
              </dl>
              <CorrectionFinancialLine
                v-for="line in lineRows"
                :key="line.id"
                :line="line"
                :currency="correction.egcs_fc_currency"
                :corrected-paid="line.balance?.correctedPaid ?? null"
                :remaining="line.balance?.remaining ?? null"
                :invalid="line.balance !== null && !line.balance.withinCommitment">
                <template v-if="correction.egcs_fc_canedit" #adjustment>
                  <UFormField :name="`egcs_fc_lines.${line.index}.egcs_fc_adjustment`" :label="`${t('correction.adjustment')} ${line.egcs_fc_commitmentlinenumber}`">
                    <CommonCurrencyInput v-model="state.egcs_fc_lines[line.index]!.egcs_fc_adjustment" :currency="correction.egcs_fc_currency" aria-describedby="correction-line-instruction" :disabled="saving" class="w-full" />
                  </UFormField>
                </template>
              </CorrectionFinancialLine>
              <p class="text-sm text-muted">
                {{ t('correction.basis_provenance') }}
              </p>
            </CommonSection>
            <CommonSection :title="t('correction.rationale')" :grid-cols="1">
              <p id="correction-rationale-instruction" class="text-sm text-muted">
                {{ t('correction.rationale_instruction') }}
              </p>
              <UFormField v-if="correction.egcs_fc_canedit" name="egcs_fc_requesteddate" :label="t('correction.requested_date')">
                <CommonDatePicker v-model="state.egcs_fc_requesteddate" :disabled="saving" />
              </UFormField>
              <div class="grid gap-4 md:grid-cols-2">
                <UFormField name="egcs_fc_narrative_en" :label="t('correction.narrative_en')">
                  <UTextarea v-model="state.egcs_fc_narrative_en" :readonly="!correction.egcs_fc_canedit" :disabled="saving" aria-describedby="correction-rationale-instruction" class="w-full" :rows="4" />
                </UFormField>
                <UFormField name="egcs_fc_narrative_fr" :label="t('correction.narrative_fr')">
                  <UTextarea v-model="state.egcs_fc_narrative_fr" :readonly="!correction.egcs_fc_canedit" :disabled="saving" aria-describedby="correction-rationale-instruction" class="w-full" :rows="4" />
                </UFormField>
              </div>
              <div v-if="correction.egcs_fc_canedit" class="flex justify-end gap-2">
                <CommonSaveButton :label="t('common.save')" :loading="saving" :disabled="saving || status !== 'success'" />
              </div>
            </CommonSection>
          </UForm>
          <CommonSection v-else-if="selectedTab === 'basis'" :title="t('correction.financial_basis')" :grid-cols="1">
            <p class="text-sm text-muted">
              {{ t('correction.financial_basis_description') }}
            </p>
            <CorrectionSourcePayments :sources="correction.egcs_fc_sources" :agreement-id="agreementId" :can-open="correction.egcs_fc_sourcereadable" />
          </CommonSection>
          <section v-else-if="selectedTab === 'completion'" class="space-y-6">
            <UAlert v-if="dirty" color="warning" :title="t('correction.save_before_completion')" />
            <CommonCompletionPanel entity-type="fundingcasecorrection" :entity-id="correctionId" :can-complete="correction.egcs_fc_canedit && completionReady && !dirty && !saving && status === 'success'" :can-work-workflow="correction.egcs_fc_canwork" :hide-title="false" :show-divider="false" title-key="correction.completion.title" description-key="correction.completion.description" status-complete-key="correction.completion.status_complete" status-locked-key="correction.completion.status_locked" comment-placeholder-key="correction.completion.comment_placeholder" complete-action-key="correction.completion.complete" completed-success-key="correction.completion.completed_success" :refresh-key="refreshKey" @changed="refreshPage" />
          </section>
          <CommonReviewsTab v-else-if="selectedTab === 'reviews'" entity-type="fundingcasecorrection" :entity-id="correctionId" :can-update="correction.egcs_fc_canedit" @changed="refreshPage" />
          <CommonWorkflowSection v-else-if="selectedTab === 'workflows'" entity-type="fundingcasecorrection" :entity-id="correctionId" purpose="standard" :can-edit="correction.egcs_fc_canwork" :refresh-key="refreshKey" @changed="refreshPage" />
          <CommonWorkflowSupplementaryInformation v-else-if="selectedTab === 'supplementary-information'" entity-type="fundingcasecorrection" :entity-id="correctionId" />
          <CommonAttachmentsTab v-else-if="selectedTab === 'attachments'" entity-type="fundingcasecorrection" :entity-id="correctionId" />
          <CommonAssignedUsers v-else-if="selectedTab === 'assignments'" entity-type="fundingcasecorrection" :entity-id="correctionId" />
        </CommonDetailWorkspace>
      </template>
    </CommonDetailPage>
    <CorrectionCancelModal v-model:open="cancelOpen" :correction-id="correctionId" @cancelled="refreshPage" />
    <CorrectionCreateModal v-if="correction" v-model:open="linkedOpen" :agreement-id="agreementId" :linked-correction-id="correctionId" :initial-commitment-id="correction.egcs_fc_commitment" @created="linkedCreated" />
  </div>
</template>
