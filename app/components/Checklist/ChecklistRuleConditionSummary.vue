<script setup lang="ts">
import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import type { ChecklistDefinition, ChecklistResult } from '~~/shared/types/schemas/checklist/checklist'
import { getChecklistQuestions } from '~~/shared/utils/checklist-evaluation'

type ResultGroup = ChecklistDefinition['resultPolicy']['groups'][number]

const { group = {
  kind: 'group',
  key: 'result-group',
  label: { en: '', fr: '' },
  mode: 'any',
  result: 'fail',
  items: []
}, definition = {
  sections: [],
  resultPolicy: { anyFailureFails: true, groups: [] }
} } = defineProps<{
  group?: ResultGroup
  definition?: ChecklistDefinition
}>()
const { t } = useI18n()
const { getBilingualValue } = useBilingualValue()

const groupLabel: ComputedRef<string> = computed(() => getBilingualValue({
  label_en: group.label.en,
  label_fr: group.label.fr
}, 'label', group.key))
const questionLabels: ComputedRef<Map<string, string>> = computed(() => new Map(
  getChecklistQuestions(definition).map(question => [
    question.key,
    getBilingualValue({
      label_en: question.question.en,
      label_fr: question.question.fr
    }, 'label', question.key)
  ])
))
const modeKey: ComputedRef<string> = computed(() => {
  if (group.mode === 'at_least_count') return 'checklist.result_policy.mode_at_least_count'
  if (group.mode === 'at_least_rate') return 'checklist.result_policy.mode_at_least_rate'
  return `checklist.result_policy.mode_${group.mode}`
})
const modeParameters: ComputedRef<Record<string, string | number>> = computed(() => ({
  threshold: group.threshold === undefined ? 0 : group.threshold
}))
const resultColor = (result: ChecklistResult) => result === 'pass' ? 'success' : result === 'fail' ? 'error' : 'warning'
const questionLabel = (questionKey: string) => {
  const label = questionLabels.value.get(questionKey)
  return label === undefined ? questionKey : label
}
</script>

<template>
  <div class="space-y-3 border-l-2 border-zinc-200 pl-4 dark:border-zinc-700">
    <div class="flex flex-wrap items-start justify-between gap-2">
      <div class="min-w-0 space-y-1">
        <h4 class="font-semibold text-zinc-900 dark:text-white">
          {{ groupLabel }}
        </h4>
        <p class="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
          {{ t(modeKey, modeParameters) }}
        </p>
      </div>
      <UBadge :color="resultColor(group.result)" variant="subtle">
        {{ t(`checklist.result.${group.result}`) }}
      </UBadge>
    </div>

    <ul class="space-y-2">
      <li
        v-for="item in group.items"
        :key="item.kind === 'group' ? item.key : item.questionKey">
        <ChecklistRuleConditionSummary
          v-if="item.kind === 'group'"
          :group="item"
          :definition="definition" />
        <div v-else class="flex items-start gap-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          <UIcon name="i-lucide-circle-x" class="mt-1 size-4 shrink-0 text-error" />
          <span>{{ t('checklist.result_policy.question_failed_condition', {
            question: questionLabel(item.questionKey)
          }) }}</span>
        </div>
      </li>
    </ul>
  </div>
</template>
