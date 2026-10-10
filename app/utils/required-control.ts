import BilingualFieldHost from '~/components/Extension/BilingualFieldHost.vue'
import { useBilingualFieldControl } from './bilingual-field-context'
import { Fragment, computed, defineComponent, h, inject, provide, shallowRef, onMounted, onUpdated, nextTick, unref, watch } from 'vue'
import type { Component, ComponentPublicInstance } from 'vue'
import { formFieldInjectionKey, formOptionsInjectionKey } from '@nuxt/ui/composables/useFormField'
import { fieldLabelKey, fieldRequirementKey } from './form-requirement-context'

/**
 * Converts an explicitly supplied Boolean attribute to its Vue Boolean value.
 * @param value Explicit attribute value.
 * @returns Whether the attribute enables its Boolean behavior.
 */
export const booleanAttribute = (value: unknown): boolean => value === '' || value === true || value === 'true'

/**
 * Decorates a Nuxt UI control while preserving its public props, slots and ref API.
 * Requirements flow through a separate context so lookup wrappers and date controls
 * receive the same contract without relying on Nuxt UI's visual-only label prop.
 * @param component Original Nuxt UI control.
 * @param kind Composite semantics needing adaptation at the interactive target.
 * @param options Additional deliberately exposed text-control capabilities.
 * @param options.bilingualText Register plain bilingual text controls with their owning form.
 * @returns A control preserving the original public type and behavior.
 */
export const createRequiredControl = <T>(component: T, kind: 'standard' | 'select-menu' | 'segmented' | 'group' | 'range' = 'standard', options: { bilingualText?: boolean } = {}): T => defineComponent({
  name: 'RequiredControl',
  inheritAttrs: false,
  props: { required: { type: Boolean, default: undefined }, disabled: { type: Boolean, default: undefined }, readonly: { type: Boolean, default: undefined } },
  /** Builds the reactive wrapper while preserving the original control API.
   * @param props Explicit wrapper props.
   * @param context Vue attrs, slots and public exposure.
   * @param context.attrs Forwarded original-component attributes.
   * @param context.slots Original component slots.
   * @param context.expose Public instance exposure function.
   * @returns The original component's render function.
   */
  setup: (props, { attrs, slots, expose }) => {
    const labelId = inject(fieldLabelKey, undefined)
    const formOptions = inject(formOptionsInjectionKey, undefined)
    const formField = inject(formFieldInjectionKey, undefined)
    const inherited = inject(fieldRequirementKey, undefined)
    // Search inputs and option controls inside a composite must not inherit its requirement.
    provide(fieldRequirementKey, computed(() => false))
    const control = shallowRef<ComponentPublicInstance | null>(null)
    const isRequired = computed(() => props.required === undefined ? inherited?.value ?? false : booleanAttribute(props.required))
    const isEnabled = computed(() => !formOptions?.value.disabled && !booleanAttribute(props.disabled) && !booleanAttribute(props.readonly))
    let bilingualElement: HTMLElement | undefined
    const bilingual = options.bilingualText
      ? useBilingualFieldControl(
          () => typeof attrs.name === 'string' ? attrs.name : formField?.value.name,
          {
            /** Reads either supported Vue template spelling of the live model value.
             * @returns The current text, or an empty source for non-string values.
             */
            getText: () => {
              // Undeclared Vue attrs retain the template's camel/kebab spelling.
              const modelValue = attrs.modelValue ?? attrs['model-value']
              return typeof modelValue === 'string' ? modelValue : ''
            },
            /** Checks model handlers and native disabled/read-only state without tracking the component ref.
             * @returns Whether the actual text control accepts a draft update.
             */
            isEditable: () => {
              const handlers = attrs['onUpdate:modelValue']
              const hasHandler = typeof handlers === 'function'
                || (Array.isArray(handlers) && handlers.length > 0 && handlers.every(handler => typeof handler === 'function'))
              return isEnabled.value && (attrs.type === undefined || attrs.type === 'text') && hasHandler
                && (!bilingualElement || (!bilingualElement.matches(':disabled') && !bilingualElement.hasAttribute('readonly')))
            },
            setText: value => {
              const handlers = attrs['onUpdate:modelValue']
              for (const handler of Array.isArray(handlers) ? handlers : [handlers]) (handler as (value: string) => void)(value)
            }
          }
        )
      : undefined
    /** Resolves an exposed element or Reka component instance.
     * @param reference The original control's public DOM reference.
     * @returns Its HTMLElement when mounted.
     */
    const elementOf = (reference: unknown): HTMLElement | undefined => {
      const value = unref(reference) as { $el?: HTMLElement } | HTMLElement | undefined
      return value instanceof HTMLElement ? value : value?.$el instanceof HTMLElement ? value.$el : undefined
    }
    /** Merges external group instructions with Nuxt UI's own field descriptions.
     * @returns Current associated description IDs.
     */
    const descriptionIds = () => {
      const explicit = typeof attrs['aria-describedby'] === 'string' ? attrs['aria-describedby'].split(/\s+/) : []
      const context = formField?.value
      const generated = context
        ? (['error', 'hint', 'description', 'help'] as const)
            .filter(key => context[key]).map(key => `${context.ariaId}-${key}`)
        : []
      return [...new Set([...explicit, ...generated])].filter(Boolean).join(' ')
    }
    /** Applies accessibility where the original component's props cannot reach it.
     * @returns Resolves after Vue has applied the original control's DOM updates.
     */
    const updateAccessibility = async () => {
      await nextTick()
      const exposed = control.value as { inputsRef?: unknown[], inputRef?: unknown, textareaRef?: unknown, triggerRef?: unknown, $el?: unknown } | null
      if (!exposed) return
      const targets: HTMLElement[] = []
      if (kind === 'segmented') {
        for (const segment of exposed.inputsRef ?? []) {
          const element = elementOf(segment)
          if (!element || element.getAttribute('role') !== 'spinbutton') continue
          if (isRequired.value && isEnabled.value) element.setAttribute('aria-required', 'true')
          else element.removeAttribute('aria-required')
          targets.push(element)
        }
      } else if (kind === 'group') {
        const root = elementOf(exposed.$el)
        const fieldset = root?.querySelector('fieldset')
        if (fieldset) {
          const label = attrs['aria-labelledby'] ?? (attrs['aria-label'] ? undefined : labelId?.value)
          if (typeof label === 'string') fieldset.setAttribute('aria-labelledby', label)
          else fieldset.removeAttribute('aria-labelledby')
          if (typeof attrs['aria-label'] === 'string') fieldset.setAttribute('aria-label', attrs['aria-label'])
          targets.push(fieldset)
        }
      } else {
        const element = elementOf(exposed.inputRef) ?? elementOf(exposed.textareaRef) ?? elementOf(exposed.triggerRef)
        const root = elementOf(exposed.$el)
        const target = element ?? (root?.matches('input, textarea, [role="combobox"], [role="radiogroup"], [role="checkbox"], [role="switch"]')
          ? root
          : root?.querySelector<HTMLElement>('input:not([type="hidden"]), textarea, [role="combobox"], [role="radiogroup"], [role="checkbox"], [role="switch"]'))
        if (target) targets.push(target)
      }
      // Nuxt UI spreads its own ariaAttrs after $attrs, which otherwise drops a
      // bilingual/group instruction when a field error or help is present.
      bilingualElement = options.bilingualText ? targets[0] : undefined
      const descriptions = descriptionIds()
      for (const target of targets) {
        if (descriptions) target.setAttribute('aria-describedby', descriptions)
        else target.removeAttribute('aria-describedby')
      }
      // Reka's fully-hidden form proxies duplicate the visible control's name/state.
      const root = elementOf(exposed.$el) ?? targets[0]?.parentElement
      if (targets.length) for (const proxy of root?.querySelectorAll<HTMLInputElement>('input[data-hidden][tabindex="-1"]') ?? []) {
        proxy.setAttribute('aria-hidden', 'true')
        proxy.hidden = true
      }
    }
    onMounted(() => {
      void updateAccessibility()
    })
    onUpdated(() => {
      void updateAccessibility()
    })
    watch(descriptionIds, () => {
      void updateAccessibility()
    }, { flush: 'post' })
    expose(new Proxy({}, {
      get: (_target, key) => control.value?.[key as keyof ComponentPublicInstance],
      has: (_target, key) => control.value !== null && key in control.value
    }))
    return () => {
      const required = isRequired.value
      const enabled = isEnabled.value
      const fieldName = typeof attrs.name === 'string' ? attrs.name : formField?.value.name
      const contentLanguage = options.bilingualText && (attrs.type === undefined || attrs.type === 'text')
        ? /(?:^|[_.])(en|fr)$/.exec(fieldName ?? '')?.[1]
        : undefined
      const original = h(component as Component, {
        ...attrs,
        ...props,
        'lang': attrs.lang ?? contentLanguage,
        'required': kind !== 'range' && required && enabled,
        'aria-required': kind !== 'segmented' && kind !== 'group' && kind !== 'range' && required && enabled ? 'true' : undefined,
        ...(kind === 'select-menu' ? { 'role': 'combobox', 'aria-label': attrs['aria-label'], 'aria-labelledby': attrs['aria-labelledby'] ?? (attrs['aria-label'] ? undefined : labelId?.value) } : {}),
        ...(kind === 'segmented' || kind === 'group' ? { 'aria-labelledby': attrs['aria-labelledby'] ?? (attrs['aria-label'] ? undefined : labelId?.value) } : {}),
        'ref': control
      }, slots)
      const context = bilingual?.context.value
      const scope = bilingual?.scope?.value
      return options.bilingualText
        ? h(Fragment, [original, context && scope ? h(BilingualFieldHost, { context, scope }) : null])
        : original
    }
  }
}) as unknown as T
