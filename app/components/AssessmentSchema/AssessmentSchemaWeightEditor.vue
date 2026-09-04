<!-- eslint-disable jsdoc/require-jsdoc, jsdoc/require-param-description, jsdoc/require-returns -->
<script setup lang="ts">
import { nanoid } from 'nanoid'
import { useAssessmentSchemaHelperDefinitions } from '~/composables/useAssessmentSchemaHelpers'
import type { AssessmentAnswerPathTreeNode } from '~/utils/assessment-schema'

const weight = defineModel<unknown>({
  default: () => ({
    adjustable: false,
    weight: 0
  })
})

const {
  answerPathTree
} = defineProps<{
  answerPathTree: AssessmentAnswerPathTreeNode[]
}>()

type WeightMode = 'fixed' | 'adjustable' | 'array'
type DependencyType = 'helpers' | 'answers'
type AdjustableDependencyOn = {
  type: DependencyType
  field?: string
  section?: string
  subsection?: string
  question?: string
}
type AdjustableWeightRow = {
  id: string
  score: string
  value: number
}
type AdjustableWeight = {
  adjustable: true
  on: AdjustableDependencyOn
  weights: Record<string, number>
}
type FixedWeight = {
  adjustable: false
  weight: number
}
type AdjustableScenario = AdjustableWeight
type AdjustableWeightArray = [number, AdjustableScenario[]]

const { t } = useI18n()
const helperDefinitions = useAssessmentSchemaHelperDefinitions()
const defaultHelperField = computed(() => helperDefinitions.value[0]?.field ?? '')

const weightModeItems = computed(() => [
  { label: t('transfer_payment.fixed_weight'), value: 'fixed' as const },
  { label: t('transfer_payment.adjustable_weight'), value: 'adjustable' as const },
  { label: t('transfer_payment.adjustable_weight_array'), value: 'array' as const }
])

/**
 *
 */
const createAdjustableDependencyOn = (): AdjustableDependencyOn => ({
  type: 'helpers',
  field: defaultHelperField.value,
  section: '',
  subsection: '',
  question: ''
})

const createFixedWeight = (): FixedWeight => ({
  adjustable: false,
  weight: 0
})

/**
 *
 */
const createAdjustableWeight = (): AdjustableWeight => ({
  adjustable: true,
  on: createAdjustableDependencyOn(),
  weights: {}
})

/**
 *
 * @param on
 */
const getAnswersDependencyValue = (on: AdjustableDependencyOn) => {
  if (!on.section || !on.subsection || !on.question) {
    return ''
  }

  return `${on.section}|${on.subsection}|${on.question}`
}

/**
 *
 */
const getWeightMode = (): WeightMode => {
  if (Array.isArray(weight.value)) {
    return 'array'
  }

  const current = weight.value as Record<string, unknown> | undefined
  if (current?.adjustable === true) {
    return 'adjustable'
  }

  return 'fixed'
}

/**
 *
 * @param value
 */
const setWeightMode = (value: WeightMode) => {
  if (value === 'fixed') {
    weight.value = createFixedWeight()
    return
  }

  if (value === 'adjustable') {
    weight.value = createAdjustableWeight()
    return
  }

  weight.value = [0, [createAdjustableWeight()]]
}

const weightMode = computed<WeightMode>({
  get: () => getWeightMode(),
  set: value => setWeightMode(value)
})

/**
 *
 */
const getFixedWeight = (): FixedWeight => {
  if (weightMode.value !== 'fixed') {
    setWeightMode('fixed')
  }

  return weight.value as FixedWeight
}

/**
 *
 */
const getAdjustableWeight = (): AdjustableWeight => {
  if (weightMode.value !== 'adjustable') {
    setWeightMode('adjustable')
  }

  return weight.value as AdjustableWeight
}

/**
 *
 */
const getAdjustableArrayWeight = (): AdjustableWeightArray => {
  if (weightMode.value !== 'array') {
    setWeightMode('array')
  }

  return weight.value as AdjustableWeightArray
}

const getWeightRows = (weights: Record<string, number>) => Object.entries(weights)
  .map(([score, value]) => ({ id: nanoid(), score, value }))

/**
 *
 * @param target
 * @param rows
 */
const setWeightRows = (target: Record<string, number>, rows: AdjustableWeightRow[]) => {
  for (const key of Object.keys(target)) {
    Reflect.deleteProperty(target, key)
  }

  rows.forEach(row => {
    const score = row.score.trim()
    if (!score) {
      return
    }

    target[score] = Number(row.value)
  })
}

const adjustableWeightRows = ref<AdjustableWeightRow[]>([])

/**
 *
 */
const syncAdjustableWeightRowsFromModel = () => {
  if (weightMode.value !== 'adjustable') {
    adjustableWeightRows.value = []
    return
  }

  adjustableWeightRows.value = getWeightRows(getAdjustableWeight().weights)
}

watch(
  () => weight.value,
  () => {
    syncAdjustableWeightRowsFromModel()
  },
  { immediate: true, deep: true }
)

watch(
  adjustableWeightRows,
  rows => {
    if (weightMode.value !== 'adjustable') {
      return
    }

    setWeightRows(getAdjustableWeight().weights, rows)
  },
  { deep: true }
)

/**
 *
 */
const addAdjustableWeightRow = () => {
  adjustableWeightRows.value.push({
    id: nanoid(),
    score: '',
    value: 0
  })
}

const removeAdjustableWeightRow = (rowId: string) => {
  adjustableWeightRows.value = adjustableWeightRows.value.filter(row => row.id !== rowId)
}

const addAdjustableScenario = () => {
  getAdjustableArrayWeight()[1].push(createAdjustableWeight())
}

const removeAdjustableScenario = (index: number) => {
  getAdjustableArrayWeight()[1].splice(index, 1)
}

const arrayWeightRowsByScenario = new WeakMap<AdjustableScenario, AdjustableWeightRow[]>()

/**
 *
 * @param scenario
 */
const ensureScenarioRows = (scenario: AdjustableScenario) => {
  if (!arrayWeightRowsByScenario.has(scenario)) {
    arrayWeightRowsByScenario.set(scenario, getWeightRows(scenario.weights))
  }

  return arrayWeightRowsByScenario.get(scenario)!
}

/**
 *
 * @param scenario
 */
const addArrayWeightRow = (scenario: AdjustableScenario) => {
  const rows = ensureScenarioRows(scenario)
  rows.push({ id: nanoid(), score: '', value: 0 })
  setWeightRows(scenario.weights, rows)
}

/**
 *
 * @param scenario
 * @param rowId
 */
const removeArrayWeightRow = (scenario: AdjustableScenario, rowId: string) => {
  const rows = ensureScenarioRows(scenario).filter(row => row.id !== rowId)
  arrayWeightRowsByScenario.set(scenario, rows)
  setWeightRows(scenario.weights, rows)
}

const updateArrayWeightRows = (scenario: AdjustableScenario) => {
  setWeightRows(scenario.weights, ensureScenarioRows(scenario))
}

const updateCurrentAdjustableType = (value: string | number) => {
  getAdjustableWeight()
  const current = weight.value as AdjustableWeight
  current.on.type = value === 'answers' ? 'answers' : 'helpers'
  if (current.on.type === 'helpers' && !current.on.field) current.on.field = defaultHelperField.value
}

const updateCurrentAnswersDependencyValue = (value: string) => {
  getAdjustableWeight()
  const current = weight.value as AdjustableWeight
  const [section = '', subsection = '', question = ''] = value.split('|')
  current.on.section = section
  current.on.subsection = subsection
  current.on.question = question
}

const updateScenarioAdjustableType = (scenarioIndex: number, value: string | number) => {
  getAdjustableArrayWeight()
  const scenario = (weight.value as AdjustableWeightArray)[1][scenarioIndex]
  if (!scenario) return
  scenario.on.type = value === 'answers' ? 'answers' : 'helpers'
  if (scenario.on.type === 'helpers' && !scenario.on.field) scenario.on.field = defaultHelperField.value
}

const updateScenarioAnswersDependencyValue = (scenarioIndex: number, value: string) => {
  getAdjustableArrayWeight()
  const scenario = (weight.value as AdjustableWeightArray)[1][scenarioIndex]
  if (!scenario) return
  const [section = '', subsection = '', question = ''] = value.split('|')
  scenario.on.section = section
  scenario.on.subsection = subsection
  scenario.on.question = question
}

const syncAdjustableHelperTarget = (target: AdjustableDependencyOn) => {
  if (target.type !== 'helpers') {
    return
  }

  if (!target.field) {
    target.field = defaultHelperField.value
  }
}

watch(
  () => weight.value,
  value => {
    if (Array.isArray(value)) {
      value[1].forEach((scenario: AdjustableScenario) => {
        syncAdjustableHelperTarget(scenario.on)
      })
      return
    }

    if (typeof value !== 'object' || value === null) {
      return
    }

    const currentWeight = value as AdjustableWeight
    if (currentWeight.adjustable === true) {
      syncAdjustableHelperTarget(currentWeight.on)
    }
  },
  { immediate: true, deep: true }
)

watch(
  helperDefinitions,
  () => {
    const currentWeight = weight.value

    if (Array.isArray(currentWeight)) {
      currentWeight[1].forEach((scenario: AdjustableScenario) => {
        syncAdjustableHelperTarget(scenario.on)
      })
      return
    }

    if (typeof currentWeight !== 'object' || currentWeight === null) {
      return
    }

    const adjustableWeight = currentWeight as AdjustableWeight
    if (adjustableWeight.adjustable === true) {
      syncAdjustableHelperTarget(adjustableWeight.on)
    }
  },
  { immediate: true }
)
</script>

<template>
  <div class="space-y-4 border-y border-zinc-200 py-3 dark:border-zinc-700">
    <UFormField :label="t('transfer_payment.weight_shape')">
      <USelect v-model="weightMode" :items="weightModeItems" value-key="value" label-key="label" />
    </UFormField>

    <div v-if="weightMode === 'fixed'" class="grid grid-cols-1 gap-3 md:grid-cols-2">
      <UFormField :label="t('common.weight')">
        <UInput v-model.number="getFixedWeight().weight" type="number" />
      </UFormField>
    </div>

    <div v-else-if="weightMode === 'adjustable'" class="space-y-4">
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <UFormField :label="t('transfer_payment.dependency_type')">
          <USelect
            :model-value="getAdjustableWeight().on.type"
            :items="[
              { label: t('transfer_payment.helpers_dependency'), value: 'helpers' },
              { label: t('transfer_payment.answers_dependency'), value: 'answers' }
            ]"
            value-key="value"
            label-key="label"
            @update:model-value="updateCurrentAdjustableType" />
        </UFormField>

        <UFormField
          v-if="getAdjustableWeight().on.type === 'helpers'"
          :label="t('transfer_payment.helper_field')">
          <AssessmentSchemaHelperFieldSelect v-model="getAdjustableWeight().on.field" />
        </UFormField>
      </div>

      <div v-if="getAdjustableWeight().on.type === 'answers'" class="grid grid-cols-1 gap-3">
        <UFormField :label="t('transfer_payment.assessment_item')">
          <AssessmentSchemaAnswerPathTreeSelect
            :model-value="getAnswersDependencyValue(getAdjustableWeight().on)"
            :tree="answerPathTree"
            :label="t('transfer_payment.assessment_item')"
            :placeholder="t('transfer_payment.assessment_item')"
            @update:model-value="value => updateCurrentAnswersDependencyValue(String(value ?? ''))" />
        </UFormField>
      </div>

      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <p class="text-sm font-semibold">
            {{ t('transfer_payment.score_weights') }}
          </p>
          <UButton
            icon="i-lucide-plus" size="sm" variant="outline" class="cursor-default"
            :aria-label="t('transfer_payment.add_score_weight')" @click="addAdjustableWeightRow" />
        </div>

        <div
          v-for="(row, rowIndex) in adjustableWeightRows"
          :key="row.id"
          class="grid grid-cols-[1fr_1fr_auto] gap-2">
          <UInput v-model="row.score" :placeholder="t('transfer_payment.score_key')" />
          <UInput v-model.number="row.value" type="number" :placeholder="t('common.weight')" />
          <UButton
            icon="i-lucide-trash" color="error" variant="ghost" class="cursor-default"
            :aria-label="t('transfer_payment.delete_score_weight', { position: rowIndex + 1 })"
            @click="removeAdjustableWeightRow(row.id)" />
        </div>
      </div>
    </div>

    <div v-else class="space-y-4">
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <UFormField :label="t('transfer_payment.base_weight')">
          <UInput v-model.number="getAdjustableArrayWeight()[0]" type="number" />
        </UFormField>

        <div class="flex items-end justify-end">
          <UButton
            icon="i-lucide-plus" :label="t('common.add')" variant="outline" class="cursor-default"
            :aria-label="t('transfer_payment.add_adjustable_scenario')" @click="addAdjustableScenario" />
        </div>
      </div>

      <div
        v-for="(scenario, scenarioIndex) in getAdjustableArrayWeight()[1]"
        :key="scenarioIndex"
        class="space-y-3 border-y border-zinc-200 py-3 dark:border-zinc-700">
        <div class="flex items-center justify-between">
          <p class="text-sm font-semibold">
            {{ t('transfer_payment.adjustable_scenario') }} {{ scenarioIndex + 1 }}
          </p>
          <UButton
            icon="i-lucide-trash" color="error" variant="ghost" class="cursor-default"
            :aria-label="t('transfer_payment.delete_adjustable_scenario', { scenario: scenarioIndex + 1 })"
            @click="removeAdjustableScenario(scenarioIndex)" />
        </div>

        <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
          <UFormField :label="t('transfer_payment.dependency_type')">
            <USelect
              :model-value="scenario.on.type"
              :items="[
                { label: t('transfer_payment.helpers_dependency'), value: 'helpers' },
                { label: t('transfer_payment.answers_dependency'), value: 'answers' }
              ]"
              value-key="value"
              label-key="label"
              @update:model-value="value => updateScenarioAdjustableType(scenarioIndex, value)" />
          </UFormField>

          <UFormField v-if="scenario.on.type === 'helpers'" :label="t('transfer_payment.helper_field')">
            <AssessmentSchemaHelperFieldSelect v-model="scenario.on.field" />
          </UFormField>
        </div>

        <div v-if="scenario.on.type === 'answers'" class="grid grid-cols-1 gap-3">
          <UFormField :label="t('transfer_payment.assessment_item')">
            <AssessmentSchemaAnswerPathTreeSelect
              :model-value="getAnswersDependencyValue(scenario.on)"
              :tree="answerPathTree"
              :label="t('transfer_payment.assessment_item')"
              :placeholder="t('transfer_payment.assessment_item')"
              @update:model-value="value => updateScenarioAnswersDependencyValue(scenarioIndex, String(value ?? ''))" />
          </UFormField>
        </div>

        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <p class="text-sm font-semibold">
              {{ t('transfer_payment.score_weights') }}
            </p>
            <UButton
              icon="i-lucide-plus" size="sm" variant="outline" class="cursor-default"
              :aria-label="t('transfer_payment.add_scenario_score_weight', { scenario: scenarioIndex + 1 })"
              @click="addArrayWeightRow(scenario)" />
          </div>

          <div
            v-for="(row, rowIndex) in ensureScenarioRows(scenario)"
            :key="row.id"
            class="grid grid-cols-[1fr_1fr_auto] gap-2">
            <UInput v-model="row.score" :placeholder="t('transfer_payment.score_key')" @update:model-value="updateArrayWeightRows(scenario)" />
            <UInput v-model.number="row.value" type="number" :placeholder="t('common.weight')" @update:model-value="updateArrayWeightRows(scenario)" />
            <UButton
              icon="i-lucide-trash" color="error" variant="ghost" class="cursor-default"
              :aria-label="t('transfer_payment.delete_scenario_score_weight', { position: rowIndex + 1, scenario: scenarioIndex + 1 })"
              @click="removeArrayWeightRow(scenario, row.id)" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
