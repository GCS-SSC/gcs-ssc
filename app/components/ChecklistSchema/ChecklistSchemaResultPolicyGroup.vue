<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- local recursive editor mutations are self-describing */
import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { nanoid } from 'nanoid'
import type {
  ChecklistPolicyQuestionOption,
  EditorQuestionFailure,
  EditorResultGroup
} from '~/types/checklist-result-policy-editor'
import { CHECKLIST_RESULTS, CHECKLIST_RESULT_GROUP_MODES } from '~~/shared/types/schemas/checklist/checklist'

const group = defineModel<EditorResultGroup>({
  default: () => ({
    _key: nanoid(),
    kind: 'group',
    key: 'result-group',
    label: { en: '', fr: '' },
    mode: 'any',
    result: 'fail',
    items: []
  })
})
const currentGroup: Ref<EditorResultGroup> = ref({
  ...group.value,
  label: { ...group.value.label },
  items: [...group.value.items]
})
const commitGroup = (value: EditorResultGroup) => {
  currentGroup.value = value
  group.value = value
}
const { depth = 1, questionOptions = [] } = defineProps<{
  depth?: number
  questionOptions?: ChecklistPolicyQuestionOption[]
}>()
const emit = defineEmits<{
  remove: []
}>()
const { t } = useI18n()
const { getBilingualValue } = useBilingualValue()
const isExpanded: Ref<boolean> = ref(true)
const selectedQuestionKey: Ref<string | null> = ref(null)
const resultOptions = computed(() => CHECKLIST_RESULTS.map(value => ({
  label: t(`checklist_schema.policy.results.${value}`),
  value
})))
const modeOptions = computed(() => CHECKLIST_RESULT_GROUP_MODES.map(value => ({
  label: t(`checklist_schema.policy.modes.${value}`),
  value
})))

const directlySelectedQuestionKeys = computed(() => new Set(currentGroup.value.items
  .filter(item => item.kind === 'question_failed')
  .map(item => item.questionKey)))
const availableQuestionOptions = computed(() => questionOptions.filter(option => !directlySelectedQuestionKeys.value.has(option.value)))
const questionOptionByKey = computed(() => new Map(questionOptions.map(option => [option.value, option])))
const groupSummary = computed(() => t(`checklist_schema.policy.summaries.${currentGroup.value.mode}`, {
  count: currentGroup.value.items.length,
  threshold: currentGroup.value.threshold ?? 0
}))
const groupTitle = computed(() => {
  return getBilingualValue({
    label_en: currentGroup.value.label.en,
    label_fr: currentGroup.value.label.fr
  }, 'label', t('checklist_schema.policy.unnamed_group'))
})
const updateLabel = (locale: 'en' | 'fr', value: string) => {
  currentGroup.value.label[locale] = value
  commitGroup({
    ...currentGroup.value,
    label: { ...currentGroup.value.label, [locale]: value }
  })
}
const updateResult = (result: string | undefined) => {
  const matchedResult = CHECKLIST_RESULTS.find(value => value === result)
  if (matchedResult === undefined) return
  commitGroup({ ...currentGroup.value, result: matchedResult })
}
const updateMode = (mode: string | undefined) => {
  const matchedMode = CHECKLIST_RESULT_GROUP_MODES.find(value => value === mode)
  if (matchedMode === undefined) return
  const threshold = matchedMode === 'at_least_count' ? 1 : matchedMode === 'at_least_rate' ? 50 : undefined
  commitGroup({ ...currentGroup.value, mode: matchedMode, threshold })
}
const updateThreshold = (value: string | number) => {
  commitGroup({ ...currentGroup.value, threshold: Number(value) })
}

const moveItem = (index: number, direction: -1 | 1) => {
  const destination = index + direction
  if (destination < 0 || destination >= currentGroup.value.items.length) return
  const items = [...currentGroup.value.items]
  const [item] = items.splice(index, 1)
  if (item !== undefined) {
    items.splice(destination, 0, item)
    commitGroup({ ...currentGroup.value, items })
  }
}
const addQuestion = () => {
  if (!selectedQuestionKey.value) return
  commitGroup({ ...currentGroup.value, items: [...currentGroup.value.items, {
    _key: nanoid(),
    kind: 'question_failed',
    questionKey: selectedQuestionKey.value
  }] })
  selectedQuestionKey.value = null
}
const addSubGroup = () => {
  if (depth >= 3) return
  const number = currentGroup.value.items.filter(item => item.kind === 'group').length + 1
  commitGroup({ ...currentGroup.value, items: [...currentGroup.value.items, {
    _key: nanoid(),
    kind: 'group',
    key: `${currentGroup.value.key}-group-${nanoid()}`,
    label: {
      en: t('checklist_schema.policy.default_group_name_en', { number }),
      fr: t('checklist_schema.policy.default_group_name_fr', { number })
    },
    mode: 'any',
    result: 'fail',
    items: []
  }] })
}
const removeItem = (index: number) => {
  commitGroup({ ...currentGroup.value, items: currentGroup.value.items.filter((_, itemIndex) => itemIndex !== index) })
}
const nestedGroup = (item: EditorQuestionFailure | EditorResultGroup): EditorResultGroup => {
  if (item.kind !== 'group') throw new Error('Expected a nested checklist result group')
  return item
}
const updateNestedGroup = (index: number, value: EditorResultGroup) => {
  commitGroup({
    ...currentGroup.value,
    items: currentGroup.value.items.map((item, itemIndex) => itemIndex === index ? value : item)
  })
}
const questionLabel = (questionKey: string) => {
  const option = questionOptionByKey.value.get(questionKey)
  return option ? getBilingualValue(option, 'name') : questionKey
}
</script>

<template>
  <section
    class="border-default border-l-2 pl-4"
    :class="depth === 1 ? 'border-l-primary-500' : ''"
    data-testid="checklist-policy-group"
    :data-depth="depth">
    <header class="flex flex-wrap items-start justify-between gap-3 py-3">
      <button
        type="button"
        class="flex min-w-0 flex-1 cursor-default items-start gap-3 text-left"
        :aria-expanded="isExpanded"
        @click="isExpanded = !isExpanded">
        <UIcon
          :name="isExpanded ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
          class="mt-1 size-4 shrink-0 text-zinc-500" />
        <span class="min-w-0">
          <span class="block truncate font-semibold text-zinc-900 dark:text-white">
            {{ groupTitle }}
          </span>
          <span class="block text-xs text-zinc-500 dark:text-zinc-400">{{ groupSummary }}</span>
        </span>
      </button>
      <div class="flex shrink-0 items-center gap-1">
        <UBadge color="neutral" variant="subtle">
          {{ t(`checklist_schema.policy.results.${currentGroup.result}`) }}
        </UBadge>
        <UButton
          icon="i-lucide-trash"
          color="error"
          variant="ghost"
          class="cursor-default"
          :aria-label="t('checklist_schema.policy.remove_group')"
          @click="emit('remove')" />
      </div>
    </header>

    <div v-if="isExpanded" class="space-y-5 pb-6">
      <div class="grid gap-4 md:grid-cols-2">
        <UFormField :label="t('checklist_schema.policy.group_name_en')">
          <UInput v-model="currentGroup.label.en" class="w-full" @blur="updateLabel('en', currentGroup.label.en)" />
        </UFormField>
        <UFormField :label="t('checklist_schema.policy.group_name_fr')">
          <UInput v-model="currentGroup.label.fr" class="w-full" @blur="updateLabel('fr', currentGroup.label.fr)" />
        </UFormField>
        <UFormField :label="t('checklist_schema.policy.result')">
          <CommonEnumSelect :model-value="currentGroup.result" name="review_type" :items="resultOptions" class="w-full" @update:model-value="updateResult($event)" />
        </UFormField>
        <UFormField :label="t('checklist_schema.policy.mode')">
          <CommonEnumSelect :model-value="currentGroup.mode" name="review_type" :items="modeOptions" class="w-full" @update:model-value="updateMode($event)" />
        </UFormField>
        <UFormField
          v-if="currentGroup.mode === 'at_least_count' || currentGroup.mode === 'at_least_rate'"
          :label="currentGroup.mode === 'at_least_rate' ? t('checklist_schema.policy.rate_threshold') : t('checklist_schema.policy.count_threshold')">
          <UInput
            :model-value="currentGroup.threshold"
            type="number"
            min="1"
            :max="currentGroup.mode === 'at_least_rate' ? 100 : currentGroup.items.length"
            class="w-full"
            @update:model-value="updateThreshold($event)" />
        </UFormField>
      </div>

      <div class="flex flex-col gap-3 border-y border-zinc-200 py-4 sm:flex-row sm:items-end dark:border-zinc-800">
        <UFormField :label="t('checklist_schema.policy.add_question')" class="min-w-0 flex-1">
          <CommonBilingualSelectMenu
            v-model="selectedQuestionKey"
            :items="availableQuestionOptions"
            value-key="value"
            searchable
            class="w-full" />
        </UFormField>
        <UButton
          icon="i-lucide-plus"
          :label="t('checklist_schema.policy.add_question_action')"
          variant="outline"
          class="cursor-default"
          :disabled="selectedQuestionKey === null"
          @click="addQuestion" />
        <UButton
          v-if="depth < 3"
          icon="i-lucide-git-branch-plus"
          :label="t('checklist_schema.policy.add_subgroup')"
          variant="outline"
          class="cursor-default"
          @click="addSubGroup" />
      </div>

      <p v-if="currentGroup.items.length === 0" class="text-sm text-zinc-500 dark:text-zinc-400">
        {{ t('checklist_schema.policy.empty_group') }}
      </p>
      <ol v-else class="space-y-3">
        <li v-for="(item, itemIndex) in currentGroup.items" :key="item._key">
          <div v-if="item.kind === 'question_failed'" class="flex items-center gap-3 border-l-2 border-zinc-200 py-2 pl-4 dark:border-zinc-700">
            <UIcon name="i-lucide-circle-x" class="size-4 shrink-0 text-error-500" />
            <span class="min-w-0 flex-1 text-sm text-zinc-800 dark:text-zinc-100">
              {{ questionLabel(item.questionKey) }}
            </span>
            <span class="shrink-0 text-xs font-medium text-zinc-500">
              {{ t('checklist_schema.policy.is_failed') }}
            </span>
            <div class="flex shrink-0 gap-1">
              <UButton icon="i-lucide-arrow-up" color="neutral" variant="ghost" class="cursor-default" :disabled="itemIndex === 0" :aria-label="t('checklist_schema.policy.move_up')" @click="moveItem(itemIndex, -1)" />
              <UButton icon="i-lucide-arrow-down" color="neutral" variant="ghost" class="cursor-default" :disabled="itemIndex === currentGroup.items.length - 1" :aria-label="t('checklist_schema.policy.move_down')" @click="moveItem(itemIndex, 1)" />
              <UButton icon="i-lucide-trash" color="error" variant="ghost" class="cursor-default" :aria-label="t('checklist_schema.policy.remove_question')" @click="removeItem(itemIndex)" />
            </div>
          </div>
          <div v-else>
            <div class="mb-1 flex justify-end gap-1">
              <UButton icon="i-lucide-arrow-up" color="neutral" variant="ghost" class="cursor-default" :disabled="itemIndex === 0" :aria-label="t('checklist_schema.policy.move_group_up')" @click="moveItem(itemIndex, -1)" />
              <UButton icon="i-lucide-arrow-down" color="neutral" variant="ghost" class="cursor-default" :disabled="itemIndex === currentGroup.items.length - 1" :aria-label="t('checklist_schema.policy.move_group_down')" @click="moveItem(itemIndex, 1)" />
            </div>
            <ChecklistSchemaResultPolicyGroup
              :model-value="nestedGroup(item)"
              :depth="depth + 1"
              :question-options="questionOptions"
              @update:model-value="updateNestedGroup(itemIndex, $event)"
              @remove="removeItem(itemIndex)" />
          </div>
        </li>
      </ol>

      <p v-if="depth === 3" class="text-xs text-zinc-500 dark:text-zinc-400">
        {{ t('checklist_schema.policy.maximum_depth') }}
      </p>
    </div>
  </section>
</template>
