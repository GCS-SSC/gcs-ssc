<script setup lang="ts">
import { ref } from 'vue'
import type { Ref } from 'vue'
import type { ChecklistDefinition } from '~~/shared/types/schemas/checklist/checklist'

const { definition, context = 'runtime' } = defineProps<{
  definition: ChecklistDefinition
  context?: 'runtime' | 'setup'
}>()
const { t } = useI18n()
const isOpen: Ref<boolean> = ref(false)
</script>

<template>
  <USlideover
    v-model:open="isOpen"
    :title="t('checklist.result_policy.help_title')"
    :description="t(context === 'setup'
      ? 'checklist.result_policy.help_setup_description'
      : 'checklist.result_policy.help_runtime_description')"
    side="right"
    :ui="{
      content: 'sm:max-w-xl',
      body: 'space-y-7'
    }">
    <UButton
      icon="i-lucide-circle-help"
      color="primary"
      variant="solid"
      size="xs"
      class="cursor-default rounded-full shadow-sm transition-colors hover:bg-primary/90"
      :aria-label="t('checklist.result_policy.open_help')"
      :title="t('checklist.result_policy.open_help')"
      :ui="{ leadingIcon: 'size-4' }"
      @click="isOpen = true" />

    <template #body>
      <section class="space-y-2 border-l-2 border-success pl-4">
        <h3 class="font-semibold text-zinc-900 dark:text-white">
          {{ t('checklist.result_policy.default_pass_title') }}
        </h3>
        <p class="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          {{ t('checklist.result_policy.default_pass_body') }}
        </p>
      </section>

      <section class="space-y-3">
        <div class="flex items-start gap-3">
          <UIcon
            :name="definition.resultPolicy.anyFailureFails ? 'i-lucide-toggle-right' : 'i-lucide-toggle-left'"
            class="mt-0.5 size-5 shrink-0 text-primary" />
          <div class="space-y-1">
            <h3 class="font-semibold text-zinc-900 dark:text-white">
              {{ t('checklist.result_policy.any_failure_title') }}
            </h3>
            <p class="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              {{ t(definition.resultPolicy.anyFailureFails
                ? 'checklist.result_policy.any_failure_active_body'
                : 'checklist.result_policy.any_failure_inactive_body') }}
            </p>
          </div>
        </div>
      </section>

      <section v-if="!definition.resultPolicy.anyFailureFails" class="space-y-4">
        <div class="space-y-1">
          <h3 class="text-xs font-semibold tracking-[0.16em] text-zinc-500 uppercase dark:text-zinc-400">
            {{ t('checklist.result_policy.configured_groups') }}
          </h3>
          <p class="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            {{ t('checklist.result_policy.root_groups_body') }}
          </p>
        </div>

        <div v-if="definition.resultPolicy.groups.length > 0" class="space-y-5">
          <ChecklistRuleConditionSummary
            v-for="group in definition.resultPolicy.groups"
            :key="group.key"
            :group="group"
            :definition="definition" />
        </div>
        <p v-else class="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          {{ t('checklist.result_policy.no_groups') }}
        </p>
      </section>

      <section class="space-y-3 border-t border-zinc-200 pt-5 dark:border-zinc-800">
        <h3 class="font-semibold text-zinc-900 dark:text-white">
          {{ t('checklist.result_policy.group_logic_title') }}
        </h3>
        <ul class="space-y-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          <li class="flex gap-2">
            <UIcon name="i-lucide-git-branch" class="mt-1 size-4 shrink-0 text-primary" />
            <span>{{ t('checklist.result_policy.group_logic_modes') }}</span>
          </li>
          <li class="flex gap-2">
            <UIcon name="i-lucide-corner-down-right" class="mt-1 size-4 shrink-0 text-primary" />
            <span>{{ t('checklist.result_policy.ancestor_gating_body') }}</span>
          </li>
          <li class="flex gap-2">
            <UIcon name="i-lucide-layers-3" class="mt-1 size-4 shrink-0 text-primary" />
            <span>{{ t('checklist.result_policy.severity_body') }}</span>
          </li>
        </ul>
      </section>

      <section class="border-t border-zinc-200 pt-5 text-sm leading-6 text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
        <p>{{ t('checklist.result_policy.comments_body') }}</p>
      </section>
    </template>
  </USlideover>
</template>
