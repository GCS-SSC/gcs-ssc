import { isRef, nextTick, onMounted, onUpdated, ref, useAttrs } from 'vue'
import type { Ref } from 'vue'

type TriggerReference = HTMLElement | Readonly<Ref<HTMLElement | null>>

interface SelectMenuTriggerExpose {
  triggerRef?: TriggerReference | null
}

const readAttribute = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value : undefined

/**
 * Resolves the exposed select-menu trigger element.
 *
 * @param selectMenu - The select-menu component exposure.
 * @returns The trigger element when available.
 */
const resolveTrigger = (selectMenu: SelectMenuTriggerExpose | null): HTMLElement | null => {
  const triggerReference = selectMenu?.triggerRef
  if (!triggerReference) return null

  if (isRef(triggerReference)) {
    return triggerReference.value
  }

  return triggerReference
}

/**
 * Applies project-owned accessible naming to Nuxt UI's focusable select-menu trigger.
 *
 * Nuxt UI forwards inherited attributes to the Reka combobox root, while Reka applies
 * its own generic aria-label to the nested trigger. Removing that label restores the
 * native UFormField label association; explicit standalone names are copied directly
 * to the focusable trigger.
 *
 * @returns A template ref for the select-menu component.
 */
export const useSelectMenuTriggerName = (): Ref<SelectMenuTriggerExpose | null> => {
  const attrs = useAttrs()
  const selectMenuRef: Ref<SelectMenuTriggerExpose | null> = ref(null)

  /** Applies inherited accessible-name attributes to the focusable trigger. */
  const applyTriggerName = async (): Promise<void> => {
    await nextTick()
    const trigger = resolveTrigger(selectMenuRef.value)
    if (!trigger) return

    trigger.removeAttribute('aria-label')
    trigger.removeAttribute('aria-labelledby')

    const labelledBy = readAttribute(attrs['aria-labelledby'])
    const label = readAttribute(attrs['aria-label'])
    if (labelledBy) {
      trigger.setAttribute('aria-labelledby', labelledBy)
    } else if (label) {
      trigger.setAttribute('aria-label', label)
    }
  }

  onMounted(() => {
    void applyTriggerName()
  })
  onUpdated(() => {
    void applyTriggerName()
  })

  return selectMenuRef
}
