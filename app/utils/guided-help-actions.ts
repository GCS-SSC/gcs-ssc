import type { GuideActionChannel, GuideObservedContext, GuideTargetRef } from '@gcs-ssc/guided-help/runtime'

/** Captures the exact native control and loaded business context before asynchronous work.
 * @param channel App-owned action channel.
 * @param root Owning control scope.
 * @param key Registered control identity.
 * @param action Business success to report.
 * @param context Loaded business context before the operation.
 * @returns Once-only success callback, or a no-op without an eligible control.
 */
export const beginGuidedHelpAction = (
  channel: GuideActionChannel,
  root: ParentNode | null,
  key: string | undefined,
  action: 'modal-open' | 'save-success' | 'field-change',
  context: GuideObservedContext
): (() => void) => {
  if (!root || !key || (context.kind !== 'owner' && context.kind !== 'task')) return () => {}
  const matches = [...root.querySelectorAll<HTMLElement>('[data-help-target]')].filter(element => element.dataset.helpTarget === key)
  if (matches.length !== 1) return () => {}
  const instance = matches[0]?.dataset.helpInstance
  const target: GuideTargetRef = instance ? { kind: 'instance', key, instance } : { kind: 'unique', key }
  return channel.begin({ kind: 'succeeded', source: { target, action, context } })
}
