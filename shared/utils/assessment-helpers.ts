/* eslint-disable jsdoc/require-jsdoc -- typed helper registry declarations are self-describing */
import type { Entity_Type } from '../types/database'

export const ASSESSMENT_HELPER_DATA_TYPES = ['string', 'number', 'boolean', 'id'] as const

export type AssessmentHelperDataType = typeof ASSESSMENT_HELPER_DATA_TYPES[number]
export type AssessmentHelperComparableValueType = 'string' | 'number' | 'boolean'

export type AssessmentEntityHelperDefinition = {
  field: string
  dataType: AssessmentHelperDataType
  labelKey: string
  referenceTable?: string
}

type AssessmentEntityHelperRegistry = Partial<Record<Entity_Type, AssessmentEntityHelperDefinition[]>>

const APPLICANT_RECIPIENT_HELPER_DEFINITIONS: AssessmentEntityHelperDefinition[] = [
  { field: 'id', dataType: 'id', labelKey: 'common.id', referenceTable: 'Applicant_Recipient_Profile' },
  { field: 'egcs_ar_applicantrecipientsubtypes', dataType: 'id', labelKey: 'applicant_recipient.subtype', referenceTable: 'Agency_Applicant_Recipient_Subtype' },
  { field: 'egcs_ar_leadagency', dataType: 'id', labelKey: 'applicant_recipient.lead_agency', referenceTable: 'Agency_Profile' },
  { field: 'egcs_ar_leadofficer', dataType: 'id', labelKey: 'applicant_recipient.lead_officer', referenceTable: 'Common_User' },
  { field: 'egcs_ar_legalname_en', dataType: 'string', labelKey: 'applicant_recipient.legal_name_en' },
  { field: 'egcs_ar_legalname_fr', dataType: 'string', labelKey: 'applicant_recipient.legal_name_fr' },
  { field: 'egcs_ar_researchorganization_en', dataType: 'string', labelKey: 'applicant_recipient.research_organization_en' },
  { field: 'egcs_ar_researchorganization_fr', dataType: 'string', labelKey: 'applicant_recipient.research_organization_fr' },
  { field: 'egcs_ar_active', dataType: 'boolean', labelKey: 'applicant_recipient.status' }
]

const assessmentEntityHelperRegistry: AssessmentEntityHelperRegistry = {
  applicantrecipient: APPLICANT_RECIPIENT_HELPER_DEFINITIONS
}

export const getAssessmentHelperDefinitionsForEntityType = (entityType: Entity_Type): AssessmentEntityHelperDefinition[] =>
  assessmentEntityHelperRegistry[entityType] ?? []

export const getAssessmentHelperDefinition = (
  entityType: Entity_Type,
  field: string
): AssessmentEntityHelperDefinition | null =>
  getAssessmentHelperDefinitionsForEntityType(entityType).find(definition => definition.field === field) ?? null

export const getAssessmentHelperComparableValueType = (
  definition: AssessmentEntityHelperDefinition
): AssessmentHelperComparableValueType => {
  if (definition.dataType === 'number') {
    return 'number'
  }

  if (definition.dataType === 'boolean') {
    return 'boolean'
  }

  return 'string'
}

export const isAssessmentHelperFieldValid = (entityType: Entity_Type, field: string) =>
  getAssessmentHelperDefinition(entityType, field) !== null

export const formatAssessmentHelperDefinitionLabel = (definition: AssessmentEntityHelperDefinition) => {
  const baseLabel = `${definition.labelKey} (${definition.dataType})`
  if (!definition.referenceTable) {
    return baseLabel
  }

  return `${baseLabel} -> ${definition.referenceTable}`
}
