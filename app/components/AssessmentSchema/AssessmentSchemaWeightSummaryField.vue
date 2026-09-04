<!-- eslint-disable jsdoc/require-jsdoc, jsdoc/require-param-description, jsdoc/require-returns -->
<script setup lang="ts">
import { toRaw } from 'vue'
import type { AssessmentAnswerPathTreeNode } from '~/utils/assessment-schema'
import {
  getAssessmentFixedWeight,
  getAssessmentWeightMode
} from '~/utils/assessment-schema'

const weight = defineModel<unknown>({ required: true })

const {
  answerPathTree,
  namePrefix
} = defineProps<{
  answerPathTree: AssessmentAnswerPathTreeNode[]
  namePrefix: string
}>()

type WeightMode = 'fixed' | 'adjustable' | 'array'

type AdjustableDependencyOn = {
  type: 'helpers' | 'answers'
  field?: string
  section?: string
  subsection?: string
  question?: string
}

type AdjustableWeight = {
  adjustable: true
  on: AdjustableDependencyOn
  weights: Record<string, number>
}

const { t } = useI18n()

const isModalOpen = ref(false)
const draftWeight = ref<unknown>(undefined)

const weightModeItems = computed(() => [
  { label: t('transfer_payment.fixed_weight'), value: 'fixed' as const },
  { label: t('transfer_payment.adjustable_weight'), value: 'adjustable' as const },
  { label: t('transfer_payment.adjustable_weight_array'), value: 'array' as const }
])

const createFixedWeight = () => ({
  adjustable: false,
  weight: 0
})

const createAdjustableWeight = (): AdjustableWeight => ({
  adjustable: true,
  on: {
    type: 'helpers',
    field: '',
    section: '',
    subsection: '',
    question: ''
  },
  weights: {}
})

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
  get: () => getAssessmentWeightMode(weight.value),
  set: value => setWeightMode(value)
})

const fixedWeightValue = computed<number>({
  get: () => getAssessmentFixedWeight(weight.value) ?? 0,
  set: value => {
    if (weightMode.value !== 'fixed') {
      setWeightMode('fixed')
    }

    const current = weight.value as { adjustable: false, weight: number }
    current.weight = Number(value)
  }
})

const summaryLabel = computed(() => {
  if (weightMode.value === 'fixed') {
    return String(fixedWeightValue.value)
  }

  return t('common.edit')
})

const openModal = () => {
  draftWeight.value = structuredClone(toRaw(weight.value))
  isModalOpen.value = true
}

const saveModal = () => {
  weight.value = draftWeight.value
  isModalOpen.value = false
}
</script>

<template>
  <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
    <UFormField :label="t('transfer_payment.weight_shape')" :name="`${namePrefix}.weight.mode`">
      <USelect v-model="weightMode" :items="weightModeItems" value-key="value" label-key="label" />
    </UFormField>

    <UFormField :label="t('common.weight')" :name="`${namePrefix}.weight`">
      <UInput v-if="weightMode === 'fixed'" v-model.number="fixedWeightValue" type="number" />
      <UButton v-else :label="summaryLabel" color="neutral" variant="outline" class="w-full cursor-default justify-between" @click="openModal" />
    </UFormField>
  </div>

  <UModal
    v-model:open="isModalOpen"
    :title="t('common.weight')"
    :description="t('transfer_payment.weight_shape')"
    :ui="{ content: 'sm:max-w-5xl' }">
    <template #body>
      <div class="space-y-4">
        <AssessmentSchemaWeightEditor v-if="isModalOpen" v-model="draftWeight" :answer-path-tree="answerPathTree" />
        <div class="flex justify-end gap-2">
          <UButton :label="t('common.cancel')" color="neutral" variant="ghost" class="cursor-default" @click="isModalOpen = false" />
          <UButton :label="t('common.save')" class="cursor-default" @click="saveModal" />
        </div>
      </div>
    </template>
  </UModal>
</template>
