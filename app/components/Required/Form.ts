import { provideBilingualFieldControls } from '~/utils/bilingual-field-context'
import OriginalForm from '@nuxt/ui/components/Form.vue'
import { defineComponent, h, provide, shallowRef, inject, computed, watch, unref } from 'vue'
import type { Component, ComponentPublicInstance } from 'vue'
import type { Form, FormSchema } from '@nuxt/ui'
import type { z } from 'zod'
import { LOCALIZED_VALIDATION_ISSUE, useZodI18n } from '~/composables/useZodI18n'
import { getFormValidatorSchema, resolveFormFieldRequirement } from '~~/shared/utils/form-requirements'
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
    const form = shallowRef<(ComponentPublicInstance & Pick<Form<FormSchema>, 'getErrors' | 'setErrors' | 'disabled'>) | null>(null)
    provide(fieldRequirementKey, computed(() => false))
    const nested = () => booleanAttribute(attrs.nested)
    const prefix = () => typeof attrs.name === 'string' || typeof attrs.name === 'number' ? String(attrs.name) : ''
    const state = computed(() => {
      const parentState = parentRequirement?.state.value
      if (!nested() || !parentState) return props.state
      return prefix().split('.').filter(Boolean).reduce<unknown>((value, key) =>
        value && typeof value === 'object' ? Reflect.get(value, key) : undefined, parentState)
    })
    provideBilingualFieldControls(() => state.value)
    provide(formRequirementKey, {
      state,
      disabled: computed(() => booleanAttribute(attrs.disabled) || Boolean(unref(form.value?.disabled))),
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
    const { locale } = useI18n({ useScope: 'global' })
    const { translateMessage } = useZodI18n()
    watch(locale, () => {
      const errors = form.value?.getErrors() ?? []
      if (errors.length === 0) return
      form.value?.setErrors(errors.map((error: typeof errors[number] & { [LOCALIZED_VALIDATION_ISSUE]?: z.ZodIssue }) => {
        const issue = error[LOCALIZED_VALIDATION_ISSUE]
        return issue ? { ...error, message: translateMessage(issue.message, issue) } : error
      }))
    })
    expose(new Proxy({}, {
      get: (_target, key) => form.value?.[key as keyof ComponentPublicInstance],
      has: (_target, key) => form.value !== null && key in form.value
    }))
    return () => h(OriginalForm as unknown as Component, { ...attrs, ...props, novalidate: true, ref: form }, slots)
  }
}) as unknown as typeof OriginalForm
