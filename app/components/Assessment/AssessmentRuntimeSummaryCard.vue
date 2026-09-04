<script setup lang="ts">
import { computed } from 'vue'
import ReviewRuntimeSidebar from '~/components/Review/ReviewRuntimeSidebar.vue'
import type { ReviewRuntimeNavigationItem } from '~/types/review-runtime'
import type { AssessmentRuntimeSummary } from '~~/shared/types/schemas/assessment/currentassessment'

type SectionTabItem = {
  key: string
  label: string
  icon: string
  value: string
  section: { name: string }
}
type ReviewStatusLabelKey = 'review_alignment' | 'additional_reviewers' | 'completion'

const {
  summary,
  sectionTabs,
  selectedValue,
  outcomesLabel,
  outcomesValue,
  reviewLabel = '',
  reviewValue = '',
  isSaving = false,
  canSave = true
} = defineProps<{
  summary: AssessmentRuntimeSummary | null
  sectionTabs: SectionTabItem[]
  selectedValue: string
  outcomesLabel: string
  outcomesValue: string
  reviewLabel?: string
  reviewValue?: string
  isSaving?: boolean
  canSave?: boolean
}>()

const emit = defineEmits<{ select: [value: string]; save: [] }>()
const { t } = useI18n()
const { getBilingualValue } = useBilingualValue()
const FALLBACK_COLOR = '#A1A1AA'
const formatScore = (value: number) => value.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')
const getLabel = (label: { en: string; fr: string }) => getBilingualValue({ label_en: label.en, label_fr: label.fr }, 'label')
const sectionTabMap = computed(() => new Map(sectionTabs.map(item => [item.section.name, item])))
const reviewStatusLabelMap = computed<Record<ReviewStatusLabelKey, string>>(() => ({
  review_alignment: t('assessment.review_alignment_title'),
  additional_reviewers: t('assessment.additional_reviewers.title'),
  completion: t('assessment.completion.title')
}))
const getSectionTab = (name: string) => sectionTabMap.value.get(name)
const navigationItems = computed<ReviewRuntimeNavigationItem[]>(() => [
  ...(summary?.sectionStatuses ?? []).map(sectionStatus => ({
    key: sectionStatus.name,
    label: getLabel(sectionStatus.label),
    icon: getSectionTab(sectionStatus.name)?.icon ?? 'i-lucide-folder',
    value: getSectionTab(sectionStatus.name)?.value ?? '',
    rows: sectionStatus.subSections.map(subSection => ({
      key: subSection.name,
      label: getLabel(subSection.label),
      status: subSection.status
    }))
  })),
  {
    key: 'outcomes',
    label: outcomesLabel,
    icon: 'i-lucide-flag',
    value: outcomesValue,
    ...((summary?.outcomeStatuses?.length ?? 0) === 0
      ? { status: summary?.outcomesStatus ?? 'empty' }
      : {}),
    rows: (summary?.outcomeStatuses ?? []).map(outcomeStatus => ({
      key: outcomeStatus.name,
      label: getLabel(outcomeStatus.label),
      status: outcomeStatus.status
    }))
  },
  ...(reviewValue
    ? [{
        key: 'review',
        label: reviewLabel,
        icon: 'i-lucide-messages-square',
        value: reviewValue,
        rows: (summary?.reviewStatuses ?? []).map(reviewStatus => ({
          key: reviewStatus.name,
          label: reviewStatusLabelMap.value[reviewStatus.name as ReviewStatusLabelKey] ?? reviewStatus.name,
          status: reviewStatus.status
        }))
      }]
    : [])
])
</script>

<template>
  <ReviewRuntimeSidebar
    :eyebrow="t('transfer_payment.assessment')"
    :title="t('transfer_payment.assessment_score_summary')"
    :items="navigationItems"
    :selected-value="selectedValue"
    :is-saving="isSaving"
    :can-save="canSave"
    @select="value => emit('select', value)"
    @save="emit('save')">
    <template #result>
      <div v-if="summary" class="space-y-1 pt-1">
        <div
          class="rounded-sm border px-3 py-3"
          :style="{
            borderColor: summary.score.scoreIndicator || FALLBACK_COLOR,
            backgroundColor: `${summary.score.scoreIndicator || FALLBACK_COLOR}12`
          }">
          <div class="flex items-start gap-3">
            <UIcon name="i-lucide-gauge" class="mt-0.5 size-5 shrink-0" :style="{ color: summary.score.scoreIndicator || FALLBACK_COLOR }" />
            <p class="min-w-0 flex-1 text-sm font-semibold text-zinc-950 dark:text-white">
              {{ t('transfer_payment.assessment_results') }}: {{ getLabel(summary.score.scoreLabel) }}
              ({{ formatScore(summary.score.weightedScore) }}/{{ formatScore(summary.score.totalScore) }})
            </p>
          </div>
        </div>

        <div
          v-for="section in summary.score.scoredSections"
          :key="section.score.name"
          class="flex items-start gap-3 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-200">
          <UIcon
            :name="getSectionTab(section.score.name)?.icon ?? 'i-lucide-folder'"
            class="mt-0.5 size-4 shrink-0"
            :style="{ color: section.scoreIndicator || FALLBACK_COLOR }" />
          <p class="min-w-0 flex-1">
            {{ getLabel(section.score.label) }}: {{ getLabel(section.scoreLabel) }}
            ({{ formatScore(section.score.rawScore) }}/{{ formatScore(section.totalScore) }})
          </p>
        </div>
      </div>
    </template>
  </ReviewRuntimeSidebar>
</template>
