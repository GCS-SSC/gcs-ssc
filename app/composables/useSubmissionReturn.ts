import { computed, reactive, toValue, watch } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type { ActionContext } from './useActionContext'
import { useModalSession } from './useModalSession'

/**
 * Owns a return reason across dialog remounts while the review evidence is current.
 * @param options - Opening ownership and the review adapter's current write admission.
 * @param options.context - Actor, review revision, and decision evidence that owns the reason.
 * @param options.eligible - Whether the owning review can accept a new decision.
 * @returns The opening, its draft, and the context for the rendered Form.
 */
export const useSubmissionReturn = (options: { context: ActionContext; eligible: MaybeRefOrGetter<boolean> }) => {
  const { context } = options
  const session = useModalSession()
  const draft = reactive({ description: '' })
  const eligible = computed(() => toValue(options.eligible))

  /** Closes the opening and discards its reason. */
  const close = () => {
    session.isOpen.value = false
    draft.description = ''
  }
  watch(context.version, close, { flush: 'sync' })

  /** Opens a fresh reason while the review context is available. */
  const open = () => {
    if (!session.isOpen.value && eligible.value && context.capture()?.canDispatch()) session.isOpen.value = true
  }

  return { session, draft, context, eligible, open, close }
}
