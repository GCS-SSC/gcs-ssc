<!-- eslint-disable jsdoc/require-jsdoc -->
<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { Ref } from 'vue'
import { toRaw } from 'vue'
import type { DependencyRuleUi, DependencySummaryRow } from '~/components/AssessmentSchema/assessment-schema-dependency'
import { buildDependencySummaryRows, createDependencyRuleUi, getDependencyModelFromRules, getDependencyRulesFromModel } from '~/components/AssessmentSchema/assessment-schema-dependency'
import type { AssessmentAnswerPathTreeNode } from '~/utils/assessment-schema'
import { formatAssessmentDependencyTarget } from '~/utils/assessment-schema'

const depends = defineModel<unknown | undefined>({ required: true })

const {
  answerPathTree = []
} = defineProps<{
  answerPathTree?: AssessmentAnswerPathTreeNode[]
}>()

const { t } = useI18n()

const isModalOpen: Ref<boolean> = ref(false)
const editorMode: Ref<'create' | 'edit'> = ref('create')
const editingIndex: Ref<number | null> = ref(null)
const draftRule: Ref<DependencyRuleUi | null> = ref(null)

const dependencyRules = computed<DependencyRuleUi[]>({
  get: () => getDependencyRulesFromModel(depends.value),
  set: value => {
    depends.value = getDependencyModelFromRules(value)
  }
})

const rows = computed<DependencySummaryRow[]>(() => buildDependencySummaryRows(dependencyRules.value, {
  trueLabel: t('common.true'),
  falseLabel: t('common.false'),
  groupConditionsLabel: t('transfer_payment.group_conditions'),
  singleConditionLabel: t('transfer_payment.single_condition')
}, formatAssessmentDependencyTarget))

const columns = computed<TableColumn<DependencySummaryRow>[]>(() => [
  { accessorKey: 'mode', header: t('transfer_payment.dependency_mode') },
  { accessorKey: 'target', header: t('transfer_payment.dependency_type') },
  { accessorKey: 'value', header: t('common.value') },
  { accessorKey: 'conditionCount', header: t('transfer_payment.condition') },
  { id: 'actions', header: t('common.actions') }
])

const closeModal = () => {
  isModalOpen.value = false
  editorMode.value = 'create'
  editingIndex.value = null
  draftRule.value = null
}

const openCreate = () => {
  editorMode.value = 'create'
  editingIndex.value = null
  draftRule.value = structuredClone(createDependencyRuleUi())
  isModalOpen.value = true
}

const openEdit = (index: number) => {
  const current = dependencyRules.value[index]
  if (!current) {
    return
  }

  editorMode.value = 'edit'
  editingIndex.value = index
  draftRule.value = structuredClone(toRaw(current))
  isModalOpen.value = true
}

const saveRule = () => {
  if (!draftRule.value) {
    return
  }

  const nextRules = dependencyRules.value.slice()
  if (editorMode.value === 'edit' && editingIndex.value !== null) {
    nextRules.splice(editingIndex.value, 1, structuredClone(toRaw(draftRule.value)))
  } else {
    nextRules.push(structuredClone(toRaw(draftRule.value)))
  }

  dependencyRules.value = nextRules
  closeModal()
}

const removeRule = (index: number) => {
  const nextRules = dependencyRules.value.slice()
  nextRules.splice(index, 1)
  dependencyRules.value = nextRules
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex justify-end">
      <UButton
        icon="i-lucide-plus"
        :label="t('transfer_payment.add_dependency')"
        variant="outline"
        class="cursor-default"
        @click="openCreate" />
    </div>

    <CommonCompactTable :data="rows" :columns="columns" :ui="{ td: 'align-top', th: 'whitespace-nowrap' }">
      <template #conditionCount-cell="{ row }">
        {{ row.original.conditionCount }}
      </template>

      <template #actions-cell="{ row }">
        <div class="flex items-center gap-1">
          <UButton
            icon="i-lucide-pencil"
            color="neutral"
            variant="ghost"
            size="sm"
            class="cursor-default"
            :aria-label="`${t('common.edit')}: ${row.original.target} (${row.original.mode})`"
            @click="openEdit(row.index)" />
          <UButton
            icon="i-lucide-trash"
            color="error"
            variant="ghost"
            size="sm"
            class="cursor-default"
            :aria-label="`${t('common.delete')}: ${row.original.target} (${row.original.mode})`"
            @click="removeRule(row.index)" />
        </div>
      </template>
    </CommonCompactTable>

    <UModal
      v-model:open="isModalOpen"
      :title="editorMode === 'create' ? t('transfer_payment.add_dependency') : t('common.edit')"
      :description="t('transfer_payment.dependency_assignment')"
      :ui="{ content: 'sm:max-w-4xl' }">
      <template #body>
        <div v-if="draftRule" class="space-y-5">
          <AssessmentSchemaDependencyRuleForm v-model:rule="draftRule" :answer-path-tree="answerPathTree" />

          <div class="flex justify-end gap-2">
            <UButton :label="t('common.cancel')" color="neutral" variant="ghost" class="cursor-default" @click="closeModal" />
            <UButton :label="t('common.save')" class="cursor-default" @click="saveRule" />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
