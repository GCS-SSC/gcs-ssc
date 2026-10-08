import type { Workflow_Purpose } from './database'
import type { DataCollectionDefinition } from './schemas/data-collection'
import type { QuestionnaireResponse } from './schemas/questionnaire'

export type WorkflowSupplementaryInformationCollection = {
  id: string
  memberSequence: number
  name_en: string
  name_fr: string
  description_en: string
  description_fr: string
  definition: DataCollectionDefinition
  responses: QuestionnaireResponse[]
}

export type WorkflowSupplementaryInformationWorkflow = {
  runtimeId: string
  workflowSetupId: string
  purpose: Workflow_Purpose
  name_en: string
  name_fr: string
  completedAt: string
  collections: WorkflowSupplementaryInformationCollection[]
}

export type WorkflowSupplementaryInformationResponse = {
  workflows: WorkflowSupplementaryInformationWorkflow[]
}
