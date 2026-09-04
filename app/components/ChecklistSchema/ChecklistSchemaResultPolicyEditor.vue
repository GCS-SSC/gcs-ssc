<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- local policy-editor mutations are self-describing */
import { computed } from 'vue'
import { nanoid } from 'nanoid'
import type {
  ChecklistPolicyQuestionOption,
  EditorResultPolicy
} from '~/types/checklist-result-policy-editor'

const policy = defineModel<EditorResultPolicy>({
  default: () => ({ anyFailureFails: true, groups: [] })
})
const currentPolicy = computed({
  get: () => policy.value,
  set: value => { policy.value = value }
})
const commitPolicy = (value: EditorResultPolicy) => {
  currentPolicy.value = value
  policy.value = value
}
const { questionOptions = [] } = defineProps<{
  questionOptions?: ChecklistPolicyQuestionOption[]
}>()
const { t } = useI18n()
const rootGroupCount = computed(() => currentPolicy.value.groups.length)

const updateAnyFailureFails = (anyFailureFails: boolean) => {
  commitPolicy({ ...currentPolicy.value, anyFailureFails })
}

const addGroup = () => {
  const number = currentPolicy.value.groups.length + 1
  commitPolicy({ ...currentPolicy.value, groups: [...currentPolicy.value.groups, {
    _key: nanoid(),
    kind: 'group',
    key: `result-group-${nanoid()}`,
    label: {
      en: t('checklist_schema.policy.default_group_name_en', { number }),
      fr: t('checklist_schema.policy.default_group_name_fr', { number })
    },
    mode: 'any',
    result: 'fail',
    items: []
  }] })
}
const moveGroup = (index: number, direction: -1 | 1) => {
  const destination = index + direction
  if (destination < 0 || destination >= currentPolicy.value.groups.length) return
  const groups = [...currentPolicy.value.groups]
  const [group] = groups.splice(index, 1)
  if (group !== undefined) {
    groups.splice(destination, 0, group)
    commitPolicy({ ...currentPolicy.value, groups })
  }
}
const removeGroup = (index: number) => {
  commitPolicy({ ...currentPolicy.value, groups: currentPolicy.value.groups.filter((_, groupIndex) => groupIndex !== index) })
}
const updateGroup = (index: number, group: EditorResultPolicy['groups'][number]) => {
  commitPolicy({
    ...currentPolicy.value,
    groups: currentPolicy.value.groups.map((item, groupIndex) => groupIndex === index ? group : item)
  })
}
</script>

<template>
  <div class="space-y-7">
    <div class="flex flex-col gap-4 border-y border-zinc-200 py-5 sm:flex-row sm:items-start sm:justify-between dark:border-zinc-800">
      <div class="max-w-3xl space-y-1">
        <p class="font-semibold text-zinc-900 dark:text-white">
          {{ t('checklist_schema.policy.any_failure_fails') }}
        </p>
        <p class="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          {{ t('checklist_schema.policy.any_failure_fails_help') }}
        </p>
      </div>
      <USwitch
        :model-value="currentPolicy.anyFailureFails"
        :aria-label="t('checklist_schema.policy.any_failure_fails')"
        class="mt-1 shrink-0"
        @update:model-value="updateAnyFailureFails($event)" />
    </div>

    <UAlert
      v-if="currentPolicy.anyFailureFails"
      icon="i-lucide-info"
      color="info"
      variant="subtle"
      :title="t('checklist_schema.policy.shortcut_active')"
      :description="t('checklist_schema.policy.shortcut_active_help')" />

    <fieldset :disabled="currentPolicy.anyFailureFails" :class="currentPolicy.anyFailureFails ? 'opacity-50' : ''" :aria-disabled="currentPolicy.anyFailureFails">
      <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 class="font-semibold text-zinc-900 dark:text-white">
            {{ t('checklist_schema.policy.groups') }}
          </h3>
          <p class="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            {{ t('checklist_schema.policy.groups_help') }}
          </p>
        </div>
        <UButton
          icon="i-lucide-plus"
          :label="t('checklist_schema.policy.add_group')"
          variant="outline"
          class="cursor-default"
          :disabled="currentPolicy.anyFailureFails"
          @click="addGroup" />
      </div>

      <p v-if="rootGroupCount === 0" class="border-default border-y py-5 text-sm text-zinc-500 dark:text-zinc-400">
        {{ t('checklist_schema.policy.no_groups') }}
      </p>
      <ol v-else class="divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        <li v-for="(group, groupIndex) in currentPolicy.groups" :key="group._key" class="py-3">
          <div class="mb-1 flex justify-end gap-1">
            <UButton icon="i-lucide-arrow-up" color="neutral" variant="ghost" class="cursor-default" :disabled="groupIndex === 0 || currentPolicy.anyFailureFails" :aria-label="t('checklist_schema.policy.move_group_up')" @click="moveGroup(groupIndex, -1)" />
            <UButton icon="i-lucide-arrow-down" color="neutral" variant="ghost" class="cursor-default" :disabled="groupIndex === currentPolicy.groups.length - 1 || currentPolicy.anyFailureFails" :aria-label="t('checklist_schema.policy.move_group_down')" @click="moveGroup(groupIndex, 1)" />
          </div>
          <ChecklistSchemaResultPolicyGroup
            :model-value="group"
            :depth="1"
            :question-options="questionOptions"
            @update:model-value="updateGroup(groupIndex, $event)"
            @remove="removeGroup(groupIndex)" />
        </li>
      </ol>
    </fieldset>
  </div>
</template>
