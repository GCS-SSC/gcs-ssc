import type { ChecklistDefinition } from '~~/shared/types/schemas/checklist/checklist'
import type { ReviewSchemaHelpEditorItem } from '~/types/review-schema-editor'

export type ChecklistEditorQuestion = Omit<ChecklistDefinition['sections'][number]['questions'][number], 'help'> & {
  _key: string
  help: ReviewSchemaHelpEditorItem[]
}
