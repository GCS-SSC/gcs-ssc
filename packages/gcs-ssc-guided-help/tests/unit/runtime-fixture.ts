import { createGuideActionChannel, createGuideRuntime as createRuntime } from '../../src/runtime'
import type { GuideObservedContext, GuideRuntimeOptions } from '../../src/runtime'

export const ordinaryContext: GuideObservedContext = { kind: 'owner', binding: null, execution: null, view: 'agency.general', visitId: 'page-visit', draftRevision: 0, facts: [] }
let activeChannel = createGuideActionChannel()

export const createGuideRuntime = (options: GuideRuntimeOptions) => {
  activeChannel = options.actionChannel ?? createGuideActionChannel()
  return createRuntime({ observedContext: ordinaryContext, ...options, actionChannel: activeChannel })
}

/** Publish a validated test operation through the active reader's real channel.
 * @param detail Test target and successful action.
 */
export const signalGuideCompletion = (detail: unknown) => {
  if (!detail || typeof detail !== 'object' || !('target' in detail) || typeof detail.target !== 'string' || !('action' in detail)) return
  const action = detail.action
  if (action !== 'save-success' && action !== 'modal-open' && action !== 'field-change') return
  activeChannel.begin({ kind: 'succeeded', source: { target: { kind: 'unique', key: detail.target }, action, context: ordinaryContext } })()
}
