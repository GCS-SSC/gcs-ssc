import OriginalFormField from '@nuxt/ui/components/FormField.vue'
import { computed, defineComponent, h, inject, provide, useId } from 'vue'
import { useI18n } from '#imports'
import { fieldLabelKey, fieldRequirementKey, formRequirementKey } from '~/utils/form-requirement-context'
import { booleanAttribute } from '~/utils/required-control'

/** Renders a localized requirement and shares it with the actual input control. */
export default defineComponent({
  name: 'RequiredFormField',
  inheritAttrs: false,
  props: { name: String, required: { type: Boolean, default: undefined } },
  /** Builds the reactive wrapper while preserving the original control API.
   * @param props Explicit wrapper props.
   * @param context Vue attrs, slots and public exposure.
   * @param context.attrs Forwarded original-component attributes.
   * @param context.slots Original component slots.
   * @returns The original component's render function.
   */
  setup: (props, { attrs, slots }) => {
    const labelId = `field-label-${useId()}`
    provide(fieldLabelKey, computed(() => attrs.label || slots.label ? labelId : undefined))
    const { t } = useI18n()
    const form = inject(formRequirementKey, undefined)
    const required = computed(() => props.required !== undefined
      ? booleanAttribute(props.required)
      : typeof props.name === 'string' && form?.resolve(props.name) === 'required')
    provide(fieldRequirementKey, required)
    return () => h(OriginalFormField, { ...attrs, name: props.name, required: required.value }, {
      ...slots,
      ...(attrs.label || slots.label
        ? {
            /** Includes the requirement in the label used by composite groups.
             * @param scope Original label-slot values.
             * @returns The associated visible label content.
             */
            label: (scope: Record<string, unknown>) => [
              h('span', { id: labelId }, [
                slots.label ? slots.label(scope) : attrs.label as string,
                required.value ? h('span', { class: 'ml-1 text-xs font-normal text-muted' }, `(${t('common.field_required')})`) : null
              ])
            ]
          }
        : {})
    })
  }
}) as typeof OriginalFormField
