import { sql } from 'kysely'
import { z } from 'zod'
import {
  APPROVAL_TYPE_ENUM,
  EXECUTION_ENTITY_TYPE_ENUM,
  FUNDING_OPPORTUNITY_ASSESSMENT_CHECKLIST_TYPE_ENUM,
  REGISTRY_TYPE_ENUM,
  STREAM_ASSESSMENT_CHECKLIST_TYPE_ENUM
} from '~~/shared/constants/enums'
import {
  TRANSFER_PAYMENT_CONFIG_ENTITY_TYPE_ENUM,
  TRANSFER_PAYMENT_DOCUMENT_TEMPLATE_ENTITY_TYPE_ENUM,
  TRANSFER_PAYMENT_DOCUMENT_TEMPLATE_KIND_ENUM,
  TRANSFER_PAYMENT_DOCUMENT_TEMPLATE_OUTPUT_FORMAT_ENUM,
  TRANSFER_PAYMENT_REVIEW_SETUP_ENTITY_TYPE_ENUM
} from '~~/shared/types/schemas/transfer-payment'
import { ABILITIES } from '~~/shared/utils/abilities'

const QuerySchema = z.object({
  name: z.string()
})

/**
 *  * Event handler for this server API route. Handles the incoming request payload, performs necessary business logic and authorization operations, and returns the expected endpoint response array or object.
 *  *
 *  * @param event - The active H3 event context encapsulating the request and response objects.
 *
 */
// eslint-disable-next-line local/require-authorize -- intentionally public endpoint
export default defineEventHandler(async event => {
  const query = await getValidatedQueryI18n(event, QuerySchema)
  const db = event.context.$db

  if (query.name === 'ability') {
    return ABILITIES
  }

  // Fetch enum values for specified type
  const allowedEnums = [
    'agreement_applicant_recipient_type',
    'stream_assessment_checklist_type',
    'funding_opportunity_assessment_checklist_type',
    'amended_type',
    'agreement_type',
    'applicant_recipient_type',
    'registry_type',
    'approval_type',
    'decision_type',
    'payment_type',
    'review_type',
    'monitor_action_type',
    'monitor_responsible_party',
    'follow_up_status',
    'language_preference',
    'jurisdiction',
    'currency_codes',
    'countries',
    'entity_type',
    'execution_entity_type',
    'transfer_payment_config_entity_type',
    'transfer_payment_review_setup_entity_type',
    'transfer_payment_document_template_entity_type',
    'transfer_payment_document_template_kind',
    'transfer_payment_document_template_output_format'
  ] as const
  type AllowedEnum = (typeof allowedEnums)[number]
  const isAllowedEnum = (value: string): value is AllowedEnum => allowedEnums.includes(value as AllowedEnum)

  const requestedEnum = query.name.toLowerCase()
  if (!isAllowedEnum(requestedEnum)) {
    return await badRequest(event, 'ENUM_INVALID', 'apiErrors.request.enum_invalid')
  }

  const staticEnumsByKey: Partial<Record<(typeof allowedEnums)[number], readonly string[]>> = {
    approval_type: APPROVAL_TYPE_ENUM,
    execution_entity_type: EXECUTION_ENTITY_TYPE_ENUM,
    transfer_payment_config_entity_type: TRANSFER_PAYMENT_CONFIG_ENTITY_TYPE_ENUM,
    transfer_payment_review_setup_entity_type: TRANSFER_PAYMENT_REVIEW_SETUP_ENTITY_TYPE_ENUM,
    transfer_payment_document_template_entity_type: TRANSFER_PAYMENT_DOCUMENT_TEMPLATE_ENTITY_TYPE_ENUM,
    transfer_payment_document_template_kind: TRANSFER_PAYMENT_DOCUMENT_TEMPLATE_KIND_ENUM,
    transfer_payment_document_template_output_format: TRANSFER_PAYMENT_DOCUMENT_TEMPLATE_OUTPUT_FORMAT_ENUM,
    stream_assessment_checklist_type: STREAM_ASSESSMENT_CHECKLIST_TYPE_ENUM,
    funding_opportunity_assessment_checklist_type: FUNDING_OPPORTUNITY_ASSESSMENT_CHECKLIST_TYPE_ENUM,
    registry_type: REGISTRY_TYPE_ENUM
  }
  const staticEnumValues = staticEnumsByKey[requestedEnum]
  if (staticEnumValues) {
    return [...staticEnumValues]
  }

  const enumTypeNameByKey: Record<string, string> = {
    agreement_applicant_recipient_type: 'Agreement_Applicant_Recipient_Type',
    amended_type: 'Amended_Type',
    applicant_recipient_type: 'Applicant_Recipient_Type',
    agreement_type: 'Agreement_Type',
    countries: 'Countries',
    currency_codes: 'Currency_Codes',
    decision_type: 'Decision_Type',
    entity_type: 'Entity_Type',
    execution_entity_type: 'Execution_Entity_Type',
    transfer_payment_config_entity_type: 'Transfer_Payment_Config_Entity_Type',
    follow_up_status: 'Follow_Up_Status',
    language_preference: 'Language_Preference',
    jurisdiction: 'Jurisdiction',
    payment_type: 'Payment_Type',
    monitor_action_type: 'Monitor_Action_Type',
    monitor_responsible_party: 'Monitor_Responsible_Party',
    review_type: 'Review_Type'
  }
  const enumTypeName = enumTypeNameByKey[requestedEnum] ?? requestedEnum

  const result = await sql<{ enumlabel: string }>`
    SELECT e.enumlabel
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE LOWER(t.typname) = LOWER(${enumTypeName})
    ORDER BY e.enumsortorder
  `.execute(db)

  return result.rows.map(row => row.enumlabel)
})
