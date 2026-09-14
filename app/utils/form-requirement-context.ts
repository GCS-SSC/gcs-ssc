import type { ComputedRef, InjectionKey } from 'vue'
import type { FormFieldRequirement } from '~~/shared/utils/form-requirements'

/** The current form contract, shared across arbitrarily nested field components. */
export interface FormRequirementContext {
  resolve: (path: string) => FormFieldRequirement
}

/** Requirement inherited by the field's data-entry controls. */
export const fieldRequirementKey: InjectionKey<ComputedRef<boolean>> = Symbol('field-requirement')
/** Schema-backed requirement resolver scoped to one form. */
export const formRequirementKey: InjectionKey<FormRequirementContext> = Symbol('form-requirements')

/** Stable label content ID used by composite controls with hidden native inputs. */
export const fieldLabelKey: InjectionKey<ComputedRef<string | undefined>> = Symbol('field-label')
