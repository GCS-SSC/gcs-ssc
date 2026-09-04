<!-- eslint-disable jsdoc/require-jsdoc, jsdoc/require-param-description, jsdoc/require-returns -->
<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { Ref } from 'vue'
import { toRaw } from 'vue'
import type { AssessmentImpactorRow } from '~/composables/useAssessmentSchemaEditorState'
import { createAssessmentImpactorRow } from '~/composables/useAssessmentSchemaEditorState'
import {
  type AssessmentAnswerPathTreeNode,
  formatAssessmentDependencyTarget,
  getAssessmentImpactorLabel
} from '~/utils/assessment-schema'

const impactors = defineModel<AssessmentImpactorRow[]>('impactors', {
  default: () => []
})

const {
  answerPathTree = []
} = defineProps<{
  answerPathTree?: AssessmentAnswerPathTreeNode[]
}>()

const { t } = useI18n()

const isEditorOpen: Ref<boolean> = ref(false)
const editorMode: Ref<'create' | 'edit'> = ref('create')
const editingIndex: Ref<number | null> = ref(null)
const draftImpactor: Ref<AssessmentImpactorRow | null> = ref(null)

type ImpactorTableRow = {
  id: string
  label: string
  weight: number
  target: string
  thresholdCount: number
}

const rows = computed<ImpactorTableRow[]>(() => impactors.value.map(impactor => ({
  id: impactor._key,
  label: getAssessmentImpactorLabel(impactor, t('transfer_payment.impactor')),
  weight: impactor.weight,
  target: formatAssessmentDependencyTarget(impactor.on),
  thresholdCount: impactor.scoringMatrix.length
})))

const columns = computed<TableColumn<ImpactorTableRow>[]>(() => [
  { accessorKey: 'label', header: t('common.name') },
  { accessorKey: 'weight', header: t('common.weight') },
  { accessorKey: 'target', header: t('transfer_payment.dependency_type') },
  { accessorKey: 'thresholdCount', header: t('transfer_payment.thresholds') },
  { id: 'actions', header: t('common.actions') }
])

const resetEditor = () => {
  isEditorOpen.value = false
  editorMode.value = 'create'
  editingIndex.value = null
  draftImpactor.value = null
}

const openCreateEditor = () => {
  editorMode.value = 'create'
  editingIndex.value = null
  draftImpactor.value = structuredClone(createAssessmentImpactorRow())
  isEditorOpen.value = true
}

const openEditEditor = (index: number) => {
  const currentImpactor = impactors.value[index]
  if (!currentImpactor) {
    return
  }

  editorMode.value = 'edit'
  editingIndex.value = index
  draftImpactor.value = structuredClone(toRaw(currentImpactor))
  isEditorOpen.value = true
}

const saveDraft = () => {
  if (!draftImpactor.value) {
    return
  }

  if (editorMode.value === 'edit' && editingIndex.value !== null) {
    impactors.value.splice(editingIndex.value, 1, draftImpactor.value)
  } else {
    impactors.value.push(draftImpactor.value)
  }

  resetEditor()
}

const removeImpactor = (index: number) => {
  impactors.value.splice(index, 1)
}

defineExpose({
  openCreateEditor
})
</script>

<template>
  <div class="space-y-4">
    <CommonCompactTable :data="rows" :columns="columns">
      <template #actions-cell="{ row }">
        <div class="flex items-center gap-1">
          <UButton icon="i-lucide-pencil" color="neutral" variant="ghost" size="sm" class="cursor-default" :aria-label="t('common.edit')" @click="openEditEditor(row.index)" />
          <UButton icon="i-lucide-trash" color="error" variant="ghost" size="sm" class="cursor-default" :aria-label="t('common.delete')" @click="removeImpactor(row.index)" />
        </div>
      </template>
    </CommonCompactTable>

    <AssessmentSchemaImpactorEditor
      v-if="draftImpactor"
      v-model:open="isEditorOpen"
      v-model:impactor="draftImpactor"
      :answer-path-tree="answerPathTree"
      :mode="editorMode"
      @save="saveDraft"
      @cancel="resetEditor" />
  </div>
</template>
