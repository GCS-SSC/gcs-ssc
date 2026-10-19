<script setup lang="ts">
import { computed } from 'vue'
import type { BilingualText, GuideDraft, GuideStep, TargetLedger } from '../contracts'
import type { GuideLocale } from '../runtime'
import type { GuideJourneyDefinition } from '../journey'

const props = defineProps<{ modelValue: GuideDraft; ledger: TargetLedger; locale: GuideLocale; journeyDefinitions?: GuideJourneyDefinition[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: GuideDraft]; 'preview': [value: GuideDraft]; 'pick': [target: { stepId: string; view: string; target: string }] }>()
const languages: GuideLocale[] = ['en', 'fr']
const languageNames = { en: 'English', fr: 'Français' }
const labels = computed(() => props.locale === 'fr' ? { appearance: 'Apparence', spotlight: 'Mettre la commande en évidence', anchorOnly: 'Instructions uniquement', completion: 'Progression', automatic: 'Après réalisation de l’action', manual: 'Uniquement avec Suivant', title: 'Titre', description: 'Description', instructions: 'Instructions', view: 'Écran', target: 'Commande', add: 'Ajouter une étape', remove: 'Supprimer', up: 'Monter', down: 'Descendre', preview: 'Aperçu', pick: 'Sélectionner à l’écran', publicationRequired: 'Obligatoire pour publication', step: 'Étape', choose: 'Sélectionner' } : { appearance: 'Appearance', spotlight: 'Highlight the control', anchorOnly: 'Instructions only', completion: 'Progression', automatic: 'After completing the action', manual: 'Next button only', title: 'Title', description: 'Description', instructions: 'Instructions', view: 'Screen', target: 'Control', add: 'Add step', remove: 'Remove', up: 'Move up', down: 'Move down', preview: 'Preview', pick: 'Select on screen', publicationRequired: 'Required for publication', step: 'Step', choose: 'Select' })
const journeyLabels = computed(() => props.locale === 'fr' ? { recipe: 'Parcours', none: 'Aucun parcours', stage: 'Phase du parcours', unassigned: 'Non attribuée' } : { recipe: 'Journey', none: 'No journey', stage: 'Journey stage', unassigned: 'Unassigned' })
const journeyDefinition = computed(() => props.journeyDefinitions?.find(definition => definition.adapter === props.modelValue.journey?.adapter))
/**
 * Select a host-defined recipe without retaining references from another recipe.
 * @param adapter Host recipe identity, or empty to remove the journey.
 */
const chooseJourney = (adapter: string) => {
  const definition = props.journeyDefinitions?.find(candidate => candidate.adapter === adapter)
  const document = { ...props.modelValue }
  delete document.journey
  update(definition ? { ...document, journey: { adapter: definition.adapter, stages: definition.stages.map(stage => ({ id: stage.id, kind: stage.kind, guideStepIds: [], ...(stage.taskTemplates ? { taskTemplates: stage.taskTemplates.map(template => ({ key: template.key, guideStepIds: [] })) } : {}) })) } } : document)
}
const stageOptions = computed(() => journeyDefinition.value?.stages.flatMap(stage => [
  { value: stage.id, label: stage.label[props.locale] },
  ...(stage.taskTemplates ?? []).map(template => ({ value: JSON.stringify([stage.id, template.key]), label: `${stage.label[props.locale]} — ${template.label[props.locale]}` }))
]) ?? [])
/**
 * Find the stage or task template containing an instruction.
 * @param stepId Stable instruction identity.
 * @returns Selection key for the authoring control.
 */
const stageForStep = (stepId: string) => {
  for (const stage of props.modelValue.journey?.stages ?? []) {
    if (stage.guideStepIds.includes(stepId)) return stage.id
    const template = stage.taskTemplates?.find(item => item.guideStepIds.includes(stepId))
    if (template) return JSON.stringify([stage.id, template.key])
  }
  return ''
}
/**
 * Move a guide step into one journey stage, or leave it unassigned.
 * @param stepId Stable guide step identity.
 * @param stageId Destination stage identity, or empty to unassign.
 */
const assignStage = (stepId: string, stageId: string) => {
  const journey = props.modelValue.journey
  if (!journey) return
  update({ ...props.modelValue, journey: { ...journey, stages: journey.stages.map(stage => ({ ...stage, guideStepIds: props.modelValue.steps.filter(step => step.id === stepId ? stage.id === stageId : stage.guideStepIds.includes(step.id)).map(step => step.id), ...(stage.taskTemplates ? { taskTemplates: stage.taskTemplates.map(template => ({ ...template, guideStepIds: props.modelValue.steps.filter(step => step.id === stepId ? JSON.stringify([stage.id, template.key]) === stageId : template.guideStepIds.includes(step.id)).map(step => step.id) })) } : {}) })) } })
}
const blank = (): BilingualText => ({ en: '', fr: '' })
const update = (next: GuideDraft) => emit('update:modelValue', next)
const text = (event: Event) => (event.target as HTMLInputElement).value
const changeDocument = (key: 'title' | 'description', language: GuideLocale, value: string) => update({ ...props.modelValue, [key]: { ...props.modelValue[key], [language]: value } })
const changeStep = (index: number, changes: Partial<GuideStep>) => update({ ...props.modelValue, steps: props.modelValue.steps.map((step, candidate) => candidate === index ? { ...step, ...changes } : step) })
const changeStepText = (index: number, key: 'title' | 'instructions', language: GuideLocale, value: string) => {
  const step = props.modelValue.steps[index]!
  changeStep(index, { [key]: { ...step[key], [language]: value } })
}
const targets = (view: string) => props.ledger.views.find(candidate => candidate.key === view)?.targets ?? []
const chooseView = (index: number, view: string) => {
  const target = targets(view)[0]
  changeStep(index, { view, target: target?.key ?? '', kind: target?.kind ?? 'section' })
}
const chooseTarget = (index: number, key: string) => {
  const target = targets(props.modelValue.steps[index]!.view).find(candidate => candidate.key === key)
  if (target) changeStep(index, { target: target.key, kind: target.kind })
}
/**
 * Append an incomplete draft step with one stable identity.
 */
const add = () => {
  const view = props.ledger.views[0]
  const target = view?.targets[0]
  update({ ...props.modelValue, steps: [...props.modelValue.steps, { id: crypto.randomUUID(), view: view?.key ?? '', target: target?.key ?? '', kind: target?.kind ?? 'section', title: blank(), instructions: blank() }] })
}
/**
 * Remove a step and every journey reference to its stable identity.
 * @param index Step position in the guide.
 */
const remove = (index: number) => {
  const stepId = props.modelValue.steps[index]?.id
  const journey = props.modelValue.journey
  update({ ...props.modelValue, steps: props.modelValue.steps.filter((_, candidate) => candidate !== index), ...(journey ? { journey: { ...journey, stages: journey.stages.map(stage => ({ ...stage, guideStepIds: stage.guideStepIds.filter(id => id !== stepId), ...(stage.taskTemplates ? { taskTemplates: stage.taskTemplates.map(template => ({ ...template, guideStepIds: template.guideStepIds.filter(id => id !== stepId) })) } : {}) })) } } : {}) })
}
/** Check whether adjacent instructions belong to the same stage.
 * @param index Current step position.
 * @param offset Proposed movement.
 * @returns Whether movement preserves stage membership.
 */
const canMove = (index: number, offset: number) => {
  const step = props.modelValue.steps[index]
  const adjacent = props.modelValue.steps[index + offset]
  return Boolean(step && adjacent && (!props.modelValue.journey || stageForStep(step.id) === stageForStep(adjacent.id)))
}
/**
 * Move a step within its authored stage while preserving reader order.
 * @param index Current step position.
 * @param offset Relative movement within the ordered steps.
 */
const move = (index: number, offset: number) => {
  const steps = [...props.modelValue.steps]
  const destination = index + offset
  if (!canMove(index, offset)) return
  const [step] = steps.splice(index, 1)
  steps.splice(destination, 0, step!)
  const journey = props.modelValue.journey
  update({ ...props.modelValue, steps, ...(journey ? { journey: { ...journey, stages: journey.stages.map(stage => ({ ...stage, guideStepIds: steps.filter(item => stage.guideStepIds.includes(item.id)).map(item => item.id), ...(stage.taskTemplates ? { taskTemplates: stage.taskTemplates.map(template => ({ ...template, guideStepIds: steps.filter(item => template.guideStepIds.includes(item.id)).map(item => item.id) })) } : {}) })) } } : {}) })
}
</script>

<template>
  <div class="gcs-guided-help-editor">
    <label v-if="journeyDefinitions?.length">{{ journeyLabels.recipe }}<select :value="modelValue.journey?.adapter ?? ''" @change="chooseJourney(text($event))"><option value="">{{ journeyLabels.none }}</option><option v-for="definition in journeyDefinitions" :key="definition.adapter" :value="definition.adapter">{{ definition.label[locale] }}</option></select></label>
    <fieldset v-for="language in languages" :key="language">
      <legend>{{ languageNames[language] }}</legend>
      <label>{{ labels.title }} ({{ labels.publicationRequired }})<input :lang="language" :value="modelValue.title[language]" maxlength="255" @input="changeDocument('title', language, text($event))"></label>
      <label>{{ labels.description }} ({{ labels.publicationRequired }})<textarea :lang="language" :value="modelValue.description[language]" maxlength="4000" @input="changeDocument('description', language, text($event))" /></label>
    </fieldset>
    <fieldset v-for="(step, index) in modelValue.steps" :key="step.id">
      <legend>{{ labels.step }} {{ index + 1 }}</legend>
      <label v-if="journeyDefinition">{{ journeyLabels.stage }}<select :value="stageForStep(step.id)" @change="assignStage(step.id, text($event))"><option value="">{{ journeyLabels.unassigned }}</option><option v-for="option in stageOptions" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
      <label>{{ labels.view }} ({{ labels.publicationRequired }})<select :value="step.view" @change="chooseView(index, text($event))"><option value="" disabled>{{ labels.choose }}</option><option v-for="view in ledger.views" :key="view.key" :value="view.key">{{ view.label[locale] }}</option></select></label>
      <label>{{ labels.target }} ({{ labels.publicationRequired }})<select :value="step.target" @change="chooseTarget(index, text($event))"><option value="" disabled>{{ labels.choose }}</option><option v-for="target in targets(step.view)" :key="target.key" :value="target.key">{{ target.label[locale] }}</option></select></label>
      <label>{{ labels.appearance }}<select :value="step.appearance ?? 'spotlight'" @change="changeStep(index, { appearance: text($event) === 'anchor-only' ? 'anchor-only' : 'spotlight' })"><option value="spotlight">{{ labels.spotlight }}</option><option value="anchor-only">{{ labels.anchorOnly }}</option></select></label>
      <label>{{ labels.completion }}<select :value="step.advanceOn ?? 'completion'" @change="changeStep(index, { advanceOn: text($event) as 'completion' | 'manual' })"><option value="completion">{{ labels.automatic }}</option><option value="manual">{{ labels.manual }}</option></select></label>
      <button type="button" @click="emit('pick', { stepId: step.id, view: step.view, target: step.target })">
        {{ labels.pick }}
      </button>
      <fieldset v-for="language in languages" :key="language">
        <legend>{{ languageNames[language] }}</legend>
        <label>{{ labels.title }} ({{ labels.publicationRequired }})<input :lang="language" :value="step.title[language]" maxlength="255" @input="changeStepText(index, 'title', language, text($event))"></label>
        <label>{{ labels.instructions }} ({{ labels.publicationRequired }})<textarea :lang="language" :value="step.instructions[language]" maxlength="8000" @input="changeStepText(index, 'instructions', language, text($event))" /></label>
      </fieldset>
      <div>
        <button type="button" :disabled="!canMove(index, -1)" @click="move(index, -1)">
          {{ labels.up }}
        </button><button type="button" :disabled="!canMove(index, 1)" @click="move(index, 1)">
          {{ labels.down }}
        </button><button type="button" @click="remove(index)">
          {{ labels.remove }}
        </button>
      </div>
    </fieldset>
    <div>
      <button type="button" @click="add">
        {{ labels.add }}
      </button><button type="button" @click="emit('preview', modelValue)">
        {{ labels.preview }}
      </button>
    </div>
  </div>
</template>
