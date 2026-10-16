<script setup lang="ts">
import { computed } from 'vue'
import type { GuideDraft, GuideStep } from '@gcs-ssc/guided-help/contracts'
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
const views = computed(() => guidedHelpLedger.views.map(view => ({ label: label(view.label), value: view.key })))
const targets = computed(() => (guidedHelpLedger.views.find(view => view.key === step.value?.view)?.targets ?? []).map(target => ({ label: label(target.label), value: target.key })))
const progressionOptions = computed(() => [{ value: 'completion', label: t('guided_help.progression_completion') }, { value: 'manual', label: t('guided_help.progression_manual') }])
const changeStep = (changes: Partial<GuideStep>) => {
  if (!step.value) return
  document.value = { ...document.value, steps: document.value.steps.map(item => item.id === selectedStep.value ? { ...item, ...changes } : item) }
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
      <slot name="sharing" />
    </fieldset>
    <template v-else>
      <fieldset v-if="step" :disabled="disabled" class="space-y-8">
        <div class="grid gap-5 md:grid-cols-2">
          <UFormField :label="t('guided_help.screen')" :required="false" :hint="t('guided_help.required_for_publication')">
            <USelect :model-value="step.view" :items="views" class="w-full" @update:model-value="chooseView(String($event))" />
          </UFormField>
          <UFormField :label="t('guided_help.control')" :required="false" :hint="t('guided_help.required_for_publication')">
            <USelect :model-value="step.target" :items="targets" class="w-full" @update:model-value="chooseTarget(String($event))" />
          </UFormField>
          <UFormField :label="t('guided_help.progression')" :required="false" :description="t('guided_help.progression_hint')">
            <USelect :model-value="step.advanceOn ?? 'completion'" :items="progressionOptions" class="w-full" @update:model-value="changeStep({ advanceOn: $event as 'completion' | 'manual' })" />
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
