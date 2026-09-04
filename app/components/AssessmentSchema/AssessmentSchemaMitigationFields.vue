<!-- eslint-disable jsdoc/require-jsdoc, jsdoc/require-param-description, jsdoc/require-returns -->
<script setup lang="ts">
import type {
  AssessmentOutcomeOptionRow,
  AssessmentOutcomeRow,
  AssessmentOutcomeStrategyRow
} from '~/composables/useAssessmentSchemaEditorState'
import {
  createAssessmentOutcomeRow,
  createAssessmentOutcomeOptionRow,
  createAssessmentOutcomeStrategyRow
} from '~/composables/useAssessmentSchemaEditorState'
import { getAssessmentDisplayLabel, getAssessmentLocaleLabel } from '~/utils/assessment-schema'

const outcome = defineModel<AssessmentOutcomeRow>('outcome', {
  default: () => createAssessmentOutcomeRow()
})

const { t, locale } = useI18n()
const activeLocale = computed<'en' | 'fr'>(() => locale.value === 'fr' ? 'fr' : 'en')

const addStrategy = () => {
  outcome.value.strategies.push(createAssessmentOutcomeStrategyRow())
}

const removeStrategy = (strategyIndex: number) => {
  outcome.value.strategies.splice(strategyIndex, 1)
}

const addOption = (strategyIndex: number) => {
  outcome.value.strategies[strategyIndex]?.options.push(createAssessmentOutcomeOptionRow())
}

const removeOption = (strategyIndex: number, optionIndex: number) => {
  outcome.value.strategies[strategyIndex]?.options.splice(optionIndex, 1)
}

const getStrategyTitle = (strategy: AssessmentOutcomeStrategyRow, strategyIndex: number) => {
  const label = getAssessmentDisplayLabel(strategy.label, strategy.name)
  return `${strategyIndex + 1} - ${label || t('transfer_payment.strategy')}`
}

const getStrategyName = (strategy: AssessmentOutcomeStrategyRow) => getAssessmentLocaleLabel(
  strategy.label,
  activeLocale.value,
  strategy.name
) || t('transfer_payment.strategy')

const getOptionName = (option: AssessmentOutcomeOptionRow) => getAssessmentLocaleLabel(
  option.label,
  activeLocale.value,
  String(option.value)
) || t('common.none')

const getOptionKey = (option: AssessmentOutcomeOptionRow) => option._key
</script>

<template>
  <div class="space-y-6">
    <div class="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
      <UFormField :label="t('transfer_payment.language_independent_code')" name="outcome.name">
        <UInput v-model="outcome.name" />
      </UFormField>
      <div />
    </div>

    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <UFormField :label="t('transfer_payment.name_en')" name="outcome.label.en">
        <UInput v-model="outcome.label.en" />
      </UFormField>
      <UFormField :label="t('transfer_payment.name_fr')" name="outcome.label.fr">
        <UInput v-model="outcome.label.fr" />
      </UFormField>
    </div>

    <AssessmentSchemaAccordionSection :title="t('transfer_payment.strategies')">
      <div class="space-y-4">
        <div class="flex justify-end">
          <UButton icon="i-lucide-plus" :label="t('common.add')" variant="outline" class="cursor-default" @click="addStrategy" />
        </div>

        <AssessmentSchemaAccordionSection
          v-for="(strategy, strategyIndex) in outcome.strategies"
          :key="strategy._key"
          :title="getStrategyTitle(strategy, strategyIndex)">
          <div class="space-y-6">
            <div class="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
              <UFormField :label="t('transfer_payment.language_independent_code')" :name="`outcome.strategies.${strategyIndex}.name`">
                <UInput v-model="strategy.name" />
              </UFormField>
              <div class="flex items-end">
                <UButton
                  icon="i-lucide-trash"
                  color="error"
                  variant="ghost"
                  class="cursor-default"
                  :aria-label="t('transfer_payment.remove_strategy_named', {
                    position: strategyIndex + 1,
                    name: getStrategyName(strategy)
                  })"
                  @click="removeStrategy(strategyIndex)" />
              </div>
            </div>

            <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
              <UFormField :label="t('transfer_payment.name_en')" :name="`outcome.strategies.${strategyIndex}.label.en`">
                <UInput v-model="strategy.label.en" />
              </UFormField>
              <UFormField :label="t('transfer_payment.name_fr')" :name="`outcome.strategies.${strategyIndex}.label.fr`">
                <UInput v-model="strategy.label.fr" />
              </UFormField>
            </div>

            <AssessmentSchemaAccordionSection :title="t('transfer_payment.options')">
              <div class="space-y-4">
                <div class="flex justify-end">
                  <UButton icon="i-lucide-plus" :label="t('common.add')" variant="outline" class="cursor-default" @click="addOption(strategyIndex)" />
                </div>

                <div
                  v-for="(option, optionIndex) in strategy.options"
                  :key="getOptionKey(option)"
                  class="border-default space-y-4 border-t pt-4">
                  <div class="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                    <UFormField :label="t('common.max')" :name="`outcome.strategies.${strategyIndex}.options.${optionIndex}.max`">
                      <UInput v-model.number="option.max" type="number" />
                    </UFormField>
                    <UFormField :label="t('common.value')" :name="`outcome.strategies.${strategyIndex}.options.${optionIndex}.value`">
                      <UInput v-model="option.value" />
                    </UFormField>
                    <div class="flex items-end">
                      <UButton
                        icon="i-lucide-trash"
                        color="error"
                        variant="ghost"
                        class="cursor-default"
                        :aria-label="t('transfer_payment.remove_strategy_option_named', {
                          optionPosition: optionIndex + 1,
                          option: getOptionName(option),
                          strategyPosition: strategyIndex + 1,
                          strategy: getStrategyName(strategy)
                        })"
                        @click="removeOption(strategyIndex, optionIndex)" />
                    </div>
                  </div>

                  <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <UFormField :label="t('transfer_payment.name_en')" :name="`outcome.strategies.${strategyIndex}.options.${optionIndex}.label.en`">
                      <UInput v-model="option.label.en" />
                    </UFormField>
                    <UFormField :label="t('transfer_payment.name_fr')" :name="`outcome.strategies.${strategyIndex}.options.${optionIndex}.label.fr`">
                      <UInput v-model="option.label.fr" />
                    </UFormField>
                  </div>
                </div>
              </div>
            </AssessmentSchemaAccordionSection>
          </div>
        </AssessmentSchemaAccordionSection>
      </div>
    </AssessmentSchemaAccordionSection>
  </div>
</template>
