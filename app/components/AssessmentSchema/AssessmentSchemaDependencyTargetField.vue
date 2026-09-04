<!-- eslint-disable jsdoc/require-jsdoc, jsdoc/require-param -->
<script setup lang="ts">
import { computed, watch } from 'vue'
import { useAssessmentSchemaHelperDefinitions } from '~/composables/useAssessmentSchemaHelpers'
import type { DependencyTarget } from '~/components/AssessmentSchema/assessment-schema-dependency'
import {
  createDependencyTargetAnswerPathValue,
  parseDependencyTargetAnswerPathValue
} from '~/components/AssessmentSchema/assessment-schema-dependency'
import type { AssessmentAnswerPathTreeNode } from '~/utils/assessment-schema'

const modelValue = defineModel<DependencyTarget>('modelValue', {
  default: () => ({
    type: 'helpers',
    field: ''
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

const dependencyOnTypeItems = computed(() => [
  { label: t('transfer_payment.helpers_dependency'), value: 'helpers' as const },
  { label: t('transfer_payment.answers_dependency'), value: 'answers' as const }
])

/** Returns the serialized tree path for an answers dependency target. */
const answerPathValue = computed(() => createDependencyTargetAnswerPathValue(modelValue.value))

/** Updates the answers dependency target from a serialized tree value. */
const updateAnswerPath = (value: string) => {
  modelValue.value = parseDependencyTargetAnswerPathValue(value)
}

/** Switches dependency target modes and resets irrelevant fields. */
const updateType = (value: string | number) => {
  if (value === 'answers') {
    modelValue.value = {
      type: 'answers',
      section: '',
      subsection: '',
      question: ''
    }
    return
  }

  modelValue.value = {
    type: 'helpers',
    field: defaultHelperField.value
  }
}

watch(
  helperDefinitions,
  () => {
    if (modelValue.value.type !== 'helpers' || modelValue.value.field) {
      return
    }

    modelValue.value = {
      type: 'helpers',
      field: defaultHelperField.value
    }
  },
  { immediate: true }
)
</script>

<template>
  <div class="space-y-4">
    <UFormField :label="t('transfer_payment.dependency_type')" name="dependency.type">
      <USelect
        :model-value="modelValue.type"
        :items="dependencyOnTypeItems"
        value-key="value"
        label-key="label"
        @update:model-value="value => updateType(value)" />
    </UFormField>

    <UFormField v-if="modelValue.type === 'helpers'" :label="t('transfer_payment.helper_field')" name="dependency.field">
      <AssessmentSchemaHelperFieldSelect v-model="modelValue.field" />
    </UFormField>

    <UFormField v-else :label="t('transfer_payment.assessment_item')" name="dependency.question">
      <AssessmentSchemaAnswerPathTreeSelect
        :model-value="answerPathValue"
        :tree="answerPathTree"
        :label="t('transfer_payment.assessment_item')"
        :placeholder="t('transfer_payment.assessment_item')"
        @update:model-value="value => updateAnswerPath(String(value ?? ''))" />
    </UFormField>
  </div>
</template>
