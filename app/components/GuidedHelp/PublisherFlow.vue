<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- Modal editing mirrors the app's review-question editor. */
import GuidedHelpPublisherBranches from './PublisherBranches.vue'
import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { flowBranchLayout } from '@gcs-ssc/diagrams'
import type { FlowDiagramDefinition } from '@gcs-ssc/diagrams'
import { GuideDraftSchema } from '@gcs-ssc/guided-help/contracts'
import type { GuideDraft, GuideStep } from '@gcs-ssc/guided-help/contracts'
import { guidedHelpLedger } from '~~/shared/guided-help/catalog'

const document = defineModel<GuideDraft>({ required: true })
const selectedStep = defineModel<string>('selectedStep', { default: '' })
const { disabled = false } = defineProps<{ disabled?: boolean }>()
const emit = defineEmits<{ pick: [target: { stepId: string, view: string, target: string }] }>()
const { t, locale } = useI18n()
const { createValidator } = useZodI18n()
const validate = createValidator(GuideDraftSchema)
const open = ref(false)
const draft: Ref<GuideDraft | null> = ref(null)
const creating = ref(false)
const label = (value: { en: string, fr: string }) => value[locale.value === 'fr' ? 'fr' : 'en']
const afterStep = ref<string | undefined>()
const viewName = (key: string) => label(guidedHelpLedger.views.find(view => view.key === key)?.label ?? { en: key, fr: key })
const branchable = computed(() => document.value.steps.filter(step => guidedHelpLedger.views.find(view => view.key === step.view)?.targets.some(target => target.kind === 'checkbox' || (target.kind === 'select' && target.choices?.length))).map(step => step.id))
const flow = computed<FlowDiagramDefinition>(() => {
  const definition: FlowDiagramDefinition = { title: t('guided_help.flow'), nodes: [
    ...document.value.steps.map((step, index, steps) => ({ id: step.id, kind: 'step' as const, title: label(step.title) || t('guided_help.untitled_step'), eyebrow: t('guided_help.step_number', { number: index + 1 }), lines: [viewName(step.view)], selectLabel: disabled ? t('guided_help.inspect_step', { name: label(step.title) || t('guided_help.untitled_step') }) : t('guided_help.edit_step') + ': ' + (label(step.title) || t('guided_help.untitled_step')), routes: step.flow ? [...step.flow.branches.map(branch => ({ targetId: branch.next ?? '__end', kind: 'conditional' as const, label: branchLabel(branch) })), { targetId: step.flow.next ?? '__end', kind: step.flow.branches.length ? 'default' as const : 'direct' as const, label: step.flow.branches.length ? t('guided_help.otherwise') : undefined }] : [{ targetId: steps[index + 1]?.id ?? '__end', kind: 'direct' as const }] })),
    ...(document.value.steps.length ? [{ id: '__end', kind: 'end' as const, title: t('guided_help.end_guide') }] : [])
  ] }
  const positions = flowBranchLayout(definition).nodes
  return { ...definition, nodes: definition.nodes.map(node => node.kind === 'step' ? { ...node, eyebrow: t('guided_help.step_number', { number: positions[node.id]!.row + 1 }) } : node) }
})
const branchStep = ref('')
const branchOpen = ref(false)
const branchLabel = (branch: { target: string, equals: string | boolean }) => {
  const target = guidedHelpLedger.views.flatMap(view => view.targets).find(target => target.key === branch.target)
  const value = typeof branch.equals === 'boolean' ? t(branch.equals ? 'common.yes' : 'common.no') : label(target?.choices?.find(choice => choice.value === branch.equals)?.label ?? { en: String(branch.equals), fr: String(branch.equals) })
  return (target ? label(target.label) : branch.target) + ' = ' + value
}
const addBranch = (id: string) => {
  branchStep.value = id
  branchOpen.value = true
}
const reset = () => {
  open.value = false
  draft.value = null
  selectedStep.value = ''
  creating.value = false
  removeErrorKey.value = ''
}
const edit = (id: string) => {
  if (!document.value.steps.some(step => step.id === id)) return
  draft.value = JSON.parse(JSON.stringify(document.value))
  selectedStep.value = id
  open.value = true
}
watch(selectedStep, id => {
  if (id && !open.value) edit(id)
})
if (selectedStep.value) edit(selectedStep.value)
const create = (id?: string) => {
  afterStep.value = id
  const view = guidedHelpLedger.views[0]
  const target = view?.targets[0]
  const step: GuideStep = { id: crypto.randomUUID(), view: view?.key ?? '', target: target?.key ?? '', kind: target?.kind ?? 'section', title: { en: '', fr: '' }, instructions: { en: '', fr: '' } }
  draft.value = { ...JSON.parse(JSON.stringify(document.value)), steps: JSON.parse(JSON.stringify(insert(step))) }
  open.value = true
  selectedStep.value = step.id
  creating.value = true
}
const commit = () => {
  const edited = draft.value?.steps.find(step => step.id === selectedStep.value)
  if (!edited || disabled) return
  document.value = { ...document.value, steps: JSON.parse(JSON.stringify(draft.value!.steps)) }
  reset()
}
const pick = (target: { stepId: string, view: string, target: string }) => {
  const edited = draft.value?.steps.find(step => step.id === target.stepId)
  if (!edited || disabled) return
  // Selecting on screen is a local working-copy handoff, never a server publication.
  document.value = { ...document.value, steps: JSON.parse(JSON.stringify(draft.value!.steps)) }
  reset()
  emit('pick', target)
}
const insert = (step: GuideStep) => {
  const steps = [...document.value.steps]
  const index = afterStep.value ? steps.findIndex(item => item.id === afterStep.value) + 1 : 0
  const previous = steps[index - 1]
  if (previous?.flow) {
    steps[index - 1] = { ...previous, flow: { ...previous.flow, next: step.id } }
    steps.splice(index, 0, { ...step, flow: { next: previous.flow.next, branches: [] } })
  } else steps.splice(index, 0, step)
  return steps
}
const stepPosition = computed(() => draft.value?.steps.findIndex(step => step.id === selectedStep.value) ?? -1)
const move = (offset: number) => {
  if (disabled || !draft.value) return
  const index = stepPosition.value
  const destination = index + offset
  if (index < 0 || destination < 0 || destination >= draft.value.steps.length) return
  const steps = [...draft.value.steps]
  const [step] = steps.splice(index, 1)
  steps.splice(destination, 0, step!)
  const positions = new Map(steps.map((step, index) => [step.id, index]))
  if (steps.some((step, index) => step.flow && [step.flow.next, ...step.flow.branches.map(branch => branch.next)].some(target => target !== null && (positions.get(target) ?? -1) <= index))) {
    removeErrorKey.value = 'guided_help.move_breaks_branch'
    return
  }
  draft.value = { ...draft.value, steps }
  removeErrorKey.value = ''
}
const removeErrorKey = ref('')
const removeError = computed(() => removeErrorKey.value ? t(removeErrorKey.value) : '')
const remove = () => {
  if (disabled) return
  const id = selectedStep.value
  if (document.value.steps.some(step => step.id !== id && step.flow && (step.flow.next === id || step.flow.branches.some(branch => branch.next === id)))) {
    removeErrorKey.value = 'guided_help.step_referenced'
    return
  }
  document.value = { ...document.value, steps: document.value.steps.filter(step => step.id !== id) }
  reset()
}
</script>

<template>
  <div class="space-y-4">
    <p class="text-sm text-muted">
      {{ t(disabled ? 'guided_help.flow_readonly_hint' : 'guided_help.flow_edit_hint') }}
    </p>
    <CommonFlowDiagram :definition="flow" :selected-node-id="selectedStep" :editable="!disabled" :branch-node-ids="branchable" direction="vertical" layout="branches" filename="guided-help" @select-node="edit" @add-node="create" @add-branch="addBranch" />
    <GuidedHelpPublisherBranches v-model="document" v-model:open="branchOpen" :step-id="branchStep" :disabled="disabled" />
    <UModal v-model:open="open" :title="t(creating ? 'guided_help.create_step' : disabled ? 'guided_help.step_details' : 'guided_help.edit_step')" :description="t('guided_help.publication_required')" fullscreen :ui="{ content: 'rounded-none shadow-none ring-0' }" @after:leave="reset">
      <template #body>
        <UForm v-if="draft" :state="draft" :validate="validate" class="flex h-full flex-col" @submit="commit">
          <div class="flex-1 overflow-y-auto p-6 lg:p-8">
            <div class="mx-auto w-full max-w-6xl space-y-8 pb-12">
              <div v-if="!disabled && !creating" class="flex flex-wrap items-center gap-3">
                <UButton :label="t('guided_help.move_up')" icon="i-lucide-arrow-up" color="neutral" variant="outline" :disabled="stepPosition <= 0" @click="move(-1)" />
                <UButton :label="t('guided_help.move_down')" icon="i-lucide-arrow-down" color="neutral" variant="outline" :disabled="stepPosition >= (draft?.steps.length ?? 0) - 1" @click="move(1)" />
              </div>
              <GuidedHelpPublisherFields v-model="draft" v-model:selected-step="selectedStep" section="steps" :disabled="disabled" @pick="pick" />
            </div>
          </div>
          <div class="border-default flex flex-wrap items-center justify-end gap-3 border-t bg-white px-6 py-4 dark:bg-zinc-950 lg:px-8">
            <span v-if="removeError" role="alert" class="w-full text-error">{{ removeError }}</span>
            <UButton v-if="!disabled && !creating" :label="t('common.delete')" icon="i-lucide-trash" color="error" variant="ghost" class="mr-auto" @click="remove" />
            <UButton :label="t(disabled ? 'common.close' : 'common.cancel')" color="neutral" variant="ghost" @click="reset" />
            <CommonSaveButton v-if="!disabled" type="submit" :label="t('common.save')" />
          </div>
        </UForm>
      </template>
    </UModal>
  </div>
</template>
