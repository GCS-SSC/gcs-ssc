import { validateQuestionnaireResponses } from '~~/shared/types/schemas/questionnaire'
import type { QuestionnaireRuntimeConfiguration } from '~/utils/questionnaire-runtime'

export const dataCollectionRuntimeConfiguration: QuestionnaireRuntimeConfiguration = {
  entityType: 'commondatacollection',
  apiBase: '/api/data-collections',
  panelId: 'workflow-data-collection',
  messagePrefix: 'data_collection',
  icon: 'i-lucide-clipboard-list',
  validate: (definition, responses) => validateQuestionnaireResponses(definition, responses)
}
