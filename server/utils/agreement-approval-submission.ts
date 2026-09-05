import { readAgreementCustomFieldDefinitions } from './agreement-custom-fields'
/* eslint-disable jsdoc/require-jsdoc, @stylistic/multiline-ternary -- compact snapshot normalization and query fallbacks */
import { createHash } from 'node:crypto'
import { sql, type Kysely, type Transaction } from 'kysely'
import type { H3Event } from 'h3'
import type { Amended_Type, Database, JsonValue } from '~~/shared/types/database'
import { throwApiError } from './api-errors'
import { databaseMoneyText, parseDatabaseMoney } from './database-money'

export const AGREEMENT_APPROVAL_SNAPSHOT_SCHEMA_VERSION = 1
export const ACTIVE_WORKFLOW_RUN_STATUSES = [
  'pending',
  'active',
  'awaiting_action',
  'paused'
] as const

export class AgreementApprovalSubmissionHashMismatchError extends Error {}
export class AgreementApprovalSubmissionPromotionError extends Error {}

export const assertAgreementApprovalSubmissionUnlocked = async (
  event: H3Event,
  trx: Kysely<Database> | Transaction<Database>,
  agreementId: string
): Promise<void> => {
  const activeRun = await trx.selectFrom('Common_Runtime')
    .innerJoin('Common_Workflow_Run', 'Common_Workflow_Run.id', 'Common_Runtime.id')
    .leftJoin('Funding_Case_Agreement_Amendment', join => join
      .onRef('Funding_Case_Agreement_Amendment.id', '=', 'Common_Runtime.egcs_cn_entityid')
      .on('Common_Runtime.egcs_cn_entitytype', '=', 'fundingcaseamendment')
      .on('Funding_Case_Agreement_Amendment._deleted', '=', false))
    .select('Common_Runtime.id')
    .where('Common_Runtime.egcs_cn_kind', '=', 'workflow')
    .where('Common_Runtime.egcs_cn_purpose', '=', 'approval_submission')
    .where('Common_Runtime.egcs_cn_state', 'in', [...ACTIVE_WORKFLOW_RUN_STATUSES])
    .where('Common_Runtime._deleted', '=', false)
    .where(eb => eb.or([
      eb.and([
        eb('Common_Runtime.egcs_cn_entitytype', '=', 'fundingcaseagreement'),
        eb('Common_Runtime.egcs_cn_entityid', '=', agreementId)
      ]),
      eb('Funding_Case_Agreement_Amendment.egcs_fc_fundingagreement', '=', agreementId)
    ]))
    .forUpdate(['Common_Runtime', 'Common_Workflow_Run'])
    .executeTakeFirst()
  if (activeRun) {
    return await throwApiError(event, {
      statusCode: 409,
      code: 'AGREEMENT_APPROVAL_SUBMISSION_LOCKED',
      key: 'apiErrors.workflow.approval_submission_locked'
    })
  }
}

export type AgreementApprovalSnapshotV1 = {
  schemaVersion: 1
  agreement: Record<string, JsonValue> | null
  proponents: Array<Record<string, JsonValue>>
  amendment: Record<string, JsonValue> | null
  sourceVersions: { budget: string | null, activity: string | null }
  budget: { fiscalYears: Array<Record<string, JsonValue>>, lineItems: Array<Record<string, JsonValue>> } | null
  activities: Array<Record<string, JsonValue>> | null
  amendmentTypes: Array<Record<string, JsonValue>>
  amendmentSubtypes: Array<Record<string, JsonValue>>
}

export const resolveApprovalPacketDomains = (
  entityType: 'fundingcaseagreement' | 'fundingcaseamendment',
  amendedDomains: Amended_Type[]
) => ({
  agreement: entityType === 'fundingcaseagreement',
  budget: entityType === 'fundingcaseagreement' || amendedDomains.includes('budget'),
  activities: entityType === 'fundingcaseagreement' || amendedDomains.includes('activities'),
  duration: entityType === 'fundingcaseagreement' || amendedDomains.includes('duration')
})

const bilingualValue = (en: unknown, fr: unknown): Record<string, JsonValue> => ({
  en: normalizeValue(en),
  fr: normalizeValue(fr)
})

const normalizeValue = (value: unknown): JsonValue => {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'number') return String(value)
  if (typeof value === 'bigint') return String(value)
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.map(normalizeValue)
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => key !== 'egcs_fc_status' && key !== '_deleted')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => [key, normalizeValue(item)]))
  return String(value)
}

const normalizeRow = (row: Record<string, unknown>): Record<string, JsonValue> =>
  normalizeValue(row) as Record<string, JsonValue>

export const canonicalSerializeAgreementApprovalSnapshot = (snapshot: AgreementApprovalSnapshotV1): string =>
  JSON.stringify(normalizeValue(snapshot))

export const hashAgreementApprovalSnapshot = (snapshot: AgreementApprovalSnapshotV1): string =>
  createHash('sha256').update(canonicalSerializeAgreementApprovalSnapshot(snapshot)).digest('hex')

export const buildAgreementApprovalSnapshot = async (
  event: H3Event,
  trx: Transaction<Database>,
  entityType: 'fundingcaseagreement' | 'fundingcaseamendment',
  entityId: string
): Promise<{ agreementId: string, amendmentId: string | null, packet: AgreementApprovalSnapshotV1, hash: string }> => {
  const amendment = entityType === 'fundingcaseamendment'
    ? await trx.selectFrom('Funding_Case_Agreement_Amendment').selectAll().where('id', '=', entityId).where('_deleted', '=', false).forUpdate().executeTakeFirstOrThrow()
    : null
  const agreementId = amendment ? String(amendment.egcs_fc_fundingagreement) : entityId
  const agreement = await trx.selectFrom('Funding_Case_Agreement_Profile').selectAll().where('id', '=', agreementId).where('_deleted', '=', false).forUpdate().executeTakeFirstOrThrow()
  const agreementReferences = amendment ? null : await trx.selectFrom('Funding_Case_Agreement_Profile')
    .innerJoin('Transfer_Payment_Stream', 'Transfer_Payment_Stream.id', 'Funding_Case_Agreement_Profile.egcs_fc_transferpaymentstream')
    .innerJoin('Transfer_Payment_Profile', 'Transfer_Payment_Profile.id', 'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile')
    .innerJoin('Agency_Profile', 'Agency_Profile.id', 'Transfer_Payment_Profile.egcs_tp_agency')
    .innerJoin('Transfer_Payment_Agreement_Subtype', join => join
      .onRef('Transfer_Payment_Agreement_Subtype.id', '=', 'Funding_Case_Agreement_Profile.egcs_fc_agreementsubtype')
      .onRef('Transfer_Payment_Agreement_Subtype.egcs_tp_transferpaymentstream', '=', 'Funding_Case_Agreement_Profile.egcs_fc_transferpaymentstream'))
    .innerJoin('Agency_Agreement_Type', 'Agency_Agreement_Type.id', 'Transfer_Payment_Agreement_Subtype.egcs_tp_agreementtype')
    .innerJoin('Transfer_Payment_Stream_Holdback_Basis', 'Transfer_Payment_Stream_Holdback_Basis.id', 'Funding_Case_Agreement_Profile.egcs_fc_holdbackbasis')
    .leftJoin('Transfer_Payment_Stream_Risk_Rating', join => join
      .onRef('Transfer_Payment_Stream_Risk_Rating.egcs_tp_transferpaymentstream', '=', 'Funding_Case_Agreement_Profile.egcs_fc_transferpaymentstream')
      .onRef('Transfer_Payment_Stream_Risk_Rating.egcs_tp_riskscore', '=', 'Funding_Case_Agreement_Profile.egcs_fc_riskscore')
      .on('Transfer_Payment_Stream_Risk_Rating._deleted', '=', false))
    .select([
      'Agency_Profile.egcs_ay_name_en as agency_name_en',
      'Agency_Profile.egcs_ay_name_fr as agency_name_fr',
      'Transfer_Payment_Profile.egcs_tp_name_en as program_name_en',
      'Transfer_Payment_Profile.egcs_tp_name_fr as program_name_fr',
      'Transfer_Payment_Stream.egcs_tp_name_en as stream_name_en',
      'Transfer_Payment_Stream.egcs_tp_name_fr as stream_name_fr',
      'Agency_Agreement_Type.egcs_ay_name_en as subtype_name_en',
      'Agency_Agreement_Type.egcs_ay_name_fr as subtype_name_fr',
      'Transfer_Payment_Stream_Holdback_Basis.egcs_tp_name_en as holdback_basis_name_en',
      'Transfer_Payment_Stream_Holdback_Basis.egcs_tp_name_fr as holdback_basis_name_fr',
      'Transfer_Payment_Stream_Risk_Rating.egcs_tp_name_en as risk_rating_name_en',
      'Transfer_Payment_Stream_Risk_Rating.egcs_tp_name_fr as risk_rating_name_fr'
    ])
    .where('Funding_Case_Agreement_Profile.id', '=', agreementId)
    .where('Funding_Case_Agreement_Profile._deleted', '=', false)
    .executeTakeFirstOrThrow()
  const proponents = amendment ? [] : await trx.selectFrom('Funding_Case_Agreement_Applicant_Recipient')
    .innerJoin('Applicant_Recipient_Profile', 'Applicant_Recipient_Profile.id', 'Funding_Case_Agreement_Applicant_Recipient.egcs_fc_applicantrecipient')
    .innerJoin('Agency_Applicant_Recipient_Subtype', 'Agency_Applicant_Recipient_Subtype.id', 'Applicant_Recipient_Profile.egcs_ar_applicantrecipientsubtypes')
    .leftJoin('Agency_Profile', 'Agency_Profile.id', 'Applicant_Recipient_Profile.egcs_ar_leadagency')
    .select([
      'Applicant_Recipient_Profile.id',
      'Applicant_Recipient_Profile.egcs_ar_legalname_en',
      'Applicant_Recipient_Profile.egcs_ar_legalname_fr',
      'Applicant_Recipient_Profile.egcs_ar_operatingname_en',
      'Applicant_Recipient_Profile.egcs_ar_operatingname_fr',
      'Applicant_Recipient_Profile.egcs_ar_description_en',
      'Applicant_Recipient_Profile.egcs_ar_description_fr',
      'Applicant_Recipient_Profile.egcs_ar_researchorganization_en',
      'Applicant_Recipient_Profile.egcs_ar_researchorganization_fr',
      'Agency_Applicant_Recipient_Subtype.egcs_ay_name_en as subtype_name_en',
      'Agency_Applicant_Recipient_Subtype.egcs_ay_name_fr as subtype_name_fr',
      'Agency_Profile.egcs_ay_name_en as lead_agency_name_en',
      'Agency_Profile.egcs_ay_name_fr as lead_agency_name_fr'
    ])
    .where('Funding_Case_Agreement_Applicant_Recipient.egcs_fc_fundingagreement', '=', agreementId)
    .where('Funding_Case_Agreement_Applicant_Recipient._deleted', '=', false)
    .where('Applicant_Recipient_Profile._deleted', '=', false)
    .orderBy('Applicant_Recipient_Profile.id')
    .forUpdate([
      'Funding_Case_Agreement_Applicant_Recipient',
      'Applicant_Recipient_Profile',
      'Agency_Applicant_Recipient_Subtype'
    ])
    .execute()
  const proponentIds = proponents.map(proponent => String(proponent.id))
  const proponentRegistries = proponentIds.length === 0 ? [] : await trx.selectFrom('Applicant_Recipient_Registry')
    .select(['egcs_ar_applicantrecipient', 'egcs_ar_registry', 'egcs_ar_number', 'egcs_ar_othercomment'])
    .where('egcs_ar_applicantrecipient', 'in', proponentIds)
    .where('_deleted', '=', false)
    .orderBy('egcs_ar_applicantrecipient')
    .orderBy('egcs_ar_registry')
    .orderBy('egcs_ar_number')
    .forUpdate()
    .execute()
  const amendmentTypes = amendment ? await trx.selectFrom('Funding_Case_Agreement_Amendment_Type')
    .innerJoin('Transfer_Payment_Amendment_Type', 'Transfer_Payment_Amendment_Type.id', 'Funding_Case_Agreement_Amendment_Type.egcs_fc_amendmenttype')
    .select(['Transfer_Payment_Amendment_Type.egcs_tp_amended', 'Transfer_Payment_Amendment_Type.egcs_tp_name_en', 'Transfer_Payment_Amendment_Type.egcs_tp_name_fr'])
    .where('Funding_Case_Agreement_Amendment_Type.egcs_fc_amendment', '=', entityId)
    .where('Funding_Case_Agreement_Amendment_Type._deleted', '=', false)
    .where('Transfer_Payment_Amendment_Type._deleted', '=', false)
    .orderBy('Transfer_Payment_Amendment_Type.id').execute() : []
  const packetDomains = resolveApprovalPacketDomains(
    entityType,
    amendmentTypes.map(type => type.egcs_tp_amended)
  )
  const includesBudget = packetDomains.budget
  const includesActivities = packetDomains.activities
  const includesDuration = packetDomains.duration
  const budgetVersion = includesBudget
    ? amendment
      ? await trx.selectFrom('Funding_Case_Agreement_Budget_Version').selectAll()
          .where('egcs_fc_fundingagreement', '=', agreementId)
          .where('egcs_fc_amendment', '=', entityId)
          .where('egcs_fc_iscurrent', '=', false)
          .where('_deleted', '=', false).forUpdate().executeTakeFirst()
      : await trx.selectFrom('Funding_Case_Agreement_Budget_Version').selectAll()
          .where('egcs_fc_fundingagreement', '=', agreementId).where('egcs_fc_iscurrent', '=', true)
          .where('_deleted', '=', false).forUpdate().executeTakeFirstOrThrow()
    : null
  if (includesBudget && !budgetVersion) {
    return await throwApiError(event, {
      statusCode: 409,
      code: 'AGREEMENT_AMENDMENT_BUDGET_SNAPSHOT_NOT_FOUND',
      key: 'apiErrors.agreement.amendment_budget_snapshot_not_found'
    })
  }
  const activityVersion = includesActivities
    ? amendment
      ? await trx.selectFrom('Funding_Case_Agreement_Activity_Version').selectAll()
          .where('egcs_fc_fundingagreement', '=', agreementId)
          .where('egcs_fc_amendment', '=', entityId)
          .where('egcs_fc_iscurrent', '=', false)
          .where('_deleted', '=', false).forUpdate().executeTakeFirst()
      : await trx.selectFrom('Funding_Case_Agreement_Activity_Version').selectAll()
          .where('egcs_fc_fundingagreement', '=', agreementId).where('egcs_fc_iscurrent', '=', true)
          .where('_deleted', '=', false).forUpdate().executeTakeFirstOrThrow()
    : null
  if (includesActivities && !activityVersion) {
    return await throwApiError(event, {
      statusCode: 409,
      code: 'AGREEMENT_AMENDMENT_ACTIVITY_SNAPSHOT_NOT_FOUND',
      key: 'apiErrors.agreement.amendment_activity_snapshot_not_found'
    })
  }
  const [fiscalYears, lineItems, activities, amendmentSubtypes] = await Promise.all([
    budgetVersion ? trx.selectFrom('Funding_Case_Agreement_Budget_Fiscal_Year')
      .innerJoin('Agency_Fiscal_Year', 'Agency_Fiscal_Year.id', 'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fiscalyear')
      .select(['Agency_Fiscal_Year.egcs_ay_fiscalyeardisplay', 'Agency_Fiscal_Year.egcs_ay_fiscalyear', 'Agency_Fiscal_Year.egcs_ay_startdate', 'Agency_Fiscal_Year.egcs_ay_enddate'])
      .where('Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_budgetversion', '=', String(budgetVersion.id))
      .where('Funding_Case_Agreement_Budget_Fiscal_Year._deleted', '=', false)
      .orderBy('Agency_Fiscal_Year.egcs_ay_fiscalyear').orderBy('Funding_Case_Agreement_Budget_Fiscal_Year.id').execute() : [],
    budgetVersion ? trx.selectFrom('Funding_Case_Agreement_Budget_Line_Item')
      .innerJoin('Transfer_Payment_Stream_Cost_Category_Line_Item', 'Transfer_Payment_Stream_Cost_Category_Line_Item.id', 'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_organizationcostcategory')
      .innerJoin('Agency_Cost_Category_Line_Item', 'Agency_Cost_Category_Line_Item.id', 'Transfer_Payment_Stream_Cost_Category_Line_Item.egcs_tp_organizationcostcategory')
      .innerJoin('Agency_Cost_Category', 'Agency_Cost_Category.id', 'Agency_Cost_Category_Line_Item.egcs_ay_organizationcostcategory')
      .innerJoin('Funding_Case_Agreement_Budget_Fiscal_Year', 'Funding_Case_Agreement_Budget_Fiscal_Year.id', 'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_fundingagreementbudgetfiscalyear')
      .innerJoin('Agency_Fiscal_Year', 'Agency_Fiscal_Year.id', 'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fiscalyear')
      .select([
        'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_costsubsection',
        'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_description',
        databaseMoneyText(sql.ref('Funding_Case_Agreement_Budget_Line_Item.egcs_fc_totalamount')).as('egcs_fc_totalamount'),
        databaseMoneyText(sql.ref('Funding_Case_Agreement_Budget_Line_Item.egcs_fc_programfunding')).as('egcs_fc_programfunding'),
        databaseMoneyText(sql.ref('Funding_Case_Agreement_Budget_Line_Item.egcs_fc_otherfederalfunding')).as('egcs_fc_otherfederalfunding'),
        databaseMoneyText(sql.ref('Funding_Case_Agreement_Budget_Line_Item.egcs_fc_othergovfunding')).as('egcs_fc_othergovfunding'),
        databaseMoneyText(sql.ref('Funding_Case_Agreement_Budget_Line_Item.egcs_fc_otherfunding')).as('egcs_fc_otherfunding'),
        'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_currency',
        'Agency_Fiscal_Year.egcs_ay_fiscalyeardisplay as fiscal_year_display',
        'Agency_Cost_Category.egcs_ay_name_en as organization_cost_category_name_en',
        'Agency_Cost_Category.egcs_ay_name_fr as organization_cost_category_name_fr',
        'Agency_Cost_Category_Line_Item.egcs_ay_name_en as line_item_name_en',
        'Agency_Cost_Category_Line_Item.egcs_ay_name_fr as line_item_name_fr'
      ])
      .where('Funding_Case_Agreement_Budget_Line_Item.egcs_fc_budgetversion', '=', String(budgetVersion.id))
      .where('Funding_Case_Agreement_Budget_Line_Item._deleted', '=', false)
      .orderBy('Funding_Case_Agreement_Budget_Line_Item.egcs_fc_fundingagreementbudgetfiscalyear').orderBy('Funding_Case_Agreement_Budget_Line_Item.id').execute() : [],
    activityVersion ? trx.selectFrom('Funding_Case_Agreement_Activity').select(['id', 'egcs_fc_name_en', 'egcs_fc_name_fr', 'egcs_fc_description_en', 'egcs_fc_description_fr', 'egcs_fc_startdate', 'egcs_fc_enddate', 'egcs_fc_expectedresults_en', 'egcs_fc_expectedresults_fr']).where('egcs_fc_activityversion', '=', String(activityVersion.id)).where('_deleted', '=', false).orderBy('egcs_fc_startdate').orderBy('id').execute() : [],
    amendment ? trx.selectFrom('Funding_Case_Agreement_Amendment_Subtype').innerJoin('Transfer_Payment_Amendment_Subtype', 'Transfer_Payment_Amendment_Subtype.id', 'Funding_Case_Agreement_Amendment_Subtype.egcs_fc_amendmentsubtype').select(['Transfer_Payment_Amendment_Subtype.egcs_tp_name_en', 'Transfer_Payment_Amendment_Subtype.egcs_tp_name_fr']).where('Funding_Case_Agreement_Amendment_Subtype.egcs_fc_amendment', '=', entityId).where('Funding_Case_Agreement_Amendment_Subtype._deleted', '=', false).where('Transfer_Payment_Amendment_Subtype._deleted', '=', false).orderBy('Transfer_Payment_Amendment_Subtype.id').execute() : []
  ])
  const activityIds = activities.map(activity => String(activity.id))
  const [activityOutcomes, activityResponsibleParties] = activityIds.length === 0
    ? [[], []]
    : await Promise.all([
        trx.selectFrom('Funding_Case_Agreement_Outcome_Activity')
          .innerJoin('Transfer_Payment_Outcome', 'Transfer_Payment_Outcome.id', 'Funding_Case_Agreement_Outcome_Activity.egcs_fc_outcomes')
          .select(['Funding_Case_Agreement_Outcome_Activity.egcs_fc_activity as activityId', 'Transfer_Payment_Outcome.egcs_tp_name_en', 'Transfer_Payment_Outcome.egcs_tp_name_fr'])
          .where('Funding_Case_Agreement_Outcome_Activity.egcs_fc_activity', 'in', activityIds)
          .where('Funding_Case_Agreement_Outcome_Activity._deleted', '=', false)
          .where('Transfer_Payment_Outcome._deleted', '=', false).orderBy('Transfer_Payment_Outcome.id').execute(),
        trx.selectFrom('Funding_Case_Agreement_Responsible_Party_Activity')
          .innerJoin('Funding_Case_Agreement_Applicant_Recipient', 'Funding_Case_Agreement_Applicant_Recipient.id', 'Funding_Case_Agreement_Responsible_Party_Activity.egcs_fc_responsibleparty')
          .innerJoin('Applicant_Recipient_Profile', 'Applicant_Recipient_Profile.id', 'Funding_Case_Agreement_Applicant_Recipient.egcs_fc_applicantrecipient')
          .select(['Funding_Case_Agreement_Responsible_Party_Activity.egcs_fc_activity as activityId', 'Applicant_Recipient_Profile.egcs_ar_operatingname_en', 'Applicant_Recipient_Profile.egcs_ar_operatingname_fr'])
          .where('Funding_Case_Agreement_Responsible_Party_Activity.egcs_fc_activity', 'in', activityIds)
          .where('Funding_Case_Agreement_Responsible_Party_Activity._deleted', '=', false)
          .where('Funding_Case_Agreement_Applicant_Recipient._deleted', '=', false)
          .where('Applicant_Recipient_Profile._deleted', '=', false).orderBy('Applicant_Recipient_Profile.id').execute()
      ])
  const customFieldDefinitions = await readAgreementCustomFieldDefinitions(trx, String(agreement.egcs_fc_transferpaymentstream))
  const customFields = customFieldDefinitions.filter(field => Boolean(agreement.egcs_fc_customfields[field.id])).map(field => ({
    fieldId: field.id,
    section: field.section ? { id: field.section.id, label: bilingualValue(field.section.name_en, field.section.name_fr), order: field.section.display_order } : null,
    label: bilingualValue(field.name_en, field.name_fr),
    value: agreement.egcs_fc_customfields[field.id],
    display: field.kind === 'text' ? agreement.egcs_fc_customfields[field.id] : (() => {
      const option = field.options.find(candidate => candidate.id === agreement.egcs_fc_customfields[field.id])
      return option ? bilingualValue(option.name_en, option.name_fr) : agreement.egcs_fc_customfields[field.id]
    })()
  }))
  const packet: AgreementApprovalSnapshotV1 = {
    schemaVersion: 1,
    agreement: amendment ? null : normalizeRow({
      customFields,
      agreementNumber: agreement.egcs_fc_agreementnumber,
      financialSystemNumber: agreement.egcs_fc_financialsystemnumber,
      title: bilingualValue(agreement.egcs_fc_title_en, agreement.egcs_fc_title_fr),
      description: bilingualValue(agreement.egcs_fc_description_en, agreement.egcs_fc_description_fr),
      agency: bilingualValue(agreementReferences!.agency_name_en, agreementReferences!.agency_name_fr),
      program: bilingualValue(agreementReferences!.program_name_en, agreementReferences!.program_name_fr),
      stream: bilingualValue(agreementReferences!.stream_name_en, agreementReferences!.stream_name_fr),
      agreementType: agreement.egcs_fc_agreementtype,
      agreementSubtype: bilingualValue(agreementReferences!.subtype_name_en, agreementReferences!.subtype_name_fr),
      furtherDistribution: agreement.egcs_fc_furtherdistribution,
      holdbackPercent: agreement.egcs_fc_holdback,
      holdbackBasis: bilingualValue(agreementReferences!.holdback_basis_name_en, agreementReferences!.holdback_basis_name_fr),
      riskScore: agreement.egcs_fc_riskscore,
      riskRating: bilingualValue(agreementReferences!.risk_rating_name_en, agreementReferences!.risk_rating_name_fr),
      authorizedAssistanceStartDate: agreement.egcs_fc_authorizedassistancestartdate,
      authorizedAssistanceEndDate: agreement.egcs_fc_authorizedassistanceenddate
    }),
    proponents: amendment ? [] : proponents.map(proponent => normalizeRow({
      legalName: bilingualValue(proponent.egcs_ar_legalname_en, proponent.egcs_ar_legalname_fr),
      operatingName: bilingualValue(proponent.egcs_ar_operatingname_en, proponent.egcs_ar_operatingname_fr),
      description: bilingualValue(proponent.egcs_ar_description_en, proponent.egcs_ar_description_fr),
      researchOrganization: bilingualValue(proponent.egcs_ar_researchorganization_en, proponent.egcs_ar_researchorganization_fr),
      subtype: bilingualValue(proponent.subtype_name_en, proponent.subtype_name_fr),
      leadAgency: bilingualValue(proponent.lead_agency_name_en, proponent.lead_agency_name_fr),
      registries: proponentRegistries
        .filter(registry => String(registry.egcs_ar_applicantrecipient) === String(proponent.id))
        .map(registry => normalizeRow({ type: registry.egcs_ar_registry, number: registry.egcs_ar_number, comment: registry.egcs_ar_othercomment }))
    })),
    amendment: amendment ? normalizeRow({
      amendmentNumber: amendment.egcs_fc_amendmentnumber,
      name: bilingualValue(amendment.egcs_fc_name_en, amendment.egcs_fc_name_fr),
      ...(includesDuration
        ? {
            proposedAuthorizedAssistanceStartDate: amendment.egcs_fc_proposedauthorizedassistancestartdate,
            proposedAuthorizedAssistanceEndDate: amendment.egcs_fc_proposedauthorizedassistanceenddate
          }
        : {})
    }) : null,
    sourceVersions: { budget: budgetVersion ? String(budgetVersion.id) : null, activity: activityVersion ? String(activityVersion.id) : null },
    budget: budgetVersion ? {
      fiscalYears: fiscalYears.map(row => normalizeRow({ display: row.egcs_ay_fiscalyeardisplay, year: row.egcs_ay_fiscalyear, startDate: row.egcs_ay_startdate, endDate: row.egcs_ay_enddate })),
      lineItems: lineItems.map(row => normalizeRow({
        fiscalYear: row.fiscal_year_display,
        organizationCostCategory: bilingualValue(row.organization_cost_category_name_en, row.organization_cost_category_name_fr),
        lineItem: bilingualValue(row.line_item_name_en, row.line_item_name_fr),
        costSubsection: row.egcs_fc_costsubsection,
        description: row.egcs_fc_description,
        totalAmount: parseDatabaseMoney(row.egcs_fc_totalamount),
        programFunding: parseDatabaseMoney(row.egcs_fc_programfunding),
        otherFederalFunding: row.egcs_fc_otherfederalfunding == null ? null : parseDatabaseMoney(row.egcs_fc_otherfederalfunding),
        otherGovernmentFunding: row.egcs_fc_othergovfunding == null ? null : parseDatabaseMoney(row.egcs_fc_othergovfunding),
        otherFunding: row.egcs_fc_otherfunding == null ? null : parseDatabaseMoney(row.egcs_fc_otherfunding),
        currency: row.egcs_fc_currency
      }))
    } : null,
    activities: activityVersion ? activities.map(activity => normalizeRow({
      name: bilingualValue(activity.egcs_fc_name_en, activity.egcs_fc_name_fr),
      description: bilingualValue(activity.egcs_fc_description_en, activity.egcs_fc_description_fr),
      expectedResults: bilingualValue(activity.egcs_fc_expectedresults_en, activity.egcs_fc_expectedresults_fr),
      startDate: activity.egcs_fc_startdate,
      endDate: activity.egcs_fc_enddate,
      outcomes: activityOutcomes.filter(outcome => String(outcome.activityId) === String(activity.id)).map(outcome => bilingualValue(outcome.egcs_tp_name_en, outcome.egcs_tp_name_fr)),
      responsibleParties: activityResponsibleParties.filter(party => String(party.activityId) === String(activity.id)).map(party => bilingualValue(party.egcs_ar_operatingname_en, party.egcs_ar_operatingname_fr))
    })) : null,
    amendmentTypes: amendmentTypes.map(type => normalizeRow({ amendedDomain: type.egcs_tp_amended, name: bilingualValue(type.egcs_tp_name_en, type.egcs_tp_name_fr) })),
    amendmentSubtypes: amendmentSubtypes.map(subtype => normalizeRow({ name: bilingualValue(subtype.egcs_tp_name_en, subtype.egcs_tp_name_fr) }))
  }
  return { agreementId, amendmentId: amendment ? entityId : null, packet, hash: hashAgreementApprovalSnapshot(packet) }
}
