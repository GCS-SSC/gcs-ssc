<script setup lang="ts">
/* eslint-disable jsdoc/require-param, jsdoc/require-returns -- concise local helpers remain clear without repetitive tags */
import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import type { AssessmentQuestionRow, AssessmentSubSectionRow } from '~/composables/useAssessmentSchemaEditorState'
import { useAssessmentDetailPage } from '~/composables/useAssessmentDetailPage'
import type { Dependency } from '~~/shared/types/schemas/assessment/assessment'
import { commentsRequired, questionSubsectionNeedsAnswering } from '~~/shared/utils/assessment'
import AssessmentAdditionalReviewersTab from '~/components/Assessment/AssessmentAdditionalReviewersTab.vue'
import AssessmentApprovalsSection from '~/components/Common/Approvals/Section.vue'
import CommonCompletionSection from '~/components/Common/Completions/Section.vue'

const { locale, t } = useI18n()
const { getBilingualValue } = useBilingualValue()

const {
  assessment,
  loadError,
  loadStatus,
  assessmentResponse,
  runtimeSummary,
  generatedOutcomes,
  isSaving,
  saveAssessment,
  sectionTabs,
  selectedTab,
  selectedTabKey,
  selectedSection,
  breadcrumbItems,
  heroName,
  entityName,
  outcomeTabLabel,
  isHeroCollapsed,
  canUpdateAssessment,
  refreshAssessment,
  setAnswerValue,
  setAnswerComment,
  getAnswerRecord,
  setOutcomeSelection,
  setOutcomeJustification,
  setOutcomeComment,
  addCustomOutcome,
  removeCustomOutcome,
  updateCustomOutcome,
  customOutcomesDisabled,
  alignmentDisabled,
  currentOverallResultOption,
  reviewAlignResultItems,
  validateAssessmentResponse,
  validateReviewAlignment,
  outcomesTabId,
  outcomesTabValue,
  reviewTabId,
  reviewTabValue,
  setReviewAlignment,
  setReviewAlignResult,
  setReviewAlignmentNarrative,
  setAdditionalReviewerProgress
} = useAssessmentDetailPage()

type ValidatableForm = {
  validate: () => Promise<unknown>
}

const sectionForm: Ref<ValidatableForm | null> = ref(null)
const outcomesForm: Ref<ValidatableForm | null> = ref(null)
const reviewAlignmentForm: Ref<ValidatableForm | null> = ref(null)
const approvalsRefreshKey: Ref<number> = ref(0)
const reviewAlignResultValue = computed(() => {
  const value = assessmentResponse.value.egcs_cn_reviewalignresult
  return value === null || value === undefined ? undefined : String(value)
})
const assessmentStreamId = computed(() =>
  assessment.value?.egcs_cn_transferpaymentstream
    ? String(assessment.value.egcs_cn_transferpaymentstream)
    : assessment.value?.egcs_cn_entitytype === 'transferpaymentstream'
      ? String(assessment.value.egcs_cn_entityid)
      : undefined
)
const assessmentSchemaId = computed(() => assessment.value ? assessment.value.egcs_cn_reviewschema : '')

const isOutcomesTab = computed(() =>
  selectedTabKey.value === outcomesTabId
  || selectedTab.value === outcomesTabValue.value
)
const isReviewTab = computed(() =>
  selectedTabKey.value === reviewTabId
  || selectedTab.value === reviewTabValue.value
)
const selectedSectionName = computed(() => selectedSection.value?.name ?? '')
const filteredSubSections = computed(() => {
  if (!selectedSection.value) {
    return []
  }

  return selectedSection.value.subSections.filter(item =>
    questionSubsectionNeedsAnswering(
      assessmentResponse.value,
      assessment.value?.egcs_cn_helpers ?? {},
      item.depends as Dependency[] | undefined
    )
  )
})
const outcomeResponseMap = computed(() => new Map(assessmentResponse.value.outcomes.map(item => [
  `${item.section}::${item.subsection}::${item.nameEn}::${item.nameFr}`,
  item
])))
const getLocalizedLabel = (value: { en: string, fr: string }) => getBilingualValue({
  label_en: value.en,
  label_fr: value.fr
}, 'label')
/** Filters visible subsection items based on runtime dependency evaluation. */
const getSubSectionItems = (subSection: AssessmentSubSectionRow) =>
  subSection.questions.filter(question =>
    questionSubsectionNeedsAnswering(
      assessmentResponse.value,
      assessment.value?.egcs_cn_helpers ?? {},
      question.depends as Dependency[] | undefined
    )
  )
const getQuestionValue = (sectionName: string, subSectionName: string, questionName: string) =>
  getAnswerRecord(sectionName, subSectionName, questionName)?.value
const getQuestionValueInput = (sectionName: string, subSectionName: string, questionName: string) => {
  const value = getQuestionValue(sectionName, subSectionName, questionName)
  return value === null || value === undefined ? null : String(value)
}
const getQuestionComment = (sectionName: string, subSectionName: string, questionName: string) =>
  getAnswerRecord(sectionName, subSectionName, questionName)?.comment ?? ''
/** Resolves the displayed calculated score for a runtime calculation row. */
const getCalculatedScore = (sectionName: string, subSectionName: string, questionName: string) => formatScore(
  runtimeSummary.value?.calculatedAnswers
    .find(answer =>
      answer.section === sectionName
      && answer.subsection === subSectionName
      && answer.question === questionName
    )
    ?.value ?? 0
)
const getOutcomeResponse = (section: string, subsection: string, nameEn: string, nameFr: string) =>
  outcomeResponseMap.value.get(`${section}::${subsection}::${nameEn}::${nameFr}`)
/** Determines whether the current custom selection requires a justification. */
const isOutcomeJustificationRequired = (section: string, subsection: string, nameEn: string, nameFr: string) => {
  const outcome = getOutcomeResponse(section, subsection, nameEn, nameFr)
  if (!outcome) {
    return false
  }

  return outcome.selectedStrategy !== '' && outcome.selectedStrategy !== outcome.recommendedStrategy
}
/** Resolves the selection highlight color based on recommendation acceptance. */
const getOutcomeSelectionColor = (section: string, subsection: string, nameEn: string, nameFr: string) =>
  isOutcomeJustificationRequired(section, subsection, nameEn, nameFr) ? 'warning' : 'primary'
/** Finds the persisted answer row index for a rendered schema question. */
const getAnswerIndex = (sectionName: string, subSectionName: string, questionName: string) =>
  assessmentResponse.value.answers.findIndex(answer =>
    answer.section === sectionName
    && answer.subsection === subSectionName
    && answer.question === questionName
  )
/** Maps question comments to Nuxt UI field paths for array-based validation errors. */
const getAnswerCommentFieldName = (sectionName: string, subSectionName: string, questionName: string) => {
  const answerIndex = getAnswerIndex(sectionName, subSectionName, questionName)
  return answerIndex >= 0 ? `answers.${answerIndex}.comment` : undefined
}
/** Finds the persisted outcome row index for a generated runtime outcome. */
const getOutcomeIndex = (section: string, subsection: string, nameEn: string, nameFr: string) =>
  assessmentResponse.value.outcomes.findIndex(outcome =>
    outcome.section === section
    && outcome.subsection === subsection
    && outcome.nameEn === nameEn
    && outcome.nameFr === nameFr
  )
/** Maps outcome justifications to Nuxt UI field paths for array-based validation errors. */
const getOutcomeJustificationFieldName = (section: string, subsection: string, nameEn: string, nameFr: string) => {
  const outcomeIndex = getOutcomeIndex(section, subsection, nameEn, nameFr)
  return outcomeIndex >= 0 ? `outcomes.${outcomeIndex}.justification` : undefined
}
const isCommentRequired = (sectionName: string, subSectionName: string, question: AssessmentQuestionRow) =>
  commentsRequired(getAnswerRecord(sectionName, subSectionName, question.name)?.value, question.commentThreshold)
const outcomesPageTitle = computed(() => {
  const firstOutcome = generatedOutcomes.value[0]

  if (firstOutcome) {
    return getLocalizedLabel(firstOutcome.subsectionLabel)
  }

  return outcomeTabLabel.value
})
const formatScore = (value: number) => value.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')
const handleReviewAlignmentToggle = (value: boolean | string | null | undefined) => {
  setReviewAlignment(value === true)
}
/** Normalizes select updates into the nullable numeric review alignment result field. */
const handleReviewAlignResultUpdate = (value: string | null | undefined) => {
  if (value === undefined || value === null || value === '') {
    setReviewAlignResult(null)
    return
  }

  setReviewAlignResult(Number(value))
}
const selectSummarySection = (value: string) => {
  selectedTab.value = value
}
/** Validates whichever form is currently visible before triggering persistence. */
const validateActiveForm = async () => {
  const currentForm = isReviewTab.value
    ? reviewAlignmentForm.value
    : isOutcomesTab.value
      ? outcomesForm.value
      : sectionForm.value

  if (!currentForm) {
    return true
  }

  try {
    await currentForm.validate()
    return true
  } catch {
    return false
  }
}
/** Runs tab-scoped form validation and saves only when the active form is valid. */
const handleSave = async () => {
  if (!canUpdateAssessment.value) {
    return
  }

  if (!await validateActiveForm()) {
    return
  }

  await saveAssessment()
}
const handleCompleted = async () => {
  await refreshAssessment()
  approvalsRefreshKey.value += 1
}

const handleApprovalChanged = async () => {
  await refreshAssessment()
}
</script>

<template>
  <UDashboardPanel id="assessment-detail">
    <template #header>
      <UDashboardNavbar>
        <template #leading>
          <UDashboardSidebarCollapse />
          <UBreadcrumb :items="breadcrumbItems" class="ml-2" />
        </template>
        <template #right>
          <div class="flex items-center gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              :icon="isHeroCollapsed ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'"
              :aria-label="t(isHeroCollapsed ? 'common.expand' : 'common.collapse')"
              @click="isHeroCollapsed = !isHeroCollapsed" />
            <CommonNavbarSide />
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <CommonLoadingState v-if="loadStatus === 'pending' && !assessment" :label="t('common.loading')" />
      <UAlert v-else-if="loadError" color="error" icon="i-lucide-circle-alert" :title="t('common.load_failed')" :description="t('common.try_again')">
        <template #actions>
          <UButton :label="t('common.retry')" color="error" variant="soft" @click="() => refreshAssessment()" />
        </template>
      </UAlert>
      <div v-else-if="assessment" class="flex flex-1 flex-col">
        <AssessmentDetailHero
          :name="heroName"
          :entity-name="entityName"
          :runtime-state="assessment?.runtimeState"
          :publication-version="assessment?.publicationVersion"
          :is-collapsed="isHeroCollapsed" />

        <div class="flex min-h-0 flex-1 flex-col gap-6 overflow-visible px-6 pt-0 pb-6 lg:flex-row lg:items-start lg:gap-8">
          <div class="min-h-0 min-w-0 flex-1 pt-6">
            <UForm
              v-if="isOutcomesTab"
              ref="outcomesForm"
              :state="assessmentResponse"
              :validate="validateAssessmentResponse"
              class="space-y-4">
              <AssessmentSchemaSectionTitle :title="outcomesPageTitle" variant="indicator" />

              <div class="space-y-12">
                <div class="space-y-8">
                  <p
                    v-if="!runtimeSummary?.outcomesAvailable"
                    class="text-sm text-zinc-500 dark:text-zinc-400">
                    {{ t('transfer_payment.outcomes_placeholder') }}
                  </p>

                  <section
                    v-for="(outcome, outcomeIndex) in generatedOutcomes"
                    :key="`${outcome.section}-${outcome.subsection}-${outcome.nameEn}-${outcome.nameFr}`"
                    class="space-y-4"
                    :class="outcomeIndex > 0 ? 'border-t border-primary-500 pt-8 dark:border-primary-600' : ''">
                    <div class="pl-4 md:pl-6">
                      <div class="space-y-2">
                        <p class="text-xs uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
                          {{ t('transfer_payment.recommended_strategy') }}
                        </p>
                        <p class="text-base font-semibold text-zinc-900 dark:text-white">
                          {{ getLocalizedLabel(outcome.recommendedLabel) }}
                        </p>
                      </div>

                      <UFormField :label="t('transfer_payment.selected_strategy')" class="mt-4">
                        <URadioGroup
                          :color="getOutcomeSelectionColor(outcome.section, outcome.subsection, outcome.nameEn, outcome.nameFr)"
                          :model-value="getOutcomeResponse(outcome.section, outcome.subsection, outcome.nameEn, outcome.nameFr)?.selectedStrategy"
                          :items="outcome.options.map(option => ({
                            value: option.value,
                            label: getLocalizedLabel(option.label)
                          }))"
                          variant="card"
                          :disabled="!canUpdateAssessment"
                          @update:model-value="value => setOutcomeSelection(
                            outcome.section,
                            outcome.subsection,
                            outcome.nameEn,
                            outcome.nameFr,
                            String(value ?? '')
                          )" />
                      </UFormField>

                      <UFormField
                        class="mt-3"
                        :name="getOutcomeJustificationFieldName(outcome.section, outcome.subsection, outcome.nameEn, outcome.nameFr)">
                        <template #label>
                          <span>
                            {{ t('transfer_payment.justification') }}
                            <span
                              v-if="isOutcomeJustificationRequired(outcome.section, outcome.subsection, outcome.nameEn, outcome.nameFr)"
                              class="text-red-600 dark:text-red-400">*</span>
                          </span>
                        </template>

                        <CommonTextarea
                          :rows="3"
                          :model-value="getOutcomeResponse(outcome.section, outcome.subsection, outcome.nameEn, outcome.nameFr)?.justification ?? ''"
                          :disabled="!canUpdateAssessment || getOutcomeResponse(outcome.section, outcome.subsection, outcome.nameEn, outcome.nameFr)?.selectedStrategy === outcome.recommendedStrategy"
                          @update:model-value="value => setOutcomeJustification(
                            outcome.section,
                            outcome.subsection,
                            outcome.nameEn,
                            outcome.nameFr,
                            String(value ?? '')
                          )" />
                      </UFormField>

                      <UFormField
                        class="mt-3"
                        :label="t('admin_common.fields.egcs_cn_comment')">
                        <CommonTextarea
                          :rows="3"
                          :disabled="!canUpdateAssessment"
                          :model-value="getOutcomeResponse(outcome.section, outcome.subsection, outcome.nameEn, outcome.nameFr)?.comment ?? ''"
                          @update:model-value="value => setOutcomeComment(
                            outcome.section,
                            outcome.subsection,
                            outcome.nameEn,
                            outcome.nameFr,
                            String(value ?? '')
                          )" />
                      </UFormField>
                    </div>
                  </section>
                </div>

                <section class="space-y-6 border-t border-primary-500 pt-8 dark:border-primary-600">
                  <div class="flex items-start justify-between gap-4">
                    <AssessmentSchemaSectionTitle :title="t('transfer_payment.custom_outcomes')" variant="indicator" />
                    <UButton
                      v-if="!customOutcomesDisabled"
                      color="neutral"
                      variant="outline"
                      icon="i-lucide-plus"
                      class="cursor-default"
                      :disabled="!canUpdateAssessment"
                      @click="addCustomOutcome">
                      {{ t('transfer_payment.add_custom_outcome') }}
                    </UButton>
                  </div>

                  <p
                    v-if="customOutcomesDisabled"
                    class="pl-4 text-sm text-zinc-500 md:pl-6 dark:text-zinc-400">
                    {{ t('transfer_payment.custom_outcomes_disabled') }}
                  </p>

                  <p
                    v-else-if="assessmentResponse.customOutcomes.length === 0"
                    class="pl-4 text-sm text-zinc-500 md:pl-6 dark:text-zinc-400">
                    {{ t('transfer_payment.custom_outcomes_empty') }}
                  </p>

                  <div v-if="!customOutcomesDisabled">
                    <div
                      v-for="(customOutcome, customOutcomeIndex) in assessmentResponse.customOutcomes"
                      :key="customOutcome.id ?? `custom-outcome-${customOutcomeIndex}`"
                      class="space-y-4"
                      :class="customOutcomeIndex > 0 ? 'border-t border-primary-500 pt-8 dark:border-primary-600' : ''">
                      <div class="pl-4 md:pl-6">
                        <div class="flex items-start justify-between gap-4">
                          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
                            {{ t('transfer_payment.custom_outcome') }} {{ customOutcomeIndex + 1 }}
                          </p>

                          <UButton
                            color="error"
                            variant="ghost"
                            icon="i-lucide-trash-2"
                            class="cursor-default"
                            :disabled="!canUpdateAssessment"
                            @click="removeCustomOutcome(customOutcomeIndex)">
                            {{ t('common.remove') }}
                          </UButton>
                        </div>

                        <UFormField :label="t('applicant_recipient.name')" class="mt-4">
                          <UInput
                            :disabled="!canUpdateAssessment"
                            :model-value="customOutcome.name"
                            @update:model-value="value => updateCustomOutcome(customOutcomeIndex, 'name', String(value ?? ''))" />
                        </UFormField>

                        <UFormField :label="t('transfer_payment.custom_outcome_content')" class="mt-3">
                          <CommonTextarea
                            :rows="5"
                            :disabled="!canUpdateAssessment"
                            :model-value="customOutcome.outcome"
                            @update:model-value="value => updateCustomOutcome(customOutcomeIndex, 'outcome', String(value ?? ''))" />
                        </UFormField>
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            </UForm>

            <div v-else-if="isReviewTab && assessment?.id" class="space-y-8">
              <UForm
                ref="reviewAlignmentForm"
                :state="assessmentResponse"
                :validate="validateReviewAlignment"
                class="space-y-6">
                <AssessmentSchemaSectionTitle :title="t('assessment.review_alignment_title')" variant="indicator" />

                <div class="space-y-4 pl-4 md:pl-6">
                  <div class="space-y-1">
                    <p class="text-xs uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
                      {{ t('assessment.current_assessment_result') }}
                    </p>
                    <p class="text-base font-semibold text-zinc-900 dark:text-white">
                      {{ currentOverallResultOption ? getLocalizedLabel(currentOverallResultOption.label) : formatScore(runtimeSummary?.score.weightedScore ?? 0) }}
                    </p>
                  </div>

                  <p
                    v-if="alignmentDisabled"
                    class="text-sm text-zinc-500 dark:text-zinc-400">
                    {{ t('assessment.review_alignment_disabled') }}
                  </p>

                  <template v-else>
                    <UFormField :label="t('assessment.review_alignment_toggle')" name="egcs_cn_reviewalignment">
                      <USwitch
                        :model-value="assessmentResponse.egcs_cn_reviewalignment"
                        :disabled="!canUpdateAssessment"
                        @update:model-value="handleReviewAlignmentToggle" />
                    </UFormField>

                    <UFormField
                      v-if="assessmentResponse.egcs_cn_reviewalignment"
                      :label="t('assessment.review_alignment_result')"
                      name="egcs_cn_reviewalignresult">
                      <CommonBilingualSelectMenu
                        :model-value="reviewAlignResultValue"
                        :items="reviewAlignResultItems"
                        value-key="value"
                        label-key="label"
                        :disabled="!canUpdateAssessment"
                        @update:model-value="handleReviewAlignResultUpdate" />
                    </UFormField>

                    <UFormField
                      v-if="assessmentResponse.egcs_cn_reviewalignment"
                      :label="t('assessment.review_alignment_narrative')"
                      name="egcs_cn_reviewalignmentnarrative">
                      <CommonTextarea
                        :rows="4"
                        :disabled="!canUpdateAssessment"
                        :model-value="assessmentResponse.egcs_cn_reviewalignmentnarrative"
                        :stream-id="assessmentStreamId"
                        extension-slot-name="textarea.after"
                        :extension-context="{
                          textarea: {
                            kind: 'assessment.reviewAlignment',
                            locale,
                            label: t('assessment.review_alignment_narrative'),
                            text: assessmentResponse.egcs_cn_reviewalignmentnarrative,
                            assessmentSchemaId
                          }
                        }"
                        @update:model-value="value => setReviewAlignmentNarrative(String(value ?? ''))" />
                    </UFormField>
                  </template>
                </div>
              </UForm>

              <AssessmentAdditionalReviewersTab
                class="border-t border-primary-500 pt-8 dark:border-primary-600"
                :review-id="String(assessment.id)"
                :can-update-assessment="canUpdateAssessment"
                :reviewers-disabled="assessment.egcs_cn_disablereviewers === true"
                @progress-change="setAdditionalReviewerProgress" />

              <CommonAssignedUsers entity-type="commonreview" :entity-id="String(assessment.id)" />

              <CommonCompletionSection
                entity-type="commonreview"
                :entity-id="String(assessment.id)"
                :complete-payload="{ assessmentResponse }"
                title-key="assessment.completion.title"
                description-key="assessment.completion.description"
                status-complete-key="assessment.completion.status_complete"
                status-locked-key="assessment.completion.status_locked"
                comment-placeholder-key="assessment.completion.comment_placeholder"
                complete-action-key="assessment.completion.complete"
                completed-success-key="assessment.completion.completed_success"
                :is-locked="!canUpdateAssessment"
                @completed="handleCompleted" />

              <AssessmentApprovalsSection
                :key="approvalsRefreshKey"
                class="border-t border-primary-500 pt-8 dark:border-primary-600"
                entity-type="commonreview"
                :entity-id="String(assessment.id)"
                @changed="handleApprovalChanged" />
            </div>

            <UForm
              v-else-if="selectedSection"
              ref="sectionForm"
              :state="assessmentResponse"
              :validate="validateAssessmentResponse"
              class="space-y-8">
              <section
                v-for="(subSection, subSectionIndex) in filteredSubSections"
                :key="subSection._key"
                class="space-y-6"
                :class="subSectionIndex > 0 ? 'border-t border-primary-500 pt-8 dark:border-primary-600' : ''">
                <AssessmentSchemaPageSection
                  compact
                  :section-id="`assessment-${selectedSectionName}-${subSection.name}`"
                  :title="`${subSectionIndex + 1}. ${getLocalizedLabel(subSection.label)}`">
                  <div class="divide-y divide-zinc-200 dark:divide-zinc-800">
                    <template
                      v-for="(question, questionIndex) in getSubSectionItems(subSection)"
                      :key="question._key">
                      <AssessmentQuestionCard
                        v-if="question.type === 'question'"
                        :question="question"
                        :question-number="`${subSectionIndex + 1}.${questionIndex + 1}`"
                        :model-value="getQuestionValueInput(selectedSectionName, subSection.name, question.name)"
                        :comment-value="getQuestionComment(selectedSectionName, subSection.name, question.name)"
                        :stream-id="assessmentStreamId"
                        :assessment-schema-id="assessmentSchemaId"
                        :section-name="selectedSectionName"
                        :sub-section-name="subSection.name"
                        :comment-required="isCommentRequired(selectedSectionName, subSection.name, question)"
                        :comment-field-name="getAnswerCommentFieldName(selectedSectionName, subSection.name, question.name)"
                        :disabled="!canUpdateAssessment"
                        @update:model-value="value => setAnswerValue(selectedSectionName, subSection.name, question.name, value)"
                        @update:comment-value="value => setAnswerComment(selectedSectionName, subSection.name, question.name, value)" />

                      <div
                        v-else
                        class="flex items-center justify-between gap-4 py-6"
                        :data-testid="`assessment-calculation-card:${question.name}`">
                        <div class="space-y-1">
                          <p class="text-sm font-semibold text-zinc-900 dark:text-white">
                            {{ `${subSectionIndex + 1}.${questionIndex + 1} ${getLocalizedLabel(question.question)}` }}
                          </p>
                          <p class="text-xs uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
                            {{ t('transfer_payment.calculated_value') }}
                          </p>
                        </div>
                        <div
                          class="rounded-sm border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
                          :data-testid="`assessment-calculation-value:${question.name}`">
                          {{ getCalculatedScore(selectedSectionName, subSection.name, question.name) }}
                        </div>
                      </div>
                    </template>
                  </div>
                </AssessmentSchemaPageSection>
              </section>
            </UForm>
          </div>

          <aside class="w-full shrink-0 pt-6 lg:sticky lg:top-6 lg:order-last lg:w-96 lg:border-l lg:border-zinc-200 lg:pl-6 dark:lg:border-zinc-800 xl:w-[28rem]">
            <AssessmentRuntimeSummaryCard
              :summary="runtimeSummary"
              :section-tabs="sectionTabs"
              :selected-value="selectedTab"
              :outcomes-label="outcomeTabLabel"
              :outcomes-value="outcomesTabValue"
              :review-label="t('assessment.review_tab')"
              :review-value="reviewTabValue"
              :is-saving="isSaving"
              :can-save="canUpdateAssessment"
              @select="selectSummarySection"
              @save="handleSave" />
          </aside>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
