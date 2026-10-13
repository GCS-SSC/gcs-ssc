import type { EntityWorkflowPurpose } from '../constants/entity-registry'

export interface WorkflowEntityTypeItem {
  entityType: string
  labelEn: string
  labelFr: string
  workflowPurposes: EntityWorkflowPurpose[]
}

export interface WorkflowEntityTypesResponse {
  items: WorkflowEntityTypeItem[]
}
