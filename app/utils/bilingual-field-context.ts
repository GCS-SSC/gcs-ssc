import { computed, inject, onBeforeUnmount, provide, shallowReactive, toValue, watch } from 'vue'
import type { ComputedRef, InjectionKey, MaybeRefOrGetter } from 'vue'
import type { GcsBilingualFieldExtensionContext } from '@gcs-ssc/extensions'

/** Explicit owner supplied by the business editor, independent of URL shapes. */
export type BilingualFieldScope = {
  subject: 'agency' | 'transfer_payment' | 'agreement' | 'applicant_recipient'
  agencyId?: string
  streamId?: string
  agreementId?: string
  applicantRecipientId?: string
  permissionAction: 'create' | 'read' | 'update'
}

type TextControl = {
  getText: () => string
  isEditable: () => boolean
  setText: (value: string) => void
}
const scopeKey: InjectionKey<ComputedRef<BilingualFieldScope | null>> = Symbol('bilingual-field-scope')
const controlsKey: InjectionKey<{ controls: Map<string, TextControl>; getIdentity: () => unknown }> = Symbol('bilingual-field-controls')

/** Supplies the resolved business owner to descendant editable bilingual controls.
 * @param scope Explicit reactive business owner.
 */
export const provideBilingualFieldScope = (scope: MaybeRefOrGetter<BilingualFieldScope | null>): void => {
  provide(scopeKey, computed(() => toValue(scope)))
}

/** Separates registration between forms, including nested and simultaneously open dialogs.
 * @param getIdentity Current form state object, replaced when another draft is loaded.
 */
export const provideBilingualFieldControls = (getIdentity: () => unknown): void => {
  provide(controlsKey, { controls: shallowReactive(new Map<string, TextControl>()), getIdentity })
}

/** Registers a mounted text input and exposes only its corresponding mounted language partner.
 * @param path Live schema path of the text control.
 * @param control Live control accessors and model update event.
 * @returns Reactive paired context and explicit owning scope.
 */
export const useBilingualFieldControl = (path: () => string | undefined, control: TextControl) => {
  const registry = inject(controlsKey, undefined)
  const controls = registry?.controls
  const scope = inject(scopeKey, undefined)
  const name = computed(path)
  watch(name, (value, previous) => {
    if (previous && controls?.get(previous) === control) controls.delete(previous)
    if (value && /[_.](en|fr)$/.test(value)) controls?.set(value, control)
  }, { immediate: true, flush: 'sync' })
  onBeforeUnmount(() => {
    if (name.value && controls?.get(name.value) === control) controls.delete(name.value)
  })
  const context = computed<GcsBilingualFieldExtensionContext | null>(() => {
    const sourcePath = name.value
    const owner = scope?.value
    if (!sourcePath || !owner || owner.permissionAction === 'read' || !controls || !control.isEditable()) return null
    const match = /[_.](en|fr)$/.exec(sourcePath)
    if (!match) return null
    const sourceLocale = match[1] as 'en' | 'fr'
    const targetLocale = sourceLocale === 'en' ? 'fr' : 'en'
    const targetPath = sourcePath.replace(/([_.])(en|fr)$/, `$1${targetLocale}`)
    const target = controls.get(targetPath)
    if (!target || !target.isEditable()) return null
    const identity = JSON.stringify(owner)
    const formIdentity = registry?.getIdentity()
    return {
      kind: 'bilingual-field',
      agencyId: owner.agencyId,
      streamId: owner.streamId,
      agreementId: owner.agreementId,
      applicantRecipientId: owner.applicantRecipientId,
      source: { path: sourcePath, locale: sourceLocale, getText: control.getText, isEditable: control.isEditable },
      target: { path: targetPath, locale: targetLocale, getText: target.getText, isEditable: target.isEditable },
      /** Applies a translation only while the captured form and both controls remain current.
       * @param text Translated text.
       * @param expected Source and target snapshots taken before translation.
       * @returns Whether the host accepted the update.
       */
      applyTranslation: (text, expected) => {
        if (registry?.getIdentity() !== formIdentity || JSON.stringify(scope?.value) !== identity || name.value !== sourcePath
          || controls.get(sourcePath) !== control || controls.get(targetPath) !== target
          || !control.isEditable() || !target.isEditable()
          || control.getText() !== expected.source || target.getText() !== expected.target) return false
        target.setText(text)
        return true
      }
    }
  })
  return { context, scope }
}
