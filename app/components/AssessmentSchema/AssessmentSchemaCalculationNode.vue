<!-- eslint-disable jsdoc/require-jsdoc -->
<script setup lang="ts">
import { nanoid } from 'nanoid'
import type {
  AssessmentCalculationExpression,
  AssessmentCalculationOperator
} from '~~/shared/types/schemas/assessment/calculation'
import {
  ASSESSMENT_CALCULATION_OPERATOR_CONFIG,
  ASSESSMENT_CALCULATION_OPERATORS
} from '~~/shared/types/schemas/assessment/calculation'
import type { AssessmentAnswerPathTreeNode } from '~/utils/assessment-schema'
import { createDefaultAssessmentCalculationExpression } from '~/utils/assessment-calculation-node'
import { useAssessmentSchemaHelperDefinitions } from '~/composables/useAssessmentSchemaHelpers'
import {
  createDependencyTargetAnswerPathValue,
  parseDependencyTargetAnswerPathValue
} from './assessment-schema-dependency'

defineOptions({
  name: 'AssessmentSchemaCalculationNode'
})

const expression = defineModel<AssessmentCalculationExpression>({
  required: true,
  default: () => ({
    kind: 'operation',
    operator: 'sum',
    args: [{ kind: 'number', value: 0 }]
  })
})

const {
  answerPathTree,
  depth = 0,
  nodePath = ''
} = defineProps<{
  answerPathTree: AssessmentAnswerPathTreeNode[]
  depth?: number
  nodePath?: string
}>()

const { t } = useI18n()
const helperDefinitions = useAssessmentSchemaHelperDefinitions()

const expressionTypeItems = computed(() => {
  if (depth === 0) {
    return [{ label: t('transfer_payment.calculation_expression_operation'), value: 'operation' as const }]
  }

  return [
    { label: t('transfer_payment.calculation_expression_number'), value: 'number' as const },
    { label: t('transfer_payment.calculation_expression_boolean'), value: 'boolean' as const },
    { label: t('transfer_payment.calculation_expression_answer'), value: 'answer' as const },
    { label: t('transfer_payment.calculation_expression_helper'), value: 'helper' as const },
    { label: t('transfer_payment.calculation_expression_operation'), value: 'operation' as const }
  ]
})

const operatorItems = computed(() => ASSESSMENT_CALCULATION_OPERATORS.map(operator => ({
  label: t(ASSESSMENT_CALCULATION_OPERATOR_CONFIG[operator].labelKey),
  value: operator
})))

const booleanItems = computed(() => [
  { label: t('common.true'), value: true },
  { label: t('common.false'), value: false }
])

const defaultHelperField = computed(() => helperDefinitions.value[0]?.field ?? '')
const currentKind = computed(() => expression.value.kind)
const currentOperation = computed<AssessmentCalculationOperator | null>(() => (
  expression.value.kind === 'operation' ? expression.value.operator : null
))
const operationConfig = computed(() => currentOperation.value
  ? ASSESSMENT_CALCULATION_OPERATOR_CONFIG[currentOperation.value]
  : null)

const createDefaultExpression = (kind: AssessmentCalculationExpression['kind']): AssessmentCalculationExpression =>
  createDefaultAssessmentCalculationExpression(kind, {
    depth,
    defaultHelperField: defaultHelperField.value
  })

const ensureOperationArgs = (operator: AssessmentCalculationOperator) => {
  if (expression.value.kind !== 'operation') {
    return
  }

  const config = ASSESSMENT_CALCULATION_OPERATOR_CONFIG[operator]
  const existingArgs = [...expression.value.args]

  while (existingArgs.length < config.minArgs) {
    existingArgs.push({ kind: 'number', value: 0 })
  }

  if (config.maxArgs !== null && existingArgs.length > config.maxArgs) {
    existingArgs.splice(config.maxArgs)
  }

  expression.value.args = existingArgs
}

const updateKind = (value: string | number) => {
  const nextKind = value === 'boolean'
    || value === 'answer'
    || value === 'helper'
    || value === 'operation'
    ? value
    : 'number'

  expression.value = createDefaultExpression(nextKind)
}

const updateOperator = (value: string | number) => {
  if (expression.value.kind !== 'operation') {
    return
  }

  const operator = typeof value === 'string' && value in ASSESSMENT_CALCULATION_OPERATOR_CONFIG
    ? value as AssessmentCalculationOperator
    : 'sum'

  expression.value.operator = operator
  ensureOperationArgs(operator)
}

const getAnswerReferenceValue = () => {
  if (expression.value.kind !== 'answer') {
    return ''
  }

  return createDependencyTargetAnswerPathValue({
    type: 'answers',
    section: expression.value.section,
    subsection: expression.value.subsection,
    question: expression.value.question
  })
}

const updateAnswerReference = (value: string | null | undefined) => {
  if (expression.value.kind !== 'answer') {
    return
  }

  const target = parseDependencyTargetAnswerPathValue(String(value ?? ''))
  if (target.type !== 'answers') {
    return
  }

  expression.value.section = target.section
  expression.value.subsection = target.subsection
  expression.value.question = target.question
}

const addOperationArgument = () => {
  if (expression.value.kind !== 'operation') {
    return
  }

  const config = ASSESSMENT_CALCULATION_OPERATOR_CONFIG[expression.value.operator]
  if (config.maxArgs !== null && expression.value.args.length >= config.maxArgs) {
    return
  }

  expression.value.args.push({ kind: 'number', value: 0 })
}

const removeOperationArgument = (index: number) => {
  if (expression.value.kind !== 'operation') {
    return
  }

  const config = ASSESSMENT_CALCULATION_OPERATOR_CONFIG[expression.value.operator]
  if (expression.value.args.length <= config.minArgs) {
    return
  }

  expression.value.args.splice(index, 1)
}

const canAddArgument = computed(() => {
  if (expression.value.kind !== 'operation') {
    return false
  }

  const maxArgs = ASSESSMENT_CALCULATION_OPERATOR_CONFIG[expression.value.operator].maxArgs
  return maxArgs === null || expression.value.args.length < maxArgs
})

const getArgumentPath = (argumentIndex: number) => [nodePath, String(argumentIndex + 1)].filter(Boolean).join('.')
const nodeLabel = computed(() => nodePath
  ? `${t('transfer_payment.calculation_argument')} ${nodePath}`
  : t('transfer_payment.calculation_expression_operation'))

const argumentKeysByExpression = new WeakMap<AssessmentCalculationExpression, string>()
const operationArgumentKeys = ref<string[]>([])

watchEffect(() => {
  if (expression.value.kind !== 'operation') {
    operationArgumentKeys.value = []
    return
  }

  operationArgumentKeys.value = expression.value.args.map((argument) => {
    const existingKey = argumentKeysByExpression.get(argument)
    if (existingKey) {
      return existingKey
    }

    const nextKey = nanoid()
    argumentKeysByExpression.set(argument, nextKey)
    return nextKey
  })
})
</script>

<template>
  <fieldset class="space-y-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
    <legend class="sr-only">
      {{ nodeLabel }}
    </legend>
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <UFormField :label="t('common.type')">
        <USelect
          :model-value="currentKind"
          :items="expressionTypeItems"
          value-key="value"
          label-key="label"
          @update:model-value="updateKind" />
      </UFormField>

      <UFormField v-if="expression.kind === 'operation'" :label="t('transfer_payment.calculation_operator')">
        <USelect
          :model-value="expression.operator"
          :items="operatorItems"
          value-key="value"
          label-key="label"
          @update:model-value="updateOperator" />
      </UFormField>
    </div>

    <UFormField v-if="expression.kind === 'number'" :label="t('common.value')">
      <UInput v-model.number="expression.value" type="number" />
    </UFormField>

    <UFormField v-else-if="expression.kind === 'boolean'" :label="t('common.value')">
      <USelect v-model="expression.value" :items="booleanItems" value-key="value" label-key="label" />
    </UFormField>

    <UFormField v-else-if="expression.kind === 'answer'" :label="t('transfer_payment.assessment_item')">
      <AssessmentSchemaAnswerPathTreeSelect
        :model-value="getAnswerReferenceValue()"
        :tree="answerPathTree"
        :label="t('transfer_payment.assessment_item')"
        :placeholder="t('transfer_payment.assessment_item')"
        @update:model-value="value => updateAnswerReference(String(value ?? ''))" />
    </UFormField>

    <UFormField v-else-if="expression.kind === 'helper'" :label="t('transfer_payment.helper_field')">
      <AssessmentSchemaHelperFieldSelect v-model="expression.field" />
    </UFormField>

    <div v-else class="space-y-4">
      <div class="flex items-center justify-between">
        <p class="text-sm font-semibold text-zinc-900 dark:text-white">
          {{ t('transfer_payment.calculation_arguments') }}
        </p>
        <UButton
          v-if="canAddArgument"
          icon="i-lucide-plus"
          :label="t('common.add')"
          variant="outline"
          size="sm"
          class="cursor-default"
          @click="addOperationArgument" />
      </div>

      <div
        v-for="(argument, argumentIndex) in expression.args"
        :key="operationArgumentKeys[argumentIndex]"
        class="space-y-3 rounded-lg border border-zinc-200/80 p-3 dark:border-zinc-700/80">
        <div class="flex items-center justify-between">
          <p class="text-xs font-bold tracking-[0.18em] text-zinc-500 uppercase dark:text-zinc-400">
            {{ t('transfer_payment.calculation_argument') }} {{ argumentIndex + 1 }}
          </p>
          <UButton
            v-if="(operationConfig?.minArgs ?? 0) < expression.args.length"
            icon="i-lucide-trash"
            color="error"
            variant="ghost"
            size="xs"
            class="cursor-default"
            :aria-label="t('transfer_payment.remove_calculation_argument_named', { path: getArgumentPath(argumentIndex) })"
            @click="removeOperationArgument(argumentIndex)" />
        </div>

        <AssessmentSchemaCalculationNode
          :model-value="argument"
          :answer-path-tree="answerPathTree"
          :depth="depth + 1"
          :node-path="getArgumentPath(argumentIndex)"
          @update:model-value="value => {
            if (expression.kind === 'operation') {
              expression.args[argumentIndex] = value
            }
          }" />
      </div>
    </div>
  </fieldset>
</template>
