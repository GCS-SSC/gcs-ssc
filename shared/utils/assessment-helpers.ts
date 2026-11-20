/* eslint-disable jsdoc/require-jsdoc -- typed helper registry declarations are self-describing */
import type { Entity_Type, JsonValue } from '../types/database'
import { getCoreEntityDefinition, isCoreEntityType } from '../constants/entity-registry'

export const ASSESSMENT_HELPER_DATA_TYPES = ['string', 'number', 'boolean', 'id', 'id_list', 'money'] as const

export type AssessmentHelperDataType = typeof ASSESSMENT_HELPER_DATA_TYPES[number]
export type AssessmentHelperComparableValueType = 'string' | 'number' | 'boolean'

export type AssessmentEntityHelperDefinition = {
  field: string
  dataType: AssessmentHelperDataType
  labelKey: string
  retired?: boolean
  referenceTable?: string
}

type AssessmentEntityHelperRegistry = Partial<Record<Entity_Type, AssessmentEntityHelperDefinition[]>>

const APPLICANT_RECIPIENT_HELPER_DEFINITIONS: AssessmentEntityHelperDefinition[] = [
  { field: 'id', dataType: 'id', labelKey: 'common.id', referenceTable: 'Applicant_Recipient_Profile' },
  { retired: true, field: 'egcs_ar_applicantrecipientsubtypes', dataType: 'id', labelKey: 'applicant_recipient.subtype', referenceTable: 'Agency_Applicant_Recipient_Subtype' },
  { field: 'egcs_ar_leadagency', dataType: 'id', labelKey: 'applicant_recipient.lead_agency', referenceTable: 'Agency_Profile' },
  { retired: true, field: 'egcs_ar_leadofficer', dataType: 'id', labelKey: 'applicant_recipient.lead_officer', referenceTable: 'Common_User' },
  { field: 'egcs_ar_legalname_en', dataType: 'string', labelKey: 'applicant_recipient.legal_name_en' },
  { field: 'egcs_ar_legalname_fr', dataType: 'string', labelKey: 'applicant_recipient.legal_name_fr' },
  { field: 'egcs_ar_researchorganization_en', dataType: 'string', labelKey: 'applicant_recipient.research_organization_en' },
  { field: 'egcs_ar_researchorganization_fr', dataType: 'string', labelKey: 'applicant_recipient.research_organization_fr' },
  { field: 'egcs_ar_active', dataType: 'boolean', labelKey: 'applicant_recipient.status' }
]

const assessmentEntityHelperRegistry: AssessmentEntityHelperRegistry = {
  applicantrecipient: APPLICANT_RECIPIENT_HELPER_DEFINITIONS
}

const AGREEMENT_HELPER_DEFINITIONS: AssessmentEntityHelperDefinition[] = [
  { field: 'egcs_fc_agreementsubtype', dataType: 'id', labelKey: 'agreement.agreement_subtype', referenceTable: 'Transfer_Payment_Agreement_Subtype' },
  { field: 'egcs_fc_furtherdistribution', dataType: 'boolean', labelKey: 'agreement.further_distribution' },
  { field: 'egcs_fc_applicantrecipientsubtypes', dataType: 'id_list', labelKey: 'agreement.assessment_helpers.recipient_subtypes', referenceTable: 'Agency_Applicant_Recipient_Subtype' },
  { field: 'egcs_fc_agreementvalue', dataType: 'money', labelKey: 'agreement.assessment_helpers.agreement_value' },
  { field: 'egcs_fc_averageannualvalue', dataType: 'money', labelKey: 'agreement.assessment_helpers.average_annual_value' },
  { field: 'egcs_fc_agreementtype', dataType: 'string', labelKey: 'agreement.agreement_type' },
  { field: 'egcs_fc_currency', dataType: 'string', labelKey: 'common.currency' },
  { field: 'egcs_fc_recipientcount', dataType: 'number', labelKey: 'agreement.assessment_helpers.recipient_count' }
]

const getEntityHelperDefinitions = (entityType: Entity_Type) =>
  isCoreEntityType(entityType) && getCoreEntityDefinition(entityType).ownerKind === 'agreement'
    ? AGREEMENT_HELPER_DEFINITIONS
    : assessmentEntityHelperRegistry[entityType] ?? []

export const getAssessmentHelperDefinitionsForEntityType = (entityType: Entity_Type): AssessmentEntityHelperDefinition[] =>
  getEntityHelperDefinitions(entityType).filter(definition => !definition.retired)

export const getAssessmentHelperDefinition = (
  entityType: Entity_Type,
  field: string
): AssessmentEntityHelperDefinition | null =>
  getEntityHelperDefinitions(entityType).find(definition => definition.field === field) ?? null

export const getAssessmentHelperComparableValueType = (
  definition: AssessmentEntityHelperDefinition
): AssessmentHelperComparableValueType => {
  if (definition.dataType === 'number' || definition.dataType === 'money') {
    return 'number'
  }

  if (definition.dataType === 'boolean') {
    return 'boolean'
  }

  return 'string'
}

export const referencedAssessmentHelperFields = (definition: JsonValue): string[] => {
  const fields = new Set<string>()
  const visit = (value: JsonValue) => {
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    if (value === null || typeof value !== 'object') return
    if ((value.type === 'helpers' || value.kind === 'helper') && typeof value.field === 'string') fields.add(value.field)
    Object.values(value).forEach(visit)
  }
  visit(definition)
  if (definition !== null && !Array.isArray(definition) && typeof definition === 'object'
    && definition.helpers !== null && !Array.isArray(definition.helpers) && typeof definition.helpers === 'object') {
    Object.keys(definition.helpers).forEach(field => fields.add(field))
  }
  return [...fields]
}
