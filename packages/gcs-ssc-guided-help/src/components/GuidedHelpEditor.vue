<script setup lang="ts">
import { computed } from 'vue'
import type { BilingualText, GuideDraft, GuideStep, TargetLedger } from '../contracts'
import type { GuideLocale } from '../runtime'

const props = defineProps<{ modelValue: GuideDraft; ledger: TargetLedger; locale: GuideLocale }>()
const emit = defineEmits<{ 'update:modelValue': [value: GuideDraft]; 'preview': [value: GuideDraft]; 'pick': [target: { stepId: string; view: string; target: string }] }>()
const languages: GuideLocale[] = ['en', 'fr']
const languageNames = { en: 'English', fr: 'Français' }
const labels = computed(() => props.locale === 'fr' ? { completion: 'Progression', automatic: 'Après réalisation de l’action', manual: 'Uniquement avec Suivant', title: 'Titre', description: 'Description', instructions: 'Instructions', view: 'Écran', target: 'Commande', add: 'Ajouter une étape', remove: 'Supprimer', up: 'Monter', down: 'Descendre', preview: 'Aperçu', pick: 'Sélectionner à l’écran', publicationRequired: 'Obligatoire pour publication', step: 'Étape', choose: 'Sélectionner' } : { completion: 'Progression', automatic: 'After completing the action', manual: 'Next button only', title: 'Title', description: 'Description', instructions: 'Instructions', view: 'Screen', target: 'Control', add: 'Add step', remove: 'Remove', up: 'Move up', down: 'Move down', preview: 'Preview', pick: 'Select on screen', publicationRequired: 'Required for publication', step: 'Step', choose: 'Select' })
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
const remove = (index: number) => update({ ...props.modelValue, steps: props.modelValue.steps.filter((_, candidate) => candidate !== index) })
/**
 * Move a step while preserving its stable identity.
 * @param index Current step position.
 * @param offset Relative movement within the ordered steps.
 */
const move = (index: number, offset: number) => {
  const steps = [...props.modelValue.steps]
  const destination = index + offset
  if (destination < 0 || destination >= steps.length) return
  const [step] = steps.splice(index, 1)
  steps.splice(destination, 0, step!)
  update({ ...props.modelValue, steps })
}
</script>

<template>
  <div class="gcs-guided-help-editor">
    <fieldset v-for="language in languages" :key="language">
      <legend>{{ languageNames[language] }}</legend>
      <label>{{ labels.title }} ({{ labels.publicationRequired }})<input :lang="language" :value="modelValue.title[language]" maxlength="255" @input="changeDocument('title', language, text($event))"></label>
      <label>{{ labels.description }} ({{ labels.publicationRequired }})<textarea :lang="language" :value="modelValue.description[language]" maxlength="4000" @input="changeDocument('description', language, text($event))" /></label>
    </fieldset>
    <fieldset v-for="(step, index) in modelValue.steps" :key="step.id">
      <legend>{{ labels.step }} {{ index + 1 }}</legend>
      <label>{{ labels.view }} ({{ labels.publicationRequired }})<select :value="step.view" @change="chooseView(index, text($event))"><option value="" disabled>{{ labels.choose }}</option><option v-for="view in ledger.views" :key="view.key" :value="view.key">{{ view.label[locale] }}</option></select></label>
      <label>{{ labels.target }} ({{ labels.publicationRequired }})<select :value="step.target" @change="chooseTarget(index, text($event))"><option value="" disabled>{{ labels.choose }}</option><option v-for="target in targets(step.view)" :key="target.key" :value="target.key">{{ target.label[locale] }}</option></select></label>
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
        <button type="button" :disabled="index === 0" @click="move(index, -1)">
          {{ labels.up }}
        </button><button type="button" :disabled="index === modelValue.steps.length - 1" @click="move(index, 1)">
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
