/* eslint-disable jsdoc/require-jsdoc -- captured closures expose the ownership contract below. */
import { computed, getCurrentScope, onScopeDispose, ref, toValue, watch } from 'vue'
import type { ComputedRef, MaybeRefOrGetter, WatchSource } from 'vue'

type IdentityPart = string | number | boolean | null | undefined

export type CapturedActionContext = {
  isCurrent: () => boolean
  canDispatch: () => boolean
}

export type ActionContext = {
  version: ComputedRef<number>
  capture: () => CapturedActionContext | null
}

/**
 * Owns actor, declared identity and role lifetime separately from resource admission.
 * Eligibility changes retire validation and chained dispatch without rejecting an
 * already committed result whose actor, identity and role still own settlement.
 *
 * @param options - Explicit identity, role authority and optional resource eligibility.
 * @param options.identity - Scalar resource identities owned by this action.
 * @param options.authority - Role authority, excluding lifecycle and pending state.
 * @param options.eligible - Optional resource prerequisites for a new dispatch.
 * @returns Monotonic Form version and captured dispatch/settlement ownership.
 */
export const useActionContext = (options: {
  identity: readonly WatchSource<IdentityPart>[]
  authority: MaybeRefOrGetter<boolean>
  eligible?: MaybeRefOrGetter<boolean>
}): ActionContext => {
  const { user, permissionRevision } = useAuth()
  const contextEpoch = ref(0)
  const admissionEpoch = ref(0)
  let disposed = false
  const isEligible = () => options.eligible === undefined || toValue(options.eligible)

  watch([
    () => user.value?.id,
    () => permissionRevision.value,
    ...options.identity,
    () => toValue(options.authority)
  ], () => { contextEpoch.value += 1 }, { flush: 'sync' })
  watch(isEligible, () => {
    admissionEpoch.value += 1
  }, { flush: 'sync' })

  if (getCurrentScope()) onScopeDispose(() => {
    disposed = true
    contextEpoch.value += 1
  })

  return {
    version: computed(() => contextEpoch.value + admissionEpoch.value),
    capture: () => {
      if (disposed || !toValue(options.authority) || !isEligible()) return null
      const capturedContext = contextEpoch.value
      const capturedAdmission = admissionEpoch.value
      const isCurrent = () => !disposed
        && contextEpoch.value === capturedContext
        && toValue(options.authority)
      return {
        isCurrent,
        canDispatch: () => isCurrent()
          && admissionEpoch.value === capturedAdmission
          && isEligible()
      }
    }
  }
}
