/* eslint-disable jsdoc/require-jsdoc -- editor-only recursive transforms are self-describing */
import { nanoid } from 'nanoid'
import type { ChecklistDefinition } from '~~/shared/types/schemas/checklist/checklist'

type PersistedResultGroup = ChecklistDefinition['resultPolicy']['groups'][number]
type PersistedResultItem = PersistedResultGroup['items'][number]

export type ChecklistPolicyQuestionOption = {
  value: string
  name_en: string
  name_fr: string
}

export type EditorQuestionFailure = Extract<PersistedResultItem, { kind: 'question_failed' }> & {
  _key: string
}

export type EditorResultGroup = Omit<PersistedResultGroup, 'items'> & {
  _key: string
  items: Array<EditorQuestionFailure | EditorResultGroup>
}

export type EditorResultPolicy = {
  anyFailureFails: boolean
  groups: EditorResultGroup[]
}

export const toEditorResultGroup = (group: PersistedResultGroup): EditorResultGroup => ({
  ...group,
  _key: nanoid(),
  items: group.items.map(item => item.kind === 'group'
    ? toEditorResultGroup(item)
    : { ...item, _key: nanoid() })
})

export const toPersistedResultGroup = (group: EditorResultGroup): PersistedResultGroup => {
  const { _key: _editorKey, items, ...persistedGroup } = group
  return {
    ...persistedGroup,
    items: items.map(item => item.kind === 'group'
      ? toPersistedResultGroup(item)
      : { kind: 'question_failed', questionKey: item.questionKey })
  }
}
