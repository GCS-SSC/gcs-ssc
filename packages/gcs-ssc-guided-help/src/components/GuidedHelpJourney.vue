<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import type { GuideDocument, TargetLedger } from '../contracts'
import { guideJourneyStepIds, reconcileGuideJourney } from '../journey'
import type { GuideJourneyCursor, GuideJourneySnapshot, GuideJourneyTask } from '../journey'
import type { GuideActionChannel, GuideActionSignal, GuideObservedContext, GuidePresentation, GuideTargetRef } from '../actions'
import GuidedHelpPanel from './GuidedHelpPanel.vue'

const props = defineProps<{ document: GuideDocument; snapshot: GuideJourneySnapshot; locale: 'en' | 'fr'; currentView: string; initialCursor?: GuideJourneyCursor | null; initialExecutionId?: string | null; notice?: string; ledger?: TargetLedger; actionChannel?: GuideActionChannel; observedContext?: GuideObservedContext; returnTarget?: GuideTargetRef | null; freshness?: 'ready' | 'loading' | 'unavailable'; presentation?: GuidePresentation | null }>()
const emit = defineEmits<{ select: [cursor: GuideJourneyCursor | null]; exit: []; signal: [signal: GuideActionSignal] }>()
const cursor = ref<GuideJourneyCursor | null>(props.initialCursor ?? null)
const waiting = ref(false)
const stableSnapshot = shallowRef(props.snapshot)
const labels = computed(() => props.locale === 'fr'
  ? { next: 'Suivant', exit: 'Quitter le guide', waiting: 'Effectuez le travail décrit dans le dossier pour poursuivre. Consulter les instructions ne termine pas la tâche.', unavailable: 'Le guide attend que le dossier soit disponible.', completed: 'Toutes les étapes du parcours sont terminées.' }
  : { next: 'Next', exit: 'Exit guidance', waiting: 'Complete the work described in the record to continue. Reviewing instructions does not complete the task.', unavailable: 'Guidance is waiting for the record to become available.', completed: 'All journey stages are complete.' })
const complete = computed(() => Boolean(props.document.journey?.stages.length) && props.document.journey?.stages.every(item => stableSnapshot.value.stages.some(state => state.id === item.id && state.status === 'completed')))
const recipe = computed(() => props.document.journey?.stages.find(item => item.id === cursor.value?.stageId)
  ?? props.document.journey?.stages.find(item => stableSnapshot.value.stages.find(state => state.id === item.id)?.status !== 'completed')
  ?? props.document.journey?.stages.at(-1))
const stage = computed(() => stableSnapshot.value.stages.find(item => item.id === recipe.value?.id))
const task = computed<GuideJourneyTask | undefined>(previous => {
  const current = cursor.value
  const next = stage.value?.kind === 'tasks'
    ? stage.value.tasks.find(item => current?.kind === 'tasks' ? item.id === current.taskId : item.status === 'blocked')
    : undefined
  return next ?? (current?.kind === 'tasks' && previous?.id === current.taskId ? previous : undefined)
})
const finalStage = computed(() => cursor.value?.kind === 'once' && props.document.journey?.stages.at(-1)?.id === cursor.value.stageId)
const stepIds = computed<string[]>(previous => {
  const next = recipe.value ? guideJourneyStepIds(recipe.value, task.value) : []
  return previous?.length === next.length && previous.every((id, index) => id === next[index]) ? previous : next
})
const stageDocument = computed<GuideDocument>(() => ({
  formatVersion: props.document.formatVersion, title: props.document.title, description: props.document.description,
  steps: stepIds.value.flatMap(id => {
    const step = props.document.steps.find(item => item.id === id)
    if (!step) return []
    return [{ id: step.id, view: step.view, target: step.target, kind: step.kind, ...(step.appearance ? { appearance: step.appearance } : {}), title: step.title, instructions: step.instructions, ...(step.advanceOn ? { advanceOn: step.advanceOn } : {}) }]
  })
}))
const context = computed(() => [stage.value?.title[props.locale], task.value?.title[props.locale]].filter(Boolean).join(' · '))
const unavailable = computed(() => props.freshness === 'loading' || props.freshness === 'unavailable' || props.observedContext?.kind === 'pending')
const missingTask = computed(() => cursor.value?.kind === 'tasks' && (stage.value?.kind !== 'tasks' || !stage.value.tasks.some(item => cursor.value?.kind === 'tasks' && item.id === cursor.value.taskId)))
const blocked = computed(() => stage.value?.status === 'blocked' || task.value?.status === 'blocked' || missingTask.value)
const statusMessage = computed(() => unavailable.value
  ? labels.value.unavailable
  : complete.value
    ? labels.value.completed
    : !cursor.value
        ? task.value?.status === 'blocked' ? task.value.blockingReason[props.locale] : stage.value?.reason?.[props.locale] ?? labels.value.unavailable
        : blocked.value ? task.value?.status === 'blocked' ? task.value.blockingReason[props.locale] : stage.value?.reason?.[props.locale] ?? labels.value.unavailable : waiting.value ? labels.value.waiting : undefined)
const instanceKey = computed(() => JSON.stringify([stableSnapshot.value.binding, stableSnapshot.value.execution, recipe.value?.id, cursor.value?.kind === 'tasks' ? cursor.value.taskId : null]))
let bindingKey = JSON.stringify([stableSnapshot.value.binding, props.initialExecutionId ?? stableSnapshot.value.execution?.executionId ?? null])
watch(() => [props.document, props.snapshot, props.freshness], () => {
  if (props.freshness && props.freshness !== 'ready') return
  stableSnapshot.value = props.snapshot
  const nextBindingKey = JSON.stringify([props.snapshot.binding, props.snapshot.execution?.executionId ?? null])
  const next = reconcileGuideJourney(props.document, props.snapshot, bindingKey === nextBindingKey ? cursor.value : null)
  bindingKey = nextBindingKey
  if (JSON.stringify(next) !== JSON.stringify(cursor.value)) {
    cursor.value = next
    emit('select', next)
  }
}, { immediate: true, deep: true })
watch(instanceKey, () => {
  waiting.value = false
})
/** Retain the instruction identity without changing business state.
 * @param stepId Selected instruction within the current stage.
 */
const select = (stepId: string) => {
  if (!cursor.value) return
  waiting.value = false
  cursor.value = { ...cursor.value, stepId }
  emit('select', cursor.value)
}
/** Completing instructions never completes the host's business work. */
const finish = () => {
  if (finalStage.value || complete.value) emit('exit')
  else waiting.value = true
}
const taskLabel = (value: GuideJourneyTask, other: GuideJourneyTask) => ({
  en: value.title.en === other.title.en ? `${value.title.en} (${value.id})` : value.title.en,
  fr: value.title.fr === other.title.fr ? `${value.title.fr} (${value.id})` : value.title.fr
})
const recovery = computed<GuidePresentation | null>(() => {
  if (props.presentation) return props.presentation
  const observed = props.observedContext
  const expected = task.value
  if (!observed || unavailable.value || !cursor.value) return null
  if (cursor.value.kind === 'once') {
    if (observed.kind !== 'task') return null
    const actual = stableSnapshot.value.stages.flatMap(item => item.kind === 'tasks' ? item.tasks : []).find(item => item.id === observed.taskId)
    if (actual?.status !== 'completed') return null
    return { view: props.currentView, target: props.returnTarget ?? null, title: { en: 'Return to workflow', fr: 'Revenir au processus' },
      instructions: { en: `${actual.title.en} is complete. Return to the record to continue.`, fr: `${actual.title.fr} est terminé. Retournez au dossier pour poursuivre.` } }
  }
  const detourTitle = { en: 'Return to expected task', fr: 'Revenir à la tâche attendue' }
  const previousTitle = { en: 'Return to workflow', fr: 'Revenir au processus' }
  const title = expected?.title ?? { en: 'Task unavailable', fr: 'Tâche indisponible' }
  if (!expected || missingTask.value || expected.status === 'blocked') return {
    view: props.currentView, target: props.returnTarget ?? null, title,
    instructions: expected?.status === 'blocked' ? expected.blockingReason : { en: 'The expected task is unavailable. Return to the record and retry.', fr: 'La tâche attendue est indisponible. Retournez au dossier et réessayez.' }
  }
  const expectedExecution = stableSnapshot.value.execution
  const matchingOwner = observed.kind === 'owner' && observed.binding?.resourceType === stableSnapshot.value.binding?.resourceType && observed.binding?.resourceId === stableSnapshot.value.binding?.resourceId
    && (!observed.execution || !expectedExecution || observed.execution.executionId === expectedExecution.executionId)
  const matchingExecution = observed.kind === 'task' && JSON.stringify(observed.execution) === JSON.stringify(expectedExecution ?? null)
  if (observed.kind === 'owner' && matchingOwner && expected.entryTargets?.length) return {
    view: props.currentView, target: expected.entryTargets, title: stageDocument.value.steps[0]?.title ?? title,
    instructions: stageDocument.value.steps[0]?.instructions ?? { en: `Use the application controls to open ${title.en}.`, fr: `Utilisez les commandes de l’application pour ouvrir ${title.fr}.` }
  }
  if (observed.kind === 'task' && matchingExecution && observed.taskId === expected.id) return null
  if (observed.kind === 'owner' && matchingOwner && !expected.entryTargets?.length) return null
  const actual = observed.kind === 'task' && stage.value?.kind === 'tasks' ? stage.value.tasks.find(item => item.id === observed.taskId) : undefined
  const returned = actual?.status === 'completed'
  const expectedLabel = actual ? taskLabel(expected, actual) : title
  const actualLabel = actual ? taskLabel(actual, expected) : null
  return {
    view: props.currentView, target: props.returnTarget ?? null, title: returned ? previousTitle : detourTitle,
    instructions: returned
      ? { en: `${actualLabel?.en} is complete. Return to the record, then open ${expectedLabel.en}.`, fr: `${actualLabel?.fr} est terminé. Retournez au dossier, puis ouvrez ${expectedLabel.fr}.` }
      : { en: `This guide is working on ${expectedLabel.en}.${actualLabel ? ` You opened ${actualLabel.en}.` : ''} Return to the record, then open ${expectedLabel.en}.`, fr: `Ce guide porte sur ${expectedLabel.fr}.${actualLabel ? ` Vous avez ouvert ${actualLabel.fr}.` : ''} Retournez au dossier, puis ouvrez ${expectedLabel.fr}.` }
  }
})
</script>

<template>
  <GuidedHelpPanel v-if="stageDocument.steps.length" :key="instanceKey" :document="stageDocument" :locale="locale" :current-view="currentView" :initial-step-id="cursor?.stepId" :finish-label="finalStage || complete ? labels.exit : labels.next" :finish-disabled="(!cursor && !complete) || waiting || unavailable || blocked" :suspended="(!cursor && !complete) || unavailable" :context="context" :status-message="statusMessage" :notice="notice" :ledger="ledger" :action-channel="actionChannel" :observed-context="observedContext" :presentation="recovery" @select="select" @finish="finish" @signal="emit('signal', $event)" @exit="emit('exit')" />
</template>
