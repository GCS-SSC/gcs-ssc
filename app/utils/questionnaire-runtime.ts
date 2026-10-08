import type { AssignableEntityType } from '~~/shared/constants/enums'
import type { QuestionnaireDefinition, QuestionnaireResponse } from '~~/shared/types/schemas/questionnaire'

export type QuestionnaireRuntimeConfiguration = {
  entityType: AssignableEntityType
  apiBase: string
  panelId: string
  messagePrefix: 'recommendation' | 'data_collection'
  icon: string
  validate: (definition: QuestionnaireDefinition, responses: QuestionnaireResponse[]) => Array<{ questionKey: string, message: string, field?: 'comment' }>
}

/**
 * Copies primitive response values without cloning Vue's reactive proxies.
 * @param responses Current or saved questionnaire answers.
 * @returns An independent response payload preserving exact text values.
 */
export const copyQuestionnaireResponses = (responses: QuestionnaireResponse[]): QuestionnaireResponse[] => responses.map(response => ({ ...response }))
