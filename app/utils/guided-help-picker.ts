/* eslint-disable jsdoc/require-jsdoc -- Browser-tab authoring handoff, validated on both ends. */
import { GuideDraftSchema } from '@gcs-ssc/guided-help/contracts'
import type { GuideDraft } from '@gcs-ssc/guided-help/contracts'
import type { HelpGuide } from './guided-help-client'

const key = 'gcs-ssc.guided-help.picker.v1'
export type HelpPickerState = { userId: string, context: string, document: GuideDraft, guide: HelpGuide | null, shared: boolean, stepId: string, selected?: { view: string, target: string, kind: string } }
export const clearHelpPicker = () => sessionStorage.removeItem(key)
export const saveHelpPicker = (state: HelpPickerState) => sessionStorage.setItem(key, JSON.stringify(state))
export const readHelpPicker = (userId: string): HelpPickerState | null => {
  try {
    const state = JSON.parse(sessionStorage.getItem(key) ?? 'null')
    if (!state) return null
    if (state.userId !== userId || typeof state.context !== 'string' || typeof state.stepId !== 'string' || !GuideDraftSchema.safeParse(state.document).success) {
      clearHelpPicker()
      return null
    }
    return state as HelpPickerState
  } catch {
    clearHelpPicker()
    return null
  }
}
