<script setup lang="ts">
import { computed } from 'vue'
import type { GuideDraft, GuideStep } from '@gcs-ssc/guided-help/contracts'
import { guidedHelpJourneys } from '~~/shared/guided-help/journeys'
import { guidedHelpLedger } from '~~/shared/guided-help/catalog'

const document = defineModel<GuideDraft>({ required: true })
const selectedStep = defineModel<string>('selectedStep', { default: '' })
const { section, disabled = false } = defineProps<{ section: 'general' | 'steps', disabled?: boolean }>()
const emit = defineEmits<{ pick: [target: { stepId: string, view: string, target: string }] }>()
const { t, locale } = useI18n()
const languages = ['en', 'fr'] as const
const label = (value: { en: string, fr: string }) => value[locale.value === 'fr' ? 'fr' : 'en']
const stepIndex = computed(() => document.value.steps.findIndex(step => step.id === selectedStep.value))
const step = computed(() => document.value.steps[stepIndex.value])
const journeyDefinition = computed(() => guidedHelpJourneys.find(item => item.adapter === document.value.journey?.adapter))
const stageId = computed(() => document.value.journey?.stages.find(stage => stage.guideStepIds.includes(selectedStep.value) || (stage.kind === 'tasks' ? stage.taskTemplates : undefined)?.some(template => template.guideStepIds.includes(selectedStep.value)))?.id ?? '')
const journeyOptions = computed(() => [{ value: '', label: t('guided_help.journey_none') }, ...guidedHelpJourneys.map(item => ({ value: item.adapter, label: label(item.label) }))])
const stageOptions = computed(() => journeyDefinition.value?.stages.map(stage => ({ value: stage.id, label: label(stage.label) })) ?? [])
const templateKey = computed(() => {
  const stage = document.value.journey?.stages.find(item => item.id === stageId.value)
  return stage?.kind === 'tasks' ? stage.taskTemplates?.find(template => template.guideStepIds.includes(selectedStep.value))?.key ?? '' : ''
})
const registeredStage = computed(() => journeyDefinition.value?.stages.find(stage => stage.id === stageId.value))
const templateOptions = computed(() => [{ value: '', label: t('guided_help.journey_template_generic') }, ...(registeredStage.value?.taskTemplates ?? []).map(template => ({ value: template.key, label: label(template.label) }))])
const allowedViews = computed(() => registeredStage.value?.taskTemplates?.find(template => template.key === templateKey.value)?.allowedViews ?? registeredStage.value?.allowedViews)
const views = computed(() => guidedHelpLedger.views.filter(view => !allowedViews.value || allowedViews.value.includes(view.key)).map(view => ({ label: label(view.label), value: view.key })))
const hasBranches = computed(() => document.value.steps.some(item => item.flow))
/**
 * Select a registered journey while preserving authored branching documents.
 * @param adapter Registered workflow adapter key.
 */
const chooseJourney = (adapter: string) => {
  if (!adapter) {
    const { journey: _journey, ...linear } = document.value
    document.value = linear
    return
  }
  if (hasBranches.value) return
  const definition = guidedHelpJourneys.find(item => item.adapter === adapter)
  if (!definition) return
  document.value = { ...document.value, journey: { adapter, stages: definition.stages.map((stage, index) => ({ id: stage.id, kind: stage.kind, guideStepIds: index === 0 ? document.value.steps.map(item => item.id) : [] })) } }
}
/**
 * Move a step and its reference together into the selected journey stage.
 * @param id Destination stage identity.
 * @param templateKey Registered task template or the generic fallback.
 */
const chooseStage = (id: string, templateKey = '') => {
  if (!document.value.journey) return
  const registration = journeyDefinition.value?.stages.find(stage => stage.id === id)
  if (!registration || (templateKey && !registration.taskTemplates?.some(template => template.key === templateKey))) return
  const stages = document.value.journey.stages.map(stage => {
    const guideStepIds = stage.guideStepIds.filter(item => item !== selectedStep.value)
    const taskTemplates = (stage.kind === 'tasks' ? stage.taskTemplates ?? [] : []).map(template => ({ ...template, guideStepIds: template.guideStepIds.filter(item => item !== selectedStep.value) }))
    if (stage.id === id) {
      if (!templateKey) guideStepIds.push(selectedStep.value)
      else {
        const template = taskTemplates.find(item => item.key === templateKey)
        if (template) template.guideStepIds.push(selectedStep.value)
        else taskTemplates.push({ key: templateKey, guideStepIds: [selectedStep.value] })
      }
    }
    if (stage.kind === 'once') return { ...stage, guideStepIds }
    return { ...stage, guideStepIds, taskTemplates: taskTemplates.filter(template => template.guideStepIds.length) }
  })
  const order = stages.flatMap(stage => [...stage.guideStepIds, ...(stage.kind === 'tasks' ? stage.taskTemplates ?? [] : []).flatMap(template => template.guideStepIds)])
  const allowed = registration.taskTemplates?.find(template => template.key === templateKey)?.allowedViews ?? registration.allowedViews
  const view = allowed[0]
  const target = guidedHelpLedger.views.find(item => item.key === view)?.targets[0]
  const steps: GuideStep[] = document.value.steps.map(item => item.id === selectedStep.value && view && !allowed.includes(item.view)
    ? { ...item, view, target: target?.key ?? '', kind: target?.kind ?? 'section' }
    : item).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
  document.value = { ...document.value, journey: { ...document.value.journey, stages }, steps }
}
const targets = computed(() => (guidedHelpLedger.views.find(view => view.key === step.value?.view)?.targets ?? []).map(target => ({ label: label(target.label), value: target.key })))
const appearanceOptions = computed(() => [{ value: 'spotlight', label: t('guided_help.appearance_spotlight') }, { value: 'anchor-only', label: t('guided_help.appearance_anchor_only') }])
const progressionOptions = computed(() => [{ value: 'completion', label: t('guided_help.progression_completion') }, { value: 'manual', label: t('guided_help.progression_manual') }])
const changeStep = (changes: Partial<GuideStep>) => {
  if (!step.value) return
  document.value = { ...document.value, steps: document.value.steps.map(item => item.id === selectedStep.value ? { ...item, ...changes } : item) }
}
const chooseAppearance = (appearance: string) => {
  if (appearance === 'spotlight' || appearance === 'anchor-only') changeStep({ appearance })
}
const chooseView = (view: string) => {
  const target = guidedHelpLedger.views.find(item => item.key === view)?.targets[0]
  changeStep({ view, target: target?.key ?? '', kind: target?.kind ?? 'section' })
}
const chooseTarget = (key: string) => {
  const target = guidedHelpLedger.views.find(item => item.key === step.value?.view)?.targets.find(item => item.key === key)
  if (target) changeStep({ target: target.key, kind: target.kind })
}
</script>

<template>
  <div class="min-w-0 space-y-8" data-testid="help-publisher-fields">
    <fieldset v-if="section === 'general'" :disabled="disabled" class="space-y-8">
      <p class="text-sm text-muted">
        {{ t('guided_help.publication_required') }}
      </p>
      <div class="grid gap-6 xl:grid-cols-2">
        <section v-for="language in languages" :key="language" class="space-y-5">
          <h3 class="text-base font-semibold">
            {{ t(`guided_help.language_${language}`) }}
          </h3>
          <UFormField :label="t('guided_help.field_title')" :required="false" :name="`title.${language}`" :hint="t('guided_help.required_for_publication')">
            <UInput v-model="document.title[language]" :lang="language" :maxlength="255" class="w-full" :data-testid="`help-title-${language}`" />
          </UFormField>
          <UFormField :label="t('guided_help.field_description')" :required="false" :name="`description.${language}`" :hint="t('guided_help.required_for_publication')">
            <UTextarea v-model="document.description[language]" :lang="language" :maxlength="4000" :rows="4" class="w-full" />
          </UFormField>
        </section>
      </div>
      <UFormField :label="t('guided_help.journey')" :required="false" name="journey" :description="t('guided_help.journey_hint')">
        <USelect :model-value="document.journey?.adapter ?? ''" :items="journeyOptions" :disabled="hasBranches" class="w-full" @update:model-value="chooseJourney(String($event))" />
        <p v-if="hasBranches" class="mt-2 text-sm text-muted">
          {{ t('guided_help.journey_branch_conflict') }}
        </p>
      </UFormField>
      <slot name="sharing" />
    </fieldset>
    <template v-else>
      <fieldset v-if="step" :disabled="disabled" class="space-y-8">
        <div class="grid gap-5 md:grid-cols-2">
          <UFormField v-if="document.journey" :label="t('guided_help.journey_stage')" required name="journey">
            <USelect :model-value="stageId" :items="stageOptions" class="w-full" @update:model-value="chooseStage(String($event))" />
          </UFormField>
          <UFormField v-if="registeredStage?.kind === 'tasks'" :label="t('guided_help.journey_template')" :required="false" name="journey">
            <USelect :model-value="templateKey" :items="templateOptions" class="w-full" @update:model-value="chooseStage(stageId, String($event))" />
          </UFormField>
          <UFormField :label="t('guided_help.screen')" :required="false" :hint="t('guided_help.required_for_publication')">
            <USelect :model-value="step.view" :items="views" class="w-full" @update:model-value="chooseView(String($event))" />
          </UFormField>
          <UFormField :label="t('guided_help.control')" :required="false" :hint="t('guided_help.required_for_publication')">
            <USelect :model-value="step.target" :items="targets" class="w-full" @update:model-value="chooseTarget(String($event))" />
          </UFormField>
          <UFormField :label="t('guided_help.progression')" :required="false" :description="t('guided_help.progression_hint')">
            <USelect :model-value="step.advanceOn ?? 'completion'" :items="progressionOptions" class="w-full" @update:model-value="changeStep({ advanceOn: $event as 'completion' | 'manual' })" />
          </UFormField>
          <UFormField :label="t('guided_help.appearance')" :required="false" :description="t('guided_help.appearance_hint')">
            <USelect :model-value="step.appearance ?? 'spotlight'" :items="appearanceOptions" class="w-full" @update:model-value="chooseAppearance(String($event))" />
          </UFormField>
          <div v-if="!disabled" class="flex items-start pt-6">
            <UButton :label="t('guided_help.select_on_screen')" icon="i-lucide-mouse-pointer-2" color="neutral" variant="outline" @click="emit('pick', { stepId: step.id, view: step.view, target: step.target })" />
          </div>
        </div>
        <div class="grid gap-6 xl:grid-cols-2">
          <section v-for="language in languages" :key="language" class="space-y-5">
            <h3 class="text-base font-semibold">
              {{ t(`guided_help.language_${language}`) }}
            </h3>
            <UFormField :label="t('guided_help.field_title')" :required="false" :name="`steps.${stepIndex}.title.${language}`" :hint="t('guided_help.required_for_publication')">
              <UInput v-model="step.title[language]" :data-testid="`help-step-title-${language}`" :lang="language" :maxlength="255" class="w-full" />
            </UFormField>
            <UFormField :label="t('guided_help.instructions')" :required="false" :name="`steps.${stepIndex}.instructions.${language}`" :hint="t('guided_help.required_for_publication')" :description="t('guided_help.markdown_hint')">
              <UTextarea v-model="step.instructions[language]" :data-testid="`help-step-instructions-${language}`" :lang="language" :maxlength="8000" :rows="7" class="w-full" />
            </UFormField>
          </section>
        </div>
      </fieldset>
    </template>
  </div>
</template>
