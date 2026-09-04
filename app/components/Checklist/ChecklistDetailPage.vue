<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc, vue/singleline-html-element-content-newline -- local presentation helpers and compact result labels are self-describing */
import { computed, ref, watch } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import AssessmentAdditionalReviewersTab from '~/components/Assessment/AssessmentAdditionalReviewersTab.vue'
import AssessmentApprovalsSection from '~/components/Common/Approvals/Section.vue'
import CommonCompletionSection from '~/components/Common/Completions/Section.vue'
import ReviewRuntimeSidebar from '~/components/Review/ReviewRuntimeSidebar.vue'
import { useChecklistDetailPage } from '~/composables/useChecklistDetailPage'
import type { ReviewRuntimeNavigationItem, ReviewRuntimeStatus } from '~/types/review-runtime'
import type { ChecklistDefinition, ChecklistSection } from '~~/shared/types/schemas/checklist/checklist'
import {
  getChecklistQuestions,
  getChecklistSectionQuestions,
  isChecklistQuestionResponseComplete
} from '~~/shared/utils/checklist-evaluation'

const { t } = useI18n()
const { getBilingualValue } = useBilingualValue()
const approvalsRefreshKey: Ref<number> = ref(0)
const selectedValue: Ref<string> = ref('')
const isResultExplanationOpen: Ref<boolean> = ref(false)
const {
  checklist, loadError, loadStatus, responses, sections, canUpdate, isSaving, heroName, entityName, breadcrumbItems, liveEvaluation,
  totalAdditionalReviewerCount, pendingAdditionalReviewerCount, isHeroCollapsed, getResponse, updateAnswer,
  updateComment, setAdditionalReviewerProgress, saveChecklist, refresh
} = useChecklistDetailPage()

const REVIEW_VALUE = 'review'
const result = computed(() => liveEvaluation.value?.result ?? null)
const evaluationTrace = computed(() => liveEvaluation.value?.trace ?? null)
const resultColor = computed(() => result.value === 'pass' ? 'success' : result.value === 'fail' ? 'error' : 'warning')
const resultIcon = computed(() => result.value === 'pass'
  ? 'i-lucide-circle-check-big'
  : result.value === 'fail'
    ? 'i-lucide-circle-x'
    : 'i-lucide-triangle-alert')
const resultIconClass = computed(() => result.value === 'pass'
  ? 'text-success'
  : result.value === 'fail'
    ? 'text-error'
    : 'text-warning')
const getLabel = (value: { en: string; fr: string }, fallback = '') => getBilingualValue({
  label_en: value.en,
  label_fr: value.fr
}, 'label', fallback)
const responseByKey = computed(() => new Map(responses.value.map(response => [response.questionKey, response])))
const getQuestionStatus = (questions: ChecklistSection['questions']): ReviewRuntimeStatus => {
  const answered = questions.filter(question => responseByKey.value.get(question.key)?.answer !== null
    && responseByKey.value.get(question.key)?.answer !== undefined).length
  if (answered === 0) return 'empty'
  if (questions.every(question => isChecklistQuestionResponseComplete(
    question,
    responseByKey.value.get(question.key)
  ))) return 'completed'
  return 'in_progress'
}
const sectionValue = (sectionKey: string) => `section:${sectionKey}`
const additionalReviewersStatus = computed<ReviewRuntimeStatus>(() => {
  if (checklist.value?.egcs_cn_disablereviewers === true) return 'completed'
  const total = totalAdditionalReviewerCount.value
  const pending = pendingAdditionalReviewerCount.value
  if (total === 0) return 'empty'
  return pending > 0 ? 'in_progress' : 'completed'
})
const navigationItems: ComputedRef<ReviewRuntimeNavigationItem[]> = computed(() => [
  ...sections.value.map(section => ({
    key: section.key,
    label: getLabel(section.label, section.key),
    icon: 'i-lucide-list-checks',
    value: sectionValue(section.key),
    ...(section.subSections.length === 0
      ? { status: getQuestionStatus(section.questions) }
      : {}),
    rows: [
      ...(section.questions.length > 0
        ? [{ key: `${section.key}:general`, label: getLabel(section.label, section.key), status: getQuestionStatus(section.questions) }]
        : []),
      ...section.subSections.map(subSection => ({
        key: subSection.key,
        label: getLabel(subSection.label, subSection.key),
        status: getQuestionStatus(subSection.questions)
      }))
    ]
  })),
  {
    key: REVIEW_VALUE,
    label: t('assessment.review_tab'),
    icon: 'i-lucide-messages-square',
    value: REVIEW_VALUE,
    rows: [
      { key: 'additional_reviewers', label: t('assessment.additional_reviewers.title'), status: additionalReviewersStatus.value },
      { key: 'completion', label: t('assessment.completion.title'), status: checklist.value?.reviewRuntime?.is_locked === true ? 'completed' : 'empty' }
    ]
  }
])

watch(sections, value => {
  if (!selectedValue.value && value[0]) selectedValue.value = sectionValue(value[0].key)
}, { immediate: true })

const selectedSectionIndex = computed(() => sections.value.findIndex(section => sectionValue(section.key) === selectedValue.value))
const selectedSection = computed(() => sections.value[selectedSectionIndex.value])
const selectedSectionBlocks = computed(() => {
  const section = selectedSection.value
  if (!section) return []
  return [
    ...(section.questions.length > 0
      ? [{ key: `${section.key}:general`, label: section.label, questions: section.questions }]
      : []),
    ...section.subSections
  ]
})
const sectionAnswerSummary = (section: ChecklistSection) => {
  const questions = getChecklistSectionQuestions(section)
  return {
    passed: questions.filter(question => responseByKey.value.get(question.key)?.answer === 'pass').length,
    failed: questions.filter(question => responseByKey.value.get(question.key)?.answer === 'fail').length
  }
}

type ResultGroup = ChecklistDefinition['resultPolicy']['groups'][number]
const findGroup = (groups: ResultGroup[], groupKey: string): ResultGroup | undefined => {
  for (const group of groups) {
    if (group.key === groupKey) return group
    const match = findGroup(group.items.filter((item): item is ResultGroup => item.kind === 'group'), groupKey)
    if (match) return match
  }
  return undefined
}
const triggeringQuestionLabels = computed(() => {
  const definition = checklist.value?.checklistDefinition
  const trace = evaluationTrace.value
  if (!definition || !trace) return []
  const labels = new Map(getChecklistQuestions(definition).map(question => [question.key, getLabel(question.question, question.key)]))
  return trace.triggeringQuestionKeys.map(key => ({ key, label: labels.get(key) ?? key }))
})
const strongestGroupLabel = computed(() => {
  const definition = checklist.value?.checklistDefinition
  const key = evaluationTrace.value?.strongestMatchedGroupKey
  if (!definition || !key) return ''
  const group = findGroup(definition.resultPolicy.groups, key)
  return group ? getLabel(group.label, group.key) : key
})
const resultExplanation = computed(() => {
  const trace = evaluationTrace.value
  if (!trace) return ''
  if (trace.policyMode === 'any_failure_fails') {
    return t(trace.shortcutMatched
      ? 'checklist.result_policy.runtime_shortcut_matched'
      : 'checklist.result_policy.runtime_shortcut_passed')
  }
  return trace.strongestMatchedGroupKey
    ? t('checklist.result_policy.runtime_group_matched', { group: strongestGroupLabel.value })
    : t('checklist.result_policy.runtime_no_group_matched')
})
const handleCompleted = async () => {
  await refresh()
  approvalsRefreshKey.value += 1
}
const handleApprovalChanged = async () => {
  await refresh()
}
</script>

<template>
  <UDashboardPanel id="checklist-detail">
    <template #header>
      <UDashboardNavbar>
        <template #leading>
          <UDashboardSidebarCollapse />
          <UBreadcrumb :items="breadcrumbItems" class="ml-2" />
        </template>
        <template #right>
          <div class="flex items-center gap-2">
            <UButton
              color="neutral" variant="ghost" class="cursor-default" :icon="isHeroCollapsed ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'"
              :aria-label="t(isHeroCollapsed ? 'common.expand' : 'common.collapse')" @click="isHeroCollapsed = !isHeroCollapsed" />
            <CommonNavbarSide />
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="loadError" class="p-6" data-testid="checklist-load-error">
        <UAlert
          color="error"
          icon="i-lucide-circle-alert"
          :title="t('checklist.load_failed')"
          :description="t('checklist.load_failed_description')">
          <template #actions>
            <UButton
              color="error"
              variant="soft"
              size="sm"
              icon="i-lucide-refresh-cw"
              :label="t('common.retry')"
              @click="() => refresh()" />
          </template>
        </UAlert>
      </div>

      <div v-else-if="loadStatus === 'pending' && !checklist" class="p-6" data-testid="checklist-loading" role="status" aria-live="polite">
        <CommonLoadingState :label="t('common.loading')" />
      </div>

      <div v-else class="flex flex-1 flex-col">
        <CommonEntityHero
          :is-collapsed="isHeroCollapsed"
          icon="i-lucide-list-checks"
          :title="heroName"
          :meta-items="[entityName]"
          :badges="[
            ...(checklist?.runtimeState ? [{ lifecycleEngine: 'runtime' as const, lifecycleState: checklist.runtimeState }] : []),
            { variant: 'code', label: `${t('transfer_payment.schema_version')} ${checklist?.publicationVersion ?? 0}` }
          ]" />

        <div class="flex min-h-0 flex-1 flex-col gap-6 overflow-visible px-6 pt-0 pb-6 lg:flex-row lg:items-start lg:gap-8">
          <main class="min-h-0 min-w-0 flex-1 pt-6">
            <div v-if="selectedValue === REVIEW_VALUE && checklist?.id" class="space-y-8">
              <AssessmentAdditionalReviewersTab
                :review-id="String(checklist.id)"
                :can-update-assessment="canUpdate"
                :reviewers-disabled="checklist.egcs_cn_disablereviewers === true"
                @progress-change="setAdditionalReviewerProgress" />
              <CommonAssignedUsers entity-type="commonreview" :entity-id="String(checklist.id)" />
              <CommonCompletionSection
                entity-type="commonreview"
                :entity-id="String(checklist.id)"
                :complete-payload="{ checklistResponse: { responses } }"
                title-key="assessment.completion.title"
                description-key="checklist.completion_description"
                status-complete-key="assessment.completion.status_complete"
                status-locked-key="assessment.completion.status_locked"
                comment-placeholder-key="assessment.completion.comment_placeholder"
                complete-action-key="assessment.completion.complete"
                completed-success-key="assessment.completion.completed_success"
                :is-locked="!canUpdate"
                @completed="handleCompleted" />
              <AssessmentApprovalsSection
                :key="approvalsRefreshKey"
                class="border-t border-primary-500 pt-8 dark:border-primary-600"
                entity-type="commonreview"
                :entity-id="String(checklist.id)"
                @changed="handleApprovalChanged" />
            </div>

            <div v-else-if="selectedSection" class="space-y-8">
              <section
                v-for="(block, blockIndex) in selectedSectionBlocks"
                :key="block.key"
                class="space-y-6"
                :class="blockIndex > 0 ? 'border-t border-primary-500 pt-8 dark:border-primary-600' : ''">
                <AssessmentSchemaPageSection
                  compact
                  :section-id="`checklist-${selectedSection.key}-${block.key}`"
                  :title="`${blockIndex + 1}. ${getLabel(block.label, block.key)}`">
                  <div class="divide-y divide-zinc-200 dark:divide-zinc-800">
                    <ChecklistQuestion
                      v-for="(question, questionIndex) in block.questions"
                      :key="question.key"
                      :question="question"
                      :number="`${blockIndex + 1}.${questionIndex + 1}`"
                      :model-value="getResponse(question.key)?.answer"
                      :comment-value="getResponse(question.key)?.comment"
                      :disabled="!canUpdate"
                      @update:model-value="value => updateAnswer(question.key, value)"
                      @update:comment-value="value => updateComment(question.key, value)" />
                  </div>
                </AssessmentSchemaPageSection>
              </section>
            </div>
          </main>

          <aside class="w-full shrink-0 pt-6 lg:sticky lg:top-6 lg:order-last lg:w-96 lg:border-l lg:border-zinc-200 lg:pl-6 dark:lg:border-zinc-800 xl:w-[28rem]">
            <ReviewRuntimeSidebar
              :eyebrow="t('checklist.title')"
              :title="t('checklist.result_summary')"
              :items="navigationItems"
              :selected-value="selectedValue"
              :is-saving="isSaving"
              :can-save="canUpdate"
              @select="value => selectedValue = value"
              @save="saveChecklist">
              <template #result>
                <div v-if="result" class="space-y-1 pt-1">
                  <div
                    class="space-y-3 rounded-sm border px-3 py-3"
                    :class="{
                      'border-success-500 bg-success-500/10': result === 'pass',
                      'border-error-500 bg-error-500/10': result === 'fail',
                      'border-warning-500 bg-warning-500/10': result === 'pass_with_considerations'
                    }">
                    <div
                      class="flex items-start gap-3">
                      <UIcon :name="resultIcon" class="mt-0.5 size-5 shrink-0" :class="resultIconClass" />
                      <p class="min-w-0 flex-1 text-sm font-semibold text-zinc-950 dark:text-white">
                        {{ t('checklist.results') }}: {{ t(`checklist.result.${result}`) }}
                      </p>
                    </div>
                    <UModal
                      v-model:open="isResultExplanationOpen"
                      :title="t('checklist.why_result')"
                      :description="t(`checklist.result.${result}`)"
                      :ui="{ content: 'sm:max-w-4xl', body: 'max-h-[75vh] space-y-6 overflow-y-auto' }">
                      <UButton
                        icon="i-lucide-list-tree"
                        :label="t('checklist.explain')"
                        color="neutral"
                        variant="outline"
                        class="w-full cursor-default justify-center"
                        @click="isResultExplanationOpen = true" />
                      <template #body>
                        <div class="space-y-2">
                          <UBadge :color="resultColor" variant="subtle">{{ t(`checklist.result.${result}`) }}</UBadge>
                          <p class="text-sm leading-6 text-zinc-700 dark:text-zinc-300">{{ resultExplanation }}</p>
                        </div>
                        <div
                          v-if="evaluationTrace?.groups.length && checklist?.checklistDefinition"
                          class="space-y-4 border-t border-zinc-200 pt-5 dark:border-zinc-800">
                          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                            {{ t('checklist.evaluated_rule_tree') }}
                          </p>
                          <ChecklistResultTraceGroup
                            v-for="group in evaluationTrace.groups"
                            :key="group.key"
                            :group="group"
                            :definition="checklist.checklistDefinition" />
                        </div>
                        <div v-if="triggeringQuestionLabels.length > 0" class="space-y-3">
                          <p class="text-sm font-semibold text-zinc-950 dark:text-white">{{ t('checklist.result_policy.triggering_questions') }}</p>
                          <ul class="space-y-2">
                            <li v-for="item in triggeringQuestionLabels" :key="item.key" class="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                              <UIcon name="i-lucide-circle-x" class="mt-0.5 size-4 shrink-0 text-error" />
                              <span>{{ item.label }}</span>
                            </li>
                          </ul>
                        </div>
                      </template>
                    </UModal>
                  </div>

                  <div v-for="section in sections" :key="section.key" class="flex items-start gap-3 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-200">
                    <UIcon name="i-lucide-list-checks" class="mt-0.5 size-4 shrink-0 text-primary-700 dark:text-primary-200" />
                    <p class="min-w-0 flex-1">
                      {{ getLabel(section.label, section.key) }}:
                      {{ t('checklist.section_answer_summary', sectionAnswerSummary(section)) }}
                    </p>
                  </div>
                </div>
              </template>
            </ReviewRuntimeSidebar>
          </aside>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
