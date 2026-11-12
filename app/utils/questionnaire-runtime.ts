import type { AssignableEntityType } from '~~/shared/constants/enums'
import type { QuestionnaireDefinition, QuestionnaireResponse } from '~~/shared/types/schemas/questionnaire'
import { QuestionnaireResponseEnvelopeSchema } from '~~/shared/types/schemas/questionnaire'
import { z } from 'zod'
import { SYSTEM_LIFECYCLE } from '~~/shared/constants/system-lifecycle'

export const QuestionnaireMutationResultSchema = z.object({
  id: z.string(),
  runtimeState: z.enum(SYSTEM_LIFECYCLE.runtime.states),
  egcs_cn_revision: z.number().int().positive(),
  egcs_cn_response: QuestionnaireResponseEnvelopeSchema
})

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
