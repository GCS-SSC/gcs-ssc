import { nextTick, ref } from 'vue'
import type { Ref } from 'vue'

/**
 * Provides the shared programmatic focus target used after a load-error retry
 * replaces the focused recovery surface with restored detail content.
 *
 * @returns The recovered-content ref and focus-restoration callback.
 */
export const useLoadRecoveryFocus = () => {
  const recoveryFocusTarget: Ref<HTMLElement | null> = ref(null)

  const focusRecoveredContent = async () => {
    await nextTick()
    recoveryFocusTarget.value?.focus({ preventScroll: true })
  }

  return {
    recoveryFocusTarget,
    focusRecoveredContent
  }
}
