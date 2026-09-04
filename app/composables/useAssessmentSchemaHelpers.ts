/* eslint-disable jsdoc/require-jsdoc */
import { computed, inject, provide } from 'vue'
import type { ComputedRef, InjectionKey, Ref } from 'vue'
import type { AssessmentEntityHelperDefinition } from '~~/shared/utils/assessment-helpers'

const assessmentSchemaHelperDefinitionsKey: InjectionKey<Ref<AssessmentEntityHelperDefinition[]> | ComputedRef<AssessmentEntityHelperDefinition[]>> =
  Symbol('assessment-schema-helper-definitions')

export const provideAssessmentSchemaHelperDefinitions = (
  helperDefinitions: Ref<AssessmentEntityHelperDefinition[]> | ComputedRef<AssessmentEntityHelperDefinition[]>
) => {
  provide(assessmentSchemaHelperDefinitionsKey, helperDefinitions)
}

export const useAssessmentSchemaHelperDefinitions = (): Ref<AssessmentEntityHelperDefinition[]> | ComputedRef<AssessmentEntityHelperDefinition[]> =>
  inject(assessmentSchemaHelperDefinitionsKey, computed<AssessmentEntityHelperDefinition[]>(() => []))
