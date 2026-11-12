/* eslint-disable jsdoc/require-jsdoc -- captured callbacks implement the Form lifetime contract. */
import { computed, getCurrentScope, onScopeDispose, ref, toValue, watch } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type { ActionContext } from '~/composables/useActionContext'

type FormSessionOwner = {
  captureSession: () => number | null
  isCurrentSession: (session: number | null) => boolean
}

export type FormActionPolicy =
  | { kind: 'remote'; context: MaybeRefOrGetter<ActionContext | null> }
  | { kind: 'local-draft'; purpose: 'guided-help-step' | 'journal-voucher-allocation' | 'review-schema-import' | 'checklist-question' }

/**
 * Binds validated submission to its opening, rendered Form lifetime and declared action owner.
 * @param options - Explicit submission ownership.
 * @param options.owner - Opening and identity lifetime.
 * @param options.action - Remote authority or verified local draft purpose.
 * @param options.submit - Current validated submission.
 * @param options.onDenied - Optional warning-only feedback for initially unavailable admission.
 * @returns Bindings for the actual rendered Form.
 */
export const useFormSession = <Event>(options: {
  owner: FormSessionOwner
  action: FormActionPolicy
  submit: (event: Event) => unknown
  onDenied?: () => unknown
}) => {
  const { user, permissionRevision } = useAuth()
  const actorEpoch = ref(0)
  const mountEpoch = ref(0)
  const contextEpoch = ref(0)
  watch(() => options.action.kind === 'remote' ? toValue(options.action.context) : null, () => {
    contextEpoch.value += 1
  }, { flush: 'sync' })
  watch([() => user.value?.id, () => permissionRevision.value], () => {
    actorEpoch.value += 1
  }, { flush: 'sync' })
  let disposed = false
  if (getCurrentScope()) onScopeDispose(() => {
    disposed = true
  })

  return computed(() => {
    const session = options.owner.captureSession()
    const context = options.action.kind === 'remote' ? toValue(options.action.context) : null
    const version = context?.version.value
    const operation = context?.capture()
    const actor = actorEpoch.value
    const contextGeneration = contextEpoch.value
    // A conditional remount must get a new callback even when its opening is unchanged.
    void mountEpoch.value
    let retired = false
    return {
      key: `${session ?? 'closed'}:${version ?? 'local'}:${actor}:${contextGeneration}`,
      onVnodeBeforeUnmount: () => {
        retired = true
        mountEpoch.value += 1
      },
      onSubmit: (event: Event) => {
        if (disposed || retired || actorEpoch.value !== actor || contextEpoch.value !== contextGeneration || session === null || !options.owner.isCurrentSession(session)) return
        if (options.action.kind === 'remote' && !operation?.canDispatch()) {
          if (!operation && context?.version.value === version) return options.onDenied?.()
          return
        }
        return options.submit(event)
      }
    }
  })
}
