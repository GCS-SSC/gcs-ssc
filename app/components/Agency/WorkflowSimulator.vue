<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- Scenario inputs are local to this read-only authoring panel. */
import { computed, onScopeDispose, ref, watch } from 'vue'
import AgencyWorkflowSimulationAssessment from './WorkflowSimulationAssessment.vue'
import { useResourceRequest } from '~/composables/useResourceRequest'
import {
  isWorkflowResultCondition, workflowConditionKey
} from '~~/shared/types/schemas/agreement-custom-fields'
import type { AgencyCustomFieldDefinition, WorkflowMemberCondition, WorkflowStartCondition } from '~~/shared/types/schemas/agreement-custom-fields'
import { isRepresentableByNumeric } from '~~/shared/utils/decimal'
import { CHECKLIST_RESULTS } from '~~/shared/types/schemas/checklist/checklist'
import type {
  WorkflowSimulation, WorkflowSimulationResultValue, WorkflowSimulationScenario
} from '~~/shared/types/schemas/workflow-simulation'
import type { WorkflowFlowChoices, WorkflowFlowMember } from '~/utils/workflow-flow-definition'
import { workflowResultPredicateLabel, workflowResultSourceLabel, workflowResultValueLabel } from '~/utils/workflow-result-conditions'

const { endpoint, members, customFields, choices } = defineProps<{
  endpoint: `/api/agency/${string}/workflows/${string}`
  members: WorkflowFlowMember[]
  customFields: AgencyCustomFieldDefinition[]
  choices: WorkflowFlowChoices
}>()

const emit = defineEmits<{ trace: [WorkflowSimulation | null] }>()
const { t, locale } = useI18n()
const { user, permissionRevision } = useAuth()
const { showError } = useApiErrorToast()
type Choice = { id: string, name_en: string, name_fr: string }
const profileSelections = ref<Record<string, string[]>>({})
type Outcome = NonNullable<WorkflowSimulationScenario['outcomes']>[string]
type AssessmentScenario = NonNullable<Outcome['assessments']>[string]
const outcomes = ref<Record<string, Outcome>>({})
const invalidAssessments = ref<Record<string, boolean>>({})
const assessmentKey = (stepId: string, inputId: string) => JSON.stringify([stepId, inputId])
const unavailable: Choice = { id: 'unavailable', name_en: '', name_fr: '' }
const localizedChoices = (ids: readonly string[], getKey: (id: string) => string): Choice[] => ids.map(id => ({
  id,
  name_en: t(getKey(id), {}, { locale: 'en' }),
  name_fr: t(getKey(id), {}, { locale: 'fr' })
}))
const yesNo = computed(() => localizedChoices(['true', 'false'], id => id === 'true' ? 'common.yes' : 'common.no'))
const checklistChoices = computed(() => localizedChoices(CHECKLIST_RESULTS, id => `checklist.result.${id}`))
const recommendationChoices = computed(() => localizedChoices(['true', 'false'], id => id === 'true'
  ? 'recommendation.outcomes.recommended'
  : 'recommendation.outcomes.not_recommended'))
const noValue = computed<Choice[]>(() => [{
  ...unavailable,
  name_en: t('workflow.simulator.unavailable', {}, { locale: 'en' }),
  name_fr: t('workflow.simulator.unavailable', {}, { locale: 'fr' })
}])
const localName = (option: Choice) => locale.value === 'fr' ? option.name_fr : option.name_en

const profileInputs = computed(() => {
  const conditions = members.flatMap(member => member.conditions ?? [])
    .filter((condition): condition is WorkflowStartCondition => !isWorkflowResultCondition(condition))
  const unique = new Map(conditions.map(condition => [workflowConditionKey(condition), condition]))
  return [...unique.entries()].map(([key, condition]) => {
    if ('fieldId' in condition) {
      const field = customFields.find(item => item.id === condition.fieldId)
      return {
        key, label: (locale.value === 'fr' ? field?.egcs_ay_name_fr : field?.egcs_ay_name_en) || key,
        options: field?.options.filter(option => option.egcs_ay_active).map(option => ({
          id: option.id, name_en: option.egcs_ay_name_en, name_fr: option.egcs_ay_name_fr
        })) ?? [],
        multiple: field?.egcs_ay_multiple === true
      }
    }
    const label = t(`workflow.conditions.${condition.source}`)
    if ('value' in condition) return { key, label, options: yesNo.value, multiple: false }
    const options = choices[condition.source] ?? []
    return {
      key, label,
      options: condition.source === 'recipient_subtype' ? [...options, ...noValue.value] : options,
      multiple: condition.source !== 'agreement_subtype'
    }
  })
})

const selected = (key: string) => profileSelections.value[key] ?? []
const selectedBoolean = (key: string) => {
  const value = selected(key)[0]
  return value === undefined ? undefined : value === 'true'
}
const identity = computed(() => JSON.stringify([endpoint, user.value?.id, permissionRevision.value, members]))
const requestSimulation = (signal: AbortSignal, body: WorkflowSimulationScenario) =>
  $fetch<WorkflowSimulation, `${typeof endpoint}/simulate`>(`${endpoint}/simulate`, { method: 'POST', signal, body })
const catalog = useResourceRequest<WorkflowSimulation>({
  identity,
  load: signal => requestSimulation(signal, {})
})
const simulation = useResourceRequest<WorkflowSimulation>({
  identity,
  trigger: 'refresh',
  refreshData: 'retain',
  failureData: 'retain',
  load: signal => requestSimulation(signal, {
    profile: {
      further_distribution: selectedBoolean('further_distribution'),
      jv_fiscal_eligible: selectedBoolean('jv_fiscal_eligible'),
      jv_payment_final: selectedBoolean('jv_payment_final'),
      jv_rationale_present: selectedBoolean('jv_rationale_present'),
      agreement_subtype: selected('agreement_subtype')[0],
      amendment_type: selected('amendment_type'),
      amendment_subtype: selected('amendment_subtype'),
      recipient_subtype: selected('recipient_subtype').map(value => value === unavailable.id ? null : value)
    },
    customFields: Object.fromEntries(profileInputs.value
      .filter(input => customFields.some(field => field.id === input.key))
      .map(input => [input.key, selected(input.key)])),
    outcomes: Object.fromEntries((catalog.data.value?.steps ?? []).map(step => [
      step.memberId, outcomes.value[step.memberId] ?? { state: 'succeeded', results: {} }
    ]))
  })
})
const trace = simulation.data
const pending = computed(() => simulation.status.value === 'pending')
const scenarioSteps = computed(() => catalog.data.value?.steps ?? [])
const outcomeChoices = (step: WorkflowSimulation['steps'][number]) =>
  localizedChoices(step.allowedStates, id => `workflow.simulator.status.${id}`)
const invalidScore = (stepId: string, id: string) => {
  const value = outcomes.value[stepId]?.results?.[id]
  return typeof value === 'number' && !isRepresentableByNumeric(value, 10, 2)
}
const canRun = computed(() => catalog.status.value === 'success' && !Object.values(invalidAssessments.value).some(Boolean) && scenarioSteps.value.every(step =>
  !step.inputs.some(input => input.source === 'assessment_score' && invalidScore(step.memberId, input.nestedMemberId))))
const allSkipped = computed(() => trace.value?.status === 'succeeded'
  && Boolean(trace.value.steps.length) && trace.value.steps.every(step => step.state === 'skipped'))

const reset = () => {
  profileSelections.value = {}
  outcomes.value = {}
  invalidAssessments.value = {}
  simulation.reset()
}
watch(identity, reset, { flush: 'sync' })
watch(trace, value => emit('trace', value), { flush: 'sync' })
onScopeDispose(() => emit('trace', null))
const setProfile = (key: string, values: string[]) => {
  profileSelections.value = { ...profileSelections.value, [key]: values }
  simulation.reset()
}
const selectOutcome = (step: WorkflowSimulation['steps'][number], value: string | null | undefined) => {
  const state = step.allowedStates.find(candidate => candidate === value)
  if (!state) return
  outcomes.value[step.memberId] = { ...outcomes.value[step.memberId], state }
  simulation.reset()
}
const setResult = (stepId: string, id: string, value: WorkflowSimulationResultValue | undefined) => {
  const { results = {} } = outcomes.value[stepId] ?? {}
  const { [id]: _previous, ...remaining } = results
  outcomes.value[stepId] = { state: 'succeeded', ...outcomes.value[stepId], results: value === undefined ? remaining : { ...remaining, [id]: value } }
  simulation.reset()
}
const setAssessment = (stepId: string, id: string, value: AssessmentScenario | undefined) => {
  const current = outcomes.value[stepId]
  const { [id]: _previous, ...remaining } = current?.assessments ?? {}
  outcomes.value[stepId] = {
    state: 'succeeded', ...current,
    assessments: value === undefined ? remaining : { ...remaining, [id]: value }
  }
  if (value === undefined) invalidAssessments.value[assessmentKey(stepId, id)] = false
  else setResult(stepId, id, undefined)
  simulation.reset()
}
const setScore = (stepId: string, id: string, value: string | number | undefined) => {
  const score = value === '' || value === undefined ? Number.NaN : Number(value)
  setResult(stepId, id, Number.isFinite(score) ? score : undefined)
}
const setChecklist = (stepId: string, id: string, value: string | null | undefined) =>
  setResult(stepId, id, CHECKLIST_RESULTS.find(item => item === value))
const setRecommendation = (stepId: string, id: string, value: string | null | undefined) =>
  setResult(stepId, id, value === 'true' || value === 'false' ? value === 'true' : undefined)
const run = async () => {
  if (pending.value || !canRun.value) return
  const accepted = await simulation.refresh()
  if (!accepted && simulation.error.value) showError(simulation.error.value)
}
const stepName = (memberId: string) => {
  const member = members.find(item => item.id === memberId)
  if (!member) return ''
  return (locale.value === 'fr' ? member.referenceNameFr : member.referenceNameEn) || t(`workflow.${member.egcs_cn_kind}`)
}
const choiceLabel = (condition: WorkflowMemberCondition, id: string) => {
  const choicesForCondition = profileInputs.value.find(input => input.key === workflowConditionKey(condition))?.options ?? []
  const item = choicesForCondition.find(option => option.id === id)
  return item ? localName(item) : id
}
const expectedValue = (condition: WorkflowMemberCondition) => {
  if (isWorkflowResultCondition(condition)) return workflowResultPredicateLabel(condition, locale.value, t)
  if ('value' in condition) return t(condition.value ? 'common.yes' : 'common.no')
  const options = condition.optionIds.map(id => choiceLabel(condition, id))
  return options.join(t('quantifier' in condition && condition.quantifier === 'all' ? 'workflow.flow.and' : 'workflow.flow.or'))
}
const actualValue = (condition: WorkflowMemberCondition, actual: WorkflowSimulation['steps'][number]['conditions'][number]['actual']) => {
  if (actual === null) return t('workflow.simulator.unavailable')
  if (isWorkflowResultCondition(condition) && !Array.isArray(actual)) {
    if (typeof actual === 'number' || typeof actual === 'boolean' || actual === 'pass' || actual === 'pass_with_considerations' || actual === 'fail') {
      return workflowResultValueLabel(actual, locale.value, t)
    }
  }
  if (typeof actual === 'boolean') return t(actual ? 'common.yes' : 'common.no')
  if (Array.isArray(actual)) return actual.map(value => value === null ? t('workflow.simulator.unavailable') : choiceLabel(condition, value)).join(', ') || t('workflow.simulator.unavailable')
  return choiceLabel(condition, String(actual))
}
</script>

<template>
  <div class="space-y-5" data-field-scope="agency.workflow-simulator">
    <p class="text-sm text-muted">
      {{ t('workflow.simulator.description') }}
    </p>
    <fieldset :disabled="pending" class="space-y-3">
      <legend v-if="profileInputs.length" class="mb-2 font-semibold">
        {{ t('workflow.simulator.scenario_inputs') }}
      </legend>
      <div v-if="profileInputs.length" class="grid gap-3 sm:grid-cols-2">
        <UFormField
          v-for="input in profileInputs" :key="input.key" :label="input.label" :required="false"
          data-ui-target="agency.workflow-simulator.profile-input" data-field-label-en="Scenario profile value" data-field-label-fr="Valeur de profil du scénario">
          <CommonBilingualMultiSelectMenu
            v-if="input.multiple" :model-value="selected(input.key)" :items="input.options" class="w-full"
            @update:model-value="setProfile(input.key, $event)" />
          <CommonBilingualSelectMenu
            v-else :model-value="selected(input.key)[0] ?? unavailable.id"
            :items="[...noValue, ...input.options]" class="w-full"
            @update:model-value="setProfile(input.key, $event && $event !== unavailable.id ? [$event] : [])" />
        </UFormField>
      </div>
      <p v-if="catalog.status.value === 'pending'" role="status" class="text-sm text-muted">
        {{ t('common.loading') }}
      </p>
      <CommonNotice v-if="catalog.error.value" tone="error" :title="t('workflow.simulator.input_error')">
        <template #actions>
          <UButton type="button" :label="t('common.retry')" @click="catalog.refresh()" />
        </template>
      </CommonNotice>
      <fieldset v-for="step in scenarioSteps" :key="step.memberId" data-testid="workflow-simulation-input-step" class="space-y-3 rounded-md border border-default p-4">
        <legend class="mb-2 text-sm font-medium">
          {{ t('workflow.conditions.step', { number: step.sequence }) }} · {{ stepName(step.memberId) }}
        </legend>
        <UFormField :label="t('workflow.simulator.outcome')" required data-ui-target="agency.workflow-simulator.step-outcome" data-field-label-en="Step outcome" data-field-label-fr="Résultat de l’étape">
          <CommonBilingualSelectMenu :model-value="outcomes[step.memberId]?.state ?? 'succeeded'" :items="outcomeChoices(step)" class="w-full" @update:model-value="selectOutcome(step, $event)" />
        </UFormField>
        <template v-for="input in step.inputs" :key="input.nestedMemberId">
          <UCheckbox
            v-if="input.assessment" :required="false" data-ui-target="agency.workflow-simulator.calculate-score"
            :model-value="outcomes[step.memberId]?.assessments?.[input.nestedMemberId] !== undefined"
            :label="t('workflow.simulator.calculate_score', { assessment: locale === 'fr' ? input.nameFr : input.nameEn })"
            @update:model-value="setAssessment(step.memberId, input.nestedMemberId, $event === true ? {} : undefined)" />
          <AgencyWorkflowSimulationAssessment
            v-if="input.assessment && outcomes[step.memberId]?.assessments?.[input.nestedMemberId]"
            data-field-exclude="Composite scenario editor with identified helper and answer controls."
            :definition="input.assessment" :model-value="outcomes[step.memberId]?.assessments?.[input.nestedMemberId]"
            @update:model-value="setAssessment(step.memberId, input.nestedMemberId, $event)"
            @invalid="invalidAssessments[assessmentKey(step.memberId, input.nestedMemberId)] = $event" />
          <UFormField
            v-else :required="false"
            :label="`${t(`workflow.conditions.${input.source}`)} · ${locale === 'fr' ? input.nameFr : input.nameEn}`"
            :error="input.source === 'assessment_score' && invalidScore(step.memberId, input.nestedMemberId) ? t('validation.numeric_not_representable') : undefined"
            data-ui-target="agency.workflow-simulator.step-result" data-field-label-en="Simulated step result" data-field-label-fr="Résultat simulé de l’étape">
            <UInput
              v-if="input.source === 'assessment_score'" type="number" step="any" inputmode="decimal" class="w-full"
              :model-value="String(outcomes[step.memberId]?.results?.[input.nestedMemberId] ?? '')" @update:model-value="setScore(step.memberId, input.nestedMemberId, $event)" />
            <CommonBilingualSelectMenu
              v-else-if="input.source === 'checklist_result'"
              :model-value="outcomes[step.memberId]?.results?.[input.nestedMemberId] === undefined ? unavailable.id : String(outcomes[step.memberId]?.results?.[input.nestedMemberId])"
              :items="[...noValue, ...checklistChoices]" class="w-full" @update:model-value="setChecklist(step.memberId, input.nestedMemberId, $event)" />
            <CommonBilingualSelectMenu
              v-else :model-value="outcomes[step.memberId]?.results?.[input.nestedMemberId] === undefined ? unavailable.id : String(outcomes[step.memberId]?.results?.[input.nestedMemberId])"
              :items="[...noValue, ...recommendationChoices]" class="w-full" @update:model-value="setRecommendation(step.memberId, input.nestedMemberId, $event)" />
          </UFormField>
        </template>
      </fieldset>
      <div class="flex flex-wrap gap-2">
        <UButton type="button" icon="i-lucide-play" :label="t('workflow.simulator.run')" :disabled="!canRun" :loading="pending" @click="run" />
        <UButton type="button" variant="outline" color="neutral" :label="t('workflow.simulator.reset')" @click="reset" />
      </div>
    </fieldset>
    <CommonNotice
      v-if="simulation.error.value" tone="error"
      :title="t('workflow.simulator.request_error')">
      <template #actions>
        <UButton type="button" :label="t('common.retry')" @click="run" />
      </template>
    </CommonNotice>
    <template v-if="trace">
      <p aria-live="polite" class="font-semibold" data-testid="workflow-simulation-status">
        {{ t(allSkipped ? 'workflow.simulator.all_skipped' : `workflow.simulator.status.${trace.status}`) }}
      </p>
      <p v-if="trace.finishReason" class="text-sm text-muted">
        {{ t(`workflow.simulator.finish_reason.${trace.finishReason}`) }}
      </p>
      <ol class="divide-y divide-default rounded-md border border-default">
        <li v-for="step in trace.steps" :key="step.memberId" class="space-y-3 p-4" data-testid="workflow-simulation-step">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h3 class="font-semibold">
              {{ t('workflow.conditions.step', { number: step.sequence }) }} · {{ stepName(step.memberId) }}
            </h3>
            <UBadge :color="step.state === 'awaiting_input' ? 'warning' : 'neutral'" variant="subtle">
              {{ t(step.outcome ? `workflow.simulator.status.${step.outcome}` : `workflow.simulator.step.${step.state}`) }}
            </UBadge>
          </div>
          <p v-if="step.reason" class="text-sm text-muted">
            {{ t(`workflow.simulator.reason.${step.reason}`) }}
          </p>
          <ul v-if="step.conditions.length" class="space-y-2 text-sm">
            <li v-for="evidence in step.conditions" :key="workflowConditionKey(evidence.condition)">
              <p class="font-medium">
                {{ isWorkflowResultCondition(evidence.condition)
                  ? workflowResultSourceLabel(evidence.condition, step.sequence, members, locale, t).label
                  : locale === 'fr' ? evidence.nameFr : evidence.nameEn }}
              </p>
              <p class="text-muted">
                {{ t('workflow.conditions.expected_result', { value: expectedValue(evidence.condition) }) }}
                · {{ t('workflow.conditions.actual_result', { value: actualValue(evidence.condition, evidence.actual) }) }}
                · {{ t(evidence.matched ? 'workflow.conditions.matched' : 'workflow.conditions.unmatched') }}
              </p>
            </li>
          </ul>
        </li>
      </ol>
    </template>
  </div>
</template>
