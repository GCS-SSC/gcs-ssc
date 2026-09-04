<!-- eslint-disable jsdoc/require-jsdoc -->
<script setup lang="ts">
import { computed } from 'vue'
import { useAssessmentSchemaHelperDefinitions } from '~/composables/useAssessmentSchemaHelpers'
import type { DependencyClauseUi, DependencyRuleUi } from '~/components/AssessmentSchema/assessment-schema-dependency'
import { applyAnswersDependencyValue, createDependencyClauseUi, createAnswersDependencyValue } from '~/components/AssessmentSchema/assessment-schema-dependency'
import type { AssessmentAnswerPathTreeNode } from '~/utils/assessment-schema'
import { getAssessmentHelperComparableValueType } from '~~/shared/utils/assessment-helpers'

const rule = defineModel<DependencyRuleUi>('rule', {
  default: () => ({
    id: 'draft',
    mode: 'single',
    clauses: [createDependencyClauseUi()]
  })
})

const {
  answerPathTree = []
} = defineProps<{
  answerPathTree?: AssessmentAnswerPathTreeNode[]
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

const addClause = () => {
  const clause = createDependencyClauseUi()
  clause.field = defaultHelperField.value
  rule.value.clauses.push(clause)
}

const removeClause = (clauseId: string) => {
  rule.value.clauses = rule.value.clauses.filter(clause => clause.id !== clauseId)
}

const updateAnswersPath = (clause: DependencyClauseUi, value: string) => {
  applyAnswersDependencyValue(clause, value)
}

const updateClauseOnType = (clause: DependencyClauseUi, value: string | number) => {
  clause.onType = value === 'answers' ? 'answers' : 'helpers'
  if (clause.onType === 'helpers') {
    clause.field = clause.field || defaultHelperField.value
  }
  syncClauseValueType(clause)
}

const updateClauseField = (clause: DependencyClauseUi, value: string) => {
  clause.field = value
  syncClauseValueType(clause)
}

const getHelperDefinitionForClause = (clause: DependencyClauseUi) =>
  helperDefinitions.value.find(definition => definition.field === clause.field)

const syncClauseValueType = (clause: DependencyClauseUi) => {
  if (clause.onType !== 'helpers') {
    return
  }

  const helperDefinition = getHelperDefinitionForClause(clause)
  if (!helperDefinition) {
    return
  }

  clause.valueType = getAssessmentHelperComparableValueType(helperDefinition)
}

const getDependencyValueTypeItems = (clause: DependencyClauseUi) => {
  if (clause.onType !== 'helpers') {
    return dependencyValueTypeItems.value
  }

  const helperDefinition = getHelperDefinitionForClause(clause)
  if (!helperDefinition) {
    return dependencyValueTypeItems.value
  }

  const valueType = getAssessmentHelperComparableValueType(helperDefinition)
  return dependencyValueTypeItems.value.filter(item => item.value === valueType)
}

watch(
  helperDefinitions,
  definitions => {
    const firstField = definitions[0]?.field ?? ''
    rule.value.clauses.forEach(clause => {
      if (clause.onType === 'helpers' && !clause.field) {
        clause.field = firstField
      }

      syncClauseValueType(clause)
    })
  },
  { immediate: true }
)
</script>

<template>
  <div class="space-y-4">
    <UFormField :label="t('transfer_payment.dependency_mode')">
      <USelect v-model="rule.mode" :items="dependencyModeItems" value-key="value" label-key="label" />
    </UFormField>

    <div
      v-for="(clause, clauseIndex) in rule.clauses"
      :key="clause.id"
      class="border-default space-y-4 border-t pt-4 first:border-t-0 first:pt-0">
      <div class="flex items-center justify-between gap-3">
        <p class="text-xs font-black tracking-[0.18em] text-zinc-500 uppercase dark:text-zinc-400">
          {{ t('transfer_payment.condition') }} {{ clauseIndex + 1 }}
        </p>

        <UButton
          v-if="rule.clauses.length > 1"
          icon="i-lucide-trash"
          color="error"
          variant="ghost"
          size="sm"
          class="cursor-default"
          :aria-label="t('transfer_payment.remove_condition_named', { position: clauseIndex + 1 })"
          @click="removeClause(clause.id)" />
      </div>

      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <UFormField :label="t('transfer_payment.dependency_type')">
          <USelect
            :model-value="clause.onType"
            :items="dependencyOnTypeItems"
            value-key="value"
            label-key="label"
            @update:model-value="value => updateClauseOnType(clause, value)" />
        </UFormField>

        <UFormField :label="t('transfer_payment.value_type')">
          <USelect v-model="clause.valueType" :items="getDependencyValueTypeItems(clause)" value-key="value" label-key="label" />
        </UFormField>
      </div>

      <UFormField v-if="clause.onType === 'helpers'" :label="t('transfer_payment.helper_field')">
        <AssessmentSchemaHelperFieldSelect
          :model-value="clause.field"
          @update:model-value="value => updateClauseField(clause, String(value ?? ''))" />
      </UFormField>

      <UFormField v-else :label="t('transfer_payment.assessment_item')">
        <AssessmentSchemaAnswerPathTreeSelect
          :model-value="createAnswersDependencyValue(clause)"
          :tree="answerPathTree"
          :label="t('transfer_payment.assessment_item')"
          :placeholder="t('transfer_payment.assessment_item')"
          @update:model-value="value => updateAnswersPath(clause, typeof value === 'string' ? value : '')" />
      </UFormField>

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

    <div v-if="rule.mode === 'group'" class="flex justify-end">
      <UButton
        icon="i-lucide-plus"
        :label="t('transfer_payment.add_condition')"
        variant="outline"
        class="cursor-default"
        @click="addClause" />
    </div>
  </div>
</template>
