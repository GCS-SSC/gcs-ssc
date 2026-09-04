<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- local trace presentation helpers are self-describing */
import { computed } from 'vue'
import type { ChecklistDefinition, ChecklistResultGroup } from '~~/shared/types/schemas/checklist/checklist'
import type { ChecklistResultGroupTrace } from '~~/shared/utils/checklist-evaluation'
import { getChecklistQuestions } from '~~/shared/utils/checklist-evaluation'

const { group, definition, depth = 0 } = defineProps<{
  group: ChecklistResultGroupTrace
  definition: ChecklistDefinition
  depth?: number
}>()

const { t } = useI18n()
const { getBilingualValue } = useBilingualValue()

const findConfiguredGroup = (groups: ChecklistResultGroup[], groupKey: string): ChecklistResultGroup | undefined => {
  for (const candidate of groups) {
    if (candidate.key === groupKey) return candidate
    const nestedGroups = candidate.items.filter((item): item is ChecklistResultGroup => item.kind === 'group')
    const nestedMatch = findConfiguredGroup(nestedGroups, groupKey)
    if (nestedMatch) return nestedMatch
  }
  return undefined
}
const configuredGroup = computed(() => findConfiguredGroup(definition.resultPolicy.groups, group.key))
const groupLabel = computed(() => configuredGroup.value
  ? getBilingualValue({ label_en: configuredGroup.value.label.en, label_fr: configuredGroup.value.label.fr }, 'label', group.key)
  : group.key)
const questionLabels = computed(() => new Map(getChecklistQuestions(definition).map(question => [
  question.key,
  getBilingualValue({ question_en: question.question.en, question_fr: question.question.fr }, 'question', question.key)
])))
const conditionLabel = computed(() => {
  if (group.mode === 'at_least_count') {
    return t('checklist.result_policy.mode_at_least_count', { threshold: group.threshold })
  }
  if (group.mode === 'at_least_rate') {
    return t('checklist.result_policy.mode_at_least_rate', { threshold: group.threshold })
  }
  return t(`checklist.result_policy.mode_${group.mode}`)
})
const resultColor = computed(() => group.result === 'fail'
  ? 'error'
  : group.result === 'pass_with_considerations'
    ? 'warning'
    : 'success')
</script>

<template>
  <div
    class="space-y-3 border-l-2 pl-4"
    :class="group.matched ? 'border-primary-500' : 'border-zinc-300 dark:border-zinc-700'"
    :data-depth="depth">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0 space-y-1">
        <p class="font-semibold text-zinc-950 dark:text-white">
          {{ groupLabel }}
        </p>
        <p class="text-sm text-zinc-600 dark:text-zinc-300">
          {{ conditionLabel }} · {{ t('checklist.matched_rule_counts', { matched: group.matchedItemCount, total: group.totalItemCount }) }}
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <UBadge :color="group.matched ? 'primary' : 'neutral'" variant="subtle">
          {{ t(group.matched ? 'checklist.rule_matched' : 'checklist.rule_not_matched') }}
        </UBadge>
        <UBadge :color="resultColor" variant="outline">
          {{ t('checklist.rule_result', { result: t(`checklist.result.${group.result}`) }) }}
        </UBadge>
      </div>
    </div>

    <div class="space-y-3">
      <template v-for="child in group.children" :key="child.kind === 'group' ? child.key : child.questionKey">
        <ChecklistResultTraceGroup
          v-if="child.kind === 'group'"
          :group="child"
          :definition="definition"
          :depth="depth + 1" />
        <div
          v-else
          class="flex items-start justify-between gap-3 rounded-sm bg-zinc-100/70 px-3 py-2 text-sm dark:bg-zinc-800/60">
          <div class="flex min-w-0 items-start gap-2">
            <UIcon
              :name="child.matched ? 'i-lucide-circle-x' : 'i-lucide-circle-check'"
              class="mt-0.5 size-4 shrink-0"
              :class="child.matched ? 'text-error' : 'text-zinc-400 dark:text-zinc-500'" />
            <span class="text-zinc-800 dark:text-zinc-200">
              {{ questionLabels.get(child.questionKey) ?? child.questionKey }}
            </span>
          </div>
          <span class="shrink-0 text-zinc-600 dark:text-zinc-300">
            {{ child.actualAnswer ? t(`checklist.answer.${child.actualAnswer}`) : t('checklist.unanswered') }}
          </span>
        </div>
      </template>
    </div>
  </div>
</template>
