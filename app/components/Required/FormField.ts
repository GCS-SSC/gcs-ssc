import OriginalFormField from '@nuxt/ui/components/FormField.vue'
import { computed, defineComponent, h, inject, provide, useId } from 'vue'
import { useI18n } from '#imports'
import { fieldLabelKey, fieldRequirementKey, formRequirementKey } from '~/utils/form-requirement-context'
import { booleanAttribute } from '~/utils/required-control'
import FieldHelpTooltip from '~/components/FieldHelp/Tooltip.vue'
import { fieldScopeKey, fieldTooltipKey } from '~/utils/field-tooltip-context'
import { resolveUiFieldTargetKey } from '~~/shared/ui-targets/identity'

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
    const { t, locale } = useI18n()
    const fieldScope = inject(fieldScopeKey, undefined)
    const tooltips = inject(fieldTooltipKey, undefined)
    const targetKey = computed(() => resolveUiFieldTargetKey({
      scope: fieldScope?.value,
      name: props.name,
      explicitTarget: typeof attrs['data-help-target'] === 'string'
        ? attrs['data-help-target']
        : typeof attrs['data-ui-target'] === 'string' ? attrs['data-ui-target'] : undefined
    }))
    const tooltip = computed(() => {
      if (attrs['data-field-exclude']) return ''
      const text = tooltips?.value.find(item => item.targetKey === targetKey.value)?.text
      return text?.[locale.value.startsWith('fr') ? 'fr' : 'en']?.trim() ?? ''
    })
    const form = inject(formRequirementKey, undefined)
    const required = computed(() => props.required !== undefined
      ? booleanAttribute(props.required)
      : typeof props.name === 'string' && form?.resolve(props.name) === 'required')
    provide(fieldRequirementKey, required)
    return () => h(OriginalFormField, { ...attrs, name: props.name, required: required.value }, {
      ...slots,
      ...(tooltip.value
        ? {
            hint: (scope: Record<string, unknown>) => [
              slots.hint ? slots.hint(scope) : attrs.hint,
              h(FieldHelpTooltip, { text: tooltip.value, label: typeof attrs.label === 'string' ? attrs.label : '' })
            ]
          }
        : {}),
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
