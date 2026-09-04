<!-- eslint-disable jsdoc/require-jsdoc, jsdoc/require-param-description, jsdoc/require-returns -->
<script setup lang="ts">
import type { AssessmentAnswerPathTreeNode } from '~/utils/assessment-schema'
import { useAssessmentSchemaHelperDefinitions } from '~/composables/useAssessmentSchemaHelpers'
import {
  applyAnswersDependencyValue,
  createAnswersDependencyValue,
  createDependencyClauseUi,
  createDependencyRuleUi,
  getDependencyModelFromRules,
  getDependencyRulesFromModel
} from '~/components/AssessmentSchema/assessment-schema-dependency'
import type { DependencyRuleUi } from '~/components/AssessmentSchema/assessment-schema-dependency'
import { getAssessmentHelperComparableValueType } from '~~/shared/utils/assessment-helpers'

const depends = defineModel<unknown | undefined>({ required: true })

const {
  answerPathTree
} = defineProps<{
  answerPathTree: AssessmentAnswerPathTreeNode[]
}>()

const { t } = useI18n()
const helperDefinitions = useAssessmentSchemaHelperDefinitions()
const defaultHelperField = computed(() => helperDefinitions.value[0]?.field ?? '')

const dependencyModeItems = computed(() => [
  { label: t('transfer_payment.single_condition'), value: 'single' as const },
  { label: t('transfer_payment.group_conditions'), value: 'group' as const }
])

const dependencyOnTypeItems = computed(() => [
  { label: t('transfer_payment.helpers_dependency'), value: 'helpers' as const },
  { label: t('transfer_payment.answers_dependency'), value: 'answers' as const }
])

const dependencyValueTypeItems = computed(() => [
  { label: t('transfer_payment.boolean_value'), value: 'boolean' as const },
  { label: t('transfer_payment.number_value'), value: 'number' as const },
  { label: t('transfer_payment.text_value'), value: 'string' as const }
])

const booleanValueItems = computed(() => [
  { label: t('common.true'), value: true },
  { label: t('common.false'), value: false }
])

const dependencyRules = ref<DependencyRuleUi[]>([])
const isSyncingDependencyRules = ref(false)

watch(
  () => depends.value,
  value => {
    if (isSyncingDependencyRules.value) {
      return
    }

    const nextRules = getDependencyRulesFromModel(value)
    nextRules.forEach(rule => {
      rule.clauses.forEach(clause => {
        if (clause.onType === 'helpers' && !clause.field) {
          clause.field = defaultHelperField.value
        }

        syncClauseValueType(clause)
      })
    })
    dependencyRules.value = nextRules
  },
  { immediate: true, deep: true }
)

watch(
  dependencyRules,
  value => {
    isSyncingDependencyRules.value = true
    depends.value = getDependencyModelFromRules(value)
    nextTick(() => {
      isSyncingDependencyRules.value = false
    })
  },
  { deep: true }
)

/**
 *
 */
const addDependencyRule = () => {
  const rule = createDependencyRuleUi()
  rule.clauses.forEach(clause => {
    clause.field = defaultHelperField.value
  })
  dependencyRules.value.push(rule)
}

const removeDependencyRule = (ruleId: string) => {
  dependencyRules.value = dependencyRules.value.filter(rule => rule.id !== ruleId)
}

/**
 *
 * @param ruleId
 */
const addDependencyClause = (ruleId: string) => {
  let ruleIndex = -1
  for (let index = 0; index < dependencyRules.value.length; index++) {
    const candidate = dependencyRules.value[index]!
    if (candidate.id === ruleId) {
      ruleIndex = index
      break
    }
  }
  const rule: DependencyRuleUi | undefined = dependencyRules.value[ruleIndex]
  if (!rule) {
    return
  }

  const clause = createDependencyClauseUi()
  clause.field = defaultHelperField.value
  rule.clauses.push(clause)
}

/**
 *
 * @param ruleId
 * @param clauseId
 */
const removeDependencyClause = (ruleId: string, clauseId: string) => {
  const rule = dependencyRules.value.find(current => current.id === ruleId)
  if (!rule) {
    return
  }

  rule.clauses = rule.clauses.filter(clause => clause.id !== clauseId)
  if (rule.clauses.length === 0) {
    removeDependencyRule(ruleId)
  }
}

const syncClauseValueType = (clause: DependencyRuleUi['clauses'][number]) => {
  if (clause.onType !== 'helpers') {
    return
  }

  const helperDefinition = helperDefinitions.value.find(definition => definition.field === clause.field)
  if (!helperDefinition) {
    return
  }

  clause.valueType = getAssessmentHelperComparableValueType(helperDefinition)
}

const updateClauseOnType = (clause: DependencyRuleUi['clauses'][number], value: string | number) => {
  clause.onType = value === 'answers' ? 'answers' : 'helpers'
  if (clause.onType === 'helpers') {
    clause.field = clause.field || defaultHelperField.value
  }
  syncClauseValueType(clause)
}

const updateClauseField = (clause: DependencyRuleUi['clauses'][number], value: string) => {
  clause.field = value
  syncClauseValueType(clause)
}

const getDependencyValueTypeItems = (rule: DependencyRuleUi, clauseId: string) => {
  const clause = rule.clauses.find(item => item.id === clauseId)
  if (!clause || clause.onType !== 'helpers') {
    return dependencyValueTypeItems.value
  }

  const helperDefinition = helperDefinitions.value.find(definition => definition.field === clause.field)
  if (!helperDefinition) {
    return dependencyValueTypeItems.value
  }

  const valueType = getAssessmentHelperComparableValueType(helperDefinition)
  return dependencyValueTypeItems.value.filter(item => item.value === valueType)
}
</script>

<template>
  <div class="space-y-3 border-y border-zinc-200 py-3 dark:border-zinc-700">
    <div class="flex items-center justify-between">
      <p class="text-sm font-semibold">
        {{ t('transfer_payment.dependencies') }}
      </p>
      <UButton icon="i-lucide-plus" :label="t('transfer_payment.add_dependency')" size="sm" variant="outline" class="cursor-default" @click="addDependencyRule" />
    </div>

    <fieldset
      v-for="(rule, ruleIndex) in dependencyRules"
      :key="rule.id"
      class="space-y-3 border-y border-zinc-200/80 py-3 dark:border-zinc-700/80">
      <legend class="sr-only">
        {{ t('transfer_payment.dependency_rule') }} {{ ruleIndex + 1 }}
      </legend>
      <div class="flex items-center justify-between">
        <p class="text-sm font-semibold">
          {{ t('transfer_payment.dependency_rule') }} {{ ruleIndex + 1 }}
        </p>
        <UButton
          icon="i-lucide-trash"
          color="error"
          variant="ghost"
          class="cursor-default"
          :aria-label="t('transfer_payment.remove_dependency_rule_named', { rule: ruleIndex + 1 })"
          @click="removeDependencyRule(rule.id)" />
      </div>

      <UFormField :label="t('transfer_payment.dependency_mode')">
        <USelect v-model="rule.mode" :items="dependencyModeItems" value-key="value" label-key="label" />
      </UFormField>

      <fieldset
        v-for="(clause, clauseIndex) in rule.clauses"
        :key="clause.id"
        class="space-y-3 rounded border border-zinc-200/90 p-3 dark:border-zinc-700/90">
        <legend class="sr-only">
          {{ [`${t('transfer_payment.dependency_rule')} ${ruleIndex + 1}`, `${t('transfer_payment.condition')} ${clauseIndex + 1}`].join(', ') }}
        </legend>
        <div class="flex items-center justify-between">
          <p class="text-xs font-bold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
            {{ t('transfer_payment.condition') }} {{ clauseIndex + 1 }}
          </p>
          <UButton
            icon="i-lucide-trash"
            color="error"
            variant="ghost"
            size="xs"
            class="cursor-default"
            :aria-label="t('transfer_payment.remove_dependency_condition_named', {
              condition: clauseIndex + 1,
              rule: ruleIndex + 1
            })"
            @click="removeDependencyClause(rule.id, clause.id)" />
        </div>

        <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
          <UFormField :label="t('transfer_payment.dependency_type')">
            <USelect
              :model-value="clause.onType"
              :items="dependencyOnTypeItems"
              value-key="value"
              label-key="label"
              @update:model-value="value => updateClauseOnType(clause, value)" />
          </UFormField>
          <UFormField :label="t('transfer_payment.value_type')">
            <USelect v-model="clause.valueType" :items="getDependencyValueTypeItems(rule, clause.id)" value-key="value" label-key="label" />
          </UFormField>
        </div>

        <div v-if="clause.onType === 'helpers'" class="grid grid-cols-1 gap-3">
          <UFormField :label="t('transfer_payment.helper_field')">
            <AssessmentSchemaHelperFieldSelect
              :model-value="clause.field"
              @update:model-value="value => updateClauseField(clause, String(value ?? ''))" />
          </UFormField>
        </div>

        <div v-else class="grid grid-cols-1 gap-3">
          <UFormField :label="t('transfer_payment.assessment_item')">
            <AssessmentSchemaAnswerPathTreeSelect
              :model-value="createAnswersDependencyValue(clause)"
              :tree="answerPathTree"
              :label="t('transfer_payment.assessment_item')"
              :placeholder="t('transfer_payment.assessment_item')"
              @update:model-value="value => applyAnswersDependencyValue(clause, String(value ?? ''))" />
          </UFormField>
        </div>

        <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
          <UFormField v-if="clause.valueType === 'boolean'" :label="t('transfer_payment.boolean_value')">
            <USelect v-model="clause.booleanValue" :items="booleanValueItems" value-key="value" label-key="label" />
          </UFormField>
          <UFormField v-else-if="clause.valueType === 'number'" :label="t('transfer_payment.number_value')">
            <UInput v-model.number="clause.numberValue" type="number" />
          </UFormField>
          <UFormField v-else :label="t('transfer_payment.text_value')">
            <UInput v-model="clause.stringValue" />
          </UFormField>
        </div>
      </fieldset>

      <div v-if="rule.mode === 'group'" class="flex justify-end">
        <UButton icon="i-lucide-plus" :label="t('transfer_payment.add_condition')" size="sm" variant="outline" class="cursor-default" @click="addDependencyClause(rule.id)" />
      </div>
    </fieldset>
  </div>
</template>
