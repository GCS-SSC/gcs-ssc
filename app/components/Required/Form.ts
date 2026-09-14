import OriginalForm from '@nuxt/ui/components/Form.vue'
import { defineComponent, h, provide, shallowRef, inject, computed } from 'vue'
import type { Component, ComponentPublicInstance } from 'vue'
import { getFormValidatorSchema, resolveFormFieldRequirement } from '~~/shared/utils/form-requirements'
import { formStateInjectionKey } from '@nuxt/ui/composables/useFormField'
import { booleanAttribute } from '~/utils/required-control'
import { fieldRequirementKey, formRequirementKey } from '~/utils/form-requirement-context'

/** Preserves Nuxt UI's form API and provides schema requirements to descendant fields. */
export default defineComponent({
  name: 'RequiredForm',
  inheritAttrs: false,
  props: { state: Object, schema: Object, validate: Function },
  /** Builds the reactive wrapper while preserving the original control API.
   * @param props Explicit wrapper props.
   * @param context Vue attrs, slots and public exposure.
   * @param context.attrs Forwarded original-component attributes.
   * @param context.slots Original component slots.
   * @param context.expose Public instance exposure function.
   * @returns The original component's render function.
   */
  setup: (props, { attrs, slots, expose }) => {
    const parentRequirement = inject(formRequirementKey, undefined)
    const parentState = inject(formStateInjectionKey, undefined)
    provide(fieldRequirementKey, computed(() => false))
    const nested = () => booleanAttribute(attrs.nested)
    const prefix = () => typeof attrs.name === 'string' || typeof attrs.name === 'number' ? String(attrs.name) : ''
    const state = computed(() => {
      if (!nested() || !parentState?.value) return props.state
      return prefix().split('.').filter(Boolean).reduce<unknown>((value, key) =>
        value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined, parentState.value)
    })
    provide(formRequirementKey, {
      /** Resolves own or inherited nested schema requirements.
       * @param path Field path relative to this form.
       * @returns Required, optional or unresolved requirement.
       */
      resolve: path => {
        const schema = props.schema ?? getFormValidatorSchema(props.validate)
        if (schema) return resolveFormFieldRequirement(schema, path, state.value)
        return nested() && parentRequirement ? parentRequirement.resolve([prefix(), path].filter(Boolean).join('.')) : 'unknown'
      }
    })
    const form = shallowRef<ComponentPublicInstance | null>(null)
    expose(new Proxy({}, {
      get: (_target, key) => form.value?.[key as keyof ComponentPublicInstance],
      has: (_target, key) => form.value !== null && key in form.value
    }))
    return () => h(OriginalForm as unknown as Component, { ...attrs, ...props, novalidate: true, ref: form }, slots)
  }
}) as unknown as typeof OriginalForm
